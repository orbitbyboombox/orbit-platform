begin;

create or replace function public.sync_event_settlement_confirmation()
returns trigger language plpgsql security definer set search_path=public as $$
declare project_ref uuid:=coalesce(new.project_id,old.project_id);staff_ref uuid:=coalesce(new.staff_id,old.staff_id);payment_id uuid;confirmed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(project_ref::text||':'||staff_ref::text||':event-settlement',0));
  payment_id:=public.refresh_staff_event_payment(project_ref,staff_ref,coalesce(auth.uid(),new.updated_by,old.updated_by));
  if payment_id is null then return coalesce(new,old); end if;
  select exists(
    select 1 from public.assignments
    where project_id=project_ref and staff_id=staff_ref and deleted_at is null
      and status in('CONFIRMED','ACCEPTED','COMPLETED')
      and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY')
  ) into confirmed;
  update public.event_staff_payments
  set status=case when confirmed then 'CONFIRMED' else 'ESTIMATED' end,
      updated_by=coalesce(auth.uid(),updated_by)
  where id=payment_id;
  return coalesce(new,old);
end $$;

drop trigger if exists zzz_event_settlement_confirmation on public.assignments;
create trigger zzz_event_settlement_confirmation
after insert or update of assignment_type,status,deleted_at or delete on public.assignments
for each row execute function public.sync_event_settlement_confirmation();

update public.event_staff_payments payment
set status=case when exists(
  select 1 from public.assignments assignment
  where assignment.project_id=payment.project_id and assignment.staff_id=payment.staff_id
    and assignment.deleted_at is null and assignment.status in('CONFIRMED','ACCEPTED','COMPLETED')
    and assignment.assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY')
) then 'CONFIRMED' else 'ESTIMATED' end,
updated_at=now()
where payment.deleted_at is null and payment.status<>'CANCELLED';

commit;
