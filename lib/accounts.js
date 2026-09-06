const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,code:'account_error'});};
const safeUser=u=>u?{id:u.id,email:u.email,name:u.name,role:u.role,disabled:u.disabled}:null;
function personName(body){
 const firstName=typeof body.firstName==='string'?body.firstName.trim().replace(/\s+/g,' '):'';
 const lastName=typeof body.lastName==='string'?body.lastName.trim().replace(/\s+/g,' '):'';
 if(!firstName||!lastName||firstName.length>50||lastName.length>50)fail('Enter a first name and last name.');
 return `${firstName} ${lastName}`;
}
async function passwordHash(password){
 if(typeof password!=='string'||password.length<7||password.length>256)fail('Use a password between 7 and 256 characters.');
 const salt=token();const key=await scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});return salt+':'+key.toString('hex');
}
async function passwordMatches(password,stored){
 if(typeof password!=='string'||password.length>256)return false;
 const [salt,hash]=stored.split(':');const key=await scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});return crypto.timingSafeEqual(key,Buffer.from(hash,'hex'));
}
function createAccounts({db,now=()=>Date.now(),ownerEmail=()=>process.env.OWNER_EMAIL,ownerToken=()=>process.env.OWNER_SETUP_TOKEN,secure=process.env.NODE_ENV!=='development'}){
 const query=(sql,args)=>db.withClient(c=>c.query(sql,args));
 async function transaction(fn){return db.withClient(async c=>{await c.query('BEGIN');try{await c.query('SELECT id FROM settings WHERE id=1 FOR UPDATE');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}});}
 async function audit(c,user,action,target,details={}){await c.query('INSERT INTO audit_log(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),user?.id||null,action,target||null,JSON.stringify(details)]);}
 function checkRequest(req){
  if(req.headers['x-lms-request']!=='1')fail('Refresh the page and try again.',403);
  const origin=req.headers.origin,host=req.headers.host;
  if(origin){let parsed;try{parsed=new URL(origin);}catch{fail('Invalid request origin.',403);}if(parsed.host!==host)fail('Invalid request origin.',403);}
  if(req.headers['sec-fetch-site']==='cross-site')fail('Invalid request origin.',403);
 }
 const cookieName=secure?'__Host-lms-session':'lms-session';
 function cookie(req){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';}
 async function user(req){const value=cookie(req);if(!value)return null;const {rows}=await query('SELECT a.* FROM accounts a JOIN account_sessions s ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND a.disabled=false',[digest(value),new Date(now())]);return safeUser(rows[0]);}
 async function session(c,res,id){const value=token();await c.query('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[digest(value),id,new Date(now()+30*86400000)]);res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`);}
 async function throttle(req,email){
  await query('DELETE FROM auth_limits WHERE expires_at<$1',[new Date(now())]);
  await query('DELETE FROM account_sessions WHERE expires_at<$1',[new Date(now())]);
  await query('DELETE FROM account_resets WHERE expires_at<$1',[new Date(now())]);
  const ip=req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'local';
  for(const [scope,value,max] of [['ip',ip,50],['email',email,12]]){
   const bucket=Math.floor(now()/900000),key=digest(scope+':'+value+':'+bucket);
   const {rows}=await query('INSERT INTO auth_limits(key,hits,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=auth_limits.hits+1 RETURNING hits',[key,new Date((bucket+1)*900000)]);
   if(rows[0].hits>max)fail('Too many attempts. Please try again in 15 minutes.',429);
  }
 }
 async function currentRound(c){return (await c.query('SELECT n FROM rounds ORDER BY n DESC LIMIT 1')).rows[0]?.n||1;}
 async function addEntry(c,u,name,label='1',round=1){const id=crypto.randomUUID();await c.query('INSERT INTO entries(id,code,name,label,email,paid,account_id,round_n) VALUES($1,$2,$3,$4,$5,false,$6,$7)',[id,token(),name||u.name,label,u.email,u.id,round]);return id;}
 async function summary(c,round){
 const members=+(await c.query('SELECT count(*) AS n FROM accounts WHERE disabled=false')).rows[0].n;
  const entries=(await c.query('SELECT paid,account_id FROM entries WHERE round_n=$1',[round])).rows,participating=new Set(entries.map(e=>e.account_id).filter(Boolean)).size;
  return {members,participating,entries:entries.length,paid:entries.filter(e=>e.paid).length,unpaid:entries.filter(e=>!e.paid).length};
 }
 async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');res.setHeader('Content-Type','application/json');
  try{
   const action=req.query?.action||'me';let b=req.body||{};if(typeof b==='string'){try{b=JSON.parse(b);}catch{fail('Invalid request.');}}
   if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid request.');
   if(!['GET','POST'].includes(req.method))fail('Method not supported.',405);
   if(req.method==='POST')checkRequest(req);
   const u=await user(req),staff=u&&['owner','admin'].includes(u.role);
   let result={};
   if(req.method==='GET'){
    if(action==='me'){
     const S=await db.read(),round=S.rounds.at(-1)?.n||1,status=u?(await query('SELECT status FROM account_round_status WHERE account_id=$1 AND round_n=$2',[u.id,round])).rows[0]?.status||'not_entered':'not_entered';
     result={user:u,round,participation:status,summary:u?await db.withClient(c=>summary(c,round)):null,entries:u?S.entries.filter(e=>e.accountId===u.id&&(e.round||1)===round).sort((a,b)=>(Number(a.label)||Number.MAX_SAFE_INTEGER)-(Number(b.label)||Number.MAX_SAFE_INTEGER)||a.created-b.created||a.id.localeCompare(b.id)).map(e=>({id:e.id,name:e.name,label:e.label,paid:e.paid,round:e.round||1,rolloverPayments:e.rolloverPayments||{}})):[]};
    }else if(action==='members'&&staff){
     const S=await db.read(),round=S.rounds.at(-1)?.n||1,users=(await query('SELECT id,email,name,role,disabled FROM accounts ORDER BY created_at',[])).rows,statuses=(await query('SELECT account_id,status FROM account_round_status WHERE round_n=$1',[round])).rows;
     const current=S.entries.filter(e=>(e.round||1)===round);
     result={round,summary:await db.withClient(c=>summary(c,round)),users:users.map(member=>{const entries=current.filter(e=>e.accountId===member.id);return {...member,participation:entries.length?'participating':statuses.find(s=>s.account_id===member.id)?.status||'not_entered',entryCount:entries.length,paidCount:entries.filter(e=>e.paid).length,unpaidCount:entries.filter(e=>!e.paid).length};}),entries:u.role==='owner'?current:[],audit:u.role==='owner'?(await query('SELECT actor_id,action,target_id,details,created_at FROM audit_log ORDER BY created_at DESC LIMIT 50',[])).rows:[]};
    }else fail('Sign in with the required role.',403);
   }else if(action==='signup'||action==='login'){
    const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)fail('Enter a valid email address.');
    await throttle(req,email);
    if(action==='signup'){
     const reserved=email===ownerEmail()?.toLowerCase();
     if(reserved&&(!ownerToken()||typeof b.setupToken!=='string'||digest(b.setupToken)!==digest(ownerToken())))fail('Use your private owner setup link to register this email.');
     const name=personName(b);
     const hashed=await passwordHash(b.password);
     result=await transaction(async c=>{
      if((await c.query('SELECT id FROM accounts WHERE email=$1',[email])).rows.length)fail('This email is already registered. Sign in or ask the organiser for a password reset.');
      if(reserved&&(await c.query("SELECT id FROM accounts WHERE role='owner'",[])).rows.length)fail('The owner account is already set up.');
      const account={id:crypto.randomUUID(),email,name,role:reserved?'owner':'member'};
      await c.query('INSERT INTO accounts(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[account.id,email,account.name,hashed,account.role]);
      await session(c,res,account.id);await audit(c,account,'account.signup',account.id);return {user:safeUser(account)};
     });
    }else{
     const account=(await query('SELECT * FROM accounts WHERE email=$1',[email])).rows[0];
     const dummy='invalid:'+ '00'.repeat(64);
     const valid=await passwordMatches(b.password,account?.password_hash||dummy);
     if(!account||account.disabled||!valid)fail('Email or password is incorrect.',401);
     await transaction(async c=>{const current=(await c.query('SELECT * FROM accounts WHERE id=$1',[account.id])).rows[0];if(current.disabled||current.password_hash!==account.password_hash)fail('Please sign in again.',401);await session(c,res,account.id);});result={user:safeUser(account)};
    }
   }else if(action==='logout'){
    await query('DELETE FROM account_sessions WHERE token_hash=$1',[digest(cookie(req))]);res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);
   }else if(action==='reset'){
    await throttle(req,'reset');if(typeof b.token!=='string')fail('Invalid reset link.');const hashed=await passwordHash(b.password);
    await transaction(async c=>{
     const reset=(await c.query('SELECT * FROM account_resets WHERE token_hash=$1 AND expires_at>$2',[digest(b.token),new Date(now())])).rows[0];if(!reset)fail('This reset link has expired or has already been used.');
     const target=(await c.query('SELECT * FROM accounts WHERE id=$1',[reset.account_id])).rows[0];if(target.disabled)fail('This account is disabled.');
     await c.query('UPDATE accounts SET password_hash=$1 WHERE id=$2',[hashed,target.id]);await c.query('DELETE FROM account_resets WHERE account_id=$1',[target.id]);await c.query('DELETE FROM account_sessions WHERE account_id=$1',[target.id]);await audit(c,target,'account.password_reset',target.id);
    });
   }else{
    if(!u)fail('Please sign in.',401);
    if(action==='password'){
     const account=(await query('SELECT * FROM accounts WHERE id=$1',[u.id])).rows[0];await throttle(req,u.email);
     if(!await passwordMatches(b.currentPassword,account.password_hash))fail('Your current password is incorrect.');
     const hashed=await passwordHash(b.password);await transaction(async c=>{const current=(await c.query('SELECT * FROM accounts WHERE id=$1',[u.id])).rows[0];if(current.disabled||current.password_hash!==account.password_hash)fail('Please sign in again.',401);await c.query('UPDATE accounts SET password_hash=$1 WHERE id=$2',[hashed,u.id]);await c.query('DELETE FROM account_sessions WHERE account_id=$1',[u.id]);await c.query('DELETE FROM account_resets WHERE account_id=$1',[u.id]);await session(c,res,u.id);await audit(c,u,'account.password_change',u.id);});
    }else if(action==='entry'||action==='remove-entry'||action==='participation'){
     result=await transaction(async c=>{
      const current=(await c.query('SELECT * FROM accounts WHERE id=$1',[u.id])).rows[0];if(current.disabled)fail('Please sign in again.',401);
      const isStaff=['owner','admin'].includes(current.role),targetId=b.userId&&isStaff?b.userId:u.id;if(b.userId&&b.userId!==u.id&&!isStaff)fail('Administrator access required.',403);
      const target=(await c.query('SELECT * FROM accounts WHERE id=$1',[targetId])).rows[0];if(!target||target.disabled)fail('Choose an active member.');
      const round=await currentRound(c),owned=(await c.query('SELECT id,label,paid FROM entries WHERE account_id=$1 AND round_n=$2 ORDER BY created_at,id',[target.id,round])).rows;
      if(action==='entry'){
       if(owned.length>=100)fail('Contact the organiser to add more entries.');for(let i=0;i<owned.length;i++)if(!owned[i].label)await c.query('UPDATE entries SET label=$1 WHERE id=$2',[String(i+1),owned[i].id]);
       const id=await addEntry(c,target,target.name,String(owned.length+1),round);await c.query('DELETE FROM account_round_status WHERE account_id=$1 AND round_n=$2',[target.id,round]);await audit(c,u,'entry.create',id,{accountId:target.id,round,entryNumber:owned.length+1});return {entryId:id};
      }
      if(action==='remove-entry'){
       const entry=owned.find(e=>e.id===b.entryId);if(!entry)fail('That entry was not found in the current round.');if(entry.paid)fail('A paid entry must be marked unpaid by an admin before it can be removed.');
       await c.query('DELETE FROM entries WHERE id=$1',[entry.id]);await audit(c,u,'entry.remove',entry.id,{accountId:target.id,round});return {};
      }
      if(b.status==='not_participating'){
       if(owned.some(e=>e.paid))fail('Paid entries must be marked unpaid by an admin before this member can sit out the round.');
       await c.query('DELETE FROM entries WHERE account_id=$1 AND round_n=$2 AND paid=false',[target.id,round]);await c.query(`INSERT INTO account_round_status(account_id,round_n,status,updated_at) VALUES($1,$2,'not_participating',clock_timestamp()) ON CONFLICT(account_id,round_n) DO UPDATE SET status='not_participating',updated_at=clock_timestamp()`,[target.id,round]);await audit(c,u,'round.not_participating',target.id,{round});return {};
      }
      if(b.status==='not_entered'){await c.query('DELETE FROM account_round_status WHERE account_id=$1 AND round_n=$2',[target.id,round]);await audit(c,u,'round.clear_status',target.id,{round});return {};}
      fail('Choose a valid participation status.');
     });
    }else{
     if(!staff)fail('Administrator access required.',403);
     result=await transaction(async c=>{
      // Recheck permissions under the same lock used for all role changes.
      const current=(await c.query('SELECT * FROM accounts WHERE id=$1',[u.id])).rows[0];if(current.disabled||!['owner','admin'].includes(current.role))fail('Administrator access required.',403);
      const target=(await c.query('SELECT * FROM accounts WHERE id=$1',[b.userId||''])).rows[0];
      if(action==='assign'){
       if(!target||target.disabled)fail('Choose an active account.');
       const entry=(await c.query('SELECT id FROM entries WHERE id=$1',[b.entryId])).rows[0];if(!entry)fail('Entry not found.');
       await c.query('UPDATE entries SET account_id=$1,name=$2,email=$3 WHERE id=$4',[target.id,target.name,target.email,entry.id]);await audit(c,u,'entry.assign',entry.id,{accountId:target.id});return {};
      }
      if(!target)fail('Account not found.');
      if(action==='name'){
       if(target.role==='owner'&&current.role!=='owner')fail('Only the owner can change the owner name.',403);
       const name=personName(b);await c.query('UPDATE accounts SET name=$1 WHERE id=$2',[name,target.id]);await c.query('UPDATE entries SET name=$1 WHERE account_id=$2',[name,target.id]);await audit(c,u,'account.name',target.id,{name});return {name};
      }
      if(action==='role'||action==='disable'){
       if(current.role!=='owner'||target.role==='owner')fail('Only the owner can manage other users’ roles and account access.',403);
       if(action==='role'){if(!['admin','member'].includes(b.role))fail('Choose member or admin.');await c.query('UPDATE accounts SET role=$1 WHERE id=$2',[b.role,target.id]);}
       else {if(typeof b.disabled!=='boolean')fail('Invalid account status.');await c.query('UPDATE accounts SET disabled=$1 WHERE id=$2',[b.disabled,target.id]);}
       await c.query('DELETE FROM account_sessions WHERE account_id=$1',[target.id]);await c.query('DELETE FROM account_resets WHERE account_id=$1',[target.id]);await audit(c,u,'account.'+action,target.id,{role:b.role,disabled:b.disabled});return {};
      }
      if(action==='reset-link'){
       if(target.role==='owner'||(current.role!=='owner'&&target.role!=='member'))fail('You cannot reset this account.',403);
       const value=token();await c.query('DELETE FROM account_resets WHERE account_id=$1',[target.id]);await c.query('INSERT INTO account_resets(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[digest(value),target.id,new Date(now()+3600000)]);await audit(c,u,'account.reset_link',target.id);return {resetToken:value};
      }
      fail('Unknown account action.');
     });
    }
   }
   res.status(200).json({...result,serverTime:new Date(now()).toISOString()});
  }catch(e){res.status(e.status||500).json({error:e.status?'account_error':'server_error',message:e.status?e.message:'Could not complete that request. Please try again.'});}
 }
 return {user,checkRequest,handler};
}
module.exports={createAccounts,passwordHash,passwordMatches};
