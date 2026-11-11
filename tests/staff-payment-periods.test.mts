import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the real migration in an isolated PostgreSQL engine. The fixture supplies
// existing table contracts and a deterministic canonical financial source.
// ORBIT_PGLITE_MODULE points to a separately installed @electric-sql/pglite module.
test("payment period migration, ledgers, tax gates and historical protection", async (context) => {
  if (!process.env.ORBIT_PGLITE_MODULE) {
    context.skip(
      "Set ORBIT_PGLITE_MODULE to run isolated PostgreSQL integration QA.",
    );
    return;
  }
  const { PGlite } = await import(process.env.ORBIT_PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
create function public.staff_withholding_rate_for_period(date) returns numeric language sql stable as $$ select 0.1525::numeric $$;
create function public.can_administer() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'')='true' $$;
create table staff(id uuid primary key,deleted_at timestamptz,first_name text default 'QA',last_name text default 'Sintético',email text default 'staff@example.invalid',rut text default '1-9',role text default 'OPERATOR');
create table company_settings(settings_key text primary key,legal_name text,tax_id text,address text,city text);
insert into company_settings values('PRIMARY','Empresa QA','1-9','Dirección QA','Santiago');
create table internal_notifications(id uuid primary key default gen_random_uuid(),staff_id uuid,notification_type text,title text,message text,status text,correlation_id text unique,category text,priority text,action_required boolean,entity_type text,entity_id uuid,related_href text,metadata jsonb);

create table staff_onboarding_documents(id uuid primary key default gen_random_uuid(),invitation_id uuid,staff_id uuid,document_type text,category text,applicable_month text,friendly_label text,status text,storage_bucket text,storage_path text,file_name text,mime_type text,created_by uuid);
create table staff_monthly_accounts(id uuid primary key default gen_random_uuid(),staff_id uuid,accounting_month date,expected_amount numeric,work_net numeric,boleta_gross numeric,boleta_net numeric,withholding_rate numeric,withholding_amount numeric,calculation jsonb,settlement_status text default 'DRAFT',payment_status text default 'PENDING',boleta_status text default 'PENDING',boleta_document_id uuid,finalized_snapshot jsonb,paid_amount numeric,paid_at date,payment_method text,payment_reference text,payment_receipt_document_id uuid,payment_idempotency_key text,drive_sync_status text,updated_at timestamptz,unique(staff_id,accounting_month));
create table staff_monthly_closes(accounting_month date,status text);
create table projects(id uuid primary key,event_date date,status text,name text,location text,city text,customer_id uuid,deleted_at timestamptz);
create table customers(id uuid primary key,full_name text);
create table event_staff_payments(id uuid primary key,staff_id uuid,project_id uuid,accounting_month date,total_internal_payment numeric,paid_amount numeric default 0,paid_at date,settlement_status text,updated_at timestamptz,updated_by uuid);
create table event_staff_settlement_movements(id uuid primary key default gen_random_uuid(),settlement_id uuid,movement_type text,amount numeric,movement_date date,method text,receipt_path text,receipt_document_id uuid,notes text,legacy_source text unique,created_by uuid,updated_by uuid);
create table event_staff_settlement_adjustments(id uuid primary key,settlement_id uuid,amount numeric);
create table staff_training_assignments(id uuid primary key,project_id uuid,trainee_staff_id uuid,training_amount_clp numeric,status text);
create function public.calculate_staff_monthly_settlement_legacy(s uuid,m date) returns jsonb language sql stable set search_path=public as $$
with details as (select jsonb_build_object('settlementId',p.id,'projectId',p.project_id,'eventDate',e.event_date,'event',e.name,'workNet',p.total_internal_payment,'workPaid',coalesce((select sum(amount) from event_staff_settlement_movements x where x.settlement_id=p.id),0),'workPending',p.total_internal_payment-coalesce((select sum(amount) from event_staff_settlement_movements x where x.settlement_id=p.id),0),'advances',0,'reimbursements',0,'reimbursementsPaid',0,'roles',jsonb_build_array('OPERATOR')) d from event_staff_payments p join projects e on e.id=p.project_id where p.staff_id=s and p.accounting_month=m)
select jsonb_build_object('details',coalesce(jsonb_agg(d),'[]'),'workNet',coalesce(sum((d->>'workNet')::numeric),0),'boletaNet',coalesce(sum((d->>'workNet')::numeric),0),'boletaGross',0,'withholdingRate',15.25,'workPaid',coalesce(sum((d->>'workPaid')::numeric),0),'workPending',coalesce(sum((d->>'workPending')::numeric),0),'cashObligation',coalesce(sum((d->>'workPending')::numeric),0),'finalTransferAmount',coalesce(sum((d->>'workPending')::numeric),0),'eventCount',count(*),'reviewRequired',false,'upcomingDetails','[]'::jsonb) from details $$;
create function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date) returns jsonb language sql stable set search_path=public as $$select public.calculate_staff_monthly_settlement_legacy(p_staff_id,p_month)$$;
create function public.ensure_staff_monthly_account(s uuid,m date) returns public.staff_monthly_accounts language plpgsql set search_path=public as $$declare a public.staff_monthly_accounts; begin insert into public.staff_monthly_accounts(staff_id,accounting_month) values(s,date_trunc('month',m)::date) on conflict do nothing; select * into a from staff_monthly_accounts where staff_id=s and accounting_month=date_trunc('month',m)::date; return a; end $$;
create function public.finalize_staff_monthly_account(p_account_id uuid) returns public.staff_monthly_accounts language plpgsql set search_path=public as $$declare a public.staff_monthly_accounts; begin update public.staff_monthly_accounts set settlement_status='FINALIZED',finalized_snapshot=public.calculate_staff_monthly_settlement(staff_id,accounting_month) where id=p_account_id returning * into a; return a; end $$;
create function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) returns public.staff_monthly_accounts language sql as $$select * from public.staff_monthly_accounts where id=$1$$;
`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261111000753_staff_payment_periods.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261111012400_staff_period_close_email.sql",
        "utf8",
      ),
    );
    const actor = "10000000-0000-0000-0000-000000000001";
    const s1 = "20000000-0000-0000-0000-000000000001",
      s2 = "20000000-0000-0000-0000-000000000002",
      s3 = "20000000-0000-0000-0000-000000000003";
    const event1 = "30000000-0000-0000-0000-000000000001",
      event2 = "30000000-0000-0000-0000-000000000002",
      event3 = "30000000-0000-0000-0000-000000000003";
    const settlement1 = "40000000-0000-0000-0000-000000000001";
    const training = "50000000-0000-0000-0000-000000000001";
    const query = (sql: string, params: unknown[] = []) =>
      db.query(sql, params);
    const fail = async (sql: string, match: RegExp, params: unknown[] = []) => {
      await assert.rejects(() => query(sql, params), match);
      console.log("PASS expected rejection", match.source);
    };
    await db.exec(`select set_config('test.actor','${actor}',false);select set_config('test.admin','true',false);
