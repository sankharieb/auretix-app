# Auretix Architecture v1.0

This document is the engineering blueprint for Auretix. It is not user documentation, sales copy, or a feature checklist. Future engineers and AI assistants should read this before adding or changing platform behavior.

If a future implementation conflicts with this architecture, this architecture wins until it is deliberately updated.

## 1. Vision

Auretix is not an ERP, dashboard, reporting tool, or chatbot.

Auretix is an Operating Intelligence Platform for modern commerce.

Its purpose is to help business owners understand:

- what is happening
- why it is happening
- what could happen next
- what evidence supports each conclusion
- what possible response paths exist

Auretix provides explainable intelligence while leaving every business decision to the owner.

Core principle:

**Auretix informs. The seller decides.**

## 2. Design Principles

### Explainability

Every number must be explainable. Auretix must be able to show the data, calculation, assumptions, and confidence behind each output. No black-box calculations are allowed.

### Evidence First

Every conclusion must be supported by evidence. A conclusion without evidence is not an Auretix conclusion; it is only a draft hypothesis.

### Single Source Of Truth

Financial calculations occur only inside the Profit Engine. Do not duplicate financial logic in Advisor, UI components, API routes, scripts, or future modules.

### Memory Before Learning

Record history before attempting to learn from it. Learning requires real recorded events, actions, outcomes, and calculated results. Never fabricate history to make the system appear smarter.

### Immutable History

Calculation runs, business actions, evidence records, and outcomes should be preserved. Do not overwrite historical truth. Add new events or correction records instead.

### Business Actions Win

Advisor suggestions are not reality. Real business actions are reality. If suggested response paths differ from what the seller actually does, record both.

### Human Remains In Control

Auretix never executes business decisions automatically. It presents information, evidence, options, and response paths. Humans decide.

## 3. Engine Architecture

### Advisor Engine

Purpose: communicate operational intelligence in plain business language.

Consumes:

- Profit Engine outputs
- Evidence Engine bundles
- Memory Engine history
- Learning Engine signals

Outputs:

- briefings
- investigations
- response paths
- explanation summaries

Rules:

- Advisor never calculates finance.
- Advisor does not become the source of financial truth.
- Advisor should speak in current state, trend, projection, confidence, evidence, and response paths.
- Advisor should avoid claiming certainty when the supporting data is incomplete.

### Profit Engine

Purpose: perform true financial calculations.

Owns:

- Net Realized Profit
- cost allocation
- ten cost levels
- transportation costs
- marketplace fees
- operational costs
- cost source provenance
- data completeness by cost level

Rules:

- Profit Engine is the single financial engine.
- Financial math must not be duplicated elsewhere.
- Profit Engine may output evidence metadata, but the math remains owned here.
- New commerce cost categories should plug into the ten-level cost model instead of creating parallel margin formulas.

### Evidence Engine

Purpose: explain every calculation, projection, and conclusion.

Owns:

- evidence sources
- evidence records
- evidence links
- calculation runs
- confidence summaries
- source provenance
- calculation traces
- data freshness

Rules:

- Every important number should answer: what data, what calculation, what assumptions, how confident, how fresh, and where it came from.
- Evidence can be generated before it is persisted.
- Evidence should distinguish seller-provided data, connected data, inferred data, and calculated data.

### Memory Engine

Purpose: remember everything that matters operationally.

Owns:

- advisor decisions
- business actions
- outcomes
- prediction versus actual
- financial derivations
- historical timelines

Rules:

- Memory records what happened.
- Memory does not invent outcomes.
- Memory preserves both suggested paths and actual business actions.
- Memory becomes the trusted input for future learning.

### Learning Engine (Future)

Purpose: discover patterns from recorded history.

Consumes:

- Memory Engine records
- calculated outcomes
- actual business actions
- evidence-backed calculation runs

Produces:

- improved confidence
- pattern recognition
- forecast improvements
- better prioritization signals

Rules:

- Learning never modifies history.
- Learning consumes calculated outcomes, not seller guesses.
- Learning signals remain explainable and evidence-linked.

## 4. Data Flow

Primary platform flow:

```text
Business Data
  -> Normalization
  -> Profit Engine
  -> Evidence Engine
  -> Memory Engine
  -> Learning Engine
  -> Advisor Engine
```

Advisor is the final consumer. It communicates what matters after data has been normalized, calculated, explained, remembered, and eventually learned from.

Business data may come from connected systems, manual entry, CSV imports, marketplace APIs, accounting platforms, carrier systems, supplier updates, or partner workflows.

Normalization converts raw records into Auretix operating entities such as products, shipments, shipment lines, cost events, revenue events, purchase orders, supplier events, inventory events, and business actions.

## 5. Financial Model

Auretix calculates Net Realized Profit instead of gross margin because sellers do not lose money only at the product-cost layer. Real seller economics include transportation, marketplace fees, warehouse costs, marketing, returns, labor, software, and overhead.

The ten cost levels are:

1. Revenue
2. Product Cost
3. Transportation
4. Warehouse
5. Marketplace Fees
6. Marketing
7. Customer Cost
8. Operational
9. Labor
10. Overhead

Net Realized Profit formula:

