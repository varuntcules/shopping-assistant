import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark native modules as external to prevent bundling issues
  serverExternalPackages: ["@lancedb/lancedb", "apache-arrow"],

  // Configure remote images (e.g. Shopify CDN) for next/image
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
    ],
  },

  // Empty turbopack config to silence warning
  turbopack: {},

  // Configure webpack for native modules (fallback)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle native modules on the server
      config.externals = config.externals || [];
      config.externals.push({
        "@lancedb/lancedb": "commonjs @lancedb/lancedb",
        "apache-arrow": "commonjs apache-arrow",
      });
    }
    return config;
  },
};

export default nextConfig;
