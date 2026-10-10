// Creates (or updates) the Aangan receptionist agent on Vaani (api.vaanivoice.ai).
//   npm run agent:build && npm run agent:create
// Phone-number assignment (Settings -> Telephony in the Vaani dashboard) and the webhook
// registration (Settings -> Webhooks) are dashboard steps; the API can only set the inbound number
// once a number exists: pass VAANI_INBOUND_NUMBER=+91... to assign it.
import "./env";
import fs from "node:fs";

const BASE = "https://api.vaanivoice.ai";
const key = process.env.VAANI_API_KEY;
if (!key) throw new Error("VAANI_API_KEY not set");
const NAME = "aangan-receptionist";
const GREETING = "Good day, Aangan Studio. This call is recorded to help us serve you better. Is that okay?";

async function v<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { "X-API-Key": key!, "content-type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vaani ${res.status} ${path}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : ({} as T);
}

(async () => {
  const prompt = fs.readFileSync("agent/compiled-prompt.md", "utf8");
  const persona = {
    identity: {
      system_prompt: prompt,
      greeting_message: { agent_message: GREETING, agent_speech_delay: 0, interruptible: false, let_user_speak_first: false },
    },
    senses_capabilities: JSON.parse(fs.readFileSync("agent/vaani-senses.json", "utf8").replace(/"_note":[^\n]*\n/, "")),
  };

  const listed: any = await v(`/api/agents?search=${NAME}`); // read-only; also proves the key works
  const agents: any[] = Array.isArray(listed) ? listed : listed.agents ?? listed.data ?? [];
  let id: string | undefined = process.env.VAANI_AGENT_ID || agents.find((a) => (a.agent_display_name ?? a.display_name) === NAME)?.id;

  if (id) {
    await v(`/api/agent/${id}/persona`, { method: "PATCH", body: JSON.stringify(persona) });
    console.log("updated existing agent", id);
    // Verify: Vaani can silently revert model / speech settings, so read them back.
    const cur: any = await v(`/api/agent/${id}/persona`, { method: "PATCH", body: JSON.stringify({ metadata: {} }) });
    const sc = cur.persona?.senses_capabilities ?? {};
    const llm = sc.brain?.llm?.primary, stt = sc.ears?.stt?.primary;
    console.log(`verified: llm=${llm?.provider}/${llm?.model} max_tokens=${llm?.parameters?.max_tokens} | stt keywords=${stt?.keywords?.length ?? 0} | prompt chars=${(cur.persona?.identity?.system_prompt ?? "").length}`);
    if (llm?.model !== "gpt-4o") console.error("WARNING: the agent's LLM is not gpt-4o");
  } else {
    const r = await v("/api/create-agent", { method: "POST", body: JSON.stringify({ agent_display_name: NAME, config: { persona } }) });
    id = r.agent_id;
    console.log("created agent", id);
  }

  const inbound = process.env.VAANI_INBOUND_NUMBER;
  if (inbound) {
    await v(`/api/agent/${id}/deployment`, { method: "PATCH", body: JSON.stringify({ deployment: { phone: { call_type: { Inbound: inbound } } } }) });
    console.log("inbound number set to", inbound);
  } else console.log("No VAANI_INBOUND_NUMBER: provision a number in the Vaani dashboard, then re-run with it set.");
  console.log(`\nAdd to .env.local:  VAANI_AGENT_ID=${id}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
