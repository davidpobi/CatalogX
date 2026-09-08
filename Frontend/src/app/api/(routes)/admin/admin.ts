import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import type { AdminDashboardData } from "@/interfaces/admin";
import { AdminOperations } from "@/interfaces/admin";
import { idSchema, reviewSchema } from "../../validations/marketplace";
import { getListingForReview, listMerchantApplications, listPendingMerchantListings, reviewMerchantApplication, reviewMerchantListing, unpublishMerchantListing } from "../../services/admin.service";
import { failure } from "../../utils/httpUtils";

const target = z.object({ targetId: idSchema });
const review = target.extend({ review: reviewSchema });
const dashboard = async (): Promise<AdminDashboardData> => ({ applications: await listMerchantApplications(), listings: await listPendingMerchantListings() });
const safe = async <T>(action: () => Promise<T>): Promise<ApiRouteResult<T>> => { try { return { status: 200, data: await action() }; } catch { return failure(422, "Admin request could not be completed."); } };

export const handleAdminOperation = (operation: AdminOperations, adminId: string, body: Record<string, unknown>) => {
  switch (operation) {
    case AdminOperations.ListMerchantApplications:
    case AdminOperations.ListPendingListings: return safe(() => dashboard());
    case AdminOperations.GetListingReview: { const parsed = target.safeParse(body); return parsed.success ? safe(() => getListingForReview(parsed.data.targetId)) : Promise.resolve(failure(422, "A valid listing is required.")); }
    case AdminOperations.ReviewMerchantApplication: { const parsed = review.safeParse(body); return parsed.success ? safe(async () => { await reviewMerchantApplication(adminId, parsed.data.targetId, parsed.data.review.decision, parsed.data.review.reason); return dashboard(); }) : Promise.resolve(failure(422, "A valid merchant decision is required.")); }
    case AdminOperations.ReviewListing: { const parsed = review.safeParse(body); return parsed.success ? safe(async () => { await reviewMerchantListing(adminId, parsed.data.targetId, parsed.data.review.decision, parsed.data.review.reason); return dashboard(); }) : Promise.resolve(failure(422, "A valid listing decision is required.")); }
    case AdminOperations.UnpublishListing: { const parsed = target.extend({ reason: z.string().max(500).nullable().default(null) }).safeParse(body); return parsed.success ? safe(async () => { await unpublishMerchantListing(adminId, parsed.data.targetId, parsed.data.reason); return dashboard(); }) : Promise.resolve(failure(422, "A valid listing is required.")); }
    default: return Promise.resolve(failure(400, "Invalid admin operation."));
  }
};
