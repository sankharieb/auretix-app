# Auretix Feature Inventory And Test Plan

This document keeps Auretix honest. Before we sell a customer a package, each feature should be tested against the business need it claims to solve.

## Status Definitions

- Live in V1: Built into the current app and ready for manual validation.
- Foundation built: The structure exists, but it needs more hardening before being treated as production SaaS.
- Later integration track: Keep scoped for later. Do not sell as live until real provider credentials, sync jobs, error handling, and customer data validation exist.

## Feature Catalog

| Category | Feature | Status | Main needs solved | Test before selling |
| --- | --- | --- | --- | --- |
| Core decision engine | Business scenario engine | Live in V1 | Stockout prevention, reorder timing, cash-aware buying | Change business type, scale, objective, and scenario mode in `/app`; confirm recommendations update. |
| Core decision engine | Support-tier recommendation | Live in V1 | Workflow control, ROI proof | Run low, medium, and high-risk scenarios; confirm suggested tier changes plausibly. |
| Core decision engine | SKU decision queue | Live in V1 | Stockouts, overbuying, reorder timing | Select multiple SKUs; confirm risk, playbook, reorder units, supplier, and action copy align. |
| Core decision engine | Protect, Grow, Fix, Run lean playbooks | Live in V1 | Stockouts, overbuying, cash pressure | Stress demand, cash, and supplier settings; confirm playbook counts and item labels change. |
| Procurement control | Procurement optimizer | Live in V1 | Reorder timing, supplier risk, cash pressure | Review buy units, supplier comparisons, landed margin, delay probability, and award decision. |
| Procurement control | Draft purchase-order workflow | Live in V1 | Workflow control, supplier risk | Create a draft PO, edit units, terms, status, and notes, then mark it sent. |
| Procurement control | Open purchase-order tracker | Live in V1 | Supplier risk, workflow control | Change communication state, add follow-up notes, and confirm status history updates. |
| Supplier management | Supplier packet generator | Live in V1 | Supplier risk, workflow control | Generate a supplier packet and confirm templates, notes, issue flags, and export history. |
| Supplier management | Supplier relationship board | Live in V1 | Supplier reliability, workflow control | Confirm response rate, no-response count, escalation count, and drag label calculations. |
| Supplier management | Supplier strategy memory | Live in V1 | Supplier risk, cash-aware buying | Set preferred, reduce, or exit strategy, rerun the engine, and confirm exposure guidance adapts. |
| Supplier management | Cross-supplier reallocation planner | Live in V1 | Supplier risk, overbuying | Review keep, split, and shift options; confirm approved plans become draft PO recommendations. |
| Supply chain protection | Forecast board | Live in V1 | Stockout prevention, reorder timing, ROI proof | Switch scenario mode and confirm 30, 60, and 90-day forecast values change. |
| Supply chain protection | Anomaly detection | Live in V1 | Stockouts, supplier risk, workflow control | Trigger demand spike or supplier delay and confirm anomalies appear with owner and severity. |
| Data, accounts, and permissions | CSV inventory ledger import | Live in V1 | Stockout prevention, reorder timing, cash pressure | Paste SKU,onHand,reserved,inbound CSV data; confirm ledger and queue refresh. |
| Workflow and memory | Workspace persistence | Foundation built | Workflow control, ROI proof | Save, reload, and confirm scenario, draft POs, supplier packets, and supplier memory remain. |
| Data, accounts, and permissions | Login, roles, and company permissions | Foundation built | Workflow control, ROI proof | Sign in with Supabase, confirm owner can save and anonymous cannot save. |
| Workflow and memory | Audit trail foundation | Foundation built | Workflow control, ROI proof | Create a decision run and workspace update; confirm audit events are stored. |
| ROI and integrations | Modeled ROI snapshot | Foundation built | ROI proof, cash-aware buying | Open ROI panel and confirm monthly impact, annual impact, proof score, and inputs render. |
| ROI and integrations | Shopify, Amazon, and QuickBooks integrations | Later integration track | Live integrations, ROI proof | Later: connect OAuth, sync real data, and compare recommendations to actual outcomes. |
| Customer growth | Website lead capture | Live in V1 | Sales qualification, support packaging | Submit the website form and confirm the support request is stored. |

## Test Order

1. Smoke test the website.
   - Open `/`.
   - Confirm hero, engine structure, plan cards, needs assessment, and support form render.
   - Submit one support request and confirm it stores.

2. Smoke test login and account state.
   - Open `/login`.
   - Use the local development sign-in flow.
   - Confirm `/app` shows account mode, role, company, and user email.

3. Test the core decision engine.
   - Run normal, demand spike, supplier delay, and cash pressure scenarios.
   - Record whether summary, playbooks, forecasts, anomalies, and action paths change.

4. Test procurement workflow.
   - Create a draft PO from a recommended award.
   - Edit units, terms, shipping, and status.
   - Mark it sent to supplier and confirm the live PO appears.

5. Test supplier management.
   - Generate a supplier packet.
   - Add notes and update communication states.
   - Change supplier strategy memory and rerun the engine.

6. Test persistence.
   - Save workspace changes.
   - Refresh the page.
   - Confirm scenario, draft POs, supplier packets, and supplier strategy memory are still present.

7. Test ROI and integration readiness.
   - Open the integration panel.
   - Confirm Shopify, Amazon, and QuickBooks are clearly marked as future or credential-dependent.
   - Confirm modeled ROI does not claim proven savings without connected data.

## Release Gates

- Do not sell a feature as live if it only exists as a mock, label, or placeholder.
- Do not claim proven ROI until real customer data and before/after outcomes are connected.
- Do not sell Shopify, Amazon, or QuickBooks as active integrations until OAuth, token exchange, sync jobs, refresh, and failure handling are finished.
- Do not offer multi-user production access until Supabase schema, RLS, roles, and audit flows are verified in the hosted project.
