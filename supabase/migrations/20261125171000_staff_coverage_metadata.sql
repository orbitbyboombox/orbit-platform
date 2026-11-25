begin;
update public.assignments
set resources=coalesce(resources,'{}'::jsonb)||jsonb_build_object('coverageUnits',greatest(coalesce(coverage_units,1),1))
where assignment_type in ('ASSEMBLY','DISASSEMBLY') and deleted_at is null;
commit;
