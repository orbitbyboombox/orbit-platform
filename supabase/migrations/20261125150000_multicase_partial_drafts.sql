begin;

-- Upgrade the authenticated Multicaja transaction to support safe partial drafts.
create or replace function public.save_event_multicase_configuration(
  p_project_id uuid,
  p_layout jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  position_row record;
  shift_row record;
  staff_row public.assignments%rowtype;
  asset_row public.operational_assets%rowtype;
  asset_assignment_row public.asset_assignments%rowtype;
  requirement_row public.event_operational_requirements%rowtype;
  snapshot_row public.event_paper_snapshots%rowtype;
  new_block_id uuid;
  single_operator_id uuid;
  active_operator_count integer;
  service_start_at timestamptz;
  service_end_at timestamptz;
  old_asset_id uuid;
  assignment_ids uuid[] := '{}';
  asset_ids uuid[] := '{}';
  old_asset_ids uuid[] := '{}';
  new_assignment_ids uuid[] := '{}';
  current_layout jsonb;
  required_total numeric;
  attached_count integer := 0;
  desired_count integer;
  active_count integer;
  snapshot_count integer;
  result jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede configurar Multicaja.';
  end if;
  if p_project_id is null or jsonb_typeof(p_layout) <> 'object'
     or jsonb_typeof(p_layout->'enabled') <> 'boolean'
     or jsonb_typeof(p_layout->'positions') <> 'array'
     or jsonb_array_length(p_layout->'positions') < 1
     or jsonb_array_length(p_layout->'positions') > 30 then
    raise exception 'Distribución Multicaja inválida.';
  end if;

  select * into project_row from public.projects
   where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(project_row.status,'')) in ('CANCELLED','CANCELED','ARCHIVED','CLOSED','COMPLETED') then
    raise exception 'No se puede modificar Multicaja en un Evento cerrado.';
  end if;
  if project_row.event_date is null or project_row.event_date < timezone('America/Santiago',now())::date then
    raise exception 'No se puede modificar Multicaja en un Evento histórico.';
  end if;

  p_layout:=coalesce(p_layout,'{}'::jsonb)||jsonb_build_object('finalized',coalesce((p_layout->>'finalized')::boolean,false));
  select coalesce(project_row.operations->'totemLayout','{}'::jsonb) into current_layout;

  -- Any enabled draft may begin before either cases or operators are selected.
  -- If no operational block exists, create one from the confirmed service window
  -- so the admin can subsequently link operators in either order.
  if coalesce((p_layout->>'enabled')::boolean,false)
     and not exists(select 1 from public.event_operational_blocks where project_id=p_project_id) then
    select count(*)::integer,(array_agg(id))[1] into active_operator_count,single_operator_id
      from public.assignments where project_id=p_project_id and assignment_type='OPERATOR'
        and deleted_at is null and status in ('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED');
    if active_operator_count>0 or exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value)
        where nullif(p.value->>'assetId','') is not null) then
      select c.service_start_at,c.service_end_at into service_start_at,service_end_at
        from public.project_operational_contracts c where c.project_id=p_project_id;
      if service_start_at is null then
        service_start_at:=(project_row.event_date+project_row.event_time) at time zone 'America/Santiago';
      end if;
      if service_end_at is null then
        select service_start_at+make_interval(mins=>(max(ps.duration_hours)*60)::integer)
          into service_end_at from public.project_services ps where ps.project_id=p_project_id and ps.duration_hours>0;
      end if;
      if service_start_at is null or service_end_at is null or service_end_at<=service_start_at then
        if coalesce((p_layout->>'finalized')::boolean,false) then
          raise exception 'Confirma el horario de servicio antes de finalizar Multicaja.';
        end if;
      else
        insert into public.event_operational_blocks(project_id,name,sequence,start_at,end_at,status,notes)
        values(p_project_id,'Bloque operativo único',1,service_start_at,service_end_at,'PLANNING',
          'Bloque interno derivado del horario de servicio confirmado por Multicaja.')
        returning id into new_block_id;
        select jsonb_set(p_layout,'{positions}',jsonb_agg(
          case when exists(select 1 from jsonb_array_elements(coalesce(pos.value->'blocks','[]'::jsonb)) prior(value)
                            where prior.value->>'blockId'=new_block_id::text)
               then pos.value
               else jsonb_set(pos.value,'{blocks}',coalesce(pos.value->'blocks','[]'::jsonb)||jsonb_build_array(
                 jsonb_build_object('blockId',new_block_id::text,'assignmentId',
                   case when coalesce((p_layout->>'finalized')::boolean,false)
                              and jsonb_array_length(p_layout->'positions')=1
                              and active_operator_count=1
                              and nullif(pos.value->>'assetId','') is not null
                        then single_operator_id::text else null end)),true) end
          order by pos.ordinality)
          ,true)
          into p_layout
          from jsonb_array_elements(p_layout->'positions') with ordinality pos(value,ordinality);
      end if;
    end if;
  end if;

  -- Validate each physical position and prohibit duplicate cases or staff IDs.
  if exists (
    select 1 from jsonb_array_elements(p_layout->'positions') pos(value)
     where jsonb_typeof(pos.value) <> 'object'
        or nullif(pos.value->>'id','') is null or nullif(pos.value->>'label','') is null
        or length(pos.value->>'label') > 100 or length(coalesce(pos.value->>'location','')) > 250
        or length(coalesce(pos.value->>'reference','')) > 250
        or jsonb_typeof(pos.value->'blocks') <> 'array'
  ) then raise exception 'Una posición Multicaja tiene campos inválidos.'; end if;
  if exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value) group by p.value->>'id' having count(*)>1) then
    raise exception 'Hay posiciones Multicaja duplicadas.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value) group by p.value->>'id',b.value->>'blockId' having count(*)>1) then
    raise exception 'Una posición no puede repetir un bloque operacional.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value) where nullif(p.value->>'assetId','') is not null group by p.value->>'assetId' having count(*)>1) then
    raise exception 'Una caja no puede ocupar dos posiciones al mismo tiempo.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
     where nullif(b.value->>'assignmentId','') is not null
     group by b.value->>'assignmentId' having count(*)>1
  ) then raise exception 'Un operador no puede cubrir dos tótems en el mismo evento.'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
     where (coalesce((p_layout->>'finalized')::boolean,false) and nullif(p.value->>'assetId','') is null and nullif(b.value->>'assignmentId','') is not null)
        or (nullif(b.value->>'blockId','') is null and nullif(b.value->>'assignmentId','') is not null)
  ) then raise exception 'Cada operador requiere caja y bloque operacional.'; end if;

  for shift_row in
    select distinct (b.value->>'blockId')::uuid as block_id
      from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
     where nullif(b.value->>'assignmentId','') is not null
  loop
    if not exists(select 1 from public.event_operational_blocks where id=shift_row.block_id and project_id=p_project_id) then
      raise exception 'El bloque operacional no pertenece a este Evento.';
    end if;
  end loop;

  for shift_row in
    select distinct (b.value->>'assignmentId')::uuid as assignment_id, (b.value->>'blockId')::uuid as block_id
      from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
     where nullif(b.value->>'assignmentId','') is not null
  loop
    select * into staff_row from public.assignments
     where id=shift_row.assignment_id and project_id=p_project_id and assignment_type='OPERATOR'
       and deleted_at is null and status in ('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')
     for update;
    if not found then raise exception 'La asignación seleccionada no es un operador activo de este Evento.'; end if;
    if staff_row.block_id is not null and staff_row.block_id <> shift_row.block_id then
      raise exception 'El operador ya pertenece a otro bloque. Revisa el cambio de turno antes de guardar.';
    end if;
    if exists(select 1 from public.assignments other_assignment where other_assignment.project_id=p_project_id
      and other_assignment.staff_id=staff_row.staff_id and other_assignment.assignment_type='OPERATOR'
      and other_assignment.block_id=shift_row.block_id and other_assignment.id<>staff_row.id
      and other_assignment.deleted_at is null and other_assignment.status not in ('CANCELLED','REJECTED')) then
      raise exception 'El operador ya tiene otra asignación en este bloque.';
    end if;
    if staff_row.block_id is null then assignment_ids:=array_append(assignment_ids,staff_row.id); end if;
  end loop;

  if coalesce((p_layout->>'enabled')::boolean,false) and coalesce((p_layout->>'finalized')::boolean,false) and exists(
    select 1 from public.assignments a
     where a.project_id=p_project_id and a.assignment_type='OPERATOR'
       and a.deleted_at is null and a.status in ('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')
       and not exists(
         select 1 from jsonb_array_elements(p_layout->'positions') p(value)
           cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
          where nullif(p.value->>'assetId','') is not null and (b.value->>'assignmentId')::uuid=a.id
       )
  ) then
    raise exception 'Hay operadores activos sin caja asignada. Asocia cada operador a una posición antes de guardar.';
  end if;

  if coalesce((p_layout->>'finalized')::boolean,false) then
    if not coalesce((p_layout->>'enabled')::boolean,false) then raise exception 'Activa Multicaja antes de finalizar.'; end if;
    if not exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value) where nullif(p.value->>'assetId','') is not null) then
      raise exception 'Asigna al menos una caja antes de finalizar.';
    end if;
    select coalesce(sum(required_quantity),0) into required_total from public.event_operational_requirements
      where project_id=p_project_id and status='ACTIVE' and requirement_type='PHYSICAL_UNIT' and asset_type='CASE';
    if required_total>0 and (select count(*) from jsonb_array_elements(p_layout->'positions') p(value)
      where nullif(p.value->>'assetId','') is not null)<required_total then
      raise exception 'Asigna todas las cajas físicas requeridas antes de finalizar.';
    end if;
    if exists(select 1 from jsonb_array_elements(p_layout->'positions') p(value)
      where nullif(p.value->>'assetId','') is not null and not exists(
        select 1 from jsonb_array_elements(p.value->'blocks') b(value)
        join public.assignments a on a.id=(b.value->>'assignmentId')::uuid
        where a.project_id=p_project_id and a.assignment_type='OPERATOR' and a.deleted_at is null
          and a.status in ('ASSIGNED','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED')))
    then raise exception 'Cada caja debe tener al menos un operador de servicio asignado.'; end if;
  end if;

  -- Expand the canonical block capacity before linking existing confirmed rows.
  for shift_row in
    select (b.value->>'blockId')::uuid as block_id,
      count(distinct (b.value->>'assignmentId')::uuid)::integer as wanted,
      (count(distinct (b.value->>'assignmentId')::uuid) filter (where a.block_id is null))::integer as moving
      from jsonb_array_elements(p_layout->'positions') p(value)
      cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
      join public.assignments a on a.id=(b.value->>'assignmentId')::uuid
     where nullif(b.value->>'assignmentId','') is not null
     group by (b.value->>'blockId')::uuid
  loop
    select count(*) into active_count from public.assignments
      where project_id=p_project_id and block_id=shift_row.block_id and assignment_type='OPERATOR'
        and deleted_at is null and status not in ('CANCELLED','REJECTED');
    desired_count:=active_count+shift_row.moving;
    insert into public.event_staff_requirements(project_id,block_id,role,required_quantity,published,created_by,updated_by)
    values(p_project_id,shift_row.block_id,'OPERATOR',greatest(shift_row.wanted,desired_count),false,actor,actor)
    on conflict(project_id,block_id,role) where block_id is not null do update
      set required_quantity=greatest(public.event_staff_requirements.required_quantity,excluded.required_quantity,desired_count),
          updated_at=now(),updated_by=actor;
  end loop;

  -- Link existing assignment rows; never insert/cancel/recreate staff or touch pay amounts.
  update public.assignments a
     set block_id=(select (b.value->>'blockId')::uuid
       from jsonb_array_elements(p_layout->'positions') p(value)
       cross join lateral jsonb_array_elements(p.value->'blocks') b(value)
       where (b.value->>'assignmentId')::uuid=a.id limit 1),
         updated_by=actor
   where a.id=any(assignment_ids);
  get diagnostics attached_count = row_count;
  if attached_count <> cardinality(assignment_ids) then raise exception 'No se pudieron vincular todas las asignaciones originales.'; end if;

  -- Keep existing payment/cost projections attached to the same assignment,
  -- without recalculating or changing any remuneration amount or settlement.
  update public.event_staff_payments pay set block_id=a.block_id,updated_by=actor,updated_at=now()
    from public.assignments a where pay.assignment_id=a.id and a.id=any(assignment_ids) and pay.block_id is distinct from a.block_id;
  -- Identify old assets removed from this layout. Only release cases that this
  -- layout previously managed; do not touch snapshots, paper movements or closes.
  select coalesce(array_agg(distinct (p.value->>'assetId')::uuid), '{}') into old_asset_ids
    from jsonb_array_elements(coalesce(current_layout->'positions','[]'::jsonb)) p(value)
   where nullif(p.value->>'assetId','') is not null;
  select coalesce(array_agg(distinct (p.value->>'assetId')::uuid), '{}') into asset_ids
    from jsonb_array_elements(p_layout->'positions') p(value)
   where nullif(p.value->>'assetId','') is not null;

  if coalesce((p_layout->>'enabled')::boolean,false) then
    select coalesce(sum(required_quantity),0) into required_total from public.event_operational_requirements
      where project_id=p_project_id and status='ACTIVE' and requirement_type='PHYSICAL_UNIT' and asset_type='CASE';
    if cardinality(asset_ids)>required_total then raise exception 'La cantidad de cajas supera las necesidades físicas del Evento.'; end if;

    foreach old_asset_id in array old_asset_ids loop
      if not (old_asset_id=any(asset_ids)) then
        if exists(select 1 from public.event_operational_blocks b where b.project_id=p_project_id
            and b.start_at <= now()) then
          raise exception 'No se pueden cambiar cajas después de iniciar un bloque operacional.';
        end if;
        select * into asset_assignment_row from public.asset_assignments
         where project_id=p_project_id and asset_id=old_asset_id and assignment_status='ASSIGNED' and deleted_at is null
         for update;
        if found then
          if exists(select 1 from public.event_box_paper_block_closeouts where project_id=p_project_id and asset_id=old_asset_id)
             or exists(select 1 from public.event_paper_snapshots where project_id=p_project_id and box_asset_id=old_asset_id and status in ('CONFIRMED','OVERRIDDEN')) then
            raise exception 'No se puede cambiar una caja que ya tiene cierres o consumo confirmado.';
          end if;
          perform public.release_operational_asset(asset_assignment_row.id,'Cambio de caja desde Multicaja');
        end if;
      end if;
    end loop;

    foreach old_asset_id in array asset_ids loop
      select * into asset_row from public.operational_assets where id=old_asset_id and deleted_at is null for update;
      if not found or asset_row.asset_type not in ('CASE','BOX') or asset_row.status in ('MAINTENANCE','OUT_OF_SERVICE') then
        raise exception 'La caja seleccionada no existe o no está operativa.';
      end if;
      select * into asset_assignment_row from public.asset_assignments
       where project_id=p_project_id and asset_id=old_asset_id and assignment_status='ASSIGNED' and deleted_at is null
       for update;
      if found then
        if asset_assignment_row.operational_requirement_id is null then
          select * into requirement_row from public.event_operational_requirements
            where project_id=p_project_id and status='ACTIVE' and requirement_type='PHYSICAL_UNIT' and asset_type=asset_row.asset_type
            order by required_quantity desc,id for update limit 1;
          if not found then raise exception 'No existe necesidad física activa para %.',asset_row.asset_code; end if;
          update public.asset_assignments set operational_requirement_id=requirement_row.id,block_id=null,updated_by=actor,updated_at=now()
            where id=asset_assignment_row.id;
          perform public.recalculate_event_resource_assignments(p_project_id,actor);
        elsif not exists(select 1 from public.event_operational_requirements where id=asset_assignment_row.operational_requirement_id
          and project_id=p_project_id and status='ACTIVE' and asset_type=asset_row.asset_type) then
          raise exception 'La caja ya tiene una relación física inconsistente; requiere revisión administrativa.';
        end if;
        new_assignment_ids:=array_append(new_assignment_ids,asset_assignment_row.id);
      else
        select * into requirement_row from public.event_operational_requirements
          where project_id=p_project_id and status='ACTIVE' and requirement_type='PHYSICAL_UNIT'
            and asset_type=asset_row.asset_type and assigned_quantity<required_quantity
          order by code,id for update limit 1;
        if not found then raise exception 'No queda capacidad física para asignar %.',asset_row.asset_code; end if;
        result:=public.assign_operational_assets(p_project_id,requirement_row.id,array[old_asset_id],
          'Asignación transaccional desde Multicaja');
        new_assignment_ids:=array_append(new_assignment_ids,(result->'assignmentIds'->>0)::uuid);
      end if;

      select count(*) into snapshot_count from public.event_paper_snapshots
       where project_id=p_project_id and box_asset_id=old_asset_id and paper_required=true;
      if snapshot_count>1 then raise exception 'Hay más de un snapshot de papel para %; no se cambió la caja.',asset_row.asset_code; end if;
      if snapshot_count=1 then
        select * into snapshot_row from public.event_paper_snapshots
         where project_id=p_project_id and box_asset_id=old_asset_id and paper_required=true
         order by created_at asc limit 1 for update;
        if snapshot_row.status in ('CONFIRMED','OVERRIDDEN')
           and snapshot_row.asset_assignment_id is distinct from new_assignment_ids[array_upper(new_assignment_ids,1)] then
          raise exception 'El snapshot de % ya fue confirmado; no se puede volver a vincular.',asset_row.asset_code;
        end if;
        update public.event_paper_snapshots set asset_assignment_id=new_assignment_ids[array_upper(new_assignment_ids,1)]
         where project_id=p_project_id and box_asset_id=old_asset_id and paper_required=true and status='PENDING'
           and asset_assignment_id is distinct from new_assignment_ids[array_upper(new_assignment_ids,1)];
      end if;
    end loop;
  end if;

  -- Save the layout without overwriting concurrent edits to other operations.
  update public.projects set operations=coalesce(operations,'{}'::jsonb)||jsonb_build_object('totemLayout',p_layout),updated_at=now()
   where id=p_project_id;

  perform public.recalculate_event_resource_assignments(p_project_id,actor);
  perform public.refresh_event_operational_readiness(p_project_id,actor);
  insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(project_row.customer_id,p_project_id,project_row.orbit_event_id,'MULTICASE_CONFIGURATION_SAVED',
    'Distribución Multicaja actualizada',
    'Se guardó la distribución de cajas y operadores por bloque mediante el flujo administrativo transaccional.',
    'Founder','Operations','MULTICASE_CONFIGURATION_SAVED','Project',p_project_id::text,
    'Distribución Multicaja sincronizada con Staff e Inventario.',
    'multicase-config:'||p_project_id::text||':'||gen_random_uuid()::text);
  return jsonb_build_object('ok',true,'layout',p_layout,'linkedAssignments',attached_count,'assetAssignmentIds',to_jsonb(new_assignment_ids));
end;
$$;
revoke all on function public.save_event_multicase_configuration(uuid,jsonb) from public,anon;
grant execute on function public.save_event_multicase_configuration(uuid,jsonb) to authenticated;

commit;
