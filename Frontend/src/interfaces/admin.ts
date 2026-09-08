import type { MerchantApplication, MerchantListing } from "./merchant";

export enum AdminOperations {
  ListMerchantApplications = "listMerchantApplications",
  ReviewMerchantApplication = "reviewMerchantApplication",
  ListPendingListings = "listPendingListings",
  GetListingReview = "getListingReview",
  ReviewListing = "reviewListing",
  UnpublishListing = "unpublishListing",
}

export interface AdminProfile { uid: string; email: string; enabled: boolean; }
export interface AdminAuditEvent {
  id: string;
  adminId: string;
  action: string;
  targetType: "merchant" | "listing";
  targetId: string;
  decision: string;
  reason: string | null;
  createdAt: string;
}

export interface AdminDashboardData {
  applications: MerchantApplication[];
  listings: MerchantListing[];
}

export interface AdminState extends AdminDashboardData {
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
