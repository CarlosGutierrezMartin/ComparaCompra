import type { SupabaseClient } from "@supabase/supabase-js";
import { db, type HouseholdLocal, type RecipeIngredientLocal, type SyncOp } from "./db";
import type { Remote } from "./sync";

/**
 * Envía las operaciones de la cola a Supabase con la sesión del usuario: Row Level
 * Security garantiza que solo escribe en su hogar.
 */
export class SupabaseRemote implements Remote {
  private chainIds: Map<string, number> | null = null;

  constructor(private readonly sb: SupabaseClient) {}

  async ready(): Promise<boolean> {
    const { data } = await this.sb.auth.getSession();
    return Boolean(data.session);
  }

  private async chainId(slug: string | null | undefined): Promise<number | null> {
    if (!slug) return null;
    if (!this.chainIds) {
      const { data, error } = await this.sb.from("chain").select("id, slug");
      if (error) throw new Error(error.message);
      this.chainIds = new Map(
        (data ?? []).map((c: { id: number; slug: string }) => [c.slug, c.id]),
      );
    }
    return this.chainIds.get(slug) ?? null;
  }

  private async householdId(): Promise<string> {
    const h = await db.household.get("local");
    if (!h?.remoteId) throw new Error("El hogar aún no existe en el servidor");
    return h.remoteId;
  }

  private async ingredientId(leafSlug: string | null): Promise<number | null> {
    if (!leafSlug) return null;
    const { data, error } = await this.sb
      .from("ingredient")
      .select("id, product_canonical!inner(key)")
      .eq("product_canonical.key", `g:${leafSlug}`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: number } | null)?.id ?? null;
  }

  async apply(op: SyncOp): Promise<void> {
    const p = op.payload ?? {};
    if (op.op === "delete") {
      const table = op.table === "household" ? null : op.table;
      if (!table) return;
      const { error } = await this.sb.from(table).delete().eq("id", op.key);
      if (error) throw new Error(error.message);
      return;
    }
    switch (op.table) {
      case "household":
        return this.syncHousehold(p as unknown as HouseholdLocal);
      case "shopping_list": {
        const { error } = await this.sb.from("shopping_list").upsert({
          id: op.key,
          household_id: await this.householdId(),
          name: p.name,
          chain_id: await this.chainId(p.chainSlug as string | null),
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        });
        if (error) throw new Error(error.message);
        return;
      }
      case "list_item": {
        const { error } = await this.sb.from("list_item").upsert({
          id: op.key,
          list_id: p.listId,
          raw_text: p.rawText,
          product_canonical_id: p.canonicalId ?? null,
          quantity: p.quantity ?? null,
          unit: p.unit ?? null,
          equivalence_level: p.level,
          preferred_brand: p.preferredBrand ?? null,
          checked: p.checked,
          position: p.position,
        });
        if (error) throw new Error(error.message);
        return;
      }
      case "recipe":
        return this.syncRecipe(op.key, p);
      case "meal_plan":
        return this.syncMealPlan(op.key, p);
      case "pantry_item": {
        const ingredientId = await this.ingredientId(p.leafSlug as string);
        if (ingredientId === null) return; // sin ingrediente canónico no se puede guardar en el servidor
        const { error } = await this.sb.from("pantry_item").upsert({
          id: op.key,
          household_id: await this.householdId(),
          ingredient_id: ingredientId,
          quantity: p.quantity,
          unit: p.unit,
          best_before: p.bestBefore ?? null,
        });
        if (error) throw new Error(error.message);
        return;
      }
      case "price_observation": {
        const { error } = await this.sb.from("price_observation").upsert({
          id: op.key,
          household_id: await this.householdId(),
          product_chain_id: p.productChainId,
          price: p.price,
          observed_at: p.observedAt,
          source: "store_mode",
        });
        if (error) throw new Error(error.message);
        return;
      }
    }
  }

  private async syncHousehold(h: HouseholdLocal): Promise<void> {
    const chainIds = (await Promise.all(h.chainSlugs.map((s) => this.chainId(s)))).filter(
      (x): x is number => x !== null,
    );
    const local = await db.household.get("local");
    if (!local?.remoteId) {
      // ¿Ya tiene hogar este usuario (otro dispositivo)? Si no, se crea.
      const { data: profile } = await this.sb.from("profile").select("household_id").maybeSingle();
      let remoteId = (profile as { household_id: string } | null)?.household_id ?? null;
      if (!remoteId) {
        const { data, error } = await this.sb.rpc("create_household", {
          p_postal_code: h.postalCode,
          p_members: h.members,
          p_weekly_budget: h.weeklyBudget,
          p_chain_ids: chainIds,
          p_diet: h.diet,
          p_allergens: h.allergens,
        });
        if (error) throw new Error(error.message);
        remoteId = data as string;
      }
      await db.household.update("local", { remoteId });
    }
    const householdId = await this.householdId();
    const { error } = await this.sb
      .from("household")
      .update({
        postal_code: h.postalCode,
        members: h.members,
        weekly_budget: h.weeklyBudget,
        chain_ids: chainIds,
      })
      .eq("id", householdId);
    if (error) throw new Error(error.message);
    const { data: session } = await this.sb.auth.getSession();
    const userId = session.session?.user.id;
    if (userId) {
      const { error: pe } = await this.sb
        .from("profile")
        .update({ diet: h.diet, allergens: h.allergens, disliked: h.disliked })
        .eq("user_id", userId);
      if (pe) throw new Error(pe.message);
    }
  }

  private async syncRecipe(id: string, p: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb.from("recipe").upsert({
      id,
      household_id: await this.householdId(),
      title: p.title,
      servings: p.servings,
      minutes: p.minutes ?? null,
      steps: p.steps ?? [],
      tags: p.tags ?? [],
      source_url: p.sourceUrl ?? null,
      updated_at: p.updatedAt,
    });
    if (error) throw new Error(error.message);
    const ingredients = (p.ingredients as RecipeIngredientLocal[] | undefined) ?? [];
    const { error: de } = await this.sb.from("recipe_ingredient").delete().eq("recipe_id", id);
    if (de) throw new Error(de.message);
    const rows = await Promise.all(
      ingredients.map(async (i, position) => ({
        recipe_id: id,
        ingredient_id: await this.ingredientId(i.leafSlug),
        position,
        name: i.name,
        variant: i.variant,
        flags: i.flags,
        quantity: i.quantity,
        unit: i.quantity === null ? null : i.unit,
        optional: i.optional,
        raw_text: i.rawText,
      })),
    );
    if (rows.length) {
      const { error: ie } = await this.sb.from("recipe_ingredient").insert(rows);
      if (ie) throw new Error(ie.message);
    }
  }

  private async syncMealPlan(id: string, p: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb.from("meal_plan").upsert({
      id,
      household_id: await this.householdId(),
      week_start: p.weekStart,
      budget: p.budget ?? null,
      people: p.people,
      optimized_for: p.optimizedFor,
    });
    if (error) throw new Error(error.message);
    const { error: de } = await this.sb.from("meal_plan_slot").delete().eq("meal_plan_id", id);
    if (de) throw new Error(de.message);
    const slots = (p.slots as Array<Record<string, unknown>>) ?? [];
    if (slots.length) {
      const { error: se } = await this.sb.from("meal_plan_slot").insert(
        slots.map((s) => ({
          meal_plan_id: id,
          day: s.day,
          meal: s.meal,
          recipe_id: s.recipeId ?? null,
          servings: s.servings,
          locked: Boolean(s.locked),
        })),
      );
      if (se) throw new Error(se.message);
    }
  }
}
