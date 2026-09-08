import type { Product } from "@/interfaces/catalog";
import type { CatalogQueryPlanV1, CatalogSearchVocabulary, CompileSearchData, PreferenceField } from "@/interfaces/search";
import { isPlanConstraintActive } from "./queryPlan";

const unique = <T extends string>(values: T[]): T[] => [...new Set(values)].sort();

export const buildSearchVocabulary = (products: Product[]): CatalogSearchVocabulary => ({
  categories: unique(products.map((product) => product.category)) as CatalogSearchVocabulary["categories"],
  productTypes: unique(products.map((product) => product.productType)) as CatalogSearchVocabulary["productTypes"],
  rooms: unique(products.flatMap((product) => product.rooms)),
  styles: unique(products.flatMap((product) => product.styles)),
  colors: unique(products.flatMap((product) => product.colors)),
  materials: unique(products.flatMap((product) => product.materials)),
  availability: unique(products.map((product) => product.availability)) as CatalogSearchVocabulary["availability"],
  tags: unique(products.flatMap((product) => product.tags)),
  useCases: unique(products.flatMap((product) => product.useCases)),
  features: unique(products.flatMap((product) => product.features)),
});

const canonical = <T extends string>(values: T[], allowed: T[]) => {
  const lookup = new Map(allowed.map((value) => [value.toLowerCase(), value]));
  return unique(values.map((value) => lookup.get(value.toLowerCase())).filter((value): value is T => Boolean(value)));
};

export const normalizeCompiledSearch = (compiled: CompileSearchData, vocabulary: CatalogSearchVocabulary): CompileSearchData => {
  const plan: CatalogQueryPlanV1 = structuredClone(compiled.plan);
  plan.categories = canonical(plan.categories, vocabulary.categories);
  plan.filters.productTypes = canonical(plan.filters.productTypes, vocabulary.productTypes);
  plan.filters.rooms = canonical(plan.filters.rooms, vocabulary.rooms);
  plan.filters.styles = canonical(plan.filters.styles, vocabulary.styles);
  plan.filters.colors = canonical(plan.filters.colors, vocabulary.colors);
  plan.filters.materials = canonical(plan.filters.materials, vocabulary.materials);
  plan.filters.availability = canonical(plan.filters.availability, vocabulary.availability);
  plan.exclusions.productTypes = canonical(plan.exclusions.productTypes, vocabulary.productTypes);
  plan.exclusions.colors = canonical(plan.exclusions.colors, vocabulary.colors);
  plan.exclusions.materials = canonical(plan.exclusions.materials, vocabulary.materials);
  plan.exclusions.tags = canonical(plan.exclusions.tags, vocabulary.tags);
  if (plan.bundle) plan.bundle.requiredCategories = canonical(plan.bundle.requiredCategories, vocabulary.categories);
  const preferenceValues: Record<PreferenceField, string[]> = {
    style: vocabulary.styles, color: vocabulary.colors, material: vocabulary.materials,
    room: vocabulary.rooms, tag: vocabulary.tags, productType: vocabulary.productTypes,
    useCase: vocabulary.useCases, feature: vocabulary.features,
  };
  plan.preferences = plan.preferences.flatMap((preference) => {
    const [value] = canonical([preference.value], preferenceValues[preference.field]);
    return value ? [{ ...preference, value }] : [];
  });
  return {
    ...compiled,
    plan,
    interpretation: {
      ...compiled.interpretation,
      chips: compiled.interpretation.chips.filter((chip) => isPlanConstraintActive(plan, chip)),
    },
  };
};
