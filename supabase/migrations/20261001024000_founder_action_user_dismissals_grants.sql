begin;
grant select, insert, update on table public.founder_action_user_states to authenticated;
revoke all on table public.founder_action_user_states from anon;
commit;
