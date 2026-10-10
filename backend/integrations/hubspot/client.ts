import { getConfigValue } from "@/backend/config/settings";

const BASE = "https://api.hubapi.com";

export async function hs<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HubSpot ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : ({} as T);
}

export type StageKey = "needs_review" | "qualified" | "consultation_booked" | "not_a_fit" | "complaint" | "won" | "lost";

/** Pipeline/stage ids are written to app_config('hubspot_ids') by scripts/setup-hubspot.ts */
export async function hubspotIds(): Promise<{ pipelineId: string; stages: Record<StageKey, string> }> {
  const ids = await getConfigValue("hubspot_ids");
  if (!ids) throw new Error("HubSpot not set up: run `npm run hubspot:setup`");
  return ids;
}

export async function upsertContact(phone: string | null, name: string | null, existingId?: string | null, email?: string | null): Promise<string | null> {
  if (!phone && !existingId) return null;
  const [first, ...rest] = (name ?? "").split(" ");
  const props: Record<string, string> = {};
  if (phone) props.phone = phone;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) props.email = email.toLowerCase();
  if (name) { props.firstname = first; if (rest.length) props.lastname = rest.join(" "); }
  let id = existingId ?? null;
  if (!id && phone) {
    const r = await hs<{ results: { id: string }[] }>("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }], limit: 1 }),
    });
    id = r.results[0]?.id ?? null;
  }
  if (id) { await hs(`/crm/v3/objects/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ properties: props }) }); return id; }
  const c = await hs<{ id: string }>("/crm/v3/objects/contacts", { method: "POST", body: JSON.stringify({ properties: props }) });
  return c.id;
}

export async function upsertDeal(dealId: string | null, contactId: string | null, props: Record<string, string | number | boolean | null>) {
  const properties = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));
  if (dealId) {
    await hs(`/crm/v3/objects/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ properties }) });
    return dealId;
  }
  const d = await hs<{ id: string }>("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties,
      associations: contactId ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] : [],
    }),
  });
  return d.id;
}
