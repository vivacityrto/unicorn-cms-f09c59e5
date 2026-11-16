/** Local ephemeral PostgreSQL (PGlite) only. Never connects to hosted Supabase.
 * npm install --prefix /tmp/planning-db-qa @electric-sql/pglite
 * PGLITE_MODULE_URL=file:///tmp/planning-db-qa/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-anonymous-planning-db.mjs
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE_URL ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await readFile(new URL('../supabase/migrations/20261116013601_anonymous_planning_surveys.sql', import.meta.url), 'utf8'));
  const id='c9cdfa38-4c2e-48c9-91a5-05720dd332fe';
  const receipt='9d4c20e4-0265-4cd1-b4ba-7f6fd3b6517c';
  const answers={strengths:'Synthetic',weaknesses:'',opportunities:'',threats:'',start:'',stop:'',keep:'',priority:''};
  await db.query(`insert into public.eos_planning_campaigns (id,business,year,questionnaire_version,state,opens_at,closes_at,key_hash,collection_approved,max_responses)
    values ($1,'vivacity',2027,'2027-strategy-v1','open',now()-interval '1 day',now()+interval '1 day',$2,true,2)`,[id,'a'.repeat(64)]);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(()=>db.query('select * from public.eos_planning_responses'));
    await assert.rejects(()=>db.query('select public.accept_anonymous_planning_response($1,$2,$3,$4,$5)',[id,'a'.repeat(64),'2027-strategy-v1',receipt,answers]));
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const accept=async(a=answers,k=receipt,h='a'.repeat(64))=>(await db.query('select public.accept_anonymous_planning_response($1,$2,$3,$4,$5) as accepted',[id,h,'2027-strategy-v1',k,a])).rows[0].accepted;
  assert.equal(await accept(),true);
  assert.equal(await accept(),true);
  assert.equal((await db.query('select count(*)::int as n from public.eos_planning_responses')).rows[0].n,1);
  assert.equal(await accept({...answers,strengths:'Changed'}),false);
  assert.equal(await accept({...answers,email:'CANARY'},'0c5bf274-1793-41c2-a68c-d10f83620475'),false);
  assert.equal(await accept(answers,'0c5bf274-1793-41c2-a68c-d10f83620475','b'.repeat(64)),false);
  assert.equal(await accept(answers,'0c5bf274-1793-41c2-a68c-d10f83620475'),true);
  assert.equal(await accept(answers,'d3e72f3d-5858-4ae8-b44b-5fba0bc1552c'),false);
  await assert.rejects(()=>db.query('delete from public.eos_planning_responses'));
  await db.exec('reset role');
  await db.query(`update public.eos_planning_campaigns set state='closed' where id=$1`,[id]);
  await db.exec('set role service_role');assert.equal(await accept(),true);assert.equal(await accept(answers,'d3e72f3d-5858-4ae8-b44b-5fba0bc1552c'),false);await db.exec('reset role');
  const cols=(await db.query("select column_name from information_schema.columns where table_name='eos_planning_responses' order by ordinal_position")).rows.map(r=>r.column_name);
  assert.deepEqual(cols,['id','campaign_id','idempotency_key','questionnaire_version','answers']);
  assert.equal((await db.query('select count(*)::int as n from public.eos_planning_responses')).rows[0].n,2);
  console.log('PASS: local SQL migration, role denial, accepted/idempotent/conflicting submissions, key/cap/closed gates, identity-free columns. Not hosted RLS, concurrency stress or infrastructure anonymity evidence.');
} finally { await db.close(); }
