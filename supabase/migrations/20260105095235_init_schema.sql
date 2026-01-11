-- Migration: init_schema
-- Creates HR attendance schema tables and triggers
-- Run: supabase db push

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
create extension if not exists pgcrypto;

-- =============================================================================
-- 1. DIVISIONS
-- =============================================================================
create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  lead_employee_id uuid null -- FK added after employees table exists
);

comment on table public.divisions is 'Company divisions/departments';
comment on column public.divisions.lead_employee_id is 'Division lead (FK to employees, added via alter)';

-- =============================================================================
-- 2. EMPLOYEES
-- =============================================================================
create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  division_id uuid null references public.divisions(id) on delete set null,
  role text not null default 'employee' check (role in ('employee', 'lead', 'hr', 'owner')),
  fingerprint_external_id text null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.employees is 'Employee profiles linked to auth.users';
comment on column public.employees.role is 'Role: employee, lead, hr, owner';
comment on column public.employees.fingerprint_external_id is 'External fingerprint device ID';

-- Now add the FK from divisions.lead_employee_id to employees.id
alter table public.divisions
  add constraint fk_divisions_lead_employee
  foreign key (lead_employee_id)
  references public.employees(id)
  on delete set null
  deferrable initially deferred;

-- =============================================================================
-- 3. ATTENDANCE_LOGS
-- =============================================================================
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  ts timestamptz not null,
  event_type text null check (event_type in ('IN', 'OUT', 'RAW')),
  source text not null check (source in ('fingerprint', 'outside', 'manual', 'import')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  
  -- Dedupe constraint: same employee, timestamp, source
  unique (employee_id, ts, source)
);

comment on table public.attendance_logs is 'Raw attendance check-in/out logs';
comment on column public.attendance_logs.event_type is 'IN, OUT, or RAW (unknown)';
comment on column public.attendance_logs.source is 'fingerprint, outside, manual, import';

-- Index for efficient queries by employee and time range
create index idx_attendance_logs_employee_ts 
  on public.attendance_logs (employee_id, ts);

-- =============================================================================
-- 4. ATTENDANCE_DAILY
-- =============================================================================
create table public.attendance_daily (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  check_in timestamptz null,
  check_out timestamptz null,
  late_minutes int not null default 0,
  is_late boolean not null default false,
  is_penalized boolean not null default false,
  penalty_amount int not null default 0,
  computed_at timestamptz null,
  
  -- One record per employee per day
  unique (employee_id, date)
);

comment on table public.attendance_daily is 'Daily aggregated attendance records';
comment on column public.attendance_daily.computed_at is 'When this record was last computed';

-- Index for queries by date
create index idx_attendance_daily_date 
  on public.attendance_daily (date);

-- =============================================================================
-- 5. ATTENDANCE_IMPORT_BATCHES
-- =============================================================================
create table public.attendance_import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.employees(id) on delete restrict,
  file_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'committed', 'failed')),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.attendance_import_batches is 'Batch import tracking for attendance data';
comment on column public.attendance_import_batches.status is 'uploaded, parsed, committed, failed';
comment on column public.attendance_import_batches.stats is 'Import statistics (rows_total, rows_imported, errors, etc)';

-- =============================================================================
-- 6. TRIGGER: Auto-create employee on auth.users insert
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.employees (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'employee'
  )
  on conflict (id) do nothing;
  
  return new;
end;
$$;

-- Trigger on auth.users insert
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is 'Auto-creates employee record when auth user is created';

-- =============================================================================
-- 7. BACKFILL: Ensure existing auth.users have employee records
-- =============================================================================
insert into public.employees (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  'employee'
from auth.users u
left join public.employees e on e.id = u.id
where e.id is null;
