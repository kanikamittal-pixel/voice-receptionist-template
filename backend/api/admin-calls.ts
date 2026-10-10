import { q } from "@/backend/database/client";
import { safeEqual } from "@/backend/shared/util";

export async function GET(req: Request) {
  if (!safeEqual(process.env.ADMIN_TOKEN ?? "x", (req.headers.get("authorization") ?? "").replace("Bearer ", ""))) return new Response("unauthorized", { status: 401 });
  const rows = await q(
    `select c.id, c.started_at, c.from_number, c.call_type, c.routing, c.confidence, c.out_of_hours, c.cost_total_inr, c.overrides, c.processing_error,
            l.name, l.status, l.booking_time
     from calls c left join leads l on l.id=c.lead_id order by c.started_at desc limit 100`);
  return Response.json(rows);
}
