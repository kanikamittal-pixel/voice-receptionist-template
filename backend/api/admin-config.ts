import { getConfigValue, setConfigValue, loadConfig } from "@/backend/config/settings";
import { safeEqual } from "@/backend/shared/util";

const ok = (req: Request) => safeEqual(process.env.ADMIN_TOKEN ?? "x", (req.headers.get("authorization") ?? "").replace("Bearer ", ""));

// GET -> effective config + the stored overrides. PUT {key:'rules'|'settings', value:{...}} -> store overrides.
export async function GET(req: Request) {
  if (!ok(req)) return new Response("unauthorized", { status: 401 });
  const eff = await loadConfig();
  return Response.json({ effective: eff, overrides: { rules: await getConfigValue("rules"), settings: await getConfigValue("settings") } });
}
export async function PUT(req: Request) {
  if (!ok(req)) return new Response("unauthorized", { status: 401 });
  const { key, value } = await req.json();
  if (!["rules", "settings"].includes(key) || typeof value !== "object") return Response.json({ error: "bad request" }, { status: 400 });
  await setConfigValue(key, value);
  return Response.json({ ok: true });
}
