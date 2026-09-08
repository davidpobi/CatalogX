import { NextRequest, NextResponse } from "next/server";
import { getPublicListingImageUrl } from "../../services/listingImage.service";
import { withRouteBoundary } from "../../utils/httpUtils";

const get = async (request: NextRequest) => {
  const productId = request.nextUrl.searchParams.get("productId");
  if (!productId || productId.length > 120) return new NextResponse(null, { status: 404 });
  const url = await getPublicListingImageUrl(productId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
};

export const GET = withRouteBoundary("product-image", async (request) => get(request));
