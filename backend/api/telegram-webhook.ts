import { after } from "next/server";
import { handleCallback, handleMessage } from "@/backend/integrations/telegram/handlers";
import { safeEqual } from "@/backend/shared/util";

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || !safeEqual(secret, req.headers.get("x-telegram-bot-api-secret-token") ?? "")) return new Response("unauthorized", { status: 401 });
  const update = await req.json();
  after(async () => {
    try {
      if (update.callback_query) await handleCallback(update.callback_query);
      else if (update.message) await handleMessage(update.message);
    } catch (e) { console.error("telegram handler failed", e); }
  });
  return Response.json({ ok: true });
}
