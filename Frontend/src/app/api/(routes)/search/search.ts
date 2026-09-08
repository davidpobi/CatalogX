import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import { SearchOperations, type CompileSearchData } from "@/interfaces/search";
import { queryPlanSchema } from "@/utils/queryPlan";
import { compileSearchWithAI } from "../../services/searchCompiler.service";
import { getCatalogProducts } from "../../services/catalog.service";
import { buildSearchVocabulary, normalizeCompiledSearch } from "@/utils/searchVocabulary";
import { failure } from "../../utils/httpUtils";
import { getCatalogIntelligenceContext } from "../../services/catalogIntelligence.service";

const requestSchema = z.object({
  operation: z.literal(SearchOperations.CompileQuery),
  prompt: z.string().trim().min(2).max(800),
  previousPlan: queryPlanSchema.nullish(),
});

export const compileSearch = async (body: unknown): Promise<ApiRouteResult<CompileSearchData>> => {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "Enter a search request between 2 and 800 characters.");
  const products = await getCatalogProducts();
  const vocabulary = buildSearchVocabulary(products);
  const compiled = await compileSearchWithAI(parsed.data.prompt, getCatalogIntelligenceContext(products), parsed.data.previousPlan);
  return { status: 200, data: normalizeCompiledSearch(compiled, vocabulary) };
};
