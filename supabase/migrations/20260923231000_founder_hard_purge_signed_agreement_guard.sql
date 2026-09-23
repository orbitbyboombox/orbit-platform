-- Keep signed-agreement immutability global; allow only the transaction-local
-- Founder QA hard-purge mode to remove its test-only rows.
create or replace function public.prevent_signed_agreement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.hard_purge_test_mode', true) = 'on' then
    return new;
  end if;

  if old.status = 'SIGNED' then
    raise exception 'Los acuerdos firmados son inmutables.';
  end if;

  return new;
end;
$$;
