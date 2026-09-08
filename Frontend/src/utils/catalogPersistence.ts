export const CATALOGX_PROJECTS_COLLECTION = "projects";
export const CATALOGX_PROJECT_DOCUMENT = "CatalogX";
export const CATALOGX_PRODUCTS_SUBCOLLECTION = "products";
export const CATALOGX_RATE_LIMITS_SUBCOLLECTION = "rateLimits";
export const CATALOGX_STORAGE_ROOT = "projects/CatalogX/assets/products";

export const catalogProductStoragePath = (productId: string) =>
  `${CATALOGX_STORAGE_ROOT}/${productId}/hero.jpg`;
