begin;

create or replace function public.record_cost_master_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.cost_master_history(cost_entry_id,action,previous_value,new_value,reason,changed_by)
  values(
    coalesce(new.id,old.id),
    tg_op,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end,
    case when tg_op='INSERT' then new.approval_reason when tg_op='DELETE' then old.approval_reason else coalesce(new.approval_reason,old.approval_reason) end,
    auth.uid()
  );
  return case when tg_op='DELETE' then old else new end;
end $$;

create index if not exists cost_master_entries_category_idx on public.cost_master_entries(category,display_order) where deleted_at is null;
create index if not exists cost_master_history_entry_idx on public.cost_master_history(cost_entry_id,changed_at desc,id desc);

commit;
