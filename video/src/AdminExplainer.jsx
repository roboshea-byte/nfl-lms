import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const gold = '#ffc733';
const navy = '#071a43';
const white = '#ffffff';
const muted = '#c7d2ec';
const head = 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif';
const body = 'Inter, Arial, sans-serif';

const scenes = [
  {image:'01-register-empty.png',duration:180,step:'1',title:'Start with Register',detail:'New users click Register. Sign in is only for people who already have an account.',x:835,y:225,caption:'bottom'},
  {image:'02-register-filled.png',duration:180,step:'1',title:'Enter all four details',detail:'Add first name, last name, email and a password of at least seven characters. Then click Register and create account.',x:960,y:816,caption:'top'},
  {image:'03-member-dashboard.png',duration:180,step:'2',title:'Every sign-up creates Entry 1',detail:'The entry starts inactive and unpaid. Its pick deadline is always shown at the top of the dashboard.',x:1686,y:42,caption:'bottom',label:'Account'},
  {image:'04-member-account.png',duration:180,step:'2',title:'Members can add more entries',detail:'Click Add another entry. Each numbered entry has its own payment, current pick, history and remaining teams.',x:964,y:260,caption:'bottom'},
  {image:'05-admin-home.png',duration:180,step:'3',title:'Open the Admin area',detail:'The owner sees every tool here. Use these cards or the navigation bar to move between admin jobs.',x:322,y:505,caption:'bottom',label:'Entries & payments'},
  {image:'06-members-before-role.png',duration:180,step:'4',title:'Assign an admin role',detail:'Open Members & roles, find the person and change their Role menu from member to admin.',x:1235,y:436,caption:'bottom'},
  {image:'07-members-admin-role.png',duration:150,step:'4',title:'The role changes immediately',detail:'Admins can manage payments, members, picks and results. Only the owner can assign roles or import a spreadsheet.',x:1235,y:436,caption:'bottom',label:'admin'},
  {image:'08-entries-unpaid.png',duration:180,step:'5',title:'Approve each numbered entry',detail:'Open Entries & payments and click Mark paid beside the exact entry that has paid.',x:1065,y:851,caption:'top',label:'Mark paid'},
  {image:'09-entries-paid.png',duration:210,step:'5',title:'Paid entries become active',detail:'The Paid, status and prize-pot figures update together. Owner and admin entries must also be marked paid.',x:955,y:850,caption:'top',label:'Paid'},
  {image:'10-manage-picks.png',duration:180,step:'6',title:'Choose the member and week',detail:'Open Manage picks, select the week, then click Choose team on the correct numbered entry.',x:770,y:718,caption:'top',label:'Choose team'},
  {image:'11-team-picker.png',duration:240,step:'6',title:'Click the requested team',detail:'The real team grid shows the fixture and blocks used or bye teams. Here the admin selects Kansas City Chiefs.',x:1056,y:700,caption:'top',label:'Chiefs'},
  {image:'12-pick-confirmation.png',duration:150,step:'6',title:'Check before saving',detail:'Confirm the member, entry number, week and team, then click Save admin pick.',x:557,y:627,caption:'bottom',label:'Save admin pick'},
  {image:'13-pick-saved.png',duration:150,step:'6',title:'The selection is now recorded',detail:'Admins can use the same control to replace or clear a pick, including after the member deadline.',x:709,y:724,caption:'top',label:'Kansas City Chiefs'},
  {image:'14-results.png',duration:210,step:'7',title:'Update results carefully',detail:'Fetch live scores or enter them manually. Verify every game, mark finals, then check eliminations and standings.',x:192,y:354,caption:'bottom',label:'Fetch live scores'},
  {image:'15-announcement.png',duration:180,step:'8',title:'Post a member announcement',detail:'In Settings, write the message, choose its type and tick Show to members. Use this for payments, deadlines or updates.',x:316,y:426,caption:'bottom',label:'Show to members'},
  {image:'16-rollover-settings.png',duration:180,step:'8',title:'Check the rollover rule',detail:'A rollover restores all teams and players. Every entry must pay again; unpaid entries are eliminated.',x:470,y:824,caption:'top',label:'Rollover rule'},
  {image:'17-admin-guide.png',duration:210,step:'9',title:'Use the searchable Admin guide',detail:'Click Admin guide whenever you need a detailed answer. Search by task or open a category and question.',x:758,y:650,caption:'top',label:'Search the guide'},
];

const sceneFrames = scenes.reduce((total, scene) => total + scene.duration, 0);
export const totalFrames = 150 + sceneFrames + 120;

const fade = (frame, duration) => interpolate(frame,[0,12,duration-12,duration],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

const Progress = ({number}) => <div style={{position:'absolute',left:0,right:0,top:0,height:8,background:'rgba(0,0,0,.35)'}}><div style={{height:'100%',width:`${(Number(number)/9)*100}%`,background:gold}}/></div>;

const Cursor = ({x,y,label}) => {
  const frame=useCurrentFrame();
  const enter=interpolate(frame,[12,54],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)});
  const pulse=interpolate(frame%56,[0,16,30,56],[0.35,1,0.35,0.35]);
  const clickScale=interpolate(pulse,[0.35,1],[0.7,1.35]);
  return <div style={{position:'absolute',left:x,top:y,transform:`translate(${(1-enter)*-150}px,${(1-enter)*90}px)`,opacity:enter}}>
    <div style={{position:'absolute',width:84,height:84,left:-42,top:-42,borderRadius:999,border:`6px solid ${gold}`,transform:`scale(${clickScale})`,opacity:1.15-pulse,boxShadow:'0 0 0 10px rgba(255,199,51,.16)'}}/>
    <svg width="58" height="70" viewBox="0 0 58 70" style={{position:'absolute',left:-8,top:-8,filter:'drop-shadow(0 6px 5px rgba(0,0,0,.55))'}}><path d="M5 3 L51 42 L31 44 L41 64 L29 69 L19 48 L5 61 Z" fill="#fff" stroke="#071126" strokeWidth="4"/></svg>
    {label?<div style={{position:'absolute',left:54,top:38,whiteSpace:'nowrap',borderRadius:999,background:gold,color:'#071126',padding:'9px 15px',font:`800 18px ${body}`,boxShadow:'0 8px 24px rgba(0,0,0,.32)'}}>{label}</div>:null}
  </div>;
};

