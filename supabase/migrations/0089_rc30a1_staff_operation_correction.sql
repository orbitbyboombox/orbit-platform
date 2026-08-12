begin;

alter table public.expenses add column if not exists responsible_staff_id uuid references public.staff(id);
create index if not exists expenses_responsible_staff_idx on public.expenses(responsible_staff_id) where deleted_at is null;

create or replace function public.apply_combined_staff_rate()
returns trigger language plpgsql security definer set search_path=public as $$
declare project_ref uuid:=coalesce(new.project_id,old.project_id);staff_ref uuid:=coalesce(new.staff_id,old.staff_id);combined numeric(14,2);payment_id uuid;
begin
  if exists(select 1 from public.assignments where project_id=project_ref and staff_id=staff_ref and assignment_type='ASSEMBLY' and deleted_at is null and status not in('CANCELLED','REJECTED'))
    and exists(select 1 from public.assignments where project_id=project_ref and staff_id=staff_ref and assignment_type='DISASSEMBLY' and deleted_at is null and status not in('CANCELLED','REJECTED')) then
    select coalesce(amount,15000) into combined from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null;
    select id into payment_id from public.event_staff_payments where project_id=project_ref and staff_id=staff_ref and deleted_at is null order by created_at desc limit 1;
    update public.event_staff_payments set automatic_assembly_payment=round(combined/2),automatic_disassembly_payment=combined-round(combined/2),assembly_payment=case when override_at is null then round(combined/2) else assembly_payment end,disassembly_payment=case when override_at is null then combined-round(combined/2) else disassembly_payment end,updated_by=coalesce(auth.uid(),updated_by) where id=payment_id;
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists zz_assignments_combined_rate on public.assignments;
create trigger zz_assignments_combined_rate after insert or update of assignment_type,status,deleted_at or delete on public.assignments for each row execute function public.apply_combined_staff_rate();

commit;
