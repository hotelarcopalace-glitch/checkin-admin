/**
 * Passport MRZ (the two 44-character lines at the bottom of the photo page), from OCR text.
 *
 *   P<INDSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<<<<
 *   A1234567<8IND8001019M3001012<<<<<<<<<<<<<<04
 *
 * OCR of these lines makes a few typical mistakes (Z for 2, O for 0, L or C for the filler
 * "<", one character too many or too few). Line 2 has check digits, so it can be repaired and
 * proved: a character is only changed where the field's own rules allow it, and the passport
 * number, date of birth and expiry date must each match their check digit. Line 1 (the names)
 * has no check digit: it is tidied, never proved, so the hotel must look at the name.
 *
 * The name line has one more trap, seen on a real Indian passport (24 Nov 2026): the English
 * OCR model reads the passport font's "<" as "K", or as "<K" (one character too many), so the
 * names came out with stray K's or run together. Read without the letter K the same line comes
 * out with the right length and the right "<<". So the page reads the name line twice, with
 * and without K, and mergeNameLines() keeps a K only where the second reading also saw a
 * letter there (a real K turns into some other letter, a false one into "<" or nothing).
 *
 * mrzFromOcr() returns the two lines rebuilt exactly as a passport prints them (44 + 44), which
 * is what checkin.exe parses (AADHAR.PRG, PassParse), or null when line 2 cannot be proved.
 *
 * Pure functions, erasable TypeScript only: the same file runs in the page, on the server and
 * in a Node test.
 */

const TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
/** What OCR turns the filler "<" into. */
const FILLER = "<LCKE";

export function mrzCheckDigit(s: string): string {
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 90 ? c - 55 : 0;
    t += v * [7, 3, 1][i % 3];
  }
  return String(t % 10);
}

const digits = (s: string) => s.replace(/[A-Z]/g, (c) => TO_DIGIT[c] ?? c);
const letters = (s: string) => s.replace(/[0-9]/g, (c) => TO_LETTER[c] ?? c);

/** The passport number as OCR gave it, and the spellings it may really be (fewest changes first). */
function numberCandidates(raw: string, indian: boolean): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  add(raw);
  if (indian) {
    // Indian passport: one letter, seven digits, then the filler
    add(letters(raw.slice(0, 1)) + digits(raw.slice(1, 8)) + "<");
  }
  // any other mix: every ambiguous character either way (at most 9 of them = 512 spellings)
  const pos: number[] = [];
  for (let i = 0; i < raw.length; i++) if (TO_DIGIT[raw[i]] || TO_LETTER[raw[i]]) pos.push(i);
  const combos: Array<{ s: string; n: number }> = [];
  for (let m = 1; m < 1 << pos.length; m++) {
    const a = raw.split("");
    let n = 0;
    for (let k = 0; k < pos.length; k++) {
      if (m & (1 << k)) {
        const c = a[pos[k]];
        a[pos[k]] = TO_DIGIT[c] ?? TO_LETTER[c] ?? c;
        n++;
      }
    }
    combos.push({ s: a.join(""), n });
  }
  combos.sort((x, y) => x.n - y.n);
  for (const c of combos) add(c.s);
  return out;
}

