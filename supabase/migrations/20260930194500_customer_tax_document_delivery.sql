begin;

create index if not exists communications_tax_document_delivery_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type='TAX_DOCUMENT_DELIVERY';

create index if not exists communications_tax_document_delivery_document_idx
  on public.communications((context_snapshot->>'documentId'), occurred_at desc)
  where communication_type='TAX_DOCUMENT_DELIVERY';

create unique index if not exists communications_tax_document_delivery_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type='TAX_DOCUMENT_DELIVERY' and request_key is not null;

commit;
