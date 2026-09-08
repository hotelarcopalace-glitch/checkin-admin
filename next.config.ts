import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // db/*.sql is read at runtime by the db-setup route, so keep it in the bundle.
  outputFileTracingIncludes: {
    "/api/admin/db-setup": ["./db/**"],
  },
  // checkin.co.in shows the marketing site; the guest login lives on it as a
  // widget (public/guest-widget.js). Admin-guess URLs go home.
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      // The guest SMS-notifications view has its own URL; it renders on the same
      // page (the widget opens the SMS view when the path is /sms).
      { source: "/sms", destination: "/index.html" },
    ];
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/", permanent: false },
      { source: "/admin/:path*", destination: "/", permanent: false },
      { source: "/login", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
