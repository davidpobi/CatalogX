"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ThemeMode } from "@/interfaces/persistence";
import { getTheme, setTheme } from "@/services/persistence.service";

interface ThemeContextValue { theme: ThemeMode; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextValue | null>(null);
const eventName = "catalogx-theme-change";
const subscribe = (listener: () => void) => {
  const handleStorage = (event: StorageEvent) => { if (event.key === "catalogx-theme") listener(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener(eventName, listener); };
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "night" as ThemeMode);
  const toggleTheme = useCallback(() => { setTheme(theme === "night" ? "day" : "night"); window.dispatchEvent(new Event(eventName)); }, [theme]);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
