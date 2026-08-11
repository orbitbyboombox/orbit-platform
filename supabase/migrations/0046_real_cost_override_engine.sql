begin;

alter table public.financial_cost_overrides drop constraint if exists financial_cost_overrides_category_check;
update public.financial_cost_overrides set category='OTHER_OPERATIONAL' where category='MISCELLANEOUS';
alter table public.financial_cost_overrides add constraint financial_cost_overrides_category_check check(category in(
  'OPERATOR','ASSEMBLY','DISASSEMBLY','FUEL','TRANSPORT','PARKING','TOLLS','MEALS','HOTEL','SCRAPBOOK','MAGNETS','OTHER_OPERATIONAL'
));
alter table public.financial_cost_overrides add column if not exists estimated_value numeric(14,2);
alter table public.financial_cost_overrides add column if not exists difference numeric(14,2) generated always as (edited_value-coalesce(estimated_value,original_value)) stored;
update public.financial_cost_overrides set estimated_value=original_value where estimated_value is null;
alter table public.financial_cost_overrides alter column estimated_value set not null;

create or replace function public.apply_real_cost_overrides(p_project_id uuid,p_values jsonb,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid(); item record; inserted_count integer:=0; estimated numeric; previous_real numeric;
  allowed constant text[]:=array['OPERATOR','ASSEMBLY','DISASSEMBLY','FUEL','TRANSPORT','PARKING','TOLLS','MEALS','HOTEL','SCRAPBOOK','MAGNETS','OTHER_OPERATIONAL'];
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar costos reales.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo del ajuste es obligatorio.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  perform public.sync_estimated_cost_sheet(p_project_id);
  for item in select upper(key) category,(value #>> '{}')::numeric real_value from jsonb_each(p_values)
  loop
    if not(item.category=any(allowed)) or item.real_value<0 then raise exception 'Costo real inválido.'; end if;
    select case item.category
      when 'OPERATOR' then operator when 'ASSEMBLY' then assembly when 'DISASSEMBLY' then disassembly
      when 'FUEL' then fuel when 'TRANSPORT' then transport when 'SCRAPBOOK' then scrapbook when 'MAGNETS' then magnets
      when 'OTHER_OPERATIONAL' then other_configured+pens+double_sided_tape else 0 end
    into estimated from public.estimated_cost_sheets where project_id=p_project_id;
    select edited_value into previous_real from public.financial_cost_overrides where project_id=p_project_id and category=item.category order by created_at desc limit 1;
    if item.real_value is distinct from coalesce(previous_real,estimated,0) then
      insert into public.financial_cost_overrides(project_id,category,original_value,estimated_value,edited_value,reason,created_by)
      values(p_project_id,item.category,coalesce(previous_real,estimated,0),coalesce(estimated,0),item.real_value,trim(p_reason),actor);
      inserted_count:=inserted_count+1;
    end if;
  end loop;
  if inserted_count=0 then raise exception 'No existen cambios para guardar.'; end if;
  insert into public.timeline_events(project_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  select p.id,'REAL_COSTS_UPDATED','Costos reales actualizados',inserted_count||' costos reales fueron confirmados.',actor,'Founder','Administrator','REAL_COSTS_UPDATED','Project',p.id,'Costos reales actualizados con motivo: '||trim(p_reason),'real-cost:'||p.id||':'||gen_random_uuid(),trim(p_reason),actor from public.projects p where p.id=p_project_id;
  return inserted_count;
end $$;

revoke all on function public.apply_real_cost_overrides(uuid,jsonb,text) from public,anon;
grant execute on function public.apply_real_cost_overrides(uuid,jsonb,text) to authenticated;

commit;
