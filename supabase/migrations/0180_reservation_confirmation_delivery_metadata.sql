begin;

alter table public.communications
  add column if not exists commercial_document_reference text,
  add column if not exists portal_destination_type text;

comment on column public.communications.commercial_document_reference is
  'Customer-facing filename of the formal commercial document attached to this communication.';
comment on column public.communications.portal_destination_type is
  'Non-secret destination classification. Customer portal tokens and credentials are never stored here.';

commit;
