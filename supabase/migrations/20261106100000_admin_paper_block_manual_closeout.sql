-- Founder manual AM/PM closeout. Runs in the same transaction as the canonical
-- closeout RPC, preserving inventory idempotency and rollback on audit failure.
create table if not exists public.event_paper_block_admin_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  block_id uuid not null,
  operator_assignment_id uuid not null,
  closeout_id uuid not null,
  admin_user_id uuid not null,
  reason text not null,
  request_id uuid not null unique,
  created_at timestamptz not null default now()
);
alter table public.event_paper_block_admin_audit enable row level security;
revoke all on public.event_paper_block_admin_audit from public, anon, authenticated;

create or replace function public.admin_record_staff_paper_block_closeout(
  p_project_id uuid, p_block_id uuid, p_operator_assignment_id uuid,
  p_opening integer, p_reloads integer, p_remaining integer,
  p_request_id uuid, p_admin_user_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  operator_id uuid;
  admin_role text;
  result jsonb;
begin
  if p_admin_user_id is null or p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'Motivo administrativo obligatorio.';
  end if;
  select role into admin_role from public.profiles where id = p_admin_user_id;
  if admin_role is distinct from 'CEO' then
    raise exception 'Usuario sin permiso de cierre administrativo.';
  end if;
  select staff_id into operator_id
    from public.assignments
   where id = p_operator_assignment_id and project_id = p_project_id
     and block_id = p_block_id and assignment_type = 'OPERATOR'
     and status in ('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null;
  if operator_id is null then raise exception 'Asignación operacional no válida.'; end if;
  result := public.record_staff_paper_block_closeout(
    p_project_id, p_block_id, p_operator_assignment_id,
    p_opening, p_reloads, p_remaining, p_request_id,
    operator_id, p_admin_user_id
  );
  insert into public.event_paper_block_admin_audit(
    project_id,block_id,operator_assignment_id,closeout_id,admin_user_id,reason,request_id
  ) values(
    p_project_id,p_block_id,p_operator_assignment_id,
    (result->>'closeout_id')::uuid,p_admin_user_id,btrim(p_reason),p_request_id
  ) on conflict (request_id) do nothing;
  return result;
end;
$$;
revoke all on function public.admin_record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_record_staff_paper_block_closeout(uuid,uuid,uuid,integer,integer,integer,uuid,uuid,text) to service_role;
