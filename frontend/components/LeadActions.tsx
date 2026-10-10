"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Take / Pass buttons, styled for the dark action card. Taking does not book anything: the designer asks the customer's preferred time. */
export default function LeadActions({ leadId, token }: { leadId: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [passing, setPassing] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/designer/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, leadId, action, reason }) });
      const j = await r.json();
      if (j.error === "already_decided") setMsg("Someone else already decided this lead.");
      else if (j.error) setMsg(j.error);
      router.refresh();
    } catch { setMsg("Network error, please try again."); }
    setBusy(false);
  }

  return (
    <div className="ds-actions">
      {passing ? (
        <>
          <input autoFocus placeholder="Why are you passing? (one line)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="ds-btn ds-btn-light" disabled={busy || !reason.trim()} onClick={() => act("reject")}>Pass on this lead</button>
          <button className="ds-btn ds-btn-ghost" onClick={() => setPassing(false)}>Back</button>
        </>
      ) : (
        <>
          <button className="ds-btn ds-btn-light" disabled={busy} onClick={() => act("approve")}>{busy ? "Saving…" : "Take this lead"}</button>
          <button className="ds-btn ds-btn-ghost" disabled={busy} onClick={() => setPassing(true)}>Pass</button>
        </>
      )}
      {msg && <p className="ds-err">{msg}</p>}
    </div>
  );
}
