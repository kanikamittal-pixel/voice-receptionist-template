import { q } from "@/backend/database/client";

export type Candidate = { id: string; created_at: string | Date; attendee: any };

/** Pure: choose which unattached Vaani booking belongs to a call. Prefers a matching attendee phone, else the closest to call end. */
export function pickBooking(cands: Candidate[], leadPhone: string | null, callEnd: Date): Candidate | null {
  if (!cands.length) return null;
  const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
  const byPhone = leadPhone ? cands.filter((c) => digits(c.attendee?.phoneNumber ?? c.attendee?.phone) === digits(leadPhone)) : [];
  const pool = byPhone.length ? byPhone : cands;
  return pool.sort((a, b) => Math.abs(+new Date(a.created_at) - +callEnd) - Math.abs(+new Date(b.created_at) - +callEnd))[0];
}

/** Attach a booking Vaani made mid-call to this lead. Returns the booking row, or null. */
export async function linkVaaniBooking(leadId: string, callStart: Date, callEnd: Date, leadPhone: string | null) {
  const cands = await q(
    `select id, created_at, attendee from bookings where created_by='vaani' and lead_id is null and status='booked'
       and created_at between $1::timestamptz - interval '10 minutes' and $2::timestamptz + interval '15 minutes'`,
    [callStart, callEnd],
  );
  const pick = pickBooking(cands as Candidate[], leadPhone, callEnd);
  if (!pick) return null;
  const [b] = await q("update bookings set lead_id=$2, updated_at=now() where id=$1 and lead_id is null returning *", [pick.id, leadId]);
  if (!b) return null;
  const [host] = b.host_email ? await q("select id from designers where lower(email)=lower($1)", [b.host_email]) : [];
  await q(
    "update leads set status='consultation_booked', booking_id=$2, booking_time=$3, booking_status='booked', meeting_url=$4, booked_by='vaani', assigned_designer_id=coalesce($5,assigned_designer_id), updated_at=now() where id=$1",
    [leadId, b.external_id, b.start_time, b.meeting_url, host?.id ?? null],
  );
  return b;
}

/** Late webhook: the call already finished and was processed before the booking event arrived. */
export async function linkBookingToFinishedCall(bookingId: string) {
  const [b] = await q("select * from bookings where id=$1", [bookingId]);
  if (!b || b.lead_id) return null;
  const [c] = await q(
    `select lead_id, from_number from calls where lead_id is not null and ended_at between $1::timestamptz - interval '15 minutes' and $1::timestamptz + interval '5 minutes' order by ended_at desc limit 1`,
    [b.created_at],
  );
  if (!c) return null;
  await q("update bookings set lead_id=$2, updated_at=now() where id=$1", [bookingId, c.lead_id]);
  await q("update leads set status='consultation_booked', booking_id=$2, booking_time=$3, booking_status='booked', meeting_url=$4, booked_by='vaani', updated_at=now() where id=$1", [c.lead_id, b.external_id, b.start_time, b.meeting_url]);
  return c.lead_id as string;
}
