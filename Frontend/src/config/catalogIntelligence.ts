import type { MoodDefinition, StoreContext } from "@/interfaces/intelligence";
import type { CategoryId, ProductType } from "@/interfaces/catalog";

export const STORE_CONTEXT: StoreContext = {
  brand: "CatalogX",
  retailer: "Norr & Vale",
  description: "A fictional multi-merchant catalogue of considered furniture, lighting, textiles, décor, and home accessories.",
  currency: "USD",
  market: "Fictional home-furnishings demonstration catalogue",
  customerPromise: "Turn a customer's room, product, mood, budget, dimension, and delivery intent into a precise, editable catalogue plan.",
  supportedExperiences: ["category browsing", "natural-language discovery", "deterministic ranked results", "budget-aware room bundles", "targeted bundle replacement"],
  assortmentBoundaries: ["Physical home furnishings and décor only", "No appliances, construction, installation, design appointments, custom manufacturing, or live delivery guarantees", "All products, prices, inventory, ratings, and retailer details are fictional"],
};

export const CATEGORY_DESCRIPTIONS: Record<CategoryId, string> = {
  seating: "Chairs, benches, stools, loveseats, ottomans, and other pieces designed for sitting.",
  "tables-desks": "Work, dining, bedside, occasional, and display surfaces.",
  beds: "Bed frames and daybeds for primary, guest, and flexible sleeping spaces.",
  storage: "Freestanding and wall-mounted pieces for display, organization, and concealed storage.",
  lighting: "Ambient, task, reading, wall, ceiling, and portable lighting.",
  "rugs-textiles": "Rugs, curtains, cushions, throws, bedspreads, and other soft layers.",
  "kitchen-dining": "Tableware, cookware, serving pieces, drinkware, and dining accessories.",
  outdoor: "Furniture and accessories intended for patios, balconies, and gardens.",
  "mirrors-wall-decor": "Mirrors, prints, ledges, hangings, gallery sets, and wall sculpture.",
  accessories: "Decorative and practical finishing objects for rooms and surfaces.",
};

export const PRODUCT_TYPE_ALIASES: Partial<Record<ProductType, string[]>> = {
  "wall-lamp": ["sconce", "wall light"],
  pendant: ["hanging light", "pendant light"],
  "ceiling-light": ["overhead light"],
  "desk-lamp": ["office lamp"],
  "task-light": ["work light"],
  "writing-desk": ["home office desk", "small desk"],
  "standing-desk": ["sit stand desk", "height adjustable desk"],
  "media-console": ["tv stand", "entertainment unit"],
  sideboard: ["credenza", "buffet"],
  loveseat: ["two seater", "small sofa"],
  "outdoor-sofa": ["patio sofa", "garden sofa"],
  "flatweave-rug": ["flat weave rug"],
  runner: ["runner rug", "hallway rug"],
  "arched-mirror": ["arch mirror"],
  "dining-set": ["tableware set"],
};

export const MOOD_DEFINITIONS: MoodDefinition[] = [
  { id: "calm", colors: ["oat", "sand", "cream", "ivory", "stone"], materials: ["oak", "linen", "wool", "cotton"], styles: ["Japandi", "Scandinavian", "minimal", "organic"], productTypes: ["lounge-chair", "wool-rug"], rooms: ["living room", "bedroom"], features: ["compact footprint"], tags: ["timeless"] },
  { id: "warm", colors: ["oat", "clay", "cream", "walnut"], materials: ["oak", "linen", "wool", "wood"], styles: ["organic", "rustic", "Japandi"], productTypes: ["table-lamp", "throw"], rooms: ["living room", "bedroom"], features: ["responsibly sourced material"], tags: ["natural"] },
  { id: "airy", colors: ["cream", "ivory", "white", "chalk"], materials: ["linen", "paper", "glass"], styles: ["minimal", "Scandinavian", "soft modern"], productTypes: ["pendant", "round-mirror"], rooms: ["living room", "bedroom"], features: ["compact footprint"], tags: ["space-saving"] },
  { id: "cosy", colors: ["oat", "cream", "charcoal", "clay"], materials: ["wool", "linen", "cotton", "wood"], styles: ["organic", "rustic", "textural"], productTypes: ["loveseat", "floor-lamp", "throw"], rooms: ["living room", "bedroom"], features: ["easy-care finish"], tags: ["timeless"] },
  { id: "playful", colors: ["clay", "sage", "brass"], materials: ["ceramic", "metal", "glass"], styles: ["bohemian", "artisanal", "contemporary"], productTypes: ["sculptural-object", "accent-chair"], rooms: ["living room", "entryway"], features: ["statement silhouette"], tags: ["artisanal"] },
  { id: "refined", colors: ["black", "cream", "brass", "walnut"], materials: ["glass", "oak", "steel"], styles: ["contemporary", "minimal", "soft modern"], productTypes: ["console", "arched-mirror"], rooms: ["living room", "entryway"], features: ["statement silhouette"], tags: ["timeless"] },
  { id: "minimal", colors: ["white", "black", "natural", "oat"], materials: ["oak", "steel", "linen"], styles: ["minimal", "Japandi", "Scandinavian"], productTypes: ["platform-bed", "floor-lamp"], rooms: ["bedroom", "living room", "home office"], features: ["compact footprint"], tags: ["space-saving"] },
  { id: "textural", colors: ["ivory", "clay", "charcoal"], materials: ["wool", "cotton", "jute", "rattan"], styles: ["textural", "bohemian", "organic"], productTypes: ["flatweave-rug", "cushion-set"], rooms: ["living room", "bedroom"], features: ["responsibly sourced material"], tags: ["woven fiber"] },
  { id: "compact", colors: ["natural", "white", "black"], materials: ["oak", "steel", "ash"], styles: ["minimal", "modern", "Scandinavian"], productTypes: ["nesting-table", "desk-chair"], rooms: ["home office", "living room", "entryway"], features: ["compact footprint"], tags: ["space-saving"] },
  { id: "family-friendly", colors: ["oat", "sand", "natural"], materials: ["oak", "cotton", "wood"], styles: ["modern", "organic", "Scandinavian"], productTypes: ["loveseat", "storage-bench"], rooms: ["living room", "dining room"], features: ["easy-care finish"], tags: ["timeless"] },
  { id: "entertaining", colors: ["walnut", "brass", "smoke"], materials: ["wood", "glass", "ceramic"], styles: ["modern", "contemporary", "rustic"], productTypes: ["dining-table", "barware-set"], rooms: ["dining room", "kitchen"], features: ["statement silhouette"], tags: ["dining set"] },
  { id: "work-focused", colors: ["natural", "black", "graphite"], materials: ["oak", "steel", "ash"], styles: ["minimal", "modern", "industrial"], productTypes: ["writing-desk", "desk-chair", "task-light"], rooms: ["home office"], features: ["compact footprint"], tags: ["space-saving"] },
];
