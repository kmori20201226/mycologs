import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const dest = process.env.INTERNAL_API_URL
    if (!dest) return []
    return [{ source: '/api/:path*', destination: `${dest}/:path*` }]
  },
};

export default nextConfig;
