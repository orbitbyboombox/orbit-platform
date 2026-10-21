begin;

alter table public.projects
  add column if not exists bbox360_video_delivery_url text,
  add column if not exists bbox360_video_delivery_updated_at timestamptz,
  add column if not exists bbox360_video_delivery_updated_by uuid references auth.users(id);

create unique index if not exists communications_bbox360_video_delivery_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'BBOX360_VIDEO_DELIVERY' and request_key is not null;

create index if not exists communications_bbox360_video_delivery_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type = 'BBOX360_VIDEO_DELIVERY';

comment on column public.projects.bbox360_video_delivery_url is
  'Founder-approved HTTPS link for BBOX 360 videos. It never triggers an automatic customer communication.';
comment on column public.projects.bbox360_video_delivery_updated_at is
  'Last explicit review of the BBOX 360 video link by Founder or Administration.';
comment on column public.projects.bbox360_video_delivery_updated_by is
  'Administrator who last reviewed the BBOX 360 video link.';

commit;