```text
Revenue
- Product Cost
- Transportation
- Warehouse
- Marketplace Fees
- Marketing
- Customer Cost
- Operational
- Labor
- Overhead
= Net Realized Profit
```

Required v1 levels are:

- Revenue
- Product Cost
- Transportation
- Marketplace Fees

The absence of a cost level is not the same as zero cost. Missing cost levels must be surfaced through data completeness and evidence warnings.

## 6. Evidence Model

Every number should answer:

- What data produced this?
- Where did the data come from?
- What calculation was used?
- What assumptions were required?
- How confident is the system?
- How fresh is the evidence?
- What did Auretix calculate versus what the seller provided?

Core evidence entities:

- `evidence_sources`: where evidence came from
- `evidence_records`: individual facts, assumptions, calculations, or confidence drivers
- `evidence_links`: relationships between conclusions and supporting evidence
- `evidence_calculation_runs`: versioned calculation outputs

Evidence source types:

- connected
- manual
- inferred
- calculated

Evidence is not optional for important calculations. If evidence is missing, Auretix must say so.

## 7. Memory Model

Memory flow:

```text
Decision
  -> Business Action
  -> Outcome
  -> Financial Derivation
  -> Historical Timeline
  -> Learning (future)
```

Definitions:

- Decision: a user-facing choice or possible response path presented by Auretix.
- Business Action: what the seller actually did.
- Outcome: what happened after the action or inaction.
- Financial Derivation: the calculated financial effect, generated by the Profit Engine.
- Historical Timeline: the durable record of events, evidence, actions, outcomes, and recalculations.

Memory should preserve disagreement between Auretix paths and seller action. That disagreement is valuable future learning input.

## 8. Learning Philosophy

Learning consumes calculated outcomes, not seller guesses.

Seller estimates can be useful context, but they are not training truth. Learning should use:

- actual outcomes
- calculated financial effects
- recorded business actions
- historical supplier performance
- forecast versus actual
- recommendation versus action
- action versus outcome

Learning may improve confidence and prioritization, but it must not rewrite the past.

## 9. Event Driven Future

Everything eventually becomes a business event.

Examples:

- inventory updated
- shipment arrived
- purchase order created
- purchase order cancelled
- sales synced
- accounting imported
- marketplace fees updated
- supplier changed
- forecast updated
- carrier delay detected
- partner match requested
- business action approved
- outcome recorded

Events should trigger recalculation.

Future architecture should prefer event-driven recalculation over page-load calculation or polling. Page loads should read the current intelligence state, not become the system of record.

## 10. Future Modules

Future modules must plug into Profit, Evidence, Memory, and Learning rather than creating separate parallel systems.

Reserved modules:

- Supplier Intelligence
- Pricing Intelligence
- Cash Intelligence
- Forecast Engine
- Demand Engine
- Procurement Engine
- Inventory Optimization
- Partner Marketplace
- Benchmark Intelligence

Integration rules:

- If a module produces financial numbers, it must use or feed the Profit Engine.
- If a module produces conclusions, it must produce evidence.
- If a module observes action or outcome, it must write to Memory.
- If a module improves over time, it must learn from Memory and calculated outcomes.

## 11. What Must Never Change

These rules are platform invariants:

- Never duplicate financial calculations outside the Profit Engine.
- Never overwrite historical calculation runs.
- Never learn from seller estimates as truth.
- Never hide evidence.
- Never remove explainability.
- Never auto-execute business actions.
- Never introduce a second tenant model.
- Never bypass company/workspace isolation.
- Always preserve auditability.
- Always separate suggested response paths from actual business actions.
- Always make missing data visible.

## 12. Engineering Standards

Auretix engineering expectations:

- Use TypeScript for new engine code when practical.
- Use Supabase PostgreSQL for durable platform data.
- Use the existing company/workspace tenant model.
- Protect tenant data with Row Level Security.
- Keep engines reusable and testable.
- Keep modules small and focused.
- Avoid duplicated logic.
- Prefer composable services over large page-level implementations.
- Keep calculations unit-testable.
- Keep source provenance attached to important data.
- Do not make UI components own business logic.

Tenant model:

```text
companies
users
workspaces
company_id
workspace_id
```

RLS pattern:

```text
read: company_id = current_auretix_company_id()
write: same company and role in owner/admin/operator/finance
viewer: read only
```

## 13. Current Platform Status

Completed:

- Advisor Engine
- Profit Engine
- Evidence Engine

Next:

- Memory Engine

Future:

- Learning Engine

Current implementation notes:

- Supabase auth, company/workspace structure, roles, and RLS are the platform tenant foundation.
- The Profit Engine owns landed-cost and true-profit calculation.
- The Evidence Engine creates an auditable layer for numbers, calculations, confidence, source provenance, and missing data.
- The Advisor Engine should remain a consumer of these engines, not a competing calculation system.

## Constitutional Rule

Auretix is designed to become auditable operating intelligence.

Every future feature should make the platform better at answering:

- What happened?
- Why did it happen?
- What could happen next?
- What evidence supports that?
- What options does the seller have?
- What did the seller actually do?
- What happened afterward?

The platform must always return to the core principle:

**Auretix informs. The seller decides.**
