import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable the 30s default proxy timeout so long-running AI identification
    // requests are not cut off. Timeouts are handled by nginx and Fastify.
    proxyTimeout: null,
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