/** One 44-character candidate for line 2 -> the repaired line, or null. */
function fixLine2(s: string): string | null {
  if (s.length !== 44 || !/^[A-Z0-9<]+$/.test(s)) return null;
  const nat = letters(s.slice(10, 13));
  const dob = digits(s.slice(13, 19));
  const c2 = digits(s.slice(19, 20));
  let sex = s.slice(20, 21);
  const exp = digits(s.slice(21, 27));
  const c3 = digits(s.slice(27, 28));
  const c1 = digits(s.slice(9, 10));
  if (!/^[A-Z<]{3}$/.test(nat) || !/^\d{6}$/.test(dob) || !/^\d{6}$/.test(exp)) return null;
  if (!"MFX<".includes(sex)) sex = "<";
  if (mrzCheckDigit(dob) !== c2 || mrzCheckDigit(exp) !== c3) return null;
  const mm = Number(dob.slice(2, 4));
  const dd = Number(dob.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const num = numberCandidates(s.slice(0, 9), nat === "IND").find((n) => /^[A-Z0-9]+<*$/.test(n) && mrzCheckDigit(n) === c1);
  if (!num) return null;
  // optional personal number: when it is only filler (as on most passports) print it clean
  let pers = s.slice(28, 42);
  let c4 = digits(s.slice(42, 43));
  if ([...pers].every((ch) => FILLER.includes(ch) || ch === "0" || ch === "O")) {
    pers = "<".repeat(14);
    c4 = c4 === "0" ? "0" : "<"; // passports print either for an empty field
  }
  const c4v = c4 === "<" ? "0" : c4;
  const comp = mrzCheckDigit(num + c1 + dob + c2 + exp + c3 + pers + c4v);
  return num + c1 + nat + dob + c2 + sex + exp + c3 + pers + c4 + comp;
}

/** Line 2 from one OCR line: as it is, or with one character dropped / one filler added. */
function line2From(s: string): string | null {
  if (s.length === 44) return fixLine2(s);
  if (s.length === 45) {
    for (let i = 0; i < 45; i++) {
      const r = fixLine2(s.slice(0, i) + s.slice(i + 1));
      if (r) return r;
    }
  }
  if (s.length === 43 || s.length === 42) {
    // the fillers at the end are what OCR loses most: pad there
    return fixLine2(s.slice(0, 28) + s.slice(28).padEnd(16, "<").slice(0, 14).padEnd(14, "<") + s.slice(-2)) ?? fixLine2(s.padEnd(44, "<"));
  }
  return null;
}

/** Line 1 from one OCR line -> rebuilt to 44 characters, or null when it is not a name line. */
function line1From(s: string): { line: string; name: string } | null {
  if (s.length < 30 || s[0] !== "P") return null;
  const country = letters(s.slice(2, 5));
  if (!/^[A-Z<]{3}$/.test(country)) return null;
  let names = letters(s.slice(5)).replace(/[^A-Z<]/g, "");
  const sep = names.indexOf("<<");
  if (sep < 1) return null;
  const surname = names.slice(0, sep);
  let given = names.slice(sep + 2);
  // after the given names everything is filler, which OCR reads as "<", L, C, K ...
  const end = given.search(/<[<LCKE]+$/);
  if (end >= 0) given = given.slice(0, end);
  given = given.replace(/<+$/g, "");
  if (!/^[A-Z<]+$/.test(surname) || !/^[A-Z<]*$/.test(given)) return null;
  names = surname + "<<" + given;
  const line = ("P<" + country + names).padEnd(44, "<").slice(0, 44);
  const name = (given.replace(/</g, " ") + " " + surname.replace(/</g, " ")).replace(/\s+/g, " ").trim();
  return name ? { line, name } : null;
}

export type Mrz = { line1: string; line2: string; number: string; name: string };

const ocrLines = (text: string) =>
  text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 30);

/** How many single-character edits turn a into b, and the characters paired up ("" = none). */
function alignLines(a: string, b: string): { cost: number; pairs: Array<[string, string]> } {
  const n = a.length;
  const m = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) {
    d.push(new Array<number>(m + 1).fill(0));
    d[i][0] = i;
  }
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  const pairs: Array<[string, string]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      pairs.push([a[--i], b[--j]]);
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      pairs.push([a[--i], ""]);
    } else {
      pairs.push(["", b[--j]]);
    }
  }
  pairs.reverse();
  return { cost: d[n][m], pairs };
}

/**
 * The name line read with every letter allowed (a) and read again without the letter K (b):
 * b has the right length and the right "<", a has the right letters. A "K" of a survives only
 * where b also saw a letter; a character only a has is dropped; and where either reading saw
 * the filler "<" it is the filler (OCR turns fillers into letters far more often than letters
 * into fillers).
 */
