import type { CategoryId } from "@/interfaces/catalog";

const shared = "Photorealistic 4:5 editorial catalogue product photography, warm neutral studio, seamless stone backdrop, soft directional daylight, restrained soft shadow, centered object, tactile materials, quiet Scandinavian mood, no people, no text, no logo, no watermark, no purple, no coral, no bright accent colors.";

export const PLACEHOLDER_PROMPTS: Record<CategoryId, string> = {
  seating: `${shared} Subject: a sculptural oatmeal linen armchair with pale oak legs.`,
  "tables-desks": `${shared} Subject: a minimal pale oak writing desk with slim joinery, shown without accessories.`,
  beds: `${shared} Subject: a low oak platform bed dressed in layered ivory linen, no surrounding furniture.`,
  storage: `${shared} Subject: a freestanding natural oak cabinet with subtle fluted doors.`,
  lighting: `${shared} Subject: a slender charcoal floor lamp with a softly glowing opal shade.`,
  "rugs-textiles": `${shared} Subject: a handwoven ivory wool rug with subtle charcoal linear texture.`,
  "kitchen-dining": `${shared} Subject: a simple dining arrangement of matte ceramic plates, clear glasses, and pale wood cutlery.`,
  outdoor: `${shared} Subject: a modern sand-colored outdoor lounge chair in powder-coated aluminum and woven fiber.`,
  "mirrors-wall-decor": `${shared} Subject: a large softly arched mirror with a thin natural oak frame.`,
  accessories: `${shared} Subject: a handmade chalk-white ceramic vase with a softly irregular silhouette.`,
};

// Set to true only after all ten generated assets have been reviewed and copied into public/.
export const PLACEHOLDER_ASSETS_READY = false;
export const placeholderPath = (category: CategoryId) => `/images/catalog/placeholders/${category}.jpg`;
