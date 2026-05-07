// Property storage layer.
//
// v1 backs the dashboard's properties with localStorage; the API surface here
// is the seam we'll later swap for Supabase (or any other server-backed
// store). Components MUST NOT touch localStorage directly — they go through
// these named exports so the swap stays mechanical.
//
// Storage contract:
//   key:   `am-dashboard:v1:properties`
//   value: serialized Store object (see below)
//
// SSR / hydration notes:
//   - Module-level reads of `localStorage` are guarded on `typeof window`.
//   - On the server `memory` is just `emptyStore()`; the SSR snapshot
//     returned by `getServerSnapshot()` matches that exactly so the client's
//     first render (during React hydration) doesn't diverge from the server.
//   - Right after hydration React switches to the client snapshot via
//     `useSyncExternalStore`, which sees the rehydrated `memory` populated
//     from localStorage, and re-renders with the real data.
//   - Cross-tab updates: the `storage` event only fires in OTHER tabs. We
//     pair it with an in-process `subscribers` set so same-tab writes by
//     `createProperty`/`deleteProperty`/etc. also notify subscribers.

import type { Property } from "@/types/portfolio";
import { burnside } from "@/data/sample";

const STORAGE_KEY = "am-dashboard:v1:properties";
const STORAGE_VERSION = 1;

export interface ManualPropertyInput {
  name: string;
  address?: string;
  ownerName?: string;
  city?: string;
  state?: string;
}

export interface StoredReports {
  reportsParsedCount: number;
  warnings: string[];
  missingReports: string[];
}

export interface StoredProperty {
  id: string;
  property: Property;
  reports: StoredReports;
}

interface Store {
  version: number;
  properties: StoredProperty[];
  activeId: string | null;
  // Set the first time we seed Burnside (or the first time the user creates
  // a property). Once true it stays true forever — even when the user
  // deletes every property — so we never re-seed silently. The switcher
  // shows an empty state instead.
  hasBeenSeeded: boolean;
}

function emptyStore(): Store {
  return {
    version: STORAGE_VERSION,
    properties: [],
    activeId: null,
    hasBeenSeeded: false,
  };
}

let memory: Store = emptyStore();
let hydrated = false;
const subscribers = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function safeRead(): Store | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Store> | null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.properties)) {
      return null;
    }
    // Fill in any missing top-level fields defensively so a corrupted blob
    // can't take down the dashboard.
    return {
      version: parsed.version ?? STORAGE_VERSION,
      properties: parsed.properties as StoredProperty[],
      activeId: parsed.activeId ?? null,
      hasBeenSeeded: parsed.hasBeenSeeded ?? true,
    };
  } catch {
    return null;
  }
}

function safeWrite(s: Store): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded, private mode, etc. In-memory state still works for the
    // current session — we just lose persistence.
  }
}

function emit(): void {
  for (const cb of subscribers) cb();
}

function seedBurnsideIntoMemory(): void {
  // Burnside is treated as a fully-loaded property — units, AR, monthly
  // financials are all hand-authored. We declare it as having 4 of the 5
  // canonical reports "uploaded" so the Manage Reports counter starts at 4/5
  // (matching the v1 status quo for the seeded sample).
  const stored: StoredProperty = {
    id: burnside.id,
    property: burnside,
    reports: {
      reportsParsedCount: 4,
      warnings: [],
      missingReports: ["workOrders"],
    },
  };
  memory = {
    version: STORAGE_VERSION,
    properties: [stored],
    activeId: stored.id,
    hasBeenSeeded: true,
  };
}

// Idempotent. First call on the client reads localStorage and seeds Burnside
// if and only if `hasBeenSeeded` is missing or false.
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!isBrowser()) return;

  const persisted = safeRead();
  if (persisted) {
    memory = persisted;
    if (
      memory.activeId &&
      !memory.properties.some((p) => p.id === memory.activeId)
    ) {
      memory.activeId = memory.properties[0]?.id ?? null;
    }
    if (!memory.hasBeenSeeded) {
      // Edge case: a partial / hand-crafted blob without the flag. Treat as
      // a fresh visit and seed.
      seedBurnsideIntoMemory();
      safeWrite(memory);
    }
    return;
  }

  // No persisted blob — true first visit. Seed Burnside, mark seeded.
  seedBurnsideIntoMemory();
  safeWrite(memory);
}

