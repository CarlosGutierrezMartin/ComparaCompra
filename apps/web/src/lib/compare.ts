"use client";

import type { CompareResult, Offer } from "@comparacompra/core";
import type { CompareLine, CompareRequest } from "./api-types";
import type { HouseholdLocal, ListItemLocal } from "./db";

export interface CompareResponse extends CompareResult {
  offers: Record<string, Offer[]>;
  elapsedMs: number;
}

export function toCompareLines(items: ListItemLocal[]): CompareLine[] {
  return items.map((i) => ({
    id: i.id,
    label: i.label,
    leafSlug: i.leafSlug,
    variant: i.variant,
    flags: i.flags as CompareLine["flags"],
    level: i.level,
    identicalCanonicalId: i.canonicalId,
    quantity: i.quantity,
    unit: i.unit,
    packs: i.packs,
    preferredBrand: i.preferredBrand,
  }));
}

export class CompareError extends Error {
  constructor(public readonly kind: "offline" | "catalog" | "server") {
    super(kind);
  }
}

export async function requestCompare(
  household: HouseholdLocal,
  items: ListItemLocal[],
  options: { maxStores: 1 | 2; fixedCostPerStore: number },
): Promise<CompareResponse> {
  if (!navigator.onLine) throw new CompareError("offline");
  const body: CompareRequest = {
    postalCode: household.postalCode,
    chains: household.chainSlugs,
    maxStores: options.maxStores,
    fixedCostPerStore: options.fixedCostPerStore,
    lines: toCompareLines(items),
  };
  let res: Response;
  try {
    res = await fetch("/api/basket/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CompareError("offline");
  }
  if (res.status === 503) throw new CompareError("catalog");
  if (!res.ok) throw new CompareError("server");
  return (await res.json()) as CompareResponse;
}
