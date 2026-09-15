import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  chileTomorrow, isSpecialOperationalStaffId, specialD1Candidates,
  specialReminderCorrelation, SPECIAL_OPERATIONAL_STAFF_IDS,
  SPECIAL_OPERATIONAL_STAFF_MESSAGE, type SpecialReminderAssignment,
} from "../features/operations/special-operational-staff-reminder.model.ts";

const [sebastian,jose,fernando]=SPECIAL_OPERATIONAL_STAFF_IDS;
const tomorrow="2026-09-16";
const base=(staffId:string,projectId="event-1"):SpecialReminderAssignment=>({projectId,staffId,assignmentStatus:"CONFIRMED",assignmentDeletedAt:null,eventDate:tomorrow,projectStatus:"CONFIRMED",projectDeletedAt:null,staffStatus:"ACTIVE",staffDeletedAt:null,email:"staff@example.test"});

test("only the three exact staff IDs receive the special policy",()=>{
  for(const id of SPECIAL_OPERATIONAL_STAFF_IDS)assert.equal(isSpecialOperationalStaffId(id),true);
  for(const id of ["other-staff",null,undefined,"Sebastián Jorquera","staff@example.test"])assert.equal(isSpecialOperationalStaffId(id),false);
  assert.equal(SPECIAL_OPERATIONAL_STAFF_MESSAGE,"Recuerda que mañana tienes evento BOOMBOX.");
});
test("Sebastián gets one candidate with one or three roles",()=>{
  assert.equal(specialD1Candidates([base(sebastian)],tomorrow).length,1);
  assert.equal(specialD1Candidates([base(sebastian),base(sebastian),base(sebastian)],tomorrow).length,1);
});
test("José and Fernando each get one candidate across multiple roles",()=>{
  const rows=[base(jose),base(jose),base(fernando),base(fernando),base(fernando)];
  assert.deepEqual(specialD1Candidates(rows,tomorrow).map(row=>row.staffId),[jose,fernando]);
});
test("one cancelled role does not remove an active role; all cancelled suppress the notice",()=>{
  const cancelled={...base(sebastian),assignmentStatus:"CANCELLED"};
  assert.equal(specialD1Candidates([cancelled,base(sebastian)],tomorrow).length,1);
  assert.equal(specialD1Candidates([cancelled,{...base(sebastian),assignmentDeletedAt:"2026-09-15T00:00:00Z"}],tomorrow).length,0);
});
test("date change recalculates D-1 from the canonical event date",()=>{
  assert.equal(specialD1Candidates([{...base(sebastian),eventDate:"2026-09-17"}],tomorrow).length,0);
  assert.equal(specialD1Candidates([{...base(sebastian),eventDate:"2026-09-17"}],"2026-09-17").length,1);
  assert.equal(chileTomorrow(new Date("2026-09-15T12:00:00Z")),tomorrow);
  assert.equal(chileTomorrow(new Date("2026-09-16T02:30:00Z")),tomorrow); // Still September 15 in Chile.
});
test("reassignment is eligible again but keeps the same event/person delivery key",()=>{
  const replaced=[{...base(sebastian),assignmentStatus:"CANCELLED"},base(sebastian)];
  assert.equal(specialD1Candidates(replaced,tomorrow).length,1);
  assert.equal(specialReminderCorrelation("event-1",sebastian),specialReminderCorrelation("event-1",sebastian));
  assert.notEqual(specialReminderCorrelation("event-1",sebastian),specialReminderCorrelation("event-2",sebastian));
});
test("mixed Staff leaves normal Staff out of the special candidate set",()=>{
  const rows=[base("normal-1"),base(jose),base("normal-2"),base(jose)];
  assert.deepEqual(specialD1Candidates(rows,tomorrow).map(row=>row.staffId),[jose]);
});
test("removed Staff, closed event, missing email and inactive Staff are excluded",()=>{
  for(const change of [{staffStatus:"INACTIVE"},{staffDeletedAt:"2026-09-15"},{projectStatus:"CANCELLED"},{projectDeletedAt:"2026-09-15"},{email:null}]){
    assert.equal(specialD1Candidates([{...base(fernando),...change}],tomorrow).length,0);
  }
});
test("all email entry points use the ID policy and D-1 claims are person/event scoped",()=>{
  const immediate=readFileSync("features/operations/staff-assignment-notification.service.ts","utf8");
  const approved=readFileSync("features/operations/smart-assignment-package.service.ts","utf8");
  const cancellation=readFileSync("features/operations/staff-assignment-cancellation.service.ts","utf8");
  const cron=readFileSync("app/api/cron/staff-assignment-reminders/route.ts","utf8");
  for(const text of [immediate,approved,cancellation,cron])assert.match(text,/isSpecialOperationalStaffId/);
  assert.match(cron,/specialReminderCorrelation\(candidate.projectId,candidate.staffId\)/);
  assert.match(cron,/ignoreDuplicates:true/);
  assert.match(cron,/maxSendAttempts:1/);
  assert.match(cron,/currentProject.event_date!==tomorrow/);
  assert.match(cron,/\.contains\("metadata",\{hours_before:24,email_status:"SENT"\}\)/);
  assert.match(cron,/if\(isSpecialOperationalStaffId\(row.staff_id\)\)continue/);
});
