import type { QueryResultAssessment, SearchSuggestion } from "./intelligence";

export const CATEGORY_IDS = [
  "seating",
  "tables-desks",
  "beds",
  "storage",
  "lighting",
  "rugs-textiles",
  "kitchen-dining",
  "outdoor",
  "mirrors-wall-decor",
  "accessories",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const PRODUCT_TYPES_BY_CATEGORY = {
  seating: ["lounge-chair", "dining-chair", "armchair", "bench", "stool", "accent-chair", "loveseat", "rocking-chair", "ottoman", "desk-chair"],
  "tables-desks": ["coffee-table", "writing-desk", "dining-table", "side-table", "console", "standing-desk", "nesting-table", "round-table", "work-table", "bedside-table"],
  beds: ["platform-bed", "upholstered-bed", "daybed", "storage-bed", "canopy-bed", "guest-bed", "low-bed", "oak-bed", "linen-bed", "slatted-bed"],
  storage: ["cabinet", "bookcase", "sideboard", "wardrobe", "shelving-unit", "drawer-chest", "media-console", "wall-shelf", "storage-bench", "display-cabinet"],
  lighting: ["floor-lamp", "table-lamp", "pendant", "wall-lamp", "desk-lamp", "ceiling-light", "reading-lamp", "lantern", "cluster-light", "task-light"],
  "rugs-textiles": ["wool-rug", "flatweave-rug", "throw", "cushion-set", "runner", "curtain-pair", "cotton-rug", "bedspread", "woven-mat", "floor-cushion"],
  "kitchen-dining": ["dinnerware-set", "cutlery-set", "serving-board", "glass-set", "carafe", "bowl-set", "cookware-set", "tray", "dining-set", "barware-set"],
  outdoor: ["lounge-chair", "bistro-table", "bench", "dining-chair", "planter", "side-table", "deck-chair", "outdoor-sofa", "stool", "dining-set"],
  "mirrors-wall-decor": ["round-mirror", "wall-mirror", "art-print", "textile-hanging", "arched-mirror", "wall-sculpture", "picture-ledge", "framed-print", "gallery-set", "accent-mirror"],
  accessories: ["ceramic-vase", "candleholder", "basket", "table-clock", "bookend-set", "decorative-bowl", "plant-pot", "catchall-tray", "sculptural-object", "lantern"],
} as const satisfies Record<CategoryId, readonly string[]>;

export type ProductType = (typeof PRODUCT_TYPES_BY_CATEGORY)[CategoryId][number];
export const PRODUCT_TYPE_IDS: readonly ProductType[] = [...new Set(Object.values(PRODUCT_TYPES_BY_CATEGORY).flat())];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  seating: "Seating",
  "tables-desks": "Tables & desks",
  beds: "Beds",
  storage: "Storage",
  lighting: "Lighting",
  "rugs-textiles": "Rugs & textiles",
  "kitchen-dining": "Kitchen & dining",
  outdoor: "Outdoor",
  "mirrors-wall-decor": "Mirrors & wall décor",
  accessories: "Accessories",
};

export type Availability = "in_stock" | "low_stock" | "backorder" | "out_of_stock";

export interface ProductImage {
  status: "placeholder" | "final";
  placeholderCategory: CategoryId;
  heroUrl: string | null;
  storagePath: string | null;
  alt: string;
}

export interface ProductDimensions {
  width: number;
  height: number;
  depth: number;
  unit: "in";
}

export interface Product {
  id: string;
  slug: string;
  sourceHash: string;
  source: "platform" | "merchant";
  merchantId: string | null;
  retailer: string;
  name: string;
  description: string;
  category: CategoryId;
  productType: ProductType;
  currentPrice: number;
  originalPrice: number;
  discountPercent: number;
  inventory: number;
  availability: Availability;
  deliveryDays: number;
  rooms: string[];
  styles: string[];
  colors: string[];
  materials: string[];
  useCases: string[];
  features: string[];
  tags: string[];
  dimensions: ProductDimensions;
  rating: number;
  reviewCount: number;
  image: ProductImage;
}

export enum CatalogOperations {
  ListProducts = "listProducts",
  QueryProducts = "queryProducts",
  ReplaceBundleProduct = "replaceBundleProduct",
}

export interface CatalogFacets {
  categories: CategoryId[];
  productTypes: ProductType[];
  rooms: string[];
  styles: string[];
  colors: string[];
  materials: string[];
  availability: Availability[];
  price: { min: number; max: number };
}

export interface CatalogListData {
  products: Product[];
  facets: CatalogFacets;
  catalogueVersion: string;
}

export interface RankedProduct {
  product: Product;
  score: number;
  reasons: string[];
}

export interface ProductBundle {
  room: string;
  products: RankedProduct[];
  combinedPrice: number;
  budget: number | null;
}

export interface CatalogQueryData {
  mode: "products" | "bundle";
  products: RankedProduct[];
  bundle: ProductBundle | null;
  total: number;
  facets: CatalogFacets;
  assessment: QueryResultAssessment;
  suggestions: SearchSuggestion[];
}

export interface ReplaceBundleProductInput {
  currentProductIds: string[];
  targetProductId: string;
}
