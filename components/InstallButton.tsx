"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// "Install app / Add to Home Screen". On Chrome/Android/Edge it uses the native
// install prompt (beforeinstallprompt). On iOS Safari (no such event) it shows
// the manual Share -> Add to Home Screen hint.
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Already running as an installed app -> nothing to show.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));

    // iOS doesn't fire beforeinstallprompt.
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua)) {
      // show the manual hint only if not already standalone
      setTimeout(() => setDeferred((d) => (d ? d : d)), 0);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      setDeferred(null);
    } else {
      setIosHint((v) => !v);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="text-sm font-medium text-indigo-900">App install karein</p>
      <p className="mt-1 text-sm text-indigo-800">
        Home screen par add karo — har baar link kholna nahi padega.
      </p>
      <button
        onClick={install}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        + Add to Home Screen
      </button>
      {iosHint && (
        <p className="mt-2 text-sm text-indigo-800">
          iPhone: niche <strong>Share</strong> (⬆️) dabao → <strong>“Add to Home Screen”</strong>{" "}
          chuno.
        </p>
      )}
    </div>
  );
}
