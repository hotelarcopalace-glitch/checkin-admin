"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Phone page for the Aadhaar QR relay. The hotel PC (checkin.exe, F8 on the check-in
 * screen) shows a link to /s/<code>; the receptionist opens it on a phone, points the
 * camera at the QR on the guest's Aadhaar card, and the raw QR text is posted to
 * /api/ascan/<code>, where checkin.exe picks it up. Nothing is decoded into fields or kept here.
 *
 * Decoders: the phone's own BarcodeDetector where the browser has one (Android Chrome: the
 * Play Services scanner, which copes with soft focus and faint print better than anything in
 * JavaScript), then zxing-wasm (ZXing-C++) on the same picture. The first version used the
 * `qr-scanner` package, which could not read real Aadhaar cards (tested on photos of two
 * cards: it failed on almost every attempt, ZXing read both every time). Two ways to scan:
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

/** The browser's built-in barcode reader (not in TypeScript's DOM types). */
type Detector = { detect(src: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

/** ImageCapture: full-resolution stills from the live camera (Android Chrome). */
type PhotoSize = { imageWidth: number; imageHeight: number };
type Capture = {
  takePhoto(s?: PhotoSize): Promise<Blob>;
  getPhotoCapabilities(): Promise<{ imageWidth?: { max?: number }; imageHeight?: { max?: number } }>;
};
type CaptureCtor = new (t: MediaStreamTrack) => Capture;

type Status =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "nocamera" }
  | { kind: "reading" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "already" }
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
  // Zoom the phone camera offers (null = none). A small, lightly printed QR needs it: the
  // camera cannot focus very close, so zooming is how the code gets enough pixels.
  const [zoom, setZoom] = useState<{ min: number; max: number; value: number } | null>(null);
  // Small diagnostic line at the bottom (resolution, lens, decoders, still size): what the
  // hotel reads out to us when a card will not scan.
  const [info, setInfo] = useState<{ cam?: string; lens?: string; engine?: string; photo?: string }>({});
  // Back cameras of the phone. Some phones hand the browser the ultra-wide lens, which cannot
  // focus on a card held close: "Camera badlein" steps through the others.
  const [cams, setCams] = useState<string[]>([]);
  const [camId, setCamId] = useState<string | null>(null);
  const curCamRef = useRef<string | null>(null);
  const nativeRef = useRef<Detector | null | undefined>(undefined); // undefined = not looked for yet

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

  /** The browser's own QR reader, or null where there is none (iPhone, desktop Windows). */
  const getNative = useCallback(async (): Promise<Detector | null> => {
    if (nativeRef.current !== undefined) return nativeRef.current;
    nativeRef.current = null;
    try {
      const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (BD) {
        const formats = BD.getSupportedFormats ? await BD.getSupportedFormats() : ["qr_code"];
        if (formats.includes("qr_code")) nativeRef.current = new BD({ formats: ["qr_code"] });
      }
    } catch {
      nativeRef.current = null;
    }
    return nativeRef.current;
  }, []);

  /** Reads the QR in a canvas: the phone's reader first, then ZXing on the same pixels. */
  const decodeCanvas = useCallback(
    async (canvas: HTMLCanvasElement): Promise<string | null> => {
      const det = await getNative();
      if (det) {
        try {
          const found = await det.detect(canvas);
          const t = found.find((f) => f.rawValue)?.rawValue;
          if (t) return t;
        } catch {
          /* the built-in reader failed on this picture: ZXing below */
        }
      }
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      return decode(g.getImageData(0, 0, canvas.width, canvas.height));
    },
    [decode, getNative]
  );

  /** A QR was read: check it, send it to the PC, show the result. */
  const handleText = useCallback(
    async (raw: string) => {
      const text = raw.trim(); // the two decoders must give the same string for one card
      const last = lastRef.current;
      // The same card stays in view for a moment: do not send it twice, but say so
      // (silence here looked like "it is not scanning").
      if (last && last.text === text && Date.now() - last.at < 12000) {
        setStatus({ kind: "already" });
        return;
      }
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

    let frame = 0;
    let startedAt = Date.now();
    let lastDeep = 0;
    let deepFails = 0;
    let deepCount = 0;
    let capture: Capture | null = null;
    let photoSize: PhotoSize | undefined;

    /** Draws part of a source into the canvas and decodes it. */
    const tryRegion = async (
      src: CanvasImageSource,
      sx: number,
      sy: number,
      side: number,
      out: number
    ): Promise<string | null> => {
      canvas.width = out;
      canvas.height = out;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(src, sx, sy, side, side, 0, 0, out, out);
      return decodeCanvas(canvas);
    };

    /**
     * "Deep scan": a full-resolution still from the camera (ImageCapture.takePhoto, Android
     * Chrome). Video frames are often only 720p-1080p, too coarse for a small or faint QR;
     * the still is the sensor's full size. Used only after the video frames have failed for
     * a few seconds, and at most every 3 seconds.
     *
     * The still's size must be asked for: left alone, Chrome may return one no bigger than
     * the video frame, which gains nothing. Capped at about 4000px (a 50MP still would not
     * fit in a cheap phone's memory).
     */
    const deepScan = async (): Promise<string | null> => {
      const IC = (window as unknown as { ImageCapture?: CaptureCtor }).ImageCapture;
      const track = trackRef.current;
      if (!IC || !track || deepFails >= 3) return null;
      try {
        if (!capture) {
          capture = new IC(track);
          try {
            const pc = await capture.getPhotoCapabilities();
            const w = pc.imageWidth?.max;
            const h = pc.imageHeight?.max;
            if (w && h) {
              const k = Math.min(1, 4096 / Math.max(w, h));
              photoSize = { imageWidth: Math.round(w * k), imageHeight: Math.round(h * k) };
            }
          } catch {
            /* no capabilities: the default still */
          }
        }
        let blob: Blob;
        try {
          blob = await capture.takePhoto(photoSize);
        } catch (e) {
          if (!photoSize) throw e;
          photoSize = undefined; // this size was refused: the default still from now on
          blob = await capture.takePhoto();
        }
        const bmp = await createImageBitmap(blob);
        const photo = `photo ${bmp.width}x${bmp.height}`;
        setInfo((p) => (p.photo === photo ? p : { ...p, photo }));
        // alternately the middle 80% and the middle 50% (a small code gets more pixels)
        const side = Math.min(bmp.width, bmp.height);
        const part = Math.round(side * (deepCount++ % 2 === 0 ? 0.8 : 0.5));
        const text = await tryRegion(
          bmp,
          Math.round((bmp.width - part) / 2),
          Math.round((bmp.height - part) / 2),
          part,
          Math.min(part, 2600)
        );
        bmp.close?.();
        deepFails = 0;
        return text;
      } catch {
        // three failures in a row: this phone/browser cannot do it, stop trying
        if (++deepFails >= 3) setInfo((p) => ({ ...p, photo: "photo -" }));
        return null;
      }
    };

    const tick = async () => {
      if (stopped) return;
      if (!busyRef.current && video.readyState >= 2 && video.videoWidth > 0) {
        busyRef.current = true;
        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const side = Math.min(vw, vh);
          let text: string | null = null;
          if (frame % 2 === 0) {
            // whole centre square, shrunk to at most 1600px: fast, enough for an easy code
            text = await tryRegion(video, (vw - side) / 2, (vh - side) / 2, side, Math.min(side, 1600));
          } else {
            // the middle 60% at the camera's own resolution (enlarged if that is small):
            // every pixel the stream has goes to the code inside the guide square
            const part = Math.round(side * 0.6);
            text = await tryRegion(video, (vw - part) / 2, (vh - part) / 2, part, Math.max(part, Math.min(part * 2, 1400)));
          }
          frame++;
          const now = Date.now();
          if (!text && now - startedAt > 4000 && now - lastDeep > 3000) {
            lastDeep = now;
            text = await deepScan();
          }
          if (text && !stopped) {
            await handleText(text);
            startedAt = Date.now();
          }
        } catch {
          /* a failed frame is normal: try the next one */
        } finally {
          busyRef.current = false;
        }
      }
      if (!stopped) timer = setTimeout(tick, 200);
    };

    (async () => {
      try {
        void loadZx(); // start loading the decoder while the camera opens
        void getNative().then((d) => {
          if (!stopped) setInfo((p) => ({ ...p, engine: d ? "ML+ZX" : "ZX" }));
        });
        setZoom(null);
        setTorch("none");
        const size = { width: { ideal: 3840 }, height: { ideal: 2160 } };
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: camId ? { deviceId: { exact: camId }, ...size } : { facingMode: { ideal: "environment" }, ...size },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        // Continuous autofocus and torch where the phone offers them (not in every browser's types).
        const caps = (track.getCapabilities?.() ?? {}) as {
          focusMode?: string[];
          torch?: boolean;
          zoom?: { min: number; max: number; step?: number };
        };
        if (caps.focusMode?.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (caps.torch) setTorch("off");
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          // Start at 2x where the phone allows it: the QR on a card is small.
          const value = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2));
          track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {});
          setZoom({ min: caps.zoom.min, max: caps.zoom.max, value });
        }
        const st = track.getSettings?.() ?? {};
        curCamRef.current = st.deviceId ?? null;
        setInfo((p) => ({
          ...p,
          cam: st.width && st.height ? `camera ${st.width}x${st.height}` : undefined,
          lens: track.label || undefined,
          photo: undefined,
        }));
        // The phone's back cameras (labels are readable only now, after permission).
        try {
          const vids = (await navigator.mediaDevices.enumerateDevices()).filter(
            (d) => d.kind === "videoinput" && d.deviceId
          );
          const back = vids.filter((d) => /back|rear|environment/i.test(d.label));
          const list = (back.length ? back : vids).map((d) => d.deviceId);
          setCams((prev) => (prev.join("|") === list.join("|") ? prev : list));
        } catch {
          /* no list: no "Camera badlein" button */
        }
        if (stopped) return;
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
  }, [valid, camId, decodeCanvas, getNative, handleText, loadZx]);

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
        const text = await decodeCanvas(canvas);
        if (!text) {
          setStatus({ kind: "notfound" });
          return;
        }
        await handleText(text);
      } catch {
        setStatus({ kind: "error", msg: "Photo padh nahi paaya. Dobara photo lein." });
      }
    },
    [decodeCanvas, handleText]
  );

  /** Next back camera of the phone (the effect above reopens the stream on it). */
  const switchCam = useCallback(() => {
    if (cams.length < 2) return;
    const i = cams.indexOf(curCamRef.current ?? "");
    setStatus({ kind: "starting" });
    setCamId(cams[(i + 1) % cams.length]);
  }, [cams]);

  /** Tap on the picture: make the camera focus again (it sometimes settles on the background). */
  const refocus = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const modes = ((track.getCapabilities?.() ?? {}) as { focusMode?: string[] }).focusMode ?? [];
    if (!modes.includes("continuous")) return;
    const other = modes.includes("single-shot") ? "single-shot" : modes.includes("manual") ? "manual" : "";
    if (!other) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: other } as MediaTrackConstraintSet] });
    } catch {
      /* stays in continuous focus */
    }
    setTimeout(
      () => {
        trackRef.current
          ?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
          .catch(() => {});
      },
      other === "single-shot" ? 1200 : 300
    );
  }, []);

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

  const changeZoom = useCallback(
    async (delta: number) => {
      const track = trackRef.current;
      if (!track || !zoom) return;
      const value = Math.min(zoom.max, Math.max(zoom.min, Math.round((zoom.value + delta) * 10) / 10));
      try {
        await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
        setZoom({ ...zoom, value });
      } catch {
        /* zoom not available after all */
      }
    },
    [zoom]
  );

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
        return { bg: "#1d4ed8", text: "QR ko chaukor ke beech me, bada aur saaf rakhein" };
      case "nocamera":
        return { bg: "#b45309", text: "Camera nahi khula. Neeche 'Photo lekar scan karein' dabayein." };
      case "reading":
        return { bg: "#b45309", text: "Photo padh raha hai ..." };
      case "sending":
        return { bg: "#b45309", text: "Computer ko bhej raha hai ..." };
      case "sent":
        return { bg: "#15803d", text: "Bhej diya ✓  Computer par detail dekhein" };
      case "already":
        return { bg: "#15803d", text: "Ye card abhi bheja ja chuka hai ✓  Agla card dikhayein" };
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
        onClick={() => void refocus()}
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
      {zoom && (
        <div style={{ width: "100%", maxWidth: 520, display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" style={{ ...btn, flex: "0 0 84px" }} onClick={() => void changeZoom(-0.5)}>
            Zoom &minus;
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 15 }}>Zoom {zoom.value.toFixed(1)}x</div>
          <button type="button" style={{ ...btn, flex: "0 0 84px" }} onClick={() => void changeZoom(0.5)}>
            Zoom +
          </button>
        </div>
      )}
      {cams.length > 1 && (
        <button type="button" style={{ ...btn, flex: "none", width: "100%", maxWidth: 520 }} onClick={switchCam}>
          Camera badlein (dhundhla dikhe to)
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e)} style={{ display: "none" }} />

      <p style={{ maxWidth: 520, fontSize: 13, lineHeight: 1.5, opacity: 0.8, textAlign: "center", margin: 0 }}>
        Pehle computer par check-in screen me F8 dabayein. Phone ko card se lagbhag 12-15 cm door rakhein, QR
        chaukor ko lagbhag bhar de aur us par chamak na pade. Dhundhla dikhe to picture par ungli se tap karein
        (focus), ya phone thoda door karke Zoom + dabayein. Phir bhi na padhe to &quot;Photo lekar scan
        karein&quot; se QR ka photo lein. Ye page kuch save nahi karta: scan seedhe aapke hotel ke computer ko
        jata hai.
      </p>
      {(info.cam || info.engine) && (
        <div style={{ fontSize: 11, opacity: 0.45, textAlign: "center" }}>
          {[info.cam, info.lens, info.engine, info.photo].filter(Boolean).join(" · ")}
        </div>
      )}
    </main>
  );
}
