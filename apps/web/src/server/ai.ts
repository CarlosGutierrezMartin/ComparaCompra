import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Llamadas a la API de Claude con salida estructurada validada con Zod.
 * Regla del proyecto: si no valida, se reintenta una vez y después se devuelve null para
 * que el llamante use la alternativa sin IA o marque el resultado para revisión.
 */

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | null | undefined;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic | null {
  if (client === undefined) client = aiAvailable() ? new Anthropic() : null;
  return client;
}

export type UserContent = string | Anthropic.Beta.BetaContentBlockParam[];

export async function parseStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: UserContent;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S> | null> {
  const c = getClient();
  if (!c) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await c.beta.messages.parse({
        model: AI_MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
        output_format: betaZodOutputFormat(opts.schema),
        output_config: { effort: opts.effort ?? "low" },
        // Si los filtros de seguridad rechazan la petición, el servidor la repite con el
        // modelo de respaldo adecuado al motivo.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (msg.stop_reason === "refusal" || msg.parsed_output == null) continue;
      const checked = opts.schema.safeParse(msg.parsed_output);
      if (checked.success) return checked.data;
    } catch (err) {
      if (
        err instanceof Anthropic.AuthenticationError ||
        err instanceof Anthropic.BadRequestError
      ) {
        console.error("IA: error no recuperable", err.message);
        return null;
      }
      if (!(err instanceof Anthropic.APIError) && !(err instanceof SyntaxError)) throw err;
      console.warn(`IA: intento ${attempt} fallido`, err.message);
    }
  }
  return null;
}
