begin;
create or replace function public.preview_go_live_smart_cleanup()returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();real_ids uuid[];qa_ids uuid[];real_customers uuid[];victoria_count integer;soledad_count integer;all_count integer;payload jsonb;
begin
 if auth.role()<>'service_role'and(actor is null or not public.can_administer())then raise exception'Solo Founder o Administración puede preparar Go Live.';end if;
 with candidates as(
  select p.id,p.customer_id,c.full_name,p.orbit_event_id,p.event_date,p.status,coalesce(q.final_customer_price,q.grand_total,0)::numeric total,
   case when lower(trim(c.full_name))like'victoria%'and coalesce(q.final_customer_price,q.grand_total,0)=330000 then'VICTORIA'when lower(trim(c.full_name))like'%soledad provens%'and coalesce(q.final_customer_price,q.grand_total,0)=580000 then'SOLEDAD_PROVENS'else'QA'end classification
  from projects p join customers c on c.id=p.customer_id left join lateral(select final_customer_price,grand_total from quotations where project_id=p.id and deleted_at is null order by case when status='ACCEPTED'then 0 else 1 end,created_at desc limit 1)q on true
 )select coalesce(array_agg(id)filter(where classification<>'QA'),'{}'),coalesce(array_agg(id)filter(where classification='QA'),'{}'),coalesce(array_agg(distinct customer_id)filter(where classification<>'QA'),'{}'),count(*)filter(where classification='VICTORIA'),count(*)filter(where classification='SOLEDAD_PROVENS'),count(*)into real_ids,qa_ids,real_customers,victoria_count,soledad_count,all_count from candidates;
 with rows as(
  select p.id,p.customer_id,c.full_name,p.orbit_event_id,p.event_date,p.status,coalesce(q.final_customer_price,q.grand_total,0)::numeric total,case when lower(trim(c.full_name))like'victoria%'and coalesce(q.final_customer_price,q.grand_total,0)=330000 then'REAL · Victoria'when lower(trim(c.full_name))like'%soledad provens%'and coalesce(q.final_customer_price,q.grand_total,0)=580000 then'REAL · Soledad Provens'else'QA'end classification
  from projects p join customers c on c.id=p.customer_id left join lateral(select final_customer_price,grand_total from quotations where project_id=p.id and deleted_at is null order by case when status='ACCEPTED'then 0 else 1 end,created_at desc limit 1)q on true
 )select jsonb_agg(to_jsonb(rows)order by classification,full_name,event_date)into payload from rows;
 return jsonb_build_object('safe',victoria_count=1 and soledad_count=1,'reason',case when victoria_count<>1 then'Victoria no tiene una única coincidencia de $330.000.'when soledad_count<>1 then'Soledad Provens no tiene una única coincidencia de $580.000.'else'Clasificación inequívoca.'end,'realProjectIds',real_ids,'qaProjectIds',qa_ids,'realCustomerIds',real_customers,'totalProjects',all_count,'rows',coalesce(payload,'[]'::jsonb),'expected',jsonb_build_object('revenue',910000,'received',165000,'receivable',745000));
end$$;
grant execute on function public.preview_go_live_smart_cleanup()to service_role;
commit;
