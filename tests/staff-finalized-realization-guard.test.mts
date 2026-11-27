import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = (filename: string) => readFileSync(`supabase/migrations/${filename}`, "utf8");
const definition = (filename: string, functionName: string) => {
  const sql = source(filename);
  const marker = `create or replace function public.${functionName}(`;
  const start = sql.indexOf(marker);
  const end = sql.indexOf("$$;", sql.indexOf("$$", start) + 2);
  assert.ok(start >= 0 && end >= start);
  return sql.slice(start, end + 3);
};
const migration = source("20261127190000_enforce_staff_finalized_realization_fields.sql");

const settlementId = "11111111-1111-4111-8111-111111111111";
const periodId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
test("the finalized Staff guard permits partial and final realization without changing frozen values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.event_staff_payments (
     id uuid PRIMARY KEY, total_internal_payment numeric NOT NULL, accounting_month date NOT NULL,
     paid_amount numeric NOT NULL DEFAULT 0, paid_at date, settlement_status text NOT NULL DEFAULT 'PENDING',
     deleted_at timestamptz, updated_at timestamptz, updated_by uuid, version integer NOT NULL DEFAULT 1,
     status text NOT NULL DEFAULT 'CONFIRMED', operator_payment numeric, assembly_payment numeric, disassembly_payment numeric,
     automatic_operator_payment numeric, automatic_assembly_payment numeric, automatic_disassembly_payment numeric,
     original_operator_payment numeric, original_assembly_payment numeric, original_disassembly_payment numeric
    );
    CREATE TABLE public.event_staff_settlement_movements (
     settlement_id uuid NOT NULL, movement_type text NOT NULL, amount numeric NOT NULL, movement_date date NOT NULL, deleted_at timestamptz
    );
    CREATE TABLE public.staff_payment_periods (id uuid PRIMARY KEY, status text NOT NULL, snapshot jsonb NOT NULL);
    CREATE FUNCTION public.staff_settlement_payroll_amount(uuid) RETURNS numeric LANGUAGE sql AS $$
     SELECT total_internal_payment FROM public.event_staff_payments WHERE id=$1
    $$;
    `);
    await db.exec(definition("20260928130000_immutable_finalized_settlement_period.sql", "recalculate_event_staff_settlement"));
    await db.exec(definition("0001_production_backbone.sql", "touch_versioned_row"));
    await db.exec(definition("0097_staff_settlement_adjustments.sql", "capture_event_staff_settlement_original"));
    await db.exec(migration);
    await db.exec(`
    CREATE TRIGGER capture_event_staff_settlement_original BEFORE INSERT OR UPDATE ON public.event_staff_payments FOR EACH ROW EXECUTE FUNCTION public.capture_event_staff_settlement_original();
    CREATE TRIGGER event_staff_payments_touch BEFORE UPDATE ON public.event_staff_payments FOR EACH ROW EXECUTE FUNCTION public.touch_versioned_row();
    CREATE TRIGGER staff_period_guard_settlement BEFORE UPDATE OR DELETE ON public.event_staff_payments FOR EACH ROW EXECUTE FUNCTION public.guard_staff_payment_period_inputs();
    CREATE TRIGGER staff_period_guard_movements BEFORE INSERT OR UPDATE OR DELETE ON public.event_staff_settlement_movements FOR EACH ROW EXECUTE FUNCTION public.guard_staff_payment_period_inputs();
    CREATE FUNCTION public.fixture_recalculate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
     PERFORM public.recalculate_event_staff_settlement(NEW.settlement_id);
     RETURN NEW;
    END $$;
    CREATE TRIGGER fixture_recalculate AFTER INSERT ON public.event_staff_settlement_movements FOR EACH ROW EXECUTE FUNCTION public.fixture_recalculate();
    CREATE FUNCTION public.fixture_record_period_payment(p_amount numeric, p_period uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
     PERFORM set_config('orbit.staff_period_payment', p_period::text, true);
     INSERT INTO public.event_staff_settlement_movements VALUES ('${settlementId}', 'PAYMENT', p_amount, '2026-11-25', NULL);
     PERFORM set_config('orbit.staff_period_payment', '', true);
    END $$;
    INSERT INTO public.event_staff_payments (id, total_internal_payment, accounting_month, operator_payment)
    VALUES ('${settlementId}', 46000, '2026-11-01', 46000);
    INSERT INTO public.staff_payment_periods VALUES (
     '${periodId}', 'FINALIZED',
     jsonb_build_object('details', jsonb_build_array(jsonb_build_object('settlementId', '${settlementId}')))
    );
    `);
    const read = async () => (await db.query(`
       SELECT paid_amount::int, paid_at::text, settlement_status, total_internal_payment::int,
              accounting_month::text, original_operator_payment::int, version
       FROM public.event_staff_payments WHERE id='${settlementId}'
     `)).rows[0];
    const protectedError = /El bloque Staff está cerrado/;
    await assert.rejects(db.query(`SELECT public.fixture_record_period_payment(1000, '${settlementId}')`), protectedError);
    await assert.rejects(db.query(`UPDATE public.event_staff_payments SET paid_amount=1000 WHERE id='${settlementId}'`), protectedError);
    await db.query(`SELECT public.fixture_record_period_payment(12000, '${periodId}')`);
    assert.deepEqual(await read(), {
      paid_amount: 12000, paid_at: "2026-11-25", settlement_status: "ADVANCE",
      total_internal_payment: 46000, accounting_month: "2026-11-01", original_operator_payment: 46000, version: 2,
    });
    await db.query(`SELECT public.fixture_record_period_payment(34000, '${periodId}')`);
    const paid = {
      paid_amount: 46000, paid_at: "2026-11-25", settlement_status: "PAID",
      total_internal_payment: 46000, accounting_month: "2026-11-01", original_operator_payment: 46000, version: 3,
    };
    assert.deepEqual(await read(), paid);
    await assert.rejects(db.exec(`
       BEGIN;
       SELECT set_config('orbit.staff_period_payment', '${periodId}', true);
       UPDATE public.event_staff_payments SET total_internal_payment=45000 WHERE id='${settlementId}';
       COMMIT;
     `), protectedError);
    await db.exec("ROLLBACK");
    await assert.rejects(db.exec(`
       BEGIN;
       SELECT set_config('orbit.staff_period_payment', '${periodId}', true);
       UPDATE public.event_staff_payments SET accounting_month='2026-12-01' WHERE id='${settlementId}';
       COMMIT;
     `), protectedError);
    await db.exec("ROLLBACK");
    await assert.rejects(db.exec(`
      BEGIN;
      SELECT set_config('orbit.staff_period_payment', '${periodId}', true);
      UPDATE public.event_staff_payments SET id='${otherId}' WHERE id='${settlementId}';
      COMMIT;
    `), protectedError);
    await db.exec("ROLLBACK");
    assert.deepEqual(await read(), paid);
  } finally {
    await db.close();
  }
});
