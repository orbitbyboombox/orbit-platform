begin;
alter table public.projects drop constraint if exists projects_pipeline_stage_check;
alter table public.projects add constraint projects_pipeline_stage_check check (pipeline_stage in('NUEVO','CALIFICANDO','COTIZACIÓN','SEGUIMIENTO','RESERVA PENDIENTE','GANADO','PERDIDO','CANCELADO','PRUEBA','ARCHIVADO'));
commit;
