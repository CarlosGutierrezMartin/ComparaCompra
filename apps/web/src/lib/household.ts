"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, nowIso, type HouseholdLocal } from "./db";
import { enqueue } from "./sync";

export type HouseholdInput = Omit<HouseholdLocal, "id" | "remoteId" | "updatedAt">;

/** Hogar guardado en el dispositivo. undefined mientras carga; null si aún no hay. */
export function useHousehold(): HouseholdLocal | null | undefined {
  return useLiveQuery(async () => (await db.household.get("local")) ?? null, []);
}

export async function saveHousehold(input: HouseholdInput): Promise<HouseholdLocal> {
  const current = await db.household.get("local");
  const next: HouseholdLocal = {
    ...input,
    id: "local",
    remoteId: current?.remoteId ?? null,
    updatedAt: nowIso(),
  };
  await db.household.put(next);
  await enqueue("household", "upsert", "household", next as unknown as Record<string, unknown>);
  return next;
}
