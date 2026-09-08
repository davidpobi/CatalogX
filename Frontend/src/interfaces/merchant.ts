import type { CategoryId, Product, ProductType } from "./catalog";

export type MerchantApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "archived" | "unpublished";

export interface MerchantApplication {
  uid: string;
  brandName: string;
  contactEmail: string;
  website: string;
  country: string;
  catalogueDescription: string;
  status: MerchantApprovalStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface MerchantProfile {
  uid: string;
  brandName: string;
  contactEmail: string;
  website: string;
  country: string;
  status: "approved" | "suspended";
  approvedAt: string;
}

export interface MerchantListingDraft {
  name: string;
  description: string;
  category: CategoryId;
  productType: ProductType;
  currentPrice: number;
  originalPrice: number;
  inventory: number;
  deliveryDays: number;
  rooms: string[];
  styles: string[];
  colors: string[];
  materials: string[];
  features: string[];
  width: number;
  height: number;
  depth: number;
  /** A server-owned Firebase Storage object. Never accept arbitrary remote URLs. */
  imageStoragePath: string;
}

export interface ListingVersion {
  id: string;
  listingId: string;
  merchantId: string;
  version: number;
  status: ListingStatus;
  draft: MerchantListingDraft;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
}

export interface MerchantListing {
  id: string;
  merchantId: string;
  status: ListingStatus;
  activeVersionId: string | null;
  pendingVersionId: string | null;
  draftVersion: ListingVersion;
  publicProductId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ListingReviewDecision = "approve" | "reject";

export enum MerchantOperations {
  GetApplication = "getApplication",
  SaveApplication = "saveApplication",
  SubmitApplication = "submitApplication",
  GetMerchantProfile = "getMerchantProfile",
  ListOwnListings = "listOwnListings",
  GetOwnListing = "getOwnListing",
  CreateListing = "createListing",
  UpdateListingDraft = "updateListingDraft",
  SubmitListing = "submitListing",
  ArchiveListing = "archiveListing",
  UploadListingImage = "uploadListingImage",
}

export interface ListingImageData { storagePath: string; }

export interface MerchantDashboardData {
  application: MerchantApplication | null;
  profile: MerchantProfile | null;
  listings: MerchantListing[];
}

export interface ApprovedProductProjection {
  product: Product;
  listingId: string;
  versionId: string;
}
