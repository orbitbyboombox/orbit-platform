import assert from "node:assert/strict";
import test from "node:test";
import { financialAlertState } from "../../features/financial-alerts/model.ts";

const rule = { code: "IVA", name: "PAGAR IVA", firstNoticeDay: 19, escalationDay: 20, timezone: "America/Santiago" };
const at = (day: number, month = 8) => new Date(`2026-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T15:00:00Z`);
test("day 18 does not create a visible obligation",()=>assert.equal(financialAlertState(rule,at(18)),null));
test("day 19 shows one monthly IVA obligation",()=>assert.deepEqual(financialAlertState(rule,at(19)),{key:"IVA-2026-08",title:"PAGAR IVA",priority:"HIGH"}));
test("day 20 escalates the same obligation",()=>assert.deepEqual(financialAlertState(rule,at(20)),{key:"IVA-2026-08",title:"PAGAR IVA HOY",priority:"CRITICAL"}));
test("day 21 keeps the escalated obligation",()=>assert.equal(financialAlertState(rule,at(21))?.key,"IVA-2026-08"));
test("paid obligation is suppressed",()=>assert.equal(financialAlertState(rule,at(20),true),null));
test("month rollover produces a distinct canonical key",()=>assert.equal(financialAlertState(rule,at(20,9))?.key,"IVA-2026-09"));
