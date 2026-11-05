-- v2.1.5: include completed training in open monthly settlements.
-- Additive only. Existing PAID/FINALIZED monthly accounts are never recalculated.

create table if not exists public.staff_training_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  trainee_staff_id uuid not null references public.staff(id),
  trainer_staff_id uuid not null references public.staff(id),
  normal_operator_rate_clp integer not null check (normal_operator_rate_clp >= 0),
  training_rate_percent integer not null default 50 check (training_rate_percent = 50),
  training_amount_clp integer generated always as ((normal_operator_rate_clp + 1) / 2) stored,
  status text not null default 'PLANNED' check (status in ('PLANNED','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_different_staff check (trainee_staff_id <> trainer_staff_id),
  constraint training_unique_trainee_per_event unique (project_id, trainee_staff_id)
);

alter table public.staff_training_assignments enable row level security;

drop policy if exists training_admin_select on public.staff_training_assignments;
create policy training_admin_select on public.staff_training_assignments
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('CEO','ADMINISTRATOR')
  ));

drop policy if exists training_admin_insert on public.staff_training_assignments;
create policy training_admin_insert on public.staff_training_assignments
  for insert to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('CEO','ADMINISTRATOR')
  ));

do $$
begin
  if to_regprocedure('public.calculate_staff_monthly_settlement_legacy(uuid,date)') is null then
    alter function public.calculate_staff_monthly_settlement(uuid,date)
      rename to calculate_staff_monthly_settlement_legacy;
  end if;
end $$;

create or replace function public.calculate_staff_monthly_settlement(
  p_staff_id uuid,
  p_month date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  month_start date := date_trunc('month', p_month)::date;
  account_status text;
  payment_status text;
  training_total numeric := 0;
  training_count integer := 0;
  training_details jsonb := '[]'::jsonb;
  training record;
begin
  result := public.calculate_staff_monthly_settlement_legacy(p_staff_id, month_start);

  select coalesce(a.settlement_status, ''), coalesce(a.payment_status, '')
    into account_status, payment_status
  from public.staff_monthly_accounts a
  where a.staff_id = p_staff_id and a.accounting_month = month_start;

  -- A completed training recorded after a closed/paid month must be reviewed
  -- separately; it must never rewrite historical payroll.
  if account_status in ('FINALIZED', 'CLOSED', 'PAID') or payment_status = 'PAID' then
    return result;
  end if;

  for training in
    select
      t.id,
      t.project_id,
      t.training_amount_clp,
      p.event_date,
      p.name as event_name,
      p.location,
      p.city,
      coalesce(c.full_name, '') as customer_name
    from public.staff_training_assignments t
    join public.projects p on p.id = t.project_id and p.deleted_at is null
    left join public.customers c on c.id = p.customer_id
    where t.trainee_staff_id = p_staff_id
      and t.status = 'COMPLETED'
      and p.event_date >= month_start
      and p.event_date < (month_start + interval '1 month')::date
    order by p.event_date, t.id
  loop
    training_count := training_count + 1;
    training_total := training_total + coalesce(training.training_amount_clp, 0);
    training_details := training_details || jsonb_build_array(jsonb_build_object(
      'settlementId', training.id,
      'projectId', training.project_id,
      'eventDate', training.event_date,
      'event', training.event_name,
      'customer', training.customer_name,
      'service', 'CAPACITACIÓN',
      'location', concat_ws(' · ', nullif(training.location, ''), nullif(training.city, '')),
      'roles', jsonb_build_array('OPERADOR EN CAPACITACIÓN'),
      'hours', 0,
      'workNet', coalesce(training.training_amount_clp, 0),
      'baseWorkNet', coalesce(training.training_amount_clp, 0),
      'adjustmentTotal', 0,
      'workPaid', 0,
      'workPending', coalesce(training.training_amount_clp, 0),
      'workOverpayment', 0,
      'paidAmountField', 0,
      'advances', 0,
      'payments', 0,
      'reimbursements', 0,
      'reimbursementsPaid', 0,
      'reimbursementsPending', 0,
      'reimbursementOverpayment', 0,
      'settlementStatus', 'PENDING',
      'trainingAssignmentId', training.id
    ));
  end loop;

  if training_count = 0 then
    return result;
  end if;

  result := jsonb_set(result, '{workNet}', to_jsonb((result->>'workNet')::numeric + training_total), true);
  result := jsonb_set(result, '{boletaNet}', to_jsonb((result->>'boletaNet')::numeric + training_total), true);
  result := jsonb_set(result, '{boletaGross}', to_jsonb(round((result->>'boletaNet')::numeric / greatest(1 - ((result->>'withholdingRate')::numeric / 100), 0.0001), 0)), true);
  result := jsonb_set(result, '{withholdingAmount}', to_jsonb(greatest((result->>'boletaGross')::numeric - (result->>'boletaNet')::numeric, 0)), true);
  result := jsonb_set(result, '{workPending}', to_jsonb((result->>'workPending')::numeric + training_total), true);
  result := jsonb_set(result, '{cashObligation}', to_jsonb((result->>'cashObligation')::numeric + training_total), true);
  result := jsonb_set(result, '{finalTransferAmount}', to_jsonb((result->>'finalTransferAmount')::numeric + training_total), true);
  result := jsonb_set(result, '{eventCount}', to_jsonb((result->>'eventCount')::integer + training_count), true);
  result := jsonb_set(result, '{details}', coalesce(result->'details', '[]'::jsonb) || training_details, true);
  result := jsonb_set(result, '{trainingCount}', to_jsonb(training_count), true);
  result := jsonb_set(result, '{trainingTotal}', to_jsonb(training_total), true);
  return result;
end;
$$;

create or replace function public.complete_staff_training(p_training_id uuid)
returns public.staff_training_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.staff_training_assignments;
begin
  if auth.uid() is null or public.current_orbit_role() not in ('CEO','ADMINISTRATOR') then
    raise exception 'Solo Founder/Admin puede completar capacitaciones.';
  end if;

  update public.staff_training_assignments
  set status = 'COMPLETED', updated_at = now()
  where id = p_training_id and status = 'PLANNED'
  returning * into item;

  if item.id is null then
    select * into item from public.staff_training_assignments where id = p_training_id;
    if item.id is null then raise exception 'Capacitación no encontrada.'; end if;
    if item.status = 'CANCELLED' then raise exception 'Una capacitación cancelada no puede completarse.'; end if;
  end if;
  return item;
end;
$$;

revoke all on function public.complete_staff_training(uuid) from public;
grant execute on function public.complete_staff_training(uuid) to authenticated;

comment on function public.calculate_staff_monthly_settlement(uuid,date) is
  'Canonical monthly settlement with completed training for open accounts; historical PAID/FINALIZED accounts are immutable.';
