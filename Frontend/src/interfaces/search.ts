import type { Availability, CategoryId, ProductType } from "./catalog";

export enum SearchOperations {
  CompileQuery = "compileQuery",
}

export type PreferenceField = "style" | "color" | "material" | "room" | "tag" | "productType" | "useCase" | "feature";
export type InterpretationChipField =
  | "categories"
  | "filters.productTypes"
  | "filters.rooms" | "filters.styles" | "filters.colors" | "filters.materials" | "filters.availability"
  | "filters.price.min" | "filters.price.max" | "filters.discountOnly" | "filters.maxDeliveryDays"
  | "filters.dimensions.maxWidth" | "filters.dimensions.maxHeight" | "filters.dimensions.maxDepth"
  | "exclusions.productTypes" | "exclusions.colors" | "exclusions.materials" | "exclusions.tags"
  | `preferences.${PreferenceField}`;

export interface CatalogSearchVocabulary {
  categories: CategoryId[];
  productTypes: ProductType[];
  rooms: string[];
  styles: string[];
  colors: string[];
  materials: string[];
  availability: Availability[];
  tags: string[];
  useCases: string[];
  features: string[];
}

export interface CatalogQueryPlanV1 {
  version: "1";
  mode: "products" | "bundle";
  searchText: string;
  categories: CategoryId[];
  filters: {
    productTypes: ProductType[];
    rooms: string[];
    styles: string[];
    colors: string[];
    materials: string[];
    availability: Availability[];
    price: { min: number | null; max: number | null };
    discountOnly: boolean;
    maxDeliveryDays: number | null;
    dimensions: {
      maxWidth: number | null;
      maxHeight: number | null;
      maxDepth: number | null;
    };
  };
  exclusions: {
    productTypes: ProductType[];
    colors: string[];
    materials: string[];
    tags: string[];
  };
  preferences: Array<{ field: PreferenceField; value: string; weight: number }>;
  sort: { field: "relevance" | "price" | "rating" | "discount"; direction: "asc" | "desc" };
  limit: number;
  bundle: {
    room: string;
    budget: number | null;
    requiredCategories: CategoryId[];
    itemCount: number;
  } | null;
}

export interface InterpretationChip {
  id: string;
  label: string;
  field: InterpretationChipField;
  value: string | number | boolean;
}

export interface SearchInterpretation {
  summary: string;
  chips: InterpretationChip[];
  assumptions: string[];
}

export interface CompileSearchData {
  plan: CatalogQueryPlanV1;
  interpretation: SearchInterpretation;
  compiler: "gpt-5.6-terra" | "fallback";
}
