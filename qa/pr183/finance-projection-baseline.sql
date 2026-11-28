-- Isolated equivalents of the two existing production views whose creation
-- was not captured in the repository migration chain. Keep the role gate
-- and business filters so the historical privilege migration can run unchanged.
create view public.customer_balance_projection with (security_barrier = true) as
select a.* from public.accounts_receivable_projection a
join public.projects p on p.id = a.project_id
where p.deleted_at is null
  and upper(coalesce(p.project_type, '')) = 'WEDDING'
  and upper(coalesce(p.finance ->> 'paymentCondition', '')) <> 'CORPORATE_CREDIT'
  and (auth.role() = 'service_role' or public.can_administer());

create view public.company_credit_projection with (security_barrier = true) as
select a.* from public.accounts_receivable_projection a
join public.projects p on p.id = a.project_id
where p.deleted_at is null
  and upper(coalesce(p.finance ->> 'paymentCondition', '')) = 'CORPORATE_CREDIT'
  and (auth.role() = 'service_role' or public.can_administer());

grant select on public.customer_balance_projection, public.company_credit_projection
  to authenticated, service_role;
