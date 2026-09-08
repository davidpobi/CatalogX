"use client";
import Link from "next/link";
import { useEffect } from "react";
import { archiveListingAction, loadMerchantAction, submitListingAction } from "@/redux/accountThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { AccountShell } from "./AccountShell";
import { Button } from "./primitives";

export function MerchantListings() {
  const dispatch = useAppDispatch();
  const merchant = useAppSelector((state) => state.merchant);
  useEffect(() => { void dispatch(loadMerchantAction()); }, [dispatch]);
  return <AccountShell eyebrow="Merchant workspace" title="Your home décor listings.">
    <div className="dashboard-toolbar"><p>Draft, submit, and follow each product through review.</p><Link className="button" href="/merchant/listings/new">Add product</Link></div>
    <section className="management-list">{merchant.listings.map((listing) => <article key={listing.id}>
      <div><span>{listing.status}</span><h2>{listing.draftVersion.draft.name}</h2><p>{listing.draftVersion.draft.category} · ${listing.draftVersion.draft.currentPrice} · {listing.draftVersion.draft.inventory} available</p></div>
      <div><Link className="button" href={`/merchant/listings/${listing.id}`}>Manage</Link>{listing.draftVersion.status === "draft" && <Button onClick={() => dispatch(submitListingAction(listing.id))}>Submit</Button>}{listing.status !== "archived" && <Button onClick={() => dispatch(archiveListingAction(listing.id))}>Archive</Button>}</div>
    </article>)}{merchant.status !== "loading" && !merchant.listings.length && <div className="account-empty"><h2>Your first listing starts here.</h2><p>Products remain private until approved.</p></div>}</section>
    {merchant.error && <p className="form-error">{merchant.error}</p>}
  </AccountShell>;
}
