import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('staff history index preserves exact ordered results and narrows the actual Staff read',async context=>{
 if(!process.env.ORBIT_PGLITE_MODULE){context.skip('Isolated PostgreSQL engine required');return;}
 const {PGlite}=await import(process.env.ORBIT_PGLITE_MODULE);const db=new PGlite();
 try{
  await db.exec(`create table timeline_events(id integer primary key,staff_id integer,occurred_at timestamptz,human_message text);insert into timeline_events select n,case when n%5=0 then 1 else null end,'2026-11-11'::timestamptz-n*interval '1 minute','QA' from generate_series(1,7100) n;create index timeline_old_time_idx on timeline_events(occurred_at desc,id desc);analyze timeline_events;`);
  const sql='select id,staff_id,occurred_at from timeline_events where staff_id is not null order by occurred_at desc limit 500';
  const before=(await db.query(sql)).rows;
  await db.exec(readFileSync('supabase/migrations/20261111092452_staff_history_read_index.sql','utf8'));
  const after=(await db.query(sql)).rows;assert.deepEqual(after,before);
  const plan=JSON.stringify((await db.query('explain (analyze,format json) '+sql)).rows);assert.match(plan,/timeline_staff_recent_history_idx/);assert.doesNotMatch(plan,/Rows Removed by Filter/);
  const count=(await db.query('select count(*)::int n from timeline_events')).rows[0].n;assert.equal(count,7100);
 }finally{await db.close();}
});
