"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** The designer's private note on a lead, and a "contacted" flag. */
export default function LeadNotes({ leadId, token, note, contacted, readOnly }: { leadId: string; token: string; note: string; contacted: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(note);
  const [saved, setSaved] = useState("");
  const [isContacted, setIsContacted] = useState(contacted);
  const call = (body: Record<string, unknown>) => fetch("/api/designer/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, leadId, ...body }) });

  async function save() {
    setSaved("Saving…");
    const r = await call({ action: "note", note: text }).catch(() => null);
    setSaved(r?.ok ? "Saved" : "Could not save");
    router.refresh();
  }
  async function toggle() {
    const next = !isContacted; setIsContacted(next);
    await call({ action: "contacted", value: next }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="ds-notes">
      <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved(""); }} onBlur={() => !readOnly && text !== note && save()} placeholder={readOnly ? "No notes" : "Your private notes: what the customer said, what to do next…"} rows={4} disabled={readOnly} />
      {!readOnly && (
        <div className="ds-notes-row">
          <button className={`ds-chipbtn ${isContacted ? "on" : ""}`} onClick={toggle}>{isContacted ? "✓ Contacted" : "Mark as contacted"}</button>
          <button className="ds-chipbtn" onClick={save}>Save note</button>
          <span className="ds-saved">{saved}</span>
        </div>
      )}
    </div>
  );
}
