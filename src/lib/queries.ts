import type { Property } from "@/types/portfolio";
import { sampleProperties } from "@/data/sample";

export function listProperties(): Property[] {
  return sampleProperties;
}

export function getProperty(id: string): Property | undefined {
  return sampleProperties.find((p) => p.id === id);
}
