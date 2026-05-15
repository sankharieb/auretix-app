create table if not exists companies (
  id text primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  auth_user_id uuid,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'admin', 'operator', 'finance', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  business_type text not null,
  scenario jsonb not null,
  workspace_state jsonb not null,
  draft_purchase_orders jsonb not null default '[]'::jsonb,
  supplier_packets jsonb not null default '[]'::jsonb,
  supplier_strategy_memory jsonb not null default '{}'::jsonb,
  approved_reallocation_plans jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists decision_runs (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  trigger text not null,
  scenario jsonb not null,
  decision jsonb not null,
  queue jsonb not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  actor_id text,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists integration_accounts (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete cascade,
  provider text not null check (provider in ('shopify', 'amazon', 'quickbooks')),
  account_label text,
  external_account_id text,
  status text not null default 'authorized',
  scopes text,
  token_status text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, provider, external_account_id)
);

create table if not exists roi_snapshots (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  decision_run_id text references decision_runs(id) on delete set null,
  proof_status text not null,
  proof_score integer not null,
  modeled_monthly_impact integer not null,
  modeled_annual_impact integer not null,
  metrics jsonb not null,
  proof_inputs jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists decision_runs_workspace_created_idx
  on decision_runs (workspace_id, created_at desc);

create index if not exists audit_events_workspace_created_idx
  on audit_events (workspace_id, created_at desc);

create index if not exists integration_accounts_workspace_provider_idx
  on integration_accounts (workspace_id, provider);

create index if not exists roi_snapshots_workspace_created_idx
  on roi_snapshots (workspace_id, created_at desc);

alter table if exists users
  add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_idx
  on users (auth_user_id)
  where auth_user_id is not null;

create or replace function current_auretix_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from users
  where auth_user_id = auth.uid()
  limit 1
$$;

create or replace function current_auretix_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from users
  where auth_user_id = auth.uid()
  limit 1
$$;

alter table companies enable row level security;
alter table users enable row level security;
alter table workspaces enable row level security;
alter table decision_runs enable row level security;
alter table audit_events enable row level security;
alter table integration_accounts enable row level security;
alter table roi_snapshots enable row level security;

drop policy if exists "company members can read company" on companies;
create policy "company members can read company"
  on companies
  for select
  using (id = current_auretix_company_id());

drop policy if exists "company members can read users" on users;
create policy "company members can read users"
  on users
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "admins can manage users" on users;
create policy "admins can manage users"
  on users
  for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin')
  );

drop policy if exists "company members can read workspaces" on workspaces;
create policy "company members can read workspaces"
  on workspaces
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can write workspaces" on workspaces;
create policy "operators can write workspaces"
  on workspaces
  for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  );

drop policy if exists "company members can read decision runs" on decision_runs;
create policy "company members can read decision runs"
  on decision_runs
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create runs" on decision_runs;
create policy "decision users can create runs"
  on decision_runs
  for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read audit events" on audit_events;
create policy "company members can read audit events"
  on audit_events
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can create audit events" on audit_events;
create policy "operators can create audit events"
  on audit_events
  for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read integration accounts" on integration_accounts;
create policy "company members can read integration accounts"
  on integration_accounts
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "operators can manage integration accounts" on integration_accounts;
create policy "operators can manage integration accounts"
  on integration_accounts
  for all
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator')
  );

drop policy if exists "company members can read roi snapshots" on roi_snapshots;
create policy "company members can read roi snapshots"
  on roi_snapshots
  for select
  using (company_id = current_auretix_company_id());

drop policy if exists "decision users can create roi snapshots" on roi_snapshots;
create policy "decision users can create roi snapshots"
  on roi_snapshots
  for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );
