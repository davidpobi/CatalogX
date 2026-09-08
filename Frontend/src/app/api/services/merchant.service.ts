import "server-only";
import type { MerchantApplication, MerchantListing, MerchantListingDraft, MerchantProfile } from "@/interfaces/merchant";
import { getAdminBucket } from "@/app/api/config/firebaseAdmin";
import { getFirestore } from "../utils/firestoreUtils";
import { clearCatalogCache } from "./catalog.service";

const now = () => new Date().toISOString();
const emptyDraft = (): MerchantListingDraft => ({ name: "", description: "", category: "seating", productType: "lounge-chair", currentPrice: 1, originalPrice: 1, inventory: 0, deliveryDays: 5, rooms: ["Living Room"], styles: ["Modern"], colors: ["Neutral"], materials: ["Wood"], features: ["Home décor"], width: 1, height: 1, depth: 1, imageStoragePath: "" });

const getApplication = async (uid: string) => { const doc = await getFirestore().collection("merchantApplications").doc(uid).get(); return doc.exists ? doc.data() as MerchantApplication : null; };
const saveApplication = async (uid: string, application: MerchantApplication) => { await getFirestore().collection("merchantApplications").doc(uid).set(application); return application; };
const getProfile = async (uid: string) => { const doc = await getFirestore().collection("merchants").doc(uid).get(); return doc.exists ? doc.data() as MerchantProfile : null; };
const listListings = async (uid: string) => { const snapshot = await getFirestore().collection("merchantListings").where("merchantId", "==", uid).get(); return snapshot.docs.map((doc) => doc.data() as MerchantListing).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); };
const getListing = async (uid: string, listingId: string) => { const doc = await getFirestore().collection("merchantListings").doc(listingId).get(); const listing = doc.exists ? doc.data() as MerchantListing : null; return listing?.merchantId === uid ? listing : null; };
const saveListing = async (listing: MerchantListing) => { const db = getFirestore(); const batch = db.batch(); batch.set(db.collection("merchantListings").doc(listing.id), listing); batch.set(db.collection("merchantListings").doc(listing.id).collection("versions").doc(listing.draftVersion.id), listing.draftVersion); await batch.commit(); return listing; };

const assertOwnedImage = async (uid: string, draft: MerchantListingDraft) => {
  if (!draft.imageStoragePath.startsWith(`projects/CatalogX/merchant-assets/${uid}/`)) throw new Error("Use an image uploaded from this merchant workspace.");
  const [exists] = await getAdminBucket().file(draft.imageStoragePath).exists();
  if (!exists) throw new Error("The uploaded product image is no longer available.");
};

export const getMerchantApplication = (uid: string) => getApplication(uid);
export const getMerchantProfile = (uid: string) => getProfile(uid);
export const listOwnListings = (uid: string) => listListings(uid);
export const getOwnListing = (uid: string, listingId: string) => getListing(uid, listingId);

export const saveMerchantApplication = async (uid: string, input: Omit<MerchantApplication, "uid" | "status" | "rejectionReason" | "submittedAt" | "updatedAt">) => {
  const existing = await getApplication(uid);
  if (existing?.status === "pending" || existing?.status === "approved") throw new Error("This application cannot currently be edited.");
  return saveApplication(uid, { uid, ...input, status: "draft", rejectionReason: null, submittedAt: null, updatedAt: now() });
};

export const submitMerchantApplication = async (uid: string) => {
  const application = await getApplication(uid);
  if (!application || application.status === "pending" || application.status === "approved") throw new Error("A completed editable application is required.");
  return saveApplication(uid, { ...application, status: "pending", submittedAt: now(), updatedAt: now(), rejectionReason: null });
};

export const createMerchantListing = async (uid: string, draft?: MerchantListingDraft) => {
  if ((await getProfile(uid))?.status !== "approved") throw new Error("Approved merchant access is required.");
  if (draft) await assertOwnedImage(uid, draft);
  const id = crypto.randomUUID();
  const timestamp = now();
  const version = { id: crypto.randomUUID(), listingId: id, merchantId: uid, version: 1, status: "draft" as const, draft: draft ?? emptyDraft(), submittedAt: null, reviewedAt: null, reviewReason: null };
  return saveListing({ id, merchantId: uid, status: "draft", activeVersionId: null, pendingVersionId: null, draftVersion: version, publicProductId: null, createdAt: timestamp, updatedAt: timestamp });
};

export const updateMerchantListing = async (uid: string, listingId: string, draft: MerchantListingDraft) => {
  await assertOwnedImage(uid, draft);
  const listing = await getListing(uid, listingId);
  if (!listing || listing.status === "pending" || listing.status === "archived") throw new Error("An editable listing is required.");
  const createsRevision = listing.draftVersion.status === "approved" || listing.draftVersion.status === "rejected";
  const version = createsRevision
    ? { ...listing.draftVersion, id: crypto.randomUUID(), version: listing.draftVersion.version + 1, status: "draft" as const, submittedAt: null, reviewedAt: null, reviewReason: null, draft }
    : { ...listing.draftVersion, status: "draft" as const, reviewReason: null, draft };
  return saveListing({ ...listing, status: listing.status === "unpublished" ? "unpublished" : listing.activeVersionId ? "approved" : "draft", draftVersion: version, pendingVersionId: null, updatedAt: now() });
};

export const submitMerchantListing = async (uid: string, listingId: string) => {
  const listing = await getListing(uid, listingId);
  if (!listing || listing.draftVersion.status !== "draft") throw new Error("A valid draft listing is required.");
  const version = { ...listing.draftVersion, status: "pending" as const, submittedAt: now() };
  return saveListing({ ...listing, status: listing.status === "unpublished" ? "unpublished" : listing.activeVersionId ? "approved" : "pending", pendingVersionId: version.id, draftVersion: version, updatedAt: now() });
};

export const archiveMerchantListing = async (uid: string, listingId: string) => {
  const db = getFirestore();
  const archived = await db.runTransaction(async (transaction) => {
    const listingRef = db.collection("merchantListings").doc(listingId);
    const snapshot = await transaction.get(listingRef);
    if (!snapshot.exists || snapshot.get("merchantId") !== uid) throw new Error("Listing not found.");
    const listing = snapshot.data() as import("@/interfaces/merchant").MerchantListing;
    const next = { ...listing, status: "archived" as const, pendingVersionId: null, updatedAt: now() };
    transaction.set(listingRef, next);
    if (listing.publicProductId) transaction.delete(db.collection("projects").doc("CatalogX").collection("listings").doc(listing.publicProductId));
    return next;
  });
  clearCatalogCache();
  return archived;
};
