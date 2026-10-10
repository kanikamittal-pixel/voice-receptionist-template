import { q } from "@/backend/database/client";
import { loadConfig } from "@/backend/config/settings";
import { extractTranscript } from "@/backend/integrations/gemini/extract";
import { applyHardChecks, computeUrgency } from "@/backend/leads/hard-checks";
import { decideRoute, isSure, type Decision } from "@/backend/leads/routing";
import { linkVaaniBooking } from "@/backend/integrations/calcom/link-vaani-booking";
import { callCost } from "@/backend/leads/cost";
import { CRITERION_LABEL, compactLine, renderBooked, renderComplaint, renderLead } from "@/backend/integrations/telegram/messages";
import { sendMessage } from "@/backend/integrations/telegram/client";
import { syncLeadToHubspot } from "@/backend/integrations/hubspot/sync-lead";
import { fmtDateTime, istParts, normalizePhone, recordingUrl, transcriptUrl } from "@/backend/shared/util";
import type { NormalizedInteraction } from "@/backend/integrations/vaani/webhook-parser";

const STATUS_FOR_ROUTE = { qualified: "qualified", unclear: "needs_review", complaint: "complaint", not_a_fit: "not_a_fit", dropped: "needs_review" } as const;

/**
 * Channel-agnostic entry point. A phone webhook, and later WhatsApp or a web form,
 * only differ in how they build the NormalizedInteraction.
 */
export async function processInteraction(n: NormalizedInteraction) {
  const { rules, settings } = await loadConfig();
  const phone = normalizePhone(n.from);

  const inserted = await q(
    "insert into calls(channel, external_id, from_number, started_at, ended_at, duration_sec, transcript, raw) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict (external_id) do nothing returning id",
    [n.channel, n.externalId, phone, n.startedAt, n.endedAt, n.durationSec, n.transcript, n.raw ? JSON.stringify(n.raw) : null],
  );
  if (!inserted.length) return { duplicate: true };
  const callId: string = inserted[0].id;

  try {
    // Merge a callback into a recently dropped call from the same number
    let leadId: string | null = null;
    let transcript = n.transcript;
    if (phone) {
      const prev = await q(
        `select c.lead_id from calls c join leads l on l.id=c.lead_id
         where c.from_number=$1 and c.call_type='dropped_call' and c.id<>$2
           and c.ended_at > $3::timestamptz - make_interval(mins => $4)
           and l.status not in ('declined','lost','won')
         order by c.ended_at desc limit 1`,
        [phone, callId, n.startedAt, settings.merge_window_minutes],
      );
      leadId = prev[0]?.lead_id ?? null;
    }
    if (leadId) {
      const earlier = await q("select transcript from calls where lead_id=$1 order by started_at", [leadId]);
      transcript = earlier.map((e, i) => `--- Earlier call ${i + 1} (dropped) ---\n${e.transcript}`).join("\n") + `\n--- Callback ---\n${n.transcript}`;
    } else {
      const l = await q("insert into leads(phone, first_call_at, last_call_at) values($1,$2,$2) returning id", [phone, n.startedAt]);
      leadId = l[0].id;
    }

    // Repeat-caller context from our own history (calls older than the merge window)
    const history = phone
      ? await q("select count(*)::int as n from calls where from_number=$1 and id<>$2 and lead_id is distinct from $3", [phone, callId, leadId])
      : [{ n: 0 }];

    const { extraction, tokensIn, tokensOut } = await extractTranscript(
      history[0].n > 0 ? `[System note: this number has ${history[0].n} earlier call(s) on record.]\n${transcript}` : transcript,
      n.startedAt, rules,
    );
    const { criteria, overrides } = applyHardChecks(extraction, rules, n.startedAt);
    if (overrides.length) console.warn("[hardcheck override]", callId, JSON.stringify(overrides));
    const decision = decideRoute(extraction, criteria, settings);
    const urgency = computeUrgency(extraction, rules, n.startedAt);

    const bh = settings.business_hours;
    const { hour, day } = istParts(n.startedAt, bh.timezone);
    const outOfHours = !(bh.days.includes(day) && hour >= bh.start_hour && hour < bh.end_hour);
    const cost = callCost(settings.costs, n.durationSec, tokensIn, tokensOut);

    await q(
      `update calls set lead_id=$2, extraction=$3, ai_criteria=$4, final_criteria=$5, overrides=$6, call_type=$7, confidence=$8,
         routing=$9, consent=$10, out_of_hours=$11, answered_within_5min=$12, cost_voice_inr=$13, cost_ai_inr=$14, cost_total_inr=$15,
         gemini_in_tokens=$16, gemini_out_tokens=$17, urgent=$18, urgent_reason=$19 where id=$1`,
      [callId, leadId, extraction, extraction.criteria, criteria, JSON.stringify(overrides), extraction.call_type, extraction.confidence,
        decision.route, extraction.consent_to_record, outOfHours, n.answeredAfterSec == null ? true : n.answeredAfterSec <= 300,
        cost.voice, cost.ai, cost.total, tokensIn, tokensOut, urgency.urgent, urgency.reason],
    );
    await q(
      "update leads set name=coalesce($2,name), phone=coalesce(phone,$3), status=$4, routing=$5, last_call_at=$6, decision=case when decision in ('none','pending') then $7 else decision end, updated_at=now() where id=$1",
      [leadId, extraction.name, phone ?? normalizePhone(extraction.phone), STATUS_FOR_ROUTE[decision.route], decision.route, n.startedAt, decision.route === "qualified" || decision.route === "unclear" ? "pending" : "none"],
    );

    // Did Vaani book a consultation during this call (Cal.com)? Attach it, and decide whether it needs a designer's review.
    const booking = await linkVaaniBooking(leadId!, n.startedAt, n.endedAt, phone ?? normalizePhone(extraction.phone));
    const sure = !!booking && isSure(decision, criteria, extraction);
    if (booking) {
      await q("update leads set decision=$2, decided_at=case when $2='approved' then now() else decided_at end, decision_note=case when $2='approved' then 'Booked by Vaani during the call' else decision_note end where id=$1 and decision in ('none','pending')",
        [leadId, sure ? "approved" : decision.route === "complaint" || decision.route === "dropped" ? "none" : "pending"]);
    }

    // HubSpot first (Nikhil's view), then Telegram; one failing must not block the other
    await syncLeadToHubspot(leadId!).catch((e) => logErr(callId, "hubspot", e));
    await postToTelegram(leadId!, callId, extraction, decision, criteria, booking, sure, urgency).catch((e) => logErr(callId, "telegram", e));
    return { callId, leadId, route: decision.route, overrides };
  } catch (e: any) {
    await logErr(callId, "pipeline", e);
    await alertFrontDesk(callId, n, String(e?.message ?? e));
    throw e;
  }
}

