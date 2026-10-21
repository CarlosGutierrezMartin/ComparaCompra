import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const parseStructured = vi.fn();
vi.mock("@/server/ai", () => ({
  aiAvailable: () => true,
  parseStructured: (...args: unknown[]) => parseStructured(...args),
}));
const fetchPage = vi.fn();
vi.mock("@/server/safe-fetch", () => ({
  FetchError: class FetchError extends Error {},
  fetchPage: (...args: unknown[]) => fetchPage(...args),
}));

const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/recipes/extract", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/recipes/extract con enlace", () => {
  beforeEach(() => {
    parseStructured.mockReset();
    fetchPage.mockReset();
  });

  it("si la página tiene schema.org no se llama a la IA", async () => {
    const recipe = {
      "@type": "Recipe",
      name: "Gazpacho",
      recipeIngredient: ["1 kg de tomates", "1 pepino", "50 ml de aceite de oliva"],
    };
    fetchPage.mockResolvedValue({
      url: "https://example.com/gazpacho",
      html: `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`,
    });
    const res = await call({ kind: "url", url: "https://example.com/gazpacho" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      source: string;
      usedAi: boolean;
      draft: { ingredients: unknown[]; steps: string[] };
    };
    expect(data.source).toBe("schema.org");
    expect(data.usedAi).toBe(false);
    expect(data.draft.ingredients).toHaveLength(3);
    expect(data.draft.steps).toEqual([]);
    expect(parseStructured).not.toHaveBeenCalled();
  });

  it("sin schema.org usa la IA solo para los ingredientes", async () => {
    fetchPage.mockResolvedValue({
      url: "https://example.com/x",
      html: "<p>Ingredientes</p><li>200 g de arroz</li>",
    });
    parseStructured.mockResolvedValue({
      titulo: "Arroz",
      raciones: 2,
      minutos: null,
      pasos: ["Paso copiado del autor"],
      ingredientes: [
        {
          texto: "200 g de arroz",
          nombre: "arroz",
          hoja: null,
          variante: null,
          cantidad: 200,
          unidad: "g",
          opcional: false,
        },
      ],
    });
    const res = await call({ kind: "url", url: "https://example.com/x" });
    const data = (await res.json()) as {
      source: string;
      draft: { steps: string[]; sourceUrl: string };
    };
    expect(data.source).toBe("ia");
    expect(data.draft.steps).toEqual([]);
    expect(data.draft.sourceUrl).toBe("https://example.com/x");
    expect(parseStructured).toHaveBeenCalledTimes(1);
  });

  it("petición no válida", async () => {
    const res = await call({ kind: "url", url: "no es un enlace" });
    expect(res.status).toBe(400);
  });
});
