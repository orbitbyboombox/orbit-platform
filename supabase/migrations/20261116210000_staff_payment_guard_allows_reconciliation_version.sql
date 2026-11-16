begin;

-- A finalized period remains immutable. The settlement sync trigger is the
-- narrow, audited exception used by a post-close payment: it updates only
-- payment realization fields and the optimistic-lock version.
create or replace function public.guard_staff_payment_period_inputs()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_id uuid;
  frozen_period uuid;
  before_row jsonb:=to_jsonb(old);
  after_row jsonb:=to_jsonb(new);
begin
  if tg_table_name='staff_training_assignments' then
    target_id:=coalesce(after_row->>'id',before_row->>'id')::uuid;
    select p.id into frozen_period
    from public.staff_payment_periods p
    where p.status='FINALIZED'
      and exists(
        select 1 from jsonb_array_elements(p.snapshot->'details') d
        where d->>'trainingAssignmentId'=target_id::text
      )
    limit 1;
  else
    target_id:=case
      when tg_table_name='event_staff_payments'
        then coalesce(after_row->>'id',before_row->>'id')::uuid
      else coalesce(before_row->>'settlement_id',after_row->>'settlement_id')::uuid
    end;
    select p.id into frozen_period
    from public.staff_payment_periods p
    where p.status='FINALIZED'
      and exists(
        select 1 from jsonb_array_elements(p.snapshot->'details') d
        where d->>'settlementId'=target_id::text
      )
    limit 1;
  end if;

  if frozen_period is not null then
    if tg_table_name='event_staff_settlement_movements'
       and tg_op='INSERT'
       and after_row->>'movement_type'='PAYMENT'
       and current_setting('orbit.staff_period_payment',true)=frozen_period::text then
      return new;
    end if;

    -- touch_versioned_row runs before this guard and increments version for
    -- every legitimate recalculation. It is not a financial input.
    if tg_table_name='event_staff_payments'
       and tg_op='UPDATE'
       and (before_row-array[
         'paid_amount','paid_at','settlement_status','updated_at','updated_by','version'
       ])=(after_row-array[
         'paid_amount','paid_at','settlement_status','updated_at','updated_by','version'
       ]) then
      return new;
    end if;

    raise exception 'El bloque Staff está cerrado y sus conceptos o movimientos están protegidos.';
  end if;
  return coalesce(new,old);
end;
$$;

comment on function public.guard_staff_payment_period_inputs() is
  'Protects finalized financial inputs while allowing audited post-close payment realization and version synchronization.';

commit;
