import type { Property } from "@/types/portfolio";
import {
  getProperty as storeGetProperty,
  listProperties as storeListProperties,
} from "@/lib/properties";

/**
 * @deprecated Use the storage-backed API in `@/lib/properties` directly.
 * Returns only the inner `Property` for each stored entry, dropping the
 * report metadata that components now read from the store. Kept as a thin
 * shim so older imports keep compiling; new code should import from
 * `@/lib/properties` so it gets reactive updates.
 */
export function listProperties(): Property[] {
  return storeListProperties().map((s) => s.property);
}

/** @deprecated See `listProperties` above. */
export function getProperty(id: string): Property | undefined {
  return storeGetProperty(id)?.property;
}
