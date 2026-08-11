begin;

create table if not exists public.founder_workspace_preferences(
  user_id uuid primary key references auth.users(id) on delete cascade,
  quick_action_order text[] not null default array['NEW_RESERVATION','CUSTOMERS','STAFF','CALENDAR','NEW_EXPENSE','NEW_EVENT','SUPPLIER'],
  hidden_quick_actions text[] not null default '{}',
  favorite_quick_actions text[] not null default array['NEW_RESERVATION'],
  widget_order text[] not null default array['TODAY_EVENTS','UPCOMING_EVENTS','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','MONTHLY_REVENUE','OPERATIONAL_COST','PROFITABILITY','BUSINESS_INTELLIGENCE','FUEL','PAPER_CONSUMPTION','STAFF','FLEET','NOTIFICATIONS'],
  hidden_widgets text[] not null default '{}',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.founder_workspace_preferences enable row level security;
create policy founder_workspace_own_read on public.founder_workspace_preferences for select to authenticated using(user_id=auth.uid() and public.is_internal_user());
create policy founder_workspace_own_insert on public.founder_workspace_preferences for insert to authenticated with check(user_id=auth.uid() and public.can_administer());
create policy founder_workspace_own_update on public.founder_workspace_preferences for update to authenticated using(user_id=auth.uid() and public.can_administer()) with check(user_id=auth.uid() and public.can_administer());
revoke delete on public.founder_workspace_preferences from authenticated;

create or replace function public.save_founder_workspace(p_quick_action_order text[],p_hidden_quick_actions text[],p_favorite_quick_actions text[],p_widget_order text[],p_hidden_widgets text[])
returns void language plpgsql security invoker set search_path=public as $$
declare actions constant text[]:=array['NEW_RESERVATION','CUSTOMERS','STAFF','CALENDAR','NEW_EXPENSE','NEW_EVENT','SUPPLIER'];widgets constant text[]:=array['TODAY_EVENTS','UPCOMING_EVENTS','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','MONTHLY_REVENUE','OPERATIONAL_COST','PROFITABILITY','BUSINESS_INTELLIGENCE','FUEL','PAPER_CONSUMPTION','STAFF','FLEET','NOTIFICATIONS'];
begin
  if auth.uid()is null or not public.can_administer()then raise exception'Solo Founder o Administración puede configurar Mi Escritorio.';end if;
  if p_quick_action_order is null or p_widget_order is null or not(actions@>p_quick_action_order and p_quick_action_order@>actions)or not(widgets@>p_widget_order and p_widget_order@>widgets)then raise exception'Configuración de escritorio inválida.';end if;
  if not(p_hidden_quick_actions<@actions and p_favorite_quick_actions<@actions and p_hidden_widgets<@widgets)then raise exception'Elementos de escritorio inválidos.';end if;
  insert into public.founder_workspace_preferences(user_id,quick_action_order,hidden_quick_actions,favorite_quick_actions,widget_order,hidden_widgets)
  values(auth.uid(),p_quick_action_order,p_hidden_quick_actions,p_favorite_quick_actions,p_widget_order,p_hidden_widgets)
  on conflict(user_id)do update set quick_action_order=excluded.quick_action_order,hidden_quick_actions=excluded.hidden_quick_actions,favorite_quick_actions=excluded.favorite_quick_actions,widget_order=excluded.widget_order,hidden_widgets=excluded.hidden_widgets,version=founder_workspace_preferences.version+1,updated_at=now();
end$$;

create or replace function public.reset_founder_workspace()returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid()is null or not public.can_administer()then raise exception'Permiso requerido.';end if;delete from public.founder_workspace_preferences where user_id=auth.uid();end$$;

grant execute on function public.save_founder_workspace(text[],text[],text[],text[],text[])to authenticated;
grant execute on function public.reset_founder_workspace()to authenticated;

drop trigger if exists founder_workspace_audit on public.founder_workspace_preferences;
create trigger founder_workspace_audit after insert or update or delete on public.founder_workspace_preferences for each row execute function public.audit_row_change();
commit;
