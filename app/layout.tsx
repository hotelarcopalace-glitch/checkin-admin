import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checkin Admin",
  description: "Admin panel for checkin.co.in",
  // Default for every page; /build overrides it with BuildKhata's own manifest (see app/build/layout.tsx).
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
