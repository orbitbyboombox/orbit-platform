# BOLETA SOS — Staff Admin

## Purpose
An exceptional, manual second honorarios receipt for a specific staff assignment/event, without replacing the canonical monthly receipt.

## Admin workflow
1. From Staff → Finanzas → operator, choose **BOLETA SOS**.
2. Select an existing verified assignment/settlement belonging to that operator and event.
3. Display outstanding net honorarios and gross boleta estimate; never include reimbursements in boleta gross.
4. Upload PDF/image manually. Save as a distinct immutable document and a new SOS record linked to settlement ID, staff ID, event ID, and accounting month.
5. Show uploaded receipt as **PENDING_REVIEW**, allow explicit review, then **REGISTER PAYMENT** as a separate operation requiring actual transfer details.
6. Keep all SOS records in operator's monthly history.

## Mandatory safety constraints
- CEO/ADMINISTRATOR only; validate role on server, not just UI.
- Never update or replace staff_monthly_accounts.boleta_document_id or approved historic receipts.
- Never create a PAID status when uploading or approving a boleta.
- Prevent duplicate SOS records and payments for the same settlement; verify outstanding amount against canonical settlement/payment ledger transactionally.
- SOS receipt and payment must be independent from reimbursements and normal monthly close.
- Reject unknown staff/event/settlement mismatches, invalid file types, and amounts above verified outstanding.
- Upload with unique immutable path, no upsert; compensate on failed DB insertion.
- Verify before production: historic Valentina October $36,000 receipt/payment unchanged, JW $19,000 remains payable until actual transfer, Uber $6,398 remains separately payable.
- Preserve current ORBIT v2.1.4 UI, and ensure no preview deployment is aliased to production.

## Delivery gate
This is a specification only. Implement database migration, server actions, UI, and regression tests before merging or deploying. Do not run production writes until reviewed and validated.
