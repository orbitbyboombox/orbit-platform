begin;

-- Assignment ownership is canonical whenever a settlement carries an
-- assignment_id. Some legacy rows retain the previous staff_id after an
-- operational replacement; that field must remain untouched for history, but
-- it must not decide who receives the monthly settlement.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.calculate_staff_monthly_settlement(uuid,date)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'calculate_staff_monthly_settlement(uuid,date) is required';
  end if;

  if position('coalesce(assignment.staff_id, (settlement).staff_id)' in definition) = 0 then
    definition := replace(
      definition,
      'left join public.customers customer on (customer).id = (project).customer_id',
      'left join public.customers customer on (customer).id = (project).customer_id
    left join public.assignments assignment
      on assignment.id = (settlement).assignment_id
      and assignment.project_id = (settlement).project_id
      and assignment.deleted_at is null'
    );
    definition := replace(
      definition,
      'where (settlement).staff_id = p_staff_id',
      'where coalesce(assignment.staff_id, (settlement).staff_id) = p_staff_id'
    );
    if position('left join public.assignments assignment' in definition) = 0
       or position('coalesce(assignment.staff_id, (settlement).staff_id)' in definition) = 0 then
      raise exception 'Unable to install assignment-owner reconciliation';
    end if;
    if definition = pg_get_functiondef(
      'public.calculate_staff_monthly_settlement(uuid,date)'::regprocedure
    ) then
      raise exception 'Unable to install assignment-owner reconciliation';
    end if;
    execute definition;
  end if;
end;
$migration$;

-- Monthly account generation must discover the same canonical owner as the
-- calculation. This is idempotent and never changes PAID/FINALIZED accounts.
create or replace function public.generate_staff_monthly_accounts(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  member record;
  generated integer := 0;
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede generar liquidaciones.';
  end if;

  for member in
    select distinct
      coalesce(assignment.staff_id, payment.staff_id) as staff_id
    from public.event_staff_payments payment
    left join public.assignments assignment
      on assignment.id = payment.assignment_id
      and assignment.project_id = payment.project_id
      and assignment.deleted_at is null
    where payment.deleted_at is null
      and payment.status = 'CONFIRMED'
      and payment.accounting_month = month_start
      and coalesce(assignment.staff_id, payment.staff_id) is not null
  loop
    perform public.ensure_staff_monthly_account(member.staff_id, month_start);
    generated := generated + 1;
  end loop;
  return generated;
end;
$$;

-- Reconcile only derived open accounts. No payment, movement, receipt,
-- document, PAID account, or FINALIZED account is modified by this backfill.
do $backfill$
declare
  member record;
begin
  for member in
    select distinct
      coalesce(assignment.staff_id, payment.staff_id) as staff_id,
      payment.accounting_month
    from public.event_staff_payments payment
    left join public.assignments assignment
      on assignment.id = payment.assignment_id
      and assignment.project_id = payment.project_id
      and assignment.deleted_at is null
    where payment.deleted_at is null
      and payment.status = 'CONFIRMED'
      and payment.accounting_month is not null
      and coalesce(assignment.staff_id, payment.staff_id) is not null
  loop
    perform public.ensure_staff_monthly_account(member.staff_id, member.accounting_month);
  end loop;
end;
$backfill$;

commit;
