import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Multipart framing must fit outside the canonical 20 MB file limit.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
