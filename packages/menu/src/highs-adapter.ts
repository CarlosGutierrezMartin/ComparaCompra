import type highsLoader from "highs";
import type { Solver } from "./plan";

type Highs = Awaited<ReturnType<typeof highsLoader>>;

/** Adapta HiGHS (cargado en Node o en el navegador) a la interfaz que usa planMenu. */
export function adaptHighs(highs: Highs): Solver {
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
}
