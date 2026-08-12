# ORBIT Constitution

Version 1.0

These are permanent platform rules. They are not features and are not optional. Every future development must respect them. If an implementation violates these rules, the implementation is incorrect.

## Article 1 — One Business, One Pipeline

There is only one Reservation Pipeline. Manual, Automatic, Corporate, and Wedding reservations must execute exactly the same business pipeline. Business logic must never be duplicated.

## Article 2 — Customer First

The Customer is permanent and Events are operational. One Customer may own unlimited Events. Customers are never deleted; they may only be archived.

## Article 3 — Module Ownership

Every business object is managed only from its owning module:

- Customer → Customer Module
- Event → Event Module
- Payments → Customer Event Financial Summary
- Staff → Staff Module
- Finance → read-only reporting
- Dashboard → read-only reporting

The Founder never leaves the origin module to manage information.

## Article 4 — One-Click Administration

Every important business object must support Open, Edit, Correct, Archive, and Delete where constitutionally permitted. Important objects must be administrable, not only readable. Customer deletion remains prohibited by Article 2.

## Article 5 — Automatic Recalculation

Every operational change automatically updates Dashboard, Finance, Accounts Receivable, Business Intelligence, Profitability, Reports, Portal, Calendar, Drive, and Timeline. There is no manual recalculation.

## Article 6 — Payment Ledger

Payments are independent financial movements. Previous payments are never overwritten. Every payment stores Amount, Date, Method, Receipt, User, and Timestamp. The Founder edits one movement, never the accumulated total.

## Article 7 — Founder Communication Policy

Internal changes never generate customer emails automatically. Internal changes update CRM, Portal, Dashboard, Business Engine, Finance, Business Intelligence, Timeline, and Calendar only. Customer communication occurs solely after an explicit Founder action such as Send Confirmation or Resend Documentation.

## Article 8 — Portal Synchronization

The Customer Portal always reflects the latest information. Internal changes synchronize the Portal automatically. Portal synchronization is not customer notification.

## Article 9 — Founder Workspace

The Founder decides what to see, what to hide, and the order in which items appear. Workspace configuration persists permanently. No future update may reset the Founder Workspace.

## Article 10 — Active Data Only

Dashboard, Finance, Business Intelligence, Customer Financial Summary, and Profitability calculate only active operational records. Archived, cancelled, deleted, and QA records never affect production KPIs.

## Article 11 — Data Protection

The following production Customers are protected:

- Daniela Frías
- Victoria
- Soledad Provens
- Abigail
- Dominga

No cleanup, migration, or repair may delete or recreate them.

## Article 12 — Module Certification

A module is never certified because it compiles. A module becomes Certified only after Founder operational validation. After certification, the module is frozen and only critical production bugs may modify it.

## Article 13 — User Experience

ORBIT adapts to the Founder. The Founder never adapts to ORBIT. Every implementation must reduce operational effort and must never increase complexity.

## Article 14 — Single Source of Truth

Every business object has one source:

- Customer → CRM
- Reservation → Reservation Pipeline
- Financial Movements → Payment Ledger
- Business Engine → Business Engine
- Operational Costs → Operational Cost Engine

Duplicated logic and duplicated calculations are prohibited.

## Article 15 — Go Live Principle

Every development must answer: “Does this help BOOMBOX operate faster, with fewer mistakes and greater control?” If the answer is no, the feature does not belong in ORBIT v1.0.

## Enforcement

Every future Release Candidate, migration, repair, cleanup, integration, and user-experience change must be reviewed against this Constitution before implementation and again before delivery.
