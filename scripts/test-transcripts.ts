// Runs T01-T20 through Gemini extraction + hard checks + routing and compares with expected outcomes,
// then dry-runs the Telegram and Cal.com steps (a test message, and a test booking that is cancelled again).
//   npm run test:transcripts                 all transcripts + dry run (if TEST_* env set)
//   npm run test:transcripts -- --only T01,T07
//   npm run test:transcripts -- --no-dry-run
import "./env";
import fs from "node:fs";
import { extractTranscript, type Extraction } from "../backend/integrations/gemini/extract";
import { applyHardChecks } from "../backend/leads/hard-checks";
import { decideRoute, type Decision } from "../backend/leads/routing";
import { DEFAULT_RULES, DEFAULT_SETTINGS } from "../backend/config/defaults";
import { renderLead } from "../backend/integrations/telegram/messages";
import { sendMessage, editMessage } from "../backend/integrations/telegram/client";
import { cancelCalBooking, createCalBooking, findCalSlots } from "../backend/integrations/calcom/client";

type Expect = { route: Decision["route"]; check?: (r: Result) => string | null; label: string };
type Result = { ex: Extraction; d: Decision; criteria: any; overrides: any[] };

const q = (r: Result) => r.d.route === "qualified";
const EXPECT: Record<string, Expect> = {
  ...Object.fromEntries(["T01", "T02", "T05", "T06", "T11", "T12", "T13", "T15", "T20"].map((t) => [t, { route: "qualified", label: "qualified" } as Expect])),
  T14: { route: "qualified", label: "qualified, uncertainty noted", check: (r) => (r.d.noted.includes("decision_maker") ? null : "decision-maker uncertainty not noted") },
  T16: { route: "qualified", label: "qualified, repeat caller", check: (r) => (r.ex.is_repeat_caller ? null : "not flagged as repeat caller") },
  T03: { route: "not_a_fit", label: "not a fit (Nashik)", check: (r) => (r.criteria.location.result === "fail" ? null : "location not failed") },
  T04: { route: "not_a_fit", label: "not a fit (advice only)", check: (r) => (r.criteria.real_project.result === "fail" ? null : "real_project not failed") },
  T07: { route: "not_a_fit", label: "not a fit (3 weeks) + Nov start noted", check: (r) => (/nov/i.test(JSON.stringify([r.criteria.timeline, r.ex.handoff_summary])) ? null : "possible November start not noted") },
  T10: { route: "not_a_fit", label: "not a fit (budget)", check: (r) => (r.criteria.budget.result === "fail" ? null : "budget not failed") },
  T18: { route: "not_a_fit", label: "not a fit (180 sq ft)" },
  T19: { route: "not_a_fit", label: "not a fit (restaurant)" },
  T09: { route: "complaint", label: "complaint, escalate" },
};

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null);
const dir = "tests/transcripts";

function callDate(txt: string) {
  const m = txt.match(/(\d{1,2}) (September)/);
  return new Date(`2026-09-${String(m?.[1] ?? "15").padStart(2, "0")}T09:00:00Z`);
}
async function evaluate(transcript: string, date: Date): Promise<Result> {
  const { extraction } = await extractTranscript(transcript, date, DEFAULT_RULES);
  const { criteria, overrides } = applyHardChecks(extraction, DEFAULT_RULES, date);
  return { ex: extraction, d: decideRoute(extraction, criteria, DEFAULT_SETTINGS), criteria, overrides };
}

