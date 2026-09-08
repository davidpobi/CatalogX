"use client";
import { useEffect } from "react";
import { loadCustomerLibraryAction, setCollectionItemAction } from "@/redux/accountThunks";
import { initializeCatalogAction } from "@/redux/catalogThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { AccountShell } from "./AccountShell";
import { ProductVisual } from "./ProductVisual";
import { Button } from "./primitives";

export function CollectionDetail({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  const collection = useAppSelector((state) => state.customer.collections.find((item) => item.id === id));
  const likedIds = useAppSelector((state) => state.customer.likedProductIds);
  const products = useAppSelector((state) => state.data.catalogueProducts);
  useEffect(() => { void dispatch(initializeCatalogAction()); void dispatch(loadCustomerLibraryAction()); }, [dispatch]);
  const candidates = products.filter((product) => likedIds.includes(product.id));
  return <AccountShell eyebrow="Collection" title={collection?.name ?? "Your collection."}><section className="library-grid">{candidates.map((product) => {
    const included = collection?.items.some((item) => item.productId === product.id) ?? false;
    return <article className="library-product" key={product.id}><ProductVisual product={product} /><strong>{product.name}</strong><Button onClick={() => dispatch(setCollectionItemAction(id, product.id, !included))}>{included ? "Remove" : "Add to collection"}</Button></article>;
  })}</section></AccountShell>;
}
