// Creates a Vaani web-call session and exchanges it for LiveKit credentials (server-side, so the API key never reaches the browser).
// Each call is billable: 15-minute cap and a best-effort per-IP limit.
const hits = new Map<string, number[]>();
const VAANI = "https://api.vaanivoice.ai";

const vaani = (path: string, body: unknown) =>
  fetch(VAANI + path, { method: "POST", headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "", "content-type": "application/json" }, body: JSON.stringify(body) });

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 6) return Response.json({ error: "Too many call attempts. Please try again later." }, { status: 429 });
  hits.set(ip, [...recent, now]);

  // Default path: Create Dispatch (medium "webrtc") with a per-call override of the initial-silence hang-up (10s -> 15s).
  // `?old=1` falls back to the plain session API (agent config as stored, no override).
  if (!new URL(req.url).searchParams.has("old")) {
    const res = await vaani("/api/trigger-call/", {
      agent_id: process.env.VAANI_AGENT_ID,
      medium: "webrtc",
      voice_gender: "male", // the agent's configured voice (devansh) is male
      primary_language: "en",
      secondary_language: "hi",
      welcome_message: "Good day, Aangan Studio. This call is recorded to help us serve you better. Is that okay?",
      welcome_interruptible: false,
      modify_agent: { experience: { settings: { idle_conversation_settings: { initial_idle_call_hungup_timeout: 15 } } } },
    });
    if (!res.ok) { const t = (await res.text()).slice(0, 300); console.error("vaani trigger-call webrtc", res.status, t); return Response.json({ error: /balance|402|payment/i.test(t) ? "The voice assistant is temporarily unavailable. Please try again later." : "Could not start the call. Please try again." }, { status: 502 }); }
    const j: any = await res.json();
    if (j.status_code === 402 || /insufficient balance/i.test(String(j.message ?? ""))) { console.error("VAANI WALLET EMPTY:", j.message); return Response.json({ error: "The voice assistant is temporarily unavailable. Please try again later." }, { status: 503 }); }
    if (!j.token || !j.connection_url) { console.error("vaani trigger-call: unexpected response", JSON.stringify(j).slice(0, 300)); return Response.json({ error: "Could not start the call. Please try again." }, { status: 502 }); }
    return Response.json({ lk_url: j.connection_url, lk_token: j.token, session_token: null, room: j.room_name });
  }

  const created = await vaani("/api/webrtc/session/create", { agent_id: process.env.VAANI_AGENT_ID, ui_type: "widget", session_ttl: 900, grace_period: 30 });
  if (!created.ok) { console.error("vaani session create", created.status, (await created.text()).slice(0, 300)); return Response.json({ error: "Could not start the call. Please try again." }, { status: 502 }); }
  const { session_token } = await created.json();

  const conn = await vaani("/api/webrtc/session/connect", { session_token });
  if (!conn.ok) { console.error("vaani session connect", conn.status, (await conn.text()).slice(0, 300)); return Response.json({ error: "Could not connect the call. Please try again." }, { status: 502 }); }
  const { lk_url, lk_token } = await conn.json();
  return Response.json({ lk_url, lk_token, session_token });
}