insert into auth.users values('${actor}');insert into staff(id,deleted_at) values('${s1}',null),('${s2}',null),('${s3}',null);
insert into projects(id,event_date,name) values('${event1}','2026-10-14','Evento 14'),('${event2}','2026-10-15','Evento 15'),('${event3}','2026-10-31','Evento 31');
insert into event_staff_payments(id,staff_id,project_id,accounting_month,total_internal_payment) values('${settlement1}','${s1}','${event1}','2026-10-01',24000),('40000000-0000-0000-0000-000000000002','${s1}','${event2}','2026-10-01',19000),('40000000-0000-0000-0000-000000000003','${s2}','${event3}','2026-10-01',15000);
insert into staff_training_assignments values('${training}','${event1}','${s1}',12000,'COMPLETED');`);
    await fail(
      `select configure_staff_payment_periods(array['${s1}']::uuid[],'2026-10-01','QUINCENAL',null)`,
      /validación tributaria/,
    );
    await query(
      `select configure_staff_payment_periods(array['${s1}','${s3}']::uuid[],'2026-10-01','QUINCENAL','Contador sintético QA 2026-10-01')`,
    );
    await query(
      `select configure_staff_payment_periods(array['${s2}']::uuid[],'2026-10-01','MENSUAL',null)`,
    );
    assert.equal(
      (await query("select count(*)::int n from staff_payment_schedules"))
        .rows[0].n,
      3,
    );
    console.log("PASS bulk and individual mixed modalities");
    assert.equal(
      (await query("select count(*)::int n from staff_period_email_outbox"))
        .rows[0].n,
      0,
    );
    const periods = (
      await query(
        `select p.*,a.staff_id from staff_payment_periods p join staff_monthly_accounts a on a.id=p.account_id`,
      )
    ).rows as {
      id: string;
      staff_id: string;
      period_code: string;
      account_id: string;
    }[];
    const q1 = periods.find(
        (p) => p.staff_id === s1 && p.period_code === "Q1",
      )!,
      q2 = periods.find((p) => p.staff_id === s1 && p.period_code === "Q2")!;
    const emptyQ1 = periods.find(
      (p) => p.staff_id === s3 && p.period_code === "Q1",
    )!;
    await query("update staff set email='' where id=$1", [s3]);
    await fail("select close_staff_payment_period($1)", /correo válido/, [
      emptyQ1.id,
    ]);
    assert.equal(
      (
        await query("select status from staff_payment_periods where id=$1", [
          emptyQ1.id,
        ])
      ).rows[0].status,
      "DRAFT",
    );
    await query("update staff set email='staff@example.invalid' where id=$1", [
      s3,
    ]);
    await query("delete from company_settings");
    await fail(
      "select close_staff_payment_period($1)",
      /configuración tributaria/,
      [q1.id],
    );
    assert.equal(
      (
        await query("select status from staff_payment_periods where id=$1", [
          q1.id,
        ])
      ).rows[0].status,
      "DRAFT",
    );
    assert.equal(
      (await query("select count(*)::int n from staff_period_email_outbox"))
        .rows[0].n,
      0,
    );
    await query(
      "insert into company_settings values('PRIMARY','Empresa QA','1-9','Dirección QA','Santiago')",
    );
    let preview = (
      await query("select preview_staff_payment_period($1) p", [q1.id])
    ).rows[0].p;
    assert.equal(preview.calculation.workNet, 36000);
    assert.equal(preview.calculation.eventCount, 2);
    preview = (
      await query("select preview_staff_payment_period($1) p", [q2.id])
    ).rows[0].p;
    assert.equal(preview.calculation.workNet, 19000);
    assert.equal(preview.calculation.eventCount, 1);
    console.log("PASS 14/15 date boundary and training inclusion");
    await fail("select close_staff_payment_period($1)", /primera quincena/, [
      q2.id,
    ]);
    await query("select close_staff_payment_period($1)", [q1.id]);
    await query("select close_staff_payment_period($1)", [q1.id]);
    assert.equal(
      (
        await query(
          `select count(*)::int n from staff_payment_period_audit where period_id=$1 and action='PERIOD_CLOSED'`,
          [q1.id],
        )
      ).rows[0].n,
      1,
    );
    const firstIntent = (
      await query(
        "select o.payload,n.metadata,n.correlation_id from staff_period_email_outbox o join internal_notifications n on n.id=o.notification_id where o.period_id=$1",
        [q1.id],
      )
    ).rows[0];
    assert.equal(firstIntent.payload.period.period_code, "Q1");
    assert.equal(firstIntent.metadata.email_status, "PENDING");
    assert.equal(firstIntent.metadata.payload, undefined);
    assert.equal(firstIntent.correlation_id, `staff-period-close:${q1.id}`);
    assert.equal(
      (
        await query(
          "select count(*)::int n from staff_period_email_outbox where period_id=$1",
          [q1.id],
        )
      ).rows[0].n,
      1,
    );
    await fail(
      `update event_staff_payments set total_internal_payment=25000 where id='${settlement1}'`,
      /bloque Staff está cerrado/,
    );
    await fail(
      `select configure_staff_payment_periods(array['${s1}']::uuid[],'2026-10-01','MENSUAL',null)`,
      /cambiar la modalidad/,
    );
    await fail(
      `insert into event_staff_settlement_movements(settlement_id,movement_type,amount) values('${settlement1}','ADVANCE',1)`,
      /bloque Staff está cerrado/,
    );
    const pay = async (
      id: string,
      amount: number,
      key: string,
      date = "2026-10-14",
    ) =>
      query(
        `select register_staff_period_payment($1,$2,$3,'TRANSFERENCIA','QA',$4,'orbit-documents','qa/receipt','receipt.pdf','application/pdf') p`,
        [id, amount, date, key],
      );
    await fail(
      `select register_staff_period_payment($1,36001,'2026-10-14','TRANSFERENCIA','QA','overpay','orbit-documents','qa/receipt','receipt.pdf','application/pdf')`,
      /supera el saldo/,
      [q1.id],
    );
    await pay(q1.id, 10000, "partial-1");
    await pay(q1.id, 10000, "partial-1");
    assert.equal(
      (
        await query(
          `select count(*)::int n from staff_period_payments where period_id=$1`,
          [q1.id],
        )
      ).rows[0].n,
      1,
    );
    await pay(q1.id, 26000, "partial-2");
    assert.equal(
      (
        await query(
          `select sum(amount)::int n from staff_training_payment_allocations`,
        )
      ).rows[0].n,
      12000,
    );
    preview = (
      await query("select preview_staff_payment_period($1) p", [q1.id])
    ).rows[0].p;
    assert.equal(preview.remaining, 0);
    const calc = (
      await query(
        `select calculate_staff_monthly_settlement($1,'2026-10-01') p`,
        [s1],
      )
    ).rows[0].p;
    assert.equal(calc.workNet, 55000);
    assert.equal(calc.workPaid, 36000);
    assert.equal(calc.workPending, 19000);
    console.log(
      "PASS partial payments, idempotency, training allocation and monthly balance",
    );
    await fail(
      `select finalize_staff_monthly_account($1)`,
      /Cierra todos los bloques/,
      [q1.account_id],
    );
    await query("select close_staff_payment_period($1)", [q2.id]);
    await fail(
      `select register_staff_monthly_payment($1,'2026-10-31',19000,'TRANSFERENCIA','QA','legacy','b','p','n','m')`,
      /desde el bloque/,
      [q1.account_id],
    );
    await fail(
      `select register_staff_period_payment($1,19000,'2026-10-31','TRANSFERENCIA','QA','no-boleta','orbit-documents','qa/receipt','receipt.pdf','application/pdf')`,
      /Aprueba la boleta/,
      [q2.id],
    );
    await query(
      `update staff_monthly_accounts set boleta_status='APPROVED' where id=$1`,
      [q1.account_id],
    );
    await pay(q2.id, 19000, "second", "2026-10-31");
    assert.equal(
      (
        await query(
          "select payment_status,paid_amount from staff_monthly_accounts where id=$1",
          [q1.account_id],
        )
      ).rows[0].payment_status,
      "PAID",
    );
    console.log("PASS Q2 consolidation, monthly boleta gate and paid account");
    const grossTotal = (
      await query(
        "select sum(gross_amount)::int gross,sum(withholding_amount)::int retained from staff_period_payments b join staff_payment_periods p on p.id=b.period_id where p.account_id=$1",
        [q1.account_id],
      )
    ).rows[0];
    assert.equal(grossTotal.gross, Math.round(55000 / 0.8475));
    assert.equal(grossTotal.gross - 55000, grossTotal.retained);
    assert.equal(
      (
        await query(
          "select sum(amount)::int paid from staff_training_payment_movements",
        )
      ).rows[0].paid,
      12000,
    );
    assert.equal(
      (
        await query(
          "select remaining_balance::int pending from staff_training_period_balances where id=$1",
          [training],
        )
      ).rows[0].pending,
      0,
    );
    console.log(
      "PASS tax rounding and training cash projection without duplicate work",
    );
    const monthly = periods.find(
      (p) => p.staff_id === s2 && p.period_code === "MONTH",
    )!;
    await query("select close_staff_payment_period($1)", [monthly.id]);
    await query(
      "update staff_monthly_accounts set boleta_status='APPROVED' where id=$1",
      [monthly.account_id],
    );
    await pay(monthly.id, 5000, "monthly-partial", "2026-10-31");
    await fail(
      "select register_staff_period_payment($1,10000,'2026-11-01','TRANSFERENCIA','QA','cross-month','orbit-documents','qa/receipt','receipt.pdf','application/pdf')",
      /períodos tributarios diferentes/,
      [monthly.id],
    );
    await pay(monthly.id, 10000, "monthly-final", "2026-10-31");
    assert.equal(
      (
        await query(
          "select payment_status from staff_monthly_accounts where id=$1",
          [monthly.account_id],
        )
      ).rows[0].payment_status,
      "PAID",
    );
    console.log(
      "PASS monthly closure, partial payments and cross-tax-period protection",
    );

    await fail(
      `select configure_staff_payment_periods(array['${s1}']::uuid[],'2026-10-01','MENSUAL',null)`,
      /cerrado, pagado/,
    );
    await query(
      `select configure_staff_payment_periods(array['${s2}']::uuid[],'2024-02-01','QUINCENAL','Contador sintético QA 2024-02-01')`,
    );
    assert.equal(
      (
        await query(
          `select ends_on::text d from staff_payment_periods p join staff_monthly_accounts a on a.id=p.account_id where a.accounting_month='2024-02-01' and period_code='Q2'`,
        )
      ).rows[0].d,
      "2024-02-29",
    );
    console.log("PASS leap-year end-of-month");
    await query(`select set_config('test.admin','false',false)`);
    await fail(
      "select preview_staff_payment_period($1)",
      /Acceso administrativo/,
      [q1.id],
    );
    console.log("PASS authorization");
    const intents = (
      await query(
        "select o.payload,n.metadata,n.correlation_id from staff_period_email_outbox o join internal_notifications n on n.id=o.notification_id",
      )
    ).rows;
    const secondIntent = intents.find(
      (row: any) => row.payload.period.period_code === "Q2",
    );
    assert.ok(secondIntent);
    assert.equal(secondIntent.payload.monthly.workNet, 55000);
    assert.equal(secondIntent.payload.monthly.workPaid, 36000);
    assert.equal(secondIntent.payload.monthly.workPending, 19000);
    assert.equal(secondIntent.payload.monthly.boletaGross, 64897);
    assert.match(secondIntent.correlation_id, /^staff-boleta-request:/);
    assert.ok(
      intents.some((row: any) => row.payload.period.period_code === "MONTH"),
    );
    assert.ok(
      intents.every((row: any) => row.metadata.email_status === "PENDING"),
    );
    await query("select set_config('test.admin','false',false)");
    await db.exec("set role authenticated");
    assert.equal(
      (await query("select count(*)::int n from staff_period_email_outbox"))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      () =>
        query(
          "insert into staff_period_email_outbox(period_id,notification_id,payload) values(gen_random_uuid(),gen_random_uuid(),'{}')",
        ),
      /permission denied/,
    );
    await db.exec("reset role");
    console.log(
      "PASS Q1/Q2/MONTH durable close email intents, gross unchanged by first payment, no notification salary payload, admin-only snapshots",
    );
  } finally {
    await db.close();
  }
});
