import { Suspense } from "react";
import { CatalogApp } from "@/components/CatalogApp";

export default function StorePage() {
  return <Suspense fallback={<main className="catalog-app" aria-label="Loading catalogue" />}><CatalogApp /></Suspense>;
}
