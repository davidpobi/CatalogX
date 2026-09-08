import { NextRequest } from "next/server";
import { MerchantOperations } from "@/interfaces/merchant";
import { can, hasTrustedOrigin, isGoogleSession, sessionFromRequest } from "../../utils/authUtils";
import { consumeRateLimit, identifyClient, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/httpUtils";
import { handleListingImageUpload, handleMerchantOperation } from "./merchant";

const applicantOperations = new Set([MerchantOperations.GetApplication, MerchantOperations.SaveApplication, MerchantOperations.SubmitApplication, MerchantOperations.GetMerchantProfile]);
const post = async (request: NextRequest, requestId: string) => {
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
    if (Number(request.headers.get("content-length") || 0) > 10_500_000) return jsonResult(requestId, failure(413, "The product image is too large."));
    const session = await sessionFromRequest(request);
    if (!isGoogleSession(session) || !can(session, "merchant")) return jsonResult(requestId, failure(403, "Approved Google merchant access is required."));
    const rate = await consumeRateLimit(`merchant-upload:${session!.user.uid}:${identifyClient(request)}`, 24, 10 * 60_000);
    if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Product image upload limit reached."), headers: rateLimitHeaders(rate) });
    let form: FormData; try { form = await request.formData(); } catch { return jsonResult(requestId, failure(422, "A valid image upload is required.")); }
    if (form.get("operation") !== MerchantOperations.UploadListingImage) return jsonResult(requestId, failure(400, "Invalid merchant operation."));
    return jsonResult(requestId, await handleListingImageUpload(session!.user.uid, form));
  }
  const body = await readBoundedJson(request, 64_000);
  if (!body || !Object.values(MerchantOperations).includes(body.operation as MerchantOperations)) return jsonResult(requestId, failure(400, "Invalid merchant operation."));
  if (!hasTrustedOrigin(request)) return jsonResult(requestId, failure(403, "Request origin is not allowed."));
  const session = await sessionFromRequest(request);
  if (!session || !isGoogleSession(session)) return jsonResult(requestId, failure(403, "Google merchant access is required."));
  const operation = body.operation as MerchantOperations;
  if (!applicantOperations.has(operation) && !can(session, "merchant")) return jsonResult(requestId, failure(403, "Approved merchant access is required."));
  const rate = await consumeRateLimit(`merchant:${session.user.uid}:${identifyClient(request)}`, 90, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Merchant request limit reached."), headers: rateLimitHeaders(rate) });
  return jsonResult(requestId, await handleMerchantOperation(operation, session.user.uid, body));
};
export const POST = withRouteBoundary("merchant", post);
