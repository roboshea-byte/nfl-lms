const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandlers}=require('../lib/api');
const {createLMSLogic}=require('../lib/logic');
const {defaults,memoryStore,call,schedule,L}=require('./helpers');
const opensAt=Date.parse('2026-10-04T16:24:00Z'),closesAt=Date.parse('2026-10-04T17:00:00Z');
function fixture(){const S=defaults();S.rounds[0].startWeek=4;return S;}
test('the authorised exception is scoped to Round 1 Week 4 and the exact UK deadline',()=>{
  const S=fixture(),ordinary=L.weekFirstKickoff(4)-3600000;
  assert.equal(L.weekDeadline(4,S,opensAt-1),ordinary);
  assert.equal(L.weekDeadline(4,S,opensAt),closesAt);
  assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(closesAt),'18:00');
  assert.equal(L.weekDeadline(5,S,opensAt),L.weekFirstKickoff(5)-3600000);
  S.rounds.push({n:2,startWeek:4,endWeek:null,winnerIds:null});
  assert.equal(L.weekDeadline(4,S,opensAt),ordinary);
});
test('member submissions, changes and clears close at precisely 6pm without a background job',async()=>{
  const db=memoryStore(fixture());let now=closesAt-1;
  const handlers=createHandlers({db,now:()=>now});
  const game=L.gamesByWeek(4).find(g=>Date.parse(g.date)>=closesAt);
  const pick=team=>call(handlers.pick,{method:'POST',body:{code:'alice12345',week:4,team}});
  assert.equal((await pick(game.home)).status,200);
  const before=await call(handlers.state);assert.equal(before.body.pickWindow.open,true);
  now=closesAt;
  for(const team of [game.home,game.away,null])assert.equal((await pick(team)).body.error,'locked');
  const after=await call(handlers.state);assert.equal(after.body.pickWindow.open,false);
  assert.notEqual(before.body.updatedAt,after.body.updatedAt);
  assert.equal((await db.read()).picks.alice[4],game.home);
  now=closesAt+60000;assert.equal((await pick(game.away)).body.error,'locked');
});
test('the late window rejects started teams and changes to an already-started pick',async()=>{
  const S=fixture(),first=L.gamesByWeek(4)[0],future=L.gamesByWeek(4).find(g=>Date.parse(g.date)>=closesAt);
  S.picks.bob={4:first.home};
  const db=memoryStore(S),handlers=createHandlers({db,now:()=>opensAt+1000});
  const pick=(code,team)=>call(handlers.pick,{method:'POST',body:{code,week:4,team}});
  assert.equal((await pick('alice12345',first.away)).body.error,'started');
  assert.equal((await pick('bob1234567',future.home)).body.error,'started');
  assert.equal((await pick('bob1234567',null)).body.error,'started');
  assert.equal((await pick('alice12345',future.home)).status,200);
});
test('browser deadline calculation uses the same competition state and authoritative clock',()=>{
  const S=fixture();let now=closesAt-1;
  const browser=createLMSLogic(schedule,()=>S,()=>now);
  assert.equal(browser.weekDeadline(4),closesAt);assert.ok(browser.weekDeadline(4)>now);
  now=closesAt;assert.ok(browser.weekDeadline(4)<=now);
});
