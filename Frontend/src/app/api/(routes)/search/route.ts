import { NextRequest } from "next/server";
import { SearchOperations } from "@/interfaces/search";
import { identifyClient, consumeRateLimit, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/http";
import { compileSearch } from "./search";

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 16_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid bounded JSON request is required."));
  if (body.operation !== SearchOperations.CompileQuery) return jsonResult(requestId, failure(400, "Invalid operation."));
  const rate = await consumeRateLimit(`search:${identifyClient(request)}`, 20, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Search limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
  const result = await compileSearch(body);
  return jsonResult(requestId, { ...result, headers: rateLimitHeaders(rate) });
};

export const POST = withRouteBoundary("search", post);
