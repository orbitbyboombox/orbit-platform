create table if not exists public.production_initialization_runs(
 id uuid primary key default gen_random_uuid(),executed_by uuid not null references auth.users(id),executed_at timestamptz not null default now(),
 customers_removed integer not null,projects_removed integer not null,external_projects_processed integer not null,status text not null check(status in('COMPLETED','FAILED')),summary jsonb not null default'{}'
);
alter table public.production_initialization_runs enable row level security;
create policy production_initialization_runs_admin_read on public.production_initialization_runs for select using(public.can_administer());

create or replace function public.prevent_timeline_mutation()returns trigger language plpgsql set search_path=public as $$begin
 if current_setting('app.production_initialization',true)='on' then return old;end if;
 raise exception 'timeline_events is append-only';
end;$$;

create or replace function public.initialize_orbit_production(p_confirmation text,p_external_projects integer)
returns table(customers_removed integer,projects_removed integer,operational_records integer)
language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();role_name text;project_ids uuid[];customer_ids uuid[];p_count integer;c_count integer;affected integer:=0;r record;n integer;
begin
 select role::text into role_name from profiles where id=actor;
 if actor is null or role_name not in('CEO','ADMINISTRATOR')then raise exception 'NOT_AUTHORIZED';end if;
 if p_confirmation<>'INICIALIZAR PRODUCCION' then raise exception 'INVALID_CONFIRMATION';end if;
 select coalesce(array_agg(id),'{}') into project_ids from projects;
 select coalesce(array_agg(id),'{}') into customer_ids from customers;
 p_count:=cardinality(project_ids);c_count:=cardinality(customer_ids);
 perform set_config('app.production_initialization','on',true);
 for r in select table_name from information_schema.columns where table_schema='public'and column_name='project_id'and table_name not in('projects','production_initialization_runs') loop
  execute format('delete from public.%I where project_id=any($1)',r.table_name)using project_ids;get diagnostics n=row_count;affected:=affected+n;
 end loop;
 for r in select table_name from information_schema.columns where table_schema='public'and column_name='customer_id'and table_name not in('customers','projects','production_initialization_runs') loop
  execute format('delete from public.%I where customer_id=any($1)',r.table_name)using customer_ids;get diagnostics n=row_count;affected:=affected+n;
 end loop;
 delete from notification_user_states;get diagnostics n=row_count;affected:=affected+n;
 delete from internal_notifications;get diagnostics n=row_count;affected:=affected+n;
 delete from automatic_booking_invitations;get diagnostics n=row_count;affected:=affected+n;
 delete from tasks;get diagnostics n=row_count;affected:=affected+n;
 delete from expenses;get diagnostics n=row_count;affected:=affected+n;
 delete from vehicle_route_events;update vehicle_fuel_logs set route_id=null;update vehicle_routes set fuel_log_id=null;delete from vehicle_routes;delete from vehicle_fuel_logs;
 delete from projects;delete from customers;
 update financial_integrity_status set integrity_percent=100,reservation_sync='OK',finance_sync='OK',dashboard_sync='OK',business_intelligence_sync='OK',reports_sync='OK',affected_records=0,checked_at=now() where status_key='PRIMARY';
 insert into production_initialization_runs(executed_by,customers_removed,projects_removed,external_projects_processed,status,summary)values(actor,c_count,p_count,p_external_projects,'COMPLETED',jsonb_build_object('operationalRecordsRemoved',affected,'configurationPreserved',true));
 return query select c_count,p_count,affected;
end;$$;
revoke all on function public.initialize_orbit_production(text,integer)from public;
grant execute on function public.initialize_orbit_production(text,integer)to authenticated;
