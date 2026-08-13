begin;

update public.cost_master_entries
set amount=case code
  when 'OPERATOR_2_HOURS' then 14000
  when 'OPERATOR_3_HOURS' then 19000
  when 'OPERATOR_4_HOURS' then 24000
  when 'OPERATOR_5_HOURS' then 27000
  when 'OPERATOR_6_HOURS' then 32000
end,enabled=true,updated_at=now()
where code in('OPERATOR_2_HOURS','OPERATOR_3_HOURS','OPERATOR_4_HOURS','OPERATOR_5_HOURS','OPERATOR_6_HOURS')
  and deleted_at is null;

-- A zero value is not a valid official payment. Unknown future durations stay
-- unavailable until the Founder configures their official BOOMBOX amount.
update public.cost_master_entries
set enabled=false,updated_at=now()
where code like 'OPERATOR_%_HOURS' and coalesce(amount,0)<=0 and deleted_at is null;

do $$ declare item record; begin
  for item in
    select distinct project_id,staff_id from public.assignments
    where deleted_at is null and status not in('CANCELLED','REJECTED')
      and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY')
  loop
    perform public.refresh_staff_event_payment(item.project_id,item.staff_id,auth.uid());
  end loop;
end $$;

commit;
