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

/** OCR text of a passport photo page (any lines) -> the proved MRZ, or null. */
export function mrzFromOcr(text: string): Mrz | null {
  const lines = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 30);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line2 = line2From(lines[i]);
    if (!line2) continue;
    // the name line is the one above; look a little further up in case OCR split something
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const l1 = line1From(lines[j]);
      if (l1) return { line1: l1.line, line2, number: line2.slice(0, 9).replace(/</g, ""), name: l1.name };
    }
  }
  return null;
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
