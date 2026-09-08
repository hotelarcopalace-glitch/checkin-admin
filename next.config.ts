import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // db/*.sql is read at runtime by the db-setup route, so keep it in the bundle.
  outputFileTracingIncludes: {
    "/api/admin/db-setup": ["./db/**"],
  },
  // Root now opens the guest app directly (checkin.co.in -> /user). The old
  // marketing site is still served from public/ at /index.html, /aboutus.html …
  // Old admin-guess URLs go to the guest app too (nothing hints an admin area).
  async redirects() {
    return [
      { source: "/", destination: "/user", permanent: false },
      { source: "/admin", destination: "/user", permanent: false },
      { source: "/admin/:path*", destination: "/user", permanent: false },
      { source: "/login", destination: "/user", permanent: false },
    ];
  },
};

export default nextConfig;
