import "server-only";
import { createHash } from "node:crypto";
import { CATEGORY_DESCRIPTIONS, MOOD_DEFINITIONS, PRODUCT_TYPE_ALIASES, STORE_CONTEXT } from "@/config/catalogIntelligence";
import { CATEGORY_IDS, CATEGORY_LABELS, type Availability, type Product, type ProductType } from "@/interfaces/catalog";
import type { CatalogIntelligenceContextV1, ProductTypeDefinition, SemanticRelationship } from "@/interfaces/intelligence";
import { buildSearchVocabulary } from "@/utils/searchVocabulary";

let cached: CatalogIntelligenceContextV1 | null = null;

export const catalogueVersionFor = (products: Product[]) => createHash("sha256").update(products.map((product) => product.sourceHash).join(":"), "utf8").digest("hex").slice(0, 16);

const range = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
const label = (value: string) => value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const productTypeDefinitions = (products: Product[]): ProductTypeDefinition[] => {
  const values = [...new Set(products.map((product) => product.productType))].sort();
  return values.map((id) => ({
    id,
    label: label(id),
    categories: [...new Set(products.filter((product) => product.productType === id).map((product) => product.category))],
    aliases: [...new Set([id.replaceAll("-", " "), ...(PRODUCT_TYPE_ALIASES[id] || [])])],
  }));
};

const relationshipFor = (mood: (typeof MOOD_DEFINITIONS)[number]): SemanticRelationship => ({
  concept: mood.id,
  meaning: `${label(mood.id)} intent should influence ranking through available catalogue attributes, not become a hard filter unless the customer names an attribute explicitly.`,
  weightedPreferences: [
    ...mood.styles.map((value) => ({ field: "style" as const, value, weight: 0.85 })),
    ...mood.colors.map((value) => ({ field: "color" as const, value, weight: 0.65 })),
    ...mood.materials.map((value) => ({ field: "material" as const, value, weight: 0.7 })),
    ...mood.productTypes.map((value) => ({ field: "productType" as const, value, weight: 0.55 })),
    ...mood.features.map((value) => ({ field: "feature" as const, value, weight: 0.5 })),
    ...mood.tags.map((value) => ({ field: "tag" as const, value, weight: 0.5 })),
  ],
});

const assertSemanticsMatchCatalogue = (products: Product[]) => {
  const vocabulary = buildSearchVocabulary(products);
  const allowed = {
    colors: new Set(vocabulary.colors), materials: new Set(vocabulary.materials), styles: new Set(vocabulary.styles),
    productTypes: new Set(vocabulary.productTypes), rooms: new Set(vocabulary.rooms), features: new Set(vocabulary.features), tags: new Set(vocabulary.tags),
  };
  for (const mood of MOOD_DEFINITIONS) {
    for (const key of Object.keys(allowed) as Array<keyof typeof allowed>) {
      for (const value of mood[key]) if (!allowed[key].has(value as never)) throw new Error(`Lifestyle semantic ${mood.id}.${key} contains unavailable value: ${value}`);
    }
  }
};

export const getCatalogIntelligenceContext = (products: Product[]): CatalogIntelligenceContextV1 => {
  const catalogueVersion = catalogueVersionFor(products);
  if (cached?.catalogueVersion === catalogueVersion) return cached;
  assertSemanticsMatchCatalogue(products);
  const vocabulary = buildSearchVocabulary(products);
  const availabilityValues: Availability[] = ["in_stock", "low_stock", "backorder", "out_of_stock"];
  cached = {
    version: "1",
    catalogueVersion,
    store: STORE_CONTEXT,
    lifestyle: { ...vocabulary, moods: MOOD_DEFINITIONS, relationships: MOOD_DEFINITIONS.map(relationshipFor) },
    assortment: {
      productCount: products.length,
      productTypes: productTypeDefinitions(products),
      categories: CATEGORY_IDS.map((id) => {
        const categoryProducts = products.filter((product) => product.category === id);
        return {
          id, label: CATEGORY_LABELS[id], description: CATEGORY_DESCRIPTIONS[id], productCount: categoryProducts.length,
          productTypes: [...new Set(categoryProducts.map((product) => product.productType))] as ProductType[],
          price: range(categoryProducts.map((product) => product.currentPrice)),
          deliveryDays: range(categoryProducts.map((product) => product.deliveryDays)),
          availability: Object.fromEntries(availabilityValues.map((value) => [value, categoryProducts.filter((product) => product.availability === value).length])) as Record<Availability, number>,
        };
      }),
      dimensions: {
        unit: "in",
        width: range(products.map((product) => product.dimensions.width)),
        height: range(products.map((product) => product.dimensions.height)),
        depth: range(products.map((product) => product.dimensions.depth)),
      },
    },
  };
  return cached;
};
