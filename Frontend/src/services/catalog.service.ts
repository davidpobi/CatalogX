import { CatalogOperations, type CatalogListData, type CatalogQueryData } from "@/interfaces/catalog";
import type { CatalogQueryPlanV1 } from "@/interfaces/search";
import { normalizeApiError, postApi } from "./apiClient.service";

export const listProducts = async (cursor: string | null = null, signal?: AbortSignal) => { try { return await postApi<CatalogListData>("/api/catalog", { operation: CatalogOperations.ListProducts, cursor, limit: 24 }, signal); } catch (error) { throw normalizeApiError(error, "The catalogue could not be loaded."); } };
export const queryProducts = async (plan: CatalogQueryPlanV1, signal?: AbortSignal) => { try { return await postApi<CatalogQueryData>("/api/catalog", { operation: CatalogOperations.QueryProducts, plan, excludedProductIds: [] }, signal); } catch (error) { throw normalizeApiError(error, "The catalogue could not be searched."); } };
export const replaceBundleProduct = async (plan: CatalogQueryPlanV1, currentProductIds: string[], targetProductId: string, signal?: AbortSignal) => { try { return await postApi<CatalogQueryData>("/api/catalog", { operation: CatalogOperations.ReplaceBundleProduct, plan, currentProductIds, targetProductId }, signal); } catch (error) { throw normalizeApiError(error, "A replacement could not be found."); } };
