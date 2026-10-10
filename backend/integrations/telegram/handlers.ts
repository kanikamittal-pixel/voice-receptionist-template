import { q } from "@/backend/database/client";
import { answerCallback, editMessage, esc, sendMessage, who } from "@/backend/integrations/telegram/client";
import type { Designer } from "@/backend/leads/assign-designer";
import { approveLead, rejectLead, setRejectReason } from "@/backend/leads/actions";
import { fmtDateTime } from "@/backend/shared/util";

/** Atomically claim a message (used for the complaint "Callback done" button): works exactly once. */
async function claim(id: number, action: string, actorId: number, actorName: string) {
  const r = await q(
    "update telegram_messages set acted=true, action=$2, actor_id=$3, actor_name=$4, acted_at=now() where id=$1 and acted=false returning *",
    [id, action, actorId, actorName],
  );
  return r[0] ?? null;
}

export async function handleCallback(cb: any) {
  const [kind, idStr] = String(cb.data ?? "").split(":");
  const id = Number(idStr);
  const actorId: number = cb.from.id, actorName = who(cb.from);
  if (!id || !["take", "decl", "cb"].includes(kind)) return answerCallback(cb.id);

  if (kind === "cb") {
    const tm = await claim(id, "callback_done", actorId, actorName);
    if (!tm) return answerCallback(cb.id, "Already handled");
    await answerCallback(cb.id, "Marked done");
    await q("insert into telegram_actions(telegram_message_id, lead_id, action, actor_id, actor_name) values($1,$2,'callback_done',$3,$4)", [tm.id, tm.lead_id, actorId, actorName]);
    return editMessage(tm.chat_id, tm.message_id, `${tm.compact ? tm.compact + "\n" : tm.text + "\n\n"}✅ <b>Callback done</b> by ${esc(actorName)} · ${fmtDateTime(new Date())}`);
  }

  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1 and active", [actorId]);
  if (!designer) return answerCallback(cb.id, "You're not registered as a designer. Ask the admin to add you.", true);
  const [tm] = await q("select * from telegram_messages where id=$1", [id]);
  if (!tm) return answerCallback(cb.id);

  if (kind === "take") {
    const r = await approveLead(tm.lead_id, designer, "telegram");
    return answerCallback(cb.id, r.ok ? "Booking…" : "Already handled");
  }

  // decline: decide now, then ask for the reason via force-reply
  const r = await rejectLead(tm.lead_id, designer, null, "telegram");
  if (!r.ok) return answerCallback(cb.id, "Already handled");
  await answerCallback(cb.id);
  const prompt = await sendMessage(tm.chat_id, `${esc(designer.name)}, one-line reason for passing? <i>Reply to this message.</i>`, undefined, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Reason…" },
    reply_to_message_id: tm.message_id,
  });
  await q("update telegram_messages set decline_prompt_message_id=$2 where id=$1", [tm.id, prompt.message_id]);
}

/** A reply to the decline prompt supplies the reason. */
export async function handleMessage(msg: any) {
  // Onboarding helper: anyone who messages the bot privately gets their IDs back, to give to the studio admin.
  if (msg.chat?.type === "private" && msg.text && !msg.reply_to_message) {
    await sendMessage(msg.chat.id, `👋 Hi ${esc(who(msg.from))}.\nYour Telegram ID: <code>${msg.from.id}</code>\nThis chat's ID: <code>${msg.chat.id}</code>\nSend these to the studio admin to be set up.`);
    return;
  }
  const replyTo = msg.reply_to_message?.message_id;
  if (!replyTo || !msg.text) return;
  const [tm] = await q("select * from telegram_messages where decline_prompt_message_id=$1 and chat_id=$2 and action='decline_pending'", [replyTo, msg.chat.id]);
  if (!tm || tm.actor_id !== msg.from.id) return;
  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1", [msg.from.id]);
  if (!designer) return;
  await setRejectReason(tm.lead_id, designer, String(msg.text).slice(0, 300));
}
