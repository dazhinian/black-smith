// CDP-driven screenshot for index.html with diagnostic dump.
// Usage: node cdp_shot.js "<query>" <output.png> [wait_ms]
const cp=require('child_process'),fs=require('fs'),http=require('http'),path=require('path');
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9222;
const FILE=path.resolve(__dirname,'index.html');
const URL='file:///'+FILE.replace(/\\/g,'/')+(process.argv[2]||'');
const OUT=path.resolve(process.argv[3]||'cdp.png');
const WAIT=parseInt(process.argv[4]||'3000',10);
const prof=path.join(__dirname,'.edge-prof-'+Date.now());
fs.mkdirSync(prof,{recursive:true});
const args=[
  '--headless=new','--disable-gpu','--enable-unsafe-swiftshader',
  '--use-gl=angle','--use-angle=swiftshader','--hide-scrollbars',
  '--force-device-scale-factor=1','--window-size=1280,800',
  `--user-data-dir=${prof}`,`--remote-debugging-port=${PORT}`,'about:blank'
];
const p=cp.spawn(EDGE,args,{stdio:'ignore'});
const WebSocket=require('ws');
function fetch(pth){return new Promise((res,rej)=>{
  http.get({host:'127.0.0.1',port:PORT,path:pth},r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res(b));}).on('error',rej);
});}
function rpc(ws,method,params={}){return new Promise(res=>{
  const id=Math.floor(Math.random()*1e6);
  const onm=e=>{const m=JSON.parse(e.data);if(m.id===id){ws.removeEventListener('message',onm);res(m.result||m.error);}};
  ws.addEventListener('message',onm);ws.send(JSON.stringify({id,method,params}));
});}
async function start(){
  for(let i=0;i<60;i++){try{await fetch('/json/version');break;}catch(_){await new Promise(r=>setTimeout(r,200));}}
  let tabs=JSON.parse(await fetch('/json'));
  let tab=tabs.find(t=>t.type==='page')||tabs[0];
  const ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(res=>ws.addEventListener('open',res));
  await rpc(ws,'Page.enable');await rpc(ws,'Runtime.enable');
  const loaded=new Promise(res=>{ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);if(m.method==='Page.loadEventFired')res();});});
  await rpc(ws,'Page.navigate',{url:URL});
  await Promise.race([loaded,new Promise(r=>setTimeout(r,8000))]);
  await new Promise(r=>setTimeout(r,500));
  await rpc(ws,'Emulation.setVirtualTimePolicy',{policy:'advance',budget:WAIT,
    waitForNavigation:false,maxVirtualTimeTaskStarvationCount:1000});
  await new Promise(r=>setTimeout(r,WAIT+800));
  const diag=await rpc(ws,'Runtime.evaluate',{expression:
    `(function(){try{return JSON.stringify(window._diag?window._diag():{noDiag:true});}catch(e){return 'ERR:'+e.message;}})()`,
    returnByValue:true});
  console.log('DIAG:',diag.result.value);
  const shot=await rpc(ws,'Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(OUT,Buffer.from(shot.data,'base64'));
  console.log('->',OUT,fs.statSync(OUT).size,'bytes');
  ws.close();p.kill('SIGTERM');setTimeout(()=>process.exit(0),300);
}
start().catch(e=>{console.error('ERR',e);try{p.kill();}catch(_){}process.exit(1);});
