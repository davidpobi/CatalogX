import type { Product } from "@/interfaces/catalog";
import type { ThemeMode } from "@/interfaces/persistence";
import type { RecentSearch } from "@/interfaces/state";
export type { RecentSearch } from "@/interfaces/state";
export type { ThemeMode } from "@/interfaces/persistence";

const keys = { theme: "catalogx-theme", recent: "catalogx-recent-searches", saved: "catalogx-saved-products" };
const read = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Persistence is optional. */ } };

export const getTheme = (): ThemeMode => typeof window !== "undefined" && localStorage.getItem(keys.theme) === "day" ? "day" : "night";
export const setTheme = (theme: ThemeMode) => { document.documentElement.dataset.catalogxTheme = theme; try { localStorage.setItem(keys.theme, theme); } catch { /* Theme still applies. */ } };
export const getRecentSearches = () => read<Array<Partial<RecentSearch>>>(keys.recent, [])
  .filter((item): item is Pick<RecentSearch, "id" | "prompt" | "createdAt"> & Partial<RecentSearch> => typeof item.id === "string" && typeof item.prompt === "string" && typeof item.createdAt === "string")
  .map((item) => ({ ...item, productIds: Array.isArray(item.productIds) ? item.productIds.filter((id): id is string => typeof id === "string").slice(0, 3) : [] }))
  .slice(0, 8);
export const addRecentSearch = (prompt: string, productIds: string[]) => {
  const next = [{ id: crypto.randomUUID(), prompt, createdAt: new Date().toISOString(), productIds: [...new Set(productIds)].slice(0, 3) }, ...getRecentSearches().filter((item) => item.prompt !== prompt)].slice(0, 8);
  write(keys.recent, next);
  return next;
};
export const removeRecentSearch = (id: string) => {
  const next = getRecentSearches().filter((item) => item.id !== id);
  write(keys.recent, next);
  return next;
};
export const clearRecentSearches = () => { write(keys.recent, []); return []; };
export const getSavedProductIds = () => read<string[]>(keys.saved, []);
export const toggleSavedProduct = (product: Pick<Product, "id">) => {
  const saved = new Set(getSavedProductIds());
  if (saved.has(product.id)) saved.delete(product.id); else saved.add(product.id);
  const next = [...saved]; write(keys.saved, next); return next;
};