export function mergeNameLines(a: string, b: string): string {
  let out = "";
  for (const [ca, cb] of alignLines(a, b).pairs) {
    if (cb === "") continue;
    if (ca === "") out += cb;
    else if (ca === "<" || cb === "<") out += "<";
    else out += ca;
  }
  return out;
}

/**
 * OCR text of a passport photo page (any lines) -> the proved MRZ, or null.
 * textNoK = the same picture read again with the letter K not allowed: when given, the name
 * line is taken from both readings (mergeNameLines).
 */
export function mrzFromOcr(text: string, textNoK?: string): Mrz | null {
  const lines = ocrLines(text);
  const other = textNoK ? ocrLines(textNoK) : [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line2 = line2From(lines[i]);
    if (!line2) continue;
    // the name line is the one above; look a little further up in case OCR split something
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      let raw = lines[j];
      if (raw[0] !== "P") continue;
      // the same line in the second reading: the one that differs least
      let best: string | null = null;
      let bestCost = Math.ceil(raw.length / 3);
      for (const o of other) {
        if (o[0] !== "P") continue;
        const c = alignLines(raw, o).cost;
        if (c < bestCost) {
          bestCost = c;
          best = o;
        }
      }
      if (best) raw = mergeNameLines(raw, best);
      const l1 = line1From(raw);
      if (l1) return { line1: l1.line, line2, number: line2.slice(0, 9).replace(/</g, ""), name: l1.name };
    }
  }
  return null;
}

/** True when the first reading already holds a provable line 2 (so a second reading is worth it). */
export function mrzHasLine2(text: string): boolean {
  return ocrLines(text).some((l) => line2From(l) !== null);
}

/**
 * True for the passport text the relay carries: the two MRZ lines (line 2 proved by its check
 * digits), or the passport number alone from the barcode on the last page of an Indian
 * passport (one letter and seven digits).
 */
export function looksLikePassport(text: string): boolean {
  const t = text.trim().toUpperCase();
  if (/^[A-Z]\d{7}$/.test(t)) return true;
  if (t.length < 80 || t.length > 200) return false;
  const c = t.replace(/\s+/g, "");
  const m = /P[A-Z<][A-Z<]{3}[A-Z<]{39}([A-Z0-9<]{9})(\d)[A-Z<]{3}(\d{6})(\d)[MFX<]\d{6}/.exec(c);
  return !!m && mrzCheckDigit(m[1]) === m[2] && mrzCheckDigit(m[3]) === m[4];
}

/**
 * Evens out the light on a photo of a page before OCR: a shadow across half the page (very
 * common in a hand-held photo) makes the OCR engine's single black/white threshold lose
 * everything on the dark side. Each pixel is divided by the paper brightness around it
 * (measured on a coarse grid, from the lighter pixels of each cell, so the text itself does
 * not count), which turns shaded paper white again while the print stays dark.
 * RGBA in, RGBA out (grey), same size.
 */
