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

/** Aadhaar (old XML or the all-digits secure QR) or a driving licence ("Name:..,DLNo:..,DOB:.."). */
function isIdQr(text: string) {
  const t = text.trim();
  if (/PrintLetterBarcodeData/i.test(t) || /^\d{300,}$/.test(t)) return true;
  return (
    t.length >= 20 &&
    t.length <= 600 &&
    !t.includes("<") &&
    /(^|[^A-Za-z])DL\s*No\.?\s*[:=]/i.test(t) &&
    /(^|[^A-Za-z])Name\s*[:=]/i.test(t)
  );
}

/**
 * Voter ID card (EPIC). It carries the card number only, no name or address:
 *   - the QR of the newer cards: base64 of AES-128-CBC({"epic_no":"ABC1234567", ...}), one fixed
 *     key for every card (public: github.com/captn3m0/epicqr, MIT)
 *   - open JSON with an "epic" / "epic_no" key (some cards)
 *   - the card number alone (the 1D barcode of older cards)
 * Must stay in step with looksLikeVoterQr (lib/aadhaar-relay.ts) and VoterParse (AADHAR.PRG).
 */
const EPIC_RE = /^(?:[A-Z]{3}\d{7}|[A-Z]{2,3}\/\d{1,3}\/\d{1,4}\/\d{3,7})$/;
const EPIC_JSON_RE = /"epic(?:_?no)?"\s*:\s*"[^"]{6,23}"/i;
const EPIC_KEY = "X_4k$uq23FSwI.qT";
const EPIC_IV = "H76$suq23_po(8sD";

/** The text as a voter card number, or null when it is not one. */
function epicNo(text: string): string | null {
  const c = text.replace(/\s+/g, "").toUpperCase();
  return EPIC_RE.test(c) ? c : null;
}

async function isVoterQr(text: string): Promise<boolean> {
  const t = text.trim();
  if (t.length < 8 || t.length > 600 || t.includes("<")) return false;
  if (t.includes("{")) return EPIC_JSON_RE.test(t);
  const c = t.replace(/\s+/g, "");
  if (epicNo(c)) return true;
  if (c.length < 24 || c.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(c)) return false;
  try {
    const data = Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0));
    if (data.length < 16 || data.length % 16 !== 0) return false;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return true; // this browser cannot check it: the server does
    const enc = new TextEncoder();
    const key = await subtle.importKey("raw", enc.encode(EPIC_KEY), { name: "AES-CBC" }, false, ["decrypt"]);
    const plain = new TextDecoder().decode(await subtle.decrypt({ name: "AES-CBC", iv: enc.encode(EPIC_IV) }, key, data));
    return plain.trimStart().startsWith("{") && EPIC_JSON_RE.test(plain);
  } catch {
    return false; // wrong padding: some other base64 text
  }
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
  | { kind: "sentvoter" }
  | { kind: "already" }
  | { kind: "idsending" }
  | { kind: "idsent"; side: "f" | "b" }
  | { kind: "notaadhaar" }
  | { kind: "notfound" }
  | { kind: "error"; msg: string };

