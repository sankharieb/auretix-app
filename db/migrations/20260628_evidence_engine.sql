-- Auretix Evidence Engine.
-- Records the source, assumptions, calculation inputs, and confidence behind
-- operational projections without introducing a second tenant model.

create table if not exists evidence_sources (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  source_type text not null check (source_type in ('connected', 'manual', 'inferred', 'calculated')),
  system text not null,
  label text not null,
  reliability_score numeric default null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists evidence_records (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  source_id text references evidence_sources(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  evidence_type text not null,
  label text not null,
  value_numeric numeric null,
  value_text text null,
  value_json jsonb null,
  unit text null,
  observed_at timestamptz not null default now(),
  confidence numeric null,
  source_type text not null check (source_type in ('connected', 'manual', 'inferred', 'calculated')),
  created_at timestamptz not null default now()
);

create table if not exists evidence_links (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  parent_type text not null,
  parent_id text not null,
  evidence_record_id text not null references evidence_records(id) on delete cascade,
  relationship text not null,
  weight numeric default null,
  created_at timestamptz not null default now()
);

create table if not exists evidence_calculation_runs (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  calculation_type text not null,
  target_type text not null,
  target_id text not null,
  engine_version text not null,
  input_hash text null,
  result_json jsonb not null,
  confidence numeric null,
  created_at timestamptz not null default now()
);

create index if not exists evidence_sources_company_idx
  on evidence_sources (company_id);

create index if not exists evidence_sources_workspace_idx
  on evidence_sources (workspace_id);

create index if not exists evidence_sources_created_idx
  on evidence_sources (created_at desc);

create index if not exists evidence_records_company_idx
  on evidence_records (company_id);

create index if not exists evidence_records_workspace_idx
  on evidence_records (workspace_id);

create index if not exists evidence_records_entity_idx
  on evidence_records (entity_type, entity_id);

create index if not exists evidence_records_created_idx
  on evidence_records (created_at desc);

create index if not exists evidence_links_company_idx
  on evidence_links (company_id);

create index if not exists evidence_links_workspace_idx
  on evidence_links (workspace_id);

create index if not exists evidence_links_parent_idx
  on evidence_links (parent_type, parent_id);

create index if not exists evidence_links_record_idx
  on evidence_links (evidence_record_id);

create index if not exists evidence_links_created_idx
  on evidence_links (created_at desc);

create index if not exists evidence_calculation_runs_company_idx
  on evidence_calculation_runs (company_id);

create index if not exists evidence_calculation_runs_workspace_idx
  on evidence_calculation_runs (workspace_id);

create index if not exists evidence_calculation_runs_target_idx
  on evidence_calculation_runs (calculation_type, target_id);

create index if not exists evidence_calculation_runs_created_idx
  on evidence_calculation_runs (created_at desc);

alter table evidence_sources enable row level security;
alter table evidence_records enable row level security;
alter table evidence_links enable row level security;
alter table evidence_calculation_runs enable row level security;

drop policy if exists "company members can read evidence sources" on evidence_sources;
create policy "company members can read evidence sources"
  on evidence_sources for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create evidence sources" on evidence_sources;
create policy "decision users can create evidence sources"
  on evidence_sources for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update evidence sources" on evidence_sources;
create policy "decision users can update evidence sources"
  on evidence_sources for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read evidence records" on evidence_records;
create policy "company members can read evidence records"
  on evidence_records for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create evidence records" on evidence_records;
create policy "decision users can create evidence records"
  on evidence_records for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update evidence records" on evidence_records;
create policy "decision users can update evidence records"
  on evidence_records for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read evidence links" on evidence_links;
create policy "company members can read evidence links"
  on evidence_links for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create evidence links" on evidence_links;
create policy "decision users can create evidence links"
  on evidence_links for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update evidence links" on evidence_links;
create policy "decision users can update evidence links"
  on evidence_links for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read evidence calculation runs" on evidence_calculation_runs;
create policy "company members can read evidence calculation runs"
  on evidence_calculation_runs for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create evidence calculation runs" on evidence_calculation_runs;
create policy "decision users can create evidence calculation runs"
  on evidence_calculation_runs for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "decision users can update evidence calculation runs" on evidence_calculation_runs;
create policy "decision users can update evidence calculation runs"
  on evidence_calculation_runs for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );
