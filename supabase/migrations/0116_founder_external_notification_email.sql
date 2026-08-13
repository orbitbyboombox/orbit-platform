begin;

-- Keep BOOMBOX operational addresses as the public identity while delivering
-- internal Founder alerts to an external inbox that Gmail will not collapse
-- into the sender's Sent folder.
update public.company_settings
set email_configuration = coalesce(email_configuration, '{}'::jsonb) ||
      jsonb_build_object(
        'founderNotificationEmail', 'matias.maira.larrain@gmail.com'
      ),
    approval_reason = 'Founder external inbox for reservation and Staff cancellation alerts',
    updated_at = now()
where settings_key = 'PRIMARY'
  and coalesce(email_configuration ->> 'founderNotificationEmail', '')
      is distinct from 'matias.maira.larrain@gmail.com';

commit;
