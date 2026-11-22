/**
 * Second-chance pictures for a QR printed with ink spread.
 *
 * Many Aadhaar cards are re-printed locally on PVC; the black of the dense "secure QR" runs
 * into the white, so a lone white module is only a thin grey dot and the normal read fails.
 * These variants make the black thinner again before the decoder looks at the picture:
 *   - "gamma2"      : levels stretched, then brightened (gamma 2): grey dots turn white
 *   - "gamma3thin"  : brightened more (gamma 3), then every dark area shrunk by one pixel
 *   - "cut45"       : only the darkest pixels stay black (hard cut at 45 of 255)
 * Measured on a simulated print (117-module QR, black grown by 2-5 px, camera blur): the plain
 * read got 9 of 24 pictures, with these three 19; the ones still lost had white modules that
 * were closed completely, which nothing can bring back. On a screenshot of a real card that
 * would not scan (22 Nov 2026), "gamma3thin" on a 3x enlargement read it: the one-pixel thinning
 * needs several pixels per module, so small pictures are enlarged first (the page does that).
 *
 * Pure functions on plain pixel arrays (no DOM), so the same code runs in the page and in a
 * Node test. Erasable TypeScript only (Node runs this file as it is).
 */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type RescueKind = "gamma2" | "gamma3thin" | "cut45";
export const RESCUE_KINDS: RescueKind[] = ["gamma2", "gamma3thin", "cut45"];

/** RGBA in, RGBA out (grey), same size. */
export function rescueImage(src: Pixels, kind: RescueKind): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const w = src.width;
  const h = src.height;
  const n = w * h;
  const d = src.data;
  let grey = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    grey[i] = v;
    hist[v]++;
  }
  // black and white points: the 1st and 99th percentile (a glint or a dark table edge must
  // not set the scale)
  const skip = Math.floor(n / 100);
  let lo = 0;
  let hi = 255;
  for (let c = 0; lo < 255 && (c += hist[lo]) <= skip; ) lo++;
  for (let c = 0; hi > 0 && (c += hist[hi]) <= skip; ) hi--;
  if (hi <= lo) {
    lo = 0;
    hi = 255;
  }
  const lut = new Uint8Array(256);
  const g = kind === "gamma2" ? 2 : 3;
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    lut[v] = kind === "cut45" ? (t * 255 > 45 ? 255 : 0) : Math.round(255 * Math.pow(t, 1 / g));
  }
  for (let i = 0; i < n; i++) grey[i] = lut[grey[i]];

  if (kind === "gamma3thin") {
    // each pixel = the lightest of its 3x3 neighbourhood (two passes: across, then down)
    const a = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = grey[row + x];
        if (x > 0 && grey[row + x - 1] > v) v = grey[row + x - 1];
        if (x < w - 1 && grey[row + x + 1] > v) v = grey[row + x + 1];
        a[row + x] = v;
      }
    }
    const b = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = a[row + x];
        if (y > 0 && a[row - w + x] > v) v = a[row - w + x];
        if (y < h - 1 && a[row + w + x] > v) v = a[row + w + x];
        b[row + x] = v;
      }
    }
    grey = b;
  }

  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = grey[i];
    out[p + 3] = 255;
  }
  return { data: out, width: w, height: h };
}
