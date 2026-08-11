begin;
alter table public.founder_workspace_preferences add column if not exists hidden_event_modules text[] not null default array['TIMELINE','EVENT_HEALTH','CHECKLIST','MILESTONES','GOOGLE_WORKSPACE','PAYROLL','OPERATIONAL_CONTROL','TASK_CENTER','COMMERCIAL_NEGOTIATION'];

drop function if exists public.save_founder_workspace(text[],text[],text[],text[],text[]);
create or replace function public.save_founder_workspace(p_quick_action_order text[],p_hidden_quick_actions text[],p_favorite_quick_actions text[],p_widget_order text[],p_hidden_widgets text[],p_hidden_event_modules text[])
returns void language plpgsql security invoker set search_path=public as $$
declare actions constant text[]:=array['NEW_RESERVATION','CUSTOMERS','STAFF','CALENDAR','NEW_EXPENSE','NEW_EVENT','SUPPLIER'];widgets constant text[]:=array['TODAY_EVENTS','UPCOMING_EVENTS','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','MONTHLY_REVENUE','OPERATIONAL_COST','PROFITABILITY','BUSINESS_INTELLIGENCE','FUEL','PAPER_CONSUMPTION','STAFF','FLEET','NOTIFICATIONS'];event_modules constant text[]:=array['GENERAL_INFORMATION','FINANCIAL_SUMMARY','STAFF','DOCUMENTS','CUSTOMER_PORTAL','GOOGLE_CALENDAR','TIMELINE','EVENT_HEALTH','CHECKLIST','MILESTONES','GOOGLE_WORKSPACE','PAYROLL','OPERATIONAL_CONTROL','TASK_CENTER','COMMERCIAL_NEGOTIATION'];
begin
  if auth.uid()is null or not public.can_administer()then raise exception'Solo Founder o Administración puede configurar Mi Escritorio.';end if;
  if p_quick_action_order is null or p_widget_order is null or not(actions@>p_quick_action_order and p_quick_action_order@>actions)or not(widgets@>p_widget_order and p_widget_order@>widgets)then raise exception'Configuración de escritorio inválida.';end if;
  if not(p_hidden_quick_actions<@actions and p_favorite_quick_actions<@actions and p_hidden_widgets<@widgets and p_hidden_event_modules<@event_modules)then raise exception'Elementos de escritorio inválidos.';end if;
  insert into public.founder_workspace_preferences(user_id,quick_action_order,hidden_quick_actions,favorite_quick_actions,widget_order,hidden_widgets,hidden_event_modules)
  values(auth.uid(),p_quick_action_order,p_hidden_quick_actions,p_favorite_quick_actions,p_widget_order,p_hidden_widgets,p_hidden_event_modules)
  on conflict(user_id)do update set quick_action_order=excluded.quick_action_order,hidden_quick_actions=excluded.hidden_quick_actions,favorite_quick_actions=excluded.favorite_quick_actions,widget_order=excluded.widget_order,hidden_widgets=excluded.hidden_widgets,hidden_event_modules=excluded.hidden_event_modules,version=founder_workspace_preferences.version+1,updated_at=now();
end$$;
grant execute on function public.save_founder_workspace(text[],text[],text[],text[],text[],text[])to authenticated;
commit;
