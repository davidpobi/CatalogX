import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import type { AuthSession } from "@/interfaces/auth";
import { createSession, verifySession, revokeSession } from "../../services/auth.service";
import { failure } from "../../utils/httpUtils";

export const createSessionSchema = z.object({ operation: z.literal("createSession"), idToken: z.string().min(100).max(10_000), audience: z.enum(["google", "admin"]) });
export const createAuthSession = async (body: unknown) => {
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return null;
  return createSession(parsed.data.idToken, parsed.data.audience);
};
export const getAuthSession = async (cookie: string | undefined): Promise<ApiRouteResult<AuthSession>> => {
  const session = await verifySession(cookie);
  return session ? { status: 200, data: session } : failure(401, "Authentication is required.");
};
export const revokeAuthSession = (cookie: string | undefined) => revokeSession(cookie);
