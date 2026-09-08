import "server-only";
import { getCatalogProducts } from "./catalog.service";
import type { CollectionItem, CustomerCollection, ProductLike } from "@/interfaces/customer";
import { getFirestore } from "../utils/firestoreUtils";

const now = () => new Date().toISOString();
const userRef = (uid: string) => getFirestore().collection("users").doc(uid);

const listLikes = async (uid: string) => {
  const snapshot = await userRef(uid).collection("likes").get();
  return snapshot.docs.map((doc) => doc.data() as ProductLike);
};

const listCollections = async (uid: string) => {
  const snapshot = await userRef(uid).collection("collections").get();
  return Promise.all(snapshot.docs.map(async (doc) => {
    const items = await doc.ref.collection("items").get();
    return { ...doc.data(), items: items.docs.map((item) => item.data()) } as CustomerCollection;
  }));
};

const findCollection = async (uid: string, collectionId: string) => {
  const ref = userRef(uid).collection("collections").doc(collectionId);
  const [doc, items] = await Promise.all([ref.get(), ref.collection("items").get()]);
  return doc.exists ? { ...doc.data(), items: items.docs.map((item) => item.data()) } as CustomerCollection : null;
};

const saveCollection = async (collection: CustomerCollection) => {
  await userRef(collection.ownerId).collection("collections").doc(collection.id).set({ id: collection.id, ownerId: collection.ownerId, name: collection.name, createdAt: collection.createdAt, updatedAt: collection.updatedAt });
};

const validProductIds = async (ids: string[]) => {
  const available = new Set((await getCatalogProducts()).map((product) => product.id));
  return [...new Set(ids)].filter((id) => available.has(id)).slice(0, 100);
};
export const getCustomerLibrary = async (uid: string) => ({ likedProductIds: (await listLikes(uid)).map((like) => like.productId), collections: await listCollections(uid) });
export const getCustomerCollection = async (uid: string, id: string): Promise<CustomerCollection> => {
  const collection = await findCollection(uid, id);
  if (!collection) throw new Error("Collection not found.");
  return collection;
};
export const setCustomerLike = async (uid: string, productId: string, liked: boolean) => { if (!(await validProductIds([productId])).length) throw new Error("Product not found."); const ref = userRef(uid).collection("likes").doc(productId); if (liked) await ref.set({ productId, createdAt: now() }); else await ref.delete(); return getCustomerLibrary(uid); };
export const mergeCustomerLikes = async (uid: string, ids: string[]) => { const batch = getFirestore().batch(); for (const productId of await validProductIds(ids)) batch.set(userRef(uid).collection("likes").doc(productId), { productId, createdAt: now() }, { merge: true }); await batch.commit(); return getCustomerLibrary(uid); };
export const createCustomerCollection = async (uid: string, name: string) => { if ((await listCollections(uid)).length >= 20) throw new Error("You can create up to 20 collections."); const timestamp = now(); await saveCollection({ id: crypto.randomUUID(), ownerId: uid, name, createdAt: timestamp, updatedAt: timestamp, items: [] }); return getCustomerLibrary(uid); };
export const renameCustomerCollection = async (uid: string, id: string, name: string) => { const collection = await findCollection(uid, id); if (!collection) throw new Error("Collection not found."); await saveCollection({ ...collection, name, updatedAt: now() }); return getCustomerLibrary(uid); };
export const deleteCustomerCollection = async (uid: string, id: string) => { const ref = userRef(uid).collection("collections").doc(id); const items = await ref.collection("items").get(); const batch = getFirestore().batch(); for (const item of items.docs) batch.delete(item.ref); batch.delete(ref); await batch.commit(); return getCustomerLibrary(uid); };
export const setCollectionItem = async (uid: string, id: string, productId: string, included: boolean) => { const collection = await findCollection(uid, id); if (!collection) throw new Error("Collection not found."); if (!(await validProductIds([productId])).length) throw new Error("Product not found."); if (included && !collection.items.some((item) => item.productId === productId) && collection.items.length >= 100) throw new Error("A collection can contain up to 100 products."); const item: CollectionItem = { productId, addedAt: now() }; const ref = userRef(uid).collection("collections").doc(id).collection("items").doc(productId); if (included) await ref.set(item); else await ref.delete(); return getCustomerLibrary(uid); };
