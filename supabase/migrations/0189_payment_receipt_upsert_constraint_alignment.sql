begin;

-- A payment owns at most one active canonical receipt document. Refuse to hide
-- historical ambiguity: Production must be clean before this invariant lands.
do $$
declare
  duplicate_payment uuid;
begin
  select payment_id
  into duplicate_payment
  from public.documents
  where document_type = 'PAYMENT_RECEIPT'
    and payment_id is not null
    and deleted_at is null
  group by payment_id
  having count(*) > 1
  limit 1;

  if duplicate_payment is not null then
    raise exception 'Duplicate active payment receipt documents exist; migration stopped without changing financial data.';
  end if;
end $$;

create unique index if not exists documents_active_payment_receipt_uq
  on public.documents (payment_id)
  where document_type = 'PAYMENT_RECEIPT'
    and payment_id is not null
    and deleted_at is null;

-- documents_idempotency_uq is a partial unique index. PostgreSQL can infer it
-- only when ON CONFLICT declares the same predicate. Repair every live shared
-- receipt writer without copying or forking their business logic.
do $migration$
declare
  function_signature regprocedure;
  function_definition text;
  repaired_definition text;
  target regprocedure;
begin
  foreach target in array array[
    'public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text,text,text)'::regprocedure,
    'public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text)'::regprocedure,
    'public.attach_receivable_payment_receipt(uuid,uuid,text,text,text,text,bigint)'::regprocedure
  ]
  loop
    function_signature := target;

    select pg_get_functiondef(function_signature)
    into function_definition;

    repaired_definition := regexp_replace(
      function_definition,
      'on\s+conflict\s*\(\s*idempotency_key\s*\)\s*do\s+update',
      'on conflict (idempotency_key) where idempotency_key is not null and deleted_at is null do update',
      'gi'
    );

    if repaired_definition = function_definition then
      raise exception 'Expected receipt ON CONFLICT clause was not found in %', function_signature;
    end if;

    execute repaired_definition;
  end loop;
end $migration$;

commit;
