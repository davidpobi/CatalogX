import type { CategoryId, ProductImage } from "./catalog";

export interface LandingAsset {
  id: string;
  name: string;
  category: CategoryId;
  image: ProductImage;
}
