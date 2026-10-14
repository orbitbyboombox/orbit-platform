begin;

create unique index if not exists communications_pre_event_admin_notice_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'PRE_EVENT_REMINDER_ADMIN_NOTICE'
    and request_key is not null;

create index if not exists communications_pre_event_admin_notice_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type = 'PRE_EVENT_REMINDER_ADMIN_NOTICE';

commit;
