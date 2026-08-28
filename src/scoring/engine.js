(function(){
"use strict";

/* ---------------- storage (safe: falls back to memory if blocked) --------- */
var mem={};
var store={
  get:function(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):(mem[k]!==undefined?mem[k]:d);}catch(e){return mem[k]!==undefined?mem[k]:d;}},
  set:function(k,v){mem[k]=v;try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  del:function(k){delete mem[k];try{localStorage.removeItem(k);}catch(e){}}
};

/* ---------------- live channel for second screen -------------------------- */
var chan=null;
try{ if('BroadcastChannel' in window) chan=new BroadcastChannel('snooker-score'); }catch(e){}

var COLOURS=[
  {v:2,cls:'b-yellow',name:'Yellow'},
  {v:3,cls:'b-green',name:'Green'},
  {v:4,cls:'b-brown',name:'Brown'},
  {v:5,cls:'b-blue',name:'Blue'},
  {v:6,cls:'b-pink',name:'Pink'},
  {v:7,cls:'b-black',name:'Black'}
];
var BESTOF=[1,3,5,7,9,11,19];

/* ---------------- state --------------------------------------------------- */
var S=null;            // main app state
var modal=null;        // {type:'foul'|'winner'|'menu'}
var isTV=/[?&]tv=1/.test(location.search);

function freshFrame(breaker){
  return {score:[0,0],active:breaker,brk:0,reds:15,finalColours:false,pendingFinal:false,
          colours:[2,3,4,5,6,7],frameHigh:[0,0],safeties:[0,0],fouls:[0,0]};
}
function newMatch(a,b,bestOf){
  return {screen:'match',players:[a,b],bestOf:bestOf,breaker:0,
    framesWon:[0,0],matchHigh:[0,0],centuries:[0,0],fifties:[0,0],
    mSafeties:[0,0],mFouls:[0,0],mPoints:[0,0],
    frame:freshFrame(0),history:[],lastPot:-1};
}
function framesToWin(){return Math.floor(S.bestOf/2)+1;}
function totalFramesPlayed(){return S.framesWon[0]+S.framesWon[1];}

/* ---------------- scoring maths ------------------------------------------- */
function remaining(f){
  if(f.finalColours){var s=0;for(var i=0;i<f.colours.length;i++)s+=f.colours[i];return s;}
  return f.reds*8+27;
}
function onColourValue(f){ // in final colours, the ball "on" is lowest remaining
  return f.colours.length? f.colours[0] : 0;
}

/* ---------------- undo ---------------------------------------------------- */
function snapshot(){
  S.history.push(JSON.stringify({frame:S.frame,framesWon:S.framesWon,matchHigh:S.matchHigh,
    centuries:S.centuries,fifties:S.fifties,mSafeties:S.mSafeties,mFouls:S.mFouls,
    mPoints:S.mPoints,breaker:S.breaker,screen:S.screen}));
  if(S.history.length>120)S.history.shift();
}
function undo(){
  if(!S.history.length)return;
  var snap=JSON.parse(S.history.pop());
  S.frame=snap.frame;S.framesWon=snap.framesWon;S.matchHigh=snap.matchHigh;
  S.centuries=snap.centuries;S.fifties=snap.fifties;S.mSafeties=snap.mSafeties;
  S.mFouls=snap.mFouls;S.mPoints=snap.mPoints;S.breaker=snap.breaker;S.screen=snap.screen;
  S.lastPot=-1;commit();
}

/* ---------------- actions ------------------------------------------------- */
function finalizeBreak(p){
  var b=S.frame.brk;
  if(b>S.frame.frameHigh[p])S.frame.frameHigh[p]=b;
  if(b>S.matchHigh[p])S.matchHigh[p]=b;
  if(b>=100)S.centuries[p]++; else if(b>=50)S.fifties[p]++;
  S.frame.brk=0;
}
function pot(value){
  var f=S.frame,p=f.active;
  snapshot();
  f.score[p]+=value; f.brk+=value;
  if(f.brk>S.matchHigh[p])S.matchHigh[p]=f.brk;
  if(!f.finalColours){
    if(value===1){ if(f.reds>0)f.reds--; if(f.reds===0)f.pendingFinal=true; }
    else { if(f.pendingFinal){ f.finalColours=true; f.pendingFinal=false; } } // colour after last red re-spots, then sequence
  } else {
    if(f.colours.length)f.colours.shift(); // clear the ball that was "on"
  }
  S.lastPot=p; commit(true);
}
function passTurn(){ var f=S.frame; if(f.pendingFinal){f.finalColours=true;f.pendingFinal=false;} f.active=1-f.active; }
function endTurn(){ snapshot(); finalizeBreak(S.frame.active); passTurn(); S.lastPot=-1; commit(); }
function safety(){ snapshot(); S.frame.safeties[S.frame.active]++; finalizeBreak(S.frame.active); passTurn(); S.lastPot=-1; commit(); }
function foul(value){
  snapshot();
  var f=S.frame,striker=f.active,opp=1-striker;
  finalizeBreak(striker);
  f.score[opp]+=value; f.fouls[striker]++;
  if(f.pendingFinal){f.finalColours=true;f.pendingFinal=false;}
  f.active=opp; S.lastPot=-1; modal=null; commit();
}
function tryEndFrame(){
  var f=S.frame;
  if(f.score[0]===f.score[1]){ modal={type:'winner'}; commit(); return; }
  awardFrame(f.score[0]>f.score[1]?0:1);
}
function awardFrame(w){
  var f=S.frame;
  if(f.brk>0)finalizeBreak(f.active);
  S.framesWon[w]++;
  for(var p=0;p<2;p++){S.mPoints[p]+=f.score[p];S.mSafeties[p]+=f.safeties[p];S.mFouls[p]+=f.fouls[p];}
  modal=null;
  if(S.framesWon[w]===framesToWin()){ endMatch(w); return; }
  S.breaker=1-S.breaker; S.frame=freshFrame(S.breaker); S.history=[]; S.lastPot=-1; commit();
}
function endMatch(w){
  S.screen='result'; S.winner=w; S.history=[];
  saveStats(w); rememberPlayers(); store.del('match'); commit();
}

/* ---------------- persistence of stats ------------------------------------ */
function keyFor(n){return (n||'').trim().toLowerCase();}
function saveStats(w){
  var stats=store.get('stats',{});
  var frames=totalFramesPlayed();
  for(var p=0;p<2;p++){
    var name=S.players[p]||('Player '+(p+1));
    var k=keyFor(name); if(!k)continue;
    var st=stats[k]||{name:name,mp:0,mw:0,fp:0,fw:0,hb:0,c:0,f50:0,saf:0,foul:0,pts:0};
    st.name=name; st.mp++; st.fp+=frames; st.fw+=S.framesWon[p]; if(p===w)st.mw++;
    if(S.matchHigh[p]>st.hb)st.hb=S.matchHigh[p];
    st.c+=S.centuries[p]; st.f50+=S.fifties[p]; st.saf+=S.mSafeties[p];
    st.foul+=S.mFouls[p]; st.pts+=S.mPoints[p];
    stats[k]=st;
  }
  store.set('stats',stats);
}
function rememberPlayers(){
  var list=store.get('players',[]);
  [S.players[0],S.players[1]].forEach(function(n){
    n=(n||'').trim(); if(!n)return;
    list=list.filter(function(x){return x.toLowerCase()!==n.toLowerCase();});
    list.unshift(n);
  });
  store.set('players',list.slice(0,12));
}

/* ---------------- commit / persist / broadcast ---------------------------- */
function commit(bump){
  keepAwake(!!(S && S.screen==='match'));
  if(S.screen==='match'||S.screen==='result')store.set('match',S);
  render(bump);
  broadcastLive();
}
function liveData(){
  if(!S)return null;
  var f=S.frame;
  var d={screen:S.screen,players:S.players,framesWon:S.framesWon,bestOf:S.bestOf,
    frameNo:totalFramesPlayed()+1,ftw:framesToWin()};
  if(S.screen==='result'){d.winner=S.winner;}
  if(f){
    d.score=f.score;d.active=f.active;d.brk=f.brk;d.reds=f.reds;
    d.finalColours=f.finalColours;d.remaining=remaining(f);d.matchHigh=S.matchHigh;d.frameHigh=f.frameHigh;
  }
  return d;
}
function broadcastLive(){
  var d=liveData(); if(!d)return;
  store.set('live',d);
  try{ if(chan)chan.postMessage(d); }catch(e){}
}

/* ================= RENDERING ============================================== */
var app=null;

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function scoreboard(d,forTV){
  var behind=[0,0],snook=[0,0];
  if(d.score){
    var diff=d.score[0]-d.score[1], rem=d.remaining;
    for(var p=0;p<2;p++){
      var def=(p===0? -diff : diff);
      if(def>0){behind[p]=def; if(def>rem)snook[p]=Math.max(1,Math.ceil((def-rem)/8));}
    }
  }
  function nameBlock(p){
    var cls='pname'+(p===1?' r':'')+(d.active===p?' active':'');
    return '<div class="'+cls+'"><span class="dot"></span><span>'+esc(d.players[p]||('Player '+(p+1)))+'</span></div>';
  }
  function ptsBlock(p){
    var active=d.active===p;
    var meta='';
    if(snook[p]){meta='<div class="chip warn" style="justify-content:center"><span>Snookers</span><b>'+snook[p]+'</b></div>';}
    else if(behind[p]>0){meta='<div class="chip" style="justify-content:center"><span>Behind</span><b>'+behind[p]+'</b></div>';}
    else if(d.score && behind[1-p]>0){meta='<div class="chip" style="justify-content:center"><span>Ahead</span><b>'+behind[1-p]+'</b></div>';}
    var bumped=(S&&S.lastPot===p&&!forTV)?' bump':'';
    return '<div class="pcol'+(active?' active':'')+'">'
      +'<div class="pts'+(active?'':' dim')+bumped+'">'+(d.score?d.score[p]:0)+'</div>'
      +'<div class="under"></div>'+meta+'</div>';
  }
  var frameTag = d.screen==='result' ? 'FINAL' : ('Frame '+d.frameNo);
  return '<div class="board">'
    +'<div class="toprow">'+nameBlock(0)
      +'<div class="centre"><div class="frames">'+d.framesWon[0]+'<em>&ndash;</em>'+d.framesWon[1]+'</div>'
        +'<div class="bestof">Best of '+d.bestOf+'</div></div>'
      +nameBlock(1)+'</div>'
    +'<div class="scorerow">'+ptsBlock(0)
      +'<div class="framebadge">'+frameTag+'</div>'
      +ptsBlock(1)+'</div>'
    + (d.score ? ('<div class="metarow">'
        +'<div class="chip brk"><span>Break</span><b>'+d.brk+'</b></div>'
        +'<div class="chip"><span>High</span><b>'+Math.max(d.matchHigh[0],d.matchHigh[1])+'</b></div>'
        +'<div class="chip"><span>Reds</span><b>'+(d.finalColours?0:d.reds)+'</b></div>'
        +'<div class="chip"><span>Remaining</span><b>'+d.remaining+'</b></div>'
      +'</div>') : '')
    +'</div>';
}

function renderMatch(bump){
  var f=S.frame, d=liveData();
  var redDisabled=f.finalColours||f.reds===0;
  var coloursHTML=COLOURS.map(function(c){
    var dis=false, on=false;
    if(f.finalColours){ dis = c.v!==onColourValue(f); on = c.v===onColourValue(f); }
    return '<button class="ball '+c.cls+(on?' on':'')+'" data-a="pot" data-v="'+c.v+'"'
      +(dis?' disabled':'')+' aria-label="'+c.name+' '+c.v+'"><span>'+c.v+'</span></button>';
  }).join('');

  app.innerHTML =
    appbar()
    + scoreboard(d,false)
    + '<div class="rack">'
      + '<div class="breakline"><span class="lab">Break</span>'
        + '<span class="who">'+esc(S.players[f.active]||('Player '+(f.active+1)))+' at the table</span>'
        + '<span class="val">'+f.brk+'</span></div>'
      + '<button class="red-btn" data-a="pot" data-v="1"'+(redDisabled?' disabled':'')+'>Red <span class="v">+1 &middot; '+f.reds+' left</span></button>'
      + '<div class="colours">'+coloursHTML+'</div>'
      + '<div class="actions">'
        + '<button class="act danger" data-a="foul"><span>Foul</span><small>+ to opponent</small></button>'
        + '<button class="act" data-a="safety"><span>Safety</span><small>end visit</small></button>'
        + '<button class="act" data-a="endturn"><span>Miss</span><small>end visit</small></button>'
        + '<button class="act" data-a="undo"'+(S.history.length?'':' disabled')+'><span>Undo</span><small>last action</small></button>'
        + '<button class="act gold" data-a="endframe"><span>End frame</span><small>award</small></button>'
        + '<button class="act" data-a="tv"><span>TV screen</span><small>open display</small></button>'
      + '</div>'
      + '<div class="minirow">'
        + '<button class="link" data-a="stats">Statistics</button>'
        + '<button class="link" data-a="newmatch">New match</button>'
      + '</div>'
    + '</div>';

  if(bump && S.lastPot>=0){
    var el=app.querySelectorAll('.pts')[S.lastPot];
    if(el){el.classList.add('bump');setTimeout(function(){el.classList.remove('bump');},130);}
  }
  if(modal)renderModal();
}

function appbar(){
  return '<div class="appbar"><div class="brand"><div class="mark"></div><b>Snooker<span>&nbsp;Score</span></b></div>'
    +'<div class="spacer"></div>'
    +'<button class="ghost" data-a="stats">Stats</button>'
    +'<button class="ghost" data-a="tv">TV</button></div>';
}

function renderSetup(){
  var players=store.get('players',[]);
  var saved=store.get('match',null);
  var chips = players.length? '<div class="chips">'+players.map(function(n){
      return '<button class="pchip" data-a="fill" data-n="'+esc(n)+'">'+esc(n)+'</button>';
    }).join('')+'</div>' : '';
  var segs=BESTOF.map(function(n){
    return '<button class="seg'+(n===7?' sel':'')+'" data-a="bestof" data-v="'+n+'">'+n+'</button>';
  }).join('');
  var resume = (saved && saved.screen==='match') ?
    '<div class="resume"><div class="t">'+esc(saved.players[0])+' vs '+esc(saved.players[1])
      +'<small>Frames '+saved.framesWon[0]+'&ndash;'+saved.framesWon[1]+' &middot; best of '+saved.bestOf+'</small></div>'
      +'<button data-a="resume">Resume</button></div>' : '';

  app.innerHTML =
    appbar()
    + '<div class="panel">'
      + '<div class="eyebrow">Match setup</div>'
      + '<h1 class="title">Snooker Score</h1>'
      + '<div class="sub">Score frames, breaks and fouls live. Everything stays on this device &mdash; no account, no subscription.</div>'
      + '<div class="field"><label>Player 1</label><input id="p1" type="text" placeholder="Name" autocomplete="off"></div>'
      + '<div class="vs">v</div>'
      + '<div class="field"><label>Player 2</label><input id="p2" type="text" placeholder="Name" autocomplete="off"></div>'
      + chips
      + '<div class="field" style="margin-top:18px"><label>Match length &mdash; best of</label><div class="segrow">'+segs+'</div></div>'
      + '<button class="cta" data-a="start">Start match</button>'
      + resume
    + '</div>'
    + '<div class="setupfoot minirow"><button class="link" data-a="stats">View statistics</button></div>';
  setupBestOf=7;
}
var setupBestOf=7;

function renderResult(){
  var w=S.winner, l=1-w;
  app.innerHTML =
    appbar()
    + scoreboard(liveData(),false)
    + '<div class="panel result">'
      + '<div class="eyebrow">Match complete</div>'
      + '<div class="winner">'+esc(S.players[w])+'</div>'
      + '<div class="final">wins '+S.framesWon[w]+'&ndash;'+S.framesWon[l]+'</div>'
      + '<div class="rgrid">'
        + rcard('Highest break', Math.max(S.matchHigh[0],S.matchHigh[1]))
        + rcard('Centuries', S.centuries[0]+S.centuries[1])
        + rcard(esc(S.players[w])+' high', S.matchHigh[w])
        + rcard(esc(S.players[l])+' high', S.matchHigh[l])
      + '</div>'
      + '<button class="cta" data-a="newmatch">New match</button>'
      + '<div class="minirow" style="margin-top:12px"><button class="link" data-a="stats">View statistics</button></div>'
    + '</div>';
}
function rcard(k,v){return '<div class="rcard"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>';}

function renderStats(){
  var stats=store.get('stats',{});
  var rows=Object.keys(stats).map(function(k){return stats[k];})
    .sort(function(a,b){return (b.mw-a.mw)||(b.hb-a.hb);});
  var body;
  if(!rows.length){ body='<div class="empty">No matches played yet. Finish a match and player records show up here.</div>'; }
  else{
    body='<div class="statwrap"><table><thead><tr>'
      +'<th>Player</th><th>P</th><th>W</th><th>Win %</th><th>Frames</th><th>High</th><th>100s</th><th>50s</th><th>Safe</th><th>Fouls</th>'
      +'</tr></thead><tbody>'
      +rows.map(function(r){
        var wp=r.mp?Math.round(r.mw/r.mp*100):0;
        return '<tr><td>'+esc(r.name)+'</td><td>'+r.mp+'</td><td>'+r.mw+'</td><td>'+wp+'%</td>'
          +'<td>'+r.fw+'/'+r.fp+'</td><td>'+r.hb+'</td><td>'+r.c+'</td><td>'+r.f50+'</td>'
          +'<td>'+r.saf+'</td><td>'+r.foul+'</td></tr>';
      }).join('')
      +'</tbody></table></div>';
  }
  app.innerHTML =
    appbar()
    + '<div class="panel">'
      + '<div class="eyebrow">Player statistics</div>'
      + '<h1 class="title" style="font-size:clamp(28px,7vw,40px)">Records</h1>'
      + '<div class="sub">Lifetime totals across every match scored on this device.</div>'
      + body
      + '<div class="minirow" style="margin-top:16px">'
        + '<button class="link" data-a="back">Back</button>'
        + (rows.length?'<button class="link" data-a="clearstats" style="color:#f0a35a">Clear all stats</button>':'')
      + '</div>'
    + '</div>';
}

function renderModal(){
  var html='';
  if(modal.type==='foul'){
    html='<h3>Foul &mdash; award points to opponent</h3><div class="foulgrid">'
      +[4,5,6,7].map(function(v){
        var lab=v===4?'min':(v===5?'blue':(v===6?'pink':'black'));
        return '<button class="foulb" data-a="foulval" data-v="'+v+'">'+v+'<small>'+lab+'</small></button>';
      }).join('')
      +'</div><div class="row"><button class="btn-cancel" data-a="closemodal">Cancel</button></div>';
  } else if(modal.type==='winner'){
    html='<h3>Frame tied &mdash; who takes it?</h3>'
      +'<p class="note">Scores are level (re-spotted black). Choose the winner of the frame.</p>'
      +'<div class="winbtns">'
      +'<button class="winbtn" data-a="pickwin" data-v="0">'+esc(S.players[0])+'</button>'
      +'<button class="winbtn" data-a="pickwin" data-v="1">'+esc(S.players[1])+'</button>'
      +'</div><div class="row"><button class="btn-cancel" data-a="closemodal">Cancel</button></div>';
  } else if(modal.type==='newmatch'){
    html='<h3>Start a new match?</h3><p class="note">The current match will be discarded. Player stats are only saved when a match finishes.</p>'
      +'<div class="row"><button class="btn-cancel" data-a="closemodal">Keep playing</button>'
      +'<button class="btn-ok" data-a="confirmnew">New match</button></div>';
  } else if(modal.type==='clear'){
    html='<h3>Clear all statistics?</h3><p class="note">This permanently deletes every player record on this device. It can&rsquo;t be undone.</p>'
      +'<div class="row"><button class="btn-cancel" data-a="closemodal">Cancel</button>'
      +'<button class="btn-ok" data-a="confirmclear" style="background:#c0492e;color:#fff">Delete</button></div>';
  }
  var scrim=document.createElement('div');
  scrim.className='scrim'; scrim.id='scrim';
  scrim.innerHTML='<div class="modal">'+html+'</div>';
  scrim.addEventListener('click',function(e){if(e.target===scrim){modal=null;render();}});
  document.body.appendChild(scrim);
}

function render(bump){
  var old=document.getElementById('scrim'); if(old)old.remove();
  if(isTV){renderTV();return;}
  if(!S||S.screen==='setup'){renderSetup();}
  else if(S.screen==='match'){renderMatch(bump);}
  else if(S.screen==='result'){renderResult();}
  else if(S.screen==='stats'){renderStats();}
}

/* ---------------- TV window ----------------------------------------------- */
function renderTV(d){
  document.body.classList.add('tv');
  d=d||store.get('live',null);
  if(!d){app.innerHTML='<div class="panel result"><div class="eyebrow">Snooker Score</div><h1 class="title" style="font-size:clamp(28px,7vw,44px)">Waiting for match&hellip;</h1><div class="sub">Start scoring on the controller and it appears here.</div></div>';return;}
  app.innerHTML=scoreboard(d,true);
}
window.exitTV=function(){
  if(isTV){ try{window.close();}catch(e){} location.search=''; return; }
  setTVMode(false);
};

/* ---------------- events -------------------------------------------------- */
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-a]'); if(!t)return;
  var a=t.getAttribute('data-a'), v=t.getAttribute('data-v'), n=t.getAttribute('data-n');
  switch(a){
    case 'fill': var p1=document.getElementById('p1'),p2=document.getElementById('p2');
      if(p1&&!p1.value.trim())p1.value=n; else if(p2&&!p2.value.trim())p2.value=n; break;
    case 'bestof':
      setupBestOf=parseInt(v,10);
      var segs=document.querySelectorAll('.seg'); segs.forEach(function(s){s.classList.toggle('sel',parseInt(s.getAttribute('data-v'),10)===setupBestOf);});
      break;
    case 'start':
      var a1=(document.getElementById('p1').value||'').trim()||'Player 1';
      var a2=(document.getElementById('p2').value||'').trim()||'Player 2';
      S=newMatch(a1,a2,setupBestOf); commit(); break;
    case 'resume': S=store.get('match',null); if(S){isTV=false; commit();} break;
    case 'pot': pot(parseInt(v,10)); break;
    case 'foul': modal={type:'foul'}; render(); break;
    case 'foulval': foul(parseInt(v,10)); break;
    case 'safety': safety(); break;
    case 'endturn': endTurn(); break;
    case 'undo': undo(); break;
    case 'endframe': tryEndFrame(); break;
    case 'pickwin': awardFrame(parseInt(v,10)); break;
    case 'tv': openTV(); break;
    case 'stats': S=S||{}; S.screen='stats'; render(); break;
    case 'back': if(S&&S.players){S.screen=store.get('match',null)?(store.get('match').screen):'setup'; if(!S.screen)S.screen='setup';} else {S=null;} render(); break;
    case 'newmatch': modal={type:'newmatch'}; render(); break;
    case 'confirmnew': modal=null; store.del('match'); S=null; render(); break;
    case 'clearstats': modal={type:'clear'}; render(); break;
    case 'confirmclear': store.del('stats'); modal=null; renderStats(); break;
    case 'closemodal': modal=null; render(); break;
  }
});

