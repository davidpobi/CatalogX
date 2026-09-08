import { z } from "zod";
import { CATEGORY_IDS, PRODUCT_TYPE_IDS } from "@/interfaces/catalog";
import type { QueryPlanPatch } from "@/interfaces/intelligence";
import type { CatalogQueryPlanV1, InterpretationChip, InterpretationChipField, SearchInterpretation } from "@/interfaces/search";
import { availabilitySchema, categorySchema, productTypeSchema } from "./catalogSchema";

const nullableDimension = z.number().positive().max(1000).nullable();

export const queryPlanSchema: z.ZodType<CatalogQueryPlanV1> = z.object({
  version: z.literal("1"),
  mode: z.enum(["products", "bundle"]),
  searchText: z.string().max(800),
  categories: z.array(categorySchema).max(CATEGORY_IDS.length),
  filters: z.object({
    productTypes: z.array(productTypeSchema).max(PRODUCT_TYPE_IDS.length),
    rooms: z.array(z.string().max(60)).max(10),
    styles: z.array(z.string().max(60)).max(10),
    colors: z.array(z.string().max(60)).max(10),
    materials: z.array(z.string().max(60)).max(10),
    availability: z.array(availabilitySchema).max(4),
    price: z.object({ min: z.number().nonnegative().nullable(), max: z.number().positive().nullable() }),
    discountOnly: z.boolean(),
    maxDeliveryDays: z.number().int().positive().max(90).nullable(),
    dimensions: z.object({ maxWidth: nullableDimension, maxHeight: nullableDimension, maxDepth: nullableDimension }),
  }),
  exclusions: z.object({
    productTypes: z.array(productTypeSchema).max(PRODUCT_TYPE_IDS.length),
    colors: z.array(z.string().max(60)).max(20),
    materials: z.array(z.string().max(60)).max(20),
    tags: z.array(z.string().max(60)).max(20),
  }),
  preferences: z.array(z.object({
    field: z.enum(["style", "color", "material", "room", "tag", "productType", "useCase", "feature"]),
    value: z.string().min(1).max(60),
    weight: z.number().min(0).max(1),
  })).max(20),
  sort: z.object({ field: z.enum(["relevance", "price", "rating", "discount"]), direction: z.enum(["asc", "desc"]) }),
  limit: z.number().int().min(1).max(50),
  bundle: z.object({
    room: z.string().min(1).max(60),
    budget: z.number().positive().nullable(),
    requiredCategories: z.array(categorySchema).min(1).max(10),
    itemCount: z.number().int().min(2).max(10),
  }).nullable(),
}).superRefine((plan, context) => {
  if (plan.filters.price.min !== null && plan.filters.price.max !== null && plan.filters.price.min > plan.filters.price.max) {
    context.addIssue({ code: "custom", path: ["filters", "price"], message: "Minimum price cannot exceed maximum price." });
  }
  if (plan.mode === "bundle" && !plan.bundle) context.addIssue({ code: "custom", path: ["bundle"], message: "Bundle details are required." });
});

export const interpretationSchema: z.ZodType<SearchInterpretation> = z.object({
  summary: z.string().min(1).max(300),
  chips: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(80),
    field: z.enum([
      "categories", "filters.productTypes", "filters.rooms", "filters.styles", "filters.colors", "filters.materials", "filters.availability",
      "filters.price.min", "filters.price.max", "filters.discountOnly", "filters.maxDeliveryDays",
      "filters.dimensions.maxWidth", "filters.dimensions.maxHeight", "filters.dimensions.maxDepth",
      "exclusions.productTypes", "exclusions.colors", "exclusions.materials", "exclusions.tags",
      "preferences.style", "preferences.color", "preferences.material", "preferences.room", "preferences.tag", "preferences.productType", "preferences.useCase", "preferences.feature",
    ]),
    value: z.union([z.string(), z.number(), z.boolean()]),
  })).max(30),
  assumptions: z.array(z.string().max(160)).max(10),
});

export const emptyQueryPlan = (searchText = ""): CatalogQueryPlanV1 => ({
  version: "1",
  mode: "products",
  searchText,
  categories: [],
  filters: {
    productTypes: [], rooms: [], styles: [], colors: [], materials: [], availability: [],
    price: { min: null, max: null }, discountOnly: false, maxDeliveryDays: null,
    dimensions: { maxWidth: null, maxHeight: null, maxDepth: null },
  },
  exclusions: { productTypes: [], colors: [], materials: [], tags: [] },
  preferences: [],
  sort: { field: "relevance", direction: "desc" },
  limit: 24,
  bundle: null,
});

const removeValue = <T extends string>(values: T[], value: InterpretationChip["value"]) =>
  values.filter((item) => item.toLowerCase() !== String(value).toLowerCase());

