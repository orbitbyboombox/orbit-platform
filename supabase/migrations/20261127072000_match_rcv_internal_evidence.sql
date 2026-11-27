create function public.sii_rcv_match_internal(p_company text,p_start date,p_end date)
returns table(document_key text, match_status text, project_id uuid, pdf_id uuid, xml_id uuid, paid numeric, balance numeric, expense_id uuid)
language sql stable set search_path = '' as $$
  with source as (
    select r.register, r.snapshot->>'key' as key,
      regexp_replace(upper(r.snapshot->>'rut'),'[^0-9K]','','g') as rut,
      r.snapshot->>'folio' as folio,
      (r.snapshot->>'total')::numeric as total,
      case r.snapshot->>'code' when '33' then 'FACTURA' when '34' then 'FACTURA_EXENTA'
        when '39' then 'BOLETA' when '56' then 'NOTA_DEBITO' when '61' then 'NOTA_CREDITO' end as kind
    from public.sii_rcv_period_documents(p_company,p_start,p_end) r
  )
  select s.key,
    case
      when s.register='Ventas' and (v.candidates>1 or v.pdf_count>1 or v.xml_count>1) then 'AMBIGUOUS'
      when s.register='Ventas' and v.candidates=1 then 'MATCHED'
      when s.register='Compras' and g.candidates>1 then 'AMBIGUOUS'
      when s.register='Compras' and g.candidates=1 then 'MATCHED'
      else 'PENDING'
    end,
    case when v.candidates=1 and v.pdf_count<=1 and v.xml_count<=1 then i.project_id
      when g.candidates=1 then g.project end,
    case when v.candidates=1 and v.pdf_count=1 and v.xml_count<=1 then v.pdf end,
    case when v.candidates=1 and v.xml_count=1 and v.pdf_count<=1 then v.xml end,
    case when v.candidates=1 and v.pdf_count<=1 and v.xml_count<=1 then i.paid_amount end,
    case when v.candidates=1 and v.pdf_count<=1 and v.xml_count<=1 then i.amount-i.paid_amount end,
    case when g.candidates=1 then g.expense end
  from source s
  left join lateral (
    select count(distinct d.invoice_id) as candidates,(array_agg(d.invoice_id order by d.id))[1] as invoice,
      count(*) filter(where d.mime_type='application/pdf') as pdf_count,
      count(*) filter(where d.mime_type in ('application/xml','text/xml')) as xml_count,
      (array_agg(d.id order by d.id) filter(where d.mime_type='application/pdf'))[1] as pdf,
      (array_agg(d.id order by d.id) filter(where d.mime_type in ('application/xml','text/xml')))[1] as xml
    from public.documents d join public.invoices f on f.id=d.invoice_id and f.project_id=d.project_id and f.customer_id=d.customer_id
    where s.register='Ventas' and d.deleted_at is null and f.deleted_at is null and f.record_origin is distinct from 'PRE_SII'
      and d.external_tax_document_type=s.kind and d.external_folio=s.folio and d.external_total_amount=s.total and f.amount=s.total
      and s.rut<>'' and regexp_replace(upper(d.external_customer_tax_id),'[^0-9K]','','g')=s.rut
  ) v on true
  left join public.invoices i on i.id=v.invoice
  left join lateral (
    select count(*) as candidates,(array_agg(e.id order by e.id))[1] as expense,(array_agg(e.project_id order by e.id))[1] as project
    from public.expenses e
    where s.register='Compras' and s.kind in ('FACTURA','FACTURA_EXENTA') and e.deleted_at is null
      and e.approved_at is not null and e.document_type in ('INVOICE',s.kind) and e.document_number=s.folio and e.total=s.total
      and s.rut<>'' and regexp_replace(upper(e.supplier_rut),'[^0-9K]','','g')=s.rut
  ) g on true
$$;
revoke execute on function public.sii_rcv_match_internal(text,date,date) from public, anon, authenticated;
grant execute on function public.sii_rcv_match_internal(text,date,date) to service_role;
