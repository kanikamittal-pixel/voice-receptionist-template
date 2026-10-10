import { countLeadsByTab, listLeads, type DashboardTab } from "@/backend/dashboard/designer-leads";
import { designerFromToken } from "@/backend/leads/designer-auth";
import { fmtDateTime, phoneLooksValid, recordingUrl, sign } from "@/backend/shared/util";
import { bookingLinkFor } from "@/backend/integrations/calcom/booking-link";
import LeadActions from "@/frontend/components/LeadActions";
import LeadNotes from "@/frontend/components/LeadNotes";
import Shell, { type NavItem } from "@/frontend/design-system/Shell";
import Icon from "@/frontend/design-system/Icon";

const TABS = [["review", "To review", "inbox"], ["meetings", "Upcoming meetings", "calendar"], ["accepted", "Taken", "check"], ["declined", "Passed", "xcircle"], ["notfit", "Not a fit", "ban"]] as const;
const CRIT: [string, string][] = [["real_project", "Real project"], ["location", "In our area"], ["timeline", "Timeline"], ["budget", "Budget"], ["decision_maker", "Decision-maker"]];
const MARK: Record<string, string> = { pass: "✓", fail: "✕", unclear: "?" };

function ago(d: string | Date) {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string; lead?: string; q?: string }> }) {
  const { t, tab: tabParam, lead: leadParam, q: qParam } = await searchParams;
  const designer: any = await designerFromToken(t);
  if (!designer) return <main style={{ padding: 32, fontFamily: "system-ui" }}><p>This link isn't valid. Ask the studio for your dashboard link.</p></main>;
  const readOnly = !!designer.read_only;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "review";
  const search = (qParam ?? "").trim().slice(0, 60);

  const counts = await countLeadsByTab();
  const leads = await listLeads(tab as DashboardTab, search);
  const sel: any = leads.find((l: any) => l.id === leadParam) ?? (leadParam ? null : leads[0]);
  const keep = search ? `&q=${encodeURIComponent(search)}` : "";
  const base = `/designer?t=${t}&tab=${tab}${keep}`;

  const nav: NavItem[] = TABS.map(([k, label, icon]) => ({ href: `/designer?t=${t}&tab=${k}`, label, icon, count: counts[k], active: k === tab }));
  const extra: NavItem[] = [
    { href: "/talk", label: "Try the voice agent", icon: "phone", external: true },
    ...(designer.booking_link ? [{ href: designer.booking_link, label: "My booking page", icon: "link", external: true }, { href: "https://app.cal.com/bookings/upcoming", label: "My Cal.com bookings", icon: "calendar", external: true }] : []),
  ];

  const chips = (l: any) => {
    const out: [string, string][] = [];
    if (l.urgent) out.push(["🔥 Urgent", "red"]);
    if (l.booking_time && l.booking_status !== "canceled") out.push([`Booked ${fmtDateTime(l.booking_time)}`, "green"]);
    else if (l.routing === "unclear") out.push(["Not sure", "amber"]);
    else if (l.decision === "approved") out.push(["Taken", "green"]);
    else if (l.decision === "rejected") out.push(["Passed", ""]);
    else if (l.routing === "not_a_fit") out.push(["Not a fit", ""]);
    else out.push(["New lead", "green"]);
    if (l.contacted_at) out.push(["✓ Contacted", ""]);
    if (l.phone && !phoneLooksValid(l.phone)) out.push(["Check phone", "red"]);
    return out;
  };

  return (
    <Shell section="Leads" nav={nav} extra={extra} userName={designer.name} title="Leads" subtitle={readOnly ? "View-only access" : "Enquiries handled by the voice assistant"}
      bellHref={`/designer?t=${t}&tab=review`} bellCount={counts.review} search={{ action: "/designer", hidden: { t: t!, tab }, value: search, placeholder: "Search name, phone, area…" }}>
      <div className={`ds-grid ${leadParam ? "has-param" : ""}`}>
        <aside className="ds-list">
          {leads.length === 0 && (
            <div className="ds-empty">{search ? `No leads match “${search}”.` : "Nothing here yet."}
              {!search && tab === "review" && <><br /><br /><a href="/talk" style={{ color: "#4c0519", fontWeight: 700, textDecoration: "underline" }}>Try the voice agent</a> to create your first lead.</>}
            </div>
          )}
          {leads.map((l: any) => {
            const ex = l.extraction ?? {};
            return (
              <a key={l.id} href={`${base}&lead=${l.id}`} className={`ds-lead ${sel?.id === l.id ? "on" : ""}`}>
                <div className="ds-lead-top"><b>{l.name ?? "Unknown caller"}</b><span>{tab === "meetings" && l.booking_time ? fmtDateTime(l.booking_time) : ago(l.last_call_at)}</span></div>
                <div className="ds-lead-sub">{[ex.area ?? ex.city, ex.property_type].filter(Boolean).join(" · ") || "Details in the lead"}</div>
                <div className="ds-chips">{chips(l).map(([text, c]) => <i key={text} className={`ds-chip ${c}`}>{text}</i>)}</div>
              </a>
            );
          })}
        </aside>

        {!sel ? <section className="ds-detail"><p className="ds-empty">Select a lead.</p></section> : (() => {
          const l = sel, ex = l.extraction ?? {}, crit = l.final_criteria ?? {};
          const link = bookingLinkFor(designer, l, ex.email);
          const phoneOk = !l.phone || phoneLooksValid(l.phone);
          const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
          const email: string | null = ex.email ?? null;
          const wa = (text: string) => (phoneOk && phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}` : null);
          const mail = (subject: string, body: string) => (email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null);
          const booked = l.booking_time && l.booking_status !== "canceled";
          const rec = l.call_ext ? recordingUrl(l.call_id) : null;
          const rows: [string, string][] = [
            ["Phone", l.phone ? (phoneOk ? l.phone : `${l.phone} (incomplete)`) : "Not given"],
            ["Email", email ?? "Not given"],
            ["Location", [ex.area, ex.city].filter(Boolean).join(", ") || "—"],
            ["Property", [ex.property_type, ex.carpet_area_sqft && `${ex.carpet_area_sqft} sq ft`].filter(Boolean).join(" · ") || "—"],
            ["Scope", ex.scope ?? "—"],
            ["Timeline", ex.timeline_text ?? "—"],
            ["Budget said", ex.volunteered_budget ?? "Not mentioned"],
            ["Decision-maker", ({ on_call: "On the call", represented: "Represented", unclear: "Not clear", no: "No" } as any)[ex.decision_maker] ?? "—"],
            ["Heard of us via", ex.referral_source ?? "—"],
          ];
          const confirmText = `Hi ${l.name ?? ""}, your consultation with Aangan Studio is booked for ${booked ? fmtDateTime(l.booking_time) : ""}.${l.meeting_url ? " Join here: " + l.meeting_url : ""}`;
          const linkText = `Hi ${l.name ?? ""}, thanks for your enquiry with Aangan Studio. Please choose a time for your free consultation here: ${link}`;
          const state = l.decision === "pending" ? "pending" : l.decision === "approved" ? "taken" : l.decision === "rejected" ? "passed" : "screened";
          const row = (href: string | null, icon: string, text: string, external = true) => href ? <a className="ds-opt" href={href} {...(external ? { target: "_blank" } : {})}><span><Icon name={icon} size={20} />{text}</span><Icon name="chevron" size={18} /></a> : null;

          return (
            <>
              <section className="ds-detail">
                <a className="ds-back" href={base}><Icon name="back" size={18} /> All leads</a>
                {readOnly && <p className="ds-warn">View-only access: you can look at everything but not change anything.</p>}
                {l.phone && !phoneOk && (
                  <p className="ds-warn red">⚠️ <b>The phone number looks incomplete</b> ({l.phone}). {email ? <>Please use the customer's email instead: <b>{email}</b>. You can still send them the booking link by email below.</> : "No email was captured either, so check the call recording for the number."}</p>
                )}
                {l.urgent && <p className="ds-warn red">🔥 Urgent: {l.urgent_reason}</p>}
                {ex.is_repeat_caller && <p className="ds-warn">Repeat caller: {ex.repeat_note ?? "called before"}</p>}
                {booked && l.decision === "pending" && <p className="ds-warn red">Vaani already booked {fmtDateTime(l.booking_time)}. Taking the lead keeps it; passing cancels it.</p>}

                <div className="ds-receipt">
                  <div className="ds-receipt-top">
                    <div>
                      <p className="ds-kicker">Enquiry</p>
                      <h2>{l.name ?? "Unknown caller"}</h2>
                      <div className="ds-chips" style={{ marginTop: 10 }}>{chips(l).map(([text, c]) => <i key={text} className={`ds-chip ${c}`}>{text}</i>)}</div>
                    </div>
                    <div className="ds-receipt-id"><p className="ds-kicker">Call</p>{fmtDateTime(l.started_at)}{l.out_of_hours ? <><br />after hours</> : null}</div>
                  </div>

                  <p className="ds-kicker" style={{ marginBottom: 10 }}>Summary</p>
                  <p className="ds-summary">{ex.handoff_summary}</p>

                  <hr className="ds-dashed" />
                  <p className="ds-kicker" style={{ marginBottom: 14 }}>Contact and project</p>
                  <dl className="ds-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === "Phone" && !phoneOk ? "ds-bad" : ""}>{v}</dd></div>)}</dl>

                  <hr className="ds-dashed" />
                  <p className="ds-kicker" style={{ marginBottom: 14 }}>Why it was screened this way</p>
                  <ul className="ds-crit">{CRIT.map(([k, label]) => crit[k] && (
                    <li key={k} className={crit[k].result}><span>{MARK[crit[k].result]}</span><div><b>{label}</b><small>{crit[k].reason || (crit[k].result === "pass" ? "OK" : "")}</small></div></li>
                  ))}</ul>
                  {l.overrides?.length > 0 && <p className="ds-note" style={{ marginTop: 14 }}>The rules check changed the AI's answer: {l.overrides.map((o: any) => o.reason).join("; ")}</p>}

                  {rec && (<>
                    <hr className="ds-dashed" />
                    <p className="ds-kicker" style={{ marginBottom: 10 }}>Call recording</p>
                    <audio controls preload="none" src={rec} style={{ width: "100%" }} />
                    <p className="ds-note" style={{ margin: "8px 0 0" }}>Won't play in your browser? <a href={`${rec}&download=1`} style={{ textDecoration: "underline" }}>Download it</a>.</p>
                  </>)}

                  <p className="ds-foot">Confidence: {l.confidence}. <a href={`/transcripts/${l.call_id}?t=${sign(l.call_id)}`} target="_blank" style={{ textDecoration: "underline" }}>Read the full call transcript</a></p>
                </div>
              </section>

              <aside className="ds-side">
                <div className="ds-action">
                  <div className="ds-action-head">
                    <div className="ds-action-icon"><Icon name={state === "pending" ? "inbox" : state === "taken" ? "check" : state === "passed" ? "xcircle" : "ban"} size={28} /></div>
                    <div>
                      <h3>{state === "pending" ? "Needs your decision" : state === "taken" ? (booked ? "Meeting booked" : "You took this lead") : state === "passed" ? "Passed" : "Not a fit"}</h3>
                      <p>{state === "pending" ? (readOnly ? "Waiting for a designer." : "Take it or pass.") : state === "taken" ? (l.booked_by === "vaani" ? "Booked by Vaani during the call." : l.booked_by === "customer" ? "Booked by the customer." : `Taken by ${l.decided_name ?? "Vaani"}.`) : state === "passed" ? `By ${l.decided_name}${l.decision_note ? `: “${l.decision_note}”` : ""}` : "Screened out automatically. Not sent to designers."}</p>
                    </div>
                  </div>
                  {state === "pending" && !readOnly && <LeadActions leadId={l.id} token={t!} />}
                  {state === "taken" && booked && <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{fmtDateTime(l.booking_time)}<span style={{ display: "block", fontWeight: 500, fontSize: 13, color: "rgba(254,205,211,.85)" }}>with {l.designer_name ?? "the team"}</span></p>}
                </div>

                <div className="ds-optcard">
                  <h4>{state === "taken" && !booked ? "Next step" : "Reach the customer"}</h4>
                  {state === "taken" && !booked && <p className="ds-note">Ask {l.name ?? "the customer"} when they would like to meet, or send your booking link so they choose a time.</p>}
                  {l.phone && phoneOk && row(`tel:${l.phone}`, "phone", `Call ${l.phone}`, false)}
                  {l.phone && !phoneOk && <div className="ds-opt ds-opt-bad"><span><Icon name="phone" size={20} />Number incomplete: {l.phone}</span></div>}
                  {row(mail("Your free design consultation with Aangan Studio", `Hi ${l.name ?? ""},\n\nThanks for your enquiry with Aangan Studio.`), "mail", `Email ${email ?? ""}`, false)}
                  {row(wa(`Hi ${l.name ?? ""}, this is Aangan Studio about your design enquiry.`), "message", "WhatsApp")}
                  {state === "taken" && !booked && link && <>
                    {row(wa(linkText), "calendar", "Send booking link on WhatsApp")}
                    {row(mail("Choose a time for your free consultation", linkText), "mail", "Send booking link by email", false)}
                  </>}
                  {state === "taken" && !booked && !link && <p className="ds-note">No booking link is set up for you yet.</p>}
                  {booked && l.meeting_url && row(l.meeting_url, "video", "Open meeting link")}
                  {booked && row(wa(confirmText), "message", "Send booking on WhatsApp")}
                  {booked && row(mail("Your consultation with Aangan Studio", confirmText), "mail", "Send booking by email", false)}
                  {row(`/transcripts/${l.call_id}?t=${sign(l.call_id)}`, "file", "Full call transcript")}
                  {rec && row(rec, "headphones", "Listen to the call recording")}
                </div>

                <div className="ds-optcard">
                  <h4>Your notes</h4>
                  <LeadNotes key={l.id} leadId={l.id} token={t!} note={l.designer_note ?? ""} contacted={!!l.contacted_at} readOnly={readOnly} />
                </div>
              </aside>
            </>
          );
        })()}
      </div>
    </Shell>
  );
}
