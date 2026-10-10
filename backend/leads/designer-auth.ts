import { q } from "@/backend/database/client";
import type { Designer } from "@/backend/leads/assign-designer";

/** Designers open their dashboard through a personal link: /designer?t=<designers.dashboard_token> */
export async function designerFromToken(t?: string | null): Promise<(Designer & { dashboard_token: string }) | null> {
  if (!t || t.length < 16) return null;
  const r = await q("select * from designers where dashboard_token=$1 and active", [t]);
  return (r[0] as any) ?? null;
}
