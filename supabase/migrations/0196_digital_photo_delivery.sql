begin;

alter table public.projects
  add column if not exists digital_photo_delivery_url text,
  add column if not exists digital_photo_delivery_updated_at timestamptz,
  add column if not exists digital_photo_delivery_updated_by uuid references auth.users(id);

alter table public.communications
  add column if not exists delivery_reference text;

create unique index if not exists communications_digital_photo_delivery_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'DIGITAL_PHOTO_DELIVERY'
    and request_key is not null;

create index if not exists communications_digital_photo_delivery_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type = 'DIGITAL_PHOTO_DELIVERY';

comment on column public.projects.digital_photo_delivery_url is
  'Current Founder-approved HTTPS download link for this Event. It never triggers an automatic customer communication.';
comment on column public.projects.digital_photo_delivery_updated_at is
  'Last time the current digital photo delivery link was explicitly reviewed by Founder or Administration.';
comment on column public.projects.digital_photo_delivery_updated_by is
  'Administrator who last reviewed the current digital photo delivery link.';
comment on column public.communications.delivery_reference is
  'Immutable customer delivery reference used by this communication attempt.';

commit;
