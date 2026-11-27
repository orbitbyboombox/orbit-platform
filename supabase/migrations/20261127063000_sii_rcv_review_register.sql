create table public.sii_rcv_imports (
  id uuid primary key default gen_random_uuid(),
  company_rut text not null,
  register text not null check (register in ('Compras','Ventas')),
  period date not null check (extract(day from period) = 1),
  source_name text not null,
  source_bytes bytea not null check (octet_length(source_bytes) between 1 and 1000000),
  source_hash text not null,
  imported_by uuid not null,
  imported_at timestamptz not null default now(),
  unique (company_rut, register, period, source_hash)
);

create table public.sii_rcv_documents (
  id uuid primary key default gen_random_uuid(),
  company_rut text not null,
  issuer_rut text not null,
  dte_type text not null,
  folio text not null,
  original_import_id uuid not null references public.sii_rcv_imports(id),
  snapshot jsonb not null,
  unique (company_rut, issuer_rut, dte_type, folio)
);

create table public.sii_rcv_import_observations (
  import_id uuid not null references public.sii_rcv_imports(id),
  document_id uuid not null references public.sii_rcv_documents(id),
  snapshot jsonb not null,
  differs boolean not null,
  primary key (import_id, document_id)
);

alter table public.sii_rcv_imports enable row level security;
alter table public.sii_rcv_documents enable row level security;
alter table public.sii_rcv_import_observations enable row level security;
revoke all on public.sii_rcv_imports, public.sii_rcv_documents, public.sii_rcv_import_observations from public, anon, authenticated;
grant select, insert on public.sii_rcv_imports, public.sii_rcv_documents, public.sii_rcv_import_observations to service_role;

create function public.store_sii_rcv_review(
  p_company text, p_register text, p_period date, p_name text, p_source text, p_actor uuid, p_documents jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  batch_id uuid;
  item jsonb;
  existing public.sii_rcv_documents%rowtype;
  original bytea := decode(p_source, 'base64');
  digest text := encode(sha256(original), 'hex');
  added int := 0;
  differences int := 0;
begin
  if jsonb_typeof(p_documents) is distinct from 'array' or jsonb_array_length(p_documents) > 2000 then
    raise exception 'Cantidad de documentos inválida';
  end if;

  insert into public.sii_rcv_imports (company_rut, register, period, source_name, source_bytes, source_hash, imported_by)
    values (p_company, p_register, p_period, p_name, original, digest, p_actor)
    on conflict (company_rut, register, period, source_hash) do nothing
    returning id into batch_id;

  if batch_id is null then
    return jsonb_build_object('repeated', true, 'added', 0, 'differences', 0);
  end if;

  for item in select value from jsonb_array_elements(p_documents) order by value->>'issuer', value->>'code', value->>'folio' loop
    insert into public.sii_rcv_documents (company_rut, issuer_rut, dte_type, folio, original_import_id, snapshot)
      values (p_company, item->>'issuer', item->>'code', item->>'folio', batch_id, item)
      on conflict (company_rut, issuer_rut, dte_type, folio) do nothing;

    select * into strict existing from public.sii_rcv_documents
      where company_rut = p_company and issuer_rut = item->>'issuer'
        and dte_type = item->>'code' and folio = item->>'folio';

    if existing.original_import_id = batch_id then added := added + 1; end if;
    if existing.snapshot <> item then differences := differences + 1; end if;
    insert into public.sii_rcv_import_observations (import_id, document_id, snapshot, differs)
      values (batch_id, existing.id, item, existing.snapshot <> item);
  end loop;

  return jsonb_build_object('repeated', false, 'added', added, 'differences', differences);
end;
$$;

revoke execute on function public.store_sii_rcv_review(text,text,date,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.store_sii_rcv_review(text,text,date,text,text,uuid,jsonb) to service_role;
