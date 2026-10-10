export async function POST(req: Request) {
  const { session_token } = await req.json().catch(() => ({}));
  if (!session_token) return Response.json({ ok: false }, { status: 400 });
  await fetch("https://api.vaanivoice.ai/api/webrtc/session/disconnect", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ session_token, explicit_end: true }),
  }).catch(() => {});
  return Response.json({ ok: true });
}
