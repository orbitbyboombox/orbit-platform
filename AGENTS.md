# ORBIT Repository Instructions

All work in this repository MUST comply with the [ORBIT Constitution](docs/orbit-constitution.md).

The Constitution is a permanent architecture constraint, not a feature specification. Before changing code, data, migrations, integrations, user experience, or operational workflows, verify the proposed work against every constitutional article. An implementation that violates any article is incorrect even if it compiles or passes automated tests.

Mandatory safeguards:

- Use one shared reservation pipeline for every reservation entry point. Never duplicate business rules or post-confirmation logic.
- Treat Customers as permanent CRM records and Events as independently managed operational records. Customers may be archived but never deleted.
- Manage each business object only from its owning module. Finance and Dashboard are read-only reporting surfaces.
- Recalculate all dependent projections automatically after operational changes. Never introduce manual KPI or duplicated calculation paths.
- Model payments as independent ledger movements. Never overwrite accumulated payment totals or payment history.
- Never send customer communications because of an internal edit. Customer emails require an explicit Founder action.
- Portal synchronization is automatic and is independent from customer notification.
- Preserve each administrator's Founder Workspace configuration. New modules default to hidden and no release may reset a saved workspace.
- Production KPIs use active production records only. Archived, cancelled, deleted, or QA data must not contribute.
- The production Customers Daniela Frías, Victoria, Soledad Provens, Abigail, and Dominga are protected. No cleanup, migration, repair, seed, merge, deletion, or recreation may remove or replace them.
- Compilation, lint, build, deployment, and automated tests do not certify a module. Only explicit Founder operational validation can certify it. Certified modules are frozen except for critical production bugs.
- Prefer changes that reduce Founder effort, mistakes, and operational complexity. Reject changes that do not improve BOOMBOX's speed, control, or reliability.
