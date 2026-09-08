"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_IDS, CATEGORY_LABELS, PRODUCT_TYPES_BY_CATEGORY, type CategoryId } from "@/interfaces/catalog";
import type { MerchantListingDraft } from "@/interfaces/merchant";
import { loadMerchantAction, saveListingAction, submitListingAction, uploadListingImageAction } from "@/redux/accountThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { AccountShell } from "./AccountShell";
import { Button } from "./primitives";

const defaults: MerchantListingDraft = { name: "", description: "", category: "seating", productType: "lounge-chair", currentPrice: 1, originalPrice: 1, inventory: 0, deliveryDays: 5, rooms: ["Living Room"], styles: ["Modern"], colors: ["Neutral"], materials: ["Wood"], features: ["Home décor"], width: 1, height: 1, depth: 1, imageStoragePath: "" };
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
export function ListingEditor({ listingId }: { listingId?: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const listings = useAppSelector((state) => state.merchant.listings);
  const status = useAppSelector((state) => state.merchant.status);
  const existing = useMemo(() => listings.find((listing) => listing.id === listingId), [listingId, listings]);
  const [draft, setDraft] = useState(defaults);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  useEffect(() => { void dispatch(loadMerchantAction()); }, [dispatch]);
  // The repository-backed draft arrives after the protected client workspace hydrates.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (existing) setDraft(existing.draftVersion.draft); }, [existing]);
  const locked = existing?.draftVersion.status === "pending" || existing?.status === "archived";
  const field = (key: keyof MerchantListingDraft, value: string | number | string[]) => setDraft((current) => ({ ...current, [key]: value }));
  return <AccountShell eyebrow="Merchant listing" title={existing ? existing.draftVersion.draft.name : "Add a product."}><form className="listing-form" onSubmit={async (event) => { event.preventDefault(); await dispatch(saveListingAction(draft, listingId)); if (!listingId) router.replace("/merchant/listings"); }}><label>Product name<input value={draft.name} onChange={(event) => field("name", event.target.value)} disabled={locked} required /></label><label>Product image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setImagePreview(URL.createObjectURL(file)); const image = await dispatch(uploadListingImageAction(file)); if (image) field("imageStoragePath", image.storagePath); } }} />{(imagePreview || draft.imageStoragePath) && <small>Private image uploaded</small>}</label><label>Category<select value={draft.category} onChange={(event) => { const category = event.target.value as CategoryId; setDraft({ ...draft, category, productType: PRODUCT_TYPES_BY_CATEGORY[category][0] }); }} disabled={locked}>{CATEGORY_IDS.map((category) => <option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}</select></label><label>Product type<select value={draft.productType} onChange={(event) => field("productType", event.target.value)} disabled={locked}>{PRODUCT_TYPES_BY_CATEGORY[draft.category].map((type) => <option key={type}>{type}</option>)}</select></label><label>Current price<input type="number" min="1" value={draft.currentPrice} onChange={(event) => field("currentPrice", Number(event.target.value))} disabled={locked} /></label><label>Original price<input type="number" min="1" value={draft.originalPrice} onChange={(event) => field("originalPrice", Number(event.target.value))} disabled={locked} /></label><label>Inventory<input type="number" min="0" value={draft.inventory} onChange={(event) => field("inventory", Number(event.target.value))} disabled={locked} /></label><label>Delivery days<input type="number" min="1" value={draft.deliveryDays} onChange={(event) => field("deliveryDays", Number(event.target.value))} disabled={locked} /></label><label className="wide">Description<textarea value={draft.description} onChange={(event) => field("description", event.target.value)} disabled={locked} required /></label>{(["rooms", "styles", "colors", "materials", "features"] as const).map((key) => <label key={key}>{key}<input value={draft[key].join(", ")} onChange={(event) => field(key, split(event.target.value))} disabled={locked} /></label>)}{(["width", "height", "depth"] as const).map((key) => <label key={key}>{key} (in)<input type="number" min="1" value={draft[key]} onChange={(event) => field(key, Number(event.target.value))} disabled={locked} /></label>)}{!locked && <div className="form-actions wide"><Button type="submit" disabled={status === "loading" || !draft.imageStoragePath}>Save draft</Button>{existing?.draftVersion.status === "draft" && <Button type="button" onClick={() => dispatch(submitListingAction(existing.id))}>Submit for approval</Button>}</div>}</form></AccountShell>;
}
