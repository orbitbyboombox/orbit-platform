begin;
revoke all on function public.assign_black_box_to_event(uuid,uuid,text),public.remove_black_box_from_event(uuid,text) from public,anon;
grant execute on function public.assign_black_box_to_event(uuid,uuid,text),public.remove_black_box_from_event(uuid,text) to authenticated;
commit;
