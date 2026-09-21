begin;

-- Founder canonical tariff: five hours is CLP 28,000.
update public.cost_master_entries
set amount=28000,
    enabled=true,
    approval_reason='Tarifa oficial Founder · operador 5 horas',
    metadata=coalesce(metadata,'{}'::jsonb)||'{"durationMinutes":300,"source":"FOUNDER_CANONICAL"}'::jsonb,
    updated_at=now()
where code='OPERATOR_5_HOURS' and deleted_at is null;

commit;
