// Defaults for the two editable config documents. The `app_config` table rows
// 'rules' and 'settings' override these key by key (see backend/config/settings.ts), so
// Nikhil's office can edit them at /admin without a redeploy.
//
// RULES mirror services.md / qualified.md. Values below come from the project brief;
// anything marked CONFIRM must be checked against the real files.

export const DEFAULT_RULES = {
  // From knowledge/services.md "Service area". Edit via /admin when services.md changes.
  service_area: {
    include: ["pune", "pcmc", "pimpri", "chinchwad", "pimpri-chinchwad", "pimpri chinchwad"],
    // Localities that imply Pune/PCMC when the caller names no city.
    localities: [
      "kothrud", "baner", "aundh", "wakad", "koregaon park", "kalyani nagar", "viman nagar", "hadapsar",
      "magarpatta", "nibm", "kondhwa", "undri", "shivane", "warje", "erandwane", "deccan",
      "pimple saudagar", "pimple nilakh", "ravet", "hinjewadi", "hinjawadi", "kharadi", "nanded city",
      "bavdhan", "balewadi", "pashan", "wanowrie", "shivajinagar", "yerawada", "mundhwa", "wagholi", "nigdi", "akurdi",
    ],
    // Named in services.md as not served; any match is a clear fail even if "pune" also appears.
    exclude: ["talegaon", "lonavala", "nashik", "mumbai", "nagpur", "kolhapur", "satara", "ahmednagar", "solapur", "aurangabad", "hyderabad", "bangalore", "bengaluru", "delhi"],
  },
  // project_category values (set by the extractor) that are always out of scope. services.md "What we don't do".
  out_of_scope_categories: [
    "restaurant", "hotel", "retail", "gym", "decor_only", "standalone_furniture", "vastu_only", "structural_only",
  ],
  commercial_max_sqft: 3000, // services.md: "up to approximately 3,000 sq ft"
  // NOT in services.md: taken from transcript T18 ("commercial projects are typically 500 sq ft or more"). CONFIRM with Nikhil.
  commercial_min_sqft: 500,
  // PROPOSED: a lead is URGENT if needed within this many weeks (but not under min_weeks_to_deadline, which fails), or the caller signals urgency. CONFIRM.
  urgent_within_weeks: 10,
  min_weeks_to_deadline: 6, // services.md. NOTE qualified.md says 8-10 weeks: see README "Open questions".
  // Fed into the Gemini extraction prompt. Mirrors knowledge/qualified.md.
  criteria_text: {
    real_project: "1. Real project, not just advice: wants design AND execution (min engagement = a room redesign with full execution). Red flags: 'just looking for ideas', 'come and advise', 'I'll do the execution myself'. PASS when the caller describes a home or small-office project and wants to book a consultation or go ahead, even if 'execution' is never said aloud. FAIL on explicit advice-only / DIY signals. UNCLEAR only if it is genuinely ambiguous whether they want a project at all.",
    location: "2. In service area: Pune city or PCMC. Talegaon, Lonavala, Nashik, Mumbai or anywhere else fails.",
    timeline: "3. Realistic timeline: execution can't start on a project needed in under 6 weeks; ~3 weeks fails. If a later start (e.g. 'after Diwali', 'November') is offered by the studio or caller, still fail but record the possible later start in the reason. If NO deadline was mentioned and nothing hints at a tight or conflicting date, PASS with reason 'No deadline stated, no conflict'. UNCLEAR only when the caller hinted at timing but it is vague or contradictory.",
    budget: "4. Budget band (broadly): FAIL only if the caller volunteered a number clearly below any project of their scope (e.g. 1-1.5 lakh for a full flat redesign or a kitchen+bedroom). No budget mentioned = PASS (reason: 'No budget mentioned, treated as qualified'). UNCLEAR only if what they said about budget is ambiguous.",
    decision_maker: "5. Decision-maker on the call or represented. PASS if the caller is the decision-maker or confirms they are authorised (e.g. 'my husband knows and is happy to go ahead'). UNCLEAR (not fail) if the caller is checking on behalf of others who will decide later, e.g. a son calling 'to see if it's worth pursuing' while his parents decide.",
  },
  boundary_rules:
    "Unclear on 1, 2 or 3 means the agent should have asked one direct question; if it is still unclear after the call, mark 'unclear'. " +
    "Unclear on 4 or 5 is NOT pushed: mark 'unclear' and the lead is still treated as qualified with the uncertainty noted. " +
    "Mark 'fail' only when it clearly fails. These do NOT disqualify: not knowing what they want, calling out of hours, asking for pricing, uncertainty about style/materials, a single-room project with execution, a rented apartment.",
};

export const DEFAULT_SETTINGS = {
  // How long (minutes) a dropped call can be matched to the caller's callback, and when unanswered complaints are reminded.
  merge_window_minutes: 30,
  complaint_reminder_minutes: 30,
  complaint_max_reminders: 2,
  hubspot: {
    // Use HubSpot's default pipeline (renamed, with our 7 stages) so everything shows in the one pipeline view. false = create a separate pipeline.
    use_default_pipeline: true,
    pipeline_label: "Sales pipeline",
    stages: [
      { key: "needs_review", label: "Needs review", probability: 0.1 },
      { key: "qualified", label: "Qualified", probability: 0.3 },
      { key: "consultation_booked", label: "Consultation booked", probability: 0.5 },
      { key: "not_a_fit", label: "Not a fit", probability: 0 },
      { key: "complaint", label: "Complaint", probability: 0 },
      { key: "won", label: "Won", probability: 1 },
      { key: "lost", label: "Lost", probability: 0 },
    ],
  },
  // Business hours decide the "out of hours" flag. The designer assignment rule lives in backend/leads/assign-designer.ts.
  business_hours: { start_hour: 10, end_hour: 19, days: [0, 1, 2, 3, 4, 5, 6], timezone: "Asia/Kolkata" },
  low_confidence_goes_to_review: true,
  // Telegram only carries what needs attention: qualified leads (action), Vaani bookings (FYI), complaints. "Not sure" leads stay on the dashboard unless this is true.
  telegram: { send_unclear: false },
  costs: {
    // Estimated rates used for the cost figure on each call. Update them from the Vaani and Google bills.
    voice_rate_inr_per_min: 2.4,
    gemini_in_usd_per_mtok: 0.3,
    gemini_out_usd_per_mtok: 2.5,
    usd_inr: 84,
  },
};

export type Rules = typeof DEFAULT_RULES;
export type Settings = typeof DEFAULT_SETTINGS;