export default function AadhaarScanPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const valid = CODE_RE.test(code);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // ID card photos (front / back) for checkin.exe's "ID Photo" box (F4 in the guest box).
  const idRef = useRef<HTMLInputElement>(null);
  const idSideRef = useRef<"f" | "b">("f");
  const idSeqRef = useRef(0);
  const [idSent, setIdSent] = useState<{ f?: boolean; b?: boolean }>({});
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
  const nativeLinRef = useRef<Detector | null | undefined>(undefined); // same, for 1D barcodes (voter ID)

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

  /**
   * No QR in the picture: the 1D barcode of an older voter ID card. Only a voter card number
   * is taken; any other barcode in view is ignored (no "wrong code" message for it).
   */
  const decodeLinear = useCallback(
    async (image: ImageData): Promise<string | null> => {
      const zx = await loadZx();
      const res = await zx.readBarcodes(image, {
        formats: ["Code128", "Code39", "Code93"],
        tryHarder: true,
        tryRotate: true,
        tryDownscale: true,
        maxNumberOfSymbols: 3,
      });
      for (const r of res) {
        const n = epicNo(r.text ?? "");
        if (n) return n;
      }
      return null;
    },
    [loadZx]
  );

  /** The browser's own reader for those 1D barcodes, or null. */
  const getNativeLinear = useCallback(async (): Promise<Detector | null> => {
    if (nativeLinRef.current !== undefined) return nativeLinRef.current;
    nativeLinRef.current = null;
    try {
      const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (BD?.getSupportedFormats) {
        const want = ["code_128", "code_39", "code_93"];
        const have = (await BD.getSupportedFormats()).filter((f) => want.includes(f));
        if (have.length) nativeLinRef.current = new BD({ formats: have });
      }
    } catch {
      nativeLinRef.current = null;
    }
    return nativeLinRef.current;
  }, []);

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

  /**
   * Reads the QR in a canvas: the phone's reader first, then ZXing on the same pixels.
   * linear = true: when there is no QR, also look for a voter ID card's 1D barcode.
   */
  const decodeCanvas = useCallback(
    async (canvas: HTMLCanvasElement, linear = false): Promise<string | null> => {
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
      const image = g.getImageData(0, 0, canvas.width, canvas.height);
      const qr = await decode(image);
      if (qr || !linear) return qr;
      const lin = await getNativeLinear();
      if (lin) {
        try {
          for (const f of await lin.detect(canvas)) {
            const n = epicNo(f.rawValue ?? "");
            if (n) return n;
          }
        } catch {
          /* ZXing below */
        }
      }
      return decodeLinear(image);
    },
    [decode, decodeLinear, getNative, getNativeLinear]
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
      // A voter ID card gives its number only: the name is typed on the computer.
      const voter = !isIdQr(text) && (await isVoterQr(text));
      if (!voter && !isIdQr(text)) {
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
        if (res.status === 422) {
          setStatus({ kind: "notaadhaar" }); // the server did not take it as an ID code
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        lastRef.current = { text, at: Date.now() };
        setIdSent({}); // a new guest: their card photos are not sent yet
        setStatus({ kind: voter ? "sentvoter" : "sent" });
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
      out: number,
      linear = false
    ): Promise<string | null> => {
      canvas.width = out;
      canvas.height = out;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(src, sx, sy, side, side, 0, 0, out, out);
      return decodeCanvas(canvas, linear);
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
            // (and, with no QR in it, for the wide 1D barcode of an older voter ID card)
            text = await tryRegion(video, (vw - side) / 2, (vh - side) / 2, side, Math.min(side, 1600), true);
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
        const text = await decodeCanvas(canvas, true);
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

  /**
   * ID card photo (front or back): taken with the phone's own camera app, shrunk here to a
   * JPEG of at most about 700 KB (the server refuses more than 900 KB) and posted to
   * /api/aimg/<code>, where checkin.exe's "ID Photo" box picks it up. Not kept on this page.
   */
  const onIdPhoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const side = idSideRef.current;
      const seq = ++idSeqRef.current;
      setStatus({ kind: "idsending" });
      try {
        const bmp = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        let blob: Blob | null = null;
        for (const [max, q] of [
          [1600, 0.82],
          [1280, 0.72],
          [1024, 0.6],
        ]) {
          const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
          canvas.width = Math.max(1, Math.round(bmp.width * k));
          canvas.height = Math.max(1, Math.round(bmp.height * k));
          const g = canvas.getContext("2d");
          if (!g) throw new Error("canvas");
          g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
          if (blob && blob.size <= 700_000) break;
        }
        bmp.close?.();
        if (!blob || blob.size > 880_000) throw new Error("size");
        const res = await fetch(`/api/aimg/${code}?side=${side}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        setIdSent((p) => ({ ...p, [side]: true }));
        setStatus({ kind: "idsent", side });
        if (navigator.vibrate) navigator.vibrate(120);
        await new Promise((r) => setTimeout(r, 4000));
        // back to the scan message, unless another photo was sent meanwhile
        if (idSeqRef.current === seq) {
          setStatus((s) => (s.kind === "idsent" ? (trackRef.current ? { kind: "scanning" } : { kind: "nocamera" }) : s));
        }
      } catch {
        setStatus({ kind: "error", msg: "Photo bhej nahi paaya. Internet dekh kar dobara photo lein." });
      }
    },
    [code]
  );

  // The "sent" ticks belong to one guest: clear them after two minutes (the server has
  // dropped an uncollected photo by then anyway).
  useEffect(() => {
    if (!idSent.f && !idSent.b) return;
    const t = setTimeout(() => setIdSent({}), 120_000);
    return () => clearTimeout(t);
  }, [idSent]);

  const takeIdPhoto = useCallback((side: "f" | "b") => {
    idSideRef.current = side;
    idRef.current?.click();
  }, []);

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
        <h1 style={{ fontSize: 20, margin: "24px 0 0" }}>Aadhaar / Driving Licence / Voter ID Scan</h1>
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
      case "sentvoter":
        return { bg: "#15803d", text: "Voter ID ka number bhej diya ✓  Naam computer par type karein" };
      case "already":
        return { bg: "#15803d", text: "Ye card abhi bheja ja chuka hai ✓  Agla card dikhayein" };
      case "idsending":
        return { bg: "#b45309", text: "Photo computer ko bhej raha hai ..." };
      case "idsent":
        return {
          bg: "#15803d",
          text: `${status.side === "f" ? "Front" : "Back"} photo bhej diya ✓  Computer par dekhein`,
        };
      case "notaadhaar":
        return { bg: "#b91c1c", text: "Ye Aadhaar, Driving Licence ya Voter ID ka QR nahi hai. Unhi ka QR scan karein." };
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
      <h1 style={{ fontSize: 20, margin: "4px 0 0" }}>Aadhaar / Driving Licence / Voter ID Scan</h1>
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

      {/* ID card photos for the guest record (computer: F4 = ID Photo in the guest box) */}
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          border: "1px solid #374151",
          borderRadius: 12,
          padding: 12,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, textAlign: "center" }}>ID card ka photo</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={{ ...btn, background: idSent.f ? "#15803d" : "#374151" }} onClick={() => takeIdPhoto("f")}>
            {idSent.f ? "Front ✓ (dobara)" : "Front photo"}
          </button>
          <button type="button" style={{ ...btn, background: idSent.b ? "#15803d" : "#374151" }} onClick={() => takeIdPhoto("b")}>
            {idSent.b ? "Back ✓ (dobara)" : "Back photo"}
          </button>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.75, textAlign: "center" }}>
          Computer par guest box me F4 (ID Photo) dabayein, phir yahan card ke aage aur peeche ka photo lein.
          Agle guest ke liye wahi dobara.
        </div>
      </div>
      <input ref={idRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onIdPhoto(e)} style={{ display: "none" }} />

      <p style={{ maxWidth: 520, fontSize: 13, lineHeight: 1.5, opacity: 0.8, textAlign: "center", margin: 0 }}>
        Pehle computer par check-in screen me F8 dabayein. Phone ko card se lagbhag 12-15 cm door rakhein, QR
        chaukor ko lagbhag bhar de aur us par chamak na pade. Dhundhla dikhe to picture par ungli se tap karein
        (focus), ya phone thoda door karke Zoom + dabayein. Phir bhi na padhe to &quot;Photo lekar scan
        karein&quot; se QR ka photo lein. Voter ID ke QR / barcode me sirf card number hota hai: naam computer
        par type karna hoga. Ye page kuch save nahi karta: scan seedhe aapke hotel ke computer ko jata hai.
      </p>
      {(info.cam || info.engine) && (
        <div style={{ fontSize: 11, opacity: 0.45, textAlign: "center" }}>
          {[info.cam, info.lens, info.engine, info.photo].filter(Boolean).join(" · ")}
        </div>
      )}
    </main>
  );
}
