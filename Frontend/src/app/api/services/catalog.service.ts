import "server-only";
import catalogueJson from "@/data/catalog.json";
import type { Product } from "@/interfaces/catalog";
import { catalogueSchema, productSchema } from "@/utils/catalogSchema";
import {
  CATALOGX_PRODUCTS_SUBCOLLECTION,
  CATALOGX_PROJECT_DOCUMENT,
  CATALOGX_PROJECTS_COLLECTION,
} from "@/utils/catalogPersistence";
import { getFirestore } from "../utils/firestoreUtils";

const listJsonCatalog = async () => catalogueSchema.parse(catalogueJson) as Product[];

const listFirestoreCatalog = async () => {
    const project = getFirestore().collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT);
    const [platform, merchant] = await Promise.all([
      project.collection(CATALOGX_PRODUCTS_SUBCOLLECTION).get(),
      project.collection("listings").get(),
    ]);
    return productSchema.array().parse([...platform.docs, ...merchant.docs].map((document) => document.data())) as Product[];
};

const listHybridCatalog = async () => {
    const platform = catalogueSchema.parse(catalogueJson) as Product[];
    const merchant = await getFirestore().collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT).collection("listings").get();
    return [...platform, ...productSchema.array().parse(merchant.docs.map((document) => document.data()))] as Product[];
};

const loaders = { json: listJsonCatalog, firestore: listFirestoreCatalog, hybrid: listHybridCatalog };
let cache: { expiresAt: number; products: Product[]; source: keyof typeof loaders } | null = null;

export const getCatalogProducts = async (): Promise<Product[]> => {
  const source: keyof typeof loaders = process.env.CATALOG_REPOSITORY === "json" ? "json" : process.env.CATALOG_REPOSITORY === "firestore" ? "firestore"
    : process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? "hybrid" : "json";
  if (cache && cache.source === source && cache.expiresAt > Date.now()) return cache.products;
  const products = await loaders[source]();
  cache = { products, source, expiresAt: Date.now() + 60_000 };
  return products;
};

export const clearCatalogCache = () => { cache = null; };
