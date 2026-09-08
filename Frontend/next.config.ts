import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CATALOGX_E2E === "1" ? ".next-e2e" : ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
