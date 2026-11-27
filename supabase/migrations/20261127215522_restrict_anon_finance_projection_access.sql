revoke all on public.empresa_credit_integrity_projection, public.customer_balance_projection,
  public.company_credit_projection, public.staff_settlement_financials, public.tributary_internal_ledger from public, anon;
do $$
declare v text;
begin
  foreach v in array array['empresa_credit_integrity_projection','customer_balance_projection','company_credit_projection','staff_settlement_financials','tributary_internal_ledger'] loop
    if has_table_privilege('anon','public.'||v,'select')
      or not has_table_privilege('authenticated','public.'||v,'select')
      or not has_table_privilege('service_role','public.'||v,'select') then
      raise exception 'Unexpected finance view grants: %',v;
    end if;
  end loop;
end;
$$;
