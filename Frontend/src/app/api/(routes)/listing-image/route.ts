import { NextRequest, NextResponse } from "next/server";
import { isGoogleSession, isPasswordAdminSession, sessionFromRequest } from "../../utils/authUtils";
import { getListingForReview } from "../../services/admin.service";
import { getAdminBucket } from "@/app/api/config/firebaseAdmin";
import { withRouteBoundary } from "../../utils/httpUtils";

const get = async (request: NextRequest) => {
  const listingId = request.nextUrl.searchParams.get("listingId");
  if (!listingId) return new NextResponse(null, { status: 404 });
  const session = await sessionFromRequest(request);
  const listing = await getListingForReview(listingId);
  if (!session || !listing) return new NextResponse(null, { status: 404 });
  const allowed = isPasswordAdminSession(session) || (isGoogleSession(session) && listing.merchantId === session.user.uid);
  if (!allowed) return new NextResponse(null, { status: 404 });
  const [url] = await getAdminBucket().file(listing.draftVersion.draft.imageStoragePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60_000 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
};

export const GET = withRouteBoundary("listing-image", async (request) => get(request));
