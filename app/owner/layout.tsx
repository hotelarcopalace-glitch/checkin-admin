import type { Metadata, Viewport } from "next";

// Owner phone app: the hotel's Night Audit Summary on the owner's phone. The key that opens
// the figures lives only in the phone (and may arrive in the "#" part of a link, which the
// server never sees), so the page itself carries nothing private.
export const metadata: Metadata = {
  title: "CHECKIN Owner",
  description: "Your hotel's sold rooms, collection and sales on your phone.",
  manifest: "/owner/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHECKIN Owner" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c1710",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
