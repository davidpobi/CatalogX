import "server-only";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "../config/firebaseAdmin";

export const getFirestore = () => getAdminDb();
export const getCollectionRef = (path: string) => getFirestore().collection(path);
export const getDocumentRef = (path: string, id: string) => getCollectionRef(path).doc(id);

export const getDocumentData = async <T>(ref: DocumentReference): Promise<T | null> => {
  const snapshot = await ref.get();
  return snapshot.exists ? snapshot.data() as T : null;
};

export const saveDocument = <T extends object>(ref: DocumentReference, data: T, transaction?: Transaction) => {
  if (transaction) { transaction.set(ref, data); return Promise.resolve(); }
  return ref.set(data);
};
