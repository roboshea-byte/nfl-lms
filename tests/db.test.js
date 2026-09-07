const {test}=require('node:test');const assert=require('node:assert/strict');const {newDb,DataType}=require('pg-mem');const {createStore}=require('../api/_db');const {createHandlers}=require('../lib/api');const {defaults,call,L}=require('./helpers');
test('Postgres schema, bootstrap, upserts, deletion cascade and read-back through API handlers',async()=>{
 const mem=newDb();mem.public.registerFunction({name:'clock_timestamp',returns:DataType.timestamptz,implementation:()=>new Date(),impure:true});const {Pool}=mem.adapters.createPg();const pool=new Pool();const db=createStore(pool);const handlers=createHandlers({db,now:()=>L.weekDeadline(1)-10000,adminKey:()=> 'test-admin'});
 const first=await db.read();assert.equal(first.rounds[0].n,1);assert.equal(first.settings.fee,20);assert.deepEqual((await db.read()).entries,[]);
 let response=await call(handlers.adminState,{method:'POST',key:'test-admin',body:defaults()});assert.equal(response.status,200,JSON.stringify(response.body));
 const alice=response.body.entries.find(e=>e.id==='alice');const g=L.gamesByWeek(1)[0];response=await call(handlers.pick,{method:'POST',body:{code:alice.code,week:1,team:g.home}});assert.equal(response.status,200,JSON.stringify(response.body));
 const read=await db.read();assert.equal(read.picks.alice[1],g.home);assert.equal(read.entries.find(e=>e.id==='alice').code,alice.code);
 read.entries.find(e=>e.id==='alice').rolloverPayments={2:true,5:false};
 read.settings.announcement='Week 1 deadline changed.';read.settings.announcementEnabled=true;read.settings.announcementType='deadline';
 response=await call(handlers.adminState,{method:'POST',key:'test-admin',body:read});assert.equal(response.status,200);
 assert.deepEqual((await db.read()).entries.find(e=>e.id==='alice').rolloverPayments,{2:true,5:false});
 assert.equal((await db.read()).settings.announcementType,'deadline');
 await db.mutate(S=>{const g=L.gamesByWeek(1)[0];S.results[g.id]={hs:27,as:20,final:true,finalisedAt:'2026-09-15T04:30:00.000Z'};});assert.equal((await db.read()).results[L.gamesByWeek(1)[0].id].finalisedAt,'2026-09-15T04:30:00.000Z');
 await db.mutate(S=>{S.rounds[0].completedAt='2026-09-14T04:30:00.000Z';});assert.equal((await db.read()).rounds[0].completedAt,'2026-09-14T04:30:00.000Z');
 response=await call(handlers.adminState,{method:'POST',key:'test-admin',body:{...read,entries:read.entries.filter(e=>e.id!=='alice')}});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await db.read()).picks.alice,undefined);
 await pool.end();
});

test('idle pool disconnection does not crash or disclose connection details',()=>{
 const {EventEmitter}=require('node:events');const pool=new EventEmitter();createStore(pool);
 const original=console.warn;const logs=[];console.warn=message=>logs.push(message);
 try{assert.doesNotThrow(()=>pool.emit('error',Object.assign(new Error('private-connection-detail'),{client:{password:'private-password'}})));}finally{console.warn=original;}
 assert.equal(logs.length,1);assert.ok(!logs.join('').includes('private-'));
});
