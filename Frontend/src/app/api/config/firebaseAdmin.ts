import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

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
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    credential: cert(parseCredential()),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_STORAGE_BUCKET,
  });
};

export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminBucket = () => getStorage(getAdminApp()).bucket();
export const getAdminAuth = () => getAuth(getAdminApp());
