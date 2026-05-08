// Supabase-backed properties / reports data layer.
//
// This is the single seam every component goes through. The implementation
// changed from localStorage → Supabase, but the public API stays close in
// shape: list, get, create, delete, save-report, plus a subscribe() for
// realtime cross-tab / cross-user sync.
//
// Active-property selection lives in the URL (`?propertyId=…`) rather than
// localStorage, so links are shareable. The hook in
// `lib/useActiveProperty.ts` reads the param; this module exposes
// `getActiveProperty(searchParams)` for any non-React caller.
//
// Manual metadata (name, address, owner, city, state) ALWAYS wins over
// anything inferred from uploaded report payloads — see composeProperty.

import type { Property } from "@/types/portfolio";
import {
  composeProperty,
  type ReportPayload,
  type PropertyMeta,
} from "@/lib/adapters/entrata/compose";
import { supabaseBrowser } from "@/lib/supabase/client";

const REPORTS_BUCKET = "reports";

export interface ManualPropertyInput {
  name: string;
  address?: string;
  ownerName?: string;
  city?: string;
  state?: string;
}

// One row of `public.properties`, with its associated reports composed in.
// This is what every page / component actually renders.
export interface PropertyRecord {
  id: string;
  property: Property;          // composed (manual meta + parsed reports)
  reports: ReportRow[];
  warnings: string[];          // composeProperty diagnostics
  createdAt: string;
}

export interface ReportRow {
  id: string;
  propertyId: string;
  reportType: ReportPayload["reportType"];
  storagePath: string;
  fileName: string;
  parsedData: ReportPayload["data"];
  uploadedAt: string;
  uploadedBy: string | null;
}

// ---------------------------------------------------------------------------
// Internal: row → PropertyMeta and row → PropertyRecord helpers
// ---------------------------------------------------------------------------

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  owner_entity: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportDbRow {
  id: string;
  property_id: string;
  report_type: ReportPayload["reportType"];
  storage_path: string;
  file_name: string;
  parsed_data: ReportPayload["data"];
  uploaded_at: string;
  uploaded_by: string | null;
}

function rowToMeta(row: PropertyRow): PropertyMeta {
  return {
    id: row.id,
    name: row.name ?? "",
    ownerName: row.owner_entity ?? "",
    address: {
      street: row.address ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      zip: "",
    },
  };
}

function reportDbToRow(r: ReportDbRow): ReportRow {
  return {
    id: r.id,
    propertyId: r.property_id,
    reportType: r.report_type,
    storagePath: r.storage_path,
    fileName: r.file_name,
    parsedData: r.parsed_data,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
  };
}

function buildRecord(propRow: PropertyRow, reportRows: ReportDbRow[]): PropertyRecord {
  const meta = rowToMeta(propRow);
  const reports = reportRows.map(reportDbToRow);
  const payloads: ReportPayload[] = reports.map((r) => ({
    reportType: r.reportType,
    data: r.parsedData,
  } as ReportPayload));
  const { property, warnings } = composeProperty(meta, payloads);
  return {
    id: propRow.id,
    property,
    reports,
    warnings,
    createdAt: propRow.created_at,
  };
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function listProperties(): Promise<PropertyRecord[]> {
  const sb = supabaseBrowser();
  const { data: props, error: pErr } = await sb
    .from("properties")
    .select("*")
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;
  if (!props || props.length === 0) return [];

  const propRows = props as PropertyRow[];
  const ids = propRows.map((p) => p.id);
  const { data: reports, error: rErr } = await sb
    .from("reports")
    .select("*")
    .in("property_id", ids);
  if (rErr) throw rErr;

  const reportsByProp = new Map<string, ReportDbRow[]>();
  for (const r of (reports ?? []) as ReportDbRow[]) {
    const arr = reportsByProp.get(r.property_id) ?? [];
    arr.push(r);
    reportsByProp.set(r.property_id, arr);
  }

  return propRows.map((p) =>
    buildRecord(p, reportsByProp.get(p.id) ?? []),
  );
}

export async function getProperty(id: string): Promise<PropertyRecord | null> {
  const sb = supabaseBrowser();
  const { data: prop, error: pErr } = await sb
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!prop) return null;
  const { data: reports, error: rErr } = await sb
    .from("reports")
    .select("*")
    .eq("property_id", id);
  if (rErr) throw rErr;
  return buildRecord(prop as PropertyRow, (reports ?? []) as ReportDbRow[]);
}

// Resolve the active property from a URL search-params object. Falls back to
// the first property in created_at order. Returns null only when the
// workspace is empty.
export async function getActiveProperty(
  propertyIdParam: string | null,
): Promise<PropertyRecord | null> {
  const all = await listProperties();
  if (all.length === 0) return null;
  if (propertyIdParam) {
    const match = all.find((p) => p.id === propertyIdParam);
    if (match) return match;
  }
  return all[0] ?? null;
}

