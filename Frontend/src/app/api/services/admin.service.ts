import "server-only";
import { createHash } from "node:crypto";
import type { Product } from "@/interfaces/catalog";
import type { MerchantApplication, MerchantListing, MerchantProfile } from "@/interfaces/merchant";
import { getFirestore } from "../utils/firestoreUtils";
import { productSchema } from "@/utils/catalogSchema";
import { catalogOrigin } from "@/utils/catalogUrl";
import { clearCatalogCache } from "./catalog.service";

const now = () => new Date().toISOString();
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const audit = (adminId: string, targetType: "merchant" | "listing", targetId: string, action: string, decision: string, reason: string | null) => ({ id: crypto.randomUUID(), adminId, targetType, targetId, action, decision, reason, createdAt: now() });

export const listMerchantApplications = async () => {
  const snapshot = await getFirestore().collection("merchantApplications").get();
  return snapshot.docs.map((doc) => doc.data() as MerchantApplication).filter((item) => item.status === "pending");
};

export const reviewMerchantApplication = async (adminId: string, uid: string, decision: "approve" | "reject", reason: string | null) => {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const applicationRef = db.collection("merchantApplications").doc(uid);
    const applicationDoc = await transaction.get(applicationRef);
    if (!applicationDoc.exists || applicationDoc.get("status") !== "pending") throw new Error("A pending merchant application is required.");
    const application = applicationDoc.data() as MerchantApplication;
    const reviewed: MerchantApplication = { ...application, status: decision === "approve" ? "approved" : "rejected", rejectionReason: decision === "reject" ? reason : null, updatedAt: now() };
    transaction.set(applicationRef, reviewed);
    if (decision === "approve") {
      const profile: MerchantProfile = { uid, brandName: application.brandName, contactEmail: application.contactEmail, website: application.website, country: application.country, status: "approved", approvedAt: now() };
      transaction.set(db.collection("merchants").doc(uid), profile);
    }
    const event = audit(adminId, "merchant", uid, "merchant.reviewed", decision, reason);
    transaction.set(db.collection("adminAuditEvents").doc(event.id), event);
    return reviewed;
  });
};

export const listPendingMerchantListings = async () => {
  const snapshot = await getFirestore().collection("merchantListings").get();
  return snapshot.docs.map((doc) => doc.data() as MerchantListing).filter((listing) => Boolean(listing.pendingVersionId) || listing.status === "approved");
};

export const getListingForReview = async (listingId: string) => {
  const doc = await getFirestore().collection("merchantListings").doc(listingId).get();
  return doc.exists ? doc.data() as MerchantListing : null;
};

const productImageUrl = (productId: string) => `${catalogOrigin()}/api/product-image?productId=${encodeURIComponent(productId)}`;

const projectProduct = (listing: MerchantListing, merchant: MerchantProfile): Product => {
  const draft = listing.draftVersion.draft;
  const discountPercent = Math.round((1 - draft.currentPrice / draft.originalPrice) * 100);
  const id = listing.publicProductId ?? `merchant-${listing.id.toLowerCase()}`;
  const raw = {
    id,
    slug: `${slugify(draft.name)}-${listing.id.slice(0, 8).toLowerCase()}`,
    sourceHash: createHash("sha256").update(JSON.stringify(draft)).digest("hex"),
    source: "merchant" as const,
    merchantId: listing.merchantId,
    retailer: merchant.brandName,
    name: draft.name,
    description: draft.description,
    category: draft.category,
    productType: draft.productType,
    currentPrice: draft.currentPrice,
    originalPrice: draft.originalPrice,
    discountPercent,
    inventory: draft.inventory,
    availability: draft.inventory > 10 ? "in_stock" as const : draft.inventory > 0 ? "low_stock" as const : "out_of_stock" as const,
    deliveryDays: draft.deliveryDays,
    rooms: draft.rooms,
    styles: draft.styles,
    colors: draft.colors,
    materials: draft.materials,
    useCases: draft.rooms,
    features: draft.features,
    tags: [...new Set([...draft.styles, ...draft.materials, ...draft.features])],
    dimensions: { width: draft.width, height: draft.height, depth: draft.depth, unit: "in" as const },
    rating: 0,
    reviewCount: 0,
    image: { status: "final" as const, placeholderCategory: draft.category, heroUrl: productImageUrl(id), storagePath: draft.imageStoragePath, alt: `${draft.name} by ${merchant.brandName}` },
  };
  return productSchema.parse(raw) as Product;
};

export const reviewMerchantListing = async (adminId: string, listingId: string, decision: "approve" | "reject", reason: string | null) => {
  const db = getFirestore();
  const result = await db.runTransaction(async (transaction) => {
    const listingRef = db.collection("merchantListings").doc(listingId);
    const listingDoc = await transaction.get(listingRef);
    if (!listingDoc.exists) throw new Error("Listing not found.");
    const listing = listingDoc.data() as MerchantListing;
    if (!listing.pendingVersionId || listing.draftVersion.status !== "pending") throw new Error("A pending listing version is required.");
    const merchantDoc = await transaction.get(db.collection("merchants").doc(listing.merchantId));
    if (!merchantDoc.exists || merchantDoc.get("status") !== "approved") throw new Error("The merchant is not approved.");
    const reviewedAt = now();
    const version = { ...listing.draftVersion, status: decision === "approve" ? "approved" as const : "rejected" as const, reviewedAt, reviewReason: reason };
    const next: MerchantListing = decision === "approve"
      ? { ...listing, status: "approved", activeVersionId: version.id, pendingVersionId: null, publicProductId: listing.publicProductId ?? `merchant-${listing.id.toLowerCase()}`, draftVersion: version, updatedAt: reviewedAt }
      : { ...listing, status: listing.activeVersionId ? "approved" : "rejected", pendingVersionId: null, draftVersion: version, updatedAt: reviewedAt };
    transaction.set(listingRef, next);
    transaction.set(listingRef.collection("versions").doc(version.id), version);
    if (decision === "approve") transaction.set(db.collection("projects").doc("CatalogX").collection("listings").doc(next.publicProductId!), projectProduct(next, merchantDoc.data() as MerchantProfile));
    const event = audit(adminId, "listing", listingId, "listing.reviewed", decision, reason);
    transaction.set(db.collection("adminAuditEvents").doc(event.id), event);
    return next;
  });
  clearCatalogCache();
  return result;
};

export const unpublishMerchantListing = async (adminId: string, listingId: string, reason: string | null) => {
  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const ref = db.collection("merchantListings").doc(listingId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new Error("Listing not found.");
    const listing = doc.data() as MerchantListing;
    transaction.set(ref, { ...listing, status: "unpublished", updatedAt: now() });
    if (listing.publicProductId) transaction.delete(db.collection("projects").doc("CatalogX").collection("listings").doc(listing.publicProductId));
    const event = audit(adminId, "listing", listingId, "listing.unpublished", "unpublish", reason);
    transaction.set(db.collection("adminAuditEvents").doc(event.id), event);
  });
  clearCatalogCache();
};
