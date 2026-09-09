import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CatalogOperations } from "@/interfaces/catalog";
import catalogue from "@/data/catalog.json";
import { POST } from "@/app/api/(routes)/catalog/route";
import { catalogueSchema } from "@/utils/catalogSchema";
import { emptyQueryPlan } from "@/utils/queryPlan";

const { getCatalogProducts } = vi.hoisted(() => ({
  getCatalogProducts: vi.fn(),
}));

vi.mock("@/app/api/services/catalog.service", () => ({
  getCatalogProducts,
  clearCatalogCache: vi.fn(),
}));

const request = (body: unknown) => new NextRequest("http://localhost/api/catalog", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("catalogue route", () => {
  beforeEach(() => {
    getCatalogProducts.mockResolvedValue(catalogueSchema.parse(catalogue));
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
    expect(body.data.products).toHaveLength(24);
    expect(body.data.total).toBe(100);
  });

  it("does not rate limit deterministic catalogue operations", async () => {
    const plan = emptyQueryPlan();
    expect((await POST(request({ operation: CatalogOperations.QueryProducts, plan, excludedProductIds: [] }))).status).toBe(200);
  });

  it("uses the shared error boundary when catalogue storage fails", async () => {
    getCatalogProducts.mockRejectedValueOnce(new Error("Firestore is unavailable"));
    const response = await POST(request({ operation: CatalogOperations.ListProducts }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, data: null, message: "The request is temporarily unavailable." });
  });
});
