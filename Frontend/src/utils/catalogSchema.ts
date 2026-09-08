import { z } from "zod";
import { CATEGORY_IDS, PRODUCT_TYPE_IDS, PRODUCT_TYPES_BY_CATEGORY } from "@/interfaces/catalog";

export const categorySchema = z.enum(CATEGORY_IDS);
export const productTypeSchema = z.enum(PRODUCT_TYPE_IDS as [typeof PRODUCT_TYPE_IDS[number], ...typeof PRODUCT_TYPE_IDS[number][]]);
export const availabilitySchema = z.enum(["in_stock", "low_stock", "backorder", "out_of_stock"]);

export const productSchema = z.object({
  id: z.string().regex(/^cx-[a-z0-9-]+-\d{2}$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  retailer: z.literal("Norr & Vale"),
  name: z.string().min(3).max(80),
  description: z.string().min(20).max(300),
  category: categorySchema,
  productType: productTypeSchema,
  currentPrice: z.number().positive(),
  originalPrice: z.number().positive(),
  discountPercent: z.number().int().min(0).max(90),
  inventory: z.number().int().min(0),
  availability: availabilitySchema,
  deliveryDays: z.number().int().min(1).max(90),
  rooms: z.array(z.string()).min(1),
  styles: z.array(z.string()).min(1),
  colors: z.array(z.string()).min(1),
  materials: z.array(z.string()).min(1),
  useCases: z.array(z.string()).min(1),
  features: z.array(z.string()).min(1),
  tags: z.array(z.string()).min(1),
  dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    unit: z.literal("in"),
  }),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  image: z.object({
    status: z.enum(["placeholder", "final"]),
    placeholderCategory: categorySchema,
    heroUrl: z.string().url().nullable(),
    storagePath: z.string().min(1).nullable(),
    alt: z.string().min(3).max(160),
  }),
});

export const catalogueSchema = z.array(productSchema).superRefine((products, context) => {
  if (products.length !== 100) context.addIssue({ code: "custom", message: "Catalogue must contain exactly 100 products." });
  const ids = new Set(products.map((product) => product.id));
  if (ids.size !== products.length) context.addIssue({ code: "custom", message: "Product IDs must be unique." });
  const slugs = new Set(products.map((product) => product.slug));
  if (slugs.size !== products.length) context.addIssue({ code: "custom", message: "Product slugs must be unique." });
  for (const category of CATEGORY_IDS) {
    if (products.filter((product) => product.category === category).length !== 10) {
      context.addIssue({ code: "custom", message: `${category} must contain exactly ten products.` });
    }
  }
  products.forEach((product, index) => {
    const allowed = PRODUCT_TYPES_BY_CATEGORY[product.category] as readonly string[];
    if (!allowed.includes(product.productType)) context.addIssue({ code: "custom", path: [index, "productType"], message: `${product.productType} is not valid for ${product.category}.` });
  });
});

export type ValidatedProduct = z.infer<typeof productSchema>;
