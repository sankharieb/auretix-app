-- Auretix Moat Engine migration.
-- Run this after the base schema to add proprietary risk, outcome, supplier,
-- partner, and profit impact learning tables.

create table if not exists risk_scores (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  sku text not null,
  issue_type text not null,
  score integer not null check (score >= 0 and score <= 100),
  risk_level text not null check (risk_level in ('Low', 'Watch', 'High', 'Critical')),
  reason_summary text not null,
  recommended_action text not null,
  financial_impact integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  model_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists decision_recommendations (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  risk_score_id text references risk_scores(id) on delete set null,
  sku text not null,
  issue_type text not null,
  recommendation_type text not null,
  recommended_action text not null,
  user_action text not null check (user_action in ('approved', 'deferred', 'ignored', 'watched', 'request_partner_help')),
  status text not null,
  estimated_financial_impact integer not null default 0,
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  reason_summary text not null,
  accuracy_status text not null default 'pending' check (
    accuracy_status in ('pending', 'accurate', 'inaccurate', 'partially accurate')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists decision_outcomes (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  recommendation_id text references decision_recommendations(id) on delete cascade,
  sku text not null,
  actual_result text not null,
  actual_financial_impact integer not null default 0,
  accuracy_status text not null check (
    accuracy_status in ('pending', 'accurate', 'inaccurate', 'partially accurate')
  ),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists supplier_intelligence (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  supplier_name text not null,
  expected_lead_time integer not null default 0,
  actual_lead_time integer not null default 0,
  average_delay numeric not null default 0,
  reliability_score integer not null default 0 check (reliability_score >= 0 and reliability_score <= 100),
  on_time_percentage integer not null default 0 check (on_time_percentage >= 0 and on_time_percentage <= 100),
  issue_history jsonb not null default '[]'::jsonb,
  sku_relationships jsonb not null default '[]'::jsonb,
  po_relationships jsonb not null default '[]'::jsonb,
  last_performance_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, workspace_id, supplier_name)
);

create table if not exists supplier_performance_events (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  supplier_intelligence_id text references supplier_intelligence(id) on delete set null,
  supplier_name text not null,
  sku text,
  event_type text not null,
  expected_lead_time integer,
  actual_lead_time integer,
  delay_days integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists partner_match_outcomes (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  partner_match_request_id text references partner_match_requests(id) on delete set null,
  partner_type text not null,
  match_request_type text not null,
  request_status text not null,
  consent_status text not null,
  referral_disclosure_status text not null,
  matched_partner_sent_status text not null,
  outcome text,
  partner_success_rating integer check (partner_success_rating >= 0 and partner_success_rating <= 100),
  time_to_response_hours integer,
  solved_issue boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists daily_decision_queue (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  recommendation_id text references decision_recommendations(id) on delete set null,
  sku text not null,
  priority_score integer not null default 0,
  problem text not null,
  why_it_matters text not null,
  financial_impact integer not null default 0,
  recommended_action text not null,
  confidence integer not null default 0,
  status text not null default 'Pending',
  queue_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profit_impact_records (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  recommendation_id text references decision_recommendations(id) on delete cascade,
  sku text not null,
  revenue_at_risk integer not null default 0,
  margin_at_risk integer not null default 0,
  cash_tied_up integer not null default 0,
  potential_stockout_loss integer not null default 0,
  overstock_exposure integer not null default 0,
  cost_of_delay integer not null default 0,
  expected_benefit integer not null default 0,
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists risk_scores_workspace_created_idx
  on risk_scores (workspace_id, created_at desc);

create index if not exists decision_recommendations_workspace_created_idx
  on decision_recommendations (workspace_id, created_at desc);

create index if not exists decision_outcomes_recommendation_created_idx
  on decision_outcomes (recommendation_id, created_at desc);

create index if not exists supplier_intelligence_workspace_supplier_idx
  on supplier_intelligence (workspace_id, supplier_name);

create index if not exists supplier_performance_events_workspace_created_idx
  on supplier_performance_events (workspace_id, created_at desc);

create index if not exists partner_match_outcomes_workspace_created_idx
  on partner_match_outcomes (workspace_id, created_at desc);

create index if not exists daily_decision_queue_workspace_date_idx
  on daily_decision_queue (workspace_id, queue_date, priority_score desc);

create index if not exists profit_impact_records_recommendation_idx
  on profit_impact_records (recommendation_id);

alter table risk_scores enable row level security;
alter table decision_recommendations enable row level security;
alter table decision_outcomes enable row level security;
alter table supplier_intelligence enable row level security;
alter table supplier_performance_events enable row level security;
alter table partner_match_outcomes enable row level security;
alter table daily_decision_queue enable row level security;
alter table profit_impact_records enable row level security;

drop policy if exists "company members can read risk scores" on risk_scores;
create policy "company members can read risk scores"
  on risk_scores for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create risk scores" on risk_scores;
create policy "decision users can create risk scores"
  on risk_scores for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read decision recommendations" on decision_recommendations;
create policy "company members can read decision recommendations"
  on decision_recommendations for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create decision recommendations" on decision_recommendations;
create policy "decision users can create decision recommendations"
  on decision_recommendations for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update decision recommendations" on decision_recommendations;
create policy "decision users can update decision recommendations"
  on decision_recommendations for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read decision outcomes" on decision_outcomes;
create policy "company members can read decision outcomes"
  on decision_outcomes for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create decision outcomes" on decision_outcomes;
create policy "decision users can create decision outcomes"
  on decision_outcomes for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read supplier intelligence" on supplier_intelligence;
create policy "company members can read supplier intelligence"
  on supplier_intelligence for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can manage supplier intelligence" on supplier_intelligence;
create policy "operators can manage supplier intelligence"
  on supplier_intelligence for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  );

drop policy if exists "company members can read supplier performance events" on supplier_performance_events;
create policy "company members can read supplier performance events"
  on supplier_performance_events for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can create supplier performance events" on supplier_performance_events;
create policy "operators can create supplier performance events"
  on supplier_performance_events for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  );

drop policy if exists "company members can read partner match outcomes" on partner_match_outcomes;
create policy "company members can read partner match outcomes"
  on partner_match_outcomes for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can manage partner match outcomes" on partner_match_outcomes;
create policy "operators can manage partner match outcomes"
  on partner_match_outcomes for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  );

drop policy if exists "company members can read daily decision queue" on daily_decision_queue;
create policy "company members can read daily decision queue"
  on daily_decision_queue for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can manage daily decision queue" on daily_decision_queue;
create policy "decision users can manage daily decision queue"
  on daily_decision_queue for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read profit impact records" on profit_impact_records;
create policy "company members can read profit impact records"
  on profit_impact_records for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create profit impact records" on profit_impact_records;
create policy "decision users can create profit impact records"
  on profit_impact_records for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );
