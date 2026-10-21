import type { Solver } from "./plan";

/** Carga HiGHS (WebAssembly). Se reutiliza: cada `solve` crea su propio modelo. */
let loading: Promise<Solver> | null = null;

export function loadSolver(): Promise<Solver> {
  if (!loading) {
    loading = import("highs").then(async (m): Promise<Solver> => {
      const highs = await m.default();
      return {
        solve(lp, options) {
          const res = highs.solve(lp, options as Parameters<typeof highs.solve>[1]);
          const columns: Record<string, { Primal?: number }> = {};
          for (const [name, col] of Object.entries(res.Columns)) {
            columns[name] = {
              Primal: "Primal" in col && typeof col.Primal === "number" ? col.Primal : undefined,
            };
          }
          return { Status: res.Status, Columns: columns };
        },
      };
    });
  }
  return loading;
}
