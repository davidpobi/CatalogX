import "server-only";
import type { Product } from "@/interfaces/catalog";
import { productSchema } from "@/utils/catalogSchema";
import {
  CATALOGX_PRODUCTS_SUBCOLLECTION,
  CATALOGX_PROJECT_DOCUMENT,
  CATALOGX_PROJECTS_COLLECTION,
} from "@/utils/catalogPersistence";

const firestore = async () => (await import("../utils/firestoreUtils")).getFirestore();

const parseProducts = (documents: Array<{ id: string; data: () => FirebaseFirestore.DocumentData }>, source: "platform" | "merchant") =>
  documents.flatMap((document) => {
    const parsed = productSchema.safeParse(document.data());
    if (parsed.success) return [parsed.data as Product];
    console.error("[catalog] invalid_product_ignored", {
      documentId: document.id,
      source,
      issues: parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path.join("."), code: issue.code })),
    });
    return [];
  });

const listFirestoreCatalog = async (): Promise<Product[]> => {
  const project = (await firestore()).collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT);
  const [platform, merchant] = await Promise.all([
    project.collection(CATALOGX_PRODUCTS_SUBCOLLECTION).get(),
    project.collection("listings").get(),
  ]);
  const platformProducts = parseProducts(platform.docs, "platform");
  const merchantProducts = parseProducts(merchant.docs, "merchant");
  if (!platformProducts.length) throw new Error("The Firestore platform catalogue contains no valid products.");
  return [...platformProducts, ...merchantProducts];
};

let cache: { expiresAt: number; products: Product[] } | null = null;

export const getCatalogProducts = async (): Promise<Product[]> => {
  if (cache && cache.expiresAt > Date.now()) return cache.products;
  const products = await listFirestoreCatalog();
  cache = { products, expiresAt: Date.now() + 60_000 };
  return products;
};

export const clearCatalogCache = () => { cache = null; };
