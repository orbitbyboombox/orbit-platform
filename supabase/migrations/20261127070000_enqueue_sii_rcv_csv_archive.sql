alter table public.tributary_drive_sync_items
  drop constraint tributary_drive_sync_items_artifact_kind_check,
  add constraint tributary_drive_sync_items_artifact_kind_check
    check (artifact_kind in ('PDF','XML','ACUSE','CSV'));

create function public.enqueue_sii_rcv_csv_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.company_rut = '765652723' then
    insert into public.tributary_drive_sync_items (artifact_kind,idempotency_key,status,checksum)
    values ('CSV','rcv-import:' || new.id::text || ':CSV','PENDING',new.source_hash)
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.enqueue_sii_rcv_csv_archive() from public, anon, authenticated;

create trigger enqueue_sii_rcv_csv_archive after insert on public.sii_rcv_imports
for each row execute function public.enqueue_sii_rcv_csv_archive();

insert into public.tributary_drive_sync_items (artifact_kind,idempotency_key,status,checksum)
select 'CSV','rcv-import:' || id::text || ':CSV','PENDING',source_hash
from public.sii_rcv_imports where company_rut = '765652723'
on conflict (idempotency_key) do nothing;
