import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import catalogue from "@/data/catalog.json" with { type: "json" };
import type { Product } from "@/interfaces/catalog";
import { CatalogApp } from "@/components/CatalogApp";
import { productPath, productUrl } from "@/utils/catalogUrl";
import { getCatalogProducts } from "@/app/api/services/catalog.service";

const products = catalogue as Product[];
export const revalidate = 60;

const findProduct = async (slug: string) => (await getCatalogProducts()).find((product) => product.slug === slug);

export function generateStaticParams() {
  return products.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await findProduct(slug);
  if (!product) return {};
  const image = product.image.heroUrl || `/assets/placeholders/${product.category}.svg`;
  return {
    title: `${product.name} | CatalogX`,
    description: product.description,
    alternates: { canonical: productPath(product.slug) },
    keywords: [product.name, product.productType.replaceAll("-", " "), ...product.rooms, ...product.styles, ...product.materials, "fictional furniture"],
    openGraph: { type: "website", url: productUrl(product.slug), title: `${product.name} | CatalogX`, description: product.description, images: [{ url: image, alt: product.image.alt }] },
    twitter: { card: "summary_large_image", title: `${product.name} | CatalogX`, description: product.description, images: [image] },
  };
}

export default async function ProductStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await findProduct(slug);
  if (!product) notFound();
  return <Suspense fallback={<main className="catalog-app" aria-label="Loading catalogue" />}><CatalogApp initialProduct={product} /></Suspense>;
}
