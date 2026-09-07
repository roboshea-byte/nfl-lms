const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHandlers}=require('../lib/api');const {defaults,memoryStore,call,schedule,L}=require('./helpers');
const before=L.weekDeadline(1)-1;
function setup(state=defaults(),time=before){const db=memoryStore(state);let clock=time;return {db,handlers:createHandlers({db,now:()=>clock,adminKey:()=> 'test-admin'}),clock:t=>clock=t};}
const post=(handler,body,key)=>call(handler,{method:'POST',body,key});
const pick=(ctx,week,team,code='alice12345')=>post(ctx.handlers.pick,{code,week,team});
const first=L.gamesByWeek(1)[0];
test('ordered validation: unknown code, unpaid, bad week, eliminated, locked, bye, used',async()=>{
  const c=setup();assert.equal((await pick(c,0,'XYZ','wrong')).body.error,'unknown_code');
  await c.db.mutate(S=>{S.entries[0].paid=false;});assert.equal((await pick(c,0,'XYZ')).body.error,'unpaid');
  await c.db.mutate(S=>{S.entries[0].paid=true;});assert.equal((await pick(c,0,'XYZ')).body.error,'bad_week');
  assert.equal((await pick(c,2,L.gamesByWeek(2)[0].home)).body.error,'future_week');
  assert.equal((await pick(c,1,'XYZ')).body.error,'bye');
  const future=L.gamesByWeek(2)[0].home;await c.db.mutate(S=>S.picks.alice={2:future});assert.equal((await pick(c,1,future)).body.error,'used');
  await c.db.mutate(S=>{S.picks.alice={1:first.away};S.results[first.id]={hs:21,as:0,final:true};});
  assert.equal((await pick(c,2,future)).body.error,'eliminated');
  assert.equal((await c.db.read()).picks.alice[1],first.away);
  c.clock(L.weekFirstKickoff(1));assert.equal((await pick(c,1,first.home)).body.error,'locked');
});
test('before kick-off save, me privacy, public masking, server clock reveal without a DB write',async()=>{
  const c=setup();const saved=await pick(c,1,first.home);assert.equal(saved.status,200);assert.equal(saved.body.picks[1],first.home);
  const me=await call(c.handlers.me,{code:'alice12345'});assert.equal(me.body.picks[1],first.home);assert.equal(me.body.entry.email,undefined);assert.equal(me.body.entry.code,undefined);
  await c.db.mutate(S=>{S.entries.find(e=>e.id==='bob').paid=false;S.picks.bob={1:first.away};});
  const hidden=await call(c.handlers.state);assert.equal(hidden.body.picks.alice[1],'HIDDEN');assert.equal(hidden.body.entries[0].code,undefined);assert.equal(hidden.body.entries[0].email,undefined);assert.equal(hidden.body.entries.some(e=>e.id==='bob'),false);assert.equal(hidden.body.picks.bob,undefined);assert.equal(hidden.headers['Cache-Control'],'no-store');
  c.clock(new Date(first.date).getTime());const shown=await call(c.handlers.state);assert.equal(shown.body.picks.alice[1],first.home);assert.notEqual(shown.body.updatedAt,hidden.body.updatedAt);
  const admin=await call(c.handlers.state,{key:'test-admin'});assert.equal(admin.body.admin,true);assert.equal(admin.body.entries[0].code,'alice12345');assert.equal(admin.body.entries.some(e=>e.id==='bob'),true);
  assert.equal((await call(c.handlers.me,{code:'nope'})).status,404);
});
test('deadline boundaries: first pick, existing pick, target, change and clear',async()=>{
  const later=L.gamesByWeek(1).at(-1),c=setup();assert.equal((await pick(c,1,later.home)).status,200);
  c.clock(L.weekDeadline(1));assert.equal((await pick(c,1,first.home,'bob1234567')).body.error,'locked');
  assert.equal((await pick(c,1,first.home)).body.error,'locked');
  assert.equal((await pick(c,1,later.away)).body.error,'locked');
  c.clock(new Date(later.date).getTime());assert.equal((await pick(c,1,null)).body.error,'locked');
  const d=setup();await pick(d,1,later.home);assert.equal((await pick(d,1,null)).status,200);assert.equal((await d.db.read()).picks.alice[1],undefined);
});
test('real bye week and current round boundaries',async()=>{
  const week=Array.from({length:18},(_,i)=>i+1).find(w=>L.gamesByWeek(w).length<16);
  const bye=Object.keys(schedule.teams).find(t=>!L.teamGame(t,week)),S=defaults();S.settings.missedPick='survive';for(let w=1;w<week;w++)for(const g of L.gamesByWeek(w))S.results[g.id]={hs:24,as:10,final:true};const c=setup(S);assert.equal((await pick(c,week,bye)).body.error,'bye');
  await c.db.mutate(S=>S.rounds=[{n:1,startWeek:4,endWeek:8,winnerIds:null}]);assert.equal((await pick(c,3,first.home)).body.error,'bad_week');assert.equal((await pick(c,9,first.home)).body.error,'bad_week');
});
test('admin state preserves codes and independent player picks, deletes removed entries, rejects stale revision',async()=>{
  const c=setup();await pick(c,1,first.home);let state=(await call(c.handlers.state,{key:'test-admin'})).body;
  state.entries=state.entries.filter(e=>e.id!=='bob');state.entries.push({id:'dave',name:'Dave',label:'',email:'',paid:true,code:'injected'});
  const result=await post(c.handlers.adminState,{...state,baseRevision:state.revision},'test-admin');assert.equal(result.status,200);
  const dave=result.body.entries.find(e=>e.id==='dave');assert.match(dave.code,/^[A-Za-z0-9_-]{10}$/);assert.notEqual(dave.code,'injected');assert.equal(result.body.picks.alice[1],first.home);
  assert.equal((await post(c.handlers.adminState,{...state,baseRevision:state.revision},'test-admin')).body.error,'conflict');
  state=result.body;state.entries=state.entries.filter(e=>e.id!=='alice');const removed=await post(c.handlers.adminState,state,'test-admin');assert.equal(removed.body.picks.alice,undefined);
  assert.equal((await call(c.handlers.me,{code:'alice12345'})).status,404);
});
test('admin overrides and authentication, malformed inputs, serverTime on every response',async()=>{
  const c=setup(defaults(),Date.parse(first.date)+1000);
  assert.equal((await post(c.handlers.adminPick,{entryId:'alice',week:1,team:first.home})).status,401);
  assert.equal((await post(c.handlers.adminPick,{entryId:'alice',week:1,team:first.home},'test-admin')).status,200);
  assert.equal((await post(c.handlers.adminPick,{entryId:'alice',week:1,team:null},'test-admin')).status,200);
  for(const response of [await call(c.handlers.pick),await post(c.handlers.pick,'{'),await call(c.handlers.state,{key:'bad'}),await post(c.handlers.adminState,{},'test-admin')])assert.ok(response.body.serverTime);
  const S=defaults();S.entries[0].id="injection'";assert.equal((await post(c.handlers.adminState,S,'test-admin')).body.error,'bad_state');
});
test('restore replaces picks only when requested and result deletion is supported',async()=>{
  const c=setup();await pick(c,1,first.home);const S=await c.db.read();S.results[first.id]={hs:10,as:0,final:true};
  const response=await post(c.handlers.adminState,{...S,replacePicks:{alice:{2:L.gamesByWeek(2)[0].home}}},'test-admin');assert.equal(response.status,200);assert.equal(response.body.picks.alice[1],undefined);assert.ok(response.body.picks.alice[2]);
  const clear=await post(c.handlers.adminState,{...response.body,results:{}},'test-admin');assert.deepEqual(clear.body.results,{});
});
test('ESPN results are mapped by fixture, skip pre-game events, and visible publicly',async()=>{
  const db=memoryStore();let requested;
  const handlers=createHandlers({db,now:()=>before,adminKey:()=> 'test-admin',fetchImpl:async(url)=>{requested=url;return {ok:true,json:async()=>({events:[{id:first.id,status:{type:{state:'post',completed:true}},competitions:[{competitors:[{homeAway:'home',team:{abbreviation:first.home},score:'27'},{homeAway:'away',team:{abbreviation:first.away},score:'20'}]}]},{id:L.gamesByWeek(1)[1].id,status:{type:{state:'pre'}}}]})};}});
  const response=await post(handlers.fetchResults,{week:1},'test-admin');assert.equal(response.status,200);assert.equal(response.body.fetched.count,1);assert.ok(requested.endsWith('week=1&dates=2026'));assert.deepEqual((await call(handlers.state)).body.results[first.id],{hs:27,as:20,final:true});
});
test('a future-week request stays locked while the current pick saves',async()=>{const c=setup();const team=Object.keys(schedule.teams).find(t=>L.teamGame(t,1)&&L.teamGame(t,2));const responses=await Promise.all([pick(c,1,team),pick(c,2,team)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);assert.equal(responses.find(r=>r.status===400).body.error,'future_week');});
test('rollover permits old teams again, respects the next-week lock, and resets again later',async()=>{
 const S=defaults(),g1=L.gamesByWeek(1)[0],g2=L.gamesByWeek(2)[0];
 S.settings.wipeoutResetTeams=false; // Existing saved competitions must adopt the new rule.
 S.picks={alice:{1:g1.away},bob:{1:g1.home,2:g2.away},charlie:{1:g1.home,2:g2.away}};
 for(const g of L.gamesByWeek(1))S.results[g.id]={hs:24,as:10,final:true};
 const c=setup(S,L.weekDeadline(3)-1);
 assert.equal((await pick(c,3,g1.away)).body.error,'eliminated');
 await c.db.mutate(s=>{for(const g of L.gamesByWeek(2))s.results[g.id]={hs:24,as:10,final:true};});
 assert.equal((await pick(c,3,g1.away)).body.error,'unpaid');
 let repayment=await c.db.read();repayment.entries.forEach(e=>e.rolloverPayments={3:true});
 assert.equal((await post(c.handlers.adminState,repayment,'test-admin')).status,200);
 assert.equal((await pick(c,3,g1.away)).status,200);
 assert.equal((await pick(c,3,g1.home,'bob1234567')).status,200);
 assert.equal((await pick(c,4,g1.away)).body.error,'future_week');
 await c.db.mutate(s=>{for(const g of L.gamesByWeek(3))s.results[g.id]={hs:g.home===g1.away||g.home===g1.home?0:24,as:g.away===g1.away||g.away===g1.home?0:24,final:true};});
 assert.equal((await pick(c,4,g1.away)).body.error,'unpaid');
 repayment=await c.db.read();repayment.entries.find(e=>e.id==='alice').rolloverPayments[4]=true;
 assert.equal((await post(c.handlers.adminState,repayment,'test-admin')).status,200);
 assert.equal((await pick(c,4,g1.away)).status,200);
 const state=(await call(c.handlers.state)).body;assert.equal(state.settings.wipeoutResetTeams,true);
 const saved=await post(c.handlers.adminState,{...await c.db.read()},'test-admin');assert.equal(saved.status,200);assert.equal((await c.db.read()).settings.wipeoutResetTeams,true);
});
test('public content revisions remain stable across database key order',async()=>{
 const {statePayload,revision}=require('../lib/api');const a=defaults(),b=defaults();const [g1,g2]=L.gamesByWeek(1);const score={hs:10,as:0,final:true};a.results={[g1.id]:score,[g2.id]:score};b.results={[g2.id]:score,[g1.id]:score};assert.equal(revision(a),revision(b));assert.equal(statePayload(a,false,before).updatedAt,statePayload(b,false,before).updatedAt);
});
test('rollover payments require organiser authority, validate their shape and survive older client saves',async()=>{
 const c=setup(),state=await c.db.read();state.entries[0].rolloverPayments={2:true};
 assert.equal((await post(c.handlers.adminState,state)).status,401);
 assert.equal((await post(c.handlers.adminState,state,'test-admin')).status,200);
 const old=await c.db.read();delete old.entries[0].rolloverPayments;
 assert.equal((await post(c.handlers.adminState,old,'test-admin')).status,200);assert.deepEqual((await c.db.read()).entries[0].rolloverPayments,{2:true});
 for(const bad of [[],null,{'2':'yes'},{'19':true}]){state.entries[0].rolloverPayments=bad;assert.equal((await post(c.handlers.adminState,state,'test-admin')).body.error,'bad_state');}
 const me=await call(c.handlers.me,{code:'alice12345'});assert.deepEqual(me.body.entry.rolloverPayments,{2:true});assert.equal(me.body.entry.code,undefined);
});
test('admin announcements are validated, saved and included in public state',async()=>{
 const c=setup(),state=await c.db.read();state.settings.announcement='Pay Connor or Havo before Thursday.';state.settings.announcementEnabled=true;state.settings.announcementType='payment';
 const saved=await post(c.handlers.adminState,state,'test-admin');assert.equal(saved.status,200);assert.equal(saved.body.settings.announcementType,'payment');
 const publicState=await call(c.handlers.state);assert.equal(publicState.body.settings.announcement,'Pay Connor or Havo before Thursday.');assert.equal(publicState.body.settings.announcementEnabled,true);
 state.settings.announcementType='unsafe';assert.equal((await post(c.handlers.adminState,state,'test-admin')).body.error,'bad_state');
 state.settings.announcementType='update';state.settings.announcement='x'.repeat(1001);assert.equal((await post(c.handlers.adminState,state,'test-admin')).body.error,'bad_state');
});
test('saving deciding results starts a six-hour review window, then the next visit opens the round',async()=>{
 const S=defaults(),g=L.gamesByWeek(1)[0];S.picks={alice:{1:g.home},bob:{1:g.away},charlie:{1:g.away}};
 for(const game of L.gamesByWeek(1))S.results[game.id]={hs:24,as:10,final:true};
 const completedAt=Date.parse('2026-09-14T04:30:00Z'),c=setup(defaults(),completedAt),beforeState=(await call(c.handlers.state,{key:'test-admin'})).body;
 const saved=await post(c.handlers.adminState,{...S,replacePicks:S.picks,baseRevision:beforeState.revision},'test-admin');assert.equal(saved.status,200);
 assert.equal(saved.body.rounds.length,1);assert.deepEqual(saved.body.rounds[0],{n:1,startWeek:1,endWeek:1,winnerIds:['alice'],completedAt:'2026-09-14T04:30:00.000Z'});
 c.clock(completedAt+L.ROUND_ADVANCE_DELAY-1);assert.equal((await call(c.handlers.state,{key:'test-admin'})).body.rounds.length,1);
 c.clock(completedAt+L.ROUND_ADVANCE_DELAY);const advanced=await call(c.handlers.state,{key:'test-admin'});assert.equal(advanced.body.rounds.length,2);assert.deepEqual(advanced.body.rounds[1],{n:2,startWeek:2,endWeek:null,winnerIds:null});
 const stored=await c.db.read();assert.equal(L.computeRound(stored,stored.rounds[0]).complete,true);assert.equal(L.entriesForRound(stored,stored.rounds[0]).length,3);assert.equal(L.entriesForRound(stored,stored.rounds[1]).length,0);
});
