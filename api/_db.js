const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

function createStore(pool) {
  // Neon may close idle pooled connections; do not let an unhandled Pool error
  // terminate the process or dump a connection object into application logs.
  pool.on?.('error', () => console.warn('An idle database connection closed. The next request will reconnect.'));
  let ready;
  function bootstrap() {
    if (!ready) ready = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
        // Older account entries pre-date automatic numbering. Fill only blank
        // labels so existing custom admin labels remain untouched.
        const owned=(await client.query('SELECT id,account_id,label FROM entries WHERE account_id IS NOT NULL ORDER BY account_id,created_at,id')).rows;
        const numbers=new Map();
        for(const entry of owned){const number=(numbers.get(entry.account_id)||0)+1;numbers.set(entry.account_id,number);if(!entry.label)await client.query('UPDATE entries SET label=$1 WHERE id=$2',[String(number),entry.id]);}
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  async function load(client) {
    const settings = (await client.query('SELECT data FROM settings WHERE id=1')).rows[0].data;
    const entries = (await client.query('SELECT * FROM entries ORDER BY id')).rows.map(e => ({
      accountId:e.account_id||null, id:e.id, code:e.code, name:e.name, label:e.label, email:e.email, paid:e.paid, rolloverPayments:e.rollover_payments||{}, created:new Date(e.created_at).getTime()
    }));
    const rounds = (await client.query('SELECT * FROM rounds ORDER BY n')).rows.map(r => ({n:r.n,startWeek:r.start_week,endWeek:r.end_week,winnerIds:r.winner_ids}));
    const picks = {};
    for (const p of (await client.query('SELECT * FROM picks ORDER BY entry_id, week')).rows) (picks[p.entry_id] ||= {})[p.week] = p.team;
    const results = {};
    for (const r of (await client.query('SELECT * FROM results ORDER BY game_id')).rows) results[r.game_id] = {hs:r.hs,as:r.as_,final:r.final};
    return {settings,entries,picks,results,rounds};
  }
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function persist(client, before, after) {
    if (!same(before.settings,after.settings)) await client.query('UPDATE settings SET data=$1, updated_at=clock_timestamp() WHERE id=1', [JSON.stringify(after.settings)]);
    for (const e of before.entries) if (!after.entries.some(x=>x.id===e.id)) await client.query('DELETE FROM entries WHERE id=$1',[e.id]);
    for (const e of after.entries) {
      if (same(e,before.entries.find(x=>x.id===e.id))) continue;
      await client.query(`INSERT INTO entries(id,code,name,label,email,paid,created_at,rollover_payments,account_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,label=EXCLUDED.label,email=EXCLUDED.email,paid=EXCLUDED.paid,rollover_payments=EXCLUDED.rollover_payments,account_id=EXCLUDED.account_id`,
      [e.id,e.code,e.name,e.label,e.email,e.paid,new Date(e.created),JSON.stringify(e.rolloverPayments||{}),e.accountId||null]);
    }
    for (const r of before.rounds) if (!after.rounds.some(x=>x.n===r.n)) await client.query('DELETE FROM rounds WHERE n=$1',[r.n]);
    for (const r of after.rounds) if (!same(r,before.rounds.find(x=>x.n===r.n))) await client.query(`INSERT INTO rounds(n,start_week,end_week,winner_ids) VALUES($1,$2,$3,$4)
      ON CONFLICT(n) DO UPDATE SET start_week=EXCLUDED.start_week,end_week=EXCLUDED.end_week,winner_ids=EXCLUDED.winner_ids`,[r.n,r.startWeek,r.endWeek,r.winnerIds===null?null:JSON.stringify(r.winnerIds)]);
    for (const id of Object.keys(before.results)) if (!after.results[id]) await client.query('DELETE FROM results WHERE game_id=$1',[id]);
    for (const [id,r] of Object.entries(after.results)) if (!same(r,before.results[id])) await client.query(`INSERT INTO results(game_id,hs,as_,final) VALUES($1,$2,$3,$4)
      ON CONFLICT(game_id) DO UPDATE SET hs=EXCLUDED.hs,as_=EXCLUDED.as_,final=EXCLUDED.final,updated_at=clock_timestamp()`,[id,r.hs,r.as,r.final]);
    for (const [id,weeks] of Object.entries(before.picks)) for (const w of Object.keys(weeks)) if (!after.picks[id]?.[w]) await client.query('DELETE FROM picks WHERE entry_id=$1 AND week=$2',[id,+w]);
    for (const [id,weeks] of Object.entries(after.picks)) for (const [w,team] of Object.entries(weeks)) if (team!==before.picks[id]?.[w]) await client.query(`INSERT INTO picks(entry_id,week,team) VALUES($1,$2,$3)
      ON CONFLICT(entry_id,week) DO UPDATE SET team=EXCLUDED.team,made_at=clock_timestamp()`,[id,+w,team]);
  }
  async function transact(fn, write, audit) {
    await bootstrap();
    const client=await pool.connect();
    try {
      await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // Serialise all competition changes: validate against the latest committed picks,
      // paid flags and results, then persist within the same transaction.
      if (write) await client.query('SELECT id FROM settings WHERE id=1 FOR UPDATE');
      const state=await load(client), before=structuredClone(state);
      const result=await fn(state);
      if (write) await persist(client,before,state);
      if(audit) await client.query('INSERT INTO audit_log(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[require('node:crypto').randomUUID(),audit.actorId,audit.action,audit.targetId||null,JSON.stringify(audit.details||{})]);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return {read:()=>transact(s=>s,false),mutate:(fn,audit)=>transact(fn,true,audit),withClient:async fn=>{await bootstrap();const client=await pool.connect();try{return await fn(client);}finally{client.release();}}};
}
let store;
function getStore() {
  if (!store) {
    const connectionString=(process.env.DB_SCHEMA && (process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING)) || process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw Object.assign(new Error('Database is not configured.'),{status:503,code:'database_unavailable'});
    const url=new URL(connectionString);
    if (url.searchParams.get('sslmode')==='require') url.searchParams.set('sslmode','verify-full');
    const schema=process.env.DB_SCHEMA||'public';
    if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid database schema.');
    store=createStore(new Pool({...(process.env.DB_SCHEMA?{options:'-c search_path='+schema}:{}),connectionString:url.toString(),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000}));
  }
  return store;
}
module.exports={createStore,read:()=>getStore().read(),mutate:(fn,audit)=>getStore().mutate(fn,audit),withClient:fn=>getStore().withClient(fn)};
