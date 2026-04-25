# PMS

## Environment

Set these values in local `.env.local` and in Vercel before deploying:

```sh
VITE_SUPABASE_URL=https://cbzhxbpccijwgazwpayi.supabase.co
VITE_SUPABASE_ANON_KEY=your Supabase anon/public key
```

The app builds Supabase Edge Function URLs from `VITE_SUPABASE_URL`, so Manager
Report, Owner Report, invoices, payments, calendar sync, and other function
calls all target the same Supabase project.

If the Supabase project is being recreated, also run:

```sh
supabase/migrations/20260425153500_restore_report_tables.sql
```

That restores the `manager_reports`, `owner_reports`, and `exchange_rates`
tables used by the report screens.
