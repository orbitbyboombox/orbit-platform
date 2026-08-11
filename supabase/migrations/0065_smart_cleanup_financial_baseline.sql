begin;

create or replace function public.execute_go_live_smart_cleanup_service(
  p_confirmation text,
  p_keep_project_ids uuid[],
  p_external_projects integer,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  protected_table record;
  victoria_project public.projects%rowtype;
  soledad_project public.projects%rowtype;
  victoria_quote uuid;
  soledad_quote uuid;
  victoria_agreement uuid;
  soledad_agreement uuid;
  victoria_invoice uuid;
  soledad_invoice uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_actor
      and role in ('CEO', 'ADMINISTRATOR')
  ) then
    raise exception 'INVALID_FOUNDER_ACTOR';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('app.production_initialization', 'on', true);

  select p.*
  into victoria_project
  from public.projects p
  join public.customers c on c.id = p.customer_id
  join lateral (
    select coalesce(q.final_customer_price, q.grand_total, 0) as total
    from public.quotations q
    where q.project_id = p.id and q.deleted_at is null
    order by case when q.status = 'ACCEPTED' then 0 else 1 end, q.created_at desc
    limit 1
  ) quotation on true
  where p.id = any(p_keep_project_ids)
    and lower(trim(c.full_name)) like 'victoria%'
    and quotation.total = 330000;

  select p.*
  into soledad_project
  from public.projects p
  join public.customers c on c.id = p.customer_id
  join lateral (
    select coalesce(q.final_customer_price, q.grand_total, 0) as total
    from public.quotations q
    where q.project_id = p.id and q.deleted_at is null
    order by case when q.status = 'ACCEPTED' then 0 else 1 end, q.created_at desc
    limit 1
  ) quotation on true
  where p.id = any(p_keep_project_ids)
    and (
      lower(trim(c.full_name)) like '%soledad provens%'
      or lower(trim(coalesce(c.company, ''))) = 'soledad provens'
      or lower(trim(coalesce(p.name, ''))) = 'soledad provens'
    )
    and quotation.total = 580000;

  if victoria_project.id is null or soledad_project.id is null then
    raise exception 'Los dos registros reales no pudieron validarse antes de reconstruir Finanzas.';
  end if;

  select id into victoria_quote
  from public.quotations
  where project_id = victoria_project.id and deleted_at is null
  order by case when status = 'ACCEPTED' then 0 else 1 end, created_at desc
  limit 1;
  select id into soledad_quote
  from public.quotations
  where project_id = soledad_project.id and deleted_at is null
  order by case when status = 'ACCEPTED' then 0 else 1 end, created_at desc
  limit 1;
  select id into victoria_agreement from public.agreements where project_id = victoria_project.id and deleted_at is null order by created_at desc limit 1;
  select id into soledad_agreement from public.agreements where project_id = soledad_project.id and deleted_at is null order by created_at desc limit 1;

  select id into victoria_invoice
  from public.invoices
  where project_id = victoria_project.id and deleted_at is null
  order by created_at desc
  limit 1;

  if victoria_invoice is null then
    insert into public.invoices(
      invoice_number, customer_id, project_id, quotation_id, agreement_id,
      orbit_event_id, customer_type, status, issue_date, payment_term,
      amount, paid_amount, notes, created_by, updated_by
    ) values (
      'GL-' || replace(victoria_project.orbit_event_id, 'ORB-', ''),
      victoria_project.customer_id, victoria_project.id, victoria_quote, victoria_agreement,
      victoria_project.orbit_event_id, 'PRIVATE', 'PENDING', current_date, 'CASH',
      330000, 165000, 'Saldo real preservado durante Smart Cleanup Go Live.', p_actor, p_actor
    ) returning id into victoria_invoice;
  else
    update public.invoices
    set amount = 330000,
        paid_amount = 165000,
        status = 'PARTIALLY_PAID',
        notes = concat_ws(E'\n', nullif(notes, ''), 'Saldo real preservado durante Smart Cleanup Go Live.'),
        updated_by = p_actor
    where id = victoria_invoice;
  end if;

  if not exists (
    select 1 from public.invoice_payments
    where invoice_id = victoria_invoice
      and reference = 'GO-LIVE-VICTORIA-165000'
  ) then
    insert into public.invoice_payments(
      invoice_id, amount, paid_at, method, reference, reason, created_by
    ) values (
      victoria_invoice, 165000, now(), 'TRANSFER', 'GO-LIVE-VICTORIA-165000',
      'Pago real inicial preservado para Go Live.', p_actor
    );
  end if;

  select id into soledad_invoice
  from public.invoices
  where project_id = soledad_project.id and deleted_at is null
  order by created_at desc
  limit 1;

  if soledad_invoice is null then
    insert into public.invoices(
      invoice_number, customer_id, project_id, quotation_id, agreement_id,
      orbit_event_id, customer_type, status, issue_date, payment_term,
      amount, paid_amount, notes, created_by, updated_by
    ) values (
      'GL-' || replace(soledad_project.orbit_event_id, 'ORB-', ''),
      soledad_project.customer_id, soledad_project.id, soledad_quote, soledad_agreement,
      soledad_project.orbit_event_id, 'CORPORATE', 'PENDING', current_date, 'DAYS_30',
      580000, 0, 'Crédito empresa a 30 días preservado durante Smart Cleanup Go Live.', p_actor, p_actor
    ) returning id into soledad_invoice;
  else
    update public.invoices
    set amount = 580000,
        paid_amount = 0,
        customer_type = 'CORPORATE',
        payment_term = 'DAYS_30',
        status = 'PENDING',
        notes = concat_ws(E'\n', nullif(notes, ''), 'Crédito empresa a 30 días preservado durante Smart Cleanup Go Live.'),
        updated_by = p_actor
    where id = soledad_invoice;
  end if;

  for protected_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('project_id', 'customer_id')
      and c.table_name not in ('projects', 'customers', 'smart_cleanup_runs', 'production_initialization_runs')
  loop
    execute format('alter table public.%I disable trigger user', protected_table.table_name);
  end loop;

  begin
    result := public.execute_go_live_smart_cleanup(
      p_confirmation,
      p_keep_project_ids,
      p_external_projects
    );
  exception when others then
    for protected_table in
      select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public'
        and c.column_name in ('project_id', 'customer_id')
        and c.table_name not in ('projects', 'customers', 'smart_cleanup_runs', 'production_initialization_runs')
    loop
      execute format('alter table public.%I enable trigger user', protected_table.table_name);
    end loop;
    raise;
  end;

  for protected_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('project_id', 'customer_id')
      and c.table_name not in ('projects', 'customers', 'smart_cleanup_runs', 'production_initialization_runs')
  loop
    execute format('alter table public.%I enable trigger user', protected_table.table_name);
  end loop;

  return result;
end
$$;

commit;
