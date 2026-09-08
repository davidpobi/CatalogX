"use client";

import { Heart, ImagePlus, Maximize2, Minimize2, PackageCheck, Share2, Sparkles, Truck, X } from "lucide-react";
import type { Product } from "@/interfaces/catalog";
import { CATEGORY_LABELS } from "@/interfaces/catalog";
import { ProductVisual } from "./ProductVisual";
import { Button, Chip, IconButton } from "./primitives";

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ProductContextPanel({
  product, rationale, reasons, constraints, saved, alternatives, inBundle, sceneAuthorized, modalMode,
  headingRef, shareStatus, onClose, onSave, onShare, onToggleMode, onBuildAround, onReplace, onVisualize, onAlternative,
}: {
  product: Product;
  rationale: string | null;
  reasons: string[];
  constraints: string[];
  saved: boolean;
  alternatives: Product[];
  inBundle: boolean;
  sceneAuthorized: boolean;
  modalMode: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  shareStatus: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  onToggleMode: () => void;
  onBuildAround: () => void;
  onReplace: () => void;
  onVisualize: () => void;
  onAlternative: (product: Product) => void;
}) {
  return (
    <section className="product-context-panel" aria-labelledby="product-context-heading" onKeyDown={(event) => event.key === "Escape" && onClose()}>
      <header className="product-context-header">
        <div><span className="eyebrow">Product decision</span><h2 id="product-context-heading" ref={headingRef} tabIndex={-1}>{product.name}</h2></div>
        <div className="product-context-actions">
          <IconButton label={saved ? `Remove ${product.name} from saved products` : `Save ${product.name}`} onClick={onSave}><Heart size={18} fill={saved ? "currentColor" : "none"} /></IconButton>
          <IconButton label={`Share ${product.name}`} onClick={onShare}><Share2 size={18} /></IconButton>
          <IconButton label={modalMode ? "Use inline product details" : "Open product details in modal"} onClick={onToggleMode}>{modalMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</IconButton>
          <IconButton className="context-close" label="Close product details" onClick={onClose}><X size={18} /></IconButton>
        </div>
      </header>
      <div className="product-context-layout">
        <div className="product-context-image"><ProductVisual product={product} /></div>
        <div className="product-context-copy">
          <span className="product-kicker">{CATEGORY_LABELS[product.category]} · {product.productType.replaceAll("-", " ")}</span>
          <div className="context-price"><strong>{price.format(product.currentPrice)}</strong>{product.discountPercent > 0 && <><del>{price.format(product.originalPrice)}</del><span>−{product.discountPercent}%</span></>}</div>
          <p>{product.description}</p>
          <div className="context-fit"><span className="eyebrow">Why it fits</span><strong>{rationale || reasons[0] || `A considered ${product.productType.replaceAll("-", " ")} for your current catalogue direction.`}</strong>{reasons.length > 1 && <small>{reasons.slice(1, 3).join(" · ")}</small>}</div>
          {constraints.length > 0 && <div className="context-constraints" aria-label="Active constraints">{constraints.map((constraint) => <Chip key={constraint}>{constraint}</Chip>)}</div>}
          <div className="delivery-grid">
            <span><PackageCheck size={18} /><b>{product.availability.replaceAll("_", " ")}</b><small>{product.inventory} available</small></span>
            <span><Truck size={18} /><b>{product.deliveryDays}–{product.deliveryDays + 2} days</b><small>Estimated delivery</small></span>
          </div>
          <dl className="context-specs">
            <div><dt>Materials</dt><dd>{product.materials.join(", ")}</dd></div>
            <div><dt>Colour</dt><dd>{product.colors.join(", ")}</dd></div>
            <div><dt>Dimensions</dt><dd>{product.dimensions.width} × {product.dimensions.height} × {product.dimensions.depth} in</dd></div>
            <div><dt>Rating</dt><dd>{product.rating} / 5 · {product.reviewCount} reviews</dd></div>
          </dl>
          <div className="context-decisions">
            <Button onClick={onBuildAround}><Sparkles size={16} /> Build around this piece</Button>
            {inBundle && <Button onClick={onReplace}>Replace in composition</Button>}
            {sceneAuthorized && <Button onClick={onVisualize}><ImagePlus size={16} /> See composition in your room</Button>}
          </div>
          <p className="fictional-disclosure">Fictional product created for the CatalogX open-source demonstration.</p>
          <p className="share-announcement" aria-live="polite">{shareStatus}</p>
        </div>
      </div>
      {alternatives.length > 0 && <div className="context-alternatives"><div><span className="eyebrow">Compatible alternatives</span><h3>Keep the intent, change the piece.</h3></div><div>{alternatives.map((alternative) => <button key={alternative.id} onClick={() => onAlternative(alternative)}><ProductVisual product={alternative} /><span>{alternative.name}</span><strong>{price.format(alternative.currentPrice)}</strong></button>)}</div></div>}
    </section>
  );
}
