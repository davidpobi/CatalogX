import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CatalogOperations } from "@/interfaces/catalog";
import catalogue from "@/data/catalog.json";
import { POST } from "@/app/api/(routes)/catalog/route";
import { catalogueSchema } from "@/utils/catalogSchema";
import { emptyQueryPlan } from "@/utils/queryPlan";

const { consumeRateLimit, getCatalogProducts, rateLimitHeaders } = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  getCatalogProducts: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/app/api/services/rateLimit.service", () => ({
  identifyClient: () => "test-client",
  consumeRateLimit,
  rateLimitHeaders,
}));

vi.mock("@/app/api/services/catalog.service", () => ({
  getCatalogProducts,
  clearCatalogCache: vi.fn(),
}));

const request = (body: unknown) => new NextRequest("http://localhost/api/catalog", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("catalogue route", () => {
  beforeEach(() => {
    getCatalogProducts.mockResolvedValue(catalogueSchema.parse(catalogue));
    consumeRateLimit.mockResolvedValue({ allowed: true, limit: 120, remaining: 119, reset: 1_800_000_000 });
    rateLimitHeaders.mockReturnValue({ "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": "119", "X-RateLimit-Reset": "1800000000" });
  });

  it("rejects unknown operations", async () => {
    const response = await POST(request({ operation: "unknown" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, data: null, message: "Invalid operation." });
  });

  it("dispatches query and targeted replacement operations", async () => {
    const plan = emptyQueryPlan("living room bundle");
    plan.mode = "bundle"; plan.filters.rooms = ["living room"];
    plan.bundle = { room: "living room", budget: 2000, requiredCategories: ["seating", "tables-desks", "lighting", "rugs-textiles"], itemCount: 4 };
    const queryResponse = await POST(request({ operation: "queryProducts", plan, excludedProductIds: [] }));
    expect(queryResponse.status).toBe(200);
    const queried = await queryResponse.json();
    const ids = queried.data.bundle.products.map((item: { product: { id: string } }) => item.product.id);
    const replaceResponse = await POST(request({ operation: "replaceBundleProduct", plan, currentProductIds: ids, targetProductId: ids[0] }));
    expect(replaceResponse.status).toBe(200);
    const replaced = await replaceResponse.json();
    expect(replaced.data.bundle.products[0].product.id).not.toBe(ids[0]);
    expect(replaced.data.bundle.products.slice(1).map((item: { product: { id: string } }) => item.product.id)).toEqual(ids.slice(1));
  });

  it("dispatches list operations", async () => {
    const response = await POST(request({ operation: "listProducts" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.products).toHaveLength(100);
    expect(consumeRateLimit).toHaveBeenCalledWith("catalog:listProducts:test-client", 120, 600_000);
  });

  it("uses a separate limit for query and replacement operations", async () => {
    const plan = emptyQueryPlan();
    await POST(request({ operation: CatalogOperations.QueryProducts, plan, excludedProductIds: [] }));
    expect(consumeRateLimit).toHaveBeenCalledWith("catalog:queryProducts:test-client", 60, 600_000);
    await POST(request({ operation: CatalogOperations.ReplaceBundleProduct, plan, currentProductIds: ["one", "two"], targetProductId: "one" }));
    expect(consumeRateLimit).toHaveBeenCalledWith("catalog:replaceBundleProduct:test-client", 30, 600_000);
  });

  it("returns a sanitized, header-bearing response when a catalogue limit is reached", async () => {
    consumeRateLimit.mockResolvedValueOnce({ allowed: false, limit: 120, remaining: 0, reset: 1_800_000_000 });
    rateLimitHeaders.mockReturnValueOnce({ "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1800000000" });
    const response = await POST(request({ operation: CatalogOperations.ListProducts }));
    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await response.json()).toMatchObject({ success: false, data: null, message: "Catalogue limit reached. Please try again shortly." });
  });

  it("uses the shared error boundary when rate-limit storage fails", async () => {
    consumeRateLimit.mockRejectedValueOnce(new Error("Firestore is unavailable"));
    const response = await POST(request({ operation: CatalogOperations.ListProducts }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, data: null, message: "The request is temporarily unavailable." });
  });
});
