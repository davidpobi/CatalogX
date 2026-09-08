import { MOOD_DEFINITIONS, PRODUCT_TYPE_ALIASES } from "@/config/catalogIntelligence";
import { CATEGORY_IDS, CATEGORY_LABELS, PRODUCT_TYPE_IDS, type CategoryId, type ProductType } from "@/interfaces/catalog";
import type { CatalogIntelligenceContextV1 } from "@/interfaces/intelligence";
import type { CatalogQueryPlanV1, CompileSearchData, InterpretationChip, InterpretationChipField } from "@/interfaces/search";
import { emptyQueryPlan } from "./queryPlan";

const defaultRooms = ["living room", "bedroom", "dining room", "home office", "kitchen", "guest room", "entryway", "patio", "balcony", "garden"];
const defaultStyles = ["Japandi", "Scandinavian", "artisanal", "bohemian", "coastal", "contemporary", "industrial", "minimal", "modern", "organic", "rustic", "soft modern", "textural"];
const defaultColors = ["black", "brass", "chalk", "charcoal", "clay", "cream", "graphite", "ivory", "natural", "oat", "sage", "sand", "smoke", "stone", "walnut", "white"];
const defaultMaterials = ["acacia", "aluminum", "ash", "beech", "ceramic", "cotton", "glass", "jute", "linen", "metal", "oak", "paper", "rattan", "steel", "wood", "wool", "woven fiber"];

const present = (prompt: string, candidate: string) => prompt.toLowerCase().includes(candidate.toLowerCase());
const presentAsTerm = (prompt: string, candidate: string) => {
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(prompt);
};
const findMoney = (prompt: string) => [...prompt.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1].replaceAll(",", "")));

const productTypeDefinitions = (context?: CatalogIntelligenceContextV1) => context?.assortment.productTypes
  ?? PRODUCT_TYPE_IDS.map((id) => ({ id, label: id.replaceAll("-", " "), categories: [], aliases: PRODUCT_TYPE_ALIASES[id] || [] }));

const canonicalProductType = (prompt: string, context?: CatalogIntelligenceContextV1): ProductType[] => productTypeDefinitions(context)
  .filter(({ id, label, aliases }) => [id.replaceAll("-", " "), label, ...aliases].some((name) => present(prompt, name)))
  .map(({ id }) => id);

export const isRefinementPrompt = (rawPrompt: string, previousPlan?: CatalogQueryPlanV1 | null, context?: CatalogIntelligenceContextV1) => {
  if (!previousPlan) return false;
  const prompt = rawPrompt.trim().toLowerCase();
  if (/\b(instead|also|only|same|those|these|remove|cheaper|pricier|warmer|calmer|more|less|sort|add|change|switch|raise|lower|make it|show me another)\b/.test(prompt)) return true;
  const categoryNames = CATEGORY_IDS.flatMap((category) => [CATEGORY_LABELS[category], category.replaceAll("-", " ")]);
  const productTypeNames = productTypeDefinitions(context).flatMap(({ id, label, aliases }) => [id.replaceAll("-", " "), label, ...aliases]);
  const roomNames = context?.lifestyle.rooms ?? defaultRooms;
  const genericProductNames = ["lamp", "light", "chair", "table", "desk", "bed", "rug", "mirror", "sofa", "shelf", "cabinet", "bench", "stool", "curtain", "cushion", "storage"];
  const hasStandaloneSubject = [...categoryNames, ...productTypeNames, ...roomNames].some((value) => present(prompt, value))
    || genericProductNames.some((value) => presentAsTerm(prompt, value));
  if (hasStandaloneSubject) return false;
  return true;
};

