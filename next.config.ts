import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark native modules as external to prevent bundling issues
  serverExternalPackages: ["@lancedb/lancedb", "apache-arrow"],

  // Configure remote images (e.g. Shopify CDN and product manufacturer sites) for next/image
  images: {
    remotePatterns: [
      // Shopify CDN
      { protocol: "https", hostname: "cdn.shopify.com" },
      // Camera and photography equipment brand sites (from products_dummy)
      { protocol: "https", hostname: "www.aputure.com" },
      { protocol: "https", hostname: "www.benro.com" },
      { protocol: "https", hostname: "www.canon.com" },
      { protocol: "https", hostname: "www.elgato.com" },
      { protocol: "https", hostname: "www.fujifilm.com" },
      { protocol: "https", hostname: "www.gitzo.com" },
      { protocol: "https", hostname: "www.godox.com" },
      { protocol: "https", hostname: "www.joby.com" },
      { protocol: "https", hostname: "www.manfrotto.com" },
      { protocol: "https", hostname: "www.nanlite.com" },
      { protocol: "https", hostname: "www.nikonusa.com" },
      { protocol: "https", hostname: "www.nikon.com" },
      { protocol: "https", hostname: "www.panasonic.com" },
      { protocol: "https", hostname: "www.peakdesign.com" },
      { protocol: "https", hostname: "www.sachtler.com" },
      { protocol: "https", hostname: "www.sigma-global.com" },
      { protocol: "https", hostname: "www.sirui.com" },
      { protocol: "https", hostname: "www.smallrig.com" },
      { protocol: "https", hostname: "www.sony.com" },
      { protocol: "https", hostname: "www.tamron.com" },
      { protocol: "https", hostname: "www.vanguardworld.com" },
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
