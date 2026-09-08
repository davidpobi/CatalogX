import { NextRequest } from "next/server";
import { identifyClient, consumeRateLimit, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, withRouteBoundary } from "../../utils/http";
import { handleTranscription } from "./audio";

const post = async (request: NextRequest, requestId: string) => {
  if (Number(request.headers.get("content-length") || 0) > 12_500_000) return jsonResult(requestId, failure(413, "The recording is too large."));
  const rate = await consumeRateLimit(`audio:${identifyClient(request)}`, 10, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Voice search limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonResult(requestId, failure(422, "A valid audio form is required.")); }
  const result = await handleTranscription(form);
  return jsonResult(requestId, { ...result, headers: rateLimitHeaders(rate) });
};

export const POST = withRouteBoundary("audio", post);
