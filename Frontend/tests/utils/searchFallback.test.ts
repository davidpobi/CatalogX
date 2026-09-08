import { describe, expect, it } from "vitest";
import { compileFallbackQuery } from "@/utils/searchFallback";
import { queryPlanSchema } from "@/utils/queryPlan";

describe("fallback search compiler", () => {
  it("normalizes around prices to a 20 percent range", () => {
    const result = compileFallbackQuery("a minimal desk around $500");
    expect(result.plan.filters.price).toEqual({ min: 400, max: 600 });
    expect(queryPlanSchema.safeParse(result.plan).success).toBe(true);
  });

  it("makes discounts hard filters", () => expect(compileFallbackQuery("lighting with a discount").plan.filters.discountOnly).toBe(true));

  it("reduces a previous target by 20 percent", () => {
    const previous = compileFallbackQuery("under $500").plan;
    expect(compileFallbackQuery("show me cheaper", previous).plan.filters.price.max).toBe(400);
  });

  it("creates room bundles", () => {
    const result = compileFallbackQuery("furnish my living room for $1000");
    expect(result.plan.mode).toBe("bundle");
    expect(result.plan.bundle?.requiredCategories.length).toBeGreaterThan(2);
  });

  it("preserves previous constraints during a refinement", () => {
    const previous = compileFallbackQuery("oak seating under $500").plan;
    const refined = compileFallbackQuery("only in stock", previous).plan;
    expect(refined.categories).toEqual(previous.categories);
    expect(refined.filters.materials).toEqual(previous.filters.materials);
    expect(refined.filters.availability).toEqual(["in_stock", "low_stock"]);
  });
});
