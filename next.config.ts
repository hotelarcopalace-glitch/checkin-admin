import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // db/*.sql is read at runtime by the db-setup route, so keep it in the bundle.
  outputFileTracingIncludes: {
    "/api/admin/db-setup": ["./db/**"],
  },
  // The public site is the original checkin.co.in pages, restored from the
  // Wayback Machine snapshot of 2 Apr 2023 and served straight out of public/.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
};

export default nextConfig;
