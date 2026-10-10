// Inlines knowledge/*.md into agent/system-prompt.md -> agent/compiled-prompt.md (paste/sync into Vaani).
import fs from "node:fs";
const read = (f: string) => fs.readFileSync(`knowledge/${f}`, "utf8");
// The agent must never be able to quote a number, so the indicative tables are NOT given to it.
// Only the warning and the "never say / only acceptable response" section are passed through.
function pricingRules(md: string) {
  const warning = md.split("\n").filter((l) => l.startsWith(">")).join("\n");
  const idx = md.indexOf("## What the agent must never say");
  if (idx < 0) throw new Error("pricing.md: 'What the agent must never say' section not found");
  return `# Pricing rules\n\n${warning}\n\n${md.slice(idx)}`;
}
// `--booking` = the Vaani Cal.com integration is connected, so the agent books very-sure callers during the call.
// Without it the agent only promises that a designer will confirm (safe default: it cannot "pretend" to book).
const fits = fs.readFileSync(process.argv.includes("--booking") ? "agent/parts/fits-book-in-call.md" : "agent/parts/fits-designer-confirms.md", "utf8").trim();
const out = fs.readFileSync("agent/system-prompt.md", "utf8")
  .replace("{{FITS_OUTCOME}}", fits)
  .replace("{{SERVICES_MD}}", read("services.md"))
  .replace("{{QUALIFIED_MD}}", read("qualified.md"))
  .replace("{{PRICING_RULES}}", pricingRules(read("pricing.md")));
fs.writeFileSync("agent/compiled-prompt.md", out);
console.log(`agent/compiled-prompt.md written (${out.length} chars, ${process.argv.includes("--booking") ? "WITH in-call booking" : "designer confirms later"})`);
