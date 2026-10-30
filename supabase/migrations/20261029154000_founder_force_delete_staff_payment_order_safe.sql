begin;

-- Assignment triggers reconcile event_staff_payments. Remove only unpaid,
-- non-finalized event-exclusive payment projections before deleting their
-- assignments, while preserving every paid or finalized financial record.
do $patch$
declare
  ddl text;
  first_assignment_delete constant text := 'delete from public.asset_assignments where project_id=p_project_id;';
  safe_prefix constant text := $$delete from public.event_staff_payments
    where project_id=p_project_id
      and coalesce(paid_amount,0)=0
      and settlement_status not in ('PAID','FINALIZED');
  delete from public.asset_assignments where project_id=p_project_id;$$;
  old_payment_delete constant text := $$delete from public.event_staff_payments where project_id=p_project_id and upper(coalesce(status,'')) not in ('PAID','CONFIRMED');$$;
begin
  select pg_get_functiondef(
    'public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure
  ) into ddl;

  if position(first_assignment_delete in ddl) = 0
     or position(old_payment_delete in ddl) = 0 then
    raise exception 'Canonical purge function does not contain the expected assignment/payment clauses';
  end if;

  ddl := replace(ddl, first_assignment_delete, safe_prefix);
  ddl := replace(ddl, old_payment_delete,
    '-- Unpaid, non-finalized staff payment projections were removed before assignments.');
  execute ddl;
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical CEO purge preserves paid/finalized staff finance and removes unpaid event-exclusive projections before assignment triggers can reconcile them.';

commit;
