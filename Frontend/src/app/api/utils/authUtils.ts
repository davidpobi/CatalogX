import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { AuthSession } from "@/interfaces/auth";
import { isConfiguredAdminId } from "../config/admin";
import { SESSION_COOKIE, verifySession } from "../services/auth.service";

export const sessionFromRequest = (request: NextRequest) => verifySession(request.cookies.get(SESSION_COOKIE)?.value);
export const hasTrustedOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
};
export const can = (session: AuthSession | null, capability: keyof AuthSession["user"]["capabilities"]) => Boolean(session?.user.capabilities[capability]);
export const isGoogleSession = (session: AuthSession | null) => session?.user.signInProvider === "google.com";
export const isPasswordAdminSession = (session: AuthSession | null) => Boolean(session?.user.capabilities.admin && session.user.signInProvider === "password");
export const isAdmin = (session: AuthSession | null) => Boolean(
  session && isPasswordAdminSession(session) && isConfiguredAdminId(session.user.uid),
);

export const currentSession = async () => verifySession((await cookies()).get(SESSION_COOKIE)?.value);

export const requireCustomerSession = async (): Promise<AuthSession> => {
  const session = await currentSession();
  if (!session || !isGoogleSession(session)) redirect("/sign-in");
  return session;
};

export const requireMerchantSession = async (): Promise<AuthSession> => {
  const session = await currentSession();
  if (!session || !isGoogleSession(session)) redirect("/merchant/sign-in");
  if (!session.user.capabilities.merchant) redirect("/merchant/onboarding");
  return session;
};

export const requireAdminSession = async (): Promise<AuthSession> => {
  const session = await currentSession();
  if (!isAdmin(session)) redirect("/admin/sign-in");
  return session!;
};