function setTVMode(on){
  document.body.classList.toggle('tv', on);
  if(on){ renderTV(liveData()); lockLandscape(); }
  else { render(); unlockOrientation(); }
}
function openTV(){
  // Native Android: no popup windows -> fullscreen in-app scoreboard
  if(window.__NATIVE__){ setTVMode(!document.body.classList.contains('tv')); return; }
  var w;
  try{ w=window.open(location.pathname+'?tv=1','snookerTV'); }catch(e){}
  if(!w){ setTVMode(!document.body.classList.contains('tv')); return; }
  broadcastLive();
}
function lockLandscape(){ try{ if(window.__ORIENT__)window.__ORIENT__('landscape'); }catch(e){} }
function unlockOrientation(){ try{ if(window.__ORIENT__)window.__ORIENT__('unlock'); }catch(e){} }

/* ---------------- live subscription (TV side) ----------------------------- */
if(chan){ chan.onmessage=function(ev){ if(isTV||document.body.classList.contains('tv'))renderTV(ev.data); }; }
window.addEventListener('storage',function(e){ if(e.key==='snooker-score/live'){} });

/* ---------------- boot ---------------------------------------------------- */
var _wl=null;
function keepAwake(on){
  try{
    if(on && !_wl && navigator.wakeLock){ navigator.wakeLock.request('screen').then(function(s){_wl=s;}).catch(function(){}); }
    if(!on && _wl){ _wl.release().catch(function(){}); _wl=null; }
  }catch(e){}
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='visible' && S && S.screen==='match') keepAwake(true);
});

function boot(){
  if(isTV){ renderTV(); return; }
  var saved=store.get('match',null);
  if(saved && (saved.screen==='match')){ S=saved; render(); }
  else { renderSetup(); }
}
window.__snooker = {
  isTV:function(){ return document.body.classList.contains('tv'); },
  exitTV:function(){ setTVMode(false); },
  hasModal:function(){ return !!modal; },
  closeModal:function(){ modal=null; render(); },
  screen:function(){ return S? S.screen : 'setup'; },
  goSetup:function(){ if(S){S.screen='stats';} modal={type:'newmatch'}; render(); },
  // Mount into the element React gives us, then boot as before.
  mount:function(el,opts){
    app = el;
    isTV = !!(opts && opts.tv);
    boot();
  },
  unmount:function(){
    keepAwake(false);
    app = null;
  }
};

})();
