create extension if not exists pgcrypto;

create table if not exists public.manager_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  month text not null,
  start_date date not null,
  end_date date not null,
  avg_rate numeric,
  fee_percent numeric not null default 5,
  usd_cash_total numeric not null default 0,
  dop_cash_total numeric not null default 0,
  usd_transfer_total numeric not null default 0,
  dop_transfer_total numeric not null default 0,
  usd_total numeric not null default 0,
  dop_total numeric not null default 0,
  fee_base_dop numeric not null default 0,
  fee_dop numeric not null default 0,
  fee_deducted_dop numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.owner_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,
  start_date date not null,
  end_date date not null,
  avg_rate numeric,
  usd_cash_total numeric not null default 0,
  dop_cash_total numeric not null default 0,
  usd_transfer_total numeric not null default 0,
  dop_transfer_total numeric not null default 0,
  usd_total numeric not null default 0,
  dop_total numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  base_currency text not null,
  target_currency text not null,
  rate numeric not null,
  created_at timestamptz default now(),
  unique (date, base_currency, target_currency)
);

create index if not exists manager_reports_agency_period_idx
  on public.manager_reports (agency_id, start_date desc, end_date desc);

create index if not exists owner_reports_agency_owner_period_idx
  on public.owner_reports (agency_id, owner_id, start_date desc, end_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_manager_reports_updated_at on public.manager_reports;
create trigger set_manager_reports_updated_at
before update on public.manager_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_owner_reports_updated_at on public.owner_reports;
create trigger set_owner_reports_updated_at
before update on public.owner_reports
for each row execute function public.set_updated_at();

alter table public.manager_reports enable row level security;
alter table public.owner_reports enable row level security;
alter table public.exchange_rates enable row level security;

drop policy if exists "agency admins manage manager reports" on public.manager_reports;
create policy "agency admins manage manager reports"
on public.manager_reports
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'agency_admin'
      and p.agency_id = manager_reports.agency_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'agency_admin'
      and p.agency_id = manager_reports.agency_id
  )
);

drop policy if exists "agency admins and owners read owner reports" on public.owner_reports;
create policy "agency admins and owners read owner reports"
on public.owner_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.agency_id = owner_reports.agency_id
      and (
        p.role = 'agency_admin'
        or (p.role = 'owner' and owner_reports.owner_id = auth.uid())
      )
  )
);

drop policy if exists "agency admins manage owner reports" on public.owner_reports;
create policy "agency admins manage owner reports"
on public.owner_reports
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'agency_admin'
      and p.agency_id = owner_reports.agency_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'agency_admin'
      and p.agency_id = owner_reports.agency_id
  )
);

drop policy if exists "authenticated users can read exchange rates" on public.exchange_rates;
create policy "authenticated users can read exchange rates"
on public.exchange_rates
for select
to authenticated
using (true);
