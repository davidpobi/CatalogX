"use client";

import Link from "next/link";
import { ArrowRight, Layers3, MessageSquareText, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LANDING_EXAMPLES, LANDING_FEATURED_ASSETS } from "@/data/landing";
import type { LandingAsset } from "@/interfaces/landing";
import { queueSearchSubmission, setAIDraft } from "@/redux/slices/aiSlice";
import { hydrateLocalDataAction, transcribePromptAction } from "@/redux/catalogThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { selectAIDraft } from "@/redux/selectors";
import { AppHeader } from "./AppHeader";
import { ProductVisual } from "./ProductVisual";
import { SearchComposer } from "./SearchComposer";

function PromptScene({ assets }: { assets: LandingAsset[] }) {
  return <div className="prompt-scene" aria-hidden="true">{assets.map((product, index) => <div className={`prompt-scene-item prompt-scene-item-${index + 1}`} key={product.id}><ProductVisual product={product} priority /></div>)}</div>;
}

export function LandingApp() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const draft = useAppSelector(selectAIDraft);
  const [heroWord, setHeroWord] = useState<"feeling" | "vibe">("feeling");
  useEffect(() => { dispatch(hydrateLocalDataAction()); }, [dispatch]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHeroWord((word) => word === "feeling" ? "vibe" : "feeling"), 8_000);
    return () => window.clearInterval(timer);
  }, []);
  const enterStore = (input?: string) => {
    const value = (input ?? draft).trim();
    if (value.length < 2) return;
    dispatch(queueSearchSubmission(value)); router.push("/store");
  };
  const onAudio = async (audio: Blob) => { const transcript = await dispatch(transcribePromptAction(audio)); if (transcript) enterStore(transcript); };
  return <main className="catalog-app landing-page">
    <AppHeader onRecent={enterStore} />
    <section className="landing-hero">
      <div className="landing-hero-copy"><span className="eyebrow">The catalogue that listens</span><h1>Furnish the <span className="hero-rotating-word" key={heroWord}>{heroWord}</span>,<br />not the filter.</h1><p>Describe what you need in your own words. CatalogX turns it into a precise, editable plan.</p><SearchComposer prompt={draft} setPrompt={(value) => dispatch(setAIDraft(value))} onSubmit={enterStore} onAudio={onAudio} busy={false} suggestions={[]} /></div>
      <div className="landing-collage" aria-label="Featured catalogue pieces">{LANDING_FEATURED_ASSETS.map((product, index) => <button className={`collage-card collage-card-${index + 1}`} key={product.id} onClick={() => router.push(`/store?category=${product.category}`)} aria-label={`Explore ${product.category.replaceAll("-", " ")}`}><ProductVisual product={product} priority /><span>{product.name}</span></button>)}</div>
    </section>
    <section className="landing-section prompt-section"><div className="section-heading"><span className="eyebrow">Start with an idea</span><h2>Shop the way you actually think.</h2></div><div className="prompt-card-grid">{LANDING_EXAMPLES.map((example, index) => <button className={`prompt-card prompt-card-${index + 1}`} key={example.label} onClick={() => enterStore(example.prompt)}><PromptScene assets={example.sceneAssets} /><span>0{index + 1}</span><h3>{example.label}</h3><p>“{example.prompt}”</p><ArrowRight size={18} /></button>)}</div></section>
    <section className="landing-section process-section"><div className="section-heading"><span className="eyebrow">From language to catalogue</span><h2>One prompt. A plan you control.</h2></div><div className="process-grid"><article><MessageSquareText /><span>01</span><h3>Describe the space</h3><p>Use mood, room, budget, materials, dimensions or delivery needs.</p></article><article><Sparkles /><span>02</span><h3>CatalogX understands</h3><p>Your request becomes visible constraints and weighted preferences.</p></article><article><Layers3 /><span>03</span><h3>Refine the result</h3><p>Remove a chip, adjust the plan or replace one piece in a bundle.</p></article></div></section>
    <section className="landing-section room-stories"><div className="section-heading"><span className="eyebrow">Spaces, composed</span><h2>Ask for a piece or the whole room.</h2></div><div className="story-grid">{LANDING_FEATURED_ASSETS.slice(0, 3).map((product, index) => <button key={product.id} onClick={() => enterStore(LANDING_EXAMPLES[index].prompt)}><ProductVisual product={product} priority /><span>{LANDING_EXAMPLES[index].label}</span><strong>Explore with AI <ArrowRight size={15} /></strong></button>)}</div></section>
    <section className="landing-cta"><span className="eyebrow">100 pieces. Infinite ways in.</span><h2>Tell us what the room should feel like.</h2><Link href="/store">Enter the catalogue <ArrowRight size={17} /></Link></section>
    <footer><span>CatalogX by BashBash Labs</span><span>AI-native catalogue · deterministic results</span></footer>
  </main>;
}
