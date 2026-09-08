// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalogue from "@/data/catalog.json";
import type { Product } from "@/interfaces/catalog";
import { getCatalogIntelligenceContext } from "@/app/api/services/catalogIntelligence.service";
import { executeCatalogQuery } from "@/utils/catalogQuery";
import { applyQueryPlanPatch, emptyQueryPlan } from "@/utils/queryPlan";
import { compileFallbackQuery } from "@/utils/searchFallback";

const products = catalogue as Product[];

describe("catalogue intelligence", () => {
  it("builds and caches a compact, versioned store context", () => {
    const first = getCatalogIntelligenceContext(products);
    const second = getCatalogIntelligenceContext(products);
    expect(second).toBe(first);
    expect(first.store).toMatchObject({ brand: "CatalogX", retailer: "Norr & Vale", currency: "USD" });
    expect(first.assortment.productCount).toBe(100);
    expect(first.assortment.categories).toHaveLength(10);
    expect(first.assortment.productTypes.find((type) => type.id === "wall-lamp")?.aliases).toContain("sconce");
    expect(first.lifestyle.relationships).toHaveLength(12);
  });

  it("invalidates the cache when the catalogue version changes", () => {
    const first = getCatalogIntelligenceContext(products);
    const changed = products.map((product, index) => index === products.length - 1 ? { ...product, sourceHash: "f".repeat(64) } : product);
    const second = getCatalogIntelligenceContext(changed);
    expect(second.catalogueVersion).not.toBe(first.catalogueVersion);
    expect(second).not.toBe(first);
  });

  it("maps mood language to weighted preferences without hard filters", () => {
    const result = compileFallbackQuery("a calm living room", null, getCatalogIntelligenceContext(products));
    expect(result.plan.preferences.some((preference) => preference.field === "style" && preference.value === "Japandi")).toBe(true);
    expect(result.plan.filters.styles).toEqual([]);
  });

  it("compiles product aliases and negative constraints", () => {
    const result = compileFallbackQuery("a sconce without glass", null, getCatalogIntelligenceContext(products));
    expect(result.plan.filters.productTypes).toEqual(["wall-lamp"]);
    expect(result.plan.exclusions.materials).toEqual(["glass"]);
  });

  it("starts a fresh plan for a standalone search and preserves context for a refinement", () => {
    const context = getCatalogIntelligenceContext(products);
    const first = compileFallbackQuery("oak seating under $300", null, context);
    const fresh = compileFallbackQuery("bedroom lighting", first.plan, context);
    const negativeFresh = compileFallbackQuery("no glass dining table", first.plan, context);
    const genericFresh = compileFallbackQuery("a brass lamp under $200", first.plan, context);
    const refined = compileFallbackQuery("only show in stock options", first.plan, context);
    expect(fresh.plan.categories).toEqual(["lighting"]);
    expect(fresh.plan.filters.materials).toEqual([]);
    expect(fresh.plan.filters.price.max).toBeNull();
    expect(negativeFresh.plan.filters.productTypes).toEqual(["dining-table"]);
    expect(negativeFresh.plan.filters.materials).toEqual([]);
    expect(negativeFresh.plan.filters.price.max).toBeNull();
    expect(negativeFresh.plan.exclusions.materials).toEqual(["glass"]);
    expect(genericFresh.plan.categories).toEqual([]);
    expect(genericFresh.plan.filters.materials).toEqual([]);
    expect(genericFresh.plan.filters.colors).toEqual(["brass"]);
    expect(genericFresh.plan.filters.price.max).toBe(200);
    expect(refined.plan.categories).toEqual(["seating"]);
    expect(refined.plan.filters.materials).toEqual(["oak"]);
    expect(refined.plan.filters.availability).toEqual(["in_stock", "low_stock"]);
  });

  it("uses the live assortment vocabulary in the deterministic fallback", () => {
    const context = getCatalogIntelligenceContext(products);
    const result = compileFallbackQuery("soft modern brass lighting made from metal", null, context);
    expect(result.plan.categories).toEqual(["lighting"]);
    expect(result.plan.filters.colors).toEqual(["brass"]);
    expect(result.plan.filters.materials).toEqual(["metal"]);
    expect(result.plan.preferences).toContainEqual({ field: "style", value: "soft modern", weight: 0.8 });
  });

  it("assesses zero results and returns two feasible recovery patches", () => {
    const plan = emptyQueryPlan("a glass wall lamp without glass");
    plan.filters.productTypes = ["wall-lamp"];
    plan.filters.materials = ["glass"];
    plan.exclusions.materials = ["glass"];
    const result = executeCatalogQuery(products, plan);
    expect(result.total).toBe(0);
    expect(result.assessment.constraintsWithoutCoverage.length).toBeGreaterThan(0);
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) {
      const next = suggestion.patch.reduce(applyQueryPlanPatch, plan);
      expect(executeCatalogQuery(products, next).total).toBeGreaterThan(0);
    }
  });

  it("recovers from zero results caused by scalar delivery and dimension constraints", () => {
    const plan = emptyQueryPlan("very narrow pieces delivered immediately");
    plan.filters.maxDeliveryDays = 1;
    plan.filters.dimensions.maxWidth = 0.1;
    const result = executeCatalogQuery(products, plan);
    expect(result.total).toBe(0);
    expect(result.assessment.constraintsWithoutCoverage).toEqual(expect.arrayContaining([
      "delivery within 1 days",
      "width up to 0.1 in",
    ]));
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) {
      expect(`${suggestion.label} ${suggestion.prompt}`).not.toContain("null");
      const next = suggestion.patch.reduce(applyQueryPlanPatch, plan);
      expect(executeCatalogQuery(products, next).total).toBeGreaterThan(0);
    }
  });

  it("uses readable labels when relaxing a single scalar constraint", () => {
    const plan = emptyQueryPlan("extremely narrow pieces");
    plan.filters.dimensions.maxWidth = 0.1;
    const result = executeCatalogQuery(products, plan);
    expect(result.total).toBe(0);
    expect(result.suggestions[0]?.label).toBe("Relax width up to 0.1 in");
    expect(result.suggestions[0]?.prompt).toBe("Broaden the search by relaxing width up to 0.1 in");
  });

  it("identifies incomplete bundles and offers a verified budget adjustment", () => {
    const plan = emptyQueryPlan("a living room for $100");
    plan.mode = "bundle";
    plan.filters.rooms = ["living room"];
    plan.bundle = { room: "living room", budget: 100, requiredCategories: ["seating", "tables-desks", "lighting"], itemCount: 3 };
    const result = executeCatalogQuery(products, plan);
    expect(result.assessment.bundleComplete).toBe(false);
    const budgetSuggestion = result.suggestions.find((suggestion) => suggestion.patch.some((patch) => patch.field === "bundle.budget"));
    expect(budgetSuggestion).toBeDefined();
  });

  it("only suggests changes that improve an incomplete bundle", () => {
    const plan = emptyQueryPlan("a living room with wall lamps");
    plan.mode = "bundle";
    plan.filters.rooms = ["living room"];
    plan.filters.productTypes = ["wall-lamp"];
    plan.bundle = { room: "living room", budget: null, requiredCategories: ["seating", "lighting"], itemCount: 2 };
    const result = executeCatalogQuery(products, plan);
    expect(result.assessment.bundleComplete).toBe(false);
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) {
      const nextPlan = suggestion.patch.reduce(applyQueryPlanPatch, plan);
      const next = executeCatalogQuery(products, nextPlan);
      expect(
        (next.bundle?.products.length ?? 0) > (result.bundle?.products.length ?? 0)
          || next.assessment.missingBundleCategories.length < result.assessment.missingBundleCategories.length,
      ).toBe(true);
    }
  });
});
