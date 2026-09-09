import { NextRequest } from "next/server";
import { CatalogOperations } from "@/interfaces/catalog";
import { jsonResult, failure, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import * as catalog from "./catalog";

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 64_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid bounded JSON request is required."));
  const operation = body.operation;
  if (!Object.values(CatalogOperations).includes(operation as CatalogOperations)) return jsonResult(requestId, failure(400, "Invalid operation."));
  const typedOperation = operation as CatalogOperations;
  switch (typedOperation) {
    case CatalogOperations.ListProducts:
      return jsonResult(requestId, await catalog.listProducts(body));
    case CatalogOperations.QueryProducts:
      return jsonResult(requestId, await catalog.queryProducts(body));
    case CatalogOperations.ReplaceBundleProduct:
      return jsonResult(requestId, await catalog.replaceBundleProduct(body));
    default:
      return jsonResult(requestId, failure(400, "Invalid operation."));
  }
};

export const POST = withRouteBoundary("catalog", post);
