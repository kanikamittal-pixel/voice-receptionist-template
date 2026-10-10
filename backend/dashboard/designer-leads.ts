import { q } from "@/backend/database/client";

export type DashboardTab = "review" | "meetings" | "accepted" | "declined" | "notfit";

/** Which leads belong to each dashboard tab. */
const TAB_FILTER: Record<DashboardTab, string> = {
  review: "l.decision='pending'",
  meetings: "l.booking_time >= now() and coalesce(l.booking_status,'') <> 'canceled'",
  accepted: "l.decision='approved'",
  declined: "l.decision='rejected'",
  notfit: "l.routing='not_a_fit'",
};

/** How many leads sit in each tab (the numbers beside the tab names). */
export async function countLeadsByTab(): Promise<Record<DashboardTab, number>> {
  const [row] = await q("select count(*) filter (where decision='pending')::int review, count(*) filter (where booking_time >= now() and coalesce(booking_status,'') <> 'canceled')::int meetings, count(*) filter (where decision='approved')::int accepted, count(*) filter (where decision='rejected')::int declined, count(*) filter (where routing='not_a_fit')::int notfit from leads");
  return row;
}

/**
 * The leads for one tab, newest first (urgent first; upcoming meetings by meeting time).
 * Each lead comes with its latest analysed call: details, criteria results, recording id.
 * `search` matches name, phone, area or email.
 */
export async function listLeads(tab: DashboardTab, search: string) {
  const params: any[] = [];
  let searchSql = "";
  if (search) {
    params.push(`%${search}%`);
    searchSql = "and (l.name ilike $1 or l.phone ilike $1 or c.extraction->>'area' ilike $1 or c.extraction->>'email' ilike $1)";
  }
  return q(
    `select l.*, coalesce(d.name, (select host_name from bookings where lead_id=l.id and status='booked' order by created_at desc limit 1)) designer_name, dd.name decided_name,
            c.id call_id, c.external_id call_ext, c.started_at, c.extraction, c.final_criteria, c.overrides, c.confidence, c.out_of_hours, c.urgent, c.urgent_reason
     from leads l
     join lateral (select * from calls where lead_id=l.id and extraction is not null order by started_at desc limit 1) c on true
     left join designers d on d.id=l.assigned_designer_id left join designers dd on dd.id=l.decided_by
     where ${TAB_FILTER[tab]} ${searchSql} order by ${tab === "meetings" ? "l.booking_time asc" : "c.urgent desc, l.last_call_at desc"} limit 100`,
    params,
  );
}

/** One call with its lead's name, for the transcript page. */
export async function getCallWithLead(callId: string) {
  const [call] = await q("select c.*, l.name from calls c left join leads l on l.id=c.lead_id where c.id=$1", [callId]);
  return call ?? null;
}
