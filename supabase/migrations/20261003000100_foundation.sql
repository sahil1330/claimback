-- A1: merchant-owned core tables. Monetary amounts are integer paise.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  business_type text,
  preferred_locale text not null default 'en-IN',
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid,
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'EVIDENCE_CAPTURED', 'RECONCILED', 'NO_DISCREPANCY',
    'DISCREPANCY_FOUND', 'AWAITING_MERCHANT_APPROVAL', 'CLAIM_SENT',
    'AWAITING_SUPPLIER', 'SUPPLIER_RESPONDED', 'AWAITING_RECOVERY',
    'RECOVERY_VERIFICATION', 'RESOLVED', 'ESCALATED'
  )),
  title text,
  promised jsonb not null default '{}'::jsonb check (jsonb_typeof(promised) = 'object'),
  billed jsonb not null default '{}'::jsonb check (jsonb_typeof(billed) = 'object'),
  received jsonb not null default '{}'::jsonb check (jsonb_typeof(received) = 'object'),
  discrepancies jsonb not null default '[]'::jsonb check (jsonb_typeof(discrepancies) = 'array'),
  potential_recovery_paise bigint not null default 0 check (potential_recovery_paise >= 0),
  recovered_paise bigint not null default 0 check (recovered_paise >= 0),
  outstanding_paise bigint not null default 0 check (outstanding_paise >= 0),
  merchant_approved_at timestamptz,
  claim_sent_at timestamptz,
  next_follow_up_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (supplier_id, user_id) references public.suppliers(id, user_id),
  check (recovered_paise + outstanding_paise <= potential_recovery_paise)
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  type text not null check (type in (
    'invoice', 'agreement', 'receiving_photo', 'damage_photo',
    'credit_note', 'corrected_invoice', 'other'
  )),
  storage_path text not null,
  mime_type text,
  original_name text,
  extracted jsonb,
  extraction_status text not null default 'pending' check (
    extraction_status in ('pending', 'processing', 'complete', 'needs_confirmation', 'failed')
  ),
  created_at timestamptz not null default now(),
  foreign key (case_id, user_id) references public.cases(id, user_id) on delete cascade,
  unique (storage_path),
  check (
    split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = case_id::text
    and split_part(storage_path, '/', 3) like id::text || '-%'
  )
);

create table public.supplier_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  body text not null,
  parsed jsonb,
  source text,
  created_at timestamptz not null default now(),
  foreign key (case_id, user_id) references public.cases(id, user_id) on delete cascade
);

create table public.recovery_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  supplier_id uuid not null,
  original_amount_paise bigint not null check (original_amount_paise > 0),
  recovered_paise bigint not null default 0 check (recovered_paise >= 0),
  outstanding_paise bigint not null check (outstanding_paise >= 0),
  promise_text text,
  promised_for text,
  status text not null default 'OPEN' check (
    status in ('OPEN', 'PARTIALLY_RECOVERED', 'RECOVERED', 'DISPUTED')
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (case_id, user_id) references public.cases(id, user_id) on delete cascade,
  foreign key (supplier_id, user_id) references public.suppliers(id, user_id),
  check (original_amount_paise = recovered_paise + outstanding_paise)
);

create table public.case_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (case_id, user_id) references public.cases(id, user_id) on delete cascade
);

create index suppliers_user_id_idx on public.suppliers(user_id);
create index cases_user_status_idx on public.cases(user_id, status);
create index artifacts_user_case_idx on public.artifacts(user_id, case_id);
create index supplier_messages_user_case_idx on public.supplier_messages(user_id, case_id);
create index recovery_obligations_user_status_idx on public.recovery_obligations(user_id, status);
create index case_events_user_case_created_idx on public.case_events(user_id, case_id, created_at);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, business_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'business_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

-- Existing Auth users also get a profile when this migration first runs.
insert into public.profiles (id, business_name)
select id, nullif(raw_user_meta_data ->> 'business_name', '')
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.cases enable row level security;
alter table public.artifacts enable row level security;
alter table public.supplier_messages enable row level security;
alter table public.recovery_obligations enable row level security;
alter table public.case_events enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy suppliers_select_own on public.suppliers for select to authenticated
using (user_id = (select auth.uid()));
create policy suppliers_insert_own on public.suppliers for insert to authenticated
with check (user_id = (select auth.uid()));
create policy suppliers_update_own on public.suppliers for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy suppliers_delete_own on public.suppliers for delete to authenticated
using (user_id = (select auth.uid()));

create policy cases_select_own on public.cases for select to authenticated
using (user_id = (select auth.uid()));
create policy cases_insert_own on public.cases for insert to authenticated
with check (user_id = (select auth.uid()));
create policy cases_update_own on public.cases for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cases_delete_own on public.cases for delete to authenticated
using (user_id = (select auth.uid()));

create policy artifacts_select_own on public.artifacts for select to authenticated
using (user_id = (select auth.uid()));
create policy artifacts_insert_own on public.artifacts for insert to authenticated
with check (user_id = (select auth.uid()));
create policy artifacts_update_own on public.artifacts for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy artifacts_delete_own on public.artifacts for delete to authenticated
using (user_id = (select auth.uid()));

create policy supplier_messages_select_own on public.supplier_messages for select to authenticated
using (user_id = (select auth.uid()));
create policy supplier_messages_insert_own on public.supplier_messages for insert to authenticated
with check (user_id = (select auth.uid()));

create policy recovery_obligations_select_own on public.recovery_obligations for select to authenticated
using (user_id = (select auth.uid()));
create policy recovery_obligations_insert_own on public.recovery_obligations for insert to authenticated
with check (user_id = (select auth.uid()));
create policy recovery_obligations_update_own on public.recovery_obligations for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Case events are append-only to authenticated merchants.
create policy case_events_select_own on public.case_events for select to authenticated
using (user_id = (select auth.uid()));
create policy case_events_insert_own on public.case_events for insert to authenticated
with check (user_id = (select auth.uid()));

revoke all on public.profiles, public.suppliers, public.cases, public.artifacts,
  public.supplier_messages, public.recovery_obligations, public.case_events from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.suppliers, public.cases, public.artifacts to authenticated;
grant select, insert on public.supplier_messages, public.case_events to authenticated;
grant select, insert, update on public.recovery_obligations to authenticated;
grant usage, select on sequence public.case_events_id_seq to authenticated;

-- Evidence is private and scoped to {user_id}/{case_id}/{artifact_id}-{filename}.
insert into storage.buckets (id, name, public, file_size_limit)
values ('claimback-evidence', 'claimback-evidence', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy evidence_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'claimback-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);
create policy evidence_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'claimback-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);
create policy evidence_update_own on storage.objects for update to authenticated
using (
  bucket_id = 'claimback-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'claimback-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);
create policy evidence_delete_own on storage.objects for delete to authenticated
using (
  bucket_id = 'claimback-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.cases c
    where c.id::text = (storage.foldername(name))[2]
      and c.user_id = (select auth.uid())
  )
);
