const schedule=require('./schedule.json');

const SEASON=Math.min(...schedule.games.map(game=>new Date(game.date).getUTCFullYear()));
const PREVIOUS_SEASON=SEASON-1;
const DIVISIONS={
  BUF:'AFC East',MIA:'AFC East',NE:'AFC East',NYJ:'AFC East',
  BAL:'AFC North',CIN:'AFC North',CLE:'AFC North',PIT:'AFC North',
  HOU:'AFC South',IND:'AFC South',JAX:'AFC South',TEN:'AFC South',
  DEN:'AFC West',KC:'AFC West',LV:'AFC West',LAC:'AFC West',
  DAL:'NFC East',NYG:'NFC East',PHI:'NFC East',WSH:'NFC East',
  CHI:'NFC North',DET:'NFC North',GB:'NFC North',MIN:'NFC North',
  ATL:'NFC South',CAR:'NFC South',NO:'NFC South',TB:'NFC South',
  ARI:'NFC West',LAR:'NFC West',SF:'NFC West',SEA:'NFC West'
};
const ESTABLISHED={ARI:1898,ATL:1966,BAL:1996,BUF:1960,CAR:1995,CHI:1920,CIN:1968,CLE:1946,DAL:1960,DEN:1960,DET:1930,GB:1919,HOU:2002,IND:1953,JAX:1995,KC:1960,LV:1960,LAC:1960,LAR:1936,MIA:1966,MIN:1961,NE:1960,NO:1967,NYG:1925,NYJ:1960,PHI:1933,PIT:1933,SF:1946,SEA:1976,TB:1976,TEN:1960,WSH:1932};
const CACHE_MS=15*60*1000;
const cache=new Map();
const normaliseAbbr=value=>String(value||'').toUpperCase()==='WSH'?'WSH':String(value||'').toUpperCase();
const slugify=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function fetchJSON(fetchImpl,url){
  const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'NFL-LMS/1.0'},signal:typeof AbortSignal!=='undefined'&&AbortSignal.timeout?AbortSignal.timeout(8000):undefined});
  if(!response.ok)throw new Error('upstream');
  return response.json();
}
function resultValue(competitor){
  const score=competitor?.score;
  const value=score&&typeof score==='object'?(score.value??score.displayValue):score;
  const number=Number(value);return Number.isFinite(number)?number:null;
}
function parseGame(event,abbr){
  const competition=event?.competitions?.[0],competitors=competition?.competitors||[];
  const mine=competitors.find(item=>normaliseAbbr(item?.team?.abbreviation)===abbr),opponent=competitors.find(item=>item!==mine);
  if(!mine||!opponent)return null;
  const myScore=resultValue(mine),theirScore=resultValue(opponent),completed=competition?.status?.type?.completed===true||event?.status?.type?.completed===true;
  const result=completed&&myScore!==null&&theirScore!==null?(myScore>theirScore?'W':myScore<theirScore?'L':'T'):null;
  return {id:String(event.id||''),season:Number(event?.season?.year)||null,date:event.date||competition.date||null,week:event?.week?.text||'',homeAway:mine.homeAway||'',opponent:{abbr:normaliseAbbr(opponent?.team?.abbreviation),name:opponent?.team?.displayName||opponent?.team?.shortDisplayName||''},completed,result,score:completed&&myScore!==null&&theirScore!==null?`${myScore}-${theirScore}`:null,venue:competition?.venue?.fullName||'',venueAddress:competition?.venue?.address||{}};
}
function gamesFrom(data,abbr){return (data?.events||[]).map(event=>parseGame(event,abbr)).filter(Boolean);}
function seasonRecord(games){
  const completed=games.filter(game=>game.completed&&game.result),wins=completed.filter(game=>game.result==='W').length,losses=completed.filter(game=>game.result==='L').length,ties=completed.filter(game=>game.result==='T').length;
  return {summary:completed.length?`${wins}-${losses}${ties?`-${ties}`:''}`:'0-0',wins,losses,ties,games:completed.length};
}
function seasonScoring(games){
  const completed=games.filter(game=>game.completed&&game.score),scores=completed.map(game=>game.score.split('-').map(Number)),pointsFor=scores.reduce((sum,[mine])=>sum+mine,0),pointsAgainst=scores.reduce((sum,[,theirs])=>sum+theirs,0),count=scores.length;
  return {pointsFor,pointsAgainst,differential:pointsFor-pointsAgainst,pointsPerGame:count?(pointsFor/count).toFixed(1):null,pointsAgainstPerGame:count?(pointsAgainst/count).toFixed(1):null};
}
function selectedStats(data){
  const categories=data?.results?.stats?.categories||[],find=(category,name)=>categories.find(item=>item.name===category)?.stats?.find(stat=>stat.name===name)?.displayValue||null;
  const percent=value=>value===null?null:`${value}%`;
  return [
    ['Points/game',find('passing','totalPointsPerGame')||find('scoring','totalPointsPerGame')],
    ['Total yards/game',find('passing','yardsPerGame')],
    ['Pass yards/game',find('passing','passingYardsPerGame')],
    ['Rush yards/game',find('rushing','rushingYardsPerGame')],
    ['Third-down rate',percent(find('miscellaneous','thirdDownConvPct'))],
    ['Red-zone TD rate',percent(find('miscellaneous','redzoneTouchdownPct'))],
    ['Turnover difference',find('miscellaneous','turnOverDifferential')],
    ['Defensive sacks',find('defensive','sacks')]
  ].filter(([,value])=>value!==null&&value!==undefined&&value!=='');
}
function rosterSummary(data){
  const groups=data?.athletes||[],all=groups.flatMap(group=>(group.items||[]).map(player=>({...player,rosterGroup:group.position})));
  const eligible=all.filter(player=>!['practice-squad'].includes(player?.status?.type));
  const positions={};
  for(const abbr of ['QB','RB','WR','TE'])positions[abbr]=eligible.filter(player=>player?.position?.abbreviation===abbr).slice(0,5).map(player=>({name:player.fullName||player.displayName||'',number:player.jersey||'',status:player?.status?.name||''}));
  const availability=all.filter(player=>['injuredReserveOrOut','suspended'].includes(player.rosterGroup)||!['active','practice-squad','news'].includes(player?.status?.type)).slice(0,8).map(player=>({name:player.fullName||player.displayName||'',position:player?.position?.abbreviation||'',status:player?.status?.name||player.rosterGroup||''}));
  const coach=data?.coach?.[0];
  return {headCoach:coach?[coach.firstName,coach.lastName].filter(Boolean).join(' '):'',positions,availability};
}
function buildTeamInfo(abbr,parts,now){
  const [teamData,rosterData,currentSchedule,previousSchedule,previousPostseason,currentStatistics,previousStatistics]=parts;
  const fallback=schedule.teams[abbr],team=teamData?.team||{},franchise=team.franchise||{},listedVenue=franchise.venue||{},slug=team.slug||slugify(fallback.name),roster=rosterSummary(rosterData);
  const currentGames=gamesFrom(currentSchedule,abbr),previousGames=gamesFrom(previousSchedule,abbr),postseasonGames=gamesFrom(previousPostseason,abbr);
  const homeVenues=currentGames.filter(game=>game.homeAway==='home'&&game.venue),venueCounts=homeVenues.reduce((counts,game)=>(counts[game.venue]=(counts[game.venue]||0)+1,counts),{}),scheduledHome=homeVenues.slice().sort((a,b)=>(venueCounts[b.venue]||0)-(venueCounts[a.venue]||0))[0],venueMatches=!scheduledHome||!listedVenue.fullName||scheduledHome.venue===listedVenue.fullName,venueName=scheduledHome?.venue||listedVenue.fullName||'Not available',venueAddress=scheduledHome?.venueAddress||listedVenue.address||{};
  const completedCurrent=currentGames.filter(game=>game.completed).sort((a,b)=>String(b.date).localeCompare(String(a.date))),completedPrevious=[...postseasonGames,...previousGames].filter(game=>game.completed).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const currentRecord=seasonRecord(currentGames),previousRecord=seasonRecord(previousGames),postseasonRecord=seasonRecord(postseasonGames),previousScoring=seasonScoring(previousGames),recent=(completedCurrent.length?completedCurrent:completedPrevious).slice(0,5),upcoming=currentGames.filter(game=>!game.completed).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,4);
  return {
    team:{abbr,name:team.displayName||fallback.name,shortName:team.shortDisplayName||fallback.short,location:team.location||fallback.loc,logo:team.logos?.find(logo=>logo.rel?.includes('default'))?.href||fallback.logo,color:team.color||fallback.color,alternateColor:team.alternateColor||fallback.alt,division:DIVISIONS[abbr],established:ESTABLISHED[abbr],headCoach:roster.headCoach||'Not available',venue:{name:venueName,city:venueAddress.city||team.location||fallback.loc,state:venueAddress.state||'',surface:venueMatches?(listedVenue.grass===true?'Grass':listedVenue.grass===false?'Artificial turf':'Not available'):'Not available',roof:venueMatches?(listedVenue.indoor===true?'Indoor':listedVenue.indoor===false?'Outdoor':'Not available'):'Not available',image:venueMatches?(listedVenue.images?.[0]?.href||''):''}},
    current:{season:SEASON,record:team.record?.items?.find(item=>item.type==='total')?.summary||currentSchedule?.team?.recordSummary||currentRecord.summary,standing:team.standingSummary||currentSchedule?.team?.standingSummary||DIVISIONS[abbr],form:recent.map(game=>game.result).filter(Boolean).join(''),statistics:currentRecord.games?selectedStats(currentStatistics):[]},
    recent,upcoming,
    previous:{season:PREVIOUS_SEASON,record:previousRecord.summary,postseasonRecord:postseasonRecord.games?postseasonRecord.summary:'Did not qualify',postseasonFinish:postseasonGames.filter(game=>game.completed).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null,scoring:previousScoring,statistics:selectedStats(previousStatistics)},
    roster:{positions:roster.positions,availability:roster.availability},
    links:{official:`https://www.nfl.com/teams/${slug}/`,espn:team.links?.find(link=>link.rel?.includes('clubhouse'))?.href||`https://www.espn.com/nfl/team/_/name/${abbr.toLowerCase()}/${slug}`,schedule:`https://www.espn.com/nfl/team/schedule/_/name/${abbr.toLowerCase()}/${slug}`,roster:`https://www.espn.com/nfl/team/roster/_/name/${abbr.toLowerCase()}/${slug}`,injuries:`https://www.espn.com/nfl/team/injuries/_/name/${abbr.toLowerCase()}/${slug}`},
    source:'ESPN',updatedAt:new Date(now).toISOString()
  };
}
function createTeamInfoHandler({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now()}={}){
  return async function teamInfo(req,res){
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','public, max-age=300, s-maxage=900, stale-while-revalidate=86400');
    try{
      if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed',message:'This method is not supported.',serverTime:new Date(now()).toISOString()});}
      const abbr=normaliseAbbr(req.query?.team);
      if(!Object.hasOwn(schedule.teams,abbr))return res.status(400).json({error:'unknown_team',message:'Choose an NFL team.',serverTime:new Date(now()).toISOString()});
      const saved=cache.get(abbr),time=now();if(saved&&time-saved.time<CACHE_MS)return res.status(200).json({...saved.data,serverTime:new Date(time).toISOString()});
      const base=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${abbr.toLowerCase()}`;
      const urls=[base,base+'/roster',`${base}/schedule?season=${SEASON}&seasontype=2`,`${base}/schedule?season=${PREVIOUS_SEASON}&seasontype=2`,`${base}/schedule?season=${PREVIOUS_SEASON}&seasontype=3`,`${base}/statistics?season=${SEASON}`,`${base}/statistics?season=${PREVIOUS_SEASON}`];
      const settled=await Promise.allSettled(urls.map(url=>fetchJSON(fetchImpl,url))),parts=settled.map(result=>result.status==='fulfilled'?result.value:null),data=buildTeamInfo(abbr,parts,time);
      if(settled.some(result=>result.status==='rejected'))console.warn('team-info upstream failures',settled.map((result,index)=>result.status==='rejected'?`${index}:${result.reason?.message||'unknown'}`:null).filter(Boolean).join(','));
      cache.set(abbr,{time,data});return res.status(200).json({...data,serverTime:new Date(time).toISOString()});
    }catch(error){return res.status(502).json({error:'team_info_unavailable',message:'Team information is temporarily unavailable. Please try again.',serverTime:new Date(now()).toISOString()});}
  };
}

module.exports={createTeamInfoHandler,buildTeamInfo,parseGame,seasonRecord,selectedStats,SEASON,PREVIOUS_SEASON};
