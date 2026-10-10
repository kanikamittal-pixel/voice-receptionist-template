import { q } from "@/backend/database/client";
import { hs, hubspotIds, type StageKey } from "@/backend/integrations/hubspot/client";
import { loadConfig } from "@/backend/config/settings";

export type Deal = { id: string; props: Record<string, string | null> };

const PROPS = ["dealname", "dealstage", "amount", "createdate", "closedate", "call_time", "answered_within_5_min", "out_of_hours", "routing_decision", "assigned_designer", "call_cost_inr", "transcript_link", "confidence", "consultation_time"];

export async function fetchDeals(pipelineId: string): Promise<Deal[]> {
  const out: Deal[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) { // up to 2,000 deals
    const r: any = await hs("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }] }], properties: PROPS, limit: 100, ...(after ? { after } : {}), sorts: [{ propertyName: "createdate", direction: "DESCENDING" }] }),
    });
    out.push(...r.results.map((d: any) => ({ id: d.id, props: d.properties })));
    after = r.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

/** HubSpot app host for this account's data center, from the token (pat-na2-... -> app-na2.hubspot.com). */
export function hubspotAppHost(token = process.env.HUBSPOT_TOKEN ?? "") {
  const r = /^pat-([a-z]+\d)-/.exec(token)?.[1];
  return !r || r === "na1" ? "app.hubspot.com" : `app-${r}.hubspot.com`;
}

export type Metrics = {
  leads: number; pctAnswered5: number | null; outOfHours: number; byStage: Record<StageKey, number>;
  consultations: number; qualified: number; wonRevenue: number; totalCost: number; costPerQualified: number | null; revenueVsCost: number | null;
};

const num = (v: string | null | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : 0);

/** Pure: turn HubSpot deals into the dashboard numbers. `sinceMs` filters by call time (falls back to createdate). */
export function computeMetrics(deals: Deal[], stageKeyById: Record<string, StageKey>, sinceMs = 0): Metrics {
  const inRange = deals.filter((d) => new Date(d.props.call_time ?? d.props.createdate ?? 0).getTime() >= sinceMs);
  const byStage = { needs_review: 0, qualified: 0, consultation_booked: 0, not_a_fit: 0, complaint: 0, won: 0, lost: 0 } as Record<StageKey, number>;
  let answered = 0, answeredKnown = 0, ooh = 0, cost = 0, won = 0, qualified = 0;
  for (const d of inRange) {
    const st = stageKeyById[d.props.dealstage ?? ""];
    if (st) byStage[st]++;
    if (d.props.answered_within_5_min != null) { answeredKnown++; if (d.props.answered_within_5_min === "true") answered++; }
    if (d.props.out_of_hours === "true") ooh++;
    cost += num(d.props.call_cost_inr);
    if (d.props.routing_decision === "qualified") qualified++;
    if (st === "won") won += num(d.props.amount);
  }
  return {
    leads: inRange.length,
    pctAnswered5: answeredKnown ? Math.round((1000 * answered) / answeredKnown) / 10 : null,
    outOfHours: ooh, byStage,
    consultations: byStage.consultation_booked + byStage.won,
    qualified, wonRevenue: won, totalCost: Math.round(cost * 100) / 100,
    costPerQualified: qualified ? Math.round((cost / qualified) * 100) / 100 : null,
    revenueVsCost: cost > 0 ? Math.round((won / cost) * 10) / 10 : null,
  };
}

// Local preview only: NIKHIL_DEMO=1 shows sample deals so the layout can be reviewed without HubSpot.
function demoView(sinceMs: number) {
  const stages: Record<string, StageKey> = { s1: "needs_review", s2: "qualified", s3: "consultation_booked", s4: "not_a_fit", s5: "complaint", s6: "won", s7: "lost" };
  const d = (id: string, name: string, st: string, extra: Record<string, string> = {}): Deal => ({ id, props: { dealname: name, dealstage: st, call_time: new Date(Date.now() - Number(id) * 86_400_000).toISOString(), answered_within_5_min: "true", out_of_hours: "false", routing_decision: "qualified", call_cost_inr: "11.4", assigned_designer: null, ...extra } as any });
  const deals = [d("1", "Priya · +919800000001", "s3", { assigned_designer: "Aarav" }), d("2", "Aarti Mehta · +919800000005", "s6", { amount: "1450000", assigned_designer: "Isha" }), d("3", "Suresh Patil · +919800000003", "s4", { routing_decision: "not_a_fit", call_cost_inr: "7.2" }), d("4", "Girish Nair · +919800000016", "s2"), d("5", "Sheetal Deshpande", "s5", { routing_decision: "complaint" }), d("6", "Pooja · +919800000020", "s1", { out_of_hours: "true", routing_decision: "unclear" }), d("7", "Ritu Kapoor · +919800000017", "s7", { answered_within_5_min: "false" })];
  return { metrics: computeMetrics(deals, stages, sinceMs), deals, stageKeyById: stages, portalId: null, rawCalls: 9, stageLabels: { needs_review: "Needs review", qualified: "Qualified", consultation_booked: "Consultation booked", not_a_fit: "Not a fit", complaint: "Complaint", won: "Won", lost: "Lost" } as Record<StageKey, string> };
}

export async function loadPipelineView(sinceMs: number) {
  if (process.env.NIKHIL_DEMO === "1") return demoView(sinceMs);
  const ids = await hubspotIds();
  const stageKeyById = Object.fromEntries(Object.entries(ids.stages).map(([k, v]) => [v, k])) as Record<string, StageKey>;
  const deals = await fetchDeals(ids.pipelineId);
  let portalId: string | null = null;
  try { portalId = String((await hs<any>("/account-info/v3/details")).portalId); } catch {}
  const [{ n }] = await q("select count(*)::int n from calls where started_at >= to_timestamp($1/1000.0)", [sinceMs]);
  const { settings } = await loadConfig();
  return { metrics: computeMetrics(deals, stageKeyById, sinceMs), deals: deals.slice(0, 50), stageKeyById, portalId, rawCalls: n as number, stageLabels: Object.fromEntries(settings.hubspot.stages.map((s) => [s.key, s.label])) as Record<StageKey, string> };
}
