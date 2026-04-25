# PMS

## Environment

Set these values in local `.env.local` and in Vercel before deploying:

```sh
VITE_SUPABASE_URL=https://cbzhxbpccijwgazwpayi.supabase.co
VITE_SUPABASE_ANON_KEY=your Supabase anon/public key
VITE_PMS_JEFF_CODE=your 4 digit Jeff code
VITE_PMS_GAEL_CODE=your 4 digit Gael code
VITE_PMS_JEFF_EMAIL=jeff@pms.local
VITE_PMS_GAEL_EMAIL=gael@pms.local
```

The app builds Supabase Edge Function URLs from `VITE_SUPABASE_URL`, so Manager
Report, Owner Report, invoices, payments, calendar sync, and other function
calls all target the same Supabase project.

The PMS Web login uses the Gael/Jeff account selector and a 4 digit code. Vite
also accepts the previous `NEXT_PUBLIC_PMS_JEFF_CODE` and
`NEXT_PUBLIC_PMS_GAEL_CODE` names so existing Vercel environment variables can
continue to work. When older values are longer than 4 digits, the login uses
the first 4 digits. If matching Supabase Auth users exist, the selector uses
the 4 digit code as the password for a real Supabase session; otherwise it
keeps the classic PMS Web local session behavior.

If the Supabase project is being recreated, also run:

```sh
supabase/migrations/20260425153500_restore_report_tables.sql
```

That restores the `manager_reports`, `owner_reports`, and `exchange_rates`
tables used by the report screens.