const explicitlyExcluded = (prompt: string, value: string) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:no|not|without|exclude|excluding)\\s+(?:any\\s+)?${escaped}\\b`, "i").test(prompt);
};

export const compileFallbackQuery = (rawPrompt: string, previousPlan?: CatalogQueryPlanV1 | null, context?: CatalogIntelligenceContextV1): CompileSearchData => {
  const prompt = rawPrompt.trim().slice(0, 800);
  const lower = prompt.toLowerCase();
  const effectivePreviousPlan = isRefinementPrompt(prompt, previousPlan, context) ? previousPlan : null;
  const plan = effectivePreviousPlan ? structuredClone(effectivePreviousPlan) : emptyQueryPlan(prompt);
  const rooms = context?.lifestyle.rooms ?? defaultRooms;
  const styles = context?.lifestyle.styles ?? defaultStyles;
  const colors = context?.lifestyle.colors ?? defaultColors;
  const materials = context?.lifestyle.materials ?? defaultMaterials;
  plan.searchText = prompt;
  const matchingCategories = CATEGORY_IDS.filter((category) => present(prompt, CATEGORY_LABELS[category]) || present(prompt, category.replaceAll("-", " ")));
  if (matchingCategories.length) plan.categories = matchingCategories;
  const matchingProductTypes = canonicalProductType(prompt, context);
  const aliasesFor = (value: ProductType) => productTypeDefinitions(context).find(({ id }) => id === value)?.aliases ?? PRODUCT_TYPE_ALIASES[value] ?? [];
  const excludedProductTypes = matchingProductTypes.filter((value) => explicitlyExcluded(prompt, value.replaceAll("-", " ")) || aliasesFor(value).some((alias) => explicitlyExcluded(prompt, alias)));
  const includedProductTypes = matchingProductTypes.filter((value) => !excludedProductTypes.includes(value));
  if (includedProductTypes.length) plan.filters.productTypes = includedProductTypes;
  plan.exclusions.productTypes = [...new Set([...plan.exclusions.productTypes, ...excludedProductTypes])];
  plan.filters.productTypes = plan.filters.productTypes.filter((value) => !excludedProductTypes.includes(value));
  const matchingRooms = rooms.filter((room) => present(prompt, room));
  if (matchingRooms.length) plan.filters.rooms = matchingRooms;
  const matchingStyles = styles.filter((style) => present(prompt, style));
  const matchingColors = colors.filter((color) => present(prompt, color));
  const matchingMaterials = materials.filter((material) => present(prompt, material));
  const excludedColors = matchingColors.filter((value) => explicitlyExcluded(prompt, value));
  const excludedMaterials = matchingMaterials.filter((value) => explicitlyExcluded(prompt, value));
  if (matchingColors.some((value) => !excludedColors.includes(value))) plan.filters.colors = matchingColors.filter((value) => !excludedColors.includes(value));
  if (matchingMaterials.some((value) => !excludedMaterials.includes(value))) plan.filters.materials = matchingMaterials.filter((value) => !excludedMaterials.includes(value));
  plan.exclusions.colors = [...new Set([...plan.exclusions.colors, ...excludedColors])];
  plan.exclusions.materials = [...new Set([...plan.exclusions.materials, ...excludedMaterials])];
  plan.filters.colors = plan.filters.colors.filter((value) => !excludedColors.includes(value));
  plan.filters.materials = plan.filters.materials.filter((value) => !excludedMaterials.includes(value));
  if (/\b(discount|sale|marked down)\b/.test(lower)) plan.filters.discountOnly = true;
  if (/\bin stock\b/.test(lower)) plan.filters.availability = ["in_stock", "low_stock"];
  const money = findMoney(prompt);
  if (money[0] !== undefined) {
    if (/\b(around|about|roughly)\b/.test(lower)) plan.filters.price = { min: money[0] * 0.8, max: money[0] * 1.2 };
    else if (/\b(over|above|at least)\b/.test(lower)) plan.filters.price.min = money[0];
    else plan.filters.price.max = money[0];
  }
  if (/\bcheaper\b/.test(lower) && effectivePreviousPlan?.filters.price.max) plan.filters.price.max = Number((effectivePreviousPlan.filters.price.max * 0.8).toFixed(2));
  const delivery = lower.match(/(?:within|under)\s+(\d+)\s+days?/);
  if (delivery) plan.filters.maxDeliveryDays = Number(delivery[1]);
  if (/\b(room|furnish|bundle|whole space|complete)\b/.test(lower) && plan.filters.rooms.length) {
    plan.mode = "bundle";
    const room = plan.filters.rooms[0];
    const roomCategories: Record<string, CategoryId[]> = {
      "living room": ["seating", "tables-desks", "lighting", "rugs-textiles", "accessories"],
      bedroom: ["beds", "storage", "lighting", "rugs-textiles", "mirrors-wall-decor"],
      "dining room": ["tables-desks", "seating", "lighting", "kitchen-dining", "rugs-textiles"],
      "home office": ["tables-desks", "seating", "storage", "lighting", "accessories"],
      patio: ["outdoor", "lighting", "accessories"], balcony: ["outdoor", "lighting", "accessories"], garden: ["outdoor", "lighting", "accessories"],
    };
    const requiredCategories = roomCategories[room] || ["accessories", "lighting"];
    plan.bundle = { room, budget: money[0] ?? null, requiredCategories, itemCount: requiredCategories.length };
    if (money[0] !== undefined) plan.filters.price.max = null;
  }
  for (const value of matchingStyles) plan.preferences.push({ field: "style", value, weight: 0.8 });
  for (const mood of MOOD_DEFINITIONS.filter((definition) => present(prompt, definition.id))) {
    const relationship = context?.lifestyle.relationships.find((item) => item.concept === mood.id);
    const preferences = relationship?.weightedPreferences || [
      ...mood.styles.map((value) => ({ field: "style" as const, value, weight: 0.85 })),
      ...mood.colors.map((value) => ({ field: "color" as const, value, weight: 0.65 })),
      ...mood.materials.map((value) => ({ field: "material" as const, value, weight: 0.7 })),
    ];
    plan.preferences.push(...preferences);
  }
  plan.preferences = [...new Map(plan.preferences.map((preference) => [`${preference.field}:${preference.value.toLowerCase()}`, preference])).values()].slice(0, 20);
  const chips: InterpretationChip[] = [];
  const addChip = (field: InterpretationChipField, label: string, value: string | number | boolean) => chips.push({ id: `${field}-${chips.length}`, field, label, value });
  plan.categories.forEach((category) => addChip("categories", CATEGORY_LABELS[category], category));
  plan.filters.productTypes.forEach((productType) => addChip("filters.productTypes", productType.replaceAll("-", " "), productType));
  plan.filters.rooms.forEach((room) => addChip("filters.rooms", room, room));
  if (plan.filters.price.max !== null) addChip("filters.price.max", `Under $${Math.round(plan.filters.price.max)}`, plan.filters.price.max);
  if (plan.filters.discountOnly) addChip("filters.discountOnly", "On sale", true);
  plan.exclusions.productTypes.forEach((productType) => addChip("exclusions.productTypes", `No ${productType.replaceAll("-", " ")}`, productType));
  plan.exclusions.colors.forEach((color) => addChip("exclusions.colors", `No ${color}`, color));
  plan.exclusions.materials.forEach((material) => addChip("exclusions.materials", `No ${material}`, material));
  plan.preferences.forEach((preference) => addChip(`preferences.${preference.field}` as InterpretationChipField, preference.value, preference.value));
  return {
    plan,
    compiler: "fallback",
    interpretation: {
      summary: plan.mode === "bundle" ? `A coordinated ${plan.bundle?.room} bundle based on your request.` : "Products matched to your request and practical constraints.",
      chips,
      assumptions: chips.length ? [] : ["Showing the strongest overall catalogue matches."],
    },
  };
};
