import { describe, expect, it } from "vitest";
import { resolveRateLimitRepository } from "@/utils/rateLimit";

describe("rate-limit repository resolution", () => {
  it("uses memory outside production by default", () => {
    expect(resolveRateLimitRepository({ NODE_ENV: "test" })).toBe("memory");
  });

  it("uses Firestore in production and honors explicit repository overrides", () => {
    expect(resolveRateLimitRepository({ NODE_ENV: "production" })).toBe("firestore");
    expect(resolveRateLimitRepository({ NODE_ENV: "production", RATE_LIMIT_REPOSITORY: "memory" })).toBe("memory");
    expect(resolveRateLimitRepository({ NODE_ENV: "development", RATE_LIMIT_REPOSITORY: "firestore" })).toBe("firestore");
  });
});
