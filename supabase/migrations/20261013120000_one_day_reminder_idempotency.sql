begin;

create unique index if not exists communications_one_day_reminder_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'PRE_EVENT_REMINDER_24H'
    and request_key is not null;

create unique index if not exists internal_notifications_staff_one_day_correlation_uidx
  on public.internal_notifications(correlation_id)
  where notification_type = 'STAFF_PRE_EVENT_REMINDER_24H'
    and correlation_id is not null;

commit;
