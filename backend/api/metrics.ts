import { q } from "@/backend/database/client";
import { safeEqual } from "@/backend/shared/util";

// Same numbers the HubSpot dashboard shows, from our DB, for cross-checking. Won revenue lives only in HubSpot.
export async function GET(req: Request) {
  if (!safeEqual(process.env.ADMIN_TOKEN ?? "x", (req.headers.get("authorization") ?? "").replace("Bearer ", ""))) return new Response("unauthorized", { status: 401 });
  const [m] = await q(`select count(*)::int calls,
      round(100.0*count(*) filter (where answered_within_5min)/nullif(count(*),0),1) pct_answered_5min,
      count(*) filter (where out_of_hours)::int out_of_hours,
      count(*) filter (where routing='qualified')::int qualified,
      coalesce(sum(cost_total_inr),0) total_cost_inr from calls`);
  const [b] = await q("select count(*)::int booked from bookings where status='booked'");
  const stages = await q("select status, count(*)::int n from leads group by status");
  return Response.json({ ...m, consultations_booked: b.booked, cost_per_qualified_lead_inr: m.qualified ? Number(m.total_cost_inr) / m.qualified : null, leads_by_status: stages });
}
