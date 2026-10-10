// Sends one sample of each Telegram message to TELEGRAM_DESIGNERS_CHAT_ID. Buttons are inert ("dry:0"). No DB, HubSpot or calendar writes.
import "./env";
import { compactLine, renderBooked, renderComplaint, renderLead } from "../backend/integrations/telegram/messages";
import { sendMessage } from "../backend/integrations/telegram/client";

const ok = { result: "pass", reason: "" } as const;
const base: any = { name: "Priya", phone: "+919800000001", area: "Kothrud", city: "Pune", property_type: "3BHK", carpet_area_sqft: 1400, scope: "Full home: kitchen, living room, 2 bedrooms", timeline_text: "Done by March, no rush", is_repeat_caller: false, handoff_summary: "Priya (via Shruti Joshi) wants a full redesign of her 3BHK in Kothrud. She wants it done by March; her husband knows and is happy to proceed. Next step: take the lead and offer a consultation.", complaint: null };
const crit: any = { real_project: ok, location: ok, timeline: ok, budget: ok, decision_maker: ok };
const link = `${process.env.APP_URL}/`;
const q = { route: "qualified" as const, blocking: [], noted: [], reason: "" };
const rec = `${process.env.APP_URL}/`;
const take = [{ text: "✅ Take it forward", callback_data: "dry:0" }, { text: "❌ Pass", callback_data: "dry:0" }];
const tag = "🧪 <i>SAMPLE</i>\n";

(async () => {
  const chat = process.env.TELEGRAM_DESIGNERS_CHAT_ID!;
  const send = async (text: string, buttons?: any) => { await sendMessage(chat, text, buttons); await new Promise((r) => setTimeout(r, 700)); };

  await send("🧪 <b>How to read these messages</b>\n🟢 <b>NEW LEAD</b> = needs your decision (buttons)\n🔥 <b>URGENT</b> = look at this first\n📅 <b>BOOKED</b> = already fixed, nothing to do\n🔴 <b>CALL BACK</b> = front desk action\n✅ A decided lead shrinks to <b>one line</b>.\nLeads we're not sure about, and not-a-fit leads, are <b>not</b> sent here: they stay on the dashboard.");
  await send(tag + renderLead({ ...base, email: "priya.k@example.com" }, q, crit, link, "qualified", undefined, undefined, rec), take);
  await send(tag + renderLead({ ...base, name: "Rohan", phone: "+919800000022", area: "Baner", property_type: "2BHK", carpet_area_sqft: 950, scope: "Full redesign", timeline_text: "Possession next month, wants to start now", handoff_summary: "Rohan has just taken possession of a 2BHK in Baner and wants a full redesign. He wants to start within weeks. Next step: take the lead and offer the earliest consultation." }, q, crit, link, "qualified", undefined, { urgent: true, reason: "Possession next month, wants to start now" }), take);
  // incomplete phone number: the email is the fallback
  await send(tag + renderLead({ ...base, name: "Asha", phone: "962700074", email: "asha.m@example.com", area: "Kothrud", property_type: "3BHK", carpet_area_sqft: null, handoff_summary: "Asha wants to redo her 3BHK in Kothrud, finished by February 2027. Her brother makes the final decision. Next step: take the lead and offer a consultation." }, { route: "qualified", blocking: [], noted: ["decision_maker"], reason: "" }, { ...crit, decision_maker: { result: "unclear", reason: "Her brother decides" } }, link, "qualified", undefined, undefined, rec), take);
  await send(tag + renderBooked({ ...base, name: "Aarti Mehta", phone: "+919800000005", area: "Koregaon Park", property_type: "4BHK", carpet_area_sqft: 2400, scope: "Complete redesign", timeline_text: "Back in by February", handoff_summary: "Aarti is redoing a 4BHK in Koregaon Park, referred by Vikram Agarwal. She wants to move back by February. A site-visit consultation is booked." }, link, "Mon, 12 Oct, 11:00 am", "Aarav (designer)", "https://cal.com/video/sample", undefined, [], rec));
  await send(tag + renderBooked({ ...base, name: "Neha Rao", phone: "+919800000031", area: "Wakad", property_type: "3BHK", carpet_area_sqft: 1200, scope: "Kitchen and wardrobes", timeline_text: "Needs it in 8 weeks", handoff_summary: "Neha has a 3BHK in Wakad and needs the kitchen and wardrobes done within 8 weeks. A consultation is booked for tomorrow." }, link, "Sat, 11 Oct, 5:00 pm", "Isha (designer)", "https://cal.com/video/sample2", { urgent: true, reason: "Needed in about 8 weeks" }));
  await send(tag + renderComplaint({ ...base, name: "Sheetal Deshpande", complaint: { project_details: "2BHK, Viman Nagar, designer Aryan", summary: "Designer hasn't replied in 5 days after 3 messages and 2 calls; wants a callback from Nikhil or a senior person." } }, link), [{ text: "✅ Callback done", callback_data: "dry:0" }]);
  await send(tag + `${compactLine(base)}\n✅ <b>Taken by Aarav</b> · Sat, 10 Oct, 6:12 pm\n<i>(this is how a decided lead looks afterwards: one line)</i>`);
  console.log("sent samples");
})().catch((e) => { console.error(e.message); process.exit(1); });
