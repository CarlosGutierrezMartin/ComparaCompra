import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, type SyncOp } from "./db";
import { enqueue, flush, setRemote, type Remote } from "./sync";

class FakeRemote implements Remote {
  applied: SyncOp[] = [];
  failOn: string | null = null;
  constructor(public signedIn = true) {}
  async ready() {
    return this.signedIn;
  }
  async apply(op: SyncOp) {
    if (op.key === this.failOn) throw new Error("fallo de red");
    this.applied.push(op);
  }
}

beforeEach(async () => {
  setRemote(null);
  await db.syncQueue.clear();
});

describe("cola de sincronización", () => {
  it("sin sesión los cambios esperan en la cola", async () => {
    const remote = new FakeRemote(false);
    setRemote(remote);
    await enqueue("shopping_list", "upsert", "l1", { name: "Semana" });
    const result = await flush();
    expect(result.pending).toBe(1);
    expect(remote.applied).toHaveLength(0);
  });

  it("envía en orden y vacía la cola", async () => {
    await enqueue("shopping_list", "upsert", "l1", { name: "Semana" });
    await enqueue("list_item", "upsert", "i1", { listId: "l1", rawText: "leche" });
    const remote = new FakeRemote();
    setRemote(remote);
    const result = await flush();
    expect(result).toEqual({ sent: 2, pending: 0, error: null });
    expect(remote.applied.map((o) => o.key)).toEqual(["l1", "i1"]);
  });

  it("un upsert nuevo de la misma fila sustituye al pendiente", async () => {
    await enqueue("list_item", "upsert", "i1", { rawText: "leche" });
    await enqueue("list_item", "upsert", "i1", { rawText: "leche entera" });
    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.payload).toEqual({ rawText: "leche entera" });
  });

  it("si una operación falla se para y conserva el orden", async () => {
    await enqueue("shopping_list", "upsert", "l1", {});
    await enqueue("list_item", "upsert", "i1", {});
    await enqueue("list_item", "upsert", "i2", {});
    const remote = new FakeRemote();
    remote.failOn = "i1";
    setRemote(remote);
    const result = await flush();
    expect(result.sent).toBe(1);
    expect(result.pending).toBe(2);
    expect(result.error).toBe("fallo de red");
    const left = await db.syncQueue.orderBy("seq").toArray();
    expect(left.map((o) => o.key)).toEqual(["i1", "i2"]);
    expect(left[0]?.attempts).toBe(1);
    remote.failOn = null;
    expect((await flush()).pending).toBe(0);
  });
});
