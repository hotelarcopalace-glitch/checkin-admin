"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Phone page for the Aadhaar QR relay. The hotel PC (checkin.exe, F8 on the check-in
 * screen) shows a link to /s/<code>; the receptionist opens it on a phone, points the
 * camera at the QR on the guest's Aadhaar card, and the raw QR text is posted to
 * /api/ascan/<code>, where checkin.exe picks it up. Nothing is decoded into fields or kept here.
 *
 * Decoder: zxing-wasm (ZXing-C++). The first version used the `qr-scanner` package, which
 * could not read real Aadhaar cards (tested on photos of two cards: it failed on almost
 * every attempt, ZXing read both every time). Two ways to scan:
 *   - live camera, at the highest resolution the phone will give (Aadhaar QRs are dense);
 *   - "take a photo": the phone's own camera app, full resolution, for cards the live view
 *     cannot resolve.
 */

const CODE_RE = /^[A-HJ-NP-Z2-9]{12}$/;
const WASM_URL = "/zxing/zxing_reader.wasm";

function isAadhaarQr(text: string) {
  const t = text.trim();
  return /PrintLetterBarcodeData/i.test(t) || /^\d{300,}$/.test(t);
}

type ZX = typeof import("zxing-wasm/reader");

type Status =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "nocamera" }
  | { kind: "reading" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "notaadhaar" }
  | { kind: "notfound" }
  | { kind: "error"; msg: string };

