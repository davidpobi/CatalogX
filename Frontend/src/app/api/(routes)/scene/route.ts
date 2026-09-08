import { NextRequest } from "next/server";
import { SceneOperations } from "@/interfaces/scene";
import { identifyClient, consumeRateLimit, rateLimitHeaders } from "../../services/rateLimit.service";
import { hasTrustedOrigin } from "../../utils/authUtils";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import { analyzeScene, generateScene, getSceneGeneration } from "./scene";

const post = async (request: NextRequest, requestId: string) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
    if (Number(request.headers.get("content-length") || 0) > 10_500_000) return jsonResult(requestId, failure(413, "The room image is too large."));
    const rate = await consumeRateLimit(`scene:analyze:${identifyClient(request)}`, 10, 10 * 60_000);
    if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Room analysis limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
    let form: FormData; try { form = await request.formData(); } catch { return jsonResult(requestId, failure(422, "A valid room image form is required.")); }
    if (form.get("operation") !== SceneOperations.AnalyzeScene) return jsonResult(requestId, failure(400, "Invalid scene operation."));
    return jsonResult(requestId, { ...(await analyzeScene(form)), headers: rateLimitHeaders(rate) });
  }
  const body = await readBoundedJson(request, 32_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid bounded JSON request is required."));
  if (body.operation === SceneOperations.GetSceneGeneration) {
    const rate = await consumeRateLimit(`scene:status:${identifyClient(request)}`, 60, 10 * 60_000);
    if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Visualization status limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
    return jsonResult(requestId, { ...(await getSceneGeneration(body)), headers: rateLimitHeaders(rate) });
  }
  if (body.operation !== SceneOperations.GenerateScene) return jsonResult(requestId, failure(400, "Invalid scene operation."));
  if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
  const rate = await consumeRateLimit(`scene:generate:${identifyClient(request)}`, 5, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Visualization limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
  return jsonResult(requestId, { ...(await generateScene(body)), headers: rateLimitHeaders(rate) });
};
export const POST = withRouteBoundary("scene", post);
