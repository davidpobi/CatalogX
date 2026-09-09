import "server-only";
import admin from "firebase-admin";

interface ServiceAccountCredential {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const parseCredential = (): ServiceAccountCredential => {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!projectId) throw new Error("NEXT_PUBLIC_FIREBASE_PUBLIC_PROJECT_ID is not configured.");
  if (!clientEmail || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) {
    throw new Error("FIREBASE_CLIENT_EMAIL is not a valid service-account email.");
  }
  if (!privateKey?.startsWith("-----BEGIN PRIVATE KEY-----") || !privateKey.endsWith("-----END PRIVATE KEY-----")) {
    throw new Error("FIREBASE_PRIVATE_KEY is not a valid PEM private key.");
  }
  return { projectId, clientEmail, privateKey };
};

export const getAdminApp = () => {
  if (admin.apps.length) return admin.app();
  const credential = parseCredential();
  return admin.initializeApp({
    credential: admin.credential.cert(credential),
    projectId: credential.projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_STORAGE_BUCKET,
  });
};

export const getAdminDb = () => getAdminApp().firestore();
export const getAdminBucket = () => getAdminApp().storage().bucket();
export const getAdminAuth = () => getAdminApp().auth();
