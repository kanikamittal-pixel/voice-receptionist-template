import crypto from "node:crypto";
import { safeEqual } from "@/backend/shared/util";

// Cal.com API v2. Each endpoint family needs its own cal-api-version header: bookings "2026-02-25", slots "2024-09-04", webhooks "2024-08-13".
const BASE = "https://api.cal.com/v2";

async function calcom<T = any>(key: string, version: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "cal-api-version": version, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cal.com ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : ({} as T);
}

export async function findCalSlots(key: string, eventTypeId: number, from: Date, days: number, max = 5): Promise<string[]> {
  const q = new URLSearchParams({ eventTypeId: String(eventTypeId), start: from.toISOString(), end: new Date(from.getTime() + days * 86_400_000).toISOString() });
  const r = await calcom<{ data: Record<string, { start: string }[]> }>(key, "2024-09-04", `/slots?${q}`);
  return Object.values(r.data ?? {}).flat().map((s) => s.start).sort().slice(0, max);
}

export async function createCalBooking(key: string, p: { eventTypeId: number; start: string; name: string; email: string; phone: string | null; timezone: string }) {
  const r = await calcom<{ data: { uid: string; start: string; location?: string; meetingUrl?: string } }>(key, "2026-02-25", "/bookings", {
    method: "POST",
    body: JSON.stringify({
      start: p.start, eventTypeId: p.eventTypeId,
      attendee: { name: p.name, email: p.email, timeZone: p.timezone, ...(p.phone ? { phoneNumber: p.phone } : {}) },
      metadata: { source: "aangan-receptionist" },
    }),
  });
  return { uid: r.data.uid, meetingUrl: r.data.location ?? r.data.meetingUrl ?? null };
}

export async function cancelCalBooking(key: string, uid: string, reason: string) {
  return calcom(key, "2026-02-25", `/bookings/${uid}/cancel`, { method: "POST", body: JSON.stringify({ cancellationReason: reason }) });
}

/** x-cal-signature-256 = hex(HMAC_SHA256(secret, rawBody)) */
export function verifyCalWebhook(header: string | null, raw: string, secret: string) {
  if (!header || !secret) return false;
  return safeEqual(crypto.createHmac("sha256", secret).update(raw).digest("hex"), header);
}

/** Subscribe the app to booking events. Safe to run twice: an existing subscription is left alone. */
export async function registerCalWebhook(key: string, url: string, secret: string) {
  try {
    await calcom(key, "2024-08-13", "/webhooks", { method: "POST", body: JSON.stringify({ subscriberUrl: url, triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"], active: true, secret }) });
    return "created";
  } catch (e: any) {
    if (/409|already exists/i.test(String(e.message))) return "already exists";
    throw e;
  }
}
