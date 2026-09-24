begin;

-- Normal Founder Force Delete preserves real invoices and payment evidence.
-- SOURCE_EVENT_DELETED is an audit reason, not a valid invoices.financial_record_state.
do $patch$
declare
  ddl text;
  invalid_clause constant text := $$update public.invoices set financial_record_state='SOURCE_EVENT_DELETED', archived_at=now(), archived_by=actor, updated_at=now(), updated_by=actor where project_id=p_project_id and deleted_at is null;$$;
  safe_clause constant text := $$update public.invoices set financial_record_state='ARCHIVED', archived_at=coalesce(archived_at,now()), archived_by=coalesce(archived_by,actor), updated_at=now(), updated_by=actor where project_id=p_project_id and deleted_at is null;$$;
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if position(invalid_clause in ddl) = 0 then
    raise exception 'Canonical purge function did not contain the invalid invoice financial state mutation';
  end if;
  execute replace(ddl, invalid_clause, safe_clause);
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical transactional Founder purge. Real invoices and payment history are preserved; invoices are archived with a valid financial_record_state.';

commit;
