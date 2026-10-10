import crypto from "node:crypto";

export const TZ = "Asia/Kolkata";

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  return "+" + digits;
}

export function istParts(d: Date, timezone = TZ) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "numeric", hour12: false, weekday: "short",
  }).formatToParts(d);
  const hour = Number(p.find((x) => x.type === "hour")!.value) % 24;
  const wd = p.find((x) => x.type === "weekday")!.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { hour, day };
}

export function fmtDateTime(d: Date | string, timezone = TZ) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(d));
}

export function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sign(data: string) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(data).digest("hex").slice(0, 32);
}

export function transcriptUrl(callId: string) {
  return `${process.env.APP_URL ?? ""}/transcripts/${callId}?t=${sign(callId)}`;
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** True for a complete Indian number: 10 digits, 0 + 10, or 91 + 10. */
export function phoneLooksValid(raw?: string | null) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 10 || (d.length === 11 && d.startsWith("0")) || (d.length === 12 && d.startsWith("91"));
}

/** Signed link to a call's audio, served by our proxy (Vaani's stream needs our API key). */
export function recordingUrl(callId: string) {
  return `${process.env.APP_URL ?? ""}/api/recording/${callId}?t=${sign(callId)}`;
}
