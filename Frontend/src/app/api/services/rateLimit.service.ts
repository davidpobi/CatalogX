import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { RateLimitState } from "@/interfaces/api";
import { getAdminDb } from "../config/firebaseAdmin";
import { CATALOGX_PROJECT_DOCUMENT, CATALOGX_PROJECTS_COLLECTION, CATALOGX_RATE_LIMITS_SUBCOLLECTION } from "@/utils/catalogPersistence";
import { resolveRateLimitRepository } from "@/utils/rateLimit";

type Entry = { count: number; resetAt: number };
const entries = new Map<string, Entry>();

export const identifyClient = (request: NextRequest) => {
  const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const salt = process.env.RATE_LIMIT_SALT || "catalogx-development";
  return createHash("sha256").update(`${salt}:${source}`).digest("hex");
};

const consumeMemoryRateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const current = entries.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  entries.set(key, entry);
  if (entries.size > 5_000) for (const [candidate, value] of entries) if (value.resetAt <= now) entries.delete(candidate);
  return { allowed: entry.count <= limit, limit, remaining: Math.max(0, limit - entry.count), reset: Math.ceil(entry.resetAt / 1000) };
};

export const consumeRateLimit = async (key: string, limit: number, windowMs: number): Promise<RateLimitState> => {
  if (resolveRateLimitRepository(process.env) === "memory") return consumeMemoryRateLimit(key, limit, windowMs);
  const db = getAdminDb();
  const reference = db.collection(CATALOGX_PROJECTS_COLLECTION).doc(CATALOGX_PROJECT_DOCUMENT).collection(CATALOGX_RATE_LIMITS_SUBCOLLECTION).doc(key);
  return db.runTransaction(async (transaction) => {
    const now = Date.now();
    const snapshot = await transaction.get(reference);
    const existing = snapshot.data() as { count?: number; resetAt?: number } | undefined;
    const resetAt = !existing?.resetAt || existing.resetAt <= now ? now + windowMs : existing.resetAt;
    const count = resetAt !== existing?.resetAt ? 1 : (existing.count || 0) + 1;
    transaction.set(reference, { count, resetAt, updatedAt: now });
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), reset: Math.ceil(resetAt / 1000) };
  });
};

export const rateLimitHeaders = (state: RateLimitState) => ({
  "X-RateLimit-Limit": String(state.limit),
  "X-RateLimit-Remaining": String(state.remaining),
  "X-RateLimit-Reset": String(state.reset),
});
