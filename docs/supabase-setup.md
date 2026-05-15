# Supabase Setup

This app runs in demo JSON mode until Supabase environment values are present.
When the values are configured, Auretix uses Supabase Auth plus the Postgres
tables in `db/schema.sql`.

## 1. Create the Supabase project

Create a Supabase project, then create `.env.local` from `.env.example` and
paste these values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service role key is used only by server-side route handlers so the app can
create company/user/workspace records after the request context has passed app
permission checks. Do not expose it in client components.

In Supabase, the values usually live under:

- Project Settings -> API -> Project URL
- Project Settings -> API -> anon public key
- Project Settings -> API -> service_role key

## 2. Create the database schema

Open the Supabase SQL editor and run:

```sql
-- Paste the contents of db/schema.sql here.
```

The schema creates:

- `companies`
- `users`
- `workspaces`
- `decision_runs`
- `audit_events`
- Row-level security policies for company-scoped access

After running the SQL, verify the connection from this repo:

```bash
npm run supabase:check
```

If the check reports missing tables, rerun `db/schema.sql` in the Supabase SQL
editor and try again.

## 3. Configure auth redirects

In Supabase Auth settings, add the local redirect URL:

```text
http://localhost:3025/auth/callback
```

Add the production callback URL when the app is deployed:

```text
https://your-domain.com/auth/callback
```

## 4. Invite or bootstrap users

The first signed-in user is mapped from Supabase user metadata:

```json
{
  "company_id": "company_acme",
  "company_name": "Acme Supply Co",
  "company_slug": "acme",
  "role": "owner",
  "name": "Acme Owner"
}
```

If metadata is missing, Auretix creates a company id from the Supabase user id
and assigns the user the `owner` role for the first workspace.

## 5. Local run

Restart the dev server after changing `.env.local`:

```bash
npm run dev -- -p 3025
```

Then open:

```text
http://localhost:3025/login
```
