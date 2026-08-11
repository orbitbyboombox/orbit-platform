begin;

create table if not exists public.smart_cleanup_runs(
 id uuid primary key default gen_random_uuid(),executed_by uuid not null references auth.users(id),executed_at timestamptz not null default now(),
 kept_project_ids uuid[] not null,removed_project_ids uuid[] not null,removed_customer_ids uuid[] not null,external_projects_processed integer not null default 0,
 revenue numeric(14,2) not null,received numeric(14,2) not null,receivable numeric(14,2) not null,status text not null check(status in('COMPLETED','BLOCKED')),summary jsonb not null default'{}'
);
alter table public.smart_cleanup_runs enable row level security;
drop policy if exists smart_cleanup_founder_read on public.smart_cleanup_runs;
create policy smart_cleanup_founder_read on public.smart_cleanup_runs for select using(public.can_administer());

create or replace function public.preview_go_live_smart_cleanup()returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();real_ids uuid[];qa_ids uuid[];real_customers uuid[];victoria_count integer;soledad_count integer;all_count integer;payload jsonb;
begin
 if actor is null or not public.can_administer()then raise exception'Solo Founder o Administración puede preparar Go Live.';end if;
 with candidates as(
  select p.id,p.customer_id,c.full_name,p.orbit_event_id,p.event_date,p.status,coalesce(q.final_customer_price,q.grand_total,0)::numeric total,
   case when lower(trim(c.full_name))like'victoria%'and coalesce(q.final_customer_price,q.grand_total,0)=330000 then'VICTORIA'
        when lower(trim(c.full_name))like'%soledad provens%'and coalesce(q.final_customer_price,q.grand_total,0)=580000 then'SOLEDAD_PROVENS'else'QA'end classification
  from projects p join customers c on c.id=p.customer_id
  left join lateral(select final_customer_price,grand_total from quotations where project_id=p.id and deleted_at is null order by case when status='ACCEPTED'then 0 else 1 end,created_at desc limit 1)q on true
 )select coalesce(array_agg(id)filter(where classification<>'QA'),'{}'),coalesce(array_agg(id)filter(where classification='QA'),'{}'),coalesce(array_agg(distinct customer_id)filter(where classification<>'QA'),'{}'),count(*)filter(where classification='VICTORIA'),count(*)filter(where classification='SOLEDAD_PROVENS'),count(*) into real_ids,qa_ids,real_customers,victoria_count,soledad_count,all_count from candidates;
 with rows as(
  select p.id,p.customer_id,c.full_name,p.orbit_event_id,p.event_date,p.status,coalesce(q.final_customer_price,q.grand_total,0)::numeric total,
   case when lower(trim(c.full_name))like'victoria%'and coalesce(q.final_customer_price,q.grand_total,0)=330000 then'REAL · Victoria'
        when lower(trim(c.full_name))like'%soledad provens%'and coalesce(q.final_customer_price,q.grand_total,0)=580000 then'REAL · Soledad Provens'else'QA'end classification
  from projects p join customers c on c.id=p.customer_id left join lateral(select final_customer_price,grand_total from quotations where project_id=p.id and deleted_at is null order by case when status='ACCEPTED'then 0 else 1 end,created_at desc limit 1)q on true
 )select jsonb_agg(to_jsonb(rows)order by classification,full_name,event_date)into payload from rows;
 return jsonb_build_object('safe',victoria_count=1 and soledad_count=1,'reason',case when victoria_count<>1 then'Victoria no tiene una única coincidencia de $330.000.'when soledad_count<>1 then'Soledad Provens no tiene una única coincidencia de $580.000.'else'Clasificación inequívoca.'end,'realProjectIds',real_ids,'qaProjectIds',qa_ids,'realCustomerIds',real_customers,'totalProjects',all_count,'rows',coalesce(payload,'[]'::jsonb),'expected',jsonb_build_object('revenue',910000,'received',165000,'receivable',745000));
end$$;

