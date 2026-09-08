import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import type { MerchantDashboardData, MerchantListing } from "@/interfaces/merchant";
import { MerchantOperations } from "@/interfaces/merchant";
import { idSchema, merchantApplicationInputSchema, merchantListingDraftSchema } from "../../validations/marketplace";
import { archiveMerchantListing, createMerchantListing, getMerchantApplication, getMerchantProfile, getOwnListing, listOwnListings, saveMerchantApplication, submitMerchantApplication, submitMerchantListing, updateMerchantListing } from "../../services/merchant.service";
import { failure } from "../../utils/httpUtils";
import { uploadListingImage } from "../../services/listingImage.service";

const listingIdSchema = z.object({ listingId: idSchema });
const dashboard = async (uid: string): Promise<MerchantDashboardData> => ({ application: await getMerchantApplication(uid), profile: await getMerchantProfile(uid), listings: await listOwnListings(uid) });
const safe = async <T>(action: () => Promise<T>): Promise<ApiRouteResult<T>> => { try { return { status: 200, data: await action() }; } catch { return failure(422, "Merchant request could not be completed."); } };

export const handleMerchantOperation = (operation: MerchantOperations, uid: string, body: Record<string, unknown>): Promise<ApiRouteResult<MerchantDashboardData | MerchantListing | null>> => {
  switch (operation) {
    case MerchantOperations.GetApplication:
    case MerchantOperations.GetMerchantProfile:
    case MerchantOperations.ListOwnListings: return safe(() => dashboard(uid));
    case MerchantOperations.SaveApplication: { const parsed = merchantApplicationInputSchema.safeParse(body.application); return parsed.success ? safe(async () => { await saveMerchantApplication(uid, parsed.data); return dashboard(uid); }) : Promise.resolve(failure(422, "A complete merchant application is required.")); }
    case MerchantOperations.SubmitApplication: return safe(async () => { await submitMerchantApplication(uid); return dashboard(uid); });
    case MerchantOperations.CreateListing: { const parsed = merchantListingDraftSchema.safeParse(body.draft); return parsed.success ? safe(() => createMerchantListing(uid, parsed.data)) : Promise.resolve(failure(422, "A valid home décor listing is required.")); }
    case MerchantOperations.GetOwnListing: { const parsed = listingIdSchema.safeParse(body); return parsed.success ? safe(() => getOwnListing(uid, parsed.data.listingId)) : Promise.resolve(failure(422, "A valid listing is required.")); }
    case MerchantOperations.UpdateListingDraft: { const parsed = listingIdSchema.extend({ draft: merchantListingDraftSchema }).safeParse(body); return parsed.success ? safe(() => updateMerchantListing(uid, parsed.data.listingId, parsed.data.draft)) : Promise.resolve(failure(422, "A valid listing draft is required.")); }
    case MerchantOperations.SubmitListing: { const parsed = listingIdSchema.safeParse(body); return parsed.success ? safe(() => submitMerchantListing(uid, parsed.data.listingId)) : Promise.resolve(failure(422, "A valid listing is required.")); }
    case MerchantOperations.ArchiveListing: { const parsed = listingIdSchema.safeParse(body); return parsed.success ? safe(() => archiveMerchantListing(uid, parsed.data.listingId)) : Promise.resolve(failure(422, "A valid listing is required.")); }
    default: return Promise.resolve(failure(400, "Invalid merchant operation."));
  }
};

export const handleListingImageUpload = async (uid: string, form: FormData) => {
  const file = form.get("image");
  if (!(file instanceof File)) return failure(422, "A product image is required.");
  try { return { status: 200, data: await uploadListingImage(uid, file) }; }
  catch { return failure(422, "The image could not be uploaded."); }
};
