"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RecipeEditor } from "@/components/recipes/RecipeEditor";
import { Button, Field, Page, PageHeader, inputClass } from "@/components/ui";
import { t } from "@/i18n/es";
import { useHousehold } from "@/lib/household";
import type { RecipeDraft } from "@/lib/recipe-types";
import { RecipeApiError, extractRecipe, generateRecipe, saveRecipe } from "@/lib/recipes";
import { useOnline } from "@/lib/useOnline";

type Mode = "manual" | "text" | "url" | "image" | "ai";
const MODES: Mode[] = ["manual", "text", "url", "image", "ai"];

const EMPTY: RecipeDraft = {
  title: "",
  servings: 4,
  minutes: null,
  ingredients: [],
  steps: [],
  sourceUrl: null,
  tags: [],
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function errorText(err: unknown): string {
  if (err instanceof RecipeApiError) {
    if (err.kind === "offline") return t.offline.needsConnection;
    if (err.kind === "rejected") return [err.message, ...err.details].join(" · ");
  }
  return t.common.error;
}

export default function NuevoPlato() {
  const router = useRouter();
  const household = useHousehold();
  const online = useOnline();
  const [mode, setMode] = useState<Mode>("manual");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [request, setRequest] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function run(fn: () => Promise<{ draft: RecipeDraft; source: string }>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      setDraft(res.draft);
      setDraftKey((k) => k + 1);
      setNotice(t.recipes.sourceNotice[res.source] ?? null);
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(d: RecipeDraft) {
    setBusy(true);
    const recipe = await saveRecipe(d);
    router.push(`/platos/plato?id=${recipe.id}`);
  }

  const needsNetwork = mode === "url" || mode === "image" || mode === "ai";

  return (
    <>
      <PageHeader title={t.recipes.newTitle} />
      <Page>
        <div role="tablist" aria-label={t.recipes.newTitle} className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`tap rounded-full border px-3 text-sm ${mode === m ? "border-brand bg-brand text-white" : "border-border"}`}
              onClick={() => {
                setMode(m);
                setNotice(null);
                if (m === "manual") {
                  setDraft(null);
                  setDraftKey((k) => k + 1);
                }
              }}
            >
              {t.recipes.modes[m]}
            </button>
          ))}
        </div>

        {needsNetwork && !online ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {t.offline.needsConnection}
          </p>
        ) : null}

        {mode === "text" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => extractRecipe({ kind: "text", text }));
            }}
          >
            <Field id="recipe-text" label={t.recipes.textLabel} help={t.recipes.textHelp}>
              <textarea
                id="recipe-text"
                className={`${inputClass} min-h-48 py-2`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || text.trim().length < 10}>
              {busy ? t.recipes.interpreting : t.recipes.interpret}
            </Button>
          </form>
        ) : null}

        {mode === "url" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => extractRecipe({ kind: "url", url: url.trim() }));
            }}
          >
            <Field id="recipe-url" label={t.recipes.urlLabel} help={t.recipes.urlHelp}>
              <input
                id="recipe-url"
                type="url"
                inputMode="url"
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Button type="submit" disabled={busy || !online || !/^https?:\/\/\S+/.test(url.trim())}>
              {busy ? t.recipes.interpreting : t.recipes.interpret}
            </Button>
          </form>
        ) : null}

        {mode === "image" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!file) return;
              void run(async () => {
                const data = await readAsBase64(file);
                const mediaType =
                  (["image/jpeg", "image/png", "image/webp"] as const).find(
                    (m) => m === file.type,
                  ) ?? "image/jpeg";
                return extractRecipe({ kind: "image", mediaType, data });
              });
            }}
          >
            <Field id="recipe-image" label={t.recipes.imageLabel} help={t.recipes.imageHelp}>
              <input
                id="recipe-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="tap"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Button type="submit" disabled={busy || !online || !file}>
              {busy ? t.recipes.interpreting : t.recipes.interpret}
            </Button>
          </form>
        ) : null}

        {mode === "ai" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const minutes = Math.round(Number(maxMinutes)) || null;
              void run(() =>
                generateRecipe({
                  request: request.trim(),
                  servings: household?.members ?? 2,
                  maxMinutes: minutes && minutes > 0 ? minutes : null,
                  diet: household?.diet ?? [],
                  allergens: household?.allergens ?? [],
                  postalCode: household?.postalCode ?? null,
                }),
              );
            }}
          >
            <Field id="recipe-request" label={t.recipes.aiLabel} help={t.recipes.aiHelp}>
              <input
                id="recipe-request"
                className={inputClass}
                value={request}
                placeholder={t.recipes.aiPlaceholder}
                onChange={(e) => setRequest(e.target.value)}
              />
            </Field>
            <Field id="recipe-max-minutes" label={t.recipes.maxMinutes}>
              <input
                id="recipe-max-minutes"
                className={inputClass}
                inputMode="numeric"
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || !online || request.trim().length < 3}>
              {busy ? t.recipes.proposing : t.recipes.propose}
            </Button>
          </form>
        ) : null}

        {notice ? (
          <p role="status" className="rounded-lg bg-warning-bg p-3 text-sm text-warning-fg">
            {notice}
          </p>
        ) : null}

        {mode === "manual" || draft ? (
          <RecipeEditor
            key={draftKey}
            initial={draft ?? EMPTY}
            onSave={(d) => void save(d)}
            saving={busy}
          />
        ) : null}
      </Page>
    </>
  );
}
