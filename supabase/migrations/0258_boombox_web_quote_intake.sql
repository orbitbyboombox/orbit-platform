-- New intake only: never creates/modifies customers, projects, quotations or payments.
create table public.web_quote_leads (
  solicitud_id text primary key check (solicitud_id ~ '^[a-zA-Z0-9_-]{16,120}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  is_test boolean not null default false,
  status text not null default 'NEW' check (status in ('NEW','REVIEWED','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  review_notes text not null default '' check (length(review_notes) <= 2000),
  notification_recipient text not null check (notification_recipient in ('contacto@bbox.cl','matias.maira.larrain@gmail.com')),
  notification_status text not null default 'PENDING' check (notification_status in ('PENDING','SENDING','ACCEPTED','FAILED','UNKNOWN')),
  notification_attempted_at timestamptz,
  notification_updated_at timestamptz,
  notification_provider_id text,
  notification_error_code text,
  constraint quote_recipient_environment check (
    (is_test and notification_recipient = 'matias.maira.larrain@gmail.com') or
    (not is_test and notification_recipient = 'contacto@bbox.cl')
  )
);
create index web_quote_leads_created on public.web_quote_leads(created_at desc);
alter table public.web_quote_leads enable row level security;
revoke all on public.web_quote_leads from anon, authenticated;
grant select on public.web_quote_leads to authenticated;
grant all on public.web_quote_leads to service_role;
create policy web_quote_admin_read on public.web_quote_leads for select to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role in ('CEO','ADMINISTRATOR')));

create function public.accept_boombox_web_quote(p_payload jsonb, p_is_test boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.web_quote_leads;
  v_id text := p_payload->>'solicitudId';
  v_inserted boolean;
begin
  insert into public.web_quote_leads(solicitud_id,payload,is_test,notification_recipient)
  values (v_id,p_payload,p_is_test,case when p_is_test then 'matias.maira.larrain@gmail.com' else 'contacto@bbox.cl' end)
  on conflict (solicitud_id) do nothing returning * into v_row;
  v_inserted := found;
  if not v_inserted then
    select * into strict v_row from public.web_quote_leads where solicitud_id = v_id for update;
    if v_row.payload <> p_payload or v_row.is_test <> p_is_test then
      raise exception using errcode = '23505', message = 'REQUEST_ID_CONFLICT';
    end if;
  end if;
  return jsonb_build_object('solicitudId',v_id,'duplicate',not v_inserted,'notificationStatus',v_row.notification_status);
end;
$$;
revoke all on function public.accept_boombox_web_quote(jsonb,boolean) from public, anon, authenticated;
grant execute on function public.accept_boombox_web_quote(jsonb,boolean) to service_role;
comment on column public.web_quote_leads.notification_status is 'ACCEPTED = Gmail provider accepted; NOT proof of inbox delivery. SENDING/UNKNOWN require reconciliation before any resend.';
