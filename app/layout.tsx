import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checkin Admin",
  description: "Admin panel for checkin.co.in",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