export default function AadhaarScanPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const valid = CODE_RE.test(code);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const zxRef = useRef<ZX | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [torch, setTorch] = useState<"none" | "off" | "on">("none");

  /** Loads the decoder once (the .wasm is served from our own /zxing/). */
  const loadZx = useCallback(async (): Promise<ZX> => {
    if (zxRef.current) return zxRef.current;
    const zx = await import("zxing-wasm/reader");
    zx.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_URL : prefix + path) },
    });
    zxRef.current = zx;
    return zx;
  }, []);

  const decode = useCallback(
    async (image: ImageData): Promise<string | null> => {
      const zx = await loadZx();
      const res = await zx.readBarcodes(image, {
        formats: ["QRCode"],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
      });
      const text = res[0]?.text ?? "";
      return text ? text : null;
    },
    [loadZx]
  );

  /** A QR was read: check it, send it to the PC, show the result. */
  const handleText = useCallback(
    async (text: string) => {
      const last = lastRef.current;
      // The same card stays in view for a moment: do not send it twice.
      if (last && last.text === text && Date.now() - last.at < 15000) return;
      if (!isAadhaarQr(text)) {
        setStatus({ kind: "notaadhaar" });
        return;
      }
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
        await new Promise((r) => setTimeout(r, 3500)); // pause before the next guest
        setStatus(trackRef.current ? { kind: "scanning" } : { kind: "nocamera" });
      } catch {
        setStatus({ kind: "error", msg: "Computer ko bhej nahi paaya. Internet dekh kar dobara scan karein." });
      }
    },
    [code]
  );

  // Live camera scanning.
  useEffect(() => {
    if (!valid) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas");

    const tick = async () => {
      if (stopped) return;
      if (!busyRef.current && video.readyState >= 2 && video.videoWidth > 0) {
        busyRef.current = true;
        try {
          // Centre square of the frame, at up to 1600px: the card is held in the middle,
          // and a smaller area keeps each decode fast on a phone.
          const side = Math.min(video.videoWidth, video.videoHeight);
          const out = Math.min(side, 1600);
          canvas.width = out;
          canvas.height = out;
          const g = canvas.getContext("2d", { willReadFrequently: true });
          if (g) {
            g.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, out, out);
            const text = await decode(g.getImageData(0, 0, out, out));
            if (text && !stopped) await handleText(text);
          }
        } catch {
          /* a failed frame is normal: try the next one */
        } finally {
          busyRef.current = false;
        }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };

    (async () => {
      try {
        void loadZx(); // start loading the decoder while the camera opens
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        // Continuous autofocus and torch where the phone offers them (not in every browser's types).
        const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[]; torch?: boolean };
        if (caps.focusMode?.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (caps.torch) setTorch("off");
        video.srcObject = stream;
        await video.play();
        setStatus({ kind: "scanning" });
        timer = setTimeout(tick, 250);
      } catch {
        if (!stopped) setStatus({ kind: "nocamera" });
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [valid, decode, handleText, loadZx]);

  /** "Take a photo" path: full-resolution picture from the phone's own camera app. */
  const onPhoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setStatus({ kind: "reading" });
      try {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        const g = canvas.getContext("2d", { willReadFrequently: true });
        if (!g) throw new Error("canvas");
        g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close?.();
        const text = await decode(g.getImageData(0, 0, canvas.width, canvas.height));
        if (!text) {
          setStatus({ kind: "notfound" });
          return;
        }
        await handleText(text);
      } catch {
        setStatus({ kind: "error", msg: "Photo padh nahi paaya. Dobara photo lein." });
      }
    },
    [decode, handleText]
  );

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track || torch === "none") return;
    const next = torch === "on" ? "off" : "on";
    try {
      await track.applyConstraints({ advanced: [{ torch: next === "on" } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      /* torch not available after all */
    }
  }, [torch]);

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
        return { bg: "#1d4ed8", text: "Aadhaar card ka QR chaukor ke beech me rakhein" };
      case "nocamera":
        return { bg: "#b45309", text: "Camera nahi khula. Neeche 'Photo lekar scan karein' dabayein." };
      case "reading":
        return { bg: "#b45309", text: "Photo padh raha hai ..." };
      case "sending":
        return { bg: "#b45309", text: "Computer ko bhej raha hai ..." };
      case "sent":
        return { bg: "#15803d", text: "Bhej diya ✓  Computer par detail dekhein" };
      case "notaadhaar":
        return { bg: "#b91c1c", text: "Ye Aadhaar ka QR nahi hai. Aadhaar card ka QR scan karein." };
      case "notfound":
        return { bg: "#b91c1c", text: "Photo me QR nahi mila. QR ko paas se, saaf aur seedha lekar dobara photo lein." };
      case "error":
        return { bg: "#b91c1c", text: status.msg };
    }
  })();

  const btn: React.CSSProperties = {
    flex: 1,
    padding: "14px 10px",
    borderRadius: 10,
    border: "none",
    fontSize: 16,
    fontWeight: 600,
    color: "#fff",
    background: "#374151",
  };

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
          boxSizing: "border-box",
        }}
      >
        {banner.text}
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 520,
          aspectRatio: "1 / 1",
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
        }}
      >
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {/* guide: the part of the picture that is decoded is the centre square */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "12%",
            border: "3px solid rgba(255,255,255,0.85)",
            borderRadius: 14,
            boxShadow: "0 0 0 2000px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        />
      </div>

      <div style={{ width: "100%", maxWidth: 520, display: "flex", gap: 10 }}>
        <button type="button" style={{ ...btn, background: "#1d4ed8" }} onClick={() => fileRef.current?.click()}>
          Photo lekar scan karein
        </button>
        {torch !== "none" && (
          <button type="button" style={{ ...btn, flex: "0 0 96px" }} onClick={() => void toggleTorch()}>
            {torch === "on" ? "Light band" : "Light"}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e)} style={{ display: "none" }} />

      <p style={{ maxWidth: 520, fontSize: 13, lineHeight: 1.5, opacity: 0.8, textAlign: "center", margin: 0 }}>
        Pehle computer par check-in screen me F8 dabayein. QR poora, saaf aur achhi roshni me dikhe. Camera se na
        padhe to &quot;Photo lekar scan karein&quot; dabakar QR ka paas se photo lein. Ye page kuch save nahi
        karta: scan seedhe aapke hotel ke computer ko jata hai.
      </p>
    </main>
  );
}
