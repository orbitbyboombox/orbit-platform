begin;

-- Keep the persisted Workspace validator aligned with the complete navigation
-- catalog. The new module remains hidden by default for future workspaces, but
-- this explicit Founder-requested release activates it for existing admins
-- without resetting their saved order or other visibility choices.
create or replace function public.save_founder_workspace(
  p_quick_action_order text[], p_hidden_quick_actions text[], p_favorite_quick_actions text[],
  p_widget_order text[], p_hidden_widgets text[], p_hidden_event_modules text[],
  p_navigation_order text[], p_hidden_navigation text[], p_module_workspaces jsonb
) returns void language plpgsql security invoker set search_path=public as $$
declare
  actions constant text[]:=array['NEW_RESERVATION','CUSTOMERS','STAFF','CALENDAR','NEW_EXPENSE','NEW_EVENT','SUPPLIER'];
  widgets constant text[]:=array['TODAY_EVENTS','UPCOMING_EVENTS','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','MONTHLY_REVENUE','OPERATIONAL_COST','PROFITABILITY','BUSINESS_INTELLIGENCE','FUEL','PAPER_CONSUMPTION','STAFF','FLEET','NOTIFICATIONS'];
  event_modules constant text[]:=array['GENERAL_INFORMATION','FINANCIAL_SUMMARY','STAFF','DOCUMENTS','CUSTOMER_PORTAL','GOOGLE_CALENDAR','TIMELINE','EVENT_HEALTH','CHECKLIST','MILESTONES','GOOGLE_WORKSPACE','PAYROLL','OPERATIONAL_CONTROL','TASK_CENTER','COMMERCIAL_NEGOTIATION'];
  navigation constant text[]:=array['HOME','COLLECTIONS','CUSTOMERS','COMMERCIAL','EVENTS','CALENDAR','STAFF','RESOURCES','FINANCE','RECEIVABLES','PAYABLES','REPORTS','OFFICE_RENT','SETTINGS'];
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede configurar Mi Escritorio.'; end if;
  if p_module_workspaces is null or jsonb_typeof(p_module_workspaces)<>'object'
    or p_quick_action_order is null or p_widget_order is null or p_navigation_order is null
    or not(actions@>p_quick_action_order and p_quick_action_order@>actions)
    or not(widgets@>p_widget_order and p_widget_order@>widgets)
    or not(navigation@>p_navigation_order and p_navigation_order@>navigation)
  then raise exception 'Configuración de escritorio inválida.'; end if;
  if not(p_hidden_quick_actions<@actions and p_favorite_quick_actions<@actions and p_hidden_widgets<@widgets
    and p_hidden_event_modules<@event_modules and p_hidden_navigation<@navigation)
  then raise exception 'Elementos de escritorio inválidos.'; end if;
  insert into public.founder_workspace_preferences(
    user_id,quick_action_order,hidden_quick_actions,favorite_quick_actions,widget_order,hidden_widgets,
    hidden_event_modules,navigation_order,hidden_navigation,module_workspaces
  ) values(
    auth.uid(),p_quick_action_order,p_hidden_quick_actions,p_favorite_quick_actions,p_widget_order,p_hidden_widgets,
    p_hidden_event_modules,p_navigation_order,p_hidden_navigation,p_module_workspaces
  ) on conflict(user_id) do update set
    quick_action_order=excluded.quick_action_order,
    hidden_quick_actions=excluded.hidden_quick_actions,
    favorite_quick_actions=excluded.favorite_quick_actions,
    widget_order=excluded.widget_order,
    hidden_widgets=excluded.hidden_widgets,
    hidden_event_modules=excluded.hidden_event_modules,
    navigation_order=excluded.navigation_order,
    hidden_navigation=excluded.hidden_navigation,
    module_workspaces=excluded.module_workspaces,
    version=founder_workspace_preferences.version+1,
    updated_at=now();
end $$;

grant execute on function public.save_founder_workspace(text[],text[],text[],text[],text[],text[],text[],text[],jsonb) to authenticated;

update public.founder_workspace_preferences workspace
set navigation_order=case
      when 'OFFICE_RENT'=any(workspace.navigation_order) then workspace.navigation_order
      else array_append(workspace.navigation_order,'OFFICE_RENT')
    end,
    hidden_navigation=array_remove(workspace.hidden_navigation,'OFFICE_RENT'),
    version=workspace.version+1,
    updated_at=now()
where exists(
  select 1 from public.profiles profile
  where profile.id=workspace.user_id and profile.role in('CEO','ADMINISTRATOR')
);

commit;
