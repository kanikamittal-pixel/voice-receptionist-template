import { q } from "@/backend/database/client";
import { loadConfig } from "@/backend/config/settings";
import { sendMessage, esc } from "@/backend/integrations/telegram/client";

// Vercel Cron (see vercel.json). Needs a plan that allows sub-daily cron, or an external pinger.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("unauthorized", { status: 401 });
  const { settings } = await loadConfig();
  const due = await q(
    `select tm.*, l.name from telegram_messages tm join leads l on l.id=tm.lead_id
     where tm.kind='complaint' and not tm.acted and tm.message_id is not null and tm.reminder_count < $2
       and now() >= tm.created_at + make_interval(mins => $1 * (tm.reminder_count + 1))`,
    [settings.complaint_reminder_minutes, settings.complaint_max_reminders],
  );
  for (const m of due) {
    const mins = settings.complaint_reminder_minutes * (m.reminder_count + 1);
    await sendMessage(m.chat_id, `⏰ <b>Reminder:</b> callback to ${esc(m.name ?? "client")} still pending after ${mins} min. Tap “Callback done” when called.`, undefined, { reply_to_message_id: m.message_id });
    await q("update telegram_messages set reminder_count=reminder_count+1, last_reminder_at=now() where id=$1", [m.id]);
  }
  return Response.json({ reminded: due.length });
}
