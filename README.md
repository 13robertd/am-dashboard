# Owner Dashboard — v1

A 1-page tear sheet for residential property owners. Adapts between
single-family rental (SFR) and multifamily layouts on the same code path.

v1 ships with hand-authored sample data modeled on a real Entrata export.
v2 will replace the sample with an Entrata XLSX adapter — components stay
the same.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest — metric assertions vs. sample data
npm run lint
```

## Architecture

```
[Sample data | Entrata XLSX (v2) | AppFolio CSV (v2+) | ...]
                       ↓
               (adapter layer)
                       ↓
       Normalized Property model — src/types/portfolio.ts
                       ↓
       Data access — src/lib/queries.ts
                       ↓
       Pure metric fns — src/lib/metrics.ts
                       ↓
                  Components
```

Components never read PMS-specific column names. They consume a normalized
`Property` and call the pure functions in `lib/metrics.ts`.

## Layout map

```
src/
  app/
    page.tsx                     1-page dashboard, holds selected property
    layout.tsx                   root layout
    globals.css                  Tailwind v4 entry
  components/
    dashboard/
      DashboardHeader.tsx        name · owner · period
      PropertySwitcher.tsx       toggles between sample properties
      UploadStub.tsx             non-functional file picker (toast on click)
      HeroRow.tsx                branches SfrHero | MultifamilyHero
      OperationsRow.tsx          branches on units.length
      FinancialStrip.tsx         Income → OpEx → NOI → Cash Flow
      KpiCard.tsx                generic primitive
      PlaceholderCard.tsx        muted "not connected" treatment
    ui/                          local Card/Badge/Button/Select primitives
  data/sample.ts                 Burnside (61-unit MF) + Maple (SFR)
  lib/
    metrics.ts                   pure calculations
    queries.ts                   data access
    format.ts                    currency / percent / date helpers
    cn.ts                        tailwind-merge helper
    __tests__/metrics.test.ts    sample-data assertions
  types/portfolio.ts             normalized model
```

## Adaptive rendering

`property.units.length >= 5` → multifamily branch (4 hero cards, full
financial strip with NOI). Otherwise SFR branch (3 hero cards, NOI hidden,
plain-language lease dates).

## Sample data

Two seeded properties:

- **The Lower Burnside Lofts** — 61-unit Portland building. 11 hand-authored
  anchor units (named tenants, dated leases, the $453.60 Westphal AR
  balance) plus 50 deterministically-generated filler units. Trailing-4
  income statement uses real Entrata numbers (April 2026 NOI $49,758,
  cash flow $16,411).
- **123 Maple Street** — synthetic SFR, John Smith on a $2,800/mo lease,
  $650/mo cash flow.

## Wiring real data in v2

To swap sample data for real Entrata uploads, only three things need to
change. **No component changes.**

1. Implement `src/lib/adapters/entrata.ts`. Inputs: a set of XLSX blobs
   (Rent Roll, Income Statement Trailing 12, Expiring Leases, Resident
   Aged Receivables, Work Order Report). Output: a `Property` matching
   `src/types/portfolio.ts`. Parsing gotchas the adapter must handle:
   - Excel serial dates need conversion (epoch 1899-12-30, 1900 leap-year quirk).
   - Property name lives in metadata rows 1–4 of each sheet, not in a column.
   - Rent Roll has multi-row records per unit (1 main + N charges + 1 total).
   - Entrata's 5 unit statuses map to our 4 normalized buckets — see the
     comment on `UnitStatus` in `src/types/portfolio.ts`.
   - Rent Roll Balance ≠ AR delinquency. Use the Resident Aged Receivables
     report for `arBalances`.
2. Wire the upload UI in `UploadStub.tsx` to that adapter.
3. Swap `src/lib/queries.ts` from reading `sample.ts` to reading the parsed
   `Property` from state — same return type.

## What's deliberately out of scope (v1)

- Real XLSX/CSV parsing (Entrata adapter is v2)
- Authentication, multi-owner accounts
- PDF export, white-labeling, mobile polish
- Charts / sparklines (planned for v2 — sample data already carries
  trailing 4 months)
- Open Maintenance count — no Work Order data source yet, so the card
  renders the placeholder treatment described in `PlaceholderCard.tsx`
