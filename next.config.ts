import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // db/*.sql is read at runtime by the db-setup route, so keep it in the bundle.
  outputFileTracingIncludes: {
    "/api/admin/db-setup": ["./db/**"],
  },
};

export default nextConfig;
