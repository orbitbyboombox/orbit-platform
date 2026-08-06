begin;

create table if not exists public.master_data_entries (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('SERVICES','EVENT_TYPES','PAYROLL','COMPANY','DOCUMENT_TEMPLATES','SYSTEM_PARAMETERS')),
  code text not null,
  label text not null,
  enabled boolean not null default true,
  display_order integer not null default 0,
  configuration jsonb not null default '{}',
  version integer not null default 1,
  approval_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(domain, code)
);

alter table public.commercial_prices
  add column if not exists enabled boolean not null default true,
  add column if not exists display_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}';

create index if not exists master_data_entries_domain_order_idx on public.master_data_entries(domain,display_order,label);
alter table public.master_data_entries enable row level security;
create policy master_data_internal_read on public.master_data_entries for select using(public.is_internal_user());
create policy master_data_admin_write on public.master_data_entries for all using(public.can_administer()) with check(public.can_administer());
drop trigger if exists master_data_entries_touch on public.master_data_entries;
create trigger master_data_entries_touch before update on public.master_data_entries for each row execute function public.touch_versioned_row();
drop trigger if exists master_data_entries_audit on public.master_data_entries;
create trigger master_data_entries_audit after insert or update or delete on public.master_data_entries for each row execute function public.audit_row_change();

insert into public.master_data_entries(domain,code,label,display_order,configuration) values
('SERVICES','CLASSIC','Classic',10,'{"description":"Experiencia Classic","defaultDuration":3,"defaultCategory":"Fotografía"}'),
('SERVICES','POLAROID','Polaroid',20,'{"description":"Experiencia Polaroid","defaultDuration":3,"defaultCategory":"Fotografía"}'),
('SERVICES','BLACK_STUDIO','Black Studio',30,'{"description":"Experiencia Black Studio","defaultDuration":3,"defaultCategory":"Estudio"}'),
('SERVICES','BBOX360','BBOX360',40,'{"description":"Experiencia de video 360","defaultDuration":3,"defaultCategory":"Video"}'),
('SERVICES','LIGHTBOX','LightBox',50,'{"description":"Experiencia LightBox","defaultDuration":3,"defaultCategory":"Fotografía"}'),
('SERVICES','BOOMBALL','BoomBall',60,'{"description":"Experiencia BoomBall","defaultDuration":3,"defaultCategory":"Video"}'),
('SERVICES','HASHTAG','Hashtag',70,'{"description":"Experiencia Hashtag","defaultDuration":3,"defaultCategory":"Fotografía"}'),
('SERVICES','INSTABOX','Instabox',80,'{"description":"Experiencia Instabox","defaultDuration":3,"defaultCategory":"Fotografía"}'),
('SERVICES','VIDEO_LOUNGE','Video Lounge',90,'{"description":"Experiencia Video Lounge","defaultDuration":3,"defaultCategory":"Video"}'),
('EVENT_TYPES','WEDDING','Matrimonio',10,'{}'),('EVENT_TYPES','BIRTHDAY','Cumpleaños',20,'{}'),
('EVENT_TYPES','CORPORATE','Corporativo',30,'{}'),('EVENT_TYPES','GRADUATION','Graduación',40,'{}'),
('EVENT_TYPES','PUBLIC_EVENT','Evento público',50,'{}'),('EVENT_TYPES','PRIVATE_EVENT','Evento privado',60,'{}'),
('PAYROLL','OPERATOR','Pago operador',10,'{"unit":"EVENT"}'),('PAYROLL','ASSEMBLY','Montaje',20,'{"unit":"EVENT"}'),
('PAYROLL','DISASSEMBLY','Desmontaje',30,'{"unit":"EVENT"}'),('PAYROLL','TRANSPORT_BONUS','Bono de transporte',40,'{"unit":"EVENT"}'),
('PAYROLL','PARKING_RULES','Reglas de estacionamiento',50,'{"unit":"ACTUAL"}'),
('COMPANY','VAT','IVA',5,'{"percentage":19}'),('COMPANY','BUSINESS_INFORMATION','Información comercial',10,'{}'),('COMPANY','LEGAL_INFORMATION','Información legal',20,'{}'),
('COMPANY','BRANDING','Identidad de marca',30,'{}'),('COMPANY','EMAIL_FOOTER','Pie de correo',40,'{}'),
('COMPANY','CONTRACT_FOOTER','Pie de contrato',50,'{}'),('COMPANY','QUOTATION_FOOTER','Pie de cotización',60,'{}'),
('DOCUMENT_TEMPLATES','QUOTATION','Plantilla de cotización',10,'{}'),('DOCUMENT_TEMPLATES','AGREEMENT','Plantilla de acuerdo',20,'{}'),
('DOCUMENT_TEMPLATES','CUSTOMER_EMAIL','Correo al cliente',30,'{}'),('DOCUMENT_TEMPLATES','REMINDER_EMAIL','Correo recordatorio',40,'{}'),
('DOCUMENT_TEMPLATES','INTERNAL_NOTIFICATION','Notificación interna',50,'{}'),
('SYSTEM_PARAMETERS','CURRENCY','Moneda',10,'{"value":"CLP"}'),('SYSTEM_PARAMETERS','TIMEZONE','Zona horaria',20,'{"value":"America/Santiago"}'),
('SYSTEM_PARAMETERS','LANGUAGE','Idioma',30,'{"value":"es-CL"}'),('SYSTEM_PARAMETERS','DATE_FORMAT','Formato de fecha',40,'{"value":"dd-MM-yyyy"}'),
('SYSTEM_PARAMETERS','NUMBER_FORMAT','Formato numérico',50,'{"value":"es-CL"}'),('SYSTEM_PARAMETERS','REGIONAL_SETTINGS','Configuración regional',60,'{"value":"Chile"}')
on conflict(domain,code) do nothing;

update public.commercial_prices set display_order=case category when 'SERVICE' then 10 when 'EXTRA' then 20 else 30 end where display_order=0;

insert into public.commercial_prices(category,code,label,unit_price,pricing_status,rules,display_order) values
('EXTRA','ADDITIONAL_TRANSPORT','Transporte adicional',null,'REQUIRES_QUOTE','{}',70)
on conflict do nothing;

commit;
