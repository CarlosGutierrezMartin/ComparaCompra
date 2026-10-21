import { adaptHighs } from "./highs-adapter";
import type { Solver } from "./plan";

/** Carga HiGHS (WebAssembly). Se reutiliza: cada `solve` crea su propio modelo. */
let loading: Promise<Solver> | null = null;

export function loadSolver(): Promise<Solver> {
  if (!loading) loading = import("highs").then(async (m) => adaptHighs(await m.default()));
  return loading;
}
