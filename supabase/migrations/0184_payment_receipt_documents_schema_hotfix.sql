begin;

-- public.documents canonically has created_by/created_at audit metadata. It does
-- not have updated_by/updated_at. Migration 0140 accidentally referenced both
-- missing columns inside apply_receivable_movement, making every new payment
-- with a receipt roll back at the document insert.
--
-- Keep one canonical payment function and repair only the incompatible clauses.
-- The conditional replacements also make a clean replay safe after 0140 itself
-- was corrected.
do $migration$
declare
  function_signature regprocedure :=
    'public.apply_receivable_movement(uuid,text,numeric,timestamptz,text,text,text,text,text)'::regprocedure;
  original_definition text;
  repaired_definition text;
begin
  select pg_get_functiondef(function_signature)
    into original_definition;

  repaired_definition := replace(
    original_definition,
    E'        created_by,\n        updated_by,\n        idempotency_key',
    E'        created_by,\n        idempotency_key'
  );
  repaired_definition := replace(
    repaired_definition,
    E'        checksum_source,\n        actor,\n        actor,\n        normalized_key',
    E'        checksum_source,\n        actor,\n        normalized_key'
  );
  repaired_definition := replace(
    repaired_definition,
    E'          checksum = coalesce(documents.checksum, excluded.checksum),\n          updated_at = now(),\n          updated_by = actor;',
    E'          checksum = coalesce(documents.checksum, excluded.checksum);'
  );

  if repaired_definition <> original_definition then
    execute repaired_definition;
  end if;

  select pg_get_functiondef(function_signature)
    into repaired_definition;

  if repaired_definition like E'%created_by,\n        updated_by,\n        idempotency_key%'
     or repaired_definition like E'%checksum = coalesce(documents.checksum, excluded.checksum),\n          updated_at = now(),\n          updated_by = actor;%'
  then
    raise exception 'apply_receivable_movement still depends on non-canonical documents update columns';
  end if;
end
$migration$;

commit;
