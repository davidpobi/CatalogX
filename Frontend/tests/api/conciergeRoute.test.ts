import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import catalogue from "@/data/catalog.json";
import { POST } from "@/app/api/(routes)/concierge/route";
import { catalogueSchema } from "@/utils/catalogSchema";

const { getCatalogProducts } = vi.hoisted(() => ({ getCatalogProducts: vi.fn() }));

vi.mock("@/app/api/services/catalog.service", () => ({
  getCatalogProducts,
  clearCatalogCache: vi.fn(),
}));

getCatalogProducts.mockResolvedValue(catalogueSchema.parse(catalogue));

const request = (body: unknown) => new NextRequest("http://localhost/api/concierge", {
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json", "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
});

describe("concierge route", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("rejects unknown operations before running the workflow", async () => {
    const response = await POST(request({ operation: "unknown" }));
    expect(response.status).toBe(400);
  });

  it("rejects malformed prompts", async () => {
    const response = await POST(request({ operation: "queryCatalogue", prompt: "x" }));
    expect(response.status).toBe(422);
  });

  it("returns a provider-free deterministic response with rate-limit headers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request({ operation: "queryCatalogue", prompt: "oak seating under $300" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("20");
    expect(body.success).toBe(true);
    expect(body.data.workflowId).toEqual(expect.any(String));
    expect(body.data.review.status).toBe("fallback");
  });

  it("streams sanitized progress followed by one final result", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const streamedRequest = request({ operation: "queryCatalogue", prompt: "private oak seating prompt" });
    streamedRequest.headers.set("accept", "application/x-ndjson");
    const response = await POST(streamedRequest);
    const text = await response.text();
    const chunks = text.trim().split("\n").map((line) => JSON.parse(line));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(chunks[0]).toMatchObject({ type: "progress", data: { step: "understanding" } });
    expect(chunks.some((chunk) => chunk.type === "progress" && chunk.data.step === "fallback")).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: "result", data: { review: { status: "fallback" } } });
    const progressText = chunks.filter((chunk) => chunk.type === "progress").map((chunk) => JSON.stringify(chunk)).join("\n");
    expect(progressText).not.toContain("private oak seating prompt");
    expect(progressText).not.toContain("firebasestorage.googleapis.com");
  });

  it("returns a sanitized 429 envelope after twenty requests", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const makeLimitedRequest = () => new NextRequest("http://localhost/api/concierge", {
      method: "POST",
      body: JSON.stringify({ operation: "queryCatalogue", prompt: "oak seating" }),
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
    });
    let response!: Response;
    for (let index = 0; index < 21; index += 1) response = await POST(makeLimitedRequest());
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(body).toMatchObject({ success: false, message: "Concierge limit reached. Please try again shortly." });
    expect(JSON.stringify(body)).not.toContain("198.51.100.20");
  });
});
