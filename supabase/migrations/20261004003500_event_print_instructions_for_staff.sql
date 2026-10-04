alter table public.project_operational_contracts
  add column if not exists photo_style text,
  add column if not exists operator_print_notes text;

alter table public.project_operational_contracts
  drop constraint if exists project_operational_contracts_photo_style_check;

alter table public.project_operational_contracts
  add constraint project_operational_contracts_photo_style_check
  check (photo_style is null or photo_style in ('COLOR','BLACK_WHITE','SEPIA'));

comment on column public.project_operational_contracts.photo_style is
  'Canonical operator photo output style: COLOR, BLACK_WHITE, SEPIA.';
comment on column public.project_operational_contracts.operator_print_notes is
  'Founder/admin print instruction note shown to assigned staff.';
