import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import type { Product } from "@/interfaces/catalog";
import { productSchema } from "@/utils/catalogSchema";
import {
  CATALOGX_PRODUCTS_SUBCOLLECTION,
  CATALOGX_PROJECT_DOCUMENT,
  CATALOGX_PROJECTS_COLLECTION,
} from "@/utils/catalogPersistence";

const firestore = async () => (await import("../utils/firestoreUtils")).getFirestore();

type CatalogSource = "platform" | "merchant";
type CatalogPageCursor = { source: CatalogSource; id: string | null };
type CatalogPage = { products: Product[]; total: number; nextCursor: string | null };

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

const encodeCursor = (cursor: CatalogPageCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");

const decodeCursor = (value: string | null | undefined): CatalogPageCursor | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      (parsed as { source?: unknown }).source !== undefined &&
      ((parsed as { source?: unknown }).source === "platform" || (parsed as { source?: unknown }).source === "merchant") &&
      ((parsed as { id?: unknown }).id === null || (typeof (parsed as { id?: unknown }).id === "string" && (parsed as { id: string }).id.length > 0))
    ) return parsed as CatalogPageCursor;
  } catch { /* Invalid cursors are rejected by the caller. */ }
  return null;
};

const collectionFor = (source: CatalogSource, project: FirebaseFirestore.DocumentReference) =>
  project.collection(source === "platform" ? CATALOGX_PRODUCTS_SUBCOLLECTION : "listings");

const readPage = async (source: CatalogSource, project: FirebaseFirestore.DocumentReference, afterId: string | null, limit: number) => {
  let query = collectionFor(source, project).orderBy(FieldPath.documentId()).limit(limit + 1);
  if (afterId) query = query.startAfter(afterId);
  const snapshot = await query.get();
  return { products: parseProducts(snapshot.docs, source), hasMore: snapshot.docs.length > limit };
};

export const getCatalogPage = async (cursorValue: string | null | undefined, limit: number): Promise<CatalogPage | null> => {
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) return null;

  const project = (await firestore()).collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT);
  const startSource: CatalogSource = cursor?.source ?? "platform";
  const first = await readPage(startSource, project, cursor?.id ?? null, limit);
  const firstProducts = first.products.slice(0, limit);

  if (first.hasMore) {
    const last = firstProducts.at(-1);
    return { products: firstProducts, total: await countCatalog(project), nextCursor: last ? encodeCursor({ source: startSource, id: last.id }) : null };
  }

  if (startSource === "merchant") return { products: firstProducts, total: await countCatalog(project), nextCursor: null };

  const remaining = limit - firstProducts.length;
  if (!remaining) {
    const merchant = await readPage("merchant", project, null, 1);
    return {
      products: firstProducts,
      total: await countCatalog(project),
      nextCursor: merchant.products.length ? encodeCursor({ source: "merchant", id: null }) : null,
    };
  }
  const merchant = await readPage("merchant", project, null, remaining);
  const merchantProducts = merchant.products.slice(0, remaining);
  const last = merchantProducts.at(-1);
  return {
    products: [...firstProducts, ...merchantProducts],
    total: await countCatalog(project),
    nextCursor: merchant.hasMore && last ? encodeCursor({ source: "merchant", id: last.id }) : null,
  };
};

const countCatalog = async (project: FirebaseFirestore.DocumentReference) => {
  const [platform, merchant] = await Promise.all([
    project.collection(CATALOGX_PRODUCTS_SUBCOLLECTION).count().get(),
    project.collection("listings").count().get(),
  ]);
  return platform.data().count + merchant.data().count;
};

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

export const getCatalogProductBySlug = async (slug: string): Promise<Product | undefined> => {
  const project = (await firestore()).collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT);
  const [platform, merchant] = await Promise.all([
    project.collection(CATALOGX_PRODUCTS_SUBCOLLECTION).where("slug", "==", slug).limit(1).get(),
    project.collection("listings").where("slug", "==", slug).limit(1).get(),
  ]);
  return parseProducts(platform.docs, "platform")[0] ?? parseProducts(merchant.docs, "merchant")[0];
};

export const clearCatalogCache = () => { cache = null; };
