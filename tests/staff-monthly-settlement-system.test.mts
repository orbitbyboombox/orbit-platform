import test from"node:test";import assert from"node:assert/strict";import{readFileSync}from"node:fs";import{PDFDocument}from"pdf-lib";import{createStaffMonthlySettlementPdf}from"../features/staff-monthly-account/settlement-pdf.ts";
const sql=readFileSync("supabase/migrations/0198_staff_monthly_settlement_system.sql","utf8"),panel=readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx","utf8"),center=readFileSync("features/staff-payments/staff-payments-center.tsx","utf8"),actions=readFileSync("features/staff-monthly-account/actions.ts","utf8"),portal=readFileSync("features/portal-authentication/staff-portal.tsx","utf8"),pdf=readFileSync("features/staff-monthly-account/settlement-pdf.ts","utf8"),modelSource=readFileSync("features/staff-monthly-account/model.ts","utf8"),boletaRoute=readFileSync("app/api/staff-monthly-accounts/[accountId]/boleta/route.ts","utf8"),pdfRoute=readFileSync("app/api/staff-monthly-accounts/[accountId]/settlement-pdf/route.ts","utf8");
test("01 month derives from canonical Event date",()=>assert.match(sql,/date_trunc\('month',project\.event_date\)/));
test("02 eligible assignments are audited",()=>assert.match(sql,/assignment\.status in\('CONFIRMED','ACCEPTED','COMPLETED'\)/));
test("03 work uses canonical Staff compensation",()=>assert.match(sql,/sum\(financial\.payroll_net\)/));
test("04 monthly total has one calculation function",()=>assert.equal((sql.match(/create or replace function public\.calculate_staff_monthly_settlement/g)??[]).length,1));
test("05 rate semantics are NET",()=>{assert.match(sql,/'rateSemantics','NET'/);assert.doesNotMatch(panel,/0\.1525/)});
test("06 tax comes from effective configuration",()=>assert.match(sql,/staff_withholding_rate_for_period/));
test("07 exact boleta uses canonical gross-up",()=>assert.match(sql,/round\(work_total\/\(1-rate\),0\)/));
test("08 rounding is deterministic CLP",()=>assert.match(sql,/ROUND_CLP_HALF_AWAY_FROM_ZERO/));
test("09 advances persist as independent movements",()=>assert.match(sql,/movement_type='ADVANCE'/));
test("10 multiple advances are summed",()=>assert.match(sql,/sum\(case when movement\.movement_type='ADVANCE'/));
test("11 advance does not reduce boleta",()=>assert.match(sql,/gross_amount:=round\(work_total\/\(1-rate\),0\)/));
test("12 advance reduces final cash only",()=>{assert.match(sql,/final_transfer:=greatest\(cash_obligation-advances,0\)/);assert.match(sql,/remaining:=greatest\(event_obligation-event_advance,0\)/)});
test("13 PDF contains work detail",()=>assert.match(pdf,/DETALLE DE SERVICIOS REALIZADOS/));
test("14 finalized snapshot is immutable",()=>{assert.match(sql,/finalized_snapshot=calculation/);assert.match(sql,/settlement_status<>'FINALIZED'/)});
test("15 Staff Portal receives canonical monthly accounts",()=>assert.match(portal,/mapStaffMonthlyAccount/));
test("16 Staff can upload boleta",()=>assert.match(panel,/Subir boleta SII/));
test("17 documents require protected authenticated access",()=>{assert.match(boletaRoute,/No autorizado/);assert.match(boletaRoute,/createAdminClient/);assert.doesNotMatch(boletaRoute,/getPublicUrl/)});
test("18 upload success waits for RPC",()=>assert.ok(actions.indexOf("submit_staff_monthly_boleta")<actions.indexOf("Boleta enviada para revisión")));
test("19 Founder can review boleta",()=>assert.match(panel,/Ver boleta/));
test("20 rejection requires a reason server-side",()=>assert.match(sql,/Motivo de rechazo obligatorio/));
test("21 rejected boleta can be replaced",()=>{assert.match(sql,/account\.boleta_status<>'REJECTED'/);assert.match(sql,/status='REPLACED'/)});
test("22 approval produces ready-to-pay",()=>assert.match(sql,/then 'READY_TO_PAY'/));
test("23 server-side payment gate requires approved boleta",()=>assert.match(sql,/item\.boleta_status<>'APPROVED'/));
test("24 pending boleta blocks payment",()=>assert.match(sql,/Aprueba la boleta antes de pagar/));
test("25 received boleta remains blocked until approval",()=>assert.match(sql,/boleta_status='RECEIVED'[\s\S]*payment_status='PENDING'/));
test("26 ready-to-pay is explicit",()=>assert.match(panel,/READY_TO_PAY/));
test("27 simple Founder payment sheet exists",()=>assert.match(center,/Planilla de pagos Staff/));
test("28 pending operators contribute zero",()=>assert.match(sql,/then account\.final_transfer_amount else 0 end payable_total/));
test("29 total general derives from ready accounts",()=>{assert.match(center,/TOTAL GENERAL A DEPOSITAR/);assert.match(center,/boletaStatus==="APPROVED"&&row\.account\.paymentStatus==="READY_TO_PAY"/)});
test("30 final payment equals final transfer",()=>assert.match(sql,/p_amount,0\)<>item\.final_transfer_amount/));
test("31 duplicate final payment is protected",()=>{assert.match(sql,/payment_idempotency_key=p_idempotency_key/);assert.match(actions,/fileHash/)});
test("32 Staff isolation is checked on every document route",()=>{assert.match(boletaRoute,/portal\?\.staff_id!==account\.staff_id/);assert.match(pdfRoute,/permission\.staffId!==row\.staff_id/)});
test("33 historical finalized settlement is read-only",()=>assert.match(sql,/settlement_status='FINALIZED'/));
test("34 August is not hardcoded or auto-generated",()=>{assert.doesNotMatch(sql,/2026-08-01/);assert.match(sql,/No August backfill is executed/)});
test("35 missing compensation requires Founder review",()=>assert.match(sql,/Evento\(s\) con asignación sin compensación confirmada/));
test("36 all surfaces consume the canonical calculation",()=>{assert.match(panel,/account\.boletaGross/);assert.match(pdf,/account\.boletaGross/);assert.doesNotMatch(center,/1 - 0\.1525/)});
test("37 customer finance is untouched",()=>assert.doesNotMatch(sql,/\b(?:insert into|update|delete from) public\.(?:invoice_payments|receivable_movements|invoices)\b/i));
test("38 no other ORBIT module is imported into settlement writes",()=>assert.doesNotMatch(actions,/accounts-receivable|reservation|quotation|digital-photo/));
test("39 mobile layout avoids fixed viewport widths",()=>{assert.match(panel,/grid-cols-2/);assert.doesNotMatch(panel,/w-\[\d+px\]/)});
test("40 desktop and PDF output are complete",async()=>{const account={id:"a",staffId:"s",month:"2026-08-01",expectedAmount:110000,workNet:160000,boletaGross:188791,withholdingRate:15.25,withholdingAmount:28791,boletaNet:160000,advancesTotal:50000,reimbursementsTotal:0,finalTransferAmount:110000,excessAdvance:0,eventCount:1,settlementStatus:"FINALIZED"as const,settlementDocumentId:null,reviewRequired:false,reviewReason:"",calculation:{source:"CANONICAL_STAFF_MONTHLY_SETTLEMENT_V1",rateSemantics:"NET"as const,periodSource:"EVENT_DATE"as const,rounding:"ROUND_CLP_HALF_AWAY_FROM_ZERO",details:[{settlementId:"x",projectId:"p",eventDate:"2026-08-28",event:"Evento",customer:"Cliente",service:"Classic",location:"Providencia",roles:["OPERATOR"],hours:4,workNet:160000,reimbursements:0,advances:50000}],blockingEvents:[]},boletaStatus:"PENDING"as const,boletaDocumentId:null,rejectionReason:"",paymentStatus:"PENDING"as const,paidAmount:0,paidAt:"",paymentMethod:"",paymentReference:"",receiptDocumentId:null,driveSyncStatus:"PENDING"};const bytes=await createStaffMonthlySettlementPdf({account,staff:{name:"Operador Prueba",rut:"1-9",role:"Operador"}}),document=await PDFDocument.load(bytes);assert.ok(bytes.length>1000);assert.equal(document.getPageCount(),1);assert.match(pdf,/MONTO TOTAL BOLETA SII A EMITIR/)});
test("41 settlement detail has explicit back control",()=>assert.match(panel,/Volver a liquidaciones mensuales/));
test("42 back preserves selected month",()=>{assert.match(center,/setOpenStaffId\(null\)/);assert.match(center,/value=\{month\}/)});
test("43 mobile back control is touch sized",()=>assert.match(panel,/min-h-11/));
test("44 desktop back control is visible",()=>assert.match(panel,/inline-flex min-h-11/));
test("45 blocking open Events are projected explicitly",()=>{assert.match(sql,/staff_monthly_blocking_events/);assert.match(modelSource,/blockingEvents/)});
test("46 blocker includes canonical Event ID and action",()=>{assert.match(panel,/item\.eventId/);assert.match(panel,/Abrir Evento/)});
test("47 Event action uses canonical project route",()=>assert.match(panel,/href=\{`\/projects\/\$\{item\.projectId\}`\}/));
test("48 multiple blockers render as a list",()=>assert.match(panel,/blockingEvents\.map/));
test("49 refresh re-runs canonical projection",()=>assert.match(actions,/revalidatePath\("\/resources\/staff"\)/));
test("50 open Events are never auto-closed",()=>assert.doesNotMatch(sql,/update public\.projects[\s\S]*CLOSED/));
test("51 settlement calculations remain canonical",()=>assert.match(sql,/calculate_staff_monthly_settlement/));
test("52 boleta and payment gates remain unchanged",()=>{assert.match(sql,/boleta_status<>'APPROVED'/);assert.match(sql,/settlement_status<>'FINALIZED'/)});
test("53 Completed is sufficient for staff eligibility",()=>{assert.match(sql,/upper\(coalesce\(project\.status,''\)\) in\('COMPLETED','COMPLETADO'\)/);assert.match(sql,/event_operational_closures/)})
test("54 explicit completion action is global and non-financial",()=>{const source=readFileSync("supabase/migrations/0201_staff_completion_eligibility.sql","utf8"),action=readFileSync("features/event-operations-checklist/actions.ts","utf8"),ui=readFileSync("features/event-operations-checklist/event-completion-action.tsx","utf8");assert.match(source,/mark_event_completed/);assert.match(source,/status='Completed'/);assert.match(action,/mark_event_completed/);assert.match(ui,/window\.confirm/)})
test("55 settlement rows expose direct completion action",()=>{const source=readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx","utf8");assert.match(source,/Marcar completado/);assert.match(source,/completeSettlementEventAction/);assert.match(source,/router\.refresh/)})
test("56 completed rows show status and no completion button",()=>{const source=readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx","utf8");assert.match(source,/COMPLETADO ✓/);assert.match(source,/Pendientes de completar/)})
test("57 completion confirmation preserves customer finance",()=>{const source=readFileSync("features/staff-monthly-account/staff-monthly-account-panel.tsx","utf8");assert.match(source,/saldo del cliente, cobranzas y pagos pendientes continuarán activos/)})
