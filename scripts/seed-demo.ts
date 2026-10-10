// Local demo data for reviewing the dashboards. `npm run demo:seed` / `npm run demo:clear`. Rows are tagged external_id 'demo-%'.
import "./env";
import crypto from "node:crypto";
import { q } from "../backend/database/client";

const ex = (o: any) => ({ email: null, city: "Pune", is_repeat_caller: false, repeat_note: null, ...o });
const ok = (r = "") => ({ result: "pass", reason: r }), un = (r: string) => ({ result: "unclear", reason: r }), no = (r: string) => ({ result: "fail", reason: r });
const DEMO = [
  { name: "Priya", phone: "+919800000001", route: "qualified", decision: "pending", ex: ex({ area: "Kothrud (Dahanukar Colony)", property_type: "3BHK apartment", carpet_area_sqft: 1400, scope: "Full home: kitchen, living room, 2 bedrooms", timeline_text: "Done by March, no rush", volunteered_budget: null, decision_maker: "represented", referral_source: "Friend, Shruti Joshi", handoff_summary: "Priya wants a full redesign of her 3BHK in Kothrud, referred by Shruti Joshi. Wants it done by March; husband knows and is happy to go ahead. Book a consultation." }), crit: { real_project: ok("Full redesign with execution"), location: ok("Kothrud, Pune"), timeline: ok("March, ~5 months"), budget: un("No budget mentioned"), decision_maker: ok("Husband agrees") }, conf: "high" },
  { name: "Aman (for his parents)", phone: "+919800000014", route: "unclear", decision: "pending", ex: ex({ area: "Hadapsar", property_type: "3BHK, new possession", carpet_area_sqft: null, scope: "Full interiors", timeline_text: "Not stated", decision_maker: "unclear", referral_source: null, handoff_summary: "Son enquiring for his parents' new 3BHK in Hadapsar. Parents will decide and attend the consultation; he is checking if it is worth pursuing. Confirm the parents can attend, then book." }), crit: { real_project: ok("Wants a proper design"), location: ok("Hadapsar, Pune"), timeline: ok("No urgency stated"), budget: ok(), decision_maker: un("Caller is checking for his parents, who decide") }, conf: "medium" },
  { name: "Aarti Mehta", phone: "+919800000005", route: "qualified", decision: "approved", booked: true, ex: ex({ area: "Koregaon Park", property_type: "4BHK, 2,400 sq ft", carpet_area_sqft: 2400, scope: "Complete redesign", timeline_text: "Back in by February", decision_maker: "on_call", referral_source: "Vikram Agarwal", handoff_summary: "Aarti is redoing a 4BHK in Koregaon Park, referred by Vikram Agarwal. Wants to move back by February. Prefers a site visit for the consultation." }), crit: { real_project: ok(), location: ok(), timeline: ok(), budget: ok(), decision_maker: ok() }, conf: "high" },
  { name: "Ritu Kapoor", phone: "+919800000017", route: "qualified", decision: "rejected", note: "Calendar full until December, referring to another studio", ex: ex({ area: "Pimple Saudagar", property_type: "3BHK, 1,050 sq ft", carpet_area_sqft: 1050, scope: "Kitchen, wardrobes, living room", timeline_text: "By March", decision_maker: "on_call", handoff_summary: "Ritu from Pimple Saudagar wants kitchen, wardrobes and living room done in her 3BHK. Call dropped once and she called back. Timeline is March." }), crit: { real_project: ok(), location: ok(), timeline: ok(), budget: ok(), decision_maker: ok() }, conf: "high" },
  { name: "Suresh Patil", phone: "+919800000003", route: "not_a_fit", decision: "none", ex: ex({ city: "Nashik", area: null, property_type: "Home office", scope: "Home office and study", handoff_summary: "Suresh is in Nashik and wants a home office redone. Outside the service area. Politely declined." }), crit: { real_project: ok(), location: no("Nashik is outside Pune/PCMC"), timeline: ok(), budget: ok(), decision_maker: ok() }, conf: "high", ov: [{ criterion: "location", ai: "pass", code: "fail", reason: "Site in nashik, outside the Pune/PCMC service area" }] },
];

(async () => {
  if (process.argv.includes("--clear")) {
    await q("delete from telegram_actions where lead_id in (select lead_id from calls where external_id like 'demo-%')");
    await q("delete from bookings where lead_id in (select lead_id from calls where external_id like 'demo-%')");
    const ids = (await q("select distinct lead_id from calls where external_id like 'demo-%'")).map((r) => r.lead_id);
    await q("delete from calls where external_id like 'demo-%'");
    if (ids.length) await q("delete from leads where id = any($1::uuid[])", [ids]);
    await q("delete from designers where name='Demo Designer'");
    return console.log("demo data removed");
  }
  const token = crypto.randomBytes(18).toString("base64url");
  const [d] = await q("insert into designers(name, dashboard_token) values('Demo Designer',$1) returning id", [token]);
  let i = 0;
  for (const x of DEMO) {
    const when = new Date(Date.now() - (i + 1) * 3_600_000 * 5);
    const [l] = await q("insert into leads(name, phone, status, routing, decision, decided_by, decided_at, decision_note, assigned_designer_id, booking_time, meeting_url, first_call_at, last_call_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) returning id",
      [x.name, x.phone, x.booked ? "consultation_booked" : x.route === "not_a_fit" ? "not_a_fit" : "qualified", x.route, x.decision, x.decision === "approved" || x.decision === "rejected" ? d.id : null, x.decision === "approved" || x.decision === "rejected" ? when : null, (x as any).note ?? null, x.booked ? d.id : null, x.booked ? new Date(Date.now() + 2 * 86_400_000) : null, x.booked ? "https://meet.example.com/demo" : null, when]);
    await q("insert into calls(lead_id, external_id, from_number, started_at, ended_at, duration_sec, transcript, extraction, final_criteria, ai_criteria, overrides, call_type, confidence, routing, out_of_hours, answered_within_5min, cost_total_inr) values($1,$2,$3,$4,$4,240,$5,$6,$7,$7,$8,'new_enquiry',$9,$10,$11,true,11.4)",
      [l.id, `demo-${i}`, x.phone, when, "Front Desk: Good morning, Aangan Studio.\nCaller: (demo transcript)", { ...x.ex, name: x.name, phone: x.phone }, x.crit, JSON.stringify((x as any).ov ?? []), x.conf, x.route, i === 1]);
    i++;
  }
  console.log(`demo seeded. Open: ${process.env.APP_URL ?? "http://localhost:3000"}/designer?t=${token}`);
})().catch((e) => { console.error(e); process.exit(1); });
