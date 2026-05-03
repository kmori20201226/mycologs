import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
