import { NextRequest } from "next/server";
import { CatalogOperations } from "@/interfaces/catalog";
import { identifyClient, consumeRateLimit, rateLimitHeaders } from "../../services/rateLimit.service";
import { jsonResult, failure, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import * as catalog from "./catalog";

const CATALOG_RATE_LIMITS: Record<CatalogOperations, { limit: number; windowMs: number }> = {
  [CatalogOperations.ListProducts]: { limit: 120, windowMs: 10 * 60_000 },
  [CatalogOperations.QueryProducts]: { limit: 60, windowMs: 10 * 60_000 },
  [CatalogOperations.ReplaceBundleProduct]: { limit: 30, windowMs: 10 * 60_000 },
};

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 64_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid bounded JSON request is required."));
  const operation = body.operation;
  if (!Object.values(CatalogOperations).includes(operation as CatalogOperations)) return jsonResult(requestId, failure(400, "Invalid operation."));
  const typedOperation = operation as CatalogOperations;
  const limit = CATALOG_RATE_LIMITS[typedOperation];
  const rate = await consumeRateLimit(`catalog:${typedOperation}:${identifyClient(request)}`, limit.limit, limit.windowMs);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Catalogue limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
  switch (typedOperation) {
    case CatalogOperations.ListProducts:
      return jsonResult(requestId, await catalog.listProducts());
    case CatalogOperations.QueryProducts:
      return jsonResult(requestId, await catalog.queryProducts(body));
    case CatalogOperations.ReplaceBundleProduct:
      return jsonResult(requestId, await catalog.replaceBundleProduct(body));
    default:
      return jsonResult(requestId, failure(400, "Invalid operation."));
  }
};

export const POST = withRouteBoundary("catalog", post);
