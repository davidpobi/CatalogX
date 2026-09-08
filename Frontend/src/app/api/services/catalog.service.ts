import "server-only";
import type { Product } from "@/interfaces/catalog";
import { productSchema } from "@/utils/catalogSchema";
import {
  CATALOGX_PRODUCTS_SUBCOLLECTION,
  CATALOGX_PROJECT_DOCUMENT,
  CATALOGX_PROJECTS_COLLECTION,
} from "@/utils/catalogPersistence";

const firestore = async () => (await import("../utils/firestoreUtils")).getFirestore();

const listFirestoreCatalog = async (): Promise<Product[]> => {
  const project = (await firestore()).collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT);
  const [platform, merchant] = await Promise.all([
    project.collection(CATALOGX_PRODUCTS_SUBCOLLECTION).get(),
    project.collection("listings").get(),
  ]);
  return productSchema.array().parse([...platform.docs, ...merchant.docs].map((document) => document.data())) as Product[];
};

let cache: { expiresAt: number; products: Product[] } | null = null;

export const getCatalogProducts = async (): Promise<Product[]> => {
  if (cache && cache.expiresAt > Date.now()) return cache.products;
  const products = await listFirestoreCatalog();
  cache = { products, expiresAt: Date.now() + 60_000 };
  return products;
};

export const clearCatalogCache = () => { cache = null; };
