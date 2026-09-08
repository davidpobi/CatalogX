import { ListingEditor } from "@/components/ListingEditor";
export default async function MerchantListingPage({ params }: { params: Promise<{ id: string }> }) { return <ListingEditor listingId={(await params).id} />; }
