-- Include completed training-only staff in monthly account generation.
-- Existing canonical settlement calculation handles training amounts and closed-month immutability.
create or replace function public.generate_staff_monthly_accounts(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  month_start date := date_trunc('month', p_month)::date;
  member record;
  generated integer := 0;
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede generar liquidaciones.';
  end if;

  for member in
    select distinct source.staff_id
    from (
      select coalesce(assignment.staff_id, payment.staff_id) as staff_id
      from public.event_staff_payments payment
      left join public.assignments assignment
        on assignment.id = payment.assignment_id
        and assignment.project_id = payment.project_id
        and assignment.deleted_at is null
      where payment.deleted_at is null
        and payment.status = 'CONFIRMED'
        and payment.accounting_month = month_start
      union all
      select training.trainee_staff_id as staff_id
      from public.staff_training_assignments training
      join public.projects project
        on project.id = training.project_id
        and project.deleted_at is null
      where training.status = 'COMPLETED'
        and project.event_date >= month_start
        and project.event_date < (month_start + interval '1 month')::date
    ) source
    where source.staff_id is not null
  loop
    perform public.ensure_staff_monthly_account(member.staff_id, month_start);
    generated := generated + 1;
  end loop;
  return generated;
end;
$function$;