import type { CategoryId } from "@/interfaces/catalog";
import type { LandingAsset } from "@/interfaces/landing";

const asset = (
  id: string,
  name: string,
  category: CategoryId,
  token: string,
  alt: string,
): LandingAsset => {
  const storagePath = `projects/CatalogX/assets/products/${id}/hero.jpg`;
  return {
    id,
    name,
    category,
    image: {
      status: "final",
      placeholderCategory: category,
      heroUrl: `https://firebasestorage.googleapis.com/v0/b/bashbash-labs.firebasestorage.app/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
      storagePath,
      alt,
    },
  };
};

const alderLoungeChair = asset("cx-seating-01", "Alder Lounge Chair", "seating", "5b0beffb-ac77-4a14-a849-cbc731415e29", "Alder lounge chair in a warm neutral studio setting");
const ivarnBookcase = asset("cx-storage-02", "Ivarn Bookcase", "storage", "664f6072-dd3b-439c-8629-c53e24f83567", "Ivarn bookcase in a warm neutral studio setting");
const vannWallLamp = asset("cx-lighting-04", "Vann Wall Lamp", "lighting", "205ef093-b80d-45f4-ba62-1e2ef18d62d3", "Vann wall lamp in a warm neutral studio setting");
const runaServingBoard = asset("cx-kitchen-dining-03", "Runa Serving Board", "kitchen-dining", "4ddd24ac-f134-456e-979c-500f23fd977e", "Runa serving board in a warm neutral studio setting");
const pavoArchedMirror = asset("cx-mirrors-wall-decor-05", "Pavo Arched Mirror", "mirrors-wall-decor", "60c8e8a8-8f9e-4f8e-be02-d9fee5c70e73", "Pavo arched mirror in a warm neutral studio setting");
const klintCoffeeTable = asset("cx-tables-desks-01", "Klint Coffee Table", "tables-desks", "4adfd230-87a2-462b-b9ad-d75e7495fd3f", "Klint coffee table in a warm neutral studio setting");
const skenFloorLamp = asset("cx-lighting-01", "Sken Floor Lamp", "lighting", "c91be3ba-7792-4e3f-81dc-5b775b22bb26", "Sken floor lamp in a warm neutral studio setting");
const lumaWritingDesk = asset("cx-tables-desks-02", "Luma Writing Desk", "tables-desks", "5689553c-f0e5-462c-88fa-33c27f0286da", "Luma writing desk in a warm neutral studio setting");
const joraDeskChair = asset("cx-seating-10", "Jora Desk Chair", "seating", "78a8a515-920a-4364-8c0f-c86375ae6298", "Jora desk chair in a warm neutral studio setting");
const lindeShelvingUnit = asset("cx-storage-05", "Linde Shelving Unit", "storage", "5b10e8bc-4123-4a1b-b6b4-ac078bb1168d", "Linde shelving unit in a warm neutral studio setting");
const fjordLinenBed = asset("cx-beds-09", "Fjord Linen Bed", "beds", "65a1271b-904a-4530-8184-6cef79a042a8", "Fjord linen bed in a warm neutral studio setting");
const brisLantern = asset("cx-lighting-08", "Bris Lantern", "lighting", "54e78dc8-5272-4655-bdec-109502db683d", "Bris lantern in a warm neutral studio setting");
const loomCottonRug = asset("cx-rugs-textiles-07", "Loom Cotton Rug", "rugs-textiles", "39c0ab2e-01ce-46af-867d-b9ca20a15d48", "Loom cotton rug in a warm neutral studio setting");

export const LANDING_FEATURED_ASSETS = [
  alderLoungeChair,
  ivarnBookcase,
  vannWallLamp,
  runaServingBoard,
  pavoArchedMirror,
] satisfies LandingAsset[];

export const LANDING_EXAMPLES = [
  {
    label: "A calm living room",
    prompt: "Furnish a calm Japandi living room under $1,500",
    sceneAssets: [alderLoungeChair, klintCoffeeTable, skenFloorLamp],
  },
  {
    label: "Small-space working",
    prompt: "A compact oak desk and comfortable chair for a small home office",
    sceneAssets: [lumaWritingDesk, joraDeskChair, lindeShelvingUnit],
  },
  {
    label: "Ready this week",
    prompt: "Warm bedroom lighting in stock and delivered within 7 days",
    sceneAssets: [fjordLinenBed, brisLantern, loomCottonRug],
  },
] satisfies Array<{ label: string; prompt: string; sceneAssets: LandingAsset[] }>;
