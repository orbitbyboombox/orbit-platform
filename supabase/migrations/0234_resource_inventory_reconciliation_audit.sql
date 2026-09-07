-- Record the Founder-confirmed Phase 3 inventory reconciliation in the
-- existing audit ledger. Idempotent and append-only.
insert into public.audit_events(entity_type,entity_id,action,reason,previous_state,new_state,occurred_at)
select 'RESOURCE_INVENTORY','phase3-founder-confirmed','RECONCILED',
  'Founder confirmó inventario físico: CASE 9, WHITE 8, BLACK 10; excedentes conservados como OUT_OF_SERVICE.',
  jsonb_build_object('case',12,'white',12,'black',12),
  jsonb_build_object('caseAvailable',9,'whiteAvailable',8,'blackAvailable',10,'phantomRows',array['WHITE-09','WHITE-10','WHITE-11','WHITE-12','BLACK-11','BLACK-12']),now()
where not exists(select 1 from public.audit_events where entity_type='RESOURCE_INVENTORY' and entity_id='phase3-founder-confirmed' and action='RECONCILED');
