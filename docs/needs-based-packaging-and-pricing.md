# Auretix Needs-Based Packaging And Pricing

Auretix should not be sold as one giant bundle to every customer. The offer should start with the customer's actual operational pain, then map to the smallest package that can solve it and prove value.

## Pricing Position

Auretix is not trying to replace a full ERP on day one. It should start as a procurement and supply chain decision layer that sits above messy data, spreadsheets, seller systems, and supplier workflows.

Current market anchors:

- Cin7 publicly lists inventory plans at $349, $599, and $999 per month, with larger Omni plans quoted.
- Shopify lists core commerce plans from $29 to $299 per month when paid annually, with Plus from $2,300 per month.
- QuickBooks Online lists plans from $38 to $275 per month before promotions.

That means Auretix should avoid pricing below commodity apps, but should also avoid enterprise pricing until live integrations and proven ROI are real. The right early posture is paid pilots and needs-based packages.

## Recommended Packages

| Package | Price | Setup | Best customer | Sell when the customer says |
| --- | --- | --- | --- | --- |
| Starter Decision Desk | $299-$499/mo | $500-$1,500 | Small ecommerce, retail, or consumer brand teams | "I need to know what to reorder, what is risky, and where cash is being wasted." |
| Growth Operations | $799-$1,499/mo | $1,500-$3,500 | Growing sellers, wholesalers, and brands | "We need procurement, supplier, workflow, and purchasing decisions in one operating view." |
| Operator+ Control Tower | $2,500-$5,000+/mo | $5,000-$15,000 | Manufacturing, distribution, wholesale, and multi-team operations | "We need supplier control, auditability, permissions, ROI proof, and a serious rollout." |

## What Each Plan Includes

### Starter Decision Desk

Use this for simple paid pilots and early customers.

- Decision engine
- SKU decision queue
- Protect, Grow, Fix, Run lean playbooks
- CSV inventory import
- Basic workspace save/load
- Basic modeled ROI view
- One monthly review

Do not include:

- Live integrations
- Custom supplier workflows
- Advanced permissions
- Proven ROI claims

### Growth Operations

Use this when the customer has more operational complexity and enough urgency to pay for workflow.

- Everything in Starter
- Procurement optimizer
- Draft purchase-order workflow
- Open PO tracker
- Supplier relationship board
- Anomaly detection
- Forecast board
- Supplier packet generator
- Monthly ROI review

Do not include:

- Unlimited workspaces
- Custom integrations without a paid milestone
- Enterprise audit commitments

### Operator+ Control Tower

Use this for higher-value customers with more risk, more users, and a stronger need for control.

- Everything in Growth
- Supplier strategy memory
- Cross-supplier reallocation planner
- Company-level permissions
- Audit trail hardening
- Custom onboarding
- Integration roadmap and ROI proof plan

Do not sell this without discovery. This package should be scoped around data readiness, team size, risk level, and operational complexity.

## Needs To Plan Mapping

| Customer need | First package to offer | Why |
| --- | --- | --- |
| Stockout prevention | Starter | The SKU queue, playbooks, and forecast board can create value quickly. |
| Reorder timing | Starter | CSV data and scenario inputs are enough for a useful first workflow. |
| Cash-aware buying | Starter or Growth | Start simple unless supplier workflow and PO approvals are also needed. |
| Overbuying control | Growth | Needs playbooks plus procurement workflow and ROI review. |
| Supplier reliability | Growth | Supplier boards, packets, PO tracking, and strategy memory become important. |
| Workflow control | Growth | Draft POs, tasks, change logs, and persistence matter. |
| ROI proof | Growth or Operator+ | Modeled ROI can start early, but proof needs connected data and outcomes. |
| Live integrations | Operator+ or paid milestone | Keep this as a scoped project until OAuth and sync jobs are production-ready. |

## Revenue Reality

Near term, before live integrations and proven ROI, realistic paid-pilot revenue is modest:

- 3 customers at $299-$499/mo: about $900-$1,500 MRR.
- 5 customers at $799/mo: about $4,000 MRR.
- 10 mixed customers across Starter and Growth: roughly $5,000-$12,000 MRR.

After live integrations, repeatable onboarding, and proof that recommendations save money:

- 10 Growth customers at $1,000/mo: about $10,000 MRR.
- 25 mixed Growth and Operator+ customers: roughly $30,000-$75,000 MRR.
- 50 customers with several Operator+ accounts: $75,000-$150,000+ MRR is possible, but only with evidence, support, and reliable integrations.

These are directional planning ranges, not guaranteed income. The real number depends on customer acquisition, churn, onboarding time, support burden, and whether Auretix can prove it protects enough cash or revenue to justify the subscription.

## Sales Qualification Questions

Ask these before quoting:

1. What is the biggest current pain: stockouts, overbuying, reorder timing, supplier delays, cash pressure, or workflow?
2. What systems hold orders, inventory, purchase orders, vendor bills, and COGS today?
3. How many SKUs, suppliers, locations, and monthly orders are involved?
4. Who makes purchasing decisions today, and who approves them?
5. What would one avoided stockout, avoided overbuy, or supplier delay be worth this month?
6. Does the customer need a decision tool, a workflow system, or proof for leadership?

## Integration Track

Shopify, Amazon, and QuickBooks should stay in the background track until the app has:

- Provider app credentials and approved scopes.
- OAuth token exchange and refresh.
- Durable token storage with encryption strategy.
- Sync jobs for orders, inventory, products, vendors, bills, COGS, and purchase orders.
- Error handling, retry logs, and customer-visible sync status.
- ROI comparison between recommendations and actual outcomes.

Until then, describe integrations as "planned" or "integration-ready foundation," not complete.
