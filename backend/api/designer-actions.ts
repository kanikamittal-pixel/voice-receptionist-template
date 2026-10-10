import { approveLead, rejectLead } from "@/backend/leads/actions";
import { designerFromToken } from "@/backend/leads/designer-auth";
import { q } from "@/backend/database/client";

// POST { t, leadId, action: "approve" | "reject" | "note" | "contacted", reason?, note?, value? }
export async function POST(req: Request) {
  const { t, leadId, action, reason, note, value } = await req.json().catch(() => ({}));
  const designer: any = await designerFromToken(t);
  if (!designer) return Response.json({ error: "Invalid link" }, { status: 401 });
  if (designer.read_only) return Response.json({ error: "This link is view-only." }, { status: 403 });
  if (!leadId || !["approve", "reject", "note", "contacted"].includes(action)) return Response.json({ error: "Bad request" }, { status: 400 });

  if (action === "note") { await q("update leads set designer_note=$2, updated_at=now() where id=$1", [leadId, String(note ?? "").slice(0, 2000)]); return Response.json({ ok: true }); }
  if (action === "contacted") { await q("update leads set contacted_at=case when $2::boolean then now() else null end, updated_at=now() where id=$1", [leadId, !!value]); return Response.json({ ok: true }); }

  if (action === "approve") {
    const r = await approveLead(leadId, designer, "dashboard");
    return Response.json(r, { status: r.ok || r.error === "already_decided" ? 200 : 404 });
  }
  const why = String(reason ?? "").trim().slice(0, 300);
  if (!why) return Response.json({ ok: false, error: "A reason is required" }, { status: 400 });
  return Response.json(await rejectLead(leadId, designer, why, "dashboard"));
}
