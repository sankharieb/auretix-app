-- Auretix Moat Engine Phase 6: human-governed model tuning.
-- Adds reviewed guidance rules that can tune future confidence only after
-- explicit human approval.

create table if not exists model_guidance_rules (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  rule_type text not null check (
    rule_type in ('recommendation_type', 'supplier', 'issue_type', 'sku')
  ),
  target_value text not null,
  suggested_adjustment integer not null default 0 check (
    suggested_adjustment >= -25 and suggested_adjustment <= 25
  ),
  approved_adjustment integer check (
    approved_adjustment >= -25 and approved_adjustment <= 25
  ),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  reason text not null default '',
  created_by text,
  approved_by text,
  rejected_by text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

create index if not exists model_guidance_rules_workspace_created_idx
  on model_guidance_rules (workspace_id, created_at desc);

create index if not exists model_guidance_rules_workspace_status_idx
  on model_guidance_rules (workspace_id, status, rule_type);

create unique index if not exists model_guidance_rules_active_unique_idx
  on model_guidance_rules (company_id, workspace_id, rule_type, lower(target_value))
  where status = 'approved';

alter table model_guidance_rules enable row level security;

drop policy if exists "company members can read model guidance rules" on model_guidance_rules;
create policy "company members can read model guidance rules"
  on model_guidance_rules for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create model guidance rules" on model_guidance_rules;
create policy "decision users can create model guidance rules"
  on model_guidance_rules for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update model guidance rules" on model_guidance_rules;
create policy "decision users can update model guidance rules"
  on model_guidance_rules for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );
