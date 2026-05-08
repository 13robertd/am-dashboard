import type { Property } from "@/types/portfolio";
import {
  getProperty as storeGetProperty,
  listProperties as storeListProperties,
} from "@/lib/properties";

/**
 * @deprecated Use the storage-backed API in `@/lib/properties` directly.
 * Returns only the inner `Property` for each stored entry, dropping the
 * report metadata that components now read from the store. Async since
 * the underlying store is Supabase-backed.
 */
export async function listProperties(): Promise<Property[]> {
  const all = await storeListProperties();
  return all.map((s) => s.property);
}

/** @deprecated See `listProperties` above. */
export async function getProperty(id: string): Promise<Property | null> {
  const r = await storeGetProperty(id);
  return r?.property ?? null;
}