create or replace function public.execute_go_live_smart_cleanup(p_confirmation text,p_keep_project_ids uuid[],p_external_projects integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();preview jsonb;expected_keep uuid[];qa_projects uuid[];qa_customers uuid[];r record;n integer;affected integer:=0;revenue_value numeric:=0;received_value numeric:=0;receivable_value numeric:=0;
begin
 if actor is null or not public.can_administer()then raise exception'NOT_AUTHORIZED';end if;
 if p_confirmation<>'LIMPIAR QA CONSERVAR VICTORIA Y SOLEDAD'then raise exception'INVALID_CONFIRMATION';end if;
 preview:=public.preview_go_live_smart_cleanup();if not(preview->>'safe')::boolean then raise exception'La clasificación no es inequívoca. No se eliminó ningún registro.';end if;
 select coalesce(array_agg(value::uuid order by value::text),'{}')into expected_keep from jsonb_array_elements_text(preview->'realProjectIds')value;
 select coalesce(array_agg(value::uuid order by value::text),'{}')into qa_projects from jsonb_array_elements_text(preview->'qaProjectIds')value;
 select coalesce(array_agg(id),'{}')into qa_customers from customers c where not exists(select 1 from projects p where p.customer_id=c.id and p.id=any(expected_keep));
 if(select array_agg(x order by x::text)from unnest(p_keep_project_ids)x)is distinct from expected_keep then raise exception'Los registros protegidos cambiaron. Actualiza la vista previa.';end if;
 perform set_config('app.production_initialization','on',true);
 for r in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'where c.table_schema='public'and c.column_name='project_id'and c.table_name not in('projects','smart_cleanup_runs','production_initialization_runs')loop execute format('delete from public.%I where project_id=any($1)',r.table_name)using qa_projects;get diagnostics n=row_count;affected:=affected+n;end loop;
 for r in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'where c.table_schema='public'and c.column_name='customer_id'and c.table_name not in('customers','projects','smart_cleanup_runs','production_initialization_runs')loop execute format('delete from public.%I where customer_id=any($1)',r.table_name)using qa_customers;get diagnostics n=row_count;affected:=affected+n;end loop;
 delete from projects where id=any(qa_projects);delete from customers where id=any(qa_customers)and not exists(select 1 from projects p where p.customer_id=customers.id);
 for r in select unnest(expected_keep)id loop perform public.confirm_reservation_operational_pipeline(r.id,actor);end loop;
 select coalesce(sum(revenue),0),coalesce(sum(paid_amount),0),coalesce(sum(outstanding_balance),0)into revenue_value,received_value,receivable_value from financial_event_records where project_id=any(expected_keep)and status='CONFIRMED';
 if revenue_value<>910000 or received_value<>165000 or receivable_value<>745000 then raise exception'La reconstrucción financiera no coincide: ingresos %, recibidos %, por cobrar %.',revenue_value,received_value,receivable_value;end if;
 insert into smart_cleanup_runs(executed_by,kept_project_ids,removed_project_ids,removed_customer_ids,external_projects_processed,revenue,received,receivable,status,summary)values(actor,expected_keep,qa_projects,qa_customers,p_external_projects,revenue_value,received_value,receivable_value,'COMPLETED',jsonb_build_object('operationalRecordsRemoved',affected,'configurationPreserved',true,'realCustomers',jsonb_build_array('Victoria','Soledad Provens')));
 return jsonb_build_object('keptProjects',cardinality(expected_keep),'removedProjects',cardinality(qa_projects),'removedCustomers',cardinality(qa_customers),'recordsRemoved',affected,'revenue',revenue_value,'received',received_value,'receivable',receivable_value);
end$$;

revoke all on function public.preview_go_live_smart_cleanup()from public,anon;grant execute on function public.preview_go_live_smart_cleanup()to authenticated;
revoke all on function public.execute_go_live_smart_cleanup(text,uuid[],integer)from public,anon;grant execute on function public.execute_go_live_smart_cleanup(text,uuid[],integer)to authenticated;
commit;
