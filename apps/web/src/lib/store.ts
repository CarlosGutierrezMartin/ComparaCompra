"use client";

import { LEAF_BY_SLUG, LEAVES, formatQuantity, type Plan } from "@comparacompra/core";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  newId,
  nowIso,
  type ListItemLocal,
  type StoreTripItem,
  type StoreTripLocal,
} from "./db";
import { updateItem } from "./lists";
import { enqueue } from "./sync";

/**
 * Modo tienda (docs/SPEC.md, F5): la lista de una tienda se descarga entera al móvil
 * (productos, precios con su fecha y enlaces) para usarla sin conexión. Lo que se marca se
 * guarda al momento en IndexedDB; los precios vistos en la tienda se envían como
 * price_observation cuando vuelve la conexión.
 */

const SECTION_ORDER = [...new Set(LEAVES.map((l) => l.section))];
export const OTHER_SECTION = "Otros";

export function sectionRank(section: string): number {
  const i = SECTION_ORDER.indexOf(section);
  return i < 0 ? SECTION_ORDER.length : i;
}

export function useActiveTrip(): StoreTripLocal | null | undefined {
  return useLiveQuery(async () => (await db.storeTrips.orderBy("updatedAt").last()) ?? null, []);
}

/** Crea el viaje a una tienda con las líneas del plan de esa cadena; las que no tiene, sin precio. */
export async function startTrip(
  listId: string,
  chain: string,
  plan: Plan,
  items: ListItemLocal[],
): Promise<StoreTripLocal> {
  const now = nowIso();
  const choices = new Map(plan.lines.filter((l) => l.chain === chain).map((l) => [l.lineId, l]));
  // En un plan de dos tiendas, lo que se compra en la otra no va en esta lista.
  const elsewhere = new Set(plan.lines.filter((l) => l.chain !== chain).map((l) => l.lineId));
  const tripItems: StoreTripItem[] = items
    .filter((i) => !elsewhere.has(i.id))
    .map((i) => {
      const c = choices.get(i.id);
      const quantityText =
        i.quantity !== null ? formatQuantity(i.quantity, i.unit) : i.packs ? `${i.packs} env.` : "";
      return {
        id: i.id,
        name: i.label,
        productName: c?.offer.name ?? null,
        productUrl: c?.offer.url ?? null,
        productChainId: c?.offer.productId ?? null,
        aisle: (i.leafSlug && LEAF_BY_SLUG.get(i.leafSlug)?.section) || OTHER_SECTION,
        quantityText,
        packs: c?.packs ?? 0,
        price: c?.offer.price ?? null,
        priceDate: c?.offer.priceDate ?? null,
        observedPrice: null,
        checked: i.checked,
      };
    })
    .sort(
      (a, b) => sectionRank(a.aisle) - sectionRank(b.aisle) || a.name.localeCompare(b.name, "es"),
    );
  const trip: StoreTripLocal = {
    id: newId(),
    listId,
    chainSlug: chain,
    createdAt: now,
    updatedAt: now,
    items: tripItems,
  };
  await db.transaction("rw", db.storeTrips, async () => {
    await db.storeTrips.clear();
    await db.storeTrips.put(trip);
  });
  return trip;
}

async function patchItem(
  tripId: string,
  itemId: string,
  patch: Partial<StoreTripItem>,
): Promise<StoreTripItem | null> {
  let updated: StoreTripItem | null = null;
  await db.transaction("rw", db.storeTrips, async () => {
    const trip = await db.storeTrips.get(tripId);
    if (!trip) return;
    const items = trip.items.map((it) => {
      if (it.id !== itemId) return it;
      updated = { ...it, ...patch };
      return updated;
    });
    await db.storeTrips.put({ ...trip, items, updatedAt: nowIso() });
  });
  return updated;
}

export async function toggleTaken(tripId: string, item: StoreTripItem): Promise<void> {
  await patchItem(tripId, item.id, { checked: !item.checked });
  // La línea de la lista también queda marcada (se sincroniza con la cuenta, si la hay).
  if (await db.listItems.get(item.id)) await updateItem(item.id, { checked: !item.checked });
}

/** Anota el precio visto en la tienda. Solo se envía si hay producto concreto de la cadena. */
export async function setObservedPrice(
  tripId: string,
  item: StoreTripItem,
  price: number | null,
): Promise<void> {
  await patchItem(tripId, item.id, { observedPrice: price });
  if (price === null || item.productChainId === null) return;
  const id = newId();
  await enqueue("price_observation", "upsert", id, {
    id,
    productChainId: item.productChainId,
    price,
    observedAt: nowIso(),
  });
}

export async function finishTrip(tripId: string): Promise<void> {
  await db.storeTrips.delete(tripId);
}