export function flattenLight(src: { data: Uint8ClampedArray; width: number; height: number }): {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
} {
  const w = src.width;
  const h = src.height;
  const n = w * h;
  const d = src.data;
  const grey = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) grey[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
  const cell = Math.max(8, Math.round(Math.max(w, h) / 48));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const bg = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * cell;
      const y0 = gy * cell;
      const x1 = Math.min(w, x0 + cell);
      const y1 = Math.min(h, y0 + cell);
      let sum = 0;
      let cnt = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += grey[y * w + x]; cnt++; }
      const mean = sum / cnt;
      let s2 = 0;
      let c2 = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = grey[y * w + x];
          if (v >= mean) { s2 += v; c2++; }
        }
      }
      bg[gy * gw + gx] = Math.max(24, c2 ? s2 / c2 : mean);
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;
      const b =
        (bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx) * (1 - ty) + (bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx) * ty;
      // paper -> about 235; the print keeps its share of the paper's brightness
      const v = Math.min(255, (grey[y * w + x] / b) * 235);
      const p = (y * w + x) * 4;
      out[p] = out[p + 1] = out[p + 2] = v;
      out[p + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Several readings of the same page (different sizes), each as [text, textNoK]: line 2 from
 * the first one that proves it, the name line by majority (the single readings still disagree
 * about a stray letter now and then; the same wrong letter rarely comes back at another size).
 */
export function mrzVote(readings: Array<[string, string | undefined]>): Mrz | null {
  const got = readings.map(([a, b]) => mrzFromOcr(a, b)).filter((r): r is Mrz => r !== null);
  if (!got.length) return null;
  const count = new Map<string, number>();
  for (const r of got) count.set(r.line1, (count.get(r.line1) ?? 0) + 1);
  let best = got[0];
  for (const r of got) if ((count.get(r.line1) ?? 0) > (count.get(best.line1) ?? 0)) best = r;
  return { ...best, line2: got[0].line2, number: got[0].number };
}

/**
 * Checks the names of the MRZ against the page's own printed text (the "Surname" and "Given
 * Name(s)" values above the two lines, read by a normal OCR pass of the upper part of the page).
 * The MRZ name line has no check digit and OCR adds a stray letter to a name now and then
 * (a filler read as a letter): a name word that is not on the page, but is on the page without
 * its first or last letter, loses that letter; a lone K / L / C / E between names is dropped.
 * Nothing is changed unless the page itself shows the changed word.
 * When the "<<" between surname and given names was itself read as "<K" (so everything looked
 * like one long surname), the place where that stray letter was removed is the boundary.
 * nameSeen = every name word was found printed on the page.
 */
export function mrzCheckNames(m: Mrz, pageText: string): Mrz & { nameSeen: boolean } {
  const words = new Set(pageText.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 2));
  const country = m.line1.slice(2, 5);
  const body = m.line1.slice(5).replace(/<+$/, "");
  const sep = body.indexOf("<<");
  const parts = sep >= 0 ? [body.slice(0, sep), body.slice(sep + 2)] : [body, ""];
  let seen = 0;
  let total = 0;
  const fixed = parts.map((part) => {
    const toks = part.split("<").filter((t) => t.length > 0);
    const kept: string[] = [];
    const stray: number[] = [];
    let cut = -1; // index in kept where a filler read as a letter was removed in front of a word
    for (const t of toks) {
      if (words.has(t)) {
        kept.push(t);
        seen++;
        total++;
        continue;
      }
      const cand = [t.slice(0, -1), t.slice(1), t.slice(1, -1)].find((c) => c.length >= 2 && words.has(c));
      if (cand) {
        if (cut < 0 && kept.length > 0 && cand !== t.slice(0, -1) && "KLCE".includes(t[0])) cut = kept.length;
        kept.push(cand);
        seen++;
        total++;
      } else if (t.length === 1 && "KLCE".includes(t)) {
        if (cut < 0 && kept.length > 0) cut = kept.length;
        stray.push(kept.length);
        kept.push(t);
      } else {
        kept.push(t);
        total++;
      }
    }
    return { kept, stray, cut };
  });
  // one long "surname" and no given names, with a stray letter removed inside it: split there
  if (seen > 0 && fixed[1].kept.length === 0 && fixed[0].cut > 0) {
    const f = fixed[0];
    fixed[1] = { kept: f.kept.slice(f.cut), stray: f.stray.filter((i) => i >= f.cut).map((i) => i - f.cut), cut: -1 };
    fixed[0] = { kept: f.kept.slice(0, f.cut), stray: f.stray.filter((i) => i < f.cut), cut: -1 };
  }
  // lone K / L / C / E: only when the page confirmed some other name word
  const names = fixed.map(({ kept, stray }) => (seen > 0 ? kept.filter((_, i) => !stray.includes(i)) : kept));
  if (seen === 0) total += fixed.reduce((n, f) => n + f.stray.length, 0);
  if (!names[0].length && !names[1].length) return { ...m, nameSeen: false };
  const line1 = ("P<" + country + names[0].join("<") + "<<" + names[1].join("<")).padEnd(44, "<").slice(0, 44);
  const name = (names[1].join(" ") + " " + names[0].join(" ")).trim();
  return { ...m, line1, name, nameSeen: total > 0 && seen === total };
}
