import type { Settings } from "@/backend/config/defaults";
import type { Extraction, CriterionKey } from "@/backend/integrations/gemini/extract";
import { failedCriteria, unclearCriteria, type Criteria } from "@/backend/leads/hard-checks";

export type Route = "qualified" | "unclear" | "complaint" | "not_a_fit" | "dropped";

export type Decision = {
  route: Route;
  /** criteria 1-3 unclear (the ones the agent must resolve): the designer must decide */
  blocking: CriterionKey[];
  /** criteria 4/5 unclear: lead still qualified, uncertainty noted */
  noted: CriterionKey[];
  reason: string;
};

export function decideRoute(ex: Extraction, criteria: Criteria, settings: Settings): Decision {
  if (ex.call_type === "complaint") return { route: "complaint", blocking: [], noted: [], reason: "Existing-client complaint" };
  if (ex.call_type === "dropped_call") return { route: "dropped", blocking: [], noted: [], reason: "Call dropped before the need was understood" };

  const failed = failedCriteria(criteria);
  if (failed.length) return { route: "not_a_fit", blocking: [], noted: [], reason: failed.map((k) => `${k}: ${criteria[k].reason}`).join("; ") };

  const unclear = unclearCriteria(criteria);
  const blocking = unclear.filter((k) => k === "real_project" || k === "location" || k === "timeline");
  const noted = unclear.filter((k) => k === "budget" || k === "decision_maker");
  if (blocking.length) return { route: "unclear", blocking, noted, reason: blocking.map((k) => `${k}: ${criteria[k].reason}`).join("; ") };
  if (ex.confidence === "low" && settings.low_confidence_goes_to_review) {
    return { route: "unclear", blocking: [], noted, reason: "Low extraction confidence: please review the transcript" };
  }
  return { route: "qualified", blocking: [], noted, reason: noted.length ? "Qualified; uncertainty on " + noted.join(", ") : "All criteria pass" };
}

/**
 * Safe to treat a Vaani-made booking as final with no designer review: the lead is qualified (criteria 1-3 pass,
 * nothing failed) and extraction confidence is high. Unclear budget / decision-maker is allowed: it is noted on the
 * message, per qualified.md ("do not push, treat as qualified and note the uncertainty").
 */
export function isSure(d: Decision, criteria: Criteria, ex: Extraction): boolean {
  return d.route === "qualified" && ex.confidence === "high" &&
    (["real_project", "location", "timeline"] as const).every((k) => criteria[k].result === "pass");
}
