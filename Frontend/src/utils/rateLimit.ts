import type { RateLimitRepository } from "@/interfaces/api";

export const resolveRateLimitRepository = (environment: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "RATE_LIMIT_REPOSITORY">>): RateLimitRepository => {
  if (environment.RATE_LIMIT_REPOSITORY === "memory" || environment.RATE_LIMIT_REPOSITORY === "firestore") return environment.RATE_LIMIT_REPOSITORY;
  return environment.NODE_ENV === "production" ? "firestore" : "memory";
};
