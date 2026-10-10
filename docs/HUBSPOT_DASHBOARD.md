# HubSpot dashboard: build steps (about 15 minutes)

HubSpot's public API can create pipelines and properties (done by `npm run hubspot:setup`) but I found no endpoint that creates **reports**, so the dashboard is built once in the UI from the properties the code writes. Needs a HubSpot tier with custom reports (Sales Hub Professional or above; confirm).

All reports use the **Deals** data source, filtered to pipeline **Phone Enquiries** (add that filter to every report).

**Create the dashboard:** Reporting → Dashboards → Create dashboard → name "Aangan: Phone Enquiries" → Private/Everyone as Nikhil prefers.

For each report: Reporting → Reports → Create report → **Single object** (or Custom report builder where stated) → Deals.

| # | Report name | Type | Setup |
|---|---|---|---|
| 1 | Calls received | Number (KPI) | Count of deals. Filter: Create date = This month (add a date picker to the dashboard for flexibility). One deal = one lead; a dropped call + callback merge into one deal, so use "Calls received" below if you want raw call counts. |
| 2 | % answered within 5 min | Number / donut | Donut chart of deals grouped by **Answered within 5 min** (Yes/No). The Yes slice % is the figure. |
| 3 | Out-of-hours calls | Number (KPI) | Count of deals, filter **Out of hours** = Yes. |
| 4 | Leads by stage | Funnel or bar | Deals grouped by **Deal stage**. Pipeline: Phone Enquiries. |
| 5 | Consultations booked | Number (KPI) | Count of deals where **Deal stage** = Consultation booked, Won, or Lost-after-booking; simplest: stage = Consultation booked plus Won. |
| 6 | Won revenue | Number (KPI) | Sum of **Amount**, filter Deal stage = Won, date = Close date. |
| 7 | Total cost | Number (KPI) | Sum of **Cost of this call (INR)**, all deals in the pipeline. |
| 8 | Cost per qualified lead | Number (KPI) | Custom report builder → metric: Sum of *Cost of this call (INR)* ÷ Count of deals with **Routing decision** = qualified. If your tier lacks formulas, show two KPIs side by side (Total cost, Qualified count) and use `/api/metrics` (see below) for the ratio. |
| 9 | Revenue vs cost | Bar or two KPIs | Two bars: Sum of Amount (Won) vs Sum of Cost of this call (INR). Ratio = Won revenue ÷ Total cost. |

## Notes
- "Calls received" counts **deals**. The authoritative raw call count (including merged dropped calls) is in the database: `GET /api/metrics` with `Authorization: Bearer <ADMIN_TOKEN>` returns calls, % answered in 5 min, out-of-hours, qualified count, total cost and cost per qualified lead for cross-checking.
- **Revenue:** Nikhil moves the deal to **Won** and fills **Amount**. Nothing else is needed.
- Deals the designers **decline** go to **Lost** with the reason stored in our database; deals the system judges **Not a fit** stay in **Not a fit**.
- Deal property internal names: `call_time`, `answered_within_5_min`, `out_of_hours`, `criteria_results`, `confidence`, `routing_decision`, `assigned_designer`, `transcript_link`, `call_cost_inr`.