export const removePlanConstraint = (plan: CatalogQueryPlanV1, field: InterpretationChipField, value: InterpretationChip["value"]): CatalogQueryPlanV1 => {
  const next = structuredClone(plan);
  switch (field) {
    case "categories": next.categories = removeValue(next.categories, value); break;
    case "filters.productTypes": next.filters.productTypes = removeValue(next.filters.productTypes, value); break;
    case "filters.rooms": next.filters.rooms = removeValue(next.filters.rooms, value); break;
    case "filters.styles": next.filters.styles = removeValue(next.filters.styles, value); break;
    case "filters.colors": next.filters.colors = removeValue(next.filters.colors, value); break;
    case "filters.materials": next.filters.materials = removeValue(next.filters.materials, value); break;
    case "filters.availability": next.filters.availability = removeValue(next.filters.availability, value); break;
    case "filters.price.min": next.filters.price.min = null; break;
    case "filters.price.max": next.filters.price.max = null; break;
    case "filters.discountOnly": next.filters.discountOnly = false; break;
    case "filters.maxDeliveryDays": next.filters.maxDeliveryDays = null; break;
    case "filters.dimensions.maxWidth": next.filters.dimensions.maxWidth = null; break;
    case "filters.dimensions.maxHeight": next.filters.dimensions.maxHeight = null; break;
    case "filters.dimensions.maxDepth": next.filters.dimensions.maxDepth = null; break;
    case "exclusions.productTypes": next.exclusions.productTypes = removeValue(next.exclusions.productTypes, value); break;
    case "exclusions.colors": next.exclusions.colors = removeValue(next.exclusions.colors, value); break;
    case "exclusions.materials": next.exclusions.materials = removeValue(next.exclusions.materials, value); break;
    case "exclusions.tags": next.exclusions.tags = removeValue(next.exclusions.tags, value); break;
    default: {
      const preferenceField = field.replace("preferences.", "");
      next.preferences = next.preferences.filter((item) => !(item.field === preferenceField && item.value.toLowerCase() === String(value).toLowerCase()));
    }
  }
  return next;
};

export const isPlanConstraintActive = (plan: CatalogQueryPlanV1, chip: InterpretationChip) => {
  const value = String(chip.value).toLowerCase();
  const arrays: Partial<Record<InterpretationChipField, string[]>> = {
    categories: plan.categories,
    "filters.productTypes": plan.filters.productTypes,
    "filters.rooms": plan.filters.rooms,
    "filters.styles": plan.filters.styles,
    "filters.colors": plan.filters.colors,
    "filters.materials": plan.filters.materials,
    "filters.availability": plan.filters.availability,
    "exclusions.productTypes": plan.exclusions.productTypes,
    "exclusions.colors": plan.exclusions.colors,
    "exclusions.materials": plan.exclusions.materials,
    "exclusions.tags": plan.exclusions.tags,
  };
  if (arrays[chip.field]) return arrays[chip.field]!.some((item) => item.toLowerCase() === value);
  if (chip.field.startsWith("preferences.")) return plan.preferences.some((item) => `preferences.${item.field}` === chip.field && item.value.toLowerCase() === value);
  const scalars: Partial<Record<InterpretationChipField, unknown>> = {
    "filters.price.min": plan.filters.price.min,
    "filters.price.max": plan.filters.price.max,
    "filters.discountOnly": plan.filters.discountOnly,
    "filters.maxDeliveryDays": plan.filters.maxDeliveryDays,
    "filters.dimensions.maxWidth": plan.filters.dimensions.maxWidth,
    "filters.dimensions.maxHeight": plan.filters.dimensions.maxHeight,
    "filters.dimensions.maxDepth": plan.filters.dimensions.maxDepth,
  };
  return scalars[chip.field] === chip.value;
};

export const applyQueryPlanPatch = (plan: CatalogQueryPlanV1, patch: QueryPlanPatch): CatalogQueryPlanV1 => {
  const next = structuredClone(plan);
  const changeArray = <T extends string>(values: T[], value: string) => patch.operation === "remove"
    ? values.filter((item) => item.toLowerCase() !== value.toLowerCase())
    : [...new Set([...values, value as T])];
  switch (patch.field) {
    case "categories": next.categories = changeArray(next.categories, String(patch.value)); break;
    case "filters.productTypes": next.filters.productTypes = changeArray(next.filters.productTypes, String(patch.value)); break;
    case "filters.rooms": next.filters.rooms = changeArray(next.filters.rooms, String(patch.value)); break;
    case "filters.styles": next.filters.styles = changeArray(next.filters.styles, String(patch.value)); break;
    case "filters.colors": next.filters.colors = changeArray(next.filters.colors, String(patch.value)); break;
    case "filters.materials": next.filters.materials = changeArray(next.filters.materials, String(patch.value)); break;
    case "filters.availability": next.filters.availability = changeArray(next.filters.availability, String(patch.value)); break;
    case "filters.price.min": next.filters.price.min = patch.value === null ? null : Number(patch.value); break;
    case "filters.price.max": next.filters.price.max = patch.value === null ? null : Number(patch.value); break;
    case "filters.discountOnly": next.filters.discountOnly = Boolean(patch.value); break;
    case "filters.maxDeliveryDays": next.filters.maxDeliveryDays = patch.value === null ? null : Number(patch.value); break;
    case "filters.dimensions.maxWidth": next.filters.dimensions.maxWidth = patch.value === null ? null : Number(patch.value); break;
    case "filters.dimensions.maxHeight": next.filters.dimensions.maxHeight = patch.value === null ? null : Number(patch.value); break;
    case "filters.dimensions.maxDepth": next.filters.dimensions.maxDepth = patch.value === null ? null : Number(patch.value); break;
    case "exclusions.productTypes": next.exclusions.productTypes = changeArray(next.exclusions.productTypes, String(patch.value)); break;
    case "exclusions.colors": next.exclusions.colors = changeArray(next.exclusions.colors, String(patch.value)); break;
    case "exclusions.materials": next.exclusions.materials = changeArray(next.exclusions.materials, String(patch.value)); break;
    case "exclusions.tags": next.exclusions.tags = changeArray(next.exclusions.tags, String(patch.value)); break;
    case "bundle.budget": if (next.bundle) next.bundle.budget = patch.value === null ? null : Number(patch.value); break;
    case "bundle.requiredCategories": if (next.bundle) next.bundle.requiredCategories = changeArray(next.bundle.requiredCategories, String(patch.value)); break;
    case "sort.field": next.sort.field = String(patch.value) as CatalogQueryPlanV1["sort"]["field"]; break;
    case "sort.direction": next.sort.direction = String(patch.value) as CatalogQueryPlanV1["sort"]["direction"]; break;
  }
  return next;
};
