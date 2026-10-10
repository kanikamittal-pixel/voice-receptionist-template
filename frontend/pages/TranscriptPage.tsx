import { getCallWithLead } from "@/backend/dashboard/designer-leads";
import { safeEqual, sign } from "@/backend/shared/util";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!t || !safeEqual(sign(id), t)) return <p style={{ padding: 16 }}>Not authorised.</p>;
  const c = await getCallWithLead(id);
  if (!c) return <p style={{ padding: 16 }}>Not found.</p>;
  return (
    <main style={{ fontFamily: "system-ui", padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2>{c.name ?? "Unknown caller"} · {c.from_number}</h2>
      <p>{new Date(c.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {c.duration_sec ?? "?"}s · {c.routing}</p>
      <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.transcript}</pre>
    </main>
  );
}
