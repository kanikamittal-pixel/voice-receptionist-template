// Deterministic tests for hard checks + routing. No network, no DB. npm run test:unit
import { applyHardChecks } from "../backend/leads/hard-checks";
import { decideRoute } from "../backend/leads/routing";
import { DEFAULT_RULES, DEFAULT_SETTINGS } from "../backend/config/defaults";
import type { Extraction } from "../backend/integrations/gemini/extract";

const ok = { result: "pass" as const, reason: "" };
const base = (o: Partial<Extraction> = {}): Extraction => ({
  name: "A", phone: null, email: null, city: "Pune", area: "Baner", property_type: "3BHK", project_category: "residential_full",
  carpet_area_sqft: 1200, scope: "full", timeline_text: null, needed_by_date: "2027-03-31", volunteered_budget: null,
  decision_maker: "on_call", referral_source: null, call_type: "new_enquiry", is_repeat_caller: false, repeat_note: null,
  consent_to_record: "yes", criteria: { real_project: ok, location: ok, timeline: ok, budget: ok, decision_maker: ok },
  confidence: "high", handoff_summary: "x", complaint: null, urgency_signal: false, urgency_reason: null, ...o,
});
const now = new Date("2026-09-08T10:00:00Z");
let fail = 0;
const t = (name: string, cond: boolean) => { console.log(cond ? "PASS" : "FAIL", name); if (!cond) fail++; };
const run = (o: Partial<Extraction>) => { const e = base(o); const h = applyHardChecks(e, DEFAULT_RULES, now); return { ...h, d: decideRoute(e, h.criteria, DEFAULT_SETTINGS) }; };

t("clean lead qualifies", run({}).d.route === "qualified");
t("Nashik overrides AI pass and logs it", (() => { const r = run({ city: "Nashik", area: null }); return r.criteria.location.result === "fail" && r.overrides.length === 1 && r.d.route === "not_a_fit"; })());
t("Talegaon excluded", run({ city: "Pune", area: "Talegaon" }).d.route === "not_a_fit");
t("Pimple Saudagar passes by locality", run({ city: null, area: "Pimple Saudagar" }).d.route === "qualified");
t("unknown city fails", run({ city: "Satara", area: null }).d.route === "not_a_fit");
t("restaurant out of scope", run({ project_category: "restaurant" }).d.route === "not_a_fit");
t("commercial 3,500 sq ft fails", run({ project_category: "commercial_office", carpet_area_sqft: 3500 }).d.route === "not_a_fit");
t("commercial 800 sq ft ok", run({ project_category: "commercial_office", carpet_area_sqft: 800 }).d.route === "qualified");
t("commercial 180 sq ft below minimum", run({ project_category: "commercial_other", carpet_area_sqft: 180 }).d.route === "not_a_fit");
t("needed in 3 weeks fails timeline", run({ needed_by_date: "2026-09-29" }).criteria.timeline.result === "fail");
t("needed in 8 weeks ok", run({ needed_by_date: "2026-11-10" }).d.route === "qualified");
t("budget unclear still qualified, noted", (() => { const r = run({ criteria: { ...base().criteria, budget: { result: "unclear", reason: "?" } } }); return r.d.route === "qualified" && r.d.noted.includes("budget"); })());
t("timeline unclear (no deadline given) -> designer decides", run({ needed_by_date: null, criteria: { ...base().criteria, timeline: { result: "unclear", reason: "?" } } }).d.route === "unclear");
t("budget fail -> not a fit", run({ criteria: { ...base().criteria, budget: { result: "fail", reason: "1L for kitchen+bedroom" } } }).d.route === "not_a_fit");
t("complaint routes to complaint", run({ call_type: "complaint" }).d.route === "complaint");
t("dropped call is held", run({ call_type: "dropped_call" }).d.route === "dropped");
t("low confidence -> review", run({ confidence: "low" }).d.route === "unclear");

import { computeMetrics, type Deal } from "../backend/integrations/hubspot/pipeline-metrics";
const mk = (stage: string, p: Record<string, string> = {}): Deal => ({ id: Math.random().toString(), props: { dealstage: stage, call_time: "2026-09-10T10:00:00Z", answered_within_5_min: "true", out_of_hours: "false", call_cost_inr: "10", routing_decision: "qualified", amount: null, ...p } as any });
const st: any = { a: "qualified", b: "consultation_booked", c: "won", d: "not_a_fit" };
const m = computeMetrics([mk("a"), mk("b", { out_of_hours: "true" }), mk("c", { amount: "1000000" }), mk("d", { routing_decision: "not_a_fit", answered_within_5_min: "false" })], st);
t("metrics: leads and stages", m.leads === 4 && m.byStage.won === 1 && m.byStage.not_a_fit === 1);
t("metrics: % answered within 5 min", m.pctAnswered5 === 75);
t("metrics: out-of-hours", m.outOfHours === 1);
t("metrics: consultations = booked + won", m.consultations === 2);
t("metrics: won revenue", m.wonRevenue === 1000000);
t("metrics: cost, cost per qualified, revenue vs cost", m.totalCost === 40 && m.costPerQualified === 13.33 && m.revenueVsCost === 25000);
t("metrics: date range filter", computeMetrics([mk("a")], st, new Date("2026-10-01").getTime()).leads === 0);

