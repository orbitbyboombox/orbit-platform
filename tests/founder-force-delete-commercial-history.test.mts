import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922150000_founder_force_delete_preserve_commercial_history.sql'),
  'utf8',
);
const workspace = readFileSync(
  join(process.cwd(), 'features/projects/components/project-workspace-experience.tsx'),
  'utf8',
);

test('detaches immutable commercial rows instead of deleting them', () => {
    assert.ok(migration.includes('former_project_id'));
    assert.ok(migration.includes('set former_project_id=project_id, project_id=null'));
    assert.ok(migration.includes('update public.quotations'));
    assert.ok(migration.includes('set project_id=null'));
    assert.doesNotMatch(migration, /delete\s+from\s+public\.quotations/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.reservation_commercial_negotiations/i);
    assert.doesNotMatch(migration, /delete\s+from\s+public\.project_commercial_origins/i);
  });

test('keeps detach narrowly scoped and guarded by the purge transaction', () => {
    assert.ok(migration.includes("current_setting('orbit.force_delete_detach', true) = 'on'"));
    assert.ok(migration.includes("perform set_config('orbit.force_delete_detach','on',true)"));
    assert.ok(migration.includes("perform set_config('orbit.force_delete_detach','off',true)"));
    assert.ok(migration.includes("raise exception 'El historial de negociación comercial es inmutable.'"));
    assert.ok(migration.includes("raise exception 'El origen comercial aceptado del Evento es inmutable.'"));
  });

test('explains the non-destructive behavior in the Founder confirmation copy', () => {
    assert.ok(workspace.includes('La cotización y el historial comercial se conservarán como registro histórico'));
});
