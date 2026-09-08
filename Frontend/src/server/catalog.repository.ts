import "server-only";
import catalogueJson from "@/data/catalog.json";
import type { CatalogRepository, Product } from "@/interfaces/catalog";
import { catalogueSchema } from "@/utils/catalogSchema";
import {
  CATALOGX_PRODUCTS_SUBCOLLECTION,
  CATALOGX_PROJECT_DOCUMENT,
  CATALOGX_PROJECTS_COLLECTION,
} from "@/utils/catalogPersistence";
import { getAdminDb } from "@/app/api/config/firebaseAdmin";

class JsonCatalogRepository implements CatalogRepository {
  async list() { return catalogueSchema.parse(catalogueJson) as Product[]; }
}

class FirestoreCatalogRepository implements CatalogRepository {
  async list() {
    const snapshot = await getAdminDb()
      .collection(CATALOGX_PROJECTS_COLLECTION)
      .doc(CATALOGX_PROJECT_DOCUMENT)
      .collection(CATALOGX_PRODUCTS_SUBCOLLECTION)
      .get();
    return catalogueSchema.parse(snapshot.docs.map((document) => document.data())) as Product[];
  }
}

const repositories = { json: new JsonCatalogRepository(), firestore: new FirestoreCatalogRepository() };
let cache: { expiresAt: number; products: Product[]; repository: string } | null = null;

export const getCatalogProducts = async (): Promise<Product[]> => {
  const repositoryName = process.env.CATALOG_REPOSITORY === "firestore" ? "firestore" : "json";
  if (cache && cache.repository === repositoryName && cache.expiresAt > Date.now()) return cache.products;
  const products = await repositories[repositoryName].list();
  cache = { products, repository: repositoryName, expiresAt: Date.now() + 60_000 };
  return products;
};

export const clearCatalogCache = () => { cache = null; };
