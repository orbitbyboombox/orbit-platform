begin;

-- Explicit Founder-approved operational destination for critical Staff alerts.
update public.company_settings
set operations_email='operaciones@bbox.cl',
    approval_reason='Canal operacional oficial para cancelaciones de Staff',
    updated_at=now()
where settings_key='PRIMARY' and operations_email is distinct from 'operaciones@bbox.cl';

commit;