export async function getReportsFor(propertyId: string): Promise<ReportRow[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("reports")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw error;
  return ((data ?? []) as ReportDbRow[]).map(reportDbToRow);
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

export async function createProperty(
  input: ManualPropertyInput,
): Promise<PropertyRecord> {
  const sb = supabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();
  const insertPayload = {
    name: input.name.trim(),
    address: input.address?.trim() || null,
    owner_entity: input.ownerName?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    created_by: user?.id ?? null,
  };
  const { data, error } = await sb
    .from("properties")
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw error;
  return buildRecord(data as PropertyRow, []);
}

/**
 * Delete a property and every report attached to it.
 *
 * Order matters: storage objects don't cascade with the row delete, so we
 * remove every object under `<propertyId>/` first. ON DELETE CASCADE then
 * handles the `reports` rows when the property row is deleted. If the
 * storage cleanup races with another tab uploading the same property,
 * the DB row is still gone — the orphan storage object falls off on the
 * next upload.
 */
export async function deleteProperty(id: string): Promise<void> {
  const sb = supabaseBrowser();
  // List + delete every object under the property's prefix. Supabase Storage
  // doesn't have a "delete all under prefix" primitive; we list and pass
  // the names to remove().
  const { data: objects, error: listErr } = await sb.storage
    .from(REPORTS_BUCKET)
    .list(id, { limit: 1000 });
  if (listErr) throw listErr;
  if (objects && objects.length > 0) {
    const paths: string[] = [];
    // The list is shallow — recurse one level into <propertyId>/<reportType>/.
    for (const top of objects) {
      const { data: nested } = await sb.storage
        .from(REPORTS_BUCKET)
        .list(`${id}/${top.name}`, { limit: 1000 });
      if (nested) {
        for (const obj of nested) paths.push(`${id}/${top.name}/${obj.name}`);
      }
    }
    if (paths.length > 0) {
      const { error: rmErr } = await sb.storage.from(REPORTS_BUCKET).remove(paths);
      if (rmErr) throw rmErr;
    }
  }

  const { error } = await sb.from("properties").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Persist a parsed report. Uploads the raw file to storage, then upserts a
 * `reports` row keyed on (property_id, report_type). When the upsert
 * replaces an existing row, the old storage object is deleted first so
 * we don't leak files.
 *
 * Manual metadata on the parent property is never overwritten — the merge
 * happens on read in composeProperty.
 */
export async function saveReport(
  propertyId: string,
  reportType: ReportPayload["reportType"],
  file: File,
  parsedData: ReportPayload["data"],
): Promise<ReportRow> {
  const sb = supabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();

  // Find any existing row of this type so we can clean up its storage object
  // after the upsert. Read first because once the upsert replaces the row,
  // the old storage_path is gone.
  const { data: existing, error: selErr } = await sb
    .from("reports")
    .select("storage_path")
    .eq("property_id", propertyId)
    .eq("report_type", reportType)
    .maybeSingle();
  if (selErr) throw selErr;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const storagePath = `${propertyId}/${reportType}/${ts}-${safeName}`;

  const { error: upErr } = await sb.storage
    .from(REPORTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: row, error: insErr } = await sb
    .from("reports")
    .upsert(
      {
        property_id: propertyId,
        report_type: reportType,
        storage_path: storagePath,
        file_name: file.name,
        parsed_data: parsedData,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id ?? null,
      },
      { onConflict: "property_id,report_type" },
    )
    .select()
    .single();
  if (insErr) throw insErr;

  // Bump the parent's updated_at so the dashboard's "last updated" line
  // reflects the upload time, not just the property creation time.
  await sb
    .from("properties")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", propertyId);

  // Delete the old storage object only after the new row is persisted, so a
  // failure mid-flight doesn't leave the property with no report.
  if (existing && existing.storage_path && existing.storage_path !== storagePath) {
    await sb.storage.from(REPORTS_BUCKET).remove([existing.storage_path]);
  }

  return reportDbToRow(row as ReportDbRow);
}

// ---------------------------------------------------------------------------
// Realtime
//
// One subscription channel covers both tables. The callback fires after
// every INSERT / UPDATE / DELETE on properties or reports so the page can
// re-fetch the active record without bespoke per-event diffing.
// ---------------------------------------------------------------------------

export function subscribe(cb: () => void): () => void {
  const sb = supabaseBrowser();
  const ch = sb
    .channel("properties-and-reports")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "properties" },
      () => cb(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reports" },
      () => cb(),
    )
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
