import { q } from "@/backend/database/client";
import { assignDesigner, type Designer } from "@/backend/leads/assign-designer";
import { syncLeadToHubspot } from "@/backend/integrations/hubspot/sync-lead";
import { editMessage, esc } from "@/backend/integrations/telegram/client";
import { fmtDateTime } from "@/backend/shared/util";
import { bookingLinkFor } from "@/backend/integrations/calcom/booking-link";
import { cancelCalBooking } from "@/backend/integrations/calcom/client";

const stamp = () => fmtDateTime(new Date());

/** Edit every Telegram lead message for this lead: original text + a status line, buttons removed. */
export async function refreshTelegram(leadId: string, line: string) {
  const rows = await q("select * from telegram_messages where lead_id=$1 and kind in ('qualified','unclear') and message_id is not null", [leadId]);
  for (const tm of rows) await editMessage(tm.chat_id, tm.message_id, `${tm.compact ? tm.compact + "\n" : tm.text + "\n\n"}${line}`).catch((e) => console.error("[telegram edit]", e.message));
}

const logAction = (leadId: string, action: string, d: Designer, detail?: string) =>
  q("insert into telegram_actions(lead_id, action, actor_id, actor_name, detail) values($1,$2,$3,$4,$5)", [leadId, action, d.telegram_user_id, d.name, detail ?? null]);

export type ApproveResult =
  | { ok: false; error: "already_decided" | "not_found" }
  | { ok: true; designerName: string; bookingLink: string | null };

/** "Take it forward" / Approve. Atomic: the first designer to decide wins, from Telegram or the dashboard. */
export async function approveLead(leadId: string, tapped: Designer, via: "telegram" | "dashboard"): Promise<ApproveResult> {
  const [lead] = await q("select * from leads where id=$1", [leadId]);
  if (!lead) return { ok: false, error: "not_found" };
  const all = await q<Designer>("select * from designers where active");
  const chosen = assignDesigner(lead, tapped, all);
  const claimed = await q(
    "update leads set decision='approved', decided_by=$2, decided_at=now(), assigned_designer_id=$3, status='qualified', updated_at=now() where id=$1 and decision='pending' returning id",
    [leadId, tapped.id, chosen.id],
  );
  if (!claimed.length) return { ok: false, error: "already_decided" };
  await q("update telegram_messages set acted=true, action='take', actor_id=$2, actor_name=$3, acted_at=now() where lead_id=$1 and kind in ('qualified','unclear')", [leadId, tapped.telegram_user_id, tapped.name]);
  await logAction(leadId, "take", tapped, `via ${via}; assigned to ${chosen.name}`);
  // Taking a lead does not book anything: the designer asks the customer's preferred time, or sends the booking link.
  const [ex] = await q("select extraction->>'email' as email from calls where lead_id=$1 order by started_at desc limit 1", [leadId]);
  const link = bookingLinkFor(chosen, { id: leadId, name: lead.name }, ex?.email);
  await refreshTelegram(leadId, `✅ <b>Taken by ${esc(chosen.name)}</b> · ${stamp()}\n📞 Ask ${esc(lead.name ?? "the customer")}${lead.phone ? ` (${esc(lead.phone)})` : ""} for a preferred time${link ? `, or send the booking link:\n${esc(link)}` : "."}`);
  await logAction(leadId, "taken", tapped, `via ${via}`);
  await syncLeadToHubspot(leadId).catch((e) => console.error("[hubspot]", e));
  return { ok: true, designerName: chosen.name, bookingLink: link };
}

/** Cancel any live meeting for a rejected lead. Returns a short note for the Telegram message. */
async function cancelLeadBookings(leadId: string): Promise<string> {
  const rows = await q("select b.*, d.cal_api_key from bookings b left join designers d on d.id=b.designer_id where b.lead_id=$1 and b.status='booked'", [leadId]);
  if (!rows.length) return "";
  const failed: string[] = [];
  for (const b of rows) {
    try {
      const key = b.cal_api_key ?? process.env.CAL_API_KEY;
      if (!key) throw new Error("no Cal.com API key (set CAL_API_KEY)");
      await cancelCalBooking(key, b.external_id, "Declined by designer");
      await q("update bookings set status='canceled', updated_at=now() where id=$1", [b.id]);
      await q("update leads set booking_status='canceled' where id=$1", [leadId]);
    } catch (e: any) { failed.push(e.message); }
  }
  return failed.length ? `\n⚠️ Meeting NOT cancelled (${esc(failed.join("; "))}). Cancel it manually.` : "\n🗑 Meeting cancelled.";
}

/** Reject / Decline. `reason` null = Telegram flow, reason arrives in a follow-up reply. */
export async function rejectLead(leadId: string, d: Designer, reason: string | null, via: "telegram" | "dashboard") {
  const claimed = await q(
    "update leads set decision='rejected', decided_by=$2, decided_at=now(), decision_note=$3, status='lost', updated_at=now() where id=$1 and decision='pending' returning id",
    [leadId, d.id, reason],
  );
  if (!claimed.length) return { ok: false as const, error: "already_decided" as const };
  await q("update telegram_messages set acted=true, action=$4, actor_id=$2, actor_name=$3, acted_at=now() where lead_id=$1 and kind in ('qualified','unclear')", [leadId, d.telegram_user_id, d.name, reason ? "decline" : "decline_pending"]);
  await logAction(leadId, reason ? "decline" : "decline_pending", d, reason ?? `via ${via}`);
  const cancelled = await cancelLeadBookings(leadId);
  await refreshTelegram(leadId, (reason ? `❌ <b>Passed by ${esc(d.name)}</b> · ${stamp()}\n“${esc(reason)}”` : `❌ <b>Passing</b> · ${esc(d.name)} · ${stamp()} (reason needed)`) + cancelled);
  if (reason) await syncLeadToHubspot(leadId).catch((e) => console.error("[hubspot]", e));
  return { ok: true as const };
}

export async function setRejectReason(leadId: string, d: Designer, reason: string) {
  await q("update leads set decision_note=$2, updated_at=now() where id=$1", [leadId, reason]);
  await q("update telegram_messages set action='decline' where lead_id=$1 and action='decline_pending'", [leadId]);
  await logAction(leadId, "decline", d, reason);
  await refreshTelegram(leadId, `❌ <b>Passed by ${esc(d.name)}</b> · ${stamp()}\n“${esc(reason)}”`);
  await syncLeadToHubspot(leadId).catch((e) => console.error("[hubspot]", e));
}
