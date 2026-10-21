import { query } from "./db";

// Sends OTP texts through the Chartered Info SMS gateway (the same one the hotel software uses).
//
//   GET https://messaging.charteredinfo.com/smsaspx?ID=..&Pwd=..&PhNo=..&Text=..&TemplateID=..
//
// The text must match the DLT-registered template exactly (template 1777179251415235321,
// header CHKIIN), otherwise the operator drops the message. Login details live in env vars:
//   SMS_GATEWAY_ID, SMS_GATEWAY_PWD   (required; without them nothing is sent)
//   SMS_GATEWAY_URL, SMS_OTP_TEMPLATE_ID   (optional overrides)
// A failed send never breaks login: the OTP is still readable by an admin.

const DEFAULT_URL = "https://messaging.charteredinfo.com/smsaspx";
const DEFAULT_OTP_TEMPLATE_ID = "1777179251415235321";

/** The registered DLT text. Do not reword it without registering a new template. */
export function otpText(code: string): string {
  return `${code} is your OTP for CHECKIN. It is valid for 10 minutes. Do not share it with anyone. - CHECKIN`;
}

/** "+919829012345" or "9829012345" -> "919829012345" (what the gateway expects). */
function gatewayNumber(mobile: string): string | null {
  const d = mobile.replace(/\D/g, "");
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  return null;
}

export function gatewayConfigured(): boolean {
  return Boolean(process.env.SMS_GATEWAY_ID && process.env.SMS_GATEWAY_PWD);
}

async function logSend(mobile: string, purpose: string, ok: boolean, detail: string) {
  try {
    await query("INSERT INTO sms_gateway_log (mobile, purpose, ok, detail) VALUES ($1,$2,$3,$4)", [
      mobile,
      purpose,
      ok,
      detail.slice(0, 300),
    ]);
  } catch {
    /* logging must never break the send */
  }
}

/** Sends the OTP SMS. Resolves with ok=false (never throws) when it could not be sent. */
export async function sendOtpSms(mobile: string, code: string, purpose: string): Promise<{ ok: boolean; detail: string }> {
  if (!gatewayConfigured()) return { ok: false, detail: "gateway not configured" };
  const to = gatewayNumber(mobile);
  if (!to) {
    await logSend(mobile, purpose, false, "not an Indian mobile number");
    return { ok: false, detail: "not an Indian mobile number" };
  }

  const url = new URL(process.env.SMS_GATEWAY_URL || DEFAULT_URL);
  url.searchParams.set("ID", process.env.SMS_GATEWAY_ID as string);
  url.searchParams.set("Pwd", process.env.SMS_GATEWAY_PWD as string);
  url.searchParams.set("PhNo", to);
  url.searchParams.set("Text", otpText(code));
  url.searchParams.set("TemplateID", process.env.SMS_OTP_TEMPLATE_ID || DEFAULT_OTP_TEMPLATE_ID);

  let ok = false;
  let detail = "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = (await res.text()).replace(/\s+/g, " ").trim();
    // The gateway answers in plain text; anything that reads like a refusal counts as a failure.
    ok = res.ok && !/fail|error|invalid|wrong|insufficient|denied|reject|not\s+(allowed|valid|found)/i.test(body);
    detail = `HTTP ${res.status}: ${body}`;
  } catch (err) {
    detail = `request failed: ${err instanceof Error ? err.message : "unknown"}`;
  }
  await logSend(to, purpose, ok, detail);
  return { ok, detail };
}
