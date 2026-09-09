import { NextRequest } from "next/server";
import { AuthOperations } from "@/interfaces/auth";
import { SESSION_COOKIE, SESSION_DURATION_MS } from "../../services/auth.service";
import { hasTrustedOrigin } from "../../utils/authUtils";
import { consumeRateLimit, identifyClient, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import * as auth from "./auth";

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 16_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid authentication request is required."));
  const operation = body.operation as AuthOperations;
  const isSessionRead = operation === AuthOperations.GetSession;
  if (isSessionRead) return jsonResult(requestId, await auth.getAuthSession(request.cookies.get(SESSION_COOKIE)?.value));
  if (!isSessionRead && !hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
  const rate = await consumeRateLimit(`auth:${identifyClient(request)}`, 30, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Authentication request limit reached."), headers: rateLimitHeaders(rate) });
  if (operation === AuthOperations.CreateSession) {
    const created = await auth.createAuthSession(body);
    if (!created) return jsonResult(requestId, failure(422, "A valid Firebase ID token is required."));
    const response = jsonResult(requestId, { status: 200, data: created.session });
    response.cookies.set(SESSION_COOKIE, created.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DURATION_MS / 1000 });
    return response;
  }
  if (operation === AuthOperations.RevokeSession) {
    await auth.revokeAuthSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = jsonResult(requestId, { status: 200, data: { revoked: true } });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }
  return jsonResult(requestId, failure(400, "Invalid authentication operation."));
};
export const POST = withRouteBoundary("auth", post);
