import { q } from "@/backend/database/client";
import { hs, hubspotIds, upsertContact, upsertDeal, type StageKey } from "@/backend/integrations/hubspot/client";
import { CRITERIA_KEYS } from "@/backend/integrations/gemini/extract";
import { CRITERION_LABEL } from "@/backend/integrations/telegram/messages";
import { fmtDateTime, transcriptUrl } from "@/backend/shared/util";

const STATUS_TO_STAGE: Record<string, StageKey> = {
  needs_review: "needs_review", qualified: "qualified", consultation_booked: "consultation_booked",
  not_a_fit: "not_a_fit", complaint: "complaint", won: "won", lost: "lost", declined: "lost",
};

/** Push the lead's current state to HubSpot (contact + deal). Safe to call repeatedly. */
export async function syncLeadToHubspot(leadId: string) {
  const [lead] = await q("select l.*, coalesce(d.name, (select host_name from bookings where lead_id=l.id and status='booked' order by created_at desc limit 1)) as designer_name from leads l left join designers d on d.id=l.assigned_designer_id where l.id=$1", [leadId]);
  if (!lead) return;
  const calls = await q("select * from calls where lead_id=$1 order by started_at", [leadId]);
  const last = calls[calls.length - 1];
  const first = calls[0];
  if (!last) return;
  const ids = await hubspotIds();
  const contactId = await upsertContact(lead.phone, lead.name, lead.hubspot_contact_id, last.extraction?.email).catch(async () => upsertContact(lead.phone, lead.name, lead.hubspot_contact_id));
  const crit = last.final_criteria
    ? CRITERIA_KEYS.map((k) => `${CRITERION_LABEL[k]}: ${last.final_criteria[k].result} (${last.final_criteria[k].reason})`).join("\n")
    : "";
  const cost = calls.reduce((s: number, c: any) => s + Number(c.cost_total_inr ?? 0), 0);
  const ex = last.extraction ?? {};
  const sizeText = ex.carpet_area_sqft ? `${ex.carpet_area_sqft} sq ft` : null;
  const dm = ({ on_call: "On the call", represented: "Represented", unclear: "Not clear", no: "No" } as Record<string, string>)[ex.decision_maker] ?? null;
  const booked = lead.booking_time && lead.booking_status !== "canceled";
  const [bk] = booked ? await q("select host_name, meeting_url from bookings where lead_id=$1 and status='booked' order by created_at desc limit 1", [leadId]) : [];
  const meetingUrl = lead.meeting_url ?? bk?.meeting_url ?? null;
  const props = {
    dealname: `${lead.name ?? "Unknown caller"} · ${lead.phone ?? "no number"}`,
    pipeline: ids.pipelineId,
    dealstage: ids.stages[STATUS_TO_STAGE[lead.status] ?? "needs_review"],
    call_time: first?.started_at ? new Date(first.started_at).toISOString() : null,
    answered_within_5_min: first?.answered_within_5min ?? null,
    out_of_hours: first?.out_of_hours ?? null,
    criteria_results: crit,
    confidence: last.confidence,
    routing_decision: lead.routing,
    assigned_designer: lead.designer_name,
    transcript_link: transcriptUrl(last.id),
    call_cost_inr: Math.round(cost * 100) / 100,
    consultation_time: booked ? new Date(lead.booking_time).toISOString() : null,
    meeting_link: booked ? meetingUrl : null,
    booked_by: booked ? ({ vaani: "Vaani, during the call", customer: "The customer, via booking link", designer: "A designer" } as Record<string, string>)[lead.booked_by ?? "designer"] ?? lead.booked_by : null,
    lead_summary: ex.handoff_summary ?? null,
    lead_location: [ex.area, ex.city].filter(Boolean).join(", ") || null,
    lead_property: [ex.property_type, sizeText].filter(Boolean).join(" · ") || null,
    lead_scope: ex.scope ?? null,
    lead_timeline: ex.timeline_text ?? null,
    lead_decision_maker: dm,
  };
  const dealId = await upsertDeal(lead.hubspot_deal_id, contactId, props);
  await q("update leads set hubspot_contact_id=$2, hubspot_deal_id=$3, updated_at=now() where id=$1", [leadId, contactId, dealId]);

  // A readable note on the deal's timeline: booking and lead details in one place. Best effort (needs note scopes).
  try {
    const lines = [
      booked ? `<b>📅 Consultation booked: ${fmtDateTime(lead.booking_time)}</b>${bk?.host_name ? ` with ${bk.host_name}` : ""}` : `<b>No consultation booked yet</b>`,
      booked && meetingUrl ? `Meeting link: ${meetingUrl}` : null,
      booked ? `Booked by: ${props.booked_by}` : null,
      "",
      `<b>${lead.name ?? "Unknown caller"}</b> · ${lead.phone ?? "no number"}${ex.email ? ` · ${ex.email}` : ""}`,
      props.lead_location ? `Location: ${props.lead_location}` : null,
      props.lead_property ? `Property: ${props.lead_property}` : null,
      props.lead_scope ? `Scope: ${props.lead_scope}` : null,
      props.lead_timeline ? `Timeline: ${props.lead_timeline}` : null,
      dm ? `Decision-maker: ${dm}` : null,
      ex.referral_source ? `Heard of us via: ${ex.referral_source}` : null,
      "",
      `<b>Summary</b>`, ex.handoff_summary ?? "",
      "", `<b>Screening</b>`, crit.replace(/\n/g, "<br>"),
      "", `Transcript: ${transcriptUrl(last.id)}`,
    ].filter((x) => x !== null).join("<br>");
    const noteProps = { hs_timestamp: new Date().toISOString(), hs_note_body: lines };
    if (lead.hubspot_note_id) await hs(`/crm/v3/objects/notes/${lead.hubspot_note_id}`, { method: "PATCH", body: JSON.stringify({ properties: noteProps }) });
    else {
      const n = await hs<{ id: string }>("/crm/v3/objects/notes", { method: "POST", body: JSON.stringify({ properties: noteProps, associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }] }) });
      await q("update leads set hubspot_note_id=$2 where id=$1", [leadId, n.id]);
    }
  } catch (e: any) { console.error("[hubspot note]", String(e.message).slice(0, 200)); }
}
