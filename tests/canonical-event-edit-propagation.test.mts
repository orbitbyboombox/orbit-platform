import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidOperationalCall, resolveEventOperationalWindow } from "../features/operations/event-operational-window.ts";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/0182_canonical_event_edit_propagation_hotfix.sql");
const commercialFreeze=read("supabase/migrations/0183_freeze_accepted_commercial_history_on_event_edit.sql");
const action=read("features/crm/actions.ts");
const calendar=read("features/connectors/google-calendar/application/google-calendar-sync.service.ts");
const mapper=read("features/connectors/google-calendar/application/google-calendar-live.ts");
const eventCenter=read("features/crm/event-center.tsx");
const staffPortal=read("features/portal-authentication/staff-portal.tsx");
const staffCalendar=read("app/api/staff-portal/events/[projectId]/calendar/route.ts");

test("operational call must be in the 24 hours before service",()=>{
  assert.equal(isValidOperationalCall("2026-08-28T15:00:00-04:00","2026-08-28T17:00:00-04:00"),true);
  assert.equal(isValidOperationalCall("2026-09-28T15:00:00-04:00","2026-08-28T17:00:00-04:00"),false);
});
test("invalid future call cannot make Calendar start after service end",()=>{
  const value=resolveEventOperationalWindow({assignmentStaffCalls:[],staffArrivalAt:"2026-09-28T15:00:00-04:00",serviceStartAt:"2026-08-28T17:00:00-04:00",serviceEndAt:"2026-08-28T21:00:00-04:00"});
  assert.equal(value.operationalStartAt,"2026-08-28T17:00:00-04:00");
  assert.equal(value.source,"SERVICE_START");
});
test("atomic writer rejects invalid calls and clears derived assignment calls",()=>{
  assert.match(migration,/staff_call>service_start/);
  assert.match(migration,/staff_call_at=staff_call/);
  assert.match(migration,/status='UPDATE_REQUIRED'/);
});
test("Event editor persists current address through the shared action",()=>{
  assert.match(eventCenter,/eventAddress/);
  assert.match(eventCenter,/Dirección/);
  assert.match(action,/eventAddress: input\.eventAddress/);
  assert.match(calendar,/currentEventAddress/);
});
test("Calendar updates the existing event and rejects empty ranges",()=>{
  assert.match(mapper,/provider\.updateEvent\(existing\.googleEventId/);
  assert.match(mapper,/end <= start/);
});
test("hotfix does not mutate customer communications, historical agreements, or payment ledger",()=>{
  assert.doesNotMatch(migration,/communications|agreements|quotations|invoice_payments|paid_amount/i);
  assert.match(commercialFreeze,/commercial_locked/);
  assert.match(commercialFreeze,/\('ACCEPTED','CONVERTED'\)/);
  assert.match(commercialFreeze,/if not commercial_locked then/);
  assert.doesNotMatch(commercialFreeze,/invoice_payments|paid_amount/i);
});
test("Staff portal and downloadable Calendar consume the current operational contract",()=>{
  assert.match(staffPortal,/service_start_at,service_end_at,staff_arrival_at/);
  assert.match(staffPortal,/canonicalStart/);
  assert.match(staffCalendar,/project_operational_contracts/);
  assert.match(staffCalendar,/compact\(end\.date,end\.time\)/);
});
