import { db, nowIso, type SyncOp, type SyncTable } from "./db";

/**
 * Cola de sincronización. Cada cambio local se guarda como operación y se envía en orden
 * cuando hay conexión y sesión. No se usa Background Sync porque iOS no lo tiene: se
 * reintenta al recuperar la conexión y al volver la app a primer plano.
 */

export interface Remote {
  /** true si hay sesión iniciada y se puede escribir en el servidor. */
  ready(): Promise<boolean>;
  apply(op: SyncOp): Promise<void>;
}

export async function enqueue(
  table: SyncTable,
  op: SyncOp["op"],
  key: string,
  payload: Record<string, unknown> | null,
): Promise<void> {
  // Si ya hay un upsert pendiente de la misma fila, se sustituye: solo importa el último estado.
  await db.transaction("rw", db.syncQueue, async () => {
    if (op === "upsert") {
      const pending = await db.syncQueue.where("key").equals(key).toArray();
      const sameUpsert = pending.filter((p) => p.table === table && p.op === "upsert");
      if (sameUpsert.length && sameUpsert.length === pending.length) {
        await db.syncQueue.bulkDelete(sameUpsert.map((p) => p.seq!));
      }
    }
    await db.syncQueue.add({
      table,
      op,
      key,
      payload,
      createdAt: nowIso(),
      attempts: 0,
      lastError: null,
    });
  });
  void flush();
}

let remote: Remote | null = null;

export function setRemote(r: Remote | null): void {
  remote = r;
}

export interface FlushResult {
  sent: number;
  pending: number;
  error: string | null;
}

// Los envíos se encadenan: nunca hay dos a la vez y cada llamada ve el estado más reciente.
let chain: Promise<FlushResult> = Promise.resolve({ sent: 0, pending: 0, error: null });

export function flush(): Promise<FlushResult> {
  chain = chain.then(doFlush, doFlush);
  return chain;
}

async function doFlush(): Promise<FlushResult> {
  let sent = 0;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!remote || offline || !(await remote.ready())) {
    return { sent, pending: await db.syncQueue.count(), error: null };
  }
  // En orden: una lista tiene que existir antes que sus líneas.
  const ops = await db.syncQueue.orderBy("seq").toArray();
  for (const op of ops) {
    try {
      await remote.apply(op);
      await db.syncQueue.delete(op.seq!);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.syncQueue.update(op.seq!, { attempts: op.attempts + 1, lastError: message });
      return { sent, pending: await db.syncQueue.count(), error: message };
    }
  }
  return { sent, pending: 0, error: null };
}

/** Engancha los reintentos: al volver la conexión y al volver la app a primer plano. */
export function startAutoSync(): () => void {
  const onOnline = () => void flush();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  void flush();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
