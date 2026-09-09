"use client";

import Image from "next/image";
import { Armchair, BedDouble, LampFloor, PackageOpen, Table2, UtensilsCrossed, Waves, Frame, TreePine, Archive } from "lucide-react";
import { useState } from "react";
import type { CategoryId, Product } from "@/interfaces/catalog";
import { PLACEHOLDER_ASSETS_READY, placeholderPath } from "@/data/placeholderPrompts";

const icons: Record<CategoryId, typeof Armchair> = {
  seating: Armchair, "tables-desks": Table2, beds: BedDouble, storage: Archive, lighting: LampFloor,
  "rugs-textiles": Waves, "kitchen-dining": UtensilsCrossed, outdoor: TreePine,
  "mirrors-wall-decor": Frame, accessories: PackageOpen,
};

type VisualProduct = Pick<Product, "category" | "image">;

export function ProductVisual({ product, priority = false }: { product: VisualProduct; priority?: boolean }) {
  const source = product.image.heroUrl || (PLACEHOLDER_ASSETS_READY ? placeholderPath(product.image.placeholderCategory) : null);
  const [failed, setFailed] = useState(false);
  const Icon = icons[product.category];
  return <div className={`product-visual visual-${product.category}`}>
    {source && !failed && <Image src={source} alt={product.image.alt} fill sizes="(max-width: 720px) 50vw, (max-width: 1200px) 33vw, 25vw" priority={priority} loading={priority ? "eager" : "lazy"} onError={() => setFailed(true)} />}
    {(!source || failed) && <div className="generated-fallback"><Icon aria-hidden="true" /><span>{product.category.replaceAll("-", " ")}</span></div>}
  </div>;
}
