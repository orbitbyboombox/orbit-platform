begin;

-- RC-99: company configuration is internal. Public branding is served from
-- the public branding bucket and never requires exposing the settings row.
drop policy if exists company_settings_public_read on public.company_settings;
drop policy if exists company_settings_internal_read on public.company_settings;
create policy company_settings_internal_read
  on public.company_settings for select
  using (public.is_internal_user());

revoke select on public.company_settings from anon;
grant select on public.company_settings to authenticated;

-- invoice_payments is the canonical customer payment ledger. The historical
-- receivable_movements table is retained only as an immutable audit projection.
comment on table public.invoice_payments is
  'Canonical customer payment ledger. All operational payment reads originate here.';
comment on table public.receivable_movements is
  'Read-only historical audit projection of canonical invoice_payments and receivable state transitions.';
revoke insert,update,delete,truncate on public.receivable_movements from public,anon,authenticated;

-- Reservation Transaction A ends after the canonical CRM/Event/Receivable
-- records. Timeline belongs to Boundary B and is written by the application
-- only after this function commits.
create or replace function public.prepare_confirmed_reservation_records(
  p_project_id uuid,
  p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype;
  q public.quotations%rowtype;
  e_id uuid;
  method text;
  invoice_id uuid;
  paid numeric:=0;
  item record;
  extra text;
  extra_code text;
  extra_price numeric;
  service_price numeric;
begin
  if auth.uid() is not null and auth.uid()<>p_actor_id then
    raise exception 'El actor no coincide con la sesión.';
  end if;

  select * into p from projects
  where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Reserva no encontrada.'; end if;

  method:=case when upper(coalesce(p.operations->>'reservationMethod','MANUAL'))='AUTOMATIC'
    then 'AUTOMATIC' else 'MANUAL' end;

  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
  values(p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,'UPCOMING',p_actor_id,p_actor_id)
  on conflict(project_id) do update set customer_id=excluded.customer_id,orbit_event_id=excluded.orbit_event_id,
    event_type=excluded.event_type,event_date=excluded.event_date,updated_by=excluded.updated_by,updated_at=now()
  returning id into e_id;

  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
  values(p.customer_id,p.id,e_id,method,'CONFIRMED',p_actor_id,p_actor_id)
  on conflict(project_id) do update set customer_id=excluded.customer_id,event_id=excluded.event_id,
    reservation_method=excluded.reservation_method,status='CONFIRMED',updated_by=excluded.updated_by,updated_at=now();

  select * into q from quotations where project_id=p.id and deleted_at is null
  order by case when status='ACCEPTED' then 0 else 1 end,created_at desc limit 1;
  if q.id is null then raise exception 'La reserva no tiene propuesta comercial.'; end if;

  update quotations set status='ACCEPTED',approved_by=coalesce(approved_by,p_actor_id),
    approved_at=coalesce(approved_at,now()),updated_by=p_actor_id where id=q.id;

  if not exists(select 1 from quotation_items where quotation_id=q.id) then
    for item in select * from project_services where project_id=p.id loop
      select coalesce((select unit_price from commercial_prices where category='SERVICE'
        and code=item.service_code and enabled and deleted_at is null
        and (duration_hours=item.duration_hours or duration_hours is null)
        order by (duration_hours=item.duration_hours) desc limit 1),0) into service_price;
      insert into quotation_items(quotation_id,item_type,code,label,quantity,unit_price,total,
        official_unit_price,official_total,final_unit_price,final_total)
      values(q.id,'SERVICE',item.service_code,item.service_code,1,service_price,service_price,
        service_price,service_price,service_price,service_price);

      for extra in select jsonb_array_elements_text(coalesce(item.extras,'[]'::jsonb)) loop
        if upper(extra) like '%TRANSPORT%' then continue; end if;
        extra_code:=case when upper(extra) like '%MAGNET%' or upper(extra) like '%IMAN%' then 'UNLIMITED_MAGNETS'
          when upper(extra) like '%SCRAPBOOK%' then 'SCRAPBOOK' when upper(extra) like '%QR%' then 'QR'
          when upper(extra) like '%BRANDING%' then 'BRANDING' else upper(replace(extra,' ','_')) end;
        select coalesce((select unit_price from commercial_prices where category='EXTRA'
          and code=extra_code and enabled and deleted_at is null order by display_order limit 1),0) into extra_price;
        if upper(extra) like '%INCLUID%' or upper(extra) like '%BENEFICIO%' then extra_price:=0; end if;
        if not exists(select 1 from quotation_items where quotation_id=q.id and code=extra_code) then
          insert into quotation_items(quotation_id,item_type,code,label,quantity,unit_price,total,
            official_unit_price,official_total,final_unit_price,final_total,metadata)
          values(q.id,'EXTRA',extra_code,extra,1,extra_price,extra_price,extra_price,extra_price,
            extra_price,extra_price,jsonb_build_object('source','MASTER_DATA','included',extra_price=0));
        end if;
      end loop;
    end loop;
    if coalesce(q.transport_total,0)>0 then
      insert into quotation_items(quotation_id,item_type,code,label,quantity,unit_price,total,
        official_unit_price,official_total,final_unit_price,final_total)
      values(q.id,'TRANSPORT','TRANSPORT','Transporte',1,q.transport_total,q.transport_total,
        q.transport_total,q.transport_total,q.transport_total,q.transport_total);
    end if;
  end if;

  paid:=greatest(0,least(coalesce(q.final_customer_price,q.grand_total,0),coalesce(
    (p.finance->>'reservationAmount')::numeric,(p.finance->>'reservation')::numeric,
    (p.finance->>'deposit')::numeric,0)));
  select id into invoice_id from invoices where project_id=p.id and deleted_at is null
  order by created_at desc limit 1;
  if invoice_id is null then
    insert into invoices(invoice_number,customer_id,project_id,quotation_id,orbit_event_id,customer_type,
      status,issue_date,payment_term,amount,paid_amount,notes,created_by,updated_by,issued_by,issued_at)
    values('FAC-'||extract(year from current_date)::int||'-'||upper(left(replace(p.id::text,'-',''),8)),
      p.customer_id,p.id,q.id,p.orbit_event_id,case when p.project_type='Corporate' then 'CORPORATE' else 'PRIVATE' end,
      case when paid>0 then 'PARTIALLY_PAID' else 'PENDING' end,current_date,'CASH',
      coalesce(q.final_customer_price,q.grand_total,0),paid,'Generada por Pipeline Único de Reserva',
      p_actor_id,p_actor_id,p_actor_id,now()) returning id into invoice_id;
  end if;

  return jsonb_build_object('projectId',p.id,'customerId',p.customer_id,'crmEventId',e_id,
    'quotationId',q.id,'invoiceId',invoice_id,'method',method,'timelineBoundary','DEFERRED');
end $$;

revoke all on function public.prepare_confirmed_reservation_records(uuid,uuid) from public,anon;
grant execute on function public.prepare_confirmed_reservation_records(uuid,uuid) to authenticated,service_role;

-- Staff Portal brute-force protection. Five failed attempts for the same RUT
-- or network fingerprint produce a fifteen-minute temporary lock. Every
-- attempt remains audited and the existing failed-access trigger alerts Founder.
create index if not exists portal_attempts_staff_rut_time_idx
  on public.portal_access_attempts(normalized_rut_hash,attempted_at desc)
  where access_type='STAFF' and not succeeded;

create or replace function public.authenticate_staff_portal(
  p_rut text,p_pin text,p_ip_hash text,p_user_agent text,p_device text
) returns table(session_token text,staff_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare
  normalized text:=upper(regexp_replace(coalesce(p_rut,''),'[^0-9K]','','g'));
  rut_hash text:=encode(digest(normalized,'sha256'),'hex');
  member public.staff%rowtype;
  token text;
  expiry timestamptz:=now()+interval '12 hours';
  failed_count integer;
begin
  select * into member from public.staff where upper(regexp_replace(coalesce(rut,''),'[^0-9K]','','g'))=normalized
    and status='ACTIVE' and deleted_at is null limit 1;
  select count(*) into failed_count from public.portal_access_attempts
    where access_type='STAFF' and not succeeded and attempted_at>now()-interval '15 minutes'
      and (normalized_rut_hash=rut_hash or ip_hash=p_ip_hash);
  if failed_count>=5 then
    insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device)
    values('STAFF',rut_hash,false,member.id,p_ip_hash,p_user_agent,p_device);
    return;
  end if;
  if member.id is null or not member.portal_enabled or member.pin_hash is null
    or crypt(coalesce(p_pin,''),member.pin_hash)<>member.pin_hash then
    insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device)
    values('STAFF',rut_hash,false,member.id,p_ip_hash,p_user_agent,p_device);
    return;
  end if;
  insert into public.portal_access_attempts(access_type,normalized_rut_hash,succeeded,staff_id,ip_hash,user_agent,device)
  values('STAFF',rut_hash,true,member.id,p_ip_hash,p_user_agent,p_device);
  token:=encode(gen_random_bytes(32),'hex');
  insert into public.portal_access_sessions(access_type,staff_id,token_hash,expires_at,ip_hash,user_agent,device)
  values('STAFF',member.id,encode(digest(token,'sha256'),'hex'),expiry,p_ip_hash,p_user_agent,p_device);
  return query select token,member.id,expiry;
end $$;

revoke all on function public.authenticate_staff_portal(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.authenticate_staff_portal(text,text,text,text,text) to service_role;

commit;
