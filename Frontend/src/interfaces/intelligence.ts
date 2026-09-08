import type { Availability, CategoryId, ProductType } from "./catalog";

export interface StoreContext {
  brand: "CatalogX";
  retailer: "Norr & Vale";
  description: string;
  currency: "USD";
  market: string;
  customerPromise: string;
  supportedExperiences: string[];
  assortmentBoundaries: string[];
}

export interface ProductTypeDefinition {
  id: ProductType;
  label: string;
  categories: CategoryId[];
  aliases: string[];
}

export interface MoodDefinition {
  id: string;
  colors: string[];
  materials: string[];
  styles: string[];
  productTypes: ProductType[];
  rooms: string[];
  features: string[];
  tags: string[];
}

export interface SemanticRelationship {
  concept: string;
  meaning: string;
  weightedPreferences: Array<{ field: "style" | "color" | "material" | "room" | "tag" | "productType" | "useCase" | "feature"; value: string; weight: number }>;
}

export interface LifestyleSemantics {
  rooms: string[];
  moods: MoodDefinition[];
  styles: string[];
  materials: string[];
  colors: string[];
  useCases: string[];
  features: string[];
  tags: string[];
  relationships: SemanticRelationship[];
}

export interface AssortmentCategoryContext {
  id: CategoryId;
  label: string;
  description: string;
  productCount: number;
  productTypes: ProductType[];
  price: { min: number; max: number };
  deliveryDays: { min: number; max: number };
  availability: Record<Availability, number>;
}

export interface AssortmentContext {
  productCount: number;
  categories: AssortmentCategoryContext[];
  productTypes: ProductTypeDefinition[];
  dimensions: {
    unit: "in";
    width: { min: number; max: number };
    height: { min: number; max: number };
    depth: { min: number; max: number };
  };
}

export interface CatalogIntelligenceContextV1 {
  version: "1";
  catalogueVersion: string;
  store: StoreContext;
  lifestyle: LifestyleSemantics;
  assortment: AssortmentContext;
}

export type QueryPatchField =
  | "categories"
  | "filters.productTypes"
  | "filters.rooms"
  | "filters.styles"
  | "filters.colors"
  | "filters.materials"
  | "filters.availability"
  | "filters.price.min"
  | "filters.price.max"
  | "filters.discountOnly"
  | "filters.maxDeliveryDays"
  | "filters.dimensions.maxWidth"
  | "filters.dimensions.maxHeight"
  | "filters.dimensions.maxDepth"
  | "exclusions.productTypes"
  | "exclusions.colors"
  | "exclusions.materials"
  | "exclusions.tags"
  | "bundle.budget"
  | "bundle.requiredCategories"
  | "sort.field"
  | "sort.direction";

export interface QueryPlanPatch {
  operation: "add" | "remove" | "set";
  field: QueryPatchField;
  value: string | number | boolean | null;
}

export interface SearchSuggestion {
  id: string;
  label: string;
  prompt: string;
  patch: QueryPlanPatch[];
  reason: string;
}

export interface QueryResultAssessment {
  resultCount: number;
  constraintsSatisfied: string[];
  constraintsWithoutCoverage: string[];
  bundleComplete: boolean;
  missingBundleCategories: CategoryId[];
  remainingBudget: number | null;
  candidateRelaxations: QueryPlanPatch[];
}
