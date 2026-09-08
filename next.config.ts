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
  // The admin panel moved to a secret base path. Old guessable URLs go home so
  // nothing (not even a 404) hints that an admin area exists. /api/admin/* is
  // untouched (different prefix).
  async redirects() {
    return [
      { source: "/admin", destination: "/", permanent: false },
      { source: "/admin/:path*", destination: "/", permanent: false },
      { source: "/login", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
