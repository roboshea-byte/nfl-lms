const schedule=require('../lib/schedule.json');
const {createLMSLogic}=require('../lib/logic');
const L=createLMSLogic(schedule);
const defaults=()=>({settings:{fee:20,tieRule:'loss',wipeoutResetTeams:true,missedPick:'eliminate',title:'Last Man Standing'},entries:[{id:'alice',code:'alice12345',name:'Alice',label:'Team 1',email:'alice@example.test',paid:true,created:1},{id:'bob',code:'bob1234567',name:'Bob',label:'',email:'bob@example.test',paid:true,created:1},{id:'charlie',code:'charlie123',name:'Charlie',label:'',email:'',paid:true,created:1}],picks:{},results:{},rounds:[{n:1,startWeek:1,endWeek:null,winnerIds:null}]});
function memoryStore(initial=defaults()){
  let state=structuredClone(initial),tail=Promise.resolve();
  return {read:async()=>structuredClone(state),mutate(fn){const job=tail.then(async()=>{const copy=structuredClone(state);const result=await fn(copy);state=copy;return result;});tail=job.catch(()=>{});return job;}};
}
async function call(handler,{method='GET',body,code,key}={}){
  const headers={};let status,payload;
  await handler({method,body,query:{code},headers:key?{'x-admin-key':key}:{}},{setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this;},json(x){payload=JSON.parse(JSON.stringify(x));}});
  return {status,body:payload,headers};
}
module.exports={defaults,memoryStore,call,schedule,L};
