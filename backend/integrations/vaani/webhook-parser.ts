// ADAPTER for Vaani's post-call webhook (docs.vaanivoice.ai/guides/webhook-setup).
// Event we use: "call_postprocessing" -> { event, call_id, timestamp, data: { room_name, call_id,
//   call_duration (MILLISECONDS), end_reason, summary, entities, dispositions, recording_url,
//   transcript: "[13:33:14] AGENT: ...\n\n[13:33:19] USER: ..." } }
// The sample payload carries NO caller number; we read it from data.* if present, else the
// extractor takes the number the caller dictated. Only this file knows Vaani's shapes: the rest of
// the app consumes NormalizedInteraction (channel-agnostic: WhatsApp/web would build the same object).

export type NormalizedInteraction = {
  channel: "phone" | "whatsapp" | "web";
  externalId: string;
  from: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSec: number | null;
  transcript: string;
  /** seconds from ring to answer, if the platform reports it; null = assume answered immediately */
  answeredAfterSec: number | null;
  /** Vaani's call metadata without the transcript (end_reason, disconnection, etc.), kept for diagnosis */
  raw?: Record<string, unknown>;
};

const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => a?.[p], o); if (v != null && v !== "") return v; } return null; };

/** "[13:33:14] AGENT: hi\n\n[13:33:19] USER: yes" -> "Front Desk: hi\nCaller: yes" (labels the extraction prompt expects) */
export function normalizeTranscript(t: string): string {
  return t
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "")
    .replace(/^\s*AGENT:/gim, "Front Desk:")
    .replace(/^\s*USER:/gim, "Caller:")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** A usable phone number has at least 10 digits. Web calls carry a junk numeric value (e.g. "622") that must be ignored. */
function plausiblePhone(v: unknown): string | null {
  const s = typeof v === "string" || typeof v === "number" ? String(v) : "";
  return s.replace(/\D/g, "").length >= 10 ? s : null;
}
const asDate = (v: unknown): Date | null => { const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null; return d && !isNaN(+d) ? d : null; };

export function parseVaaniWebhook(body: any): NormalizedInteraction {
  const d = body?.data ?? body;
  const id = pick(d, "call_id", "room_name") ?? body?.call_id;
  const raw = pick(d, "transcript");
  if (!id || typeof raw !== "string") throw new Error("Unrecognised Vaani payload: need data.call_id and data.transcript");

  const ended = asDate(d.call_ended_at) ?? asDate(body?.timestamp) ?? new Date();
  const started = asDate(d.picked_up_at) ?? asDate(d.call_started_at);
  const ms = Number(d.call_duration);
  // Prefer the timestamps; call_postprocessing's call_duration is in milliseconds.
  const durationSec = started ? Math.max(0, Math.round((+ended - +started) / 1000)) : Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : null;
  const { transcript: _t, ...meta } = d;
  return {
    channel: "phone",
    externalId: String(id),
    from: plausiblePhone(d.phone_number) ?? plausiblePhone(body?.from) ?? plausiblePhone(d.entities?.phone) ?? plausiblePhone(d.entities?.phone_number),
    startedAt: started ?? new Date(+ended - (durationSec ?? 0) * 1000),
    endedAt: ended,
    durationSec,
    transcript: normalizeTranscript(raw),
    answeredAfterSec: null,
    raw: { ...meta, _from: body?.from ?? null, _to: body?.to ?? null },
  };
}
