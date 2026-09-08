export const catalogOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_CATALOGX_URL || process.env.CATALOGX_SITE_URL;
  try {
    return new URL(configured || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
};

export const productPath = (slug: string) => `/store/${encodeURIComponent(slug)}`;
export const productUrl = (slug: string) => `${catalogOrigin()}${productPath(slug)}`;
