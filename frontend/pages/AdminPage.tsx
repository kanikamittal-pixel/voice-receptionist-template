"use client";
import { useEffect, useState } from "react";

const box = { width: "100%", fontFamily: "monospace", fontSize: 12 } as const;

export default function Admin() {
  const [token, setToken] = useState("");
  const [calls, setCalls] = useState<any[]>([]);
  const [cfg, setCfg] = useState<{ rules: string; settings: string }>({ rules: "", settings: "" });
  const [msg, setMsg] = useState("");
  const h = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  async function load() {
    const [c, k] = await Promise.all([fetch("/api/admin/calls", { headers: h() }), fetch("/api/admin/config", { headers: h() })]);
    if (!c.ok) return setMsg("Wrong token");
    setCalls(await c.json());
    const j = await k.json();
    setCfg({ rules: JSON.stringify(j.effective.rules, null, 2), settings: JSON.stringify(j.effective.settings, null, 2) });
    setMsg("");
  }
  useEffect(() => { try { setToken(localStorage.getItem("adm") ?? ""); } catch {} }, []);
  async function save(key: "rules" | "settings") {
    try {
      const r = await fetch("/api/admin/config", { method: "PUT", headers: h(), body: JSON.stringify({ key, value: JSON.parse(cfg[key]) }) });
      setMsg(r.ok ? `${key} saved` : "Save failed");
    } catch { setMsg("Invalid JSON"); }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h2>Aangan Receptionist · Admin</h2>
      <input type="password" placeholder="Admin token" value={token} onChange={(e) => { setToken(e.target.value); try { localStorage.setItem("adm", e.target.value); } catch {} }} />
      <button onClick={load}>Load</button> <b>{msg}</b>
      <h3>Recent calls</h3>
      <table cellPadding={4} style={{ fontSize: 13, borderCollapse: "collapse" }}>
        <thead><tr><th>Time</th><th>Caller</th><th>Type</th><th>Route</th><th>Status</th><th>Cost ₹</th><th>Overrides</th><th>Error</th></tr></thead>
        <tbody>{calls.map((c) => (
          <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
            <td>{new Date(c.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
            <td>{c.name ?? ""} {c.from_number}</td><td>{c.call_type}</td><td>{c.routing}</td><td>{c.status}</td>
            <td>{c.cost_total_inr}</td><td>{c.overrides?.length ? JSON.stringify(c.overrides) : ""}</td><td>{c.processing_error}</td>
          </tr>))}</tbody>
      </table>
      {(["rules", "settings"] as const).map((k) => (
        <section key={k}>
          <h3>{k} {k === "rules" ? "(services.md / qualified.md as config)" : ""}</h3>
          <textarea rows={18} style={box} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
          <button onClick={() => save(k)}>Save {k}</button>
        </section>
      ))}
    </main>
  );
}
