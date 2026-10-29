import test from "node:test";
import assert from "node:assert/strict";
import { effectiveStaffAssignmentPayment } from "../features/operations/staff-assignment-payment.ts";

const legacy = [
  {code:"OPERATOR_2_HOURS",amount:15000},
  {code:"OPERATOR_3_HOURS",amount:19000},
  {code:"OPERATOR_4_HOURS",amount:24000},
  {code:"ASSEMBLY",amount:7000},
  {code:"DISASSEMBLY",amount:7000},
  {code:"ASSEMBLY_DISASSEMBLY",amount:15000},
];
test("October operator rate remains historical",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,2,"OPERATOR","2026-10-31"),15000));
test("October combined setup remains historical",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,2,"ASSEMBLY_DISASSEMBLY","2026-10-31"),15000));
test("November operator 2 hours",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,2,"OPERATOR","2026-11-01"),20000));
test("November operator 3 hours",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,3,"OPERATOR","2026-11-01"),25000));
test("November operator 4 hours",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,4,"OPERATOR","2026-11-01"),30000));
test("November operator 11 hours has no commercial cap",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,11,"OPERATOR","2026-11-01"),65000));
test("November setup and teardown",()=>{assert.equal(effectiveStaffAssignmentPayment(legacy,2,"ASSEMBLY","2026-11-01"),10000);assert.equal(effectiveStaffAssignmentPayment(legacy,2,"DISASSEMBLY","2026-11-01"),10000);assert.equal(effectiveStaffAssignmentPayment(legacy,2,"ASSEMBLY_DISASSEMBLY","2026-11-01"),20000)});
test("transport bonus is additive",()=>assert.equal(effectiveStaffAssignmentPayment(legacy,2,"OPERATOR","2026-11-01",12000),32000));
test("invalid date and unknown roles are rejected",()=>{assert.throws(()=>effectiveStaffAssignmentPayment(legacy,2,"OPERATOR","2026-02-30"));assert.throws(()=>effectiveStaffAssignmentPayment(legacy,2,"UNKNOWN","2026-11-01"))});
