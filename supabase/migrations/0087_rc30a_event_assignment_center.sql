begin;

-- RC-30A deliberately keeps self-service Staff claiming out of scope.
drop function if exists public.claim_staff_responsibility(uuid,uuid,text);

create or replace function public.assign_event_operational_responsibility(
  p_project_id uuid,
  p_staff_id uuid,
  p_responsibility text,
  p_reason text
) returns uuid[] language plpgsql security invoker set search_path=public as $$
declare
  roles text[];
  role_name text;
  old_staff uuid;
  created uuid[] := '{}';
  ids uuid[];
  combined_net numeric(14,2);
  payment_id uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  if p_responsibility not in ('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  roles := case when p_responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[p_responsibility] end;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':operational-assignment',0));
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null and capabilities @> roles) then
    raise exception 'El colaborador no está disponible o no tiene las responsabilidades requeridas.';
  end if;
  foreach role_name in array roles loop
    for old_staff in select distinct staff_id from public.assignments where project_id=p_project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED') loop
      update public.assignments set status='CANCELLED',deleted_at=now(),updated_by=auth.uid(),reason='Reasignado desde Centro de Operaciones' where project_id=p_project_id and staff_id=old_staff and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED');
    end loop;
    ids:=public.assign_staff_group(array[p_staff_id],p_project_id,role_name,'',coalesce(nullif(p_reason,''),'Asignación operacional'));
    created:=created||ids;
  end loop;
  if p_responsibility='ASSEMBLY_DISASSEMBLY' then
    select coalesce(amount,15000) into combined_net from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null;
    payment_id:=public.refresh_staff_event_payment(p_project_id,p_staff_id,auth.uid());
    update public.event_staff_payments set
      automatic_assembly_payment=round(combined_net/2),
      automatic_disassembly_payment=combined_net-round(combined_net/2),
      assembly_payment=round(combined_net/2),
      disassembly_payment=combined_net-round(combined_net/2),
      override_reason=null,override_by=null,override_at=null,updated_by=auth.uid()
    where id=payment_id;
  end if;
  return created;
end $$;

grant execute on function public.assign_event_operational_responsibility(uuid,uuid,text,text) to authenticated;

commit;
