"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

export function firebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && vapidKey);
}

let app: FirebaseApp | null = null;
function getApp() {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

/**
 * Asks for notification permission, registers the service worker and returns
 * the FCM token for this browser. Throws a human-readable error on failure.
 */
export async function requestPushToken(): Promise<string> {
  if (!firebaseReady()) throw new Error("Firebase is not configured on this site yet.");
  if (!(await isSupported())) throw new Error("This browser does not support push notifications.");

  // Chrome keeps a "denied" decision and never prompts again, so say so plainly
  // instead of showing a generic failure.
  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked for this site. Tap the lock icon next to the address bar → Permissions → Notifications → Allow, then reload and try again."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    throw new Error("You chose Block. Allow notifications from the lock icon next to the address bar, then try again.");
  }
  if (permission !== "granted") {
    throw new Error("The permission prompt was dismissed. Tap the button again and choose Allow.");
  }

  // The worker cannot read env vars, so the config rides along in the query string.
  const params = new URLSearchParams(firebaseConfig as unknown as Record<string, string>);
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
    { scope: "/" }
  );

  const messaging: Messaging = getMessaging(getApp());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Could not get a notification token.");
  return token;
}

/** Fires while the page is open — the service worker handles it when it is not. */
export async function onForegroundMessage(handler: (title: string, body: string) => void) {
  if (!firebaseReady() || !(await isSupported())) return;
  onMessage(getMessaging(getApp()), (payload) => {
    handler(payload.notification?.title ?? "New message", payload.notification?.body ?? "");
  });
}
