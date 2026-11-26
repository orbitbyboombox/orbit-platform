-- Apply only to the dedicated sandbox namespace of the ORBIT BIANCA TEST project.
begin;
create schema if not exists orbit_sii_phase2_qa;
revoke all on schema orbit_sii_phase2_qa from public, anon, authenticated;
create table if not exists orbit_sii_phase2_qa.gateway (secret_hash text primary key);
create table if not exists orbit_sii_phase2_qa.documents (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  event_id text not null,
  type integer not null check(type in (33,39,61)),
  folio bigint generated always as identity unique,
  snapshot jsonb not null,
  status text not null check(status in ('PROCESANDO','PENDIENTE','ERROR_REINTENTABLE','ACEPTADO')),
  claim uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now() + interval '45 seconds',
  artifact_pdf text,
  artifact_xml text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists orbit_sii_phase2_qa.audit (
  id bigint generated always as identity primary key,
  document_id uuid not null references orbit_sii_phase2_qa.documents(id),
  actor text not null,
  action text not null,
  code text,
  at timestamptz not null default now()
);
create or replace function public.orbit_sii_phase2_qa_gateway(p_secret text, p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, orbit_sii_phase2_qa
as $$
declare
  d documents%rowtype;
  k text;
  state text;
  acquired boolean := false;
begin
  if not exists(select 1 from gateway where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')) then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  if p_action='list' then
    return coalesce((select jsonb_agg(to_jsonb(x)-'artifact_pdf'-'artifact_xml'-'claim' order by x.created_at desc)
      from (select * from documents order by created_at desc limit 100) x),'[]'::jsonb);
  end if;
  if p_action='claim' then
    k:=p_data->>'operation';
    insert into documents(operation_key,event_id,type,snapshot,status)
    values(k,p_data->>'eventId',(p_data->>'type')::integer,p_data->'snapshot','PROCESANDO')
    on conflict(operation_key) do nothing returning * into d;
    acquired:=found;
    if not acquired then
      select * into strict d from documents where operation_key=k;
    else
      insert into audit(document_id,actor,action) values(d.id,'Administrador QA','APROBADO');
    end if;
    return jsonb_build_object('acquired',acquired,'document',to_jsonb(d)-'artifact_pdf'-'artifact_xml');
  end if;
  select * into strict d from documents where id=(p_data->>'id')::uuid for update;
  if p_action='get' then
    return to_jsonb(d)-'artifact_pdf'-'artifact_xml'-'claim';
  elsif p_action='audit' then
    return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from audit a where a.document_id=d.id),'[]'::jsonb);
  elsif p_action='download' then
    if d.status<>'ACEPTADO' or p_data->>'format' not in ('pdf','xml') then raise exception 'Archivo no disponible'; end if;
    insert into audit(document_id,actor,action,code) values(d.id,'Administrador QA','DESCARGADO',p_data->>'format');
    return jsonb_build_object('artifact',case when p_data->>'format'='pdf' then d.artifact_pdf else d.artifact_xml end);
  elsif p_action='resume' then
    if (d.status in ('PENDIENTE','ERROR_REINTENTABLE') or (d.status='PROCESANDO' and d.lease_until<=now())) then
      update documents set status='PROCESANDO',claim=gen_random_uuid(),lease_until=now()+interval '45 seconds',updated_at=now() where id=d.id returning * into d;
      insert into audit(document_id,actor,action) values(d.id,'Administrador QA','CONCILIACION_SOLICITADA');
      acquired:=true;
    end if;
    return jsonb_build_object('acquired',acquired,'document',to_jsonb(d)-'artifact_pdf'-'artifact_xml');
  elsif p_action='finish' then
    state:=p_data->>'state';
    if d.claim=(p_data->>'claim')::uuid and d.status='PROCESANDO' then
      if state not in ('PENDIENTE','ERROR_REINTENTABLE','ACEPTADO') or
         (state='ACEPTADO' and (p_data->>'pdf' is null or p_data->>'xml' is null)) then
        raise exception 'Resultado inválido';
      end if;
      update documents set status=state,artifact_pdf=p_data->>'pdf',artifact_xml=p_data->>'xml',updated_at=now()
      where id=d.id returning * into d;
      insert into audit(document_id,actor,action,code) values(d.id,'Simulador QA',state,p_data->>'code');
    end if;
    return to_jsonb(d)-'artifact_pdf'-'artifact_xml'-'claim';
  end if;
  raise exception 'Acción inválida';
end;
$$;
revoke all on function public.orbit_sii_phase2_qa_gateway(text,text,jsonb) from public, authenticated;
grant execute on function public.orbit_sii_phase2_qa_gateway(text,text,jsonb) to anon;
commit;
