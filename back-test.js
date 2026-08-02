/* Enkore ERP — Back button regression suite.
   Runs the REAL shell navigation code from enkore-erp.html against a modelled
   history stack. The core invariant: exactly ONE history entry per visible
   step. Any frame load that adds an entry silently breaks Back. */
const fs=require('fs');
const SHELL='/sessions/compassionate-funny-hopper/mnt/ENKORE (1)/enkore-erp.html';
const src=fs.readFileSync(SHELL,'utf8');
const scripts=[...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const code=scripts.join('\n;\n');

let fails=0, passes=0;
function ok(c,m){ if(c){passes++; console.log('  ok   '+m);} else {fails++; console.log('  FAIL '+m);} }

// ── modelled history ──
const H={stack:[{erp:'exit'}], i:0, popHandlers:[]};
H.push=(s)=>{ H.stack=H.stack.slice(0,H.i+1); H.stack.push(s); H.i=H.stack.length-1; };
H.replace=(s)=>{ H.stack[H.i]=s; };
H.go=(n)=>{ const t=Math.max(0,Math.min(H.stack.length-1,H.i+n)); if(t===H.i) return;
  H.i=t; setTimeout(()=>H.popHandlers.forEach(f=>f({state:H.stack[H.i]})),0); };

function el(id){ return {id,style:{},textContent:'',innerHTML:'',className:'',
  classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)},toggle(c){this._s.has(c)?this._s.delete(c):this._s.add(c)}},
  appendChild(){},addEventListener(){},offsetHeight:100,offsetWidth:100,
  contentWindow:null, contentDocument:{body:{children:[1]},readyState:'complete'},
  _srcSets:0, set src(v){ this._srcSets++; FRAME_SRC_SETS++; this._src=v; }, get src(){return this._src;} }; }

let FRAME_SRC_SETS=0, FRAME_REPLACES=0;
const nodes={};
function getEl(id){ if(!nodes[id]){ nodes[id]=el(id);
    if(id==='pf0'||id==='pf1'){ nodes[id].contentWindow={location:{href:'about:blank',
      replace(u){ FRAME_REPLACES++; this.href=u; }}}; }
  } return nodes[id]; }

global.document={getElementById:getEl, querySelectorAll:()=>[], createElement:()=>el('x'),
  addEventListener(){}, body:{style:{},appendChild(){}}, documentElement:{style:{}}};
global.window={addEventListener(e,f){ if(e==='popstate') H.popHandlers.push(f); },
  location:{pathname:'/enkore-erp.html',search:'',hash:'',href:'x'}, matchMedia:()=>({matches:false})};
global.location=window.location;
global.history={ get length(){return H.stack.length;}, get state(){return H.stack[H.i];},
  pushState:(s)=>H.push(s), replaceState:(s)=>H.replace(s), go:(n)=>H.go(n), back:()=>H.go(-1) };
global.navigator={serviceWorker:{register:()=>Promise.resolve(),addEventListener(){}},onLine:true};
global.sessionStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
global.localStorage={_d:{},getItem(k){return this._d[k]||null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
global.requestAnimationFrame=f=>setTimeout(f,0);
global.frames=()=>[];
global.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})});

const sandbox={};
const EXPORT = "\n; this.__api={loadPanel:loadPanel,initHome:initHome,applyPanel:applyPanel,"
  + "setUser:function(u){currentUser=u;},"
  + "getOvDepth:function(){return ovDepth;},"
  + "ov:function(){window.__erpOv();},"
  + "ovClose:function(n){window.__erpOvClose(n);}};";
const run=new Function('with(this){'+code+EXPORT+'}');
try{ run.call(sandbox); }catch(e){ console.log('shell eval error:',e.message); }

const api=sandbox.__api;
const USER={id:'1011100002',name:'Anik',role:'ES',panels:[
  {file:'profile-s',name:'Profile (S)',icon:'x'},
  {file:'cash-s',name:'Cash (S)',icon:'x'},
  {file:'sales-entry',name:'Sales Entry',icon:'x'}]};

const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
console.log('\n1) Frame loads must never add history entries');
api.setUser(USER);
const before=H.stack.length;
api.initHome(); await wait(30);
ok(FRAME_SRC_SETS===0, 'first panel loaded via location.replace, f.src never assigned ('+FRAME_SRC_SETS+' src sets)');
ok(FRAME_REPLACES>0, 'frame actually navigated ('+FRAME_REPLACES+' replaces)');
ok(H.stack.length===2 && H.stack[0].erp==='exit' && H.stack[1].panel==='profile-s',
   'history after login = [exit][home], got ['+H.stack.map(s=>s.erp==='exit'?'exit':s.panel).join('][')+']');

console.log('\n2) Home -> other panel -> Back returns to home');
api.loadPanel('cash-s','Cash (S)',false); await wait(60);
ok(H.stack.length===3 && H.stack[H.i].panel==='cash-s', 'one entry added for the second panel');
const srcAfterNav=FRAME_SRC_SETS;
ok(srcAfterNav===0, 'panel switch added no f.src assignment');
history.back(); await wait(60);
ok(H.stack[H.i].panel==='profile-s', 'Back from second panel lands on HOME panel');

console.log('\n3) Third panel then Back still returns to home (one entry above home)');
api.loadPanel('cash-s','Cash (S)',false); await wait(60);
api.loadPanel('sales-entry','Sales Entry',false); await wait(60);
ok(H.stack.length===3, 'still exactly one entry above home, got '+H.stack.length);
history.back(); await wait(60);
ok(H.stack[H.i].panel==='profile-s', 'Back from third panel lands on HOME panel');

console.log('\n4) Popup entries unwind before the panel');
api.ov(); await wait(20);
ok(api.getOvDepth()===1 && H.stack[H.i].erp==='ov' && H.i===H.stack.length-1, 'popup pushed exactly one entry on top');
api.ovClose(1); await wait(60);
ok(api.getOvDepth()===0, 'popup close released its entry');
ok(H.stack[H.i].panel==='profile-s', 'still on home after popup closed');

console.log('\n5) Watchdog retry must not add entries');
const s0=FRAME_SRC_SETS;
getEl('pf0').contentDocument={body:{children:[]},readyState:'complete'};
getEl('pf0').contentWindow.location.href='about:blank';
await wait(1400);
ok(FRAME_SRC_SETS===s0, 'stuck-frame retry used replace, not f.src');

console.log('\n'+(fails?('FAILED '+fails+' check(s), '+passes+' passed'):('ALL '+passes+' CHECKS PASSED')));
process.exit(fails?1:0);
})();
