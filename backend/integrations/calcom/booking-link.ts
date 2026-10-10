import type { Designer } from "@/backend/leads/assign-designer";

/** The designer's Cal.com booking link, prefilled so a booking made through it can be matched back to the lead. */
export function bookingLinkFor(designer: Designer | null, lead: { id: string; name?: string | null }, email?: string | null) {
  const base = designer?.booking_link || process.env.CAL_BOOKING_LINK;
  if (!base) return null;
  const u = new URL(base);
  if (lead.name) u.searchParams.set("name", lead.name);
  if (email) u.searchParams.set("email", email);
  u.searchParams.set("metadata[lead]", lead.id);
  return u.toString();
}
