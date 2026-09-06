begin;
alter table public.event_checklist_items add column if not exists item_source text not null default 'MANUAL';
alter table public.event_checklist_items add column if not exists completed_by_label text;
alter table public.event_checklist_items drop constraint if exists event_checklist_items_item_source_check;
alter table public.event_checklist_items add constraint event_checklist_items_item_source_check check(item_source in('AUTO','MANUAL'));
update public.event_checklist_items set item_source='AUTO'
where item_key in('ADDRESS_CONFIRMED','CONTACT_CONFIRMED','SCHEDULE_CONFIRMED','ASSEMBLY_TIME_CONFIRMED') and item_source<>'AUTO';
create index if not exists event_checklist_items_source_idx on public.event_checklist_items(checklist_id,item_source,completed);
commit;
