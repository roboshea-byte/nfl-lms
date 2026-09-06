const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {createHandlers}=require('../lib/api');
const demo=process.argv.includes('--demo');const port=Number(process.env.PORT)||3000;
let db,adminKey=()=>process.env.ADMIN_KEY;
if(demo){
  const {memoryStore,defaults}=require('../tests/helpers');db=memoryStore(defaults());adminKey=()=> 'preview-only';
  console.log('Isolated demo: organiser passphrase preview-only; sample link /play/alice12345. Data resets when stopped.');
}else db=require('../api/_db');
const handlers=createHandlers({db,adminKey});
const routes={'/api/state':'state','/api/me':'me','/api/pick':'pick','/api/admin/state':'adminState','/api/admin/pick':'adminPick','/api/admin/results/fetch':'fetchResults'};
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
  if(url.pathname==='/'||url.pathname==='/index.html'||/^\/play\/[^/]+\/?$/.test(url.pathname)){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../index.html')));return;
  }
  res.writeHead(404);res.end('Not found');
}).listen(port,'127.0.0.1',()=>console.log(`NFL LMS available at http://localhost:${port}`));
