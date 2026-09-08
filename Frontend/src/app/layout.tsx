import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/ThemeProvider";
import { StoreProvider } from "@/components/StoreProvider";
import { catalogOrigin } from "@/utils/catalogUrl";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(catalogOrigin()),
  title: "CatalogX | The catalogue that listens",
  description: "An AI-native home catalogue that turns natural language into deterministic product results.",
};

const themeScript = `try{document.documentElement.dataset.catalogxTheme=localStorage.getItem("catalogx-theme")==="day"?"day":"night"}catch(e){document.documentElement.dataset.catalogxTheme="night"}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-catalogx-theme="night" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body className={GeistSans.className}><StoreProvider><ThemeProvider>{children}</ThemeProvider></StoreProvider></body></html>;
}