if (typeof window !== "undefined") {
  // Cross-tab sync. localStorage's `storage` event fires in all OTHER tabs
  // when one tab writes, so we refresh in-memory state and notify
  // subscribers. (Same-tab writes don't fire this event — those are
  // handled by emit() inside each mutator.)
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const fresh = safeRead();
    if (fresh) {
      memory = fresh;
      emit();
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listProperties(): StoredProperty[] {
  hydrate();
  return memory.properties;
}

export function getProperty(id: string): StoredProperty | undefined {
  hydrate();
  return memory.properties.find((p) => p.id === id);
}

export function getActiveProperty(): StoredProperty | undefined {
  hydrate();
  if (!memory.activeId) return undefined;
  return memory.properties.find((p) => p.id === memory.activeId);
}

export function setActiveProperty(id: string): void {
  hydrate();
  if (!memory.properties.some((p) => p.id === id)) return;
  memory = { ...memory, activeId: id };
  safeWrite(memory);
  emit();
}

export function getReportsFor(id: string): StoredReports | undefined {
  return getProperty(id)?.reports;
}

function makeId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || "property"}-${suffix}`;
}

export function createProperty(input: ManualPropertyInput): StoredProperty {
  hydrate();
  const id = makeId(input.name);
  const property: Property = {
    id,
    name: input.name.trim(),
    ownerName: input.ownerName?.trim() ?? "",
    address: {
      street: input.address?.trim() ?? "",
      city: input.city?.trim() ?? "",
      state: input.state?.trim() ?? "",
      zip: "",
    },
    // Until a Rent Roll is uploaded we don't know the unit count, so we
    // default to apartment-building (the multifamily branch). Re-derived on
    // first upload.
    propertyType: "apartment-building",
    reportingPeriod: "",
    units: [],
    arBalances: [],
    workOrders: [],
    monthlyFinancials: [],
  };
  const stored: StoredProperty = {
    id,
    property,
    reports: { reportsParsedCount: 0, warnings: [], missingReports: [] },
  };
  memory = {
    ...memory,
    properties: [...memory.properties, stored],
    activeId: id,
    hasBeenSeeded: true,
  };
  safeWrite(memory);
  emit();
  return stored;
}

export function deleteProperty(id: string): void {
  hydrate();
  const remaining = memory.properties.filter((p) => p.id !== id);
  // When the active property is deleted, fall back to the first remaining
  // property in list order. If nothing remains, leave activeId null and let
  // the switcher render its empty state — we never silently re-seed
  // Burnside, since `hasBeenSeeded` stays true forever once flipped.
  let activeId = memory.activeId;
  if (activeId === id) {
    activeId = remaining[0]?.id ?? null;
  }
  memory = { ...memory, properties: remaining, activeId };
  safeWrite(memory);
  emit();
}

/**
 * Persist parsed reports onto an existing property.
 *
 * Manually-entered metadata fields ALWAYS win: `name`, `ownerName`, and
 * every key under `address`. The parser leaves these blank for uploads, so
 * preserving the user's input is the desired default. Reports only
 * contribute the data fields: `units`, `arBalances`, `workOrders`,
 * `monthlyFinancials`, plus the derived `propertyType` and
 * `reportingPeriod` (which the parser computes from the rent roll).
 *
 * If the existing property has empty manual metadata, the parsed values
 * fill in (so a placeholder created with just a name picks up the parsed
 * address, etc., when reports come in).
 */
export function saveReportsFor(
  id: string,
  payload: { property: Property; reports: StoredReports },
): void {
  hydrate();
  const idx = memory.properties.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const existing = memory.properties[idx]!;
  const merged: Property = {
    id: existing.id,
    name: existing.property.name || payload.property.name,
    ownerName: existing.property.ownerName || payload.property.ownerName,
    address: {
      street: existing.property.address.street || payload.property.address.street,
      city: existing.property.address.city || payload.property.address.city,
      state: existing.property.address.state || payload.property.address.state,
      zip: existing.property.address.zip || payload.property.address.zip,
    },
    propertyType: payload.property.propertyType,
    reportingPeriod: payload.property.reportingPeriod,
    units: payload.property.units,
    arBalances: payload.property.arBalances,
    workOrders: payload.property.workOrders,
    monthlyFinancials: payload.property.monthlyFinancials,
  };
  const next = [...memory.properties];
  next[idx] = { id: existing.id, property: merged, reports: payload.reports };
  memory = { ...memory, properties: next };
  safeWrite(memory);
  emit();
}

// ---------------------------------------------------------------------------
// Subscriptions / React integration
// ---------------------------------------------------------------------------

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// useSyncExternalStore wants a stable reference between calls when the data
// hasn't changed. `memory` is reassigned on every mutation, so callers can
// safely depend on === identity to detect changes.
export function getSnapshot(): Store {
  hydrate();
  return memory;
}

const SSR_SNAPSHOT: Store = emptyStore();
export function getServerSnapshot(): Store {
  return SSR_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Test helpers — not part of the public surface.
// ---------------------------------------------------------------------------

/** @internal */
export function _resetForTests(): void {
  memory = emptyStore();
  hydrated = false;
  subscribers.clear();
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** @internal */
export const _STORAGE_KEY = STORAGE_KEY;
