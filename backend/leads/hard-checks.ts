import type { Rules } from "@/backend/config/defaults";
import { CRITERIA_KEYS, type CriterionKey, type Extraction } from "@/backend/integrations/gemini/extract";

export type Criteria = Extraction["criteria"];
export type Override = { criterion: CriterionKey; ai: string; code: "fail" | "pass"; reason: string };

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9 \-]/g, " ").replace(/\s+/g, " ").trim();
const hasTerm = (hay: string, term: string) => new RegExp(`(^|[^a-z])${term.replace(/[-\s]/g, "[-\\s]")}([^a-z]|$)`).test(hay);

/** Whole days from today (India date) to a YYYY-MM-DD date: time of day never tips a boundary case. */
function daysUntil(date: string, now: Date): number {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  return Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}

/** Deterministic checks. Code wins over the AI; every disagreement is returned for logging. */
export function applyHardChecks(ex: Extraction, rules: Rules, now: Date) {
  const criteria: Criteria = JSON.parse(JSON.stringify(ex.criteria));
  const overrides: Override[] = [];
  const force = (k: CriterionKey, reason: string) => {
    if (criteria[k].result !== "fail") overrides.push({ criterion: k, ai: criteria[k].result, code: "fail", reason });
    criteria[k] = { result: "fail", reason: criteria[k].result === "fail" ? criteria[k].reason : reason };
  };

  // Area: service-area list
  const place = norm([ex.city, ex.area].filter(Boolean).join(" "));
  if (place) {
    const excluded = rules.service_area.exclude.find((t) => hasTerm(place, t));
    const included = rules.service_area.include.some((t) => hasTerm(place, t)) ||
      rules.service_area.localities.some((t) => hasTerm(place, t));
    if (excluded) force("location", `Site in ${excluded}, outside the Pune/PCMC service area`);
    else if (!included && ex.city) force("location", `City "${ex.city}" is not in the service-area list`);
  }

  // Project type: out-of-scope list
  if (rules.out_of_scope_categories.includes(ex.project_category)) {
    force("real_project", `Project type "${ex.project_category}" is out of scope`);
  }

  // Commercial size band
  const isCommercial = ex.project_category.startsWith("commercial");
  if (isCommercial && ex.carpet_area_sqft != null) {
    if (ex.carpet_area_sqft > rules.commercial_max_sqft) {
      force("real_project", `Commercial space of ${ex.carpet_area_sqft} sq ft is over the ~${rules.commercial_max_sqft} sq ft limit`);
    } else if (ex.carpet_area_sqft < rules.commercial_min_sqft) {
      force("real_project", `Commercial space of ${ex.carpet_area_sqft} sq ft is below the ${rules.commercial_min_sqft} sq ft minimum scope`);
    }
  }

  // Needed-by date under N weeks from today
  if (ex.needed_by_date && /^\d{4}-\d{2}-\d{2}$/.test(ex.needed_by_date)) {
    const days = daysUntil(ex.needed_by_date, now);
    if (days < rules.min_weeks_to_deadline * 7) {
      const later = ex.criteria.timeline.reason;
      force("timeline", `Needed by ${ex.needed_by_date}, under ${rules.min_weeks_to_deadline} weeks away` +
        (/nov|later|after|start/i.test(later) ? `. Note: ${later}` : ""));
    } else if (criteria.timeline.result !== "pass") {
      // The date arithmetic is code's job: a stated deadline at least N weeks away passes, whatever the AI concluded.
      const reason = `Needed by ${ex.needed_by_date}, ${Math.round(days / 7)} weeks away (at least ${rules.min_weeks_to_deadline})`;
      overrides.push({ criterion: "timeline", ai: criteria.timeline.result, code: "pass", reason });
      criteria.timeline = { result: "pass", reason };
    }
  }

  return { criteria, overrides };
}

export function failedCriteria(c: Criteria) { return CRITERIA_KEYS.filter((k) => c[k].result === "fail"); }
export function unclearCriteria(c: Criteria) { return CRITERIA_KEYS.filter((k) => c[k].result === "unclear"); }

/** URGENT = needed-by date inside the urgent window (but not already failing the minimum lead time) or the caller signals urgency. */
export function computeUrgency(ex: Extraction, rules: Rules, now: Date): { urgent: boolean; reason: string | null } {
  if (ex.needed_by_date && /^\d{4}-\d{2}-\d{2}$/.test(ex.needed_by_date)) {
    const weeks = daysUntil(ex.needed_by_date, now) / 7;
    if (weeks >= rules.min_weeks_to_deadline && weeks <= rules.urgent_within_weeks) return { urgent: true, reason: `Needed by ${ex.needed_by_date} (~${Math.round(weeks)} weeks)` };
  }
  if (ex.urgency_signal) return { urgent: true, reason: ex.urgency_reason || "Caller asked for urgency" };
  return { urgent: false, reason: null };
}
