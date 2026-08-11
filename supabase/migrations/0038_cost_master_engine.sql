begin;

create table if not exists public.cost_master_entries(
  id uuid primary key default gen_random_uuid(),
  category text not null check(category in('PAPER','PHOTO_PRODUCTION','OPERATOR','ASSEMBLY','FUEL','TRANSPORT_OVERRIDE','OTHER')),
  code text not null unique,
  label text not null,
  amount numeric(14,4),
  quantity numeric(14,4),
  unit text not null,
  enabled boolean not null default true,
  display_order integer not null default 0,
  metadata jsonb not null default '{}',
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  approval_reason text,
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz
);

create table if not exists public.cost_master_history(
  id bigint generated always as identity primary key,
  cost_entry_id uuid not null,
  action text not null check(action in('INSERT','UPDATE','DELETE')),
  previous_value jsonb,
  new_value jsonb,
  reason text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create or replace function public.record_cost_master_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.cost_master_history(cost_entry_id,action,previous_value,new_value,reason,changed_by)
  values(coalesce(new.id,old.id),tg_op,case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end,coalesce(new.approval_reason,old.approval_reason),auth.uid());
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists cost_master_entries_touch on public.cost_master_entries;
create trigger cost_master_entries_touch before update on public.cost_master_entries for each row execute function public.touch_versioned_row();
drop trigger if exists cost_master_entries_audit on public.cost_master_entries;
create trigger cost_master_entries_audit after insert or update or delete on public.cost_master_entries for each row execute function public.audit_row_change();
drop trigger if exists cost_master_entries_history on public.cost_master_entries;
create trigger cost_master_entries_history after insert or update or delete on public.cost_master_entries for each row execute function public.record_cost_master_history();

alter table public.cost_master_entries enable row level security;
alter table public.cost_master_history enable row level security;
create policy cost_master_entries_internal_read on public.cost_master_entries for select using(public.is_internal_user());
create policy cost_master_entries_admin_write on public.cost_master_entries for all using(public.can_administer()) with check(public.can_administer());
create policy cost_master_history_internal_read on public.cost_master_history for select using(public.is_internal_user());
revoke update,delete on public.cost_master_history from authenticated;

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,display_order,metadata)
values
('PAPER','PAPER_BOX_COST','Costo caja de papel',260169,1400,'CLP/CAJA',10,'{"vatIncluded":true}'),
('PAPER','COST_PER_PHOTO','Costo por foto',185.835,1,'CLP/FOTO',20,'{"calculated":true,"formula":"PAPER_BOX_COST / PHOTOS_PER_BOX"}'),
('PHOTO_PRODUCTION','CLASSIC_PHOTOS_PER_HOUR','Producción Classic',60,1,'FOTOS/HORA',30,'{}'),
('PHOTO_PRODUCTION','POLAROID_PHOTOS_PER_HOUR','Producción Polaroid',70,1,'FOTOS/HORA',40,'{}'),
('PHOTO_PRODUCTION','BLACK_STUDIO_PHOTOS_PER_HOUR','Producción Black Studio',100,1,'FOTOS/HORA',50,'{}'),
('FUEL','DEFAULT_FUEL_COST','Costo combustible predeterminado',20000,1,'CLP/EVENTO',200,'{}'),
('TRANSPORT_OVERRIDE','MANUAL_TRANSPORT_OVERRIDE','Override manual de transporte',null,1,'CLP/EVENTO',210,'{"optional":true}')
on conflict(code) do nothing;

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,display_order)
select 'OPERATOR','OPERATOR_'||hours||'_HOURS','Operador · '||hours||' horas',0,hours,'CLP/EVENTO',60+hours
from generate_series(2,10) hours on conflict(code) do nothing;

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,display_order)
values ('ASSEMBLY','ASSEMBLY','Montaje',0,1,'CLP/EVENTO',100),('ASSEMBLY','DISASSEMBLY','Desmontaje',0,1,'CLP/EVENTO',110),('ASSEMBLY','ASSEMBLY_DISASSEMBLY','Montaje + Desmontaje',0,1,'CLP/EVENTO',120)
on conflict(code) do nothing;

commit;
