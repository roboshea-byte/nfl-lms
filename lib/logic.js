function createLMSLogic(SCHEDULE){
  const GAMES = SCHEDULE.games;
  const WEEKS = 18;
  const ROUND_ADVANCE_DELAY = 6*60*60*1000;
  const byWeek = {};
  GAMES.forEach(g=>{ (byWeek[g.week]=byWeek[g.week]||[]).push(g); });
  Object.values(byWeek).forEach(a=>a.sort((x,y)=>x.date.localeCompare(y.date)));
  const gamesByWeek = w => byWeek[w] || [];
  const teamGame = (abbr,w) => gamesByWeek(w).find(g=>g.home===abbr||g.away===abbr);

  function teamResult(S, abbr, w){
    const g = teamGame(abbr,w);
    if(!g) return {code:'BYE'};
    const r = S.results[g.id];
    if(!r || !r.final) return {code:'P', game:g, live:!!(r&&(r.hs!=null||r.as!=null))};
    const my = g.home===abbr? +r.hs : +r.as, opp = g.home===abbr? +r.as : +r.hs;
    return {code: my>opp?'W': my<opp?'L':'T', game:g, my, opp};
  }
  const weekSettled = (S,w) => { const gs=gamesByWeek(w); return gs.length>0 && gs.every(g=>S.results[g.id]?.final); };
  const weekHasResults = (S,w) => gamesByWeek(w).some(g=>S.results[g.id]?.final);
  const currentRound = S => S.rounds[S.rounds.length-1];
  const entriesForRound = (S,r=currentRound(S)) => S.entries.filter(e=>(e.round||1)===r.n);
  const roundEndWeek = r => r.endWeek || WEEKS;
  function defaultWeek(S){
    const r=currentRound(S);
    for(let w=r.startWeek; w<=roundEndWeek(r); w++){ if(!weekSettled(S,w)) return w; }
    return roundEndWeek(r);
  }
  function previousWeeksFinalised(S,r,w){
    if(!Number.isInteger(w)||w<r.startWeek||w>roundEndWeek(r))return false;
    for(let prior=r.startWeek;prior<w;prior++)if(!weekSettled(S,prior))return false;
    return true;
  }
  const isPickLost = (S,code) => code==='L' || code==='BYE' || (code==='T' && S.settings.tieRule==='loss');
  const paidForReset = (entry,r,resetWeek) => resetWeek===r.startWeek ? !!entry.paid : entry.rolloverPayments?.[resetWeek]===true;
  function paymentWeek(r,comp,w){
    return comp.events.filter(e=>e.type==='wipeout' && (w==null || e.week<w)).reduce((start,e)=>e.week+1,r.startWeek);
  }
  const isPaid = (entry,r,comp,w) => paidForReset(entry,r,paymentWeek(r,comp,w));
  function prizePot(S,r,comp){
    const starts=comp.events.filter(e=>e.type==='wipeout' && e.week<roundEndWeek(r)).map(e=>e.week+1);
    return S.settings.fee*entriesForRound(S,r).reduce((n,e)=>n+Number(!!e.paid)+starts.filter(w=>paidForReset(e,r,w)).length,0);
  }

  /* Walk the round week by week. Returns {weeks, alive:Set, events, winnerIds, complete, resetWeek, finalWeek} */
  function computeRound(S, r){
    r = r || currentRound(S);
    const entries=entriesForRound(S,r),all = entries.map(e=>e.id);
    let alive = new Set(entries.filter(e=>e.paid).map(e=>e.id));
    const out = {round:r.n,weeks:{}, events:[], winnerIds:null, complete:false, resetWeek:r.startWeek, finalWeek:null};
    for(let w=r.startWeek; w<=roundEndWeek(r); w++){
      const settled = weekSettled(S,w);
      const aliveBefore=[...alive];
      const losers=[];
      for(const id of alive){
        const pick = S.picks[id]?.[w];
        if(!pick || pick==='HIDDEN'){ if(!pick && settled && S.settings.missedPick==='eliminate') losers.push({id,reason:'No pick made',pick:null}); continue; }
        const res = teamResult(S,pick,w);
        if(res.code==='BYE'){ if(settled) losers.push({id,reason:'Picked a team on a bye',pick}); continue; }
        if(isPickLost(S,res.code)) losers.push({id,reason:(res.code==='T'?'Tied ':'Lost ')+res.my+'-'+res.opp,pick,res});
      }
      let wipeout=false;
      if(settled && alive.size>0 && losers.length===alive.size){
        wipeout=true;
        // Rollover always restores team availability, including for older saved states.
        out.resetWeek = w+1;
        out.events.push({week:w,type:'wipeout',count:losers.length});
        // Each rollover needs a fresh fee. Prior payments never carry forward.
        alive = new Set(entries.filter(e=>paidForReset(e,r,w+1)).map(e=>e.id));
        for(const id of all) if(!alive.has(id)) out.events.push({week:w+1,type:'out',id,reason:'Rollover fee not paid',pick:null,payment:true});
      } else {
        losers.forEach(l=>{ alive.delete(l.id); out.events.push({week:w,type:'out',...l}); });
      }
      out.weeks[w]={aliveBefore,aliveAfter:[...alive],losers,settled,wipeout};
      if(settled && !wipeout && alive.size===1 && all.length>1){ out.winnerIds=[...alive]; out.complete=true; out.finalWeek=w; out.events.push({week:w,type:'winner',ids:[...alive]}); break; }
      if(settled && w===WEEKS && alive.size>1){ out.winnerIds=[...alive]; out.complete=true; out.finalWeek=w; out.events.push({week:w,type:'split',ids:[...alive]}); }
    }
    out.alive=alive;
    return out;
  }
  const roundAdvanceAt = r => r.completedAt ? Date.parse(r.completedAt)+ROUND_ADVANCE_DELAY : null;
  function advanceRound(S,now=Date.now(),force=false){
    const r=currentRound(S),comp=computeRound(S,r);
    if(!comp.complete){
      if(r.completedAt){delete r.completedAt;r.endWeek=null;r.winnerIds=null;return {reset:true,completedRound:r,newRound:null,competition:comp};}
      return null;
    }
    r.endWeek=comp.finalWeek;
    r.winnerIds=[...(comp.winnerIds||[])];
    if(!r.completedAt)r.completedAt=new Date(now).toISOString();
    const advanceAt=roundAdvanceAt(r);
    if(comp.finalWeek>=WEEKS||(!force&&now<advanceAt))return {pending:comp.finalWeek<WEEKS,advanceAt,completedRound:r,newRound:null,competition:comp};
    const next={n:r.n+1,startWeek:comp.finalWeek+1,endWeek:null,winnerIds:null};
    S.rounds.push(next);
    return {pending:false,advanceAt,completedRound:r,newRound:next,competition:comp};
  }
  function usedTeams(S, entryId, r, comp, uptoWeek){
    const used={};
    for(let w=comp.resetWeek; w<=roundEndWeek(r); w++){
      if(w===uptoWeek) continue;
      const p=S.picks[entryId]?.[w]; if(p && p!=='HIDDEN') used[p]=w;
    }
    return used;
  }
  function aliveAtWeek(S, comp, w){
    const prev = comp.weeks[w-1];
    if(prev) return new Set(prev.aliveAfter);
    const r=S.rounds.find(r=>r.n===comp.round)||currentRound(S);
    return new Set(entriesForRound(S,r).filter(e=>e.paid).map(e=>e.id));
  }
  const isAliveForWeek = (S,comp,w,id) => aliveAtWeek(S,comp,w).has(id);
  const kickoff = (abbr,w) => { const g=teamGame(abbr,w); return g? new Date(g.date).getTime() : null; };
  const weekFirstKickoff = w => { const gs=gamesByWeek(w); return gs.length? new Date(gs[0].date).getTime() : null; };

  const weekDeadline = w => {const first=weekFirstKickoff(w);return first===null?null:first-3600000;};
  return {weekDeadline, ROUND_ADVANCE_DELAY, WEEKS, GAMES, gamesByWeek, teamGame, teamResult, weekSettled, weekHasResults, currentRound,entriesForRound, roundEndWeek, defaultWeek, previousWeeksFinalised, isPickLost, computeRound, roundAdvanceAt, advanceRound, usedTeams, aliveAtWeek, isAliveForWeek, kickoff, weekFirstKickoff, paymentWeek, isPaid, prizePot};
}
if(typeof module!=='undefined' && module.exports) module.exports = { createLMSLogic };
if(typeof window!=='undefined') window.createLMSLogic = createLMSLogic;
