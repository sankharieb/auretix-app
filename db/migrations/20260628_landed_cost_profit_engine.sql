-- Auretix landed-cost / true-profit foundation.
-- This migration models seller operating costs as provenance-aware events that
-- belong to the existing Auretix company/workspace tenant model.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'auretix_cost_source') then
    create type auretix_cost_source as enum ('connected', 'manual', 'inferred');
  end if;

  if not exists (select 1 from pg_type where typname = 'auretix_cost_event_grain') then
    create type auretix_cost_event_grain as enum ('sku', 'shipment', 'period');
  end if;

  if not exists (select 1 from pg_type where typname = 'auretix_cost_allocation_method') then
    create type auretix_cost_allocation_method as enum (
      'by_units',
      'by_value',
      'by_volume',
      'by_weight',
      'direct'
    );
  end if;
end
$$;

create table if not exists products (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  sku text not null,
  title text not null,
  source auretix_cost_source not null default 'manual',
  created_at timestamptz not null default now(),
  unique (company_id, sku)
);

create table if not exists shipments (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  reference text not null,
  origin text,
  destination text,
  ship_date date,
  arrival_date date,
  sellable_date date,
  source auretix_cost_source not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists shipment_lines (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  shipment_id text not null references shipments(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  unit_value numeric(14, 2) not null default 0 check (unit_value >= 0),
  source auretix_cost_source not null default 'manual',
  created_at timestamptz not null default now(),
  unique (shipment_id, product_id)
);

create table if not exists cost_levels (
  id integer primary key check (id >= 1 and id <= 10),
  label text not null unique
);

create table if not exists cost_categories (
  id text primary key,
  level_id integer not null references cost_levels(id) on delete restrict,
  code text not null,
  label text not null,
  created_at timestamptz not null default now(),
  unique (level_id, code)
);

create table if not exists cost_events (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  category_id text not null references cost_categories(id) on delete restrict,
  amount numeric(14, 2) not null,
  currency text not null default 'USD',
  event_date date not null,
  grain auretix_cost_event_grain not null,
  product_id text references products(id) on delete cascade,
  shipment_id text references shipments(id) on delete cascade,
  period_start date,
  period_end date,
  allocation_method auretix_cost_allocation_method not null default 'by_units',
  source auretix_cost_source not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  constraint cost_events_grain_target_check check (
    (grain = 'sku' and product_id is not null)
    or (grain = 'shipment' and shipment_id is not null)
    or (grain = 'period' and period_start is not null and period_end is not null)
  ),
  constraint cost_events_period_order_check check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

create table if not exists revenue_events (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  workspace_id text references workspaces(id) on delete set null,
  product_id text not null references products(id) on delete cascade,
  amount numeric(14, 2) not null,
  event_date date not null,
  channel text not null,
  units integer not null default 0 check (units >= 0),
  source auretix_cost_source not null default 'manual',
  created_at timestamptz not null default now()
);

insert into cost_levels (id, label)
values
  (1, 'Revenue'),
  (2, 'Product Cost'),
  (3, 'Transportation'),
  (4, 'Warehouse'),
  (5, 'Marketplace Fees'),
  (6, 'Marketing'),
  (7, 'Customer Cost'),
  (8, 'Operational'),
  (9, 'Labor'),
  (10, 'Overhead')
on conflict (id) do update set label = excluded.label;

insert into cost_categories (id, level_id, code, label)
values
  ('cost_category_gross_sales', 1, 'gross_sales', 'Gross sales'),
  ('cost_category_discounts', 1, 'discounts', 'Discounts'),
  ('cost_category_refunds', 1, 'refunds', 'Refunds'),

  ('cost_category_manufacturing_cost', 2, 'manufacturing_cost', 'Manufacturing cost'),
  ('cost_category_purchase_price', 2, 'purchase_price', 'Purchase price'),
  ('cost_category_packaging', 2, 'packaging', 'Packaging'),
  ('cost_category_labels', 2, 'labels', 'Labels'),
  ('cost_category_prep', 2, 'prep', 'Prep'),
  ('cost_category_inspection', 2, 'inspection', 'Inspection'),
  ('cost_category_duties', 2, 'duties', 'Duties'),
  ('cost_category_customs', 2, 'customs', 'Customs'),
  ('cost_category_tariffs', 2, 'tariffs', 'Tariffs'),

  ('cost_category_ocean_freight', 3, 'ocean_freight', 'Ocean freight'),
  ('cost_category_air_freight', 3, 'air_freight', 'Air freight'),
  ('cost_category_trucking', 3, 'trucking', 'Trucking'),
  ('cost_category_freight_forwarder', 3, 'freight_forwarder', 'Freight forwarder'),
  ('cost_category_port_fees', 3, 'port_fees', 'Port fees'),
  ('cost_category_container_charges', 3, 'container_charges', 'Container charges'),
  ('cost_category_demurrage', 3, 'demurrage', 'Demurrage'),
  ('cost_category_fuel_surcharge', 3, 'fuel_surcharge', 'Fuel surcharge'),
  ('cost_category_customs_broker', 3, 'customs_broker', 'Customs broker'),
  ('cost_category_freight_insurance', 3, 'freight_insurance', 'Freight insurance'),
  ('cost_category_last_mile', 3, 'last_mile', 'Last mile'),

  ('cost_category_warehouse_storage', 4, 'warehouse_storage', 'Warehouse storage'),
  ('cost_category_receiving', 4, 'receiving', 'Receiving'),
  ('cost_category_pick_pack', 4, 'pick_pack', 'Pick and pack'),
  ('cost_category_pallet_storage', 4, 'pallet_storage', 'Pallet storage'),

  ('cost_category_amazon_referral', 5, 'amazon_referral', 'Amazon referral'),
  ('cost_category_fba_fulfillment', 5, 'fba_fulfillment', 'FBA fulfillment'),
  ('cost_category_low_inventory_fee', 5, 'low_inventory_fee', 'Low inventory fee'),
  ('cost_category_placement_fee', 5, 'placement_fee', 'Placement fee'),
  ('cost_category_peak_surcharge', 5, 'peak_surcharge', 'Peak surcharge'),
  ('cost_category_returns_processing', 5, 'returns_processing', 'Returns processing'),
  ('cost_category_removal', 5, 'removal', 'Removal'),
  ('cost_category_disposal', 5, 'disposal', 'Disposal'),
  ('cost_category_aged_inventory_surcharge', 5, 'aged_inventory_surcharge', 'Aged inventory surcharge'),
  ('cost_category_awd_transfer', 5, 'awd_transfer', 'AWD transfer'),
  ('cost_category_shopify_payment', 5, 'shopify_payment', 'Shopify payment'),
  ('cost_category_shopify_fee', 5, 'shopify_fee', 'Shopify fee'),
  ('cost_category_shipping_labels', 5, 'shipping_labels', 'Shipping labels'),
  ('cost_category_walmart_referral', 5, 'walmart_referral', 'Walmart referral'),
  ('cost_category_wfs_fee', 5, 'wfs_fee', 'WFS fee'),

  ('cost_category_ads_spend', 6, 'ads_spend', 'Advertising spend'),
  ('cost_category_promotions', 6, 'promotions', 'Promotions'),
  ('cost_category_creative', 6, 'creative', 'Creative'),
  ('cost_category_affiliate_commission', 6, 'affiliate_commission', 'Affiliate commission'),

  ('cost_category_customer_support', 7, 'customer_support', 'Customer support'),
  ('cost_category_chargebacks', 7, 'chargebacks', 'Chargebacks'),
  ('cost_category_reshipments', 7, 'reshipments', 'Reshipments'),
  ('cost_category_warranty_claims', 7, 'warranty_claims', 'Warranty claims'),

  ('cost_category_software', 8, 'software', 'Software'),
  ('cost_category_insurance', 8, 'insurance', 'Insurance'),
  ('cost_category_bank_fees', 8, 'bank_fees', 'Bank fees'),
  ('cost_category_subscriptions', 8, 'subscriptions', 'Subscriptions'),

  ('cost_category_operator_labor', 9, 'operator_labor', 'Operator labor'),
  ('cost_category_contractor_labor', 9, 'contractor_labor', 'Contractor labor'),
  ('cost_category_management_labor', 9, 'management_labor', 'Management labor'),

  ('cost_category_rent', 10, 'rent', 'Rent'),
  ('cost_category_utilities', 10, 'utilities', 'Utilities'),
  ('cost_category_professional_services', 10, 'professional_services', 'Professional services'),
  ('cost_category_admin_overhead', 10, 'admin_overhead', 'Admin overhead')
on conflict (level_id, code) do update set
  id = excluded.id,
  label = excluded.label;

create index if not exists products_company_sku_idx
  on products (company_id, sku);

create index if not exists products_workspace_sku_idx
  on products (workspace_id, sku);

create index if not exists shipments_company_reference_idx
  on shipments (company_id, reference);

create index if not exists shipments_workspace_reference_idx
  on shipments (workspace_id, reference);

create index if not exists shipment_lines_company_product_idx
  on shipment_lines (company_id, product_id);

create index if not exists shipment_lines_company_shipment_idx
  on shipment_lines (company_id, shipment_id);

create index if not exists cost_categories_level_code_idx
  on cost_categories (level_id, code);

create index if not exists cost_events_company_product_date_idx
  on cost_events (company_id, product_id, event_date);

create index if not exists cost_events_company_shipment_date_idx
  on cost_events (company_id, shipment_id, event_date);

create index if not exists cost_events_workspace_period_idx
  on cost_events (workspace_id, period_start, period_end);

create index if not exists revenue_events_company_product_date_idx
  on revenue_events (company_id, product_id, event_date);

create index if not exists revenue_events_workspace_product_date_idx
  on revenue_events (workspace_id, product_id, event_date);

alter table products enable row level security;
alter table shipments enable row level security;
alter table shipment_lines enable row level security;
alter table cost_levels enable row level security;
alter table cost_categories enable row level security;
alter table cost_events enable row level security;
alter table revenue_events enable row level security;

drop policy if exists "authenticated users can read cost levels" on cost_levels;
create policy "authenticated users can read cost levels"
  on cost_levels for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated users can read cost categories" on cost_categories;
create policy "authenticated users can read cost categories"
  on cost_categories for select
  using (auth.role() = 'authenticated');

drop policy if exists "company members can read products" on products;
create policy "company members can read products"
  on products for select
  using (company_id = current_auretix_company_id());

drop policy if exists "company operators can insert products" on products;
create policy "company operators can insert products"
  on products for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company operators can update products" on products;
create policy "company operators can update products"
  on products for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read shipments" on shipments;
create policy "company members can read shipments"
  on shipments for select
  using (company_id = current_auretix_company_id());

drop policy if exists "company operators can insert shipments" on shipments;
create policy "company operators can insert shipments"
  on shipments for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company operators can update shipments" on shipments;
create policy "company operators can update shipments"
  on shipments for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read shipment lines" on shipment_lines;
create policy "company members can read shipment lines"
  on shipment_lines for select
  using (company_id = current_auretix_company_id());

drop policy if exists "company operators can insert shipment lines" on shipment_lines;
create policy "company operators can insert shipment lines"
  on shipment_lines for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company operators can update shipment lines" on shipment_lines;
create policy "company operators can update shipment lines"
  on shipment_lines for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read cost events" on cost_events;
create policy "company members can read cost events"
  on cost_events for select
  using (company_id = current_auretix_company_id());

drop policy if exists "company operators can insert cost events" on cost_events;
create policy "company operators can insert cost events"
  on cost_events for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company operators can update cost events" on cost_events;
create policy "company operators can update cost events"
  on cost_events for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company members can read revenue events" on revenue_events;
create policy "company members can read revenue events"
  on revenue_events for select
  using (company_id = current_auretix_company_id());

drop policy if exists "company operators can insert revenue events" on revenue_events;
create policy "company operators can insert revenue events"
  on revenue_events for insert
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );

drop policy if exists "company operators can update revenue events" on revenue_events;
create policy "company operators can update revenue events"
  on revenue_events for update
  using (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  )
  with check (
    company_id = current_auretix_company_id()
    and current_auretix_role() in ('owner', 'admin', 'operator', 'finance')
  );
