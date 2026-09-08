/* eslint-disable @next/next/no-img-element -- authenticated image endpoint redirects to a short-lived private URL. */
"use client";
import { useEffect, useState } from "react";
import { loadAdminAction, reviewListingAction, reviewMerchantAction, unpublishListingAction } from "@/redux/accountThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { AccountShell } from "./AccountShell";
import { Button } from "./primitives";

export function AdminDashboard({ view }: { view: "merchants" | "listings" }) {
  const dispatch = useAppDispatch();
  const admin = useAppSelector((state) => state.admin);
  const [reason, setReason] = useState<Record<string, string>>({});
  useEffect(() => { void dispatch(loadAdminAction()); }, [dispatch]);
  const items = view === "merchants" ? admin.applications : admin.listings;
  return <AccountShell eyebrow="CatalogX administration" title={view === "merchants" ? "Merchant applications." : "Listing review."}><div className="admin-tabs"><a href="/admin/merchants">Merchants</a><a href="/admin/listings">Listings</a></div><section className="management-list">{items.map((item) => {
    const id = "uid" in item ? item.uid : item.id;
    const title = "brandName" in item ? item.brandName : item.draftVersion.draft.name;
    const detail = "catalogueDescription" in item ? item.catalogueDescription : `${item.draftVersion.draft.category} · ${item.draftVersion.draft.productType} · $${item.draftVersion.draft.currentPrice} · ${item.draftVersion.draft.inventory} available`;
    const isListing = "draftVersion" in item;
    const pending = isListing && Boolean(item.pendingVersionId);
    return <article key={id}><div>{isListing && <img src={`/api/listing-image?listingId=${encodeURIComponent(id)}`} alt="" />}<span>{pending ? "Awaiting review" : "Published listing"}</span><h2>{title}</h2><p>{detail}</p>{isListing && <p>{item.draftVersion.draft.description}</p>}</div><div className="review-controls">{pending && <><input aria-label={`Reason for ${title}`} placeholder="Reason when rejecting" value={reason[id] ?? ""} onChange={(event) => setReason({ ...reason, [id]: event.target.value })} /><Button onClick={() => dispatch(view === "merchants" ? reviewMerchantAction(id, "approve", null) : reviewListingAction(id, "approve", null))}>Approve</Button><Button onClick={() => dispatch(view === "merchants" ? reviewMerchantAction(id, "reject", reason[id] || null) : reviewListingAction(id, "reject", reason[id] || null))}>Reject</Button></>}{isListing && !pending && <Button onClick={() => dispatch(unpublishListingAction(id, null))}>Unpublish</Button>}</div></article>;
  })}{admin.status !== "loading" && !items.length && <div className="account-empty"><h2>The queue is clear.</h2><p>New submissions will appear here.</p></div>}</section>{admin.error && <p className="form-error">{admin.error}</p>}</AccountShell>;
}
