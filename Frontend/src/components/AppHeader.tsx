"use client";

import Link from "next/link";
import { ChevronDown, Clock3, Moon, Sun, Trash2, X } from "lucide-react";
import { clearRecentSearchesAction, removeRecentSearchAction } from "@/redux/catalogThunks";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { selectCatalogueProducts, selectRecentSearches } from "@/redux/selectors";
import { ProductVisual } from "./ProductVisual";
import { IconButton } from "./primitives";
import { useTheme } from "./ThemeProvider";

export function AppHeader({ onRecent }: { onRecent: (prompt: string) => void }) {
  const dispatch = useAppDispatch();
  const { theme, toggleTheme } = useTheme();
  const recent = useAppSelector(selectRecentSearches);
  const products = useAppSelector(selectCatalogueProducts);
  const productById = new Map(products.map((product) => [product.id, product]));
  return <header className="app-header">
    <Link className="brand" href="/" aria-label="CatalogX home"><span className="brand-mark">C</span><span>CatalogX</span><em>Our catalogue</em></Link>
    <div className="header-actions">
      <details className="recent-menu"><summary><Clock3 size={16} /> <span>Recent</span><ChevronDown size={13} /></summary><div className="recent-popover">{recent.length ? <><div className="recent-popover-heading"><span>Recent searches</span><button onClick={() => dispatch(clearRecentSearchesAction())}><Trash2 size={13} /> Clear all</button></div>{recent.map((item) => {
        const preview = item.productIds.map((id) => productById.get(id)).filter((product): product is NonNullable<typeof product> => Boolean(product));
        return <div key={item.id} className="recent-search"><button className="recent-open" onClick={() => onRecent(item.prompt)}><span className="recent-copy">{item.prompt}</span>{preview.length > 0 && <div className="recent-collage" aria-hidden="true">{preview.map((product, index) => <div className={`recent-preview recent-preview-${index + 1}`} key={product.id}><ProductVisual product={product} /></div>)}</div>}</button><IconButton label={`Remove recent search: ${item.prompt}`} className="recent-remove" onClick={() => dispatch(removeRecentSearchAction(item.id))}><X size={14} /></IconButton></div>;
      })}</> : <p>Your recent searches will appear here.</p>}</div></details>
      <IconButton label={`Switch to ${theme === "night" ? "day" : "night"} theme`} onClick={toggleTheme}>{theme === "night" ? <Moon size={18} /> : <Sun size={18} />}</IconButton>
    </div>
  </header>;
}
