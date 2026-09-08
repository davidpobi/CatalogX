import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { CatalogIntelligenceContextV1 } from "@/interfaces/intelligence";
import type { CatalogQueryPlanV1, CompileSearchData } from "@/interfaces/search";
import { interpretationSchema, queryPlanSchema } from "@/utils/queryPlan";
import { compileFallbackQuery, isRefinementPrompt } from "@/utils/searchFallback";
import { getOpenAI } from "../config/openai";

const compiledSchema = z.object({ plan: queryPlanSchema, interpretation: interpretationSchema });
const model = "gpt-5.6-terra" as const;

const instructions = `Compile a customer request for the supplied home catalogue into the strict schema. The storeContext and assortment define what the store can actually provide; never invent products, services, guarantees, or vocabulary outside them. Preserve budgets, availability, delivery, dimensions, explicit categories, explicit product types, and explicit exclusions as hard constraints. Convert moods and other subjective language into no more than the 20 strongest weighted preferences using lifestyle.relationships. Mood-derived attributes are never hard filters unless the customer explicitly names them. "Around" a price means plus or minus 20 percent. A discount means discountOnly true. For room furnishing requests, use bundle mode with multiple relevant categories. requestMode is authoritative: for a new search, build a fresh plan from the current prompt; for a refinement, preserve previous constraints the customer does not change, remove constraints they explicitly reject, and replace constraints they explicitly revise. Resolve conflicts in favor of the newest explicit request and record material assumptions. Use exact values from allowedValues. Map aliases to their canonical product type; omit a constraint rather than inventing one. Return only the plan, summary, removable chips, and assumptions. Product selection and follow-up suggestions happen deterministically after compilation.`;

export const compileSearchWithAI = async (prompt: string, context: CatalogIntelligenceContextV1, previousPlan?: CatalogQueryPlanV1 | null): Promise<CompileSearchData> => {
  const requestMode = isRefinementPrompt(prompt, previousPlan, context) ? "refinement" : "new";
  const effectivePreviousPlan = requestMode === "refinement" ? previousPlan : null;
  try {
      const response = await getOpenAI().responses.parse({
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions,
        input: JSON.stringify({
          prompt,
          requestMode,
          previousPlan: effectivePreviousPlan || null,
          storeContext: context.store,
          lifestyle: context.lifestyle,
          assortment: context.assortment,
          allowedValues: {
            categories: context.assortment.categories.map((category) => category.id),
            productTypes: context.assortment.productTypes.map((productType) => productType.id),
            rooms: context.lifestyle.rooms,
            styles: context.lifestyle.styles,
            colors: context.lifestyle.colors,
            materials: context.lifestyle.materials,
            availability: ["in_stock", "low_stock", "backorder", "out_of_stock"],
            tags: context.lifestyle.tags,
            useCases: context.lifestyle.useCases,
            features: context.lifestyle.features,
          },
        }),
        text: { format: zodTextFormat(compiledSchema, "catalog_query_compilation") },
      });
      if (!response.output_parsed) throw new Error("Model did not return a query plan.");
    return { ...response.output_parsed, compiler: model };
    } catch (error) {
    console.warn("[search-compiler] terra_attempt_failed", { model, error: error instanceof Error ? error.name : typeof error });
    return compileFallbackQuery(prompt, effectivePreviousPlan, context);
  }
};
