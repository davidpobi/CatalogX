import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import { CatalogOperations, type CatalogListData, type CatalogQueryData } from "@/interfaces/catalog";
import { queryPlanSchema } from "@/utils/queryPlan";
import { buildFacets, executeCatalogQuery, replaceCatalogBundleProduct } from "@/utils/catalogQuery";
import { getCatalogPage, getCatalogProducts } from "../../services/catalog.service";
import { failure } from "../../utils/httpUtils";
import { catalogueVersionFor } from "../../services/catalogIntelligence.service";

const queryRequestSchema = z.object({
  operation: z.literal(CatalogOperations.QueryProducts),
  plan: queryPlanSchema,
  excludedProductIds: z.array(z.string().max(100)).max(100).default([]),
});

const listRequestSchema = z.object({
  operation: z.literal(CatalogOperations.ListProducts),
  cursor: z.string().min(1).max(100).nullable().optional(),
  limit: z.number().int().min(1).max(24).default(24),
});

const replaceRequestSchema = z.object({
  operation: z.literal(CatalogOperations.ReplaceBundleProduct),
  plan: queryPlanSchema,
  currentProductIds: z.array(z.string().min(1).max(100)).min(2).max(10),
  targetProductId: z.string().min(1).max(100),
}).superRefine((value, context) => {
  if (new Set(value.currentProductIds).size !== value.currentProductIds.length) context.addIssue({ code: "custom", path: ["currentProductIds"], message: "Bundle product IDs must be unique." });
  if (!value.currentProductIds.includes(value.targetProductId)) context.addIssue({ code: "custom", path: ["targetProductId"], message: "The target must belong to the current bundle." });
});

export const listProducts = async (body: unknown): Promise<ApiRouteResult<CatalogListData>> => {
  const parsed = listRequestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "A valid catalogue page request is required.");
  const page = await getCatalogPage(parsed.data.cursor, parsed.data.limit);
  if (!page) return failure(422, "A valid catalogue page cursor is required.");
  return {
    status: 200,
    data: {
      products: page.products,
      facets: buildFacets(page.products),
      catalogueVersion: catalogueVersionFor(page.products),
      total: page.total,
      nextCursor: page.nextCursor,
    },
  };
};

export const queryProducts = async (body: unknown): Promise<ApiRouteResult<CatalogQueryData>> => {
  const parsed = queryRequestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "A valid catalogue query plan is required.");
  const products = await getCatalogProducts();
  return { status: 200, data: executeCatalogQuery(products, parsed.data.plan, parsed.data.excludedProductIds) };
};

export const replaceBundleProduct = async (body: unknown): Promise<ApiRouteResult<CatalogQueryData>> => {
  const parsed = replaceRequestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "A valid targeted bundle replacement is required.");
  const products = await getCatalogProducts();
  const result = replaceCatalogBundleProduct(products, parsed.data.plan, parsed.data.currentProductIds, parsed.data.targetProductId);
  return result ? { status: 200, data: result } : failure(404, "No suitable replacement could be found.");
};
