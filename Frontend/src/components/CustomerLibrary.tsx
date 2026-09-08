"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createCollectionAction, deleteCollectionAction, loadCustomerLibraryAction } from "@/redux/accountThunks";
import { initializeCatalogAction } from "@/redux/catalogThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { ProductVisual } from "./ProductVisual";
import { AccountShell } from "./AccountShell";
import { Button } from "./primitives";

export function CustomerLibrary({ view }: { view: "saved" | "collections" }) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const customer = useAppSelector((state) => state.customer);
  const products = useAppSelector((state) => state.data.catalogueProducts);
  useEffect(() => { void dispatch(initializeCatalogAction()); void dispatch(loadCustomerLibraryAction()); }, [dispatch]);
  const saved = useMemo(() => products.filter((product) => customer.likedProductIds.includes(product.id)), [customer.likedProductIds, products]);
  return <AccountShell eyebrow="Personal catalogue" title={view === "saved" ? "Saved pieces." : "Your collections."}>{view === "saved" ? <section className="library-grid">{saved.map((product) => <Link href={`/store/${product.slug}`} key={product.id} className="library-product"><ProductVisual product={product} /><span>{product.category}</span><strong>{product.name}</strong><b>${product.currentPrice}</b></Link>)}{customer.status !== "loading" && !saved.length && <div className="account-empty"><h2>Nothing saved yet.</h2><p>Pieces you like will collect here.</p><Link className="button" href="/store">Browse the catalogue</Link></div>}</section> : <><form className="collection-create" onSubmit={(event) => { event.preventDefault(); if (name.trim()) { void dispatch(createCollectionAction(name)); setName(""); } }}><input aria-label="Collection name" placeholder="Name a new collection" value={name} onChange={(event) => setName(event.target.value)} /><Button>Create collection</Button></form><section className="collection-grid">{customer.collections.map((collection) => <article key={collection.id}><span>{collection.items.length} pieces</span><h2>{collection.name}</h2><Link href={`/collections/${collection.id}`}>Open collection</Link><button onClick={() => dispatch(deleteCollectionAction(collection.id))}>Delete</button></article>)}</section></>}{customer.error && <p role="alert" className="form-error">{customer.error}</p>}</AccountShell>;
}
