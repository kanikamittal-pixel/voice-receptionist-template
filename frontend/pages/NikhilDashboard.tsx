import { hubspotAppHost, loadPipelineView } from "@/backend/integrations/hubspot/pipeline-metrics";
import { safeEqual } from "@/backend/shared/util";
import type { StageKey } from "@/backend/integrations/hubspot/client";
import Shell, { type NavItem } from "@/frontend/design-system/Shell";

const RANGES: Record<string, [string, number]> = { "7": ["Last 7 days", 7], "30": ["Last 30 days", 30], "90": ["Last 90 days", 90], all: ["All time", 0] };
const inr = (n: number | null) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const ORDER: StageKey[] = ["needs_review", "qualified", "consultation_booked", "won", "lost", "not_a_fit", "complaint"];

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; range?: string }> }) {
  const { t, range = "30" } = await searchParams;
  if (!t || !process.env.NIKHIL_TOKEN || !safeEqual(process.env.NIKHIL_TOKEN, t)) return <main style={{ padding: 32, fontFamily: "system-ui" }}><p>Not authorised.</p></main>;
  const key = RANGES[range] ? range : "30";
  const [label, days] = RANGES[key];
  const nav: NavItem[] = Object.entries(RANGES).map(([k, [l]]) => ({ href: `/nikhil?t=${t}&range=${k}`, label: l, icon: "calendar", active: k === key }));

  let view;
  try { view = await loadPipelineView(days ? Date.now() - days * 86_400_000 : 0); }
  catch (e: any) {
    return <Shell section="Time range" nav={nav} userName="Nikhil" title="Phone enquiries pipeline" subtitle="Live from HubSpot"><div className="ds-panel"><h2>HubSpot isn't connected yet</h2><p className="ds-note">{e.message}</p></div></Shell>;
  }
  const { metrics: m, deals, portalId, rawCalls, stageLabels, stageKeyById } = view;
  const host = hubspotAppHost();
  const extra: NavItem[] = portalId ? [{ href: `https://${host}/contacts/${portalId}/objects/0-3/views/all/board`, label: "Open deals in HubSpot", icon: "link", external: true }] : [];
  const max = Math.max(1, ...Object.values(m.byStage));
  const tile = (title: string, value: string, sub?: string, dark?: boolean) => <div className={`ds-tile ${dark ? "dark" : ""}`} key={title}><span>{title}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;

  return (
    <Shell section="Time range" nav={nav} extra={extra} userName="Nikhil" title="Phone enquiries pipeline" subtitle={`Live from HubSpot · ${label}`}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <section className="ds-tiles">
          {tile("Calls received", String(rawCalls), `${m.leads} leads in HubSpot`)}
          {tile("Answered within 5 min", m.pctAnswered5 == null ? "—" : m.pctAnswered5 + "%")}
          {tile("Out-of-hours calls", String(m.outOfHours))}
          {tile("Consultations booked", String(m.consultations), undefined, true)}
          {tile("Won revenue", inr(m.wonRevenue))}
          {tile("Total cost", inr(m.totalCost))}
          {tile("Cost per qualified lead", inr(m.costPerQualified), `${m.qualified} qualified`)}
          {tile("Revenue vs cost", m.revenueVsCost == null ? "—" : m.revenueVsCost + "×")}
        </section>

        <section className="ds-panel">
          <h2>Leads by stage</h2>
          <div className="ds-bars">{ORDER.map((k) => <div key={k} className="ds-bar"><span>{stageLabels[k]}</span><i style={{ width: `${Math.max(1, (m.byStage[k] / max) * 100)}%`, opacity: m.byStage[k] ? 1 : 0.15 }} /><em>{m.byStage[k]}</em></div>)}</div>
        </section>

        <section className="ds-panel">
          <h2>Latest deals</h2>
          <table className="ds-table">
            <thead><tr><th>Deal</th><th>Stage</th><th>Designer</th><th>Consultation</th><th>Cost</th><th>Amount</th></tr></thead>
            <tbody>{deals.length === 0 && <tr><td colSpan={6} style={{ color: "#94a3b8", textAlign: "center", padding: 28 }}>No deals yet. They appear after the first call.</td></tr>}
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>{portalId ? <a href={`https://${host}/contacts/${portalId}/record/0-3/${d.id}`} target="_blank" style={{ fontWeight: 700 }}>{d.props.dealname}</a> : d.props.dealname}</td>
                  <td>{stageLabels[stageKeyById[d.props.dealstage ?? ""]] ?? "—"}</td>
                  <td>{d.props.assigned_designer ?? "—"}</td>
                  <td>{d.props.consultation_time ? new Date(d.props.consultation_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</td>
                  <td>{d.props.call_cost_inr ? "₹" + d.props.call_cost_inr : "—"}</td>
                  <td>{d.props.amount ? inr(Number(d.props.amount)) : "—"}</td>
                </tr>))}</tbody>
          </table>
          <p className="ds-note" style={{ margin: "16px 0 0" }}>Move a deal to <b>Won</b> and set its <b>Amount</b> in HubSpot, and revenue updates here automatically.</p>
        </section>
      </div>
    </Shell>
  );
}
