import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Firebase web config for the on-site guest widget (a static file that
 * can't read NEXT_PUBLIC_* at build time). These values are not secret — the web
 * apiKey is meant to ship to browsers. `configured` tells the widget whether to
 * attempt real background push (FCM) or fall back to in-page notifications.
 */
export function GET() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "",
  };
  const configured = Boolean(cfg.apiKey && cfg.projectId && cfg.vapidKey);
  return NextResponse.json({ configured, ...cfg });
}
