import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep development assets isolated from `next build`. The macOS launcher
  // leaves the dev server running, so sharing `.next` can invalidate its
  // client chunks and leave a rendered page with no working interactions.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "ffmpeg-static",
    "openai",
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.next/**",
          "**/.next-dev/**",
          "**/uploads/**",
          "**/public/renders/**",
          "**/renders/**",
        ],
      };
    }

    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
};

export default nextConfig;
