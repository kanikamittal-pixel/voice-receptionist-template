# Voice receptionist template

A voice assistant answers every enquiry for a small studio (the sample setup is an interior design studio in Pune). It qualifies the caller against the studio's rules, books a free consultation on the designer's calendar during the call, and hands the lead to a designer on **Telegram** and a **web dashboard**. Nikhil (the founder) sees every lead, and the revenue, in **HubSpot**.

## How one call moves through the system

1. **Call.** The caller talks to the Vaani voice agent on the web call page (`/talk`). The agent follows `agent/system-prompt.md`: it asks the 5 qualifying questions, confirms area, phone and email, and never quotes a price.
2. **Booking.** For a qualified caller, Vaani books the chosen slot on the designer's **Cal.com** calendar while still on the call.
3. **Webhook.** When the call ends, Vaani posts the transcript and recording to `/api/webhooks/vaani`.
4. **Extraction.** **Gemini** reads the transcript and returns the lead's details, the 5 criteria with reasons, urgency and a handoff note.
5. **Hard checks.** Plain code (not AI) checks the service area, project type, size and deadline. If code and AI disagree, code wins and the difference is logged.
6. **Routing.** The lead becomes *qualified*, *not sure*, *not a fit*, *complaint* or *dropped*, and the call, recording and cost are saved in **Neon**.
7. **Hand-off.** HubSpot gets a contact and a deal; Telegram gets a message only if someone must act; the dashboard shows the lead.
8. **Designer.** The designer takes or passes the lead from Telegram or the dashboard, then contacts the customer.

## Where to find things

The repository has three parts. The rule that keeps it easy to read: **the frontend never touches the database.** It asks the backend for data.

| Folder | What it holds |
|---|---|
| `frontend/` | Everything a person sees: pages, components, design system, styles |
| `backend/` | Everything that thinks or talks to other services |
| `app/` | Next.js routing only: each file is one line that points to `frontend/` or `backend/` |
| `agent/` | The voice agent's prompt and settings |
| `scripts/` | Setup, testing and maintenance commands |
| `docs/` | The components map |

### The connections

| Connection | Code | What it does |
|---|---|---|
| **Telegram** | `backend/integrations/telegram/` and `backend/api/telegram-webhook.ts` | `client.ts` sends and edits messages; `messages.ts` builds the message layouts; `handlers.ts` handles the Take / Pass / Callback buttons. Only messages that need action are sent. |
| **HubSpot (Nikhil)** | `backend/integrations/hubspot/` and `frontend/pages/NikhilDashboard.tsx` | `sync-lead.ts` writes the contact, deal and timeline note; `pipeline-metrics.ts` reads the deals back for Nikhil's dashboard. `npm run hubspot:setup` creates the Sales pipeline and properties. |
| **Cal.com** | `backend/integrations/calcom/` and `backend/api/calcom-webhook.ts` | Matches a booking made by Vaani to its call; builds the designer's booking link; handles cancelled and rescheduled bookings. |
| **Vaani** | `backend/integrations/vaani/` and `backend/api/vaani-webhook.ts` | The only code that knows Vaani's payload; turns it into a neutral call object so another channel could reuse the pipeline. |
| **Gemini** | `backend/integrations/gemini/extract.ts` | Transcript in, structured lead out, with fallback between models. |

### Lead logic and dashboards

| Topic | Code |
|---|---|
| Processing a finished call, step by step | `backend/leads/process-call.ts` |
| Hard checks (area, project type, size, deadline) | `backend/leads/hard-checks.ts` |
| Routing and "urgent" | `backend/leads/routing.ts` |
| Take / Pass, cancelling a meeting | `backend/leads/actions.ts` |
| Who gets a lead | `backend/leads/assign-designer.ts` (one function) |
| Cost of a call, in ₹ | `backend/leads/cost.ts` |
| **Designer dashboard** | page `frontend/pages/DesignerDashboard.tsx`, queries `backend/dashboard/designer-leads.ts`, buttons `backend/api/designer-actions.ts` |
| Dashboard look | `frontend/design-system/` and `frontend/styles/` |
| Database tables | `backend/database/schema.sql` |
| Editable rules and settings | `backend/config/` (change them at `/admin` without redeploying) |

## Running it

```bash
cp .env.example .env.local     # fill in the keys
npm install
npm run db:migrate             # create the tables in Neon
npm run hubspot:setup          # create the Sales pipeline and deal properties
npm run webhooks:setup         # register the Telegram and Cal.com webhooks
npm run designer:add -- "Name" <telegram_id|0> --link <cal.com link> --email <email>
npm run agent:build -- --booking && npm run agent:create   # publish the voice prompt to Vaani
npm run dev
```

Secrets live only in environment variables (never in the code). Dashboard links carry a personal token; a designer can be given a **view-only** link (`npm run viewer:add`).

## Tests

- `npm run test:unit`: 44 offline checks of the hard checks, routing, messages and metrics.
- `npm run test:transcripts`: runs the 20 sample calls through Gemini and the hard checks and compares each with the expected outcome (all 20 match), then does a dry run of Telegram and Cal.com.

## Versions and deployment

- Every change is a commit with a plain description. The full history is the version history: `git log`.
- Bigger changes are made on a branch, tested, then merged to `main`.
- The app runs on **Vercel**; Vercel keeps every earlier deployment, so a bad release can be rolled back in one click.
- Complaint reminders run on a GitHub Actions schedule (`.github/workflows/reminders.yml`).

## Using this copy

This is a clean template: **no API keys, no tokens and no commit history** are included. Create your own accounts for Neon, Vaani, Gemini, Telegram, HubSpot, Cal.com and Vercel, put the keys in `.env.local` (copy `.env.example`), then follow "Running it" above. The studio rules, prompt and test calls are samples: replace them with your own.
