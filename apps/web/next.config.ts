import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 30s which cuts off AI identification. Set to 10 minutes.
    proxyTimeout: 600_000,
  },
  async rewrites() {
    const dest = process.env.INTERNAL_API_URL
    if (!dest) return { beforeFiles: [], afterFiles: [], fallback: [] }
    return {
      beforeFiles: [{ source: '/api/:path*', destination: `${dest}/:path*` }],
      afterFiles: [],
      fallback: [],
    }
  },
};

export default nextConfig;
