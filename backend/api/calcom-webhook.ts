import { q } from "@/backend/database/client";
import { verifyCalWebhook } from "@/backend/integrations/calcom/client";
import { syncLeadToHubspot } from "@/backend/integrations/hubspot/sync-lead";
import { linkBookingToFinishedCall } from "@/backend/integrations/calcom/link-vaani-booking";
import { refreshTelegram } from "@/backend/leads/actions";
import { sendMessage, esc } from "@/backend/integrations/telegram/client";
import { fmtDateTime } from "@/backend/shared/util";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCalWebhook(req.headers.get("x-cal-signature-256"), raw, process.env.CAL_WEBHOOK_SECRET ?? "")) return new Response("bad signature", { status: 401 });
  const { triggerEvent, payload } = JSON.parse(raw);

  if (triggerEvent === "BOOKING_CREATED") {
    // Bookings we made ourselves (designer approval) are already stored; this is for ones Vaani made during a call.
    if (payload.metadata?.source === "aangan-receptionist") return Response.json({ ok: true, own: true });
    const att = payload.attendees?.[0] ?? {};
    const attendee = { name: att.name ?? payload.responses?.name?.value ?? null, email: att.email ?? payload.responses?.email?.value ?? null, phoneNumber: att.phoneNumber ?? payload.responses?.attendeePhoneNumber?.value ?? payload.responses?.phone?.value ?? null };
    const meetingUrl = payload.videoCallData?.url ?? payload.metadata?.videoCallUrl ?? (typeof payload.location === "string" && payload.location.startsWith("http") ? payload.location : null);
    const leadFromLink: string | null = typeof payload.metadata?.lead === "string" ? payload.metadata.lead : null;
    const ins = await q(
      `insert into bookings(provider, external_id, start_time, meeting_url, created_by, host_name, host_email, attendee, status)
       values('cal',$1,$2,$3,$4,$5,$6,$7,'booked') on conflict (provider, external_id) where external_id is not null do nothing returning id`,
      [payload.uid, payload.startTime, meetingUrl, leadFromLink ? "customer" : "vaani", payload.organizer?.name ?? null, payload.organizer?.email ?? null, JSON.stringify(attendee)],
    );
    if (ins[0]) {
      let leadId: string | null = null;
      if (leadFromLink) {
        // The customer booked through the designer's link (metadata carries the lead id)
        const [l] = await q("select id from leads where id=$1", [leadFromLink]).catch(() => []);
        if (l) {
          leadId = l.id;
          await q("update bookings set lead_id=$2, updated_at=now() where id=$1", [ins[0].id, leadId]);
          await q("update leads set status='consultation_booked', booking_id=$2, booking_time=$3, booking_status='booked', meeting_url=$4, booked_by='customer', updated_at=now() where id=$1", [leadId, payload.uid, payload.startTime, meetingUrl]);
          await refreshTelegram(leadId!, `📅 <b>Customer booked: ${esc(fmtDateTime(payload.startTime))}</b>${meetingUrl ? `\n🔗 ${esc(meetingUrl)}` : ""}`);
          const chat = process.env.TELEGRAM_DESIGNERS_CHAT_ID;
          const [nm] = await q("select name, phone from leads where id=$1", [leadId]);
          if (chat) await sendMessage(chat, `📅 <b>${esc(nm?.name ?? "A customer")}</b> booked a consultation for <b>${esc(fmtDateTime(payload.startTime))}</b>${payload.organizer?.name ? ` with ${esc(payload.organizer.name)}` : ""}${meetingUrl ? `\n🔗 ${esc(meetingUrl)}` : ""}`).catch(console.error);
        }
      }
      // A booking Vaani made during a call is normally attached by the post-call pipeline; if the call was already processed, attach now.
      if (!leadId) leadId = await linkBookingToFinishedCall(ins[0].id);
      if (leadId) await syncLeadToHubspot(leadId).catch(console.error);
    }
  } else if (triggerEvent === "BOOKING_CANCELLED") {
    const [b] = await q("select * from bookings where provider='cal' and external_id=$1", [payload.uid]);
    if (b) {
      await q("update bookings set status='canceled', updated_at=now() where id=$1", [b.id]);
      if (b.lead_id) {
        await q("update leads set booking_status='canceled', status='qualified', updated_at=now() where id=$1", [b.lead_id]);
        await syncLeadToHubspot(b.lead_id).catch(console.error);
      }
    }
  } else if (triggerEvent === "BOOKING_RESCHEDULED" && payload.rescheduleUid) {
    const [b] = await q("select * from bookings where provider='cal' and external_id=$1", [payload.rescheduleUid]);
    if (b) {
      await q("update bookings set external_id=$2, start_time=$3, status='booked', updated_at=now() where id=$1", [b.id, payload.uid, payload.startTime]);
      if (b.lead_id) {
        await q("update leads set booking_id=$2, booking_time=$3, booking_status='rescheduled', status='consultation_booked', updated_at=now() where id=$1", [b.lead_id, payload.uid, payload.startTime]);
        await syncLeadToHubspot(b.lead_id).catch(console.error);
      }
    }
  }
  return Response.json({ ok: true });
}
