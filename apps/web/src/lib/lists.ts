"use client";

import { parseList, type ParsedLine } from "@comparacompra/core";
import { useLiveQuery } from "dexie-react-hooks";
import type { ParseResponse, ParsedLineDTO } from "./api-types";
import { db, newId, nowIso, type ListItemLocal, type ShoppingListLocal } from "./db";
import { DEMO } from "./demo";
import { enqueue } from "./sync";

export const DEFAULT_LIST_NAME = "Mi lista";

/** Lista activa (la más reciente); se crea la primera si no hay ninguna. */
export async function ensureActiveList(): Promise<ShoppingListLocal> {
  const last = await db.lists.orderBy("updatedAt").last();
  if (last) return last;
  const now = nowIso();
  const list: ShoppingListLocal = {
    id: newId(),
    name: DEFAULT_LIST_NAME,
    chainSlug: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.lists.put(list);
  await enqueue("shopping_list", "upsert", list.id, list as unknown as Record<string, unknown>);
  return list;
}

export function useActiveList():
  { list: ShoppingListLocal | null; items: ListItemLocal[] } | undefined {
  return useLiveQuery(async () => {
    const list = (await db.lists.orderBy("updatedAt").last()) ?? null;
    const items = list ? await db.listItems.where("listId").equals(list.id).sortBy("position") : [];
    return { list, items };
  }, []);
}

async function touchList(listId: string) {
  const list = await db.lists.get(listId);
  if (!list) return;
  const next = { ...list, updatedAt: nowIso() };
  await db.lists.put(next);
  await enqueue("shopping_list", "upsert", list.id, next as unknown as Record<string, unknown>);
}

/** Interpreta el texto: en el servidor (con IA si está disponible) o, sin conexión, en el móvil. */
export async function interpretList(
  text: string,
): Promise<{ lines: ParsedLineDTO[]; source: "ia" | "reglas" | "local" }> {
  if (DEMO) return { lines: parseList(text).map((l: ParsedLine) => ({ ...l })), source: "reglas" };
  try {
    if (navigator.onLine) {
      const res = await fetch("/api/list/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = (await res.json()) as ParseResponse;
        return { lines: data.lines, source: data.source };
      }
    }
  } catch {
    // sin conexión o error del servidor: se interpreta en el dispositivo
  }
  return { lines: parseList(text).map((l: ParsedLine) => ({ ...l })), source: "local" };
}

export async function addLines(listId: string, lines: ParsedLineDTO[]): Promise<void> {
  const last = await db.listItems.where("listId").equals(listId).sortBy("position");
  let position = (last.at(-1)?.position ?? -1) + 1;
  for (const l of lines) {
    const item: ListItemLocal = {
      id: newId(),
      listId,
      rawText: l.raw,
      label: l.label,
      canonicalId: null,
      canonicalName: null,
      leafSlug: l.leafSlug,
      variant: l.variant,
      flags: l.flags,
      quantity: l.quantity,
      unit: l.unit,
      packs: l.packs,
      people: l.people,
      estimated: Boolean(l.estimated),
      level: "equivalent",
      preferredBrand: null,
      checked: false,
      position: position++,
    };
    await db.listItems.put(item);
    await enqueue("list_item", "upsert", item.id, item as unknown as Record<string, unknown>);
  }
  await touchList(listId);
}

export async function updateItem(id: string, patch: Partial<ListItemLocal>): Promise<void> {
  const item = await db.listItems.get(id);
  if (!item) return;
  const next = { ...item, ...patch };
  await db.listItems.put(next);
  await enqueue("list_item", "upsert", id, next as unknown as Record<string, unknown>);
}

export async function removeItem(id: string): Promise<void> {
  await db.listItems.delete(id);
  await enqueue("list_item", "delete", id, null);
}

export async function clearList(listId: string): Promise<void> {
  const items = await db.listItems.where("listId").equals(listId).toArray();
  for (const item of items) await removeItem(item.id);
}
