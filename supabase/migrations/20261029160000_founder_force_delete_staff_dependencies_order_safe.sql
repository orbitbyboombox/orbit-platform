begin;

-- Remove event-exclusive staff dependency rows before their referenced
-- assignments and settlements. Real paid/finalized financial history remains
-- protected by the payment predicate introduced in the preceding repair.
do $patch$
declare
  ddl text;
  anchor constant text := 'delete from public.event_staff_payments
    where project_id=p_project_id
      and coalesce(paid_amount,0)=0
      and settlement_status not in (''PAID'',''FINALIZED'');';
  safe_anchor constant text := $$delete from public.staff_assignment_cancellations where project_id=p_project_id;
  delete from public.event_staff_settlement_adjustments
    where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);
  delete from public.event_staff_settlement_movements
    where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);
  delete from public.event_staff_payments
    where project_id=p_project_id
      and coalesce(paid_amount,0)=0
      and settlement_status not in ('PAID','FINALIZED');$$;
  old_cancellation constant text := 'delete from public.staff_assignment_cancellations where project_id=p_project_id;';
  old_adjustments constant text := 'delete from public.event_staff_settlement_adjustments where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);';
  old_movements constant text := 'delete from public.event_staff_settlement_movements where settlement_id in (select id from public.event_staff_payments where project_id=p_project_id);';
begin
  select pg_get_functiondef(
    'public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure
  ) into ddl;

  if position(anchor in ddl)=0 then
    raise exception 'Canonical purge function does not contain the expected payment anchor';
  end if;

  ddl := replace(ddl, anchor, safe_anchor);
  ddl := replace(ddl, old_cancellation, '-- Staff cancellations were removed before assignments.');
  ddl := replace(ddl, old_adjustments, '-- Settlement adjustments were removed before payment projections.');
  ddl := replace(ddl, old_movements, '-- Settlement movements were removed before payment projections.');
  execute ddl;
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical CEO purge removes event-exclusive staff dependencies in FK-safe order while preserving paid and finalized financial history.';

commit;