async function logErr(callId: string, where: string, e: any) {
  console.error(`[${where}]`, callId, e);
  await q("update calls set processing_error=coalesce(processing_error,'') || $2 where id=$1", [callId, `[${where}] ${String(e?.message ?? e).slice(0, 500)}\n`]).catch(() => {});
}

async function alertFrontDesk(callId: string, n: NormalizedInteraction, err: string) {
  const chat = process.env.TELEGRAM_FRONTDESK_CHAT_ID;
  if (!chat) return;
  await sendMessage(chat, `⚠️ <b>Call needs manual review</b>: automatic processing failed.\n${n.from ?? "Unknown number"}\n<a href="${transcriptUrl(callId)}">Transcript</a>`).catch(() => {});
}

async function postToTelegram(leadId: string, callId: string, ex: any, decision: Decision, criteria: any, booking: any, sure: boolean, urgency: { urgent: boolean; reason: string | null }) {
  const link0 = transcriptUrl(callId);
  const when = booking ? fmtDateTime(booking.start_time) : "";
  // Vaani booked a very sure lead: FYI only, no approval needed
  if (booking && sure) {
    const chat = process.env.TELEGRAM_DESIGNERS_CHAT_ID;
    if (!chat) throw new Error("Telegram chat id not configured");
    const text = renderBooked(ex, link0, when, booking.host_name, booking.meeting_url, urgency, decision.noted.map((k) => `${CRITERION_LABEL[k]} unclear: ${criteria[k].reason}`), recordingUrl(callId));
    const row = await q("insert into telegram_messages(lead_id, call_id, kind, chat_id, text, acted, action) values($1,$2,'booked',$3,$4,true,'auto_booked') returning id", [leadId, callId, chat, text]);
    const sent = await sendMessage(chat, text);
    await q("update telegram_messages set message_id=$2 where id=$1", [row[0].id, sent.message_id]);
    return;
  }
  // Booked, but our checks are not sure (or disagree): a designer must review, and Decline cancels the meeting
  const warn = booking ? `Vaani already booked ${when}${booking.host_name ? ` with ${booking.host_name}` : ""}. Decline cancels it.` : undefined;
  if ((decision.route === "not_a_fit" && !booking) || decision.route === "dropped") return; // logged and flagged in HubSpot only
  // "Not sure" leads stay on the dashboard; only qualified leads (and review of a booked one) reach Telegram.
  if (decision.route === "unclear" && !booking && !(await loadConfig()).settings.telegram.send_unclear) return;
  const link = transcriptUrl(callId);
  const isComplaint = decision.route === "complaint";
  const chat = isComplaint ? process.env.TELEGRAM_FRONTDESK_CHAT_ID : process.env.TELEGRAM_DESIGNERS_CHAT_ID;
  if (!chat) throw new Error("Telegram chat id not configured");
  const kind = decision.route === "qualified" ? "qualified" : "unclear"; // a booked not_a_fit is reviewed as "unclear"
  const text = isComplaint ? renderComplaint(ex, link, recordingUrl(callId)) : renderLead(ex, decision, criteria, link, kind, warn, urgency, recordingUrl(callId));
  const row = await q(
    "insert into telegram_messages(lead_id, call_id, kind, chat_id, text, compact) values($1,$2,$3,$4,$5,$6) returning id",
    [leadId, callId, isComplaint ? "complaint" : kind, chat, text, compactLine(ex)],
  );
  const id = row[0].id;
  const buttons = isComplaint
    ? [{ text: "✅ Callback done", callback_data: `cb:${id}` }]
    : [{ text: "✅ Take it forward", callback_data: `take:${id}` }, { text: "❌ Pass", callback_data: `decl:${id}` }];
  const sent = await sendMessage(chat, text, buttons);
  await q("update telegram_messages set message_id=$2 where id=$1", [id, sent.message_id]);
}
