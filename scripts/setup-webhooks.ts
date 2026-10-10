// Registers the Telegram and Cal.com webhooks against APP_URL. Safe to run more than once.
import "./env";
import { setWebhook } from "../backend/integrations/telegram/client";
import { registerCalWebhook } from "../backend/integrations/calcom/client";

(async () => {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL not set");
  await setWebhook(`${base}/api/webhooks/telegram`, process.env.TELEGRAM_WEBHOOK_SECRET!);
  console.log("Telegram webhook set");
  if (process.env.CAL_API_KEY && process.env.CAL_WEBHOOK_SECRET) {
    console.log("Cal.com webhook:", await registerCalWebhook(process.env.CAL_API_KEY, `${base}/api/webhooks/calcom`, process.env.CAL_WEBHOOK_SECRET));
  }
  console.log(`Register in Vaani (Settings -> Webhooks, event call_postprocessing): ${base}/api/webhooks/vaani?key=<VAANI_WEBHOOK_KEY>`);
})().catch((e) => { console.error(e); process.exit(1); });
