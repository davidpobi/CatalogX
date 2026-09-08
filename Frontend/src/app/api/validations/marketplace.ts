import { z } from "zod";
import { CATEGORY_IDS, PRODUCT_TYPE_IDS, PRODUCT_TYPES_BY_CATEGORY } from "@/interfaces/catalog";

export const merchantApplicationInputSchema = z.object({
  brandName: z.string().trim().min(2).max(80),
  contactEmail: z.string().trim().email().max(160),
  website: z.string().trim().url().max(240).or(z.literal("")),
  country: z.string().trim().min(2).max(80),
  catalogueDescription: z.string().trim().min(20).max(600),
});

const shortList = z.array(z.string().trim().min(1).max(60)).min(1).max(12);
export const merchantListingDraftSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(300),
  category: z.enum(CATEGORY_IDS),
  productType: z.enum(PRODUCT_TYPE_IDS as [typeof PRODUCT_TYPE_IDS[number], ...typeof PRODUCT_TYPE_IDS[number][]]),
  currentPrice: z.number().positive().max(1_000_000),
  originalPrice: z.number().positive().max(1_000_000),
  inventory: z.number().int().min(0).max(1_000_000),
  deliveryDays: z.number().int().min(1).max(90),
  rooms: shortList,
  styles: shortList,
  colors: shortList,
  materials: shortList,
  features: shortList,
  width: z.number().positive().max(10_000),
  height: z.number().positive().max(10_000),
  depth: z.number().positive().max(10_000),
  imageStoragePath: z.string().regex(/^projects\/CatalogX\/merchant-assets\/[A-Za-z0-9_-]+\/[a-f0-9-]+\.jpg$/).max(300),
}).superRefine((draft, context) => {
  if (draft.originalPrice < draft.currentPrice) context.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price must be at least the current price." });
  if (!(PRODUCT_TYPES_BY_CATEGORY[draft.category] as readonly string[]).includes(draft.productType)) context.addIssue({ code: "custom", path: ["productType"], message: "Product type must belong to the selected category." });
});

export const idSchema = z.string().trim().min(1).max(120);
export const collectionNameSchema = z.string().trim().min(1).max(80);
export const reviewSchema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).nullable().default(null) })
  .superRefine((value, context) => { if (value.decision === "reject" && !value.reason) context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required." }); });