const Caption = ({step,title,detail,position}) => {
  const frame=useCurrentFrame();
  const show=interpolate(frame,[0,20],[0,1],{extrapolateRight:'clamp'});
  return <div style={{position:'absolute',left:42,right:42,[position==='top'?'top':'bottom']:34,display:'flex',alignItems:'center',gap:22,padding:'18px 24px',borderRadius:18,border:'2px solid rgba(255,199,51,.72)',background:'rgba(5,18,48,.94)',boxShadow:'0 18px 54px rgba(0,0,0,.4)',opacity:show,transform:`translateY(${(1-show)*(position==='top'?-24:24)}px)`}}>
    <div style={{width:68,height:68,flex:'0 0 68px',borderRadius:15,background:gold,color:navy,display:'grid',placeItems:'center',font:`800 38px ${head}`}}>{step}</div>
    <div><div style={{color:white,font:`800 34px/1.05 ${head}`,textTransform:'uppercase',letterSpacing:1}}>{title}</div><div style={{color:muted,font:`500 21px/1.4 ${body}`,marginTop:5}}>{detail}</div></div>
  </div>;
};

const WalkScene = ({scene}) => {
  const frame=useCurrentFrame();
  const scale=interpolate(frame,[0,scene.duration],[1,1.025],{extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:navy,opacity:fade(frame,scene.duration),overflow:'hidden'}}>
    <Img src={staticFile(`site/${scene.image}`)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${scale})`,transformOrigin:`${scene.x}px ${scene.y}px`}}/>
    <Progress number={scene.step}/><Cursor x={scene.x} y={scene.y} label={scene.label}/><Caption step={scene.step} title={scene.title} detail={scene.detail} position={scene.caption}/>
  </AbsoluteFill>;
};

const Title = () => {
  const frame=useCurrentFrame();
  const show=interpolate(frame,[8,35],[0,1],{extrapolateRight:'clamp'});
  return <AbsoluteFill style={{opacity:fade(frame,150),background:navy}}>
    <Img src={staticFile('site/05-admin-home.png')} style={{width:'100%',height:'100%',objectFit:'cover',filter:'brightness(.28) blur(2px)',transform:'scale(1.02)'}}/>
    <AbsoluteFill style={{display:'grid',placeItems:'center',background:'linear-gradient(135deg,rgba(4,14,37,.82),rgba(11,35,82,.66))'}}><div style={{textAlign:'center',opacity:show,transform:`translateY(${(1-show)*30}px)`}}>
      <Img src={staticFile('app-icon-192.png')} style={{width:126,height:126,borderRadius:26,boxShadow:'0 18px 55px rgba(0,0,0,.45)'}}/>
      <div style={{font:`800 78px/.98 ${head}`,color:white,textTransform:'uppercase',letterSpacing:2,marginTop:24}}>NFL LMS <span style={{color:gold}}>Admin Walkthrough</span></div>
      <div style={{font:`600 27px ${body}`,color:muted,marginTop:20}}>The actual app, from registration to weekly administration</div>
      <div style={{display:'inline-block',font:`800 18px ${body}`,color:navy,background:gold,borderRadius:999,padding:'11px 18px',marginTop:24}}>FOLLOW THE CURSOR AND ON-SCREEN LABELS</div>
    </div></AbsoluteFill>
  </AbsoluteFill>;
};

const Outro = () => {
  const frame=useCurrentFrame();
  const show=interpolate(frame,[0,24],[0,1],{extrapolateRight:'clamp'});
  return <AbsoluteFill style={{opacity:fade(frame,120),background:navy}}>
    <Img src={staticFile('site/17-admin-guide.png')} style={{width:'100%',height:'100%',objectFit:'cover',filter:'brightness(.26) blur(2px)',transform:'scale(1.02)'}}/>
    <AbsoluteFill style={{display:'grid',placeItems:'center',background:'rgba(4,15,39,.7)'}}><div style={{textAlign:'center',opacity:show}}>
      <div style={{font:`800 66px ${head}`,textTransform:'uppercase',color:white}}>You’re ready to run the competition</div>
      <div style={{font:`600 28px/1.5 ${body}`,color:muted,marginTop:15}}>Use Admin guide for detailed answers · Use Exit admin to return to your own dashboard</div>
      <div style={{font:`800 21px ${body}`,color:navy,background:gold,borderRadius:12,padding:'14px 22px',display:'inline-block',marginTop:30}}>Refresh before making changes if another admin has been working</div>
    </div></AbsoluteFill>
  </AbsoluteFill>;
};

export const AdminExplainer = () => {
  const {durationInFrames}=useVideoConfig();
  let from=150;
  return <AbsoluteFill style={{background:navy}}><Sequence durationInFrames={150}><Title/></Sequence>{scenes.map(scene=>{const start=from;from+=scene.duration;return <Sequence key={scene.image} from={start} durationInFrames={scene.duration}><WalkScene scene={scene}/></Sequence>;})}<Sequence from={durationInFrames-120} durationInFrames={120}><Outro/></Sequence></AbsoluteFill>;
};
