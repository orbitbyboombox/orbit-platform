begin;

-- Phase C.5: paper is first-class event evidence. The snapshot is immutable;
-- reloads and the final EVENT_USAGE movement are append-only ledger facts.
create table if not exists public.event_paper_snapshots(
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  orbit_event_id text,
  asset_assignment_id uuid not null unique references public.asset_assignments(id),
  box_asset_id uuid references public.operational_assets(id) on delete set null,
  printer_asset_id uuid references public.operational_assets(id) on delete set null,
  media_lot_id uuid references public.box_media_lots(id) on delete set null,
  format_key text references public.box_media_formats(format_key),
  lot text,
  paper_required boolean not null default false,
  opening_balance numeric(14,3) not null default 0 check(opening_balance>=0),
  status text not null default 'PENDING' check(status in('PENDING','READY_TO_CLOSE','CONFIRMED','OVERRIDDEN')),
  final_remaining_balance numeric(14,3) check(final_remaining_balance is null or final_remaining_balance>=0),
  event_usage numeric(14,3) check(event_usage is null or event_usage>=0),
  confirmed_by uuid references public.staff(id),
  portal_session_id uuid references public.portal_access_sessions(id),
  confirmed_at timestamptz,
  override_reason text,
  overridden_by uuid references auth.users(id),
  overridden_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.event_paper_reloads(
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.event_paper_snapshots(id),
  project_id uuid references public.projects(id) on delete set null,
  asset_assignment_id uuid not null references public.asset_assignments(id),
  media_lot_id uuid not null references public.box_media_lots(id),
  quantity numeric(14,3) not null check(quantity>0),
  note text,
  staff_id uuid not null references public.staff(id),
  portal_session_id uuid not null references public.portal_access_sessions(id),
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists event_paper_snapshots_project_idx
  on public.event_paper_snapshots(project_id,status);
create index if not exists event_paper_snapshots_reminder_idx
  on public.event_paper_snapshots(status,reminder_sent_at)
  where paper_required;
create index if not exists event_paper_reloads_snapshot_time_idx
  on public.event_paper_reloads(snapshot_id,occurred_at desc);

create or replace function public.phase_c5_capture_event_paper_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
declare box_type text; printer_id uuid; lot_row record; requires_paper boolean;
begin
  if new.deleted_at is not null or new.assignment_status<>'ASSIGNED' then return new; end if;
  select a.asset_type into box_type from public.operational_assets a where a.id=new.asset_id and a.deleted_at is null;
  if box_type is distinct from 'BOX' then return new; end if;
  select a.id into printer_id from public.operational_assets a
    where a.parent_asset_id=new.asset_id and a.asset_type='PRINTER' and a.deleted_at is null
    order by a.asset_code limit 1;
  requires_paper:=printer_id is not null;
  select l.id,l.printer_asset_id,l.format_key,l.lot,l.remaining_photo_capacity
    into lot_row from public.box_media_lots l
    where l.box_asset_id=new.asset_id and l.status='ACTIVE'
    order by l.loaded_at desc limit 1;
  insert into public.event_paper_snapshots(
    project_id,orbit_event_id,asset_assignment_id,box_asset_id,printer_asset_id,media_lot_id,
    format_key,lot,paper_required,opening_balance,status
  )
  select p.id,p.orbit_event_id,new.id,new.asset_id,coalesce(lot_row.printer_asset_id,printer_id),lot_row.id,
    lot_row.format_key,lot_row.lot,requires_paper,coalesce(lot_row.remaining_photo_capacity,0),
    'PENDING'
  from public.projects p
  where p.id=new.project_id
    and not exists(select 1 from public.event_paper_snapshots s where s.asset_assignment_id=new.id);
  return new;
end $$;

drop trigger if exists asset_assignments_paper_snapshot on public.asset_assignments;
create trigger asset_assignments_paper_snapshot
after insert or update of assignment_status,asset_id,deleted_at on public.asset_assignments
for each row execute function public.phase_c5_capture_event_paper_snapshot();

-- Backfill only currently assigned BOX rows; no historical inventory is rewritten.
insert into public.event_paper_snapshots(project_id,orbit_event_id,asset_assignment_id,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,paper_required,opening_balance)
select p.id,p.orbit_event_id,aa.id,aa.asset_id,printer.id,lot.id,lot.format_key,lot.lot,
  printer.id is not null,coalesce(lot.remaining_photo_capacity,0)
from public.asset_assignments aa
join public.projects p on p.id=aa.project_id
join public.operational_assets box on box.id=aa.asset_id and box.asset_type='BOX' and box.deleted_at is null
left join lateral (select a.id from public.operational_assets a where a.parent_asset_id=box.id and a.asset_type='PRINTER' and a.deleted_at is null order by a.asset_code limit 1) printer on true
left join lateral (select l.* from public.box_media_lots l where l.box_asset_id=box.id and l.status='ACTIVE' order by l.loaded_at desc limit 1) lot on true
where aa.assignment_status='ASSIGNED' and aa.deleted_at is null
on conflict(asset_assignment_id) do nothing;

create or replace function public.phase_c5_require_paper_closeout()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.assignment_status='RETURNED' and old.assignment_status is distinct from 'RETURNED'
     and exists(select 1 from public.event_paper_snapshots s where s.asset_assignment_id=new.id and s.paper_required and s.status not in('CONFIRMED','OVERRIDDEN')) then
    raise exception 'Falta registrar el papel restante de la impresora. Ingresa la cantidad antes de finalizar el cierre del evento.';
  end if;
  return new;
end $$;

drop trigger if exists asset_assignments_paper_closeout_guard on public.asset_assignments;
create trigger asset_assignments_paper_closeout_guard
before update of assignment_status on public.asset_assignments
for each row execute function public.phase_c5_require_paper_closeout();

create or replace function public.phase_c5_snapshot_immutable()
returns trigger language plpgsql as $$
begin
  if old.project_id is distinct from new.project_id or old.orbit_event_id is distinct from new.orbit_event_id
     or old.asset_assignment_id is distinct from new.asset_assignment_id or old.box_asset_id is distinct from new.box_asset_id
     or old.printer_asset_id is distinct from new.printer_asset_id or old.media_lot_id is distinct from new.media_lot_id
     or old.format_key is distinct from new.format_key or old.lot is distinct from new.lot
     or old.paper_required is distinct from new.paper_required or old.opening_balance is distinct from new.opening_balance then
    raise exception 'Event paper opening snapshot is immutable.';
  end if;
  return new;
end $$;
drop trigger if exists event_paper_snapshot_immutable on public.event_paper_snapshots;
create trigger event_paper_snapshot_immutable before update on public.event_paper_snapshots
for each row execute function public.phase_c5_snapshot_immutable();

create or replace function public.record_staff_event_paper_reload(
  p_project_id uuid,p_asset_assignment_id uuid,p_quantity numeric,p_note text,p_idempotency_key text,
  p_staff_id uuid,p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare snapshot_row public.event_paper_snapshots%rowtype; lot_row public.box_media_lots%rowtype;
  actor_profile_id uuid; movement_id uuid; new_balance numeric;
begin
  select a.resolved_staff_id,a.profile_id into p_staff_id,actor_profile_id
    from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_project_id is null or p_asset_assignment_id is null or p_quantity is null or p_quantity<=0 or nullif(trim(p_idempotency_key),'') is null then raise exception 'Datos de recarga incompletos.'; end if;
  select * into snapshot_row from public.event_paper_snapshots where project_id=p_project_id and asset_assignment_id=p_asset_assignment_id for update;
  if not found or not snapshot_row.paper_required or snapshot_row.media_lot_id is null then raise exception 'Este evento no tiene una carga de papel válida.'; end if;
  if snapshot_row.status in('CONFIRMED','OVERRIDDEN') then raise exception 'El cierre de papel ya fue confirmado.'; end if;
  if not exists(select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and assignment_type='OPERATOR' and status in('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null) then raise exception 'Solo el Operador asignado puede registrar recargas.'; end if;
  select * into lot_row from public.box_media_lots where id=snapshot_row.media_lot_id and status<>'DISCARDED' for update;
  if not found then raise exception 'Lote de papel no disponible.'; end if;
  select id into movement_id from public.event_paper_reloads where idempotency_key=p_idempotency_key;
  if movement_id is not null then return jsonb_build_object('reload_id',movement_id,'duplicate',true); end if;
  new_balance:=lot_row.remaining_photo_capacity+p_quantity;
  update public.box_media_lots set initial_photo_capacity=greatest(initial_photo_capacity,new_balance) where id=lot_row.id;
  insert into public.inventory_movements(supply_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,quantity_before,quantity_delta,quantity_after,portal_session_id)
    select lot_row.supply_id,p_project_id,p.orbit_event_id,p_staff_id,'LOAD',p_quantity,now(),coalesce(nullif(trim(p_note),''),'Recarga de papel durante evento'),actor_profile_id,actor_profile_id,lot_row.box_asset_id,lot_row.printer_asset_id,lot_row.id,lot_row.format_key,lot_row.lot,lot_row.remaining_photo_capacity,p_quantity,new_balance,p_portal_session_id from public.projects p where p.id=p_project_id returning id into movement_id;
  if movement_id is null then raise exception 'Evento no encontrado.'; end if;
  insert into public.event_paper_reloads(snapshot_id,project_id,asset_assignment_id,media_lot_id,quantity,note,staff_id,portal_session_id,idempotency_key)
    values(snapshot_row.id,p_project_id,p_asset_assignment_id,lot_row.id,p_quantity,nullif(trim(p_note),''),p_staff_id,p_portal_session_id,p_idempotency_key) returning id into movement_id;
  update public.event_paper_snapshots set status='READY_TO_CLOSE' where id=snapshot_row.id and status='PENDING';
  return jsonb_build_object('reload_id',movement_id,'duplicate',false,'quantity',p_quantity,'balance_after',new_balance);
end $$;

create or replace function public.confirm_staff_event_paper_closeout(
  p_project_id uuid,p_asset_assignment_id uuid,p_final_remaining numeric,p_note text,p_idempotency_key text,
  p_staff_id uuid,p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare snapshot_row public.event_paper_snapshots%rowtype; lot_row public.box_media_lots%rowtype;
  actor_profile_id uuid; reload_total numeric; expected_balance numeric; usage numeric; movement_id uuid;
begin
  select a.resolved_staff_id,a.profile_id into p_staff_id,actor_profile_id from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_final_remaining is null or p_final_remaining<0 or nullif(trim(p_idempotency_key),'') is null then raise exception 'Ingresa un saldo final válido.'; end if;
  select * into snapshot_row from public.event_paper_snapshots where project_id=p_project_id and asset_assignment_id=p_asset_assignment_id for update;
  if not found or not snapshot_row.paper_required or snapshot_row.media_lot_id is null then raise exception 'Este evento no tiene una carga de papel válida.'; end if;
  if snapshot_row.status in('CONFIRMED','OVERRIDDEN') then return jsonb_build_object('snapshot_id',snapshot_row.id,'duplicate',true,'event_usage',snapshot_row.event_usage); end if;
  select * into lot_row from public.box_media_lots where id=snapshot_row.media_lot_id for update;
  select coalesce(sum(quantity),0) into reload_total from public.event_paper_reloads where snapshot_id=snapshot_row.id;
  expected_balance:=snapshot_row.opening_balance+reload_total;
  if lot_row.remaining_photo_capacity<>expected_balance then raise exception 'El saldo de papel cambió fuera de este evento. Revisa la Caja antes de cerrar.'; end if;
  if p_final_remaining>expected_balance then raise exception 'El papel final no puede superar apertura más recargas.'; end if;
  usage:=expected_balance-p_final_remaining;
  if usage>0 then
    insert into public.inventory_movements(supply_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,quantity_before,quantity_delta,quantity_after,portal_session_id)
      select lot_row.supply_id,p_project_id,p.orbit_event_id,p_staff_id,'EVENT_USAGE',-usage,now(),coalesce(nullif(trim(p_note),''),'Consumo de papel del evento'),actor_profile_id,actor_profile_id,lot_row.box_asset_id,lot_row.printer_asset_id,lot_row.id,lot_row.format_key,lot_row.lot,expected_balance,-usage,p_final_remaining,p_portal_session_id from public.projects p where p.id=p_project_id returning id into movement_id;
  end if;
  update public.event_paper_snapshots set status='CONFIRMED',final_remaining_balance=p_final_remaining,event_usage=usage,confirmed_by=p_staff_id,portal_session_id=p_portal_session_id,confirmed_at=now() where id=snapshot_row.id;
  return jsonb_build_object('snapshot_id',snapshot_row.id,'duplicate',false,'opening_balance',snapshot_row.opening_balance,'reloads',reload_total,'final_remaining',p_final_remaining,'event_usage',usage,'movement_id',movement_id);
end $$;

create or replace function public.override_staff_event_paper_closeout(p_snapshot_id uuid,p_reason text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare snapshot_row public.event_paper_snapshots%rowtype;
begin
  if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id and role in('CEO'::orbit_role,'ADMINISTRATOR'::orbit_role)) then raise exception 'Founder/Admin authorization required.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Override reason is required.'; end if;
  select * into snapshot_row from public.event_paper_snapshots where id=p_snapshot_id for update;
  if not found then raise exception 'Paper snapshot not found.'; end if;
  update public.event_paper_snapshots set status='OVERRIDDEN',override_reason=trim(p_reason),overridden_by=p_actor_id,overridden_at=now(),confirmed_at=coalesce(confirmed_at,now()) where id=p_snapshot_id;
  return jsonb_build_object('snapshot_id',p_snapshot_id,'status','OVERRIDDEN');
end $$;

alter table public.event_paper_snapshots enable row level security;
alter table public.event_paper_reloads enable row level security;
revoke all on public.event_paper_snapshots,public.event_paper_reloads from anon,authenticated;
revoke all on function public.phase_c5_capture_event_paper_snapshot() from public,anon,authenticated;
revoke all on function public.phase_c5_require_paper_closeout() from public,anon,authenticated;
revoke all on function public.phase_c5_snapshot_immutable() from public,anon,authenticated;
revoke all on function public.record_staff_event_paper_reload(uuid,uuid,numeric,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_staff_event_paper_closeout(uuid,uuid,numeric,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.override_staff_event_paper_closeout(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.record_staff_event_paper_reload(uuid,uuid,numeric,text,text,uuid,uuid) to service_role;
grant execute on function public.confirm_staff_event_paper_closeout(uuid,uuid,numeric,text,text,uuid,uuid) to service_role;
grant execute on function public.override_staff_event_paper_closeout(uuid,text,uuid) to service_role;

commit;
