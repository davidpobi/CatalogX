import { NextRequest } from "next/server";
import { AdminOperations } from "@/interfaces/admin";
import type { AdminDashboardData } from "@/interfaces/admin";
import type { MerchantListing } from "@/interfaces/merchant";
import { hasTrustedOrigin, isPasswordAdminSession, sessionFromRequest } from "../../utils/authUtils";
import { consumeRateLimit, identifyClient, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import { handleAdminOperation } from "./admin";

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 64_000);
  if (!body || !Object.values(AdminOperations).includes(body.operation as AdminOperations)) return jsonResult(requestId, failure(400, "Invalid admin operation."));
  if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
  const session = await sessionFromRequest(request);
  if (!isPasswordAdminSession(session)) return jsonResult(requestId, failure(403, "Admin access is required."));
  const rate = await consumeRateLimit(`admin:${session!.user.uid}:${identifyClient(request)}`, 120, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Admin request limit reached."), headers: rateLimitHeaders(rate) });
  return jsonResult<AdminDashboardData | MerchantListing | null>(requestId, await handleAdminOperation(body.operation as AdminOperations, session!.user.uid, body));
};
export const POST = withRouteBoundary("admin", post);
