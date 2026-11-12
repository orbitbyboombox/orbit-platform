import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveIncidentBoxAssignment } from '../features/resources/incident-box-link.ts';
const two={id:'assignment-2',asset_id:'box-2',assignment_status:'RETURNED'},five={id:'assignment-5',asset_id:'box-5',assignment_status:'ASSIGNED'};
test('returned box remains the source of the report after closeout',()=>{assert.equal(resolveIncidentBoxAssignment([two],[]),two);assert.equal(resolveIncidentBoxAssignment([two,five],[],'assignment-2'),two)});
test('staff-confirmed historical snapshot disambiguates multi-box event',()=>{assert.equal(resolveIncidentBoxAssignment([two,five],['assignment-2']),two);assert.equal(resolveIncidentBoxAssignment([two,five],['assignment-5']),five)});
test('does not guess for ambiguous, cancelled, absent or foreign assignments',()=>{
  assert.equal(resolveIncidentBoxAssignment([two,five],[]),null);
  assert.equal(resolveIncidentBoxAssignment([two,five],['assignment-2','assignment-5']),null);
  assert.equal(resolveIncidentBoxAssignment([two],[],'another-event-assignment'),null);
  assert.equal(resolveIncidentBoxAssignment([{...two,assignment_status:'CANCELLED'}],[]),null);
  assert.equal(resolveIncidentBoxAssignment([],[]),null);
});
test('closeout passes its exact assignment and report restricts candidates to the same event and box types',()=>{
  const report=readFileSync('features/portal-authentication/staff-portal.actions.ts','utf8');
  const part=report.slice(report.indexOf('export async function reportStaffOperatorIncidentAction'),report.indexOf('export async function requestStaffResponsibilityAction'));
  assert.match(part,/\.eq\("project_id", input.projectId\)/);assert.match(part,/\["ASSIGNED", "RETURNED"\]/);assert.match(part,/"operational_assets.asset_type", \["BOX", "CASE"\]/);assert.match(part,/input.category === "EQUIPMENT" && !boxAssignment/);
  assert.match(readFileSync('features/portal-authentication/staff-box-operations.actions.ts','utf8'),/boxAssignmentId: input.assignmentId/);
  assert.doesNotMatch(part,/\.update\(|\.delete\(|\.rpc\(/);
});
