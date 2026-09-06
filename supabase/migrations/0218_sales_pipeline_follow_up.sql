begin;

alter table public.projects
  add column if not exists pipeline_stage text,
  add column if not exists lead_source text,
  add column if not exists next_action_at timestamptz,
  add column if not exists next_action_type text,
  add column if not exists pipeline_owner uuid references public.profiles(id),
  add column if not exists estimated_value numeric(14,2),
  add column if not exists lost_reason text,
  add column if not exists lost_notes text,
  add column if not exists follow_up_status text,
  add column if not exists last_commercial_activity_at timestamptz,
  add column if not exists last_customer_reply_at timestamptz,
  add column if not exists last_outbound_at timestamptz;

alter table public.projects drop constraint if exists projects_pipeline_stage_check;
alter table public.projects add constraint projects_pipeline_stage_check check (pipeline_stage is null or pipeline_stage in ('NUEVO','CALIFICANDO','COTIZACIÓN','SEGUIMIENTO','RESERVA PENDIENTE','GANADO','PERDIDO'));
alter table public.projects drop constraint if exists projects_lead_source_check;
alter table public.projects add constraint projects_lead_source_check check (lead_source is null or lead_source in ('WHATSAPP','WEB','INSTAGRAM','REFERIDO','EMPRESA','MANUAL','OTRO','UNKNOWN'));
alter table public.projects drop constraint if exists projects_next_action_type_check;
alter table public.projects add constraint projects_next_action_type_check check (next_action_type is null or next_action_type in ('LLAMAR','WHATSAPP','EMAIL','REVISAR','COTIZAR','SEGUIMIENTO','OTRO'));
alter table public.projects drop constraint if exists projects_follow_up_status_check;
alter table public.projects add constraint projects_follow_up_status_check check (follow_up_status is null or follow_up_status in ('SCHEDULED','DUE','PAUSED','CANCELLED','COMPLETED','BLOCKED'));

create index if not exists projects_pipeline_stage_idx on public.projects(pipeline_stage) where deleted_at is null;
create index if not exists projects_next_action_idx on public.projects(next_action_at,pipeline_owner) where deleted_at is null and next_action_at is not null;
create index if not exists projects_follow_up_status_idx on public.projects(follow_up_status,next_action_at) where deleted_at is null;

commit;
