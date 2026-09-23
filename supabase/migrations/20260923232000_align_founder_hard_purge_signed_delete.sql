-- Reproduce the live Production trigger semantics exactly.
-- Normal signed-agreement immutability remains unchanged. During the
-- transaction-local QA hard-purge mode, DELETE returns OLD so the delete is
-- actually applied; UPDATE continues to return NEW.
create or replace function public.prevent_signed_agreement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.hard_purge_test_mode', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if old.status = 'SIGNED' then
    raise exception 'Los acuerdos firmados son inmutables.';
  end if;

  return new;
end;
$$;
