# Integrations and ROI Plan

Auretix needs live commerce and accounting data before it can prove ROI rather
than only model it.

## Integration Order

1. Shopify
   - Data: products, orders, inventory, purchase orders.
   - Use: actual sell-through, SKU velocity, reorder timing, and stockout risk.
   - Redirect URL: `http://localhost:3025/api/integrations/callback/shopify`

2. Amazon Seller Central
   - Data: marketplace order velocity, listings, reports, inbound signals.
   - Use: channel-specific revenue-at-risk and marketplace stockout exposure.
   - Redirect URL: `http://localhost:3025/api/integrations/callback/amazon`

3. QuickBooks Online
   - Data: items, vendors, bills, purchase orders, COGS, margin.
   - Use: cash preserved, overbuying avoided, margin protected, vendor exposure.
   - Redirect URL: `http://localhost:3025/api/integrations/callback/quickbooks`

## Environment Values

Add provider credentials to `.env.local` using `.env.example` as the template.
Restart the dev server after changing credentials.

## Supabase Schema

Run `db/schema.sql` again after this feature branch. It now includes:

- `integration_accounts`
- `roi_snapshots`

Then run:

```bash
npm run supabase:check
```

## ROI Proof Ladder

Modeled estimate:
Uses the Auretix decision queue and seeded/imported workspace data.

Evidence building:
Requires Shopify or Amazon order data.

ROI evidence ready:
Requires commerce data plus QuickBooks accounting data and saved decision runs.
