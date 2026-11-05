import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "@elastic/elasticsearch"],
  logging: { browserToTerminal: false },
  experimental: {
    serverActions: { bodySizeLimit: "13mb" },
    serverSourceMaps: false,
    turbopackSourceMaps: false,
    turbopackMemoryEviction: "full",
  },
  turbopack: {
    rules: {
      "*.css": {
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
