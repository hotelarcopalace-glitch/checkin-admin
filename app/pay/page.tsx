"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * UPI payment request page, opened from a link the hotel sends to a guest on WhatsApp
 * (checkin.exe: bill screen > F9 = UPI QR > W). The link is
 *
 *     https://checkin.co.in/pay#<base64url of "1|<UPI ID>|<name>|<amount>|<bill no.>">
 *
 * Everything is after the "#", so it never reaches this server (not in the request, not in
 * the logs): the page reads it in the browser, shows the amount and the UPI ID, and offers a
 * "Pay" button (a upi:// link that opens the phone's UPI app with the amount filled in) and a
 * QR code for paying from another phone. No money passes through us and nothing is stored;
 * whether the guest paid is seen only in the hotel's own UPI app.
 *
 * Must stay in step with PayLink() in UPIQR.PRG (the desktop program).
 */

type PayReq = { vpa: string; name: string; amount: string; bill: string };

const VPA_RE = /^[A-Za-z0-9._-]{2,100}@[A-Za-z][A-Za-z0-9.-]{1,60}$/;
const AMT_RE = /^\d{1,8}(\.\d{1,2})?$/;
const WASM_URL = "/zxing/zxing_writer.wasm";

/** Text from the link is shown as typed, but only plain printable characters and a sane length. */
function clean(s: string, max: number) {
  return s.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);
}

function parseHash(hash: string): PayReq | null {
  try {
    const b64 = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!b64 || b64.length > 600 || !/^[A-Za-z0-9+/]+$/.test(b64)) return null;
    const parts = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)).split("|");
    if (parts.length < 5 || parts[0] !== "1") return null;
    const vpa = parts[1].trim();
    const amount = parts[3].trim();
    if (!VPA_RE.test(vpa) || !AMT_RE.test(amount) || !(Number(amount) > 0)) return null;
    return { vpa, name: clean(parts[2], 40), amount: Number(amount).toFixed(2), bill: clean(parts.slice(4).join("|"), 24) };
  } catch {
    return null;
  }
}

/** The same link the hotel's printed / on-screen QR carries. */
function upiLink(r: PayReq) {
  let u = `upi://pay?pa=${r.vpa}`;
  if (r.name) u += `&pn=${encodeURIComponent(r.name)}`;
  u += `&am=${r.amount}&cu=INR`;
  if (r.bill) u += `&tn=${encodeURIComponent("Bill " + r.bill)}`;
  return u;
}

function rupees(amount: string) {
  const [whole, paise] = amount.split(".");
  return `${Number(whole).toLocaleString("en-IN")}.${paise ?? "00"}`;
}

export default function PayPage() {
  // undefined = not read yet (first paint, before the hash is looked at); null = bad link
  const [req, setReq] = useState<PayReq | null | undefined>(undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [qrState, setQrState] = useState<"idle" | "loading" | "failed">("idle");

  const showQr = useCallback(async (r: PayReq) => {
    setQrState("loading");
    try {
      const zx = await import("zxing-wasm/writer");
      zx.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_URL : prefix + path) },
      });
      const out = await zx.writeBarcode(upiLink(r), { format: "QRCode", ecLevel: "M", scale: 6, withQuietZones: true });
      if (!out.image) throw new Error(out.error || "no image");
      setQr(URL.createObjectURL(out.image));
      setQrState("idle");
    } catch {
      setQrState("failed");
    }
  }, []);

  useEffect(() => {
    const read = () => {
      const r = parseHash(window.location.hash);
      setReq(r);
      setQr(null);
      setQrState("idle");
      // On a computer there is no UPI app to open: show the QR straight away.
      if (r && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) void showQr(r);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [showQr]);

  if (req === undefined) return <main className="min-h-dvh" />;

  if (req === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">Payment link is not valid</h1>
        <p className="mt-3 text-sm text-slate-600">
          This link is incomplete or damaged. Please ask the hotel to send the payment link again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">UPI payment request</p>
        {req.name && <h1 className="mt-2 text-center text-xl font-semibold break-words">{req.name}</h1>}
        {req.bill && <p className="mt-1 text-center text-sm text-slate-600">Bill No. {req.bill}</p>}

        <p className="mt-5 text-center text-4xl font-bold tabular-nums">
          <span className="mr-1 text-2xl font-semibold">&#8377;</span>
          {rupees(req.amount)}
        </p>

        <dl className="mt-5 rounded-xl bg-slate-50 p-3 text-sm">
          <dt className="text-xs text-slate-500">Pay to UPI ID</dt>
          <dd className="font-mono font-semibold break-all">{req.vpa}</dd>
        </dl>

        <a
          href={upiLink(req)}
          className="mt-5 block rounded-xl bg-indigo-600 px-4 py-3 text-center text-base font-semibold text-white active:bg-indigo-700"
        >
          Pay &#8377;{rupees(req.amount)} with UPI app
        </a>
        <p className="mt-2 text-center text-xs text-slate-500">Opens GPay / PhonePe / Paytm / BHIM on this phone.</p>

        <div className="mt-5 border-t border-slate-200 pt-4 text-center">
          {qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="UPI QR code for this payment" className="mx-auto h-56 w-56" />
              <p className="mt-2 text-xs text-slate-500">Or scan this QR code with any UPI app on another phone.</p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void showQr(req)}
              disabled={qrState === "loading"}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              {qrState === "loading" ? "Making QR code..." : qrState === "failed" ? "QR code failed - try again" : "Show QR code"}
            </button>
          )}
        </div>
      </section>

      <p className="mt-4 px-2 text-center text-xs leading-relaxed text-slate-500">
        The payment goes directly from your UPI app to the UPI ID shown above. Check the name your UPI app shows
        before you pay. This page only displays the request sent by the hotel; it does not receive or hold money.
      </p>
    </main>
  );
}
