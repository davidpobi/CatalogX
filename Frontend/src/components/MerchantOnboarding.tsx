"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MerchantApplication } from "@/interfaces/merchant";
import { loadMerchantAction, saveMerchantApplicationAction, submitMerchantApplicationAction } from "@/redux/accountThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { AccountShell } from "./AccountShell";
import { Button } from "./primitives";

export function MerchantOnboarding() {
  const dispatch = useAppDispatch();
  const merchant = useAppSelector((state) => state.merchant);
  useEffect(() => { void dispatch(loadMerchantAction()); }, [dispatch]);
  return <MerchantApplicationForm key={merchant.application?.updatedAt ?? "new"} application={merchant.application} />;
}

function MerchantApplicationForm({ application }: { application: MerchantApplication | null }) {
  const dispatch = useAppDispatch();
  const merchant = useAppSelector((state) => state.merchant);
  const [form, setForm] = useState({ brandName: application?.brandName ?? "", contactEmail: application?.contactEmail ?? "", website: application?.website ?? "", country: application?.country ?? "", catalogueDescription: application?.catalogueDescription ?? "" });
  const locked = merchant.application?.status === "pending" || merchant.application?.status === "approved";
  return <AccountShell eyebrow="Merchant onboarding" title={merchant.application?.status === "pending" ? "Application under review." : merchant.application?.status === "approved" ? "You are approved." : "Tell us what you bring."}><form className="merchant-form" onSubmit={(event) => { event.preventDefault(); void dispatch(saveMerchantApplicationAction(form)); }}><label>Brand name<input value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })} disabled={locked} required /></label><label>Contact email<input type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} disabled={locked} required /></label><label>Website or social link<input type="url" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} disabled={locked} /></label><label>Country<input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} disabled={locked} required /></label><label className="wide">About your catalogue<textarea value={form.catalogueDescription} onChange={(event) => setForm({ ...form, catalogueDescription: event.target.value })} disabled={locked} required /></label>{!locked && <div className="form-actions"><Button type="submit">Save application</Button>{merchant.application?.status === "draft" && <Button type="button" onClick={() => dispatch(submitMerchantApplicationAction())}>Submit for approval</Button>}</div>}{merchant.application?.status === "approved" && <Link className="button" href="/merchant/listings">Manage listings</Link>}{merchant.application?.rejectionReason && <p className="form-error">{merchant.application.rejectionReason}</p>}</form></AccountShell>;
}
