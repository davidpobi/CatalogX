import { SearchOperations, type CatalogQueryPlanV1, type CompileSearchData } from "@/interfaces/search";
import { normalizeApiError, postApi } from "./apiClient.service";

export const compileSearch = async (prompt: string, previousPlan?: CatalogQueryPlanV1 | null, signal?: AbortSignal) => { try { return await postApi<CompileSearchData>("/api/search", { operation: SearchOperations.CompileQuery, prompt, previousPlan: previousPlan || null }, signal); } catch (error) { throw normalizeApiError(error, "Search compilation is temporarily unavailable."); } };
