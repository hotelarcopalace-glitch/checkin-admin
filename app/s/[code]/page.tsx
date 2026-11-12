"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import QrScanner from "qr-scanner";

/**
 * Phone page for the Aadhaar QR relay. The hotel PC (checkin.exe, F8 on the check-in
 * screen) shows a link to /s/<code>; the receptionist opens it on a phone, points the
 * camera at the QR on the guest's Aadhaar card, and the raw QR text is posted to
 * /api/ascan/<code>, where checkin.exe picks it up. Nothing is decoded or kept here.
 */

const CODE_RE = /^[A-HJ-NP-Z2-9]{12}$/;

function isAadhaarQr(text: string) {
  const t = text.trim();
  return /PrintLetterBarcodeData/i.test(t) || /^\d{300,}$/.test(t);
}

type Status =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "notaadhaar" }
  | { kind: "error"; msg: string };

export default function AadhaarScanPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const valid = CODE_RE.test(code);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });

  useEffect(() => {
    if (!valid || !videoRef.current) return;
    let stopped = false;

    const onResult = async (text: string) => {
      if (busyRef.current || stopped) return;
      // The same card stays in view for a moment: do not send it twice.
      const last = lastRef.current;
      if (last && last.text === text && Date.now() - last.at < 15000) return;

      if (!isAadhaarQr(text)) {
        setStatus({ kind: "notaadhaar" });
        return;
      }
      busyRef.current = true;
      setStatus({ kind: "sending" });
      try {
        const res = await fetch(`/api/ascan/${code}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: text,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        lastRef.current = { text, at: Date.now() };
        setStatus({ kind: "sent" });
        if (navigator.vibrate) navigator.vibrate(120);
        // Ready for the next guest after a short pause.
        setTimeout(() => {
          busyRef.current = false;
          if (!stopped) setStatus({ kind: "scanning" });
        }, 3500);
      } catch {
        busyRef.current = false;
        setStatus({ kind: "error", msg: "Computer ko bhej nahi paaya. Internet dekh kar dobara scan karein." });
      }
    };

    const scanner = new QrScanner(videoRef.current, (r) => void onResult(r.data), {
      returnDetailedScanResult: true,
      preferredCamera: "environment",
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 6,
      // The Aadhaar "secure QR" is very dense. The library's default shrinks the frame to
      // 400x400 before decoding, which is too coarse for it, so scan the whole frame at a
      // much higher resolution.
      calculateScanRegion: (v) => {
        const size = Math.min(v.videoWidth, v.videoHeight);
        const down = Math.min(size, 1400);
        return {
          x: Math.round((v.videoWidth - size) / 2),
          y: Math.round((v.videoHeight - size) / 2),
          width: size,
          height: size,
          downScaledWidth: down,
          downScaledHeight: down,
        };
      },
    });
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => {
        if (!stopped) setStatus({ kind: "scanning" });
      })
      .catch(() => {
        setStatus({
          kind: "error",
          msg: "Camera nahi khul paaya. Browser me camera ki permission 'Allow' karein aur page dobara kholein.",
        });
      });

    return () => {
      stopped = true;
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [code, valid]);

  const box: React.CSSProperties = {
    minHeight: "100dvh",
    background: "#111",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px",
    boxSizing: "border-box",
    gap: "12px",
  };

  if (!valid) {
    return (
      <main style={box}>
        <h1 style={{ fontSize: 20, margin: "24px 0 0" }}>Aadhaar QR Scan</h1>
        <p style={{ textAlign: "center", lineHeight: 1.5 }}>
          Ye link sahi nahi hai. CHECKIN software me check-in screen par F8 dabakar jo link dikhta hai, wahi
          kholein.
        </p>
      </main>
    );
  }

  const banner = (() => {
    switch (status.kind) {
      case "starting":
        return { bg: "#444", text: "Camera khul raha hai ..." };
      case "scanning":
        return { bg: "#1d4ed8", text: "Camera ko Aadhaar card ke QR par rakhein" };
      case "sending":
        return { bg: "#b45309", text: "Computer ko bhej raha hai ..." };
      case "sent":
        return { bg: "#15803d", text: "Bhej diya ✓  Computer par detail dekhein" };
      case "notaadhaar":
        return { bg: "#b91c1c", text: "Ye Aadhaar ka QR nahi hai. Aadhaar card ka QR scan karein." };
      case "error":
        return { bg: "#b91c1c", text: status.msg };
    }
  })();

  return (
    <main style={box}>
      <h1 style={{ fontSize: 20, margin: "4px 0 0" }}>Aadhaar QR Scan</h1>
      <div style={{ fontSize: 13, opacity: 0.75 }}>Computer code: &hellip;{code.slice(-4)}</div>

      <div
        role="status"
        style={{
          width: "100%",
          maxWidth: 520,
          background: banner.bg,
          borderRadius: 10,
          padding: "12px 14px",
          textAlign: "center",
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.35,
        }}
      >
        {banner.text}
      </div>

      <div style={{ width: "100%", maxWidth: 520, position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", display: "block" }} />
      </div>

      <p style={{ maxWidth: 520, fontSize: 13, lineHeight: 1.5, opacity: 0.8, textAlign: "center", margin: 0 }}>
        Pehle computer par check-in screen me F8 dabayein, phir yahan scan karein. QR poora aur saaf dikhe,
        roshni achhi ho. Ye page kuch save nahi karta: scan seedhe aapke hotel ke computer ko jata hai.
      </p>
    </main>
  );
}
