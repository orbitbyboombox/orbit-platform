import assert from 'node:assert/strict';
import test from 'node:test';
import {effectiveStaffAssignmentPayment} from '../features/operations/staff-assignment-payment.ts';
test('November half-hour operator and supervisor',()=>{assert.equal(effectiveStaffAssignmentPayment([],4.5,'OPERATOR','2026-11-08'),32500);assert.equal(effectiveStaffAssignmentPayment([],4.5,'SUPERVISOR','2026-11-08'),32500);});
