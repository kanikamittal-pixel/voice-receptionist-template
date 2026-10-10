import { after } from "next/server";
import { parseVaaniWebhook } from "@/backend/integrations/vaani/webhook-parser";
import { processInteraction } from "@/backend/leads/process-call";
import { safeEqual } from "@/backend/shared/util";

// Vaani's docs describe no webhook signature, so the endpoint is protected by a secret in the URL:
//   https://<app>/api/webhooks/vaani?key=<VAANI_WEBHOOK_KEY>
export async function POST(req: Request) {
  const key = process.env.VAANI_WEBHOOK_KEY ?? "";
  const given = new URL(req.url).searchParams.get("key") ?? "";
  if (!key || !safeEqual(key, given)) { console.warn("[vaani webhook] rejected: wrong or missing key"); return new Response("unauthorized", { status: 401 }); }
  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  // Diagnostics (no transcript text / secrets): what Vaani actually sent.
  console.log("[vaani webhook]", JSON.stringify({ event: body.event ?? null, topKeys: Object.keys(body ?? {}), dataKeys: Object.keys(body?.data ?? {}), hasTranscript: typeof (body?.data?.transcript ?? body?.transcript) === "string" }));
  // Only the post-processing event carries the transcript; acknowledge every other lifecycle event.
  if (body.event !== "call_postprocessing") return Response.json({ ok: true, ignored: body.event ?? null });
  let n;
  try { n = parseVaaniWebhook(body); } catch (e: any) { console.error("vaani payload", e.message, JSON.stringify(body).slice(0, 2000)); return Response.json({ error: e.message }, { status: 400 }); }
  // Acknowledge quickly; the pipeline continues after the response. Duplicates are ignored by external_id.
  after(async () => { try { await processInteraction(n); } catch (e) { console.error("pipeline failed", e); } });
  return Response.json({ ok: true });
}
