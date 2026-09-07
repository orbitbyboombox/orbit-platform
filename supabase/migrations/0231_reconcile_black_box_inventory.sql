-- Founder-confirmed Black Box inventory reconciliation.
-- CASE-01..09 are the nine physical commercial units. CASE-10..12 are retained
-- for audit but excluded from availability. Idempotent and non-destructive.
begin;

do $$
declare
  item record;
  desired_status text;
  correlation text;
begin
  for item in
    select id, asset_code, status
    from public.operational_assets
    where asset_code in ('CASE-01','CASE-02','CASE-03','CASE-04','CASE-05','CASE-06','CASE-07','CASE-08','CASE-09')
      and deleted_at is null
    order by asset_code
  loop
    if not exists (
      select 1 from public.asset_assignments assignment
      where assignment.asset_id=item.id
        and assignment.assignment_status='ASSIGNED'
        and assignment.deleted_at is null
    ) then
      desired_status:='AVAILABLE';
      correlation:='resource-reconcile:'||item.asset_code||':available';
      if item.status<>desired_status then
        update public.operational_assets
          set status=desired_status, updated_at=now()
          where id=item.id and deleted_at is null;
      end if;
      insert into public.asset_history(asset_id,history_type,message,previous_state,new_state,correlation_id)
      select item.id,'STATUS_CHANGE',item.asset_code||' reconciliado como Caja Negra BOOMBOX disponible.',
        jsonb_build_object('status',item.status),jsonb_build_object('status',desired_status),correlation
      where not exists (select 1 from public.asset_history where correlation_id=correlation);
    end if;
  end loop;

  for item in
    select id, asset_code, status
    from public.operational_assets
    where asset_code in ('CASE-10','CASE-11','CASE-12')
      and deleted_at is null
    order by asset_code
  loop
    if not exists (
      select 1 from public.asset_assignments assignment
      where assignment.asset_id=item.id
        and assignment.assignment_status='ASSIGNED'
        and assignment.deleted_at is null
    ) then
      desired_status:='OUT_OF_SERVICE';
      correlation:='resource-reconcile:'||item.asset_code||':excluded';
      if item.status<>desired_status then
        update public.operational_assets
          set status=desired_status, updated_at=now()
          where id=item.id and deleted_at is null;
      end if;
      insert into public.asset_history(asset_id,history_type,message,previous_state,new_state,correlation_id)
      select item.id,'STATUS_CHANGE',item.asset_code||' excluido del stock fisico confirmado; pendiente de revision.',
        jsonb_build_object('status',item.status),jsonb_build_object('status',desired_status),correlation
      where not exists (select 1 from public.asset_history where correlation_id=correlation);
    end if;
  end loop;
end $$;

commit;
