begin;

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

  select * into p
  from projects
  where id=p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Reserva no encontrada.'; end if;

  method:=case
    when upper(coalesce(p.operations->>'reservationMethod','MANUAL'))='AUTOMATIC'
      then 'AUTOMATIC'
    else 'MANUAL'
  end;

  insert into crm_events(
    customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by
  ) values(
    p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,'UPCOMING',p_actor_id,p_actor_id
  )
  on conflict(project_id) do update set
    customer_id=excluded.customer_id,
    orbit_event_id=excluded.orbit_event_id,
    event_type=excluded.event_type,
    event_date=excluded.event_date,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning id into e_id;

  insert into crm_reservations(
    customer_id,project_id,event_id,reservation_method,status,created_by,updated_by
  ) values(
    p.customer_id,p.id,e_id,method,'CONFIRMED',p_actor_id,p_actor_id
  )
  on conflict(project_id) do update set
    customer_id=excluded.customer_id,
    event_id=excluded.event_id,
    reservation_method=excluded.reservation_method,
    status='CONFIRMED',
    updated_by=excluded.updated_by,
    updated_at=now();

  select * into q
  from quotations
  where project_id=p.id and deleted_at is null
  order by case when status='ACCEPTED' then 0 else 1 end,created_at desc
  limit 1;
  if q.id is null then raise exception 'La reserva no tiene propuesta comercial.'; end if;

  update quotations set
    status='ACCEPTED',
    approved_by=coalesce(approved_by,p_actor_id),
    approved_at=coalesce(approved_at,now()),
    updated_by=p_actor_id
  where id=q.id;

  if not exists(select 1 from quotation_items where quotation_id=q.id) then
    for item in select * from project_services where project_id=p.id loop
      select coalesce((
        select unit_price
        from commercial_prices
        where category='SERVICE'
          and code=item.service_code
          and enabled
          and deleted_at is null
          and (duration_hours=item.duration_hours or duration_hours is null)
        order by (duration_hours=item.duration_hours) desc
        limit 1
      ),0) into service_price;

      insert into quotation_items(
        quotation_id,item_type,code,label,quantity,unit_price,total,
        official_unit_price,official_total,final_unit_price,final_total
      ) values(
        q.id,'SERVICE',item.service_code,item.service_code,1,
        service_price,service_price,service_price,service_price,service_price,service_price
      );

      for extra in
        select jsonb_array_elements_text(coalesce(item.extras,'[]'::jsonb))
      loop
        -- Transport is stored once as a TRANSPORT quotation line below. It is
        -- not an EXTRA price and must never be looked up as EXTRA/TRANSPORTE.
        if upper(extra) like '%TRANSPORT%' then continue; end if;

        extra_code:=case
          when upper(extra) like '%MAGNET%' or upper(extra) like '%IMAN%'
            then 'UNLIMITED_MAGNETS'
          when upper(extra) like '%SCRAPBOOK%' then 'SCRAPBOOK'
          when upper(extra) like '%QR%' then 'QR'
          when upper(extra) like '%BRANDING%' then 'BRANDING'
          else upper(replace(extra,' ','_'))
        end;

        select coalesce((
          select unit_price
          from commercial_prices
          where category='EXTRA'
            and code=extra_code
            and enabled
            and deleted_at is null
          order by display_order
          limit 1
        ),0) into extra_price;

        if upper(extra) like '%INCLUID%' or upper(extra) like '%BENEFICIO%' then
          extra_price:=0;
        end if;

        if not exists(
          select 1 from quotation_items
          where quotation_id=q.id and code=extra_code
        ) then
          insert into quotation_items(
            quotation_id,item_type,code,label,quantity,unit_price,total,
            official_unit_price,official_total,final_unit_price,final_total,metadata
          ) values(
            q.id,'EXTRA',extra_code,extra,1,extra_price,extra_price,
            extra_price,extra_price,extra_price,extra_price,
            jsonb_build_object('source','MASTER_DATA','included',extra_price=0)
          );
        end if;
      end loop;
    end loop;

    if coalesce(q.transport_total,0)>0 then
      insert into quotation_items(
        quotation_id,item_type,code,label,quantity,unit_price,total,
        official_unit_price,official_total,final_unit_price,final_total
      ) values(
        q.id,'TRANSPORT','TRANSPORT','Transporte',1,q.transport_total,q.transport_total,
        q.transport_total,q.transport_total,q.transport_total,q.transport_total
      );
    end if;
  end if;

  paid:=greatest(
    0,
    least(
      coalesce(q.final_customer_price,q.grand_total,0),
      coalesce(
        (p.finance->>'reservationAmount')::numeric,
        (p.finance->>'reservation')::numeric,
        (p.finance->>'deposit')::numeric,
        0
      )
    )
  );

  select id into invoice_id
  from invoices
  where project_id=p.id and deleted_at is null
  order by created_at desc
  limit 1;

  if invoice_id is null then
    insert into invoices(
      invoice_number,customer_id,project_id,quotation_id,orbit_event_id,
      customer_type,status,issue_date,payment_term,amount,paid_amount,notes,
      created_by,updated_by,issued_by,issued_at
    ) values(
      'FAC-'||extract(year from current_date)::int||'-'||upper(left(replace(p.id::text,'-',''),8)),
      p.customer_id,p.id,q.id,p.orbit_event_id,
      case when p.project_type='Corporate' then 'CORPORATE' else 'PRIVATE' end,
      case when paid>0 then 'PARTIALLY_PAID' else 'PENDING' end,
      current_date,'CASH',coalesce(q.final_customer_price,q.grand_total,0),paid,
      'Generada por Pipeline Único de Reserva',p_actor_id,p_actor_id,p_actor_id,now()
    ) returning id into invoice_id;
  end if;

  if not exists(
    select 1 from timeline_events
    where correlation_id='unified-reservation-records:'||p.id
  ) then
    insert into timeline_events(
      customer_id,project_id,crm_event_id,orbit_event_id,event_type,title,
      description,actor_id,actor_label,source,action,entity_type,entity_id,
      human_message,correlation_id,new_state,created_by
    ) values(
      p.customer_id,p.id,e_id,p.orbit_event_id,'UNIFIED_RESERVATION_PREPARED',
      'Reserva preparada por pipeline único',
      'CRM, evento, propuesta y cobranza normalizados.',p_actor_id,'ORBIT','System',
      'UNIFIED_RESERVATION_PREPARED','Project',p.id,'Registros de reserva unificados.',
      'unified-reservation-records:'||p.id,'CONFIRMED',p_actor_id
    );
  end if;

  return jsonb_build_object(
    'projectId',p.id,
    'customerId',p.customer_id,
    'crmEventId',e_id,
    'quotationId',q.id,
    'invoiceId',invoice_id,
    'method',method
  );
end $$;

revoke all on function public.prepare_confirmed_reservation_records(uuid,uuid) from public,anon;
grant execute on function public.prepare_confirmed_reservation_records(uuid,uuid) to authenticated,service_role;

commit;
