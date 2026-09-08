// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import catalogue from "@/data/catalog.json";
import type { Product } from "@/interfaces/catalog";
import { getCatalogIntelligenceContext } from "@/app/api/services/catalogIntelligence.service";
import { emptyQueryPlan } from "@/utils/queryPlan";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/app/api/config/openai", () => ({ getOpenAI: () => ({ responses: { parse } }) }));

import { compileSearchWithAI } from "@/app/api/services/searchCompiler.service";

const products = catalogue as Product[];
const context = getCatalogIntelligenceContext(products);

describe("Terra search compiler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Terra as the only provider model and sends store context", async () => {
    parse.mockResolvedValue({ output_parsed: { plan: emptyQueryPlan("calm room"), interpretation: { summary: "A calm room.", chips: [], assumptions: [] } } });
    const result = await compileSearchWithAI("calm room", context);
    expect(result.compiler).toBe("gpt-5.6-terra");
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].model).toBe("gpt-5.6-terra");
    const input = JSON.parse(parse.mock.calls[0][0].input);
    expect(input.storeContext.retailer).toBe("Norr & Vale");
    expect(input.assortment.productCount).toBe(100);
    expect(input.allowedValues.productTypes).toContain("wall-lamp");
  });

  it("falls back deterministically when Terra fails", async () => {
    parse.mockRejectedValue(new Error("provider unavailable"));
    const result = await compileSearchWithAI("a sconce without glass", context);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(result.compiler).toBe("fallback");
    expect(result.plan.filters.productTypes).toEqual(["wall-lamp"]);
    expect(result.plan.exclusions.materials).toEqual(["glass"]);
  });

  it("does not send stale constraints with a standalone new search", async () => {
    const previousPlan = emptyQueryPlan("oak seating under $300");
    previousPlan.categories = ["seating"];
    previousPlan.filters.materials = ["oak"];
    previousPlan.filters.price.max = 300;
    parse.mockResolvedValue({ output_parsed: { plan: emptyQueryPlan("bedroom lighting"), interpretation: { summary: "Bedroom lighting.", chips: [], assumptions: [] } } });
    await compileSearchWithAI("bedroom lighting", context, previousPlan);
    const input = JSON.parse(parse.mock.calls[0][0].input);
    expect(input.requestMode).toBe("new");
    expect(input.previousPlan).toBeNull();
  });
});
