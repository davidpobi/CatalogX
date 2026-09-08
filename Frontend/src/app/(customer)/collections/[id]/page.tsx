import { CollectionDetail } from "@/components/CollectionDetail";
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) { return <CollectionDetail id={(await params).id} />; }
