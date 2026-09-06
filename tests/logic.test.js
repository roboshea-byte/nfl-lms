const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const crypto=require('node:crypto');const contract=require('./fixtures/original-contract.json');const hash=s=>crypto.createHash('sha256').update(s).digest('hex');const {defaults,schedule,L}=require('./helpers');
function settle(S,w){for(const g of L.gamesByWeek(w))S.results[g.id]={hs:24,as:10,final:true};}
test('rules function and schedule are identical to the original repository',()=>{
 assert.equal(hash(JSON.stringify(schedule)),contract.scheduleHash);
 const extracted=fs.readFileSync('lib/logic.js','utf8');assert.equal(hash(extracted.slice(0,extracted.indexOf('if(typeof module'))),contract.rulesHash);
});
test('wipeout restores earlier eliminated entries, used-team setting retained',()=>{
 const S=defaults(),g1=L.gamesByWeek(1)[0],g2=L.gamesByWeek(2)[0];S.picks={alice:{1:g1.away},bob:{1:g1.home,2:g2.away},charlie:{1:g1.home,2:g2.away}};
 settle(S,1);let comp=L.computeRound(S);assert.equal(comp.alive.has('alice'),false);
 settle(S,2);comp=L.computeRound(S);assert.equal(comp.alive.size,3);assert.ok(comp.events.some(e=>e.type==='wipeout'&&e.week===2));assert.equal(L.usedTeams(S,'bob',S.rounds[0],comp,3)[g1.home],1);
 S.settings.wipeoutResetTeams=true;comp=L.computeRound(S);assert.deepEqual(L.usedTeams(S,'bob',S.rounds[0],comp,3),{});
});
test('a loss eliminates immediately; no picks wait for week settlement; winner only after settlement',()=>{
 const S=defaults(),g=L.gamesByWeek(1)[0];S.picks={alice:{1:g.home},bob:{1:g.away}};S.results[g.id]={hs:21,as:10,final:true};let c=L.computeRound(S);assert.equal(c.alive.has('bob'),false);assert.equal(c.alive.has('charlie'),true);assert.equal(c.complete,false);
 settle(S,1);c=L.computeRound(S);assert.deepEqual(c.winnerIds,['alice']);assert.equal(c.complete,true);
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
