-- Runs inside a transaction and leaves no test rows behind.
begin;
do $$
declare
  v_user uuid;
  v_supplier uuid;
  v_case uuid;
  v_obligation uuid;
  v_missing_artifact uuid;
  v_partial_artifact uuid;
  v_full_artifact uuid;
  v_result jsonb;
  v_case_row public.cases%rowtype;
begin
  select id into v_user from auth.users order by created_at desc limit 1;
  if v_user is null then raise exception 'A test auth user is required'; end if;

  insert into public.suppliers (user_id, name)
  values (v_user, 'Rollback-only recovery test') returning id into v_supplier;
  insert into public.cases (user_id, supplier_id, status, title,
    potential_recovery_paise, outstanding_paise)
  values (v_user, v_supplier, 'AWAITING_RECOVERY', 'Rollback-only recovery test',
    150000, 150000) returning id into v_case;
  insert into public.recovery_obligations (user_id, case_id, supplier_id,
    original_amount_paise, outstanding_paise, promise_text)
  values (v_user, v_case, v_supplier, 150000, 150000,
    'Credit on a later invoice') returning id into v_obligation;

  v_missing_artifact := gen_random_uuid();
  insert into public.artifacts (id, user_id, case_id, type, storage_path)
  values (v_missing_artifact, v_user, v_case, 'corrected_invoice',
    v_user::text || '/' || v_case::text || '/' || v_missing_artifact::text || '-missing.txt');
  v_result := public.apply_recovery_verification(v_user, v_case, v_missing_artifact,
    0, '{"evidenceType":"invoice_no_credit"}'::jsonb, '[]'::jsonb);
  if v_result ->> 'outcome' <> 'missing' or (v_result ->> 'outstandingPaise')::bigint <> 150000 then
    raise exception 'Missing credit changed the case balance';
  end if;

  v_partial_artifact := gen_random_uuid();
  insert into public.artifacts (id, user_id, case_id, type, storage_path)
  values (v_partial_artifact, v_user, v_case, 'credit_note',
    v_user::text || '/' || v_case::text || '/' || v_partial_artifact::text || '-partial.txt');
  v_result := public.apply_recovery_verification(v_user, v_case, v_partial_artifact,
    90000, '{"evidenceType":"credit_note"}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', v_obligation,
      'expectedOutstandingPaise', 150000, 'appliedPaise', 90000)));
  if v_result ->> 'outcome' <> 'partial' or (v_result ->> 'outstandingPaise')::bigint <> 60000 then
    raise exception 'Partial credit balance is incorrect';
  end if;
  v_result := public.apply_recovery_verification(v_user, v_case, v_partial_artifact,
    90000, '{"evidenceType":"credit_note"}'::jsonb, '[]'::jsonb);
  if v_result ->> 'alreadyApplied' <> 'true' then
    raise exception 'Replayed credit was not blocked';
  end if;

  v_full_artifact := gen_random_uuid();
  insert into public.artifacts (id, user_id, case_id, type, storage_path)
  values (v_full_artifact, v_user, v_case, 'credit_note',
    v_user::text || '/' || v_case::text || '/' || v_full_artifact::text || '-full.txt');
  v_result := public.apply_recovery_verification(v_user, v_case, v_full_artifact,
    60000, '{"evidenceType":"credit_note"}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', v_obligation,
      'expectedOutstandingPaise', 60000, 'appliedPaise', 60000)));
  select * into v_case_row from public.cases where id = v_case;
  if v_result ->> 'outcome' <> 'full' or v_case_row.status <> 'RESOLVED' or
     v_case_row.recovered_paise <> 150000 or v_case_row.outstanding_paise <> 0 then
    raise exception 'Full verified credit did not resolve the case exactly';
  end if;
end;
$$;
rollback;
