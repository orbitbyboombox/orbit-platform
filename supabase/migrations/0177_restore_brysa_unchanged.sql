begin;

-- 0176 used a stale Brysa project identifier in its exclusion guard. Restore
-- the exact audited pre-migration commercial fields. This correction is
-- deliberately limited to the one invoice and never writes payment history.
update public.invoices
set payment_term='CASH',
    custom_term_days=null,
    notes='Generada automáticamente desde la reserva confirmada.',
    updated_by=coalesce(auth.uid(),updated_by)
where id='7329a0ea-6ecb-41f3-a1b6-017e5cf31769'
  and project_id='14505331-aa33-49a8-8d18-59de68444195'
  and invoice_number='ORBIT-ORB2026145073'
  and payment_term='DAYS_30'
  and issue_date='2026-08-20'
  and due_date='2026-09-19'
  and amount=330000 and paid_amount=0
  and notes='Generada automáticamente desde la reserva confirmada. · Condición sincronizada desde Evento';

commit;