import { pickBooking } from "../backend/integrations/calcom/link-vaani-booking";
import { isSure } from "../backend/leads/routing";
const sureEx = base(); const sureH = applyHardChecks(sureEx, DEFAULT_RULES, now);
t("isSure: qualified + high confidence", isSure(decideRoute(sureEx, sureH.criteria, DEFAULT_SETTINGS), sureH.criteria, sureEx));
const bEx = base({ criteria: { ...base().criteria, decision_maker: { result: "unclear", reason: "?" } } });
t("isSure: unclear decision-maker is still sure (noted, not blocking)", isSure(decideRoute(bEx, bEx.criteria, DEFAULT_SETTINGS), bEx.criteria, bEx));
const mEx = base({ confidence: "medium" });
t("isSure: medium confidence is NOT sure", !isSure(decideRoute(mEx, mEx.criteria, DEFAULT_SETTINGS), mEx.criteria, mEx));
const end = new Date("2026-09-10T10:05:00Z");
const c1 = { id: "a", created_at: "2026-09-10T10:01:00Z", attendee: { phoneNumber: "+91 98000 00001" } }, c2 = { id: "b", created_at: "2026-09-10T10:04:30Z", attendee: { phoneNumber: "+919800000002" } };
t("pickBooking: matches by phone", pickBooking([c1, c2], "+919800000001", end)?.id === "a");
t("pickBooking: falls back to closest to call end", pickBooking([c1, c2], null, end)?.id === "b");
t("pickBooking: none", pickBooking([], "+91", end) === null);
import { computeUrgency } from "../backend/leads/hard-checks";
t("urgency: needed in 8 weeks is urgent", computeUrgency(base({ needed_by_date: "2026-11-03" }), DEFAULT_RULES, now).urgent);
t("urgency: needed by March is not urgent", !computeUrgency(base(), DEFAULT_RULES, now).urgent);
t("urgency: caller signal makes it urgent", computeUrgency(base({ urgency_signal: true, urgency_reason: "possession next month" }), DEFAULT_RULES, now).urgent);
t("urgency: under 6 weeks is a fail, not 'urgent'", !computeUrgency(base({ needed_by_date: "2026-09-29" }), DEFAULT_RULES, now).urgent);
t("boundary: exactly 6 weeks away is OK (time of day irrelevant)", applyHardChecks(base({ needed_by_date: "2026-10-20" }), DEFAULT_RULES, new Date("2026-09-08T18:00:00Z")).criteria.timeline.result !== "fail");
t("boundary: 41 days away fails", applyHardChecks(base({ needed_by_date: "2026-10-19" }), DEFAULT_RULES, new Date("2026-09-08T09:00:00Z")).criteria.timeline.result === "fail");
t("code overrides an AI timeline fail when the deadline is 12 weeks away (and logs it)", (() => { const r = run({ needed_by_date: "2026-11-30", criteria: { ...base().criteria, timeline: { result: "fail", reason: "AI got the maths wrong" } } }); return r.criteria.timeline.result === "pass" && r.overrides.some((o: any) => o.code === "pass") && r.d.route === "qualified"; })());
import { renderLead, renderBooked, renderComplaint } from "../backend/integrations/telegram/messages";
const qd = decideRoute(base(), applyHardChecks(base(), DEFAULT_RULES, now).criteria, DEFAULT_SETTINGS);
t("telegram: lead says 'action needed' and asks the question", (() => { const m = renderLead(base(), qd, base().criteria, "https://x", "qualified"); return m.includes("NEW LEAD") && m.includes("action needed") && m.includes("Take this lead, or pass?"); })());
t("telegram: urgent lead is marked URGENT first", renderLead(base(), qd, base().criteria, "https://x", "qualified", undefined, { urgent: true, reason: "r" }).startsWith("🔥"));
t("telegram: booked message says no action needed", renderBooked(base(), "https://x", "Mon 11am", "Aarav", null).includes("no action needed"));
t("telegram: complaint tells the front desk to call back", renderComplaint(base({ call_type: "complaint", complaint: { project_details: "p", summary: "s" } }), "https://x").includes("CALL THIS CLIENT BACK"));
import { phoneLooksValid } from "../backend/shared/util";
t("phone: 10 digits ok, 9 digits flagged", phoneLooksValid("9627000074") && phoneLooksValid("+919627000074") && !phoneLooksValid("962700074"));
t("booked message shows unclear decision-maker note", renderBooked(base(), "https://x", "Mon 11am", "A", null, undefined, ["Decision-maker unclear: brother decides"]).includes("Decision-maker unclear"));
t("telegram flags an incomplete phone number", renderLead(base({ phone: "962700074" }), qd, base().criteria, "https://x", "qualified").includes("looks incomplete"));
process.exit(fail ? 1 : 0);
