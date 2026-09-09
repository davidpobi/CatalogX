import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthOperations } from "@/interfaces/auth";
import { POST } from "@/app/api/(routes)/auth/route";
import { hasTrustedOrigin } from "@/app/api/utils/authUtils";

const { consumeRateLimit, rateLimitHeaders } = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/app/api/services/rateLimit.service", () => ({
  identifyClient: () => "test-client",
  consumeRateLimit,
  rateLimitHeaders,
}));

const request = (body: unknown, headers: HeadersInit = {}) => new NextRequest("http://localhost/api/auth", {
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json", ...headers },
});

describe("authentication route", () => {
  beforeEach(() => {
    consumeRateLimit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, reset: 1_800_000_000 });
    rateLimitHeaders.mockReturnValue({ "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "59", "X-RateLimit-Reset": "1800000000" });
  });

  it("does not rate limit guest session reads", async () => {
    const response = await POST(request({ operation: AuthOperations.GetSession }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: null });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("rate limits session mutations", async () => {
    const response = await POST(request({ operation: AuthOperations.CreateSession, idToken: "invalid" }, { origin: "http://localhost" }));
    expect(response.status).toBe(422);
    expect(consumeRateLimit).toHaveBeenCalledWith("auth:test-client", 30, 600_000);
  });

  it("requires the complete matching origin for mutations", () => {
    expect(hasTrustedOrigin(new NextRequest("https://catalogx.test/api/auth", { method: "POST", headers: { origin: "https://catalogx.test" } }))).toBe(true);
    expect(hasTrustedOrigin(new NextRequest("https://catalogx.test/api/auth", { method: "POST", headers: { origin: "http://catalogx.test" } }))).toBe(false);
  });
});
