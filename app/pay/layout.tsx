import type { Metadata, Viewport } from "next";

// The payment request itself is in the "#" part of the link, which the server never sees;
// this layout only gives the page a neutral title and keeps it out of search engines.
export const metadata: Metadata = {
  title: "UPI payment request",
  description: "Pay a hotel bill by UPI",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
