-- A6: one evidence artifact can verify recovery once, atomically with balances.
alter table public.artifacts
  add constraint artifacts_id_case_user_unique unique (id, case_id, user_id);

create table public.recovery_verifications (
  artifact_id uuid primary key,
  case_id uuid not null,
  user_id uuid not null,
  credit_paise bigint not null check (credit_paise >= 0),
  applied_paise bigint not null check (applied_paise >= 0 and applied_paise <= credit_paise),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  allocations jsonb not null check (jsonb_typeof(allocations) = 'array'),
  outcome text not null check (outcome in ('missing', 'partial', 'full')),
  created_at timestamptz not null default now(),
  foreign key (artifact_id, case_id, user_id)
    references public.artifacts (id, case_id, user_id) on delete cascade,
  foreign key (case_id, user_id)
    references public.cases (id, user_id) on delete cascade
);

create index recovery_verifications_user_case_idx
  on public.recovery_verifications (user_id, case_id, created_at);

alter table public.recovery_verifications enable row level security;
create policy recovery_verifications_select_own on public.recovery_verifications
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.recovery_verifications from public, anon, authenticated;
grant select on public.recovery_verifications to authenticated;
grant all on public.recovery_verifications to service_role;

create function public.apply_recovery_verification(
  p_user_id uuid,
  p_case_id uuid,
  p_artifact_id uuid,
  p_credit_paise bigint,
  p_evidence jsonb,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_artifact public.artifacts%rowtype;
  v_existing public.recovery_verifications%rowtype;
  v_obligation public.recovery_obligations%rowtype;
  v_item jsonb;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_expected bigint;
  v_applied bigint;
  v_total bigint := 0;
  v_remaining bigint;
  v_outcome text;
  v_next_status text;
begin
  if p_credit_paise is null or p_credit_paise < 0 or
     jsonb_typeof(p_evidence) is distinct from 'object' or
     jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'Invalid recovery verification input';
  end if;

  select * into v_case from public.cases
    where id = p_case_id and user_id = p_user_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_case.status not in ('AWAITING_RECOVERY', 'ESCALATED', 'RECOVERY_VERIFICATION') then
    raise exception 'Case is not awaiting recovery';
  end if;

  select * into v_artifact from public.artifacts
    where id = p_artifact_id and case_id = p_case_id and user_id = p_user_id;
  if not found or v_artifact.type not in ('credit_note', 'corrected_invoice') then
    raise exception 'Recovery evidence not found';
  end if;

  select * into v_existing from public.recovery_verifications
    where artifact_id = p_artifact_id;
  if found then
    if v_existing.case_id <> p_case_id or v_existing.user_id <> p_user_id then
      raise exception 'Recovery evidence belongs to another case';
    end if;
    return jsonb_build_object(
      'artifactId', p_artifact_id,
      'caseId', p_case_id,
      'creditPaise', v_existing.credit_paise,
      'appliedPaise', v_existing.applied_paise,
      'outstandingPaise', v_case.outstanding_paise,
      'caseState', v_case.status,
      'outcome', v_existing.outcome,
      'alreadyApplied', true
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    if jsonb_typeof(v_item) <> 'object' or
       not (v_item ? 'id' and v_item ? 'expectedOutstandingPaise' and v_item ? 'appliedPaise') then
      raise exception 'Invalid obligation allocation';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    v_expected := (v_item ->> 'expectedOutstandingPaise')::bigint;
    v_applied := (v_item ->> 'appliedPaise')::bigint;
    if v_id = any(v_seen) or v_expected < 0 or v_applied < 0 then
      raise exception 'Duplicate or negative obligation allocation';
    end if;
    v_seen := array_append(v_seen, v_id);
    select * into v_obligation from public.recovery_obligations
      where id = v_id and case_id = p_case_id and user_id = p_user_id for update;
    if not found or v_obligation.outstanding_paise <> v_expected or v_applied > v_expected then
      raise exception 'Obligation balance changed; retry verification';
    end if;
    v_total := v_total + v_applied;
    if v_total > p_credit_paise then raise exception 'Allocations exceed verified credit'; end if;
    if v_applied > 0 then
      update public.recovery_obligations
      set recovered_paise = recovered_paise + v_applied,
          outstanding_paise = outstanding_paise - v_applied,
          status = case when outstanding_paise = v_applied then 'RECOVERED' else 'PARTIALLY_RECOVERED' end,
          resolved_at = case when outstanding_paise = v_applied then now() else null end
      where id = v_id and case_id = p_case_id and user_id = p_user_id;
    end if;
  end loop;

  if v_total > v_case.outstanding_paise or
     v_case.recovered_paise + v_total > v_case.potential_recovery_paise then
    raise exception 'Verified recovery exceeds case balance';
  end if;
  v_remaining := v_case.outstanding_paise - v_total;
  v_outcome := case
    when v_total = 0 then 'missing'
    when v_remaining = 0 then 'full'
    else 'partial'
  end;
  v_next_status := case
    when v_remaining = 0 and v_total > 0 then 'RESOLVED'
    when v_total > 0 then 'AWAITING_RECOVERY'
    else v_case.status
  end;

  insert into public.recovery_verifications
    (artifact_id, case_id, user_id, credit_paise, applied_paise, evidence, allocations, outcome)
  values
    (p_artifact_id, p_case_id, p_user_id, p_credit_paise, v_total,
     p_evidence, p_allocations, v_outcome);

  update public.cases
  set recovered_paise = recovered_paise + v_total,
      outstanding_paise = outstanding_paise - v_total,
      status = v_next_status,
      resolved_at = case when v_next_status = 'RESOLVED' then now() else resolved_at end,
      updated_at = now()
  where id = p_case_id and user_id = p_user_id;

  insert into public.case_events (case_id, user_id, event_type, payload)
  values (p_case_id, p_user_id, 'recovery_evidence_checked',
    jsonb_build_object('summary', 'New recovery evidence checked', 'status', 'success',
      'details', jsonb_build_object('artifactId', p_artifact_id)));
  if v_total > 0 then
    insert into public.case_events (case_id, user_id, event_type, payload)
    values (p_case_id, p_user_id, 'credit_verified',
      jsonb_build_object('summary', 'Credit verified against open obligations',
        'status', 'success', 'details', jsonb_build_object('appliedPaise', v_total)));
  end if;
  if v_remaining > 0 then
    insert into public.case_events (case_id, user_id, event_type, payload)
    values (p_case_id, p_user_id, 'recovery_outstanding',
      jsonb_build_object('summary', 'Balance remains outstanding',
        'status', 'success', 'details', jsonb_build_object('outstandingPaise', v_remaining)));
  elsif v_next_status = 'RESOLVED' then
    insert into public.case_events (case_id, user_id, event_type, payload)
    values (p_case_id, p_user_id, 'case_closed',
      jsonb_build_object('summary', 'Verified recovery complete; case closed', 'status', 'success'));
  end if;

  return jsonb_build_object(
    'artifactId', p_artifact_id,
    'caseId', p_case_id,
    'creditPaise', p_credit_paise,
    'appliedPaise', v_total,
    'outstandingPaise', v_remaining,
    'caseState', v_next_status,
    'outcome', v_outcome,
    'alreadyApplied', false
  );
end;
$$;

revoke all on function public.apply_recovery_verification(uuid, uuid, uuid, bigint, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_recovery_verification(uuid, uuid, uuid, bigint, jsonb, jsonb)
  to service_role;
