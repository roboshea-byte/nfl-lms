const crypto = require('node:crypto');
const {createLMSLogic} = require('./logic');
const schedule = require('./schedule.json');
const L = createLMSLogic(schedule);
const fail = (code,message,status=400) => { throw Object.assign(new Error(message),{code,status}); };
const canonical = value => Array.isArray(value)?value.map(canonical):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function revision(S) { return hash({settings:S.settings,entries:[...S.entries].sort((a,b)=>a.id.localeCompare(b.id)),results:S.results,rounds:S.rounds}); }
function isAdmin(req,key) {
  const supplied=req.headers?.['x-admin-key'];
  if (!key || typeof supplied!=='string') return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(supplied).digest(),crypto.createHash('sha256').update(key).digest());
}
const publicEntry = ({id,name,label,paid,round,rolloverPayments}) => ({id,name,label,paid,round:round||1,rolloverPayments:rolloverPayments||{}});
function statePayload(S,admin,now,revealPicks=admin) {
  const visibleEntries=admin?S.entries:S.entries.filter(entry=>{const round=S.rounds.find(r=>r.n===(entry.round||1));return round&&L.isPaid(entry,round,L.computeRound(S,round));});
  const visibleIds=new Set(visibleEntries.map(entry=>entry.id));
  const picks={};
  for (const [id,weeks] of Object.entries(S.picks)) {
    if(!admin&&!visibleIds.has(id))continue;
    picks[id]={};
    for (const [week,team] of Object.entries(weeks)) picks[id][week]=revealPicks || (L.kickoff(team,+week)!==null && L.kickoff(team,+week)<=now) ? team : 'HIDDEN';
  }
  const state={settings:{...S.settings,wipeoutResetTeams:true},entries:admin?visibleEntries:visibleEntries.map(publicEntry),picks,results:S.results,rounds:S.rounds,admin};
  // A content revision changes at kick-off even when nobody writes to the database.
  return {...state,updatedAt:hash({state,availableWeek:L.defaultWeek(S,now)}),...(admin?{revision:revision(S)}:{}),serverTime:new Date(now).toISOString()};
}
function mePayload(S,entry,now,revealPicks=false) {return {entry:publicEntry(entry),picks:S.picks[entry.id]||{},state:statePayload(S,false,now,revealPicks),serverTime:new Date(now).toISOString()};}
function bodyOf(req) {
  let b=req.body;
  try { if (typeof b==='string') b=JSON.parse(b); } catch { fail('bad_request','Send a valid JSON request.'); }
  if (!b || typeof b!=='object' || Array.isArray(b)) fail('bad_request','Send a JSON object.');
  return b;
}
const safeId = s => typeof s==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(s) && !['__proto__','constructor','prototype'].includes(s);
const text = (s,max) => typeof s==='string' && s.length<=max;
function validateAdmin(b) {
  const s=b.settings;
  if (!s || !Number.isFinite(s.fee) || s.fee<0 || !['loss','survive'].includes(s.tieRule) || !['eliminate','survive'].includes(s.missedPick) || typeof s.wipeoutResetTeams!=='boolean') fail('bad_state','Check the competition settings.');
  if (!text(s.announcement??'',1000) || !['update','payment','deadline','important'].includes(s.announcementType??'update') || typeof (s.announcementEnabled??false)!=='boolean') fail('bad_state','Check the member announcement.');
  if (!Array.isArray(b.entries) || b.entries.length>10000 || b.entries.some(e=>!e || !safeId(e.id) || !text(e.name,200) || !e.name.trim() || !text(e.label||'',200) || !text(e.email||'',320) || typeof e.paid!=='boolean' || (e.round!==undefined&&(!Number.isInteger(e.round)||e.round<1||e.round>18))) || new Set(b.entries.map(e=>e.id)).size!==b.entries.length) fail('bad_state','Each entry needs a unique ID, name, round and payment status.');
  for(const e of b.entries) if(e.rolloverPayments!==undefined && (!e.rolloverPayments || typeof e.rolloverPayments!=='object' || Array.isArray(e.rolloverPayments) || Object.entries(e.rolloverPayments).some(([w,paid])=>! /^(?:[1-9]|1[0-8])$/.test(w) || typeof paid!=='boolean'))) fail('bad_state','Check the rollover payments.');
  if (!Array.isArray(b.rounds) || !b.rounds.length || b.rounds.length>18) fail('bad_state','At least one round is required.');
  let end=0;
  for (let i=0;i<b.rounds.length;i++) {
    const r=b.rounds[i];
    if (!r || r.n!==i+1 || !Number.isInteger(r.startWeek) || r.startWeek<1 || r.startWeek>18 || r.startWeek<=end || (r.endWeek!==null && (!Number.isInteger(r.endWeek) || r.endWeek<r.startWeek || r.endWeek>18)) || (r.winnerIds!==null && (!Array.isArray(r.winnerIds) || r.winnerIds.some(id=>!safeId(id)))) || (r.completedAt!==undefined&&(typeof r.completedAt!=='string'||!Number.isFinite(Date.parse(r.completedAt))))) fail('bad_state','Check round numbers and week boundaries.');
    end=r.endWeek||18;
  }
  if (!b.results || typeof b.results!=='object' || Array.isArray(b.results)) fail('bad_state','Results must be keyed by game ID.');
  for (const [id,r] of Object.entries(b.results)) {
    if (!schedule.games.some(g=>g.id===id) || !r || typeof r.final!=='boolean' || [r.hs,r.as].some(v=>v!==null && (!Number.isInteger(v) || v<0 || v>200)) || (r.final && (r.hs===null || r.as===null)) || (r.finalisedAt!==undefined&&(typeof r.finalisedAt!=='string'||!Number.isFinite(Date.parse(r.finalisedAt))))) fail('bad_state','Check the game IDs and scores.');
  }
  if (b.replacePicks!==undefined) {
    if (!b.replacePicks || typeof b.replacePicks!=='object' || Array.isArray(b.replacePicks)) fail('bad_state','Backup picks must be an object.');
    for (const [id,weeks] of Object.entries(b.replacePicks)) {
      if (!b.entries.some(e=>e.id===id) || !weeks || typeof weeks!=='object' || Array.isArray(weeks)) fail('bad_state','Backup picks must belong to an entry.');
      for (const [w,t] of Object.entries(weeks)) if (!/^(?:[1-9]|1[0-8])$/.test(w) || !Object.hasOwn(schedule.teams,t)) fail('bad_state','Check the weeks and teams in the backup.');
    }
  }
}
function createHandlers({db,auth,now=()=>Date.now(),adminKey=()=>process.env.ADMIN_KEY,fetchImpl=(...args)=>fetch(...args),newCode=()=>crypto.randomBytes(8).toString('base64url').slice(0,10)}) {
  const handlers={};
  async function stateWithAutomaticRound(){
    let S=await db.read(),time=now(),timestampsChanged=L.syncResultFinalisedAt(S,time),r=L.currentRound(S),comp=L.computeRound(S,r),advanceAt=L.roundAdvanceAt(r);
    if(timestampsChanged||(comp.complete&&(!r.completedAt||(advanceAt!==null&&time>=advanceAt))))S=await db.mutate(state=>{L.advanceRound(state,time);return structuredClone(state);});
    return S;
  }
  function endpoint(name,method,admin,fn) {
    handlers[name]=async(req,res)=>{
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Referrer-Policy','no-referrer');
      try {
        if (req.method!==method) {res.setHeader('Allow',method);fail('method_not_allowed','This method is not supported.',405);}
        const principal=auth?(auth.context?await auth.context(req):{user:await auth.user(req),actor:null}):null;req.user=principal?.user||null;req.actor=principal?.actor||req.user;
        if(auth && method==='POST')auth.checkRequest(req);
        const authed=auth?!!req.user && ['owner','admin'].includes(req.user.role):isAdmin(req,adminKey());
        if (admin && !authed) fail('unauthorised','Sign in with an administrator account.',401);
        const payload=await fn(req,authed);
        res.status(200).json({...payload,serverTime:new Date(now()).toISOString()});
      } catch(error) {
        // Database errors may contain a connection string or personal information.
        res.status(error.status||500).json({error:error.code && error.status?error.code:'server_error',message:error.status?error.message:'Could not complete that request. Please try again.',serverTime:new Date(now()).toISOString()});
      }
    };
  }
  endpoint('state','GET',false,async(req,admin)=>statePayload(await stateWithAutomaticRound(),admin,now()));
  endpoint('me','GET',false,async(req)=>{
    const S=await stateWithAutomaticRound();const e=S.entries.find(e=>auth?e.id===req.query?.entryId && e.accountId===req.user?.id:e.code===req.query?.code);
    if (!e) fail('unknown_code','That personal link was not found. Ask the organiser for your link.',404);
    return mePayload(S,e,now(),!!auth&&['owner','admin'].includes(req.user?.role));
  });
  endpoint('pick','POST',false,async(req)=>{
    const {code,entryId,week,team}=bodyOf(req);
    if(auth&&req.user&&!/\S+\s+\S+/.test(req.user.name||'')) fail('name_required','Ask an administrator to add your first and last name before you make a pick.',403);
    return db.mutate(S=>{
      const e=S.entries.find(e=>auth?e.id===entryId && e.accountId===req.user?.id:e.code===code);
      if (!e) fail('unknown_code','That personal link was not found.');
      const r=L.currentRound(S),comp=L.computeRound(S,r),time=now();
      if(comp.complete)fail('round_complete','This round is complete. Wait for the organiser to start the next round.');
      if (!L.isPaid(e,r,comp,week)) fail('unpaid',L.paymentWeek(r,comp,week)>r.startWeek?"You must pay the entry fee again after rollover. You are out until the organiser confirms payment.":"You're not marked as paid yet, contact the organiser");
      if (!Number.isInteger(week) || week<r.startWeek || week>L.roundEndWeek(r)) fail('bad_week','Choose a week in the current round.');
      if (!L.isAliveForWeek(S,comp,week,e.id)) fail('eliminated',"You're out for this week.");
      if (!L.previousWeeksFinalised(S,r,week,time)) fail('future_week',`Week ${week} opens six hours after Week ${week-1} has been finalised.`);
      if (L.weekDeadline(week)===null || time>=L.weekDeadline(week)) fail('locked','Picks close one hour before the first kick-off of the week.');
      if (team!==null && (typeof team!=='string' || !L.teamGame(team,week))) fail('bye','That team is not playing this week.');
      if (team!==null && Object.hasOwn(L.usedTeams(S,e.id,r,comp,week),team)) fail('used','You have already used that team since the last reset.');
      if (team===null) {if(S.picks[e.id]) delete S.picks[e.id][week];}
      else (S.picks[e.id] ||= {})[week]=team;
      return mePayload(S,e,time,!!auth&&['owner','admin'].includes(req.user?.role));
    },auth?{actorId:req.actor?.id,action:'competition.'+req.url?.split('?')[0],details:req.actor?.id!==req.user?.id?{viewedAccountId:req.user?.id}:{}}:undefined);
  });
  endpoint('adminPick','POST',true,async(req)=>{
    const {entryId,week,team}=bodyOf(req);
    return db.mutate(S=>{
      const entry=S.entries.find(e=>e.id===entryId);if (!entry) fail('unknown_entry','That entry no longer exists.');
      if (!Number.isInteger(week)||week<1||week>18) fail('bad_week','Choose an existing week.');
      if (team!==null && !Object.hasOwn(schedule.teams,team)) fail('unknown_team','Choose an NFL team.');
      if (team!==null && !L.teamGame(team,week)) fail('bye','That team is not playing this week.');
      if (team!==null){const r=L.currentRound(S),comp=L.computeRound(S,r);if(Object.hasOwn(L.usedTeams(S,entryId,r,comp,week),team))fail('used','That entry has already used this team since the last reset.');}
      if(team===null){if(S.picks[entryId])delete S.picks[entryId][week];}else (S.picks[entryId] ||= {})[week]=team;
      return statePayload(S,true,now());
    },auth?{actorId:req.actor?.id,action:'competition.admin_pick',targetId:entryId,details:{week,team,deadlineOverridden:L.weekDeadline(week)!==null&&now()>=L.weekDeadline(week)}}:undefined);
  });
  endpoint('adminState','POST',true,async(req)=>{
    const b=bodyOf(req);validateAdmin(b);
    return db.mutate(S=>{
      if (b.baseRevision && b.baseRevision!==revision(S)) fail('conflict','Another organiser changed the competition. Reload before saving again.',409);
      const codes=new Set(S.entries.map(e=>e.code));
      S.entries=b.entries.map(e=>{
        const old=S.entries.find(x=>x.id===e.id);let code=old?.code;
        if(!code){do{code=newCode();}while(codes.has(code));codes.add(code);}
        return {accountId:old?.accountId||null,id:e.id,code,name:e.name.trim(),label:e.label||'',email:e.email||'',paid:e.paid,round:e.round??old?.round??L.currentRound(S).n,rolloverPayments:structuredClone(e.rolloverPayments??old?.rolloverPayments??{}),created:old?.created||(Number.isFinite(e.created)?e.created:now())};
      });
      S.settings={fee:b.settings.fee,tieRule:b.settings.tieRule,wipeoutResetTeams:true,missedPick:b.settings.missedPick,title:text(b.settings.title,200)?b.settings.title:'Last Man Standing',announcement:(b.settings.announcement??'').trim(),announcementEnabled:b.settings.announcementEnabled??false,announcementType:b.settings.announcementType??'update'};
      S.rounds=b.rounds.map(r=>({n:r.n,startWeek:r.startWeek,endWeek:r.endWeek,winnerIds:r.winnerIds,...(r.completedAt?{completedAt:r.completedAt}:{})}));
      S.results=structuredClone(b.results);
      if(b.replacePicks!==undefined)S.picks=structuredClone(b.replacePicks);
      for(const id of Object.keys(S.picks))if(!S.entries.some(e=>e.id===id))delete S.picks[id];
      L.advanceRound(S,now());
      return statePayload(S,true,now());
    },auth?{actorId:req.actor?.id,action:'competition.'+req.url?.split('?')[0]}:undefined);
  });
  endpoint('fetchResults','POST',true,async(req)=>{
    const {week}=bodyOf(req);
    if(!Number.isInteger(week)||week<1||week>18)fail('bad_week','Choose a week from 1 to 18.');
    let d;
    try {
      const response=await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=2026`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('ESPN response failed');d=await response.json();
      if(!Array.isArray(d.events))throw new Error('Missing events');
    }catch{fail('espn_unavailable','Could not reach ESPN. Please try again.',502);}
    return db.mutate(S=>{
      let count=0,final=0;
      for(const ev of d.events){
        if(!ev.status?.type || ev.status.type.state==='pre')continue;
        const competitors=ev.competitions?.[0]?.competitors||[];
        const home=competitors.find(x=>x.homeAway==='home'),away=competitors.find(x=>x.homeAway==='away');
        if(!home||!away)continue;
        const g=schedule.games.find(g=>g.week===week && (g.id===ev.id || (g.home===home.team?.abbreviation&&g.away===away.team?.abbreviation)));
        if(!g || home.score==null || away.score==null || !Number.isInteger(+home.score) || !Number.isInteger(+away.score))continue;
        const completed=!!ev.status.type.completed,existing=S.results[g.id];S.results[g.id]={hs:+home.score,as:+away.score,final:completed,...(completed&&existing?.finalisedAt?{finalisedAt:existing.finalisedAt}:{})};count++;if(completed)final++;
      }
      L.advanceRound(S,now());
      return {...statePayload(S,true,now()),fetched:{count,final}};
    },auth?{actorId:req.actor?.id,action:'competition.'+req.url?.split('?')[0]}:undefined);
  });
  return handlers;
}
module.exports={createHandlers,statePayload,revision};
