# Founder authorization — quotation automation

Date: 2026-10-12
Project: ORBIT BOOMBOX

The Founder expressly authorizes a narrowly scoped exception to Constitution Article 7: ORBIT may send quotation replies without per-message Founder approval ONLY for inbound website quotations confidently classified as marriage/wedding, birthday, or graduation.

All company/corporate, special-event, ambiguous, and unclassified leads MUST remain manual and require explicit Founder approval before customer communication.

Implementation constraints:
- Preserve existing commercial templates, pricing, payment terms and branding; do not invent missing templates.
- Verify Wix quotation intake into ORBIT before enabling automation.
- Enforce idempotency per quotation and outgoing reply; retain audit trail of classification, draft, send result and failures.
- Fail closed: uncertainty, integration errors or missing template means draft/manual review, not send.
- Maintain GLOBAL AUTOMATION OFF and Founder QA/test mode until technical tests and a controlled email test pass.
- This authorization permits development and subsequent scoped operation after validation, but does NOT authorize turning on production sends now.
- Update the Constitution and BIANCA documentation to reference this specific exception after inspecting the actual source files. All unrelated Article 7 restrictions remain in force.

Status: Authorization recorded; implementation, testing and deployment are not yet complete.
