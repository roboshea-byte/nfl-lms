const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {createHandlers}=require('../lib/api');
const demo=process.argv.includes('--demo');const port=Number(process.env.PORT)||3000;
let db,adminKey=()=>process.env.ADMIN_KEY;
if(demo){
  const {newDb,DataType}=require('pg-mem');const mem=newDb();mem.public.registerFunction({name:'clock_timestamp',returns:DataType.timestamptz,implementation:()=>new Date(),impure:true});const {Pool}=mem.adapters.createPg();db=require('../api/_db').createStore(new Pool());
  process.env.OWNER_EMAIL='owner@example.test';process.env.OWNER_SETUP_TOKEN='local-owner-setup';
  console.log('Isolated accounts demo. Owner: owner@example.test with local setup token. No live data.');
}else db=require('../api/_db');
const auth=require('../lib/accounts').createAccounts({db,secure:false});
const handlers={...createHandlers({db,adminKey,auth}),...(auth?{account:auth.handler}:{})};
const routes={'/api/account':'account','/api/state':'state','/api/me':'me','/api/pick':'pick','/api/admin/state':'adminState','/api/admin/pick':'adminPick','/api/admin/results/fetch':'fetchResults'};
http.createServer(async(req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://localhost');
  if(routes[url.pathname]){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024){res.writeHead(413);res.end(JSON.stringify({error:'too_large',serverTime:new Date().toISOString()}));return;}chunks.push(chunk);}
    req.body=Buffer.concat(chunks).toString()||undefined;req.query=Object.fromEntries(url.searchParams);
    res.status=function(code){this.statusCode=code;return this;};res.json=function(data){this.end(JSON.stringify(data));};
    return handlers[routes[url.pathname]](req,res);
  }
  if(['/login','/signup','/dashboard','/admin','/reset-password'].includes(url.pathname)||url.pathname==='/'||url.pathname==='/index.html'||/^\/play\/[^/]+\/?$/.test(url.pathname)){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../index.html')));return;
  }
  res.writeHead(404);res.end('Not found');
}).listen(port,'127.0.0.1',()=>console.log(`NFL LMS available at http://localhost:${port}`));
