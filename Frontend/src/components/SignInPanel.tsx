/* eslint-disable @next/next/no-html-link-for-pages */
"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminSignInAction, googleSignInAction } from "@/redux/accountThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { Button } from "./primitives";

export function SignInPanel({ admin = false, merchant = false }: { admin?: boolean; merchant?: boolean }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const auth = useAppSelector((state) => state.auth);
  const requestedDestination = params.get("next");
  const destination = requestedDestination?.startsWith("/") && !requestedDestination.startsWith("//") ? requestedDestination : (admin ? "/admin/merchants" : merchant ? "/merchant/onboarding" : "/saved");
  return <main className="auth-page"><section className="auth-card"><a className="brand" href="/"><span className="brand-mark">C</span><span>CatalogX</span></a><span className="eyebrow">{admin ? "Administration" : merchant ? "Merchant access" : "Your catalogue"}</span><h1>{admin ? "Review the catalogue." : merchant ? "Bring your collection to CatalogX." : "Keep what catches your eye."}</h1><p>{admin ? "Sign in with the provisioned administrator account." : "Sign in once. Your saved pieces and collections follow you."}</p>{admin ? <form onSubmit={async (event) => { event.preventDefault(); const session = await dispatch(adminSignInAction(email, password)); if (session?.user.capabilities.admin) router.replace(destination); }}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><Button disabled={auth.status === "loading"}>Sign in</Button></form> : <Button disabled={auth.status === "loading"} onClick={async () => { const session = await dispatch(googleSignInAction()); if (session) router.replace(destination); }}>Continue with Google</Button>}{auth.error && <p role="alert" className="form-error">{auth.error}</p>}</section></main>;
}
