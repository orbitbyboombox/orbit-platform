create or replace view public.tributary_internal_ledger as
select i.id as source_id, 'VENTA'::text as source_type, i.project_id, i.customer_id,
  i.tributary_document_type as document_type, i.invoice_number as reference, i.issue_date as occurred_on,
  case when valid.complete then amounts.net end as net_amount,
  case when valid.complete then amounts.vat end as vat_amount,
  case when valid.complete then amounts.exempt end as exempt_amount,
  case when valid.complete then amounts.total end as total_amount,
  case when valid.complete is not true then 'DESGLOSE_PENDIENTE'
       when i.status in ('PAID','PARTIALLY_PAID') then 'PAGADO' else i.status end as payment_status,
  i.record_origin
from public.invoices i
cross join lateral (select i.tributary_snapshot -> 'totals' as totals) snapshot
cross join lateral (
  select case when jsonb_typeof(totals -> 'net') = 'number' then (totals ->> 'net')::numeric end as net,
    case when jsonb_typeof(totals -> 'vat') = 'number' then (totals ->> 'vat')::numeric end as vat,
    case when jsonb_typeof(totals -> 'exempt') = 'number' then (totals ->> 'exempt')::numeric end as exempt,
    case when jsonb_typeof(totals -> 'total') = 'number' then (totals ->> 'total')::numeric end as total
) amounts
cross join lateral (
  select net >= 0 and vat >= 0 and exempt >= 0
    and total = net + vat + exempt and total = i.amount as complete
) valid
where i.deleted_at is null and i.record_origin = 'PRE_SII'
union all select d.id,'DOCUMENTO_SII',d.project_id,d.customer_id,d.external_tax_document_type,d.external_folio,d.external_issue_date,coalesce(d.external_net_amount,0),coalesce(d.external_tax_amount,0),0,coalesce(d.external_total_amount,0),coalesce(d.external_document_status,'ADJUNTADO'),'EXTERNAL_SII' from public.documents d where d.deleted_at is null and d.external_folio is not null
union all select e.id,'COMPRA',e.project_id,null,e.document_type,e.document_number,e.occurred_on,coalesce(e.subtotal,0),coalesce(e.vat,0),case when coalesce(e.vat,0)=0 then e.total else 0 end,e.total,e.status,'EXPENSE' from public.expenses e where e.deleted_at is null;
