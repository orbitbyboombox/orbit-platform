-- Integration regression: all fixtures and side effects MUST roll back.
begin;
set local statement_timeout='60s';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='CEO' limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where role='CEO' limit 1),'role','authenticated')::text,true);
create temp table staff_slot_qa_results(scenario text, result text) on commit drop;
do $qa$
declare
  template public.projects%rowtype;
  qa_project uuid:=gen_random_uuid();
  actor uuid:=auth.uid();
  member uuid;
  members uuid[]:='{}';
  ids uuid[];
  assignment_id uuid;
  count_required integer;
  index integer;
  role_name text;
  saved jsonb;
  payload jsonb;
  actual_count integer;
  actual_amount numeric;
  rate numeric;
  settlement_id uuid;
  request_id uuid;
  replacement_id uuid;
  rejected boolean;
  readiness jsonb;
begin
  select p.* into template from public.projects p where p.deleted_at is null
    and p.status not in('CANCELLED','CANCELED','ARCHIVED','CLOSED','COMPLETED')
    and exists(select 1 from public.project_services where project_id=p.id and duration_hours=3)
    and exists(select 1 from public.project_operational_contracts where project_id=p.id)
    order by p.event_date desc limit 1;
  if template.id is null or actor is null then raise exception 'QA requires a canonical 3-hour Event and Founder profile.'; end if;
  insert into public.projects select * from jsonb_populate_record(null::public.projects,to_jsonb(template)||jsonb_build_object('id',qa_project,'name','QA STAFF SLOTS ROLLBACK','orbit_event_id','QA-SLOTS-'||qa_project,'event_date',timezone('America/Santiago',now())::date+1));
  insert into public.project_services select (jsonb_populate_record(null::public.project_services,to_jsonb(ps)||jsonb_build_object('id',gen_random_uuid(),'project_id',qa_project))).* from public.project_services ps where ps.project_id=template.id;
  insert into public.project_operational_contracts select (jsonb_populate_record(null::public.project_operational_contracts,to_jsonb(contract)||jsonb_build_object('id',gen_random_uuid(),'project_id',qa_project))).* from public.project_operational_contracts contract where contract.project_id=template.id;
  insert into public.staff_event_publications(project_id,published,published_by) values(qa_project,true,actor);
  for index in 1..13 loop
    member:=gen_random_uuid();members:=members||member;
    insert into public.staff(id,first_name,last_name,role,capabilities,status,created_by,updated_by)
      values(member,'QA','Slot '||index,'OPERATOR',array['OPERATOR','ASSEMBLY','DISASSEMBLY'],'ACTIVE',actor,actor);
  end loop;
  select amount into rate from public.cost_master_entries where code='OPERATOR_3_HOURS' and enabled and deleted_at is null;
  foreach count_required in array array[1,2,5,12] loop
    update public.assignments set status='CANCELLED',deleted_at=now() where project_id=qa_project and deleted_at is null;
    perform public.set_event_staff_requirement(qa_project,'OPERATOR',count_required,true);
    ids:='{}';
    for index in 1..count_required loop
      assignment_id:=gen_random_uuid();ids:=ids||assignment_id;
      payload:=jsonb_build_object('project_id',qa_project,'staff_id',members[index],'assignment_type','OPERATOR','arrival_time','15:00','start_time','16:00','finish_time','19:00');
      saved:=public.save_event_staff_assignment(payload,assignment_id);
      if saved->>'id'<>assignment_id::text then raise exception 'Canonical assignment ID differs.'; end if;
      saved:=public.save_event_staff_assignment(payload,assignment_id);
      if saved->>'replay'<>'true' then raise exception 'Retry was not idempotent.'; end if;
    end loop;
    select count(*) into actual_count from public.assignments where project_id=qa_project and deleted_at is null and status not in('CANCELLED','REJECTED');
    if actual_count<>count_required then raise exception 'Quantity % collapsed to %.',count_required,actual_count; end if;
    select count(*),sum(operator_payment) into actual_count,actual_amount from public.event_staff_payments where project_id=qa_project and deleted_at is null and status<>'CANCELLED';
    if actual_count<>count_required or actual_amount<>count_required*rate then raise exception 'Individual estimated payments mismatch for %.',count_required; end if;
    update public.assignments set status='CONFIRMED',accepted_at=now() where id=any(ids);
    select count(*) into actual_count from public.staff_worked_events where project_id=qa_project;
    if actual_count<>count_required then raise exception 'Consolidated settlement / Finance view mismatch for %.',count_required; end if;
    -- Notes edits retain confirmation and settlement identity.
    payload:=payload||jsonb_build_object('observations','QA edit');
    saved:=public.save_event_staff_assignment(payload,gen_random_uuid(),ids[count_required]);
    if (select status from public.assignments where id=ids[count_required])<>'CONFIRMED' then raise exception 'Edit reverted confirmed status.'; end if;
    perform public.set_event_staff_requirement(qa_project,'OPERATOR',count_required,true);
    if (select required_quantity from public.event_staff_requirements where project_id=qa_project and role='OPERATOR')<>count_required then raise exception 'Re-save collapsed quantity.'; end if;
    insert into staff_slot_qa_results values(count_required||' operators / save / reopen / estimates / confirmation / Finance','PASS');
  end loop;
  -- Capacity and duplicate protection; failed writes leave all peers intact.
  rejected:=false;
  begin
    perform public.save_event_staff_assignment(jsonb_build_object('project_id',qa_project,'staff_id',members[1],'assignment_type','OPERATOR'),gen_random_uuid());
  exception when others then rejected:=position('ya ocupa un slot' in sqlerrm)>0; end;
  if not rejected then raise exception 'Duplicate collaborator was not rejected.'; end if;
  rejected:=false;
  begin
    perform public.set_event_staff_requirement(qa_project,'OPERATOR',1,true);
  exception when others then rejected:=position('Staff activos' in sqlerrm)>0; end;
  if not rejected then raise exception 'Active slots were silently removed.'; end if;
  rejected:=false;
  begin
    perform public.save_event_staff_assignment(jsonb_build_object('project_id',qa_project,'staff_id',members[13],'assignment_type','OPERATOR'),gen_random_uuid());
  exception when others then rejected:=position('Todos los slots' in sqlerrm)>0; end;
  if not rejected then raise exception 'Over-capacity assignment was not rejected.'; end if;
  insert into staff_slot_qa_results values('duplicates / capacity / protected active slots','PASS');
  -- Canonical cancellation, no external delivery occurs in SQL.
  perform public.cancel_staff_assignment_by_founder(ids[1],'OPERATIONAL','QA rollback');
  select count(*) into actual_count from public.assignments where project_id=qa_project and assignment_type='OPERATOR' and deleted_at is null and status not in('CANCELLED','REJECTED');
  if actual_count<>11 then raise exception 'Cancellation removed more than one collaborator.'; end if;
  if not exists(select 1 from public.assignments where id=ids[2] and status='CONFIRMED' and deleted_at is null) then raise exception 'Cancellation altered a peer.'; end if;
  readiness:=public.refresh_event_operational_readiness(qa_project,actor);
  if not exists(select 1 from jsonb_array_elements(readiness->'reasons') reason where reason->>'code'='STAFF:OPERATOR' and reason->>'label' like '%11/12%') then raise exception 'Readiness ignores partial multi-staff coverage.'; end if;
  insert into staff_slot_qa_results values('cancel one of twelve / remaining peers / readiness 11/12 / portal vacancy','PASS');
  -- Portal request and Founder approval refill the released canonical capacity.
  request_id:=public.request_staff_responsibility(members[13],qa_project,'OPERATOR');
  saved:=public.review_staff_assignment_request(request_id,true,'QA approval rollback');
  if saved->>'status'<>'CONFIRMED' then raise exception 'Request approval failed.'; end if;
  select count(*) into actual_count from public.staff_worked_events where project_id=qa_project;
  if actual_count<>12 then raise exception 'Portal approval / settlement count mismatch.'; end if;
  insert into staff_slot_qa_results values('Staff Portal request / Founder approval / individual settlement / Finance','PASS');
  -- Failed replacement must roll back the removal of the old assignment.
  replacement_id:=gen_random_uuid();rejected:=false;
  begin
    perform public.save_event_staff_assignment(jsonb_build_object('project_id',qa_project,'staff_id',gen_random_uuid(),'assignment_type','OPERATOR'),replacement_id,null,ids[2]);
  exception when others then rejected:=true; end;
  if not rejected or not exists(select 1 from public.assignments where id=ids[2] and status='CONFIRMED' and deleted_at is null) then raise exception 'Failed replacement lost confirmed Staff.'; end if;
  insert into staff_slot_qa_results values('atomic failed replacement preserves confirmed collaborator','PASS');
  -- Two different people per each role, normal combined-pay rules per person.
  update public.assignments set status='CANCELLED',deleted_at=now() where project_id=qa_project and deleted_at is null;
  foreach role_name in array array['OPERATOR','ASSEMBLY','DISASSEMBLY'] loop
    perform public.set_event_staff_requirement(qa_project,role_name,2,true);
    for index in 1..2 loop
      perform public.save_event_staff_assignment(jsonb_build_object('project_id',qa_project,'staff_id',members[index],'assignment_type',role_name),gen_random_uuid());
    end loop;
  end loop;
  select count(*) into actual_count from public.assignments where project_id=qa_project and deleted_at is null and status not in('CANCELLED','REJECTED');
  if actual_count<>6 then raise exception 'Mixed-role assignment count is not six.'; end if;
  select count(*),sum(total_internal_payment) into actual_count,actual_amount from public.event_staff_payments where project_id=qa_project and deleted_at is null and status<>'CANCELLED';
  if actual_count<>2 or actual_amount<>2*(rate+(select amount from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null)) then raise exception 'Combined payment duplicated settlements or rates.'; end if;
  insert into staff_slot_qa_results values('2 operators + 2 assembly + 2 disassembly / six assignments / two individual consolidated payments','PASS');
  if exists(select 1 from public.event_staff_settlement_movements movement join public.event_staff_payments payment on payment.id=movement.settlement_id where payment.project_id=qa_project) then raise exception 'QA unexpectedly generated real payment movements.'; end if;
  insert into staff_slot_qa_results values('no duplicated / real payment movements','PASS');
end $qa$;
select * from staff_slot_qa_results;
rollback;
