-- Owner Dashboard — initial schema for shared multi-property workspace.
--
-- Three tables (all under the public schema):
--   properties  — manual metadata, one row per property
--   reports     — one parsed report per (property, report_type)
--   app_users   — mirror of auth.users, populated by trigger
--
-- The `reports` storage bucket itself is created in the Supabase dashboard
-- (private, 25 MB limit, XLSX/XLS/CSV MIME types) before this migration runs.
-- This file adds idempotent INSERT-on-conflict-do-nothing as a safety net
-- and the row-level policies that gate read/write on the bucket's objects.
--
-- Apply via:
--   supabase db push                       # CLI, against the linked remote
--   OR paste the file into Dashboard → SQL Editor and run.

-- ===========================================================================
-- Tables
-- ===========================================================================

create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  owner_entity  text,
  city          text,
  state         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

comment on table public.properties is
  'One row per property. Manual metadata only — derived data lives in reports.';

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  report_type   text not null
    check (report_type in (
      'rent_roll',
      'income_statement_t12',
      'expiring_leases',
      'aged_receivables',
      'work_orders'
    )),
  storage_path  text not null,
  file_name     text not null,
  parsed_data   jsonb not null,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   uuid references auth.users (id) on delete set null,
  unique (property_id, report_type)
);

comment on table public.reports is
  'One report row per (property, report_type). Latest upload replaces the previous via upsert; the client deletes the old storage object before swapping.';

create table public.app_users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text,
  created_at    timestamptz not null default now()
);

comment on table public.app_users is
  'Mirror of auth.users for client-side display. auth.users is not directly queryable from the Data API.';

-- ===========================================================================
-- Indexes
-- ===========================================================================

create index reports_property_type_idx
  on public.reports (property_id, report_type);

create index properties_created_at_idx
  on public.properties (created_at desc);

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Bumps properties.updated_at whenever any column is updated.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.tg_set_updated_at();

-- Keeps app_users in lockstep with auth.users. Runs SECURITY DEFINER because
-- regular roles can't write to app_users (no INSERT policy exists for them).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Lock down execution to the trigger context only.
revoke execute on function public.handle_new_auth_user from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill any auth.users that already exist (the project owner created
-- during Stage 1, plus any teammates invited before this migration ran).
insert into public.app_users (id, email)
  select id, email
  from auth.users
  on conflict (id) do nothing;

-- ===========================================================================
-- Row-level security
--
-- Shared workspace: any authenticated user can read AND write properties /
-- reports. Acknowledged trade-off — we trust signed-in users for v1. If this
-- ever feels risky we'll add a deleted_at column and switch to soft-delete
-- without changing the policy shape.
--
-- app_users is read-only from the client. Writes flow only through the
-- on_auth_user_created trigger, which runs SECURITY DEFINER and bypasses RLS.
-- ===========================================================================

alter table public.properties enable row level security;
alter table public.reports enable row level security;
alter table public.app_users enable row level security;

create policy "properties_select_authenticated"
  on public.properties for select
  to authenticated
  using (true);

create policy "properties_insert_authenticated"
  on public.properties for insert
  to authenticated
  with check (true);

create policy "properties_update_authenticated"
  on public.properties for update
  to authenticated
  using (true)
  with check (true);

create policy "properties_delete_authenticated"
  on public.properties for delete
  to authenticated
  using (true);

create policy "reports_select_authenticated"
  on public.reports for select
  to authenticated
  using (true);

create policy "reports_insert_authenticated"
  on public.reports for insert
  to authenticated
  with check (true);

create policy "reports_update_authenticated"
  on public.reports for update
  to authenticated
  using (true)
  with check (true);

create policy "reports_delete_authenticated"
  on public.reports for delete
  to authenticated
  using (true);

create policy "app_users_select_authenticated"
  on public.app_users for select
  to authenticated
  using (true);

-- ===========================================================================
-- Data API grants
--
-- The project has "Automatically expose new tables" disabled, so we have to
-- explicitly grant table permissions to the Data API roles. RLS policies
-- above are still the source of truth — without grants the API returns 401
-- regardless of policies; with grants the policies decide visibility.
-- ===========================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select on public.app_users to authenticated;

-- Sequences aren't strictly used today (every PK defaults to a uuid) but
-- granting now means a future serial/identity column "just works".
grant usage, select on all sequences in schema public to authenticated;

-- ===========================================================================
-- Storage: `reports` bucket policies
--
-- The bucket itself was created in the dashboard (private, 25 MB,
-- XLSX/XLS/CSV). The INSERT below is idempotent — if the bucket already
-- exists the row is skipped. Policies below gate object access for the
-- authenticated role on the storage.objects table (storage uses RLS just
-- like regular tables).
-- ===========================================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'reports',
  'reports',
  false,
  26214400,  -- 25 MB
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
on conflict (id) do nothing;

create policy "reports_storage_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'reports');

create policy "reports_storage_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'reports');

create policy "reports_storage_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'reports')
  with check (bucket_id = 'reports');

create policy "reports_storage_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'reports');

-- ===========================================================================
-- Realtime
--
-- Enable change broadcasts on the two tables the client subscribes to so
-- a teammate's upload appears in your tab without a refresh. Storage
-- objects don't need this — the reports row UPDATE/INSERT is the signal.
-- ===========================================================================

alter publication supabase_realtime add table public.properties;
alter publication supabase_realtime add table public.reports;
