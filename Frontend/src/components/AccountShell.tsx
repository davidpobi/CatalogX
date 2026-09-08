"use client";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/redux/accountThunks";
import { useAppDispatch } from "@/redux/hooks";
import { Button } from "./primitives";

export function AccountShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  return <main className="account-page"><header className="account-header"><Link className="brand" href="/"><span className="brand-mark">C</span><span>CatalogX</span></Link><nav><Link href="/store">Catalogue</Link><Link href="/saved">Saved</Link><Link href="/collections">Collections</Link><Button onClick={async () => { await dispatch(signOutAction()); router.replace("/"); }}><LogOut size={15} /> Sign out</Button></nav></header><section className="account-hero"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></section>{children}</main>;
}