(async () => {
  let failures = 0;
  const rows: string[] = [];
  const ids = Object.keys(EXPECT).sort().filter((t) => !only || only.includes(t));
  for (const id of ids) {
    const txt = fs.readFileSync(`${dir}/${id}.txt`, "utf8");
    try {
      const r = await evaluate(txt, callDate(txt));
      const exp = EXPECT[id];
      const problems = [r.d.route !== exp.route ? `route ${r.d.route} ≠ ${exp.route}` : null, r.d.route === exp.route ? exp.check?.(r) ?? null : null].filter(Boolean);
      if (r.overrides.length) problems.length || rows.push(`      (code overrode AI: ${r.overrides.map((o) => o.criterion).join(", ")})`);
      rows.splice(rows.length, 0, `${problems.length ? "FAIL" : "PASS"}  ${id}  ${exp.label.padEnd(38)} got: ${r.d.route}${problems.length ? "  ← " + problems.join("; ") : ""}`);
      if (problems.length) failures++;
    } catch (e: any) { failures++; rows.push(`FAIL  ${id}  error: ${e.message}`); }
  }
  // T17: dropped call, then callback within the merge window -> one qualified lead
  if (!only || only.includes("T17")) {
    try {
      const a = fs.readFileSync(`${dir}/T17a.txt`, "utf8"), b = fs.readFileSync(`${dir}/T17b.txt`, "utf8");
      const date = new Date("2026-09-22T08:44:00Z");
      const first = await evaluate(a, date);
      const merged = await evaluate(`--- Earlier call 1 (dropped) ---\n${a}\n--- Callback ---\n${b}`, date);
      const good = first.ex.call_type === "dropped_call" && merged.d.route === "qualified";
      rows.push(`${good ? "PASS" : "FAIL"}  T17  dropped call then merged callback        first: ${first.ex.call_type}, merged: ${merged.d.route}`);
      if (!good) failures++;
    } catch (e: any) { failures++; rows.push(`FAIL  T17  error: ${e.message}`); }
  }
  console.log("\n" + rows.join("\n") + `\n\n${failures ? failures + " FAILED" : "ALL PASSED"}`);

  if (!process.argv.includes("--no-dry-run")) failures += await dryRun();
  process.exit(failures ? 1 : 0);
})();

async function dryRun(): Promise<number> {
  console.log("\n--- Dry run: Telegram + Cal.com ---");
  let bad = 0;
  const chat = process.env.TEST_TELEGRAM_CHAT_ID;
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) console.log("SKIP  Telegram (set TEST_TELEGRAM_CHAT_ID + TELEGRAM_BOT_TOKEN)");
  else {
    try {
      const txt = fs.readFileSync(`${dir}/T01.txt`, "utf8");
      const r = await evaluate(txt, callDate(txt));
      const text = "🧪 <b>DRY RUN</b>\n" + renderLead(r.ex, r.d, r.criteria, "https://example.com/transcript", "qualified");
      const m = await sendMessage(chat, text, [{ text: "✅ Take it forward", callback_data: "dry:0" }, { text: "❌ Decline", callback_data: "dry:0" }]);
      await new Promise((res) => setTimeout(res, 1500));
      await editMessage(chat, m.message_id, text + "\n\n✅ <b>Taken by Test</b> · 📅 Dry-run booking time", undefined);
      console.log("PASS  Telegram: sent lead message with buttons, then edited it");
    } catch (e: any) { bad++; console.log("FAIL  Telegram:", e.message); }
  }
  const key = process.env.CAL_API_KEY, eventTypeId = Number(process.env.TEST_CAL_EVENT_TYPE_ID), email = process.env.TEST_ATTENDEE_EMAIL;
  if (!key || !eventTypeId || !email) console.log("SKIP  Cal.com (set CAL_API_KEY, TEST_CAL_EVENT_TYPE_ID and TEST_ATTENDEE_EMAIL)");
  else {
    try {
      const slots = await findCalSlots(key, eventTypeId, new Date(Date.now() + 6 * 3600_000), 14, 1);
      if (!slots.length) throw new Error("no available slots on the test event type in 14 days");
      const b = await createCalBooking(key, { eventTypeId, start: slots[0], name: "Dry Run Test", email, phone: null, timezone: "Asia/Kolkata" });
      await cancelCalBooking(key, b.uid, "Dry run: automated test");
      console.log(`PASS  Cal.com: found slot ${slots[0]}, booked and cancelled ${b.uid}`);
    } catch (e: any) { bad++; console.log("FAIL  Cal.com:", e.message); }
  }
  return bad;
}
