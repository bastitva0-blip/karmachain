import type { NextConfig } from "next";

const apiInternal = process.env.API_INTERNAL_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  transpilePackages: ["@karma/shared"],
  // LLM-backed API calls (plans, evaluations, briefings) can take longer than the default 30 s.
  experimental: { proxyTimeout: 120_000 },
  async rewrites() {
    // Browser talks to /api/* on the web origin, so cookies stay first-party.
    return [{ source: "/api/:path*", destination: `${apiInternal}/:path*` }];
  },
};

export default nextConfig;
