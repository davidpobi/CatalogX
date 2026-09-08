import "server-only";
import type { AuthSession, AuthenticatedUser } from "@/interfaces/auth";
import { getAdminAuth } from "@/app/api/config/firebaseAdmin";
import { getFirestore } from "../utils/firestoreUtils";

export const SESSION_COOKIE = "catalogx-session";
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

const getCapabilities = async (uid: string) => {
  const db = getFirestore();
  const [application, merchant, admin] = await Promise.all([
    db.collection("merchantApplications").doc(uid).get(),
    db.collection("merchants").doc(uid).get(),
    db.collection("admins").doc(uid).get(),
  ]);
  return {
    customer: true,
    merchantApplicant: application.exists,
    merchant: merchant.exists && merchant.get("status") === "approved",
    admin: admin.exists && admin.get("enabled") === true,
  };
};

const upsertUser = (user: Pick<AuthenticatedUser, "uid" | "email" | "displayName" | "photoUrl">) =>
  getFirestore().collection("users").doc(user.uid).set({ ...user, updatedAt: new Date().toISOString() }, { merge: true });

const toUser = async (decoded: { uid: string; email?: string; name?: string; picture?: string; firebase?: { sign_in_provider?: string } }, persist = false): Promise<AuthenticatedUser> => {
  const user = {
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    photoUrl: decoded.picture ?? null,
    signInProvider: decoded.firebase?.sign_in_provider ?? null,
    capabilities: await getCapabilities(decoded.uid),
  };
  if (persist) await upsertUser(user);
  return user;
};

export const createSession = async (idToken: string, audience: "google" | "admin") => {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken, true);
  const provider = decoded.firebase.sign_in_provider;
  if ((audience === "google" && provider !== "google.com") || (audience === "admin" && provider !== "password")) throw new Error("Unsupported sign-in provider.");
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS });
  return { cookie, session: { user: await toUser(decoded, true), expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString() } satisfies AuthSession };
};

export const verifySession = async (cookie: string | undefined): Promise<AuthSession | null> => {
  if (!cookie) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    return { user: await toUser(decoded), expiresAt: new Date(decoded.exp * 1000).toISOString() };
  } catch { return null; }
};

export const revokeSession = async (cookie: string | undefined) => {
  if (!cookie) return;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie);
    await getAdminAuth().revokeRefreshTokens(decoded.uid);
  } catch { /* An invalid session is already effectively revoked. */ }
};
