const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const crypto=require('node:crypto');const contract=require('./fixtures/original-contract.json');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');const {defaults,schedule,L}=require('./helpers');
function settle(S,w){for(const g of L.gamesByWeek(w))S.results[g.id]={hs:24,as:10,final:true};}
test('schedule is identical to the original repository',()=>{
 assert.equal(hash(JSON.stringify(schedule)),contract.scheduleHash);
});
test('rollover restores every repaid entry and all teams even with an older saved setting',()=>{
 const S=defaults(),g1=L.gamesByWeek(1)[0],g2=L.gamesByWeek(2)[0];S.picks={alice:{1:g1.away},bob:{1:g1.home,2:g2.away},charlie:{1:g1.home,2:g2.away}};
 S.settings.wipeoutResetTeams=false;
 S.entries.forEach(e=>e.rolloverPayments={3:true});
 const history=structuredClone(S.picks);
 settle(S,1);let comp=L.computeRound(S);assert.equal(comp.alive.has('alice'),false);
 assert.equal(L.usedTeams(S,'bob',S.rounds[0],comp,2)[g1.home],1);
 settle(S,2);comp=L.computeRound(S);assert.equal(comp.alive.size,3);assert.ok(comp.events.some(e=>e.type==='wipeout'&&e.week===2));
 for(const e of S.entries){assert.equal(L.isAliveForWeek(S,comp,3,e.id),true);assert.deepEqual(L.usedTeams(S,e.id,S.rounds[0],comp,3),{});}
 assert.equal(comp.resetWeek,3);assert.deepEqual(S.picks,history);
 S.picks.bob[3]=g1.home;assert.equal(L.usedTeams(S,'bob',S.rounds[0],comp,4)[g1.home],3);
});
test('a loss eliminates immediately; no picks wait for week settlement; winner only after settlement',()=>{
 const S=defaults(),g=L.gamesByWeek(1)[0];S.picks={alice:{1:g.home},bob:{1:g.away}};S.results[g.id]={hs:21,as:10,final:true};let c=L.computeRound(S);assert.equal(c.alive.has('bob'),false);assert.equal(c.alive.has('charlie'),true);assert.equal(c.complete,false);
 settle(S,1);c=L.computeRound(S);assert.deepEqual(c.winnerIds,['alice']);assert.equal(c.complete,true);
});
test('rollover excludes unpaid players, retains prior fees and cannot award an immediate winner',()=>{
 const S=defaults(),g1=L.gamesByWeek(1)[0];S.picks=Object.fromEntries(S.entries.map(e=>[e.id,{1:g1.away}]));
 settle(S,1);let comp=L.computeRound(S);assert.equal(comp.alive.size,0);assert.equal(comp.complete,false);assert.equal(comp.events.filter(e=>e.type==='wipeout').length,1);assert.equal(L.prizePot(S,S.rounds[0],comp),60);
 assert.ok(comp.events.some(e=>e.id==='alice'&&e.payment&&e.reason==='Rollover fee not paid'));
 S.entries[0].rolloverPayments={2:true};comp=L.computeRound(S);assert.deepEqual([...comp.alive],['alice']);assert.equal(comp.complete,false);assert.equal(L.prizePot(S,S.rounds[0],comp),80);
 assert.equal(L.isPaid(S.entries[0],S.rounds[0],comp,1),true);assert.equal(L.isPaid(S.entries[1],S.rounds[0],comp,2),false);
 // An unpaid player cannot survive via a preselected winner or the missed-pick setting.
 S.settings.missedPick='survive';const g2=L.gamesByWeek(2)[0];S.picks.bob[2]=g2.home;S.picks.alice[2]=g2.home;settle(S,2);comp=L.computeRound(S);assert.deepEqual(comp.winnerIds,['alice']);
 // Correcting the score removes the rollover and its fees from the computed pot.
 S.results[g1.id]={hs:0,as:24,final:true};comp=L.computeRound(S);assert.equal(comp.events.some(e=>e.type==='wipeout'),false);assert.equal(L.prizePot(S,S.rounds[0],comp),60);
});
test('tie settings, season split, and new round reset',()=>{
 const S=defaults(),g=L.gamesByWeek(1)[0];S.picks={alice:{1:g.home},bob:{1:g.away}};S.results[g.id]={hs:10,as:10,final:true};assert.equal(L.computeRound(S).alive.has('alice'),false);S.settings.tieRule='survive';assert.equal(L.computeRound(S).alive.has('alice'),true);
 S.settings.missedPick='survive';for(let w=1;w<=18;w++)settle(S,w);S.picks={};assert.equal(L.computeRound(S).winnerIds.length,3);
 S.rounds.push({n:2,startWeek:2,endWeek:null,winnerIds:null});S.results={};S.picks={alice:{1:g.home}};assert.deepEqual(L.usedTeams(S,'alice',S.rounds[1],L.computeRound(S),2),{});
});
test('original stylesheet retained verbatim; committed HTML has inline shared sources',()=>{
 const current=fs.readFileSync('index.html','utf8');const css=current.match(/<style>([\s\S]*?)<\/style>/)[1].slice(0,contract.styleLength);assert.equal(hash(css),contract.styleHash);
 assert.ok(current.includes(fs.readFileSync('lib/logic.js','utf8').trim()));
 const data=current.match(/const SCHEDULE = (.*);/)[1];assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext('('+data+')'))),schedule);
});
