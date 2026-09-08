import "server-only";
import sharp from "sharp";
import type { ListingImageData } from "@/interfaces/merchant";
import { getAdminBucket } from "@/app/api/config/firebaseAdmin";
import { getFirestore } from "../utils/firestoreUtils";

export const uploadListingImage = async (uid: string, file: File): Promise<ListingImageData> => {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 10_000_000) throw new Error("Use a JPEG, PNG, or WebP image up to 10 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000) throw new Error("The image dimensions are not supported.");
  const output = await sharp(input).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const bucket = getAdminBucket();
  const storagePath = `projects/CatalogX/merchant-assets/${uid}/${crypto.randomUUID()}.jpg`;
  await bucket.file(storagePath).save(output, { contentType: "image/jpeg", metadata: { cacheControl: "private,no-store" } });
  return { storagePath };
};

export const getPublicListingImageUrl = async (productId: string): Promise<string | null> => {
  const product = await getFirestore().collection("projects").doc("CatalogX").collection("listings").doc(productId).get();
  const storagePath = product.exists ? product.get("image.storagePath") : null;
  if (typeof storagePath !== "string" || !storagePath.startsWith("projects/CatalogX/merchant-assets/")) return null;
  const [url] = await getAdminBucket().file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60_000 });
  return url;
};
