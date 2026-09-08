import { NextRequest } from "next/server";
import { CustomerOperations } from "@/interfaces/customer";
import type { ApiRouteResult } from "@/interfaces/api";
import { isGoogleSession, sessionFromRequest, hasTrustedOrigin } from "../../utils/authUtils";
import { consumeRateLimit, identifyClient, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import { handleCustomerOperation } from "./customer";

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 32_000);
  if (!body || !Object.values(CustomerOperations).includes(body.operation as CustomerOperations)) return jsonResult(requestId, failure(400, "Invalid customer operation."));
  if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
  const session = await sessionFromRequest(request);
  if (!session || !isGoogleSession(session)) return jsonResult(requestId, failure(403, "Google customer access is required."));
  const rate = await consumeRateLimit(`customer:${session.user.uid}:${identifyClient(request)}`, 120, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Customer request limit reached."), headers: rateLimitHeaders(rate) });
  return jsonResult<unknown>(requestId, await handleCustomerOperation(body.operation as CustomerOperations, session.user.uid, body) as ApiRouteResult<unknown>);
};
export const POST = withRouteBoundary("customer", post);
