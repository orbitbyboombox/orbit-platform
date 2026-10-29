-- Run only on an isolated database AFTER applying migration 0210.
-- This test never updates live settlements.
do $tests$
begin
  if public.staff_rate_effective_20261101('OPERATOR',2) <> 20000 then raise exception '2h rate'; end if;
  if public.staff_rate_effective_20261101('OPERATOR',3) <> 25000 then raise exception '3h rate'; end if;
  if public.staff_rate_effective_20261101('OPERATOR',4) <> 30000 then raise exception '4h rate'; end if;
  if public.staff_rate_effective_20261101('OPERATOR',11) <> 65000 then raise exception '11h rate'; end if;
  if public.staff_rate_effective_20261101('ASSEMBLY',2) <> 10000 then raise exception 'assembly'; end if;
  if public.staff_rate_effective_20261101('DISASSEMBLY',2) <> 10000 then raise exception 'disassembly'; end if;
  if public.staff_rate_effective_20261101('ASSEMBLY_DISASSEMBLY',2) <> 20000 then raise exception 'combined'; end if;
end $tests$;
