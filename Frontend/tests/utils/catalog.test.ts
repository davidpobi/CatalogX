import { describe, expect, it } from "vitest";
import catalogue from "@/data/catalog.json";
import type { Product } from "@/interfaces/catalog";
import { catalogueSchema } from "@/utils/catalogSchema";
import { executeCatalogQuery, replaceCatalogBundleProduct } from "@/utils/catalogQuery";
import { applyQueryPlanPatch, emptyQueryPlan, removePlanConstraint } from "@/utils/queryPlan";
import { buildSearchVocabulary, normalizeCompiledSearch } from "@/utils/searchVocabulary";
import { firebaseDownloadToken, firebaseDownloadUrl } from "@/utils/firebaseStorageUrl";
import { resolveRateLimitRepository } from "@/utils/rateLimit";

const products = catalogue as Product[];

describe("catalogue", () => {
  it("contains exactly ten valid products per category", () => {
    expect(catalogueSchema.parse(products)).toHaveLength(100);
    expect(new Set(products.map((product) => product.category)).size).toBe(10);
  });

  it("applies hard filters deterministically", () => {
    const plan = emptyQueryPlan("oak seating under $300");
    plan.categories = ["seating"];
    plan.filters.materials = ["oak"];
    plan.filters.price.max = 300;
    const result = executeCatalogQuery(products, plan);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every(({ product }) => product.category === "seating" && product.materials.includes("oak") && product.currentPrice <= 300)).toBe(true);
  });

  it("builds a multi-category bundle within budget", () => {
    const plan = emptyQueryPlan("furnish a living room for $1200");
    plan.mode = "bundle";
    plan.filters.rooms = ["living room"];
    plan.bundle = { room: "living room", budget: 1200, requiredCategories: ["seating", "tables-desks", "lighting", "rugs-textiles"], itemCount: 4 };
    const result = executeCatalogQuery(products, plan);
    expect(result.bundle?.products.length).toBeGreaterThanOrEqual(3);
    expect(result.bundle!.combinedPrice).toBeLessThanOrEqual(1200);
    expect(new Set(result.bundle!.products.map((item) => item.product.category)).size).toBeGreaterThanOrEqual(3);
  });

  it("honors replacement exclusions", () => {
    const plan = emptyQueryPlan();
    const first = executeCatalogQuery(products, plan).products.slice(0, 3).map((item) => item.product.id);
    const replaced = executeCatalogQuery(products, plan, first);
    expect(replaced.products.some((item) => first.includes(item.product.id))).toBe(false);
  });

  it("replaces only the targeted bundle item", () => {
    const plan = emptyQueryPlan("living room bundle");
    plan.mode = "bundle";
    plan.filters.rooms = ["living room"];
    plan.bundle = { room: "living room", budget: 2000, requiredCategories: ["seating", "tables-desks", "lighting", "rugs-textiles"], itemCount: 4 };
    const before = executeCatalogQuery(products, plan).bundle!;
    const target = before.products[0].product.id;
    const replacement = replaceCatalogBundleProduct(products, plan, before.products.map((item) => item.product.id), target)!;
    const after = replacement.bundle!;
    expect(after.products[0].product.id).not.toBe(target);
    expect(after.products.slice(1).map((item) => item.product.id)).toEqual(before.products.slice(1).map((item) => item.product.id));
    expect(after.products[0].product.category).toBe(before.products[0].product.category);
    expect(replacement.assessment.remainingBudget).toBe(Number((plan.bundle.budget! - after.combinedPrice).toFixed(2)));
  });

  it("removes every supported chip constraint from the plan", () => {
    const plan = emptyQueryPlan();
    plan.filters.styles = ["modern"]; plan.filters.materials = ["oak"]; plan.filters.maxDeliveryDays = 7;
    plan.filters.dimensions.maxWidth = 40; plan.preferences = [{ field: "tag", value: "compact", weight: 0.8 }];
    expect(removePlanConstraint(plan, "filters.styles", "modern").filters.styles).toEqual([]);
    expect(removePlanConstraint(plan, "filters.materials", "oak").filters.materials).toEqual([]);
    expect(removePlanConstraint(plan, "filters.maxDeliveryDays", 7).filters.maxDeliveryDays).toBeNull();
    expect(removePlanConstraint(plan, "filters.dimensions.maxWidth", 40).filters.dimensions.maxWidth).toBeNull();
    expect(removePlanConstraint(plan, "preferences.tag", "compact").preferences).toEqual([]);
  });

  it("drops invented AI vocabulary and preserves canonical values", () => {
    const vocabulary = buildSearchVocabulary(products);
    const plan = emptyQueryPlan();
    plan.filters.materials = ["OAK", "unobtainium"];
    const result = normalizeCompiledSearch({ plan, compiler: "fallback", interpretation: { summary: "test", assumptions: [], chips: [
      { id: "oak", label: "Oak", field: "filters.materials", value: "oak" },
      { id: "fake", label: "Unobtainium", field: "filters.materials", value: "unobtainium" },
    ] } }, vocabulary);
    expect(result.plan.filters.materials).toEqual(["oak"]);
    expect(result.interpretation.chips.map((chip) => chip.id)).toEqual(["oak"]);
  });

  it("filters first-class product types and explicit exclusions", () => {
    const plan = emptyQueryPlan("wall lighting without glass");
    plan.filters.productTypes = ["wall-lamp"];
    plan.exclusions.materials = ["glass"];
    const result = executeCatalogQuery(products, plan);
    expect(result.products.every(({ product }) => product.productType === "wall-lamp" && !product.materials.includes("glass"))).toBe(true);
  });

  it("returns two feasible deterministic suggestions", () => {
    const plan = emptyQueryPlan("seating");
    plan.categories = ["seating"];
    const result = executeCatalogQuery(products, plan);
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) {
      const patched = suggestion.patch.reduce((current, patch) => applyQueryPlanPatch(current, patch), plan);
      expect(executeCatalogQuery(products, patched).total).toBeGreaterThan(0);
    }
  });

  it("keeps Firebase image URLs stable when a token is reused", () => {
    const url = firebaseDownloadUrl("catalog.test", "projects/CatalogX/assets/products/a/hero.jpg", "fixed-token");
    expect(firebaseDownloadToken(url)).toBe("fixed-token");
    expect(firebaseDownloadUrl("catalog.test", "projects/CatalogX/assets/products/a/hero.jpg", firebaseDownloadToken(url)!)).toBe(url);
  });

  it("selects rate-limit persistence independently of catalogue mode", () => {
    expect(resolveRateLimitRepository({ NODE_ENV: "production", CATALOG_REPOSITORY: "json" } as NodeJS.ProcessEnv)).toBe("firestore");
    expect(resolveRateLimitRepository({ NODE_ENV: "development", RATE_LIMIT_REPOSITORY: undefined })).toBe("memory");
    expect(resolveRateLimitRepository({ NODE_ENV: "production", RATE_LIMIT_REPOSITORY: "memory" })).toBe("memory");
  });
});
