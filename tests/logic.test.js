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
 S.rounds.push({n:2,startWeek:2,endWeek:null,winnerIds:null});S.results={};S.picks={alice:{1:g.home}};assert.equal(L.computeRound(S).alive.size,0);S.entries.push({id:'round2',name:'Round Two',paid:true,round:2,rolloverPayments:{}});assert.deepEqual([...L.computeRound(S).alive],['round2']);assert.deepEqual(L.usedTeams(S,'alice',S.rounds[1],L.computeRound(S),2),{});
});
test('a completed round starts the next round automatically and preserves its archive',()=>{
 const S=defaults(),g=L.gamesByWeek(1)[0];S.picks={alice:{1:g.home},bob:{1:g.away},charlie:{1:g.away}};settle(S,1);
 const finished=L.computeRound(S);assert.equal(finished.complete,true);assert.deepEqual(finished.winnerIds,['alice']);
 const completed=Date.parse('2026-09-14T04:30:00Z'),pending=L.advanceRound(S,completed);assert.equal(pending.pending,true);assert.equal(pending.newRound,null);assert.equal(pending.advanceAt,completed+6*60*60*1000);assert.equal(S.rounds.length,1);
 assert.equal(L.advanceRound(S,pending.advanceAt-1).newRound,null);const transition=L.advanceRound(S,pending.advanceAt);assert.equal(transition.completedRound.n,1);assert.equal(transition.newRound.n,2);assert.equal(transition.newRound.startWeek,2);
 assert.deepEqual(S.rounds[0],{n:1,startWeek:1,endWeek:1,winnerIds:['alice'],completedAt:'2026-09-14T04:30:00.000Z'});assert.equal(S.rounds.length,2);assert.equal(L.currentRound(S).n,2);assert.equal(L.entriesForRound(S,S.rounds[0]).length,3);assert.equal(L.entriesForRound(S,S.rounds[1]).length,0);
 assert.equal(L.computeRound(S,S.rounds[0]).complete,true);assert.equal(L.advanceRound(S),null);assert.equal(S.rounds.length,2);
});
test('an admin can start within the review window without disabling later automatic starts',()=>{
 const S=defaults(),g1=L.gamesByWeek(1)[0],firstTime=Date.parse('2026-09-14T04:30:00Z');S.picks={alice:{1:g1.home},bob:{1:g1.away},charlie:{1:g1.away}};settle(S,1);
 assert.equal(L.advanceRound(S,firstTime).pending,true);assert.equal(L.advanceRound(S,firstTime+1000,true).newRound.n,2);
 const g2=L.gamesByWeek(2)[0];S.entries.push({id:'dave',name:'Dave',paid:true,round:2},{id:'erin',name:'Erin',paid:true,round:2});S.picks.dave={2:g2.home};S.picks.erin={2:g2.away};settle(S,2);
 const secondTime=firstTime+2*60*60*1000,pending=L.advanceRound(S,secondTime);assert.equal(pending.pending,true);assert.equal(S.rounds.length,2);assert.equal(L.advanceRound(S,pending.advanceAt-1).newRound,null);assert.equal(L.advanceRound(S,pending.advanceAt).newRound.n,3);
});
test('future weeks open six hours after every earlier week is finalised',()=>{
 const S=defaults(),r=L.currentRound(S),firstFinal=Date.parse('2026-09-15T04:30:00Z');assert.equal(L.previousWeeksFinalised(S,r,1,firstFinal),true);assert.equal(L.previousWeeksFinalised(S,r,2,firstFinal),false);
 settle(S,1);L.syncResultFinalisedAt(S,firstFinal);assert.equal(L.defaultWeek(S,firstFinal),1);assert.equal(L.previousWeeksFinalised(S,r,2,firstFinal+L.WEEK_ADVANCE_DELAY-1),false);assert.equal(L.previousWeeksFinalised(S,r,2,firstFinal+L.WEEK_ADVANCE_DELAY),true);assert.equal(L.defaultWeek(S,firstFinal+L.WEEK_ADVANCE_DELAY),2);
 settle(S,2);const secondFinal=firstFinal+7*24*60*60*1000;L.syncResultFinalisedAt(S,secondFinal);assert.equal(L.previousWeeksFinalised(S,r,3,secondFinal+L.WEEK_ADVANCE_DELAY-1),false);assert.equal(L.previousWeeksFinalised(S,r,3,secondFinal+L.WEEK_ADVANCE_DELAY),true);
 S.results[L.gamesByWeek(2)[0].id].final=false;L.syncResultFinalisedAt(S,secondFinal+1);assert.equal(S.results[L.gamesByWeek(2)[0].id].finalisedAt,undefined);assert.equal(L.previousWeeksFinalised(S,r,3,secondFinal+L.WEEK_ADVANCE_DELAY),false);
});
test('original stylesheet retained except removed body zoom; committed HTML has inline shared sources',()=>{
 const current=fs.readFileSync('index.html','utf8');const stylesheet=current.match(/<style>([\s\S]*?)<\/style>/)[1];assert.ok(!/\bzoom\s*:/.test(stylesheet));const css=stylesheet.replace('body{background:', 'body{zoom:1.2;background:').slice(0,contract.styleLength);assert.equal(hash(css),contract.styleHash);
 assert.ok(current.includes(fs.readFileSync('lib/logic.js','utf8').trim()));
 const data=current.match(/const SCHEDULE = (.*);/)[1];assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext('('+data+')'))),schedule);
});
test('home-screen install metadata and icon files are complete',()=>{
 const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));assert.equal(manifest.short_name,'NFL LMS');assert.equal(manifest.start_url,'/dashboard');assert.equal(manifest.display,'standalone');
 const current=fs.readFileSync('index.html','utf8');assert.match(current,/rel="manifest" href="\/manifest\.webmanifest"/);assert.match(current,/apple-mobile-web-app-title" content="NFL LMS"/);
 for(const [name,size] of [['app-icon-192.png',192],['app-icon-512.png',512],['apple-touch-icon.png',180],['favicon-32.png',32]]){const png=fs.readFileSync('assets/'+name);assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const share=fs.readFileSync('assets/share/nfl-lms-whatsapp-get-started.png');assert.equal(share.toString('ascii',1,4),'PNG');assert.equal(share.readUInt32BE(16),1080);assert.equal(share.readUInt32BE(20),1350);assert.match(fs.readFileSync('scripts/build.js','utf8'),/nfl-lms-whatsapp-get-started\.png/);
});
test('mobile navigation, refresh, help, privacy and announcements stay wired',()=>{
 const current=fs.readFileSync('index.html','utf8');
  assert.match(current,/main\{max-width:1650px\}\s*body\.player main\{max-width:1650px\}/);assert.doesNotMatch(current,/body\.player main\{max-width:1125px\}/);
 assert.match(current,/body\.player nav\{display:grid\}/);assert.match(current,/id="refreshApp"/);assert.match(current,/function refreshApp\(/);
 assert.match(current,/<a class="brand" id="homeBrand" href="\/"/);assert.match(current,/\.refresh-app\{position:absolute/);assert.doesNotMatch(current,/\.refresh-app\{position:fixed/);
  assert.match(current,/How to use NFL LMS/);assert.match(current,/Admin how-to guide/);assert.match(current,/Connor or Havo/);assert.match(current,/function filterHelp\(/);
  assert.match(current,/function renderPrivacyPage\(/);assert.match(current,/function announcementBanner\(featured=false,preview=false\)/);assert.match(current,/Member announcement/);
  assert.match(current,/announcement-editor-grid/);assert.match(current,/id="announcementMessage"/);assert.match(current,/function updateAnnouncementDraft\(/);assert.match(current,/Dashboard preview/);assert.match(current,/announcement-editor-status \$\{s\.announcementEnabled\?'live':'off'\}/);
  assert.match(current,/deadline:'General update'/);assert.doesNotMatch(current,/deadline:'Deadline update'/);assert.match(current,/\.announcement\{--notice:var\(--gold\)/);assert.match(current,/\.announcement\.deadline\{--notice:#78c8ff/);assert.match(current,/announcement-type-option \$\{value\}/);
  assert.match(current,/announcementBanner\(true\)\+renderDashboard/);assert.match(current,/announcement\.featured/);assert.match(current,/Show on member pages/);
  assert.match(current,/function roundArchiveBar\(/);assert.match(current,/Round archive/);assert.match(current,/Previous rounds/);assert.match(current,/advanceRoundAfterResults/);assert.match(current,/Rounds advance automatically after six hours/);assert.match(current,/function forceStartNextRound\(/);assert.match(current,/Start Round \$\{r\.n\+1\} now/);assert.match(current,/six-hour review window/);
  assert.match(current,/competition-setting-grid/);assert.match(current,/competition-setting full/);
  assert.match(current,/location\.pathname==='\/'\|\|accountPage==='\/dashboard'/);
  assert.match(current,/function renderDashboard\(r,comp,afterHero=''\)\{return renderHome\(r,comp,afterHero\);\}/);
  assert.match(current,/function renderAccountPage\(/);assert.doesNotMatch(current,/dash:\(\)=>memberTools\(\)\+deadlineBanner/);
  const header=current.match(/function renderHeader\(r,comp\)\{[\s\S]*?\n\}/)[0];assert.match(header,/>Round<\/div>/);assert.match(header,/>Week<\/div>/);assert.match(header,/>Entries<\/div>/);assert.match(header,/>Still In<\/div>/);assert.doesNotMatch(header,/>Prize Pot<\/div>|>Paid<\/div>|>Unpaid<\/div>|>Still to pick<\/div>/);
  assert.match(current,/href="\/login"><div class="v" style="font-size:18px">Sign in/);assert.match(current,/Round entries<\/div>/);assert.match(current,/Current pot<\/div>/);assert.match(current,/Picked<\/div>/);assert.match(current,/Still to pick<\/div>/);assert.match(current,/class="btn admin-exit" href="\/dashboard">Exit admin/);
  assert.match(current,/Exit account settings':'Account settings'/);assert.match(current,/location\.href=reset\?'\/login':data\.user&&\['owner','admin'\]\.includes\(data\.user\.role\)\?'\/admin':'\/dashboard'/);assert.match(current,/location\.pathname==='\/'&&isStaffAccount\(\)/);assert.match(current,/homeBrand'\)\.href=isStaffAccount\(\)\?'\/admin'/);
  const standings=current.match(/function renderStandings\(r,comp\)\{[\s\S]*?\/\* ---- Picks ---- \*\//)[0];assert.doesNotMatch(standings,/Awaiting payment|paid, .* unpaid/);
  assert.match(current,/accountUser\?\.name/);assert.match(current,/Add another entry/);assert.match(current,/Choose an entry/);assert.match(current,/must be approved and marked paid/);
  assert.match(current,/function memberWeekStatus\(r,comp\)/);assert.match(current,/Week \$\{week\}/);assert.match(current,/Sitting Out/);assert.match(current,/Not Paid/);assert.match(current,/member-week-status\.paid/);assert.match(current,/member-week-status\.unpaid/);assert.match(current,/member-week-status\.sitting/);
  assert.match(current,/function choosePlayerWeek\(w\).*previousWeeksFinalised/);assert.match(current,/Future weeks open six hours after the previous week has been finalised/);assert.match(current,/\.tcard\.used\{opacity:\.55;background:rgba\(111,24,42,\.5\)/);
  assert.match(current,/\.bigpot:before\{content:none\}/);assert.doesNotMatch(current,/Picks and history/);
  assert.match(current,/Rob O’Shea 1/);assert.match(current,/function entryName\(id\)/);assert.match(current,/accountPage==='\/account'\)return renderAccountPage/);
  assert.match(current,/New player\?/);assert.match(current,/Register before you sign in/);assert.match(current,/Register and create account/);assert.match(current,/href="\/signup"/);
  assert.match(current,/function saveMemberName\(/);assert.match(current,/hidden member ID/);assert.match(current,/Last name required/);assert.match(current,/accountUser\?\.role==='owner'/);assert.match(current,/spreadsheet importer is kept in the owner area/);
  assert.match(current,/View as member/);assert.match(current,/Exit \$\{admin\?'admin':'member'\} view/);assert.match(current,/function viewAsMember\(/);assert.match(current,/id="impersonationBar"/);assert.match(current,/accountImpersonation/);
  assert.match(current,/View as \$\{u\.role==='admin'\?'admin':'member'\}/);assert.match(current,/data\.viewingAs\?\.role==='admin'\?'\/admin':'\/dashboard'/);assert.match(current,/class="btn sm role-save"/);assert.match(current,/function saveMemberRole\(/);assert.match(current,/visibleAdminSections\(\)/);assert.match(current,/view!=='settings'/);assert.match(current,/accountUser\?\.role==='admin'&&S\.ui\.view==='settings'/);
  assert.match(current,/function staffAccountTools\(/);assert.match(current,/Your owner and admin tools/);assert.match(current,/Open owner admin area/);assert.match(current,/Open admin area/);
  assert.match(current,/View weekly picks list/);assert.match(current,/function renderWeeklyPicksPage\(/);assert.match(current,/function surnameSort\(/);assert.match(current,/Export CSV/);assert.match(current,/Share \/ export PNG/);assert.match(current,/navigator\.share/);assert.match(current,/Hidden until kick-off/);
  assert.match(current,/Select a team to see recent form and general team info\./);assert.match(current,/function openTeamInfo\(/);assert.match(current,/Recent competitive form/);assert.match(current,/Current skill-position roster/);assert.match(current,/Availability watch/);assert.match(current,/Latest injuries/);
  assert.match(current,/function noEntryBanner\(/);assert.match(current,/Join this round/);assert.match(current,/dashboard-utilities/);assert.match(current,/admin-link/);assert.match(current,/Add an entry/);assert.match(current,/not participating/);assert.doesNotMatch(current,/if\(!accountEntries\.length\).*return true/);
  assert.match(current,/Admin pick override/);assert.match(current,/function confirmAdminPick\(/);assert.match(current,/Save admin pick/);assert.match(current,/managed=ADMIN\?entries/);assert.match(current,/What if I cannot sign in before the deadline\?/);assert.match(fs.readFileSync('lib/api.js','utf8'),/deadlineOverridden/);
  assert.match(current,/Mark paid/);assert.match(current,/>Paid<\/span>/);assert.doesNotMatch(current,/Eligible<\/span>/);assert.doesNotMatch(current,/Recent admin activity/);
  const entryAdmin=current.match(/function renderEntries\(r,comp\)\{[\s\S]*?function addEntry\(/)[0],memberAdmin=current.match(/async function renderMembers\(\)\{[\s\S]*?async function saveMemberName\(/)[0];
  assert.match(entryAdmin,/Mark sitting out/);assert.match(entryAdmin,/Mark unpaid first/);assert.match(current,/function setAdminParticipationFromEntries\(/);assert.doesNotMatch(memberAdmin,/Mark not participating|Clear status|memberAction\('participation'/);assert.match(memberAdmin,/Manage sitting-out status in Entries & payments/);
  assert.match(current,/entries-table \.entry-label/);assert.match(current,/inputmode="numeric"/);
  assert.ok(current.indexOf('The 32 teams')<current.indexOf('${renderFixturesCard(w)}'));
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(config.rewrites.some(route=>route.source==='/help'&&route.destination==='/index.html'));
  assert.ok(config.rewrites.some(route=>route.source==='/privacy'&&route.destination==='/index.html'));
  assert.ok(config.rewrites.some(route=>route.source==='/account'&&route.destination==='/index.html'));
  assert.ok(config.rewrites.some(route=>route.source==='/weekly-picks'&&route.destination==='/index.html'));
  assert.match(fs.readFileSync('scripts/dev.js','utf8'),/'\/weekly-picks'/);
  assert.match(fs.readFileSync('scripts/dev.js','utf8'),/'\/api\/team'/);assert.ok(fs.existsSync('api/team.js'));
});
