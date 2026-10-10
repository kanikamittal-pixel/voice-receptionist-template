import { q } from "@/backend/database/client";
import { safeEqual, sign } from "@/backend/shared/util";

// Streams the call recording from Vaani. Link is signed (same scheme as transcripts); ?download=1 forces a file download.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const t = url.searchParams.get("t") ?? "";
  if (!t || !safeEqual(sign(id), t)) return new Response("Not authorised", { status: 401 });
  const [c] = await q("select external_id from calls where id=$1", [id]).catch(() => []);
  if (!c?.external_id) return new Response("Not found", { status: 404 });
  const up = await fetch(`https://api.vaanivoice.ai/api/stream/${encodeURIComponent(c.external_id)}`, { headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" } });
  if (!up.ok || !up.body) return new Response("Recording not available yet", { status: 404 });
  const headers: Record<string, string> = { "content-type": up.headers.get("content-type") ?? "audio/ogg", "cache-control": "private, max-age=3600" };
  const len = up.headers.get("content-length"); if (len) headers["content-length"] = len;
  if (url.searchParams.has("download")) headers["content-disposition"] = `attachment; filename="aangan-call-${c.external_id}.ogg"`;
  return new Response(up.body, { headers });
}
