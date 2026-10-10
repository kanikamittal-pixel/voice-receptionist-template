import { esc } from "@/backend/shared/util";

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(api(method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j: any = await res.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result as T;
}

export type Button = { text: string; callback_data: string };

export const sendMessage = (chat_id: string | number, text: string, buttons?: Button[], extra: Record<string, unknown> = {}) =>
  tg<{ message_id: number }>("sendMessage", {
    chat_id, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}), ...extra,
  });

export const editMessage = (chat_id: string | number, message_id: number, text: string, buttons?: Button[]) =>
  tg("editMessageText", {
    chat_id, message_id, text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons ? [buttons] : [] },
  }).catch((e) => { if (!/not modified/i.test(String(e))) throw e; });

export const answerCallback = (id: string, text?: string, alert = false) =>
  tg("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert }).catch(() => {});

export const setWebhook = (url: string, secret: string) =>
  tg("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });

export const who = (u: { first_name?: string; last_name?: string; username?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Someone";

export { esc };
