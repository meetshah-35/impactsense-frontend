/* ═══════════════════════════════════
   ImpactSense v3 — app.js
   Homepage: world map + stats + events
═══════════════════════════════════ */

let allEvents = typeof CSV_EVENTS !== 'undefined' ? CSV_EVENTS : [];
let filtered  = [...allEvents];
let mapFilter = 'all';
let hoveredEv = null;
let curPage   = 1;
let autoTimer = null;
const PAGE    = 20;

const $  = id => document.getElementById(id);
const AC = {green:'#00e87a',yellow:'#f5c518',orange:'#ff7c2a',red:'#ff3b5c'};
const riskCol = m => m<4?'#00e87a':m<6?'#ff7c2a':'#ff3b5c';
const topAlert = list => {
  const r={red:4,orange:3,yellow:2,green:1};
  return list.reduce((b,e)=>r[e.alert]>r[b]?e.alert:b,'green');
};

/* UTC Clock */
setInterval(()=>{
  const el=$('utcClock'); if(!el) return;
  const n=new Date(),p=v=>String(v).padStart(2,'0');
  el.textContent=`${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())} UTC`;
},1000);

/* ── WAVE BG ── */
function initWave() {
  const cv=$('waveCanvas'); if(!cv) return;
  const ctx=cv.getContext('2d');
  let w,h,waves=[];
  function resize(){w=cv.width=cv.offsetWidth;h=cv.height=cv.offsetHeight;mkW();}
  function mkW(){
    waves=Array.from({length:7},(_,i)=>({
      amp:15+Math.random()*50,freq:.003+Math.random()*.009,
      phase:Math.random()*Math.PI*2,speed:.2+Math.random()*.6,
      y:(h/7)*(i+.5),neon:i%2===0,op:.04+Math.random()*.09
    }));
  }
  let t=0;
  function draw(){
    ctx.clearRect(0,0,w,h);t+=.006;
    for(const wv of waves){
      wv.phase+=wv.speed*.01;
      ctx.beginPath();
      ctx.strokeStyle=`rgba(${wv.neon?'0,255,200':'0,200,255'},${wv.op})`;
      ctx.lineWidth=1.1;
      for(let x=0;x<=w;x+=2){
        const b=Math.random()>.997?30:0;
        const y=wv.y+Math.sin(x*wv.freq+wv.phase+t)*wv.amp+Math.sin(x*wv.freq*2.1+t*1.3)*(wv.amp*.28)+b;
        x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }
  resize();window.addEventListener('resize',resize);draw();
}

/* ── WORLD MAP ── */
const LAND=[
  [[-167,71],[-141,70],[-124,60],[-124,48],[-117,32],[-95,26],[-87,28],[-80,25],[-76,34],[-70,42],[-66,44],[-60,46],[-53,47],[-55,50],[-60,55],[-64,60],[-68,63],[-75,62],[-83,56],[-88,52],[-96,55],[-102,58],[-110,60],[-120,58],[-128,54],[-132,56],[-138,60],[-150,61],[-158,57],[-162,60],[-164,63],[-166,68],[-167,71]],
  [[-80,-5],[-75,-2],[-60,5],[-52,4],[-42,-5],[-35,-8],[-35,-12],[-38,-18],[-44,-24],[-50,-30],[-57,-38],[-60,-42],[-65,-50],[-66,-54],[-68,-55],[-66,-56],[-70,-46],[-72,-38],[-70,-28],[-70,-18],[-74,-10],[-80,-5]],
  [[28,42],[30,45],[28,48],[24,50],[20,55],[18,58],[14,58],[10,58],[6,58],[2,56],[-2,52],[-4,48],[-6,44],[-2,44],[2,44],[8,44],[12,44],[14,40],[18,40],[20,40],[24,44],[28,42]],
  [[-18,15],[-6,16],[4,14],[8,12],[16,14],[24,12],[32,14],[40,12],[44,10],[46,8],[44,2],[40,-8],[36,-14],[34,-20],[30,-32],[26,-34],[22,-22],[18,-14],[8,-6],[0,2],[-4,4],[-8,6],[-12,10],[-18,15]],
  [[26,42],[28,46],[32,54],[36,56],[42,60],[46,62],[54,70],[60,68],[66,68],[72,68],[80,70],[88,72],[96,68],[104,64],[116,58],[120,56],[130,48],[134,44],[136,38],[134,32],[130,28],[126,24],[122,20],[110,18],[106,14],[100,6],[96,4],[92,6],[88,8],[76,10],[64,14],[60,18],[52,22],[48,18],[44,18],[40,16],[36,18],[32,28],[28,36],[26,42]],
  [[114,-22],[124,-16],[132,-12],[140,-14],[148,-18],[154,-26],[154,-30],[152,-34],[144,-38],[136,-34],[128,-32],[120,-30],[114,-26],[114,-22]],
  [[130,31],[134,34],[138,38],[140,40],[142,42],[142,44],[138,40],[134,36],[130,32],[130,31]],
  [[96,4],[106,6],[116,8],[124,4],[118,2],[110,0],[100,0],[96,4]],
  [[-6,50],[-2,52],[0,54],[-2,56],[-4,58],[-6,56],[-4,54],[-6,50]],
  [[-50,62],[-38,64],[-24,68],[-18,74],[-24,76],[-40,80],[-52,78],[-54,74],[-50,66],[-50,62]],
  [[4,56],[10,58],[10,62],[14,64],[22,68],[26,66],[22,62],[16,58],[12,56],[8,54],[4,56]],
  [[170,-34],[172,-38],[174,-40],[172,-44],[170,-44],[168,-42],[168,-38],[170,-34]],
];

const mX=(lng,w)=>((lng+180)/360)*w;
const mY=(lat,h)=>{const r=lat*Math.PI/180,p=Math.log(Math.tan(Math.PI/4+r/2));return(h/2)-(h*p)/(2*Math.PI*.85);};

let mapCv,mapCtx,mapW,mapH;

function drawMap(filter){
  if(!mapCv||!mapCtx)return;
  const ctx=mapCtx,w=mapW,h=mapH;
  ctx.clearRect(0,0,w,h);
  // Ocean
  const oc=ctx.createLinearGradient(0,0,0,h);
  oc.addColorStop(0,'rgba(1,4,12,.98)');oc.addColorStop(1,'rgba(2,6,18,.98)');
  ctx.fillStyle=oc;ctx.fillRect(0,0,w,h);
  // Grid
  ctx.strokeStyle='rgba(0,255,200,.04)';ctx.lineWidth=.5;
  for(let lng=-180;lng<=180;lng+=30){ctx.beginPath();ctx.moveTo(mX(lng,w),0);ctx.lineTo(mX(lng,w),h);ctx.stroke();}
  for(let lat=-80;lat<=80;lat+=30){const y=mY(lat,h);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  // Equator
  ctx.strokeStyle='rgba(0,255,200,.1)';ctx.lineWidth=.8;
  ctx.setLineDash([6,8]);const eq=mY(0,h);ctx.beginPath();ctx.moveTo(0,eq);ctx.lineTo(w,eq);ctx.stroke();ctx.setLineDash([]);
  // Land
  for(const poly of LAND){
    ctx.beginPath();poly.forEach(([lng,lat],i)=>{const x=mX(lng,w),y=mY(lat,h);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.closePath();ctx.fillStyle='rgba(16,28,52,.9)';ctx.fill();
    ctx.strokeStyle='rgba(0,255,200,.16)';ctx.lineWidth=.7;ctx.stroke();
  }
  // Labels
  ctx.fillStyle='rgba(90,112,128,.45)';ctx.font=`${Math.max(9,w*.008)}px DM Mono,monospace`;ctx.textAlign='center';
  for(let lng=-150;lng<=150;lng+=60)ctx.fillText(`${lng>0?'+':''}${lng}°`,mX(lng,w),h-4);

  const evs=filter==='all'?allEvents:allEvents.filter(e=>e.alert===filter);
  const sorted=[...evs].sort((a,b)=>a.magnitude-b.magnitude);
  const t=performance.now()/1000;

  for(const e of sorted){
    const x=mX(e.lng,w),y=mY(e.lat,h);
    if(y<-20||y>h+20)continue;
    const col=AC[e.alert]||'#00e87a';
    const r=Math.max(3,Math.min(16,(e.magnitude-2)*1.9+3));
    const isH=hoveredEv&&hoveredEv.id===e.id;
    const pulse=isH?1:.5+Math.sin(t*2+e.id*.5)*.2;
    const grd=ctx.createRadialGradient(x,y,0,x,y,r*(isH?5:3.5));
    grd.addColorStop(0,col+(isH?'66':'44'));grd.addColorStop(1,col+'00');
    ctx.beginPath();ctx.arc(x,y,r*(isH?5:3.5),0,Math.PI*2);ctx.fillStyle=grd;ctx.fill();
    if(!isH){ctx.beginPath();ctx.arc(x,y,r*(1.5+pulse),0,Math.PI*2);ctx.strokeStyle=col+'33';ctx.lineWidth=.8;ctx.stroke();}
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=isH?col:col+'cc';ctx.fill();
    if(isH){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();}
  }

  // Filter count badges
  const c={green:0,yellow:0,orange:0,red:0};
  allEvents.forEach(e=>{if(c[e.alert]!==undefined)c[e.alert]++;});
  $('mcGreen')&&($('mcGreen').textContent=c.green);
  $('mcYellow')&&($('mcYellow').textContent=c.yellow);
  $('mcOrange')&&($('mcOrange').textContent=c.orange);
  $('mcRed')&&($('mcRed').textContent=c.red);
  $('mcAll')&&($('mcAll').textContent=allEvents.length);
}

function initMap(){
  mapCv=$('worldMap');if(!mapCv)return;
  mapCtx=mapCv.getContext('2d');
  const frame=$('mapFrame');
  function resize(){if(!frame)return;mapW=mapCv.width=frame.clientWidth;mapH=mapCv.height=Math.round(mapW*.5);drawMap(mapFilter);}

  const tip=$('mapTooltip'),coords=$('mapCoords'),info=$('mapInfo');
  mapCv.addEventListener('mousemove',e=>{
    const rect=mapCv.getBoundingClientRect();
    const sx=mapW/rect.width,sy=mapH/rect.height;
    const mx=(e.clientX-rect.left)*sx,my=(e.clientY-rect.top)*sy;
    const lng=(mx/mapW)*360-180;
    const rLat=(my-mapH/2)/(-mapH/(2*Math.PI*.85));
    const lat=(Math.atan(Math.exp(rLat))-Math.PI/4)*(360/Math.PI);
    if(coords)coords.textContent=`LAT ${lat.toFixed(1)}° / LNG ${lng.toFixed(1)}°`;
    const evs=mapFilter==='all'?allEvents:allEvents.filter(ev=>ev.alert===mapFilter);
    let found=null,minD=Infinity;
    for(const ev of evs){
      const ex=mX(ev.lng,mapW),ey=mY(ev.lat,mapH);
      const r=Math.max(3,Math.min(16,(ev.magnitude-2)*1.9+3));
      const d=Math.sqrt((mx-ex)**2+(my-ey)**2);
      if(d<r*4&&d<minD){minD=d;found=ev;}
    }
    if(found!==hoveredEv){hoveredEv=found;drawMap(mapFilter);}
    if(found&&tip){
      const dx=e.clientX-rect.left,dy=e.clientY-rect.top;
      tip.style.left=dx>rect.width*.65?'auto':`${dx+14}px`;
      tip.style.right=dx>rect.width*.65?`${rect.width-dx+14}px`:'auto';
      tip.style.top=dy>rect.height*.65?'auto':`${dy+12}px`;
      tip.style.bottom=dy>rect.height*.65?`${rect.height-dy+12}px`:'auto';
      tip.classList.add('show');
      $('ttLoc').textContent=found.location;$('ttLoc').style.color=AC[found.alert];
      $('ttMag').textContent=`M ${found.magnitude.toFixed(1)}`;
      $('ttDepth').textContent=`${found.depth.toFixed(0)} km`;
      $('ttAlert').textContent=found.alert.toUpperCase();$('ttAlert').style.color=AC[found.alert];
      $('ttSig').textContent=Math.round(found.sig);
      if(info)info.textContent=`${found.location} · M${found.magnitude.toFixed(1)} · ${found.alert.toUpperCase()}`;
    } else {if(tip)tip.classList.remove('show');if(info)info.textContent='HOVER OVER A DOT FOR DETAILS';}
  });
  mapCv.addEventListener('mouseleave',()=>{hoveredEv=null;drawMap(mapFilter);if($('mapTooltip'))$('mapTooltip').classList.remove('show');if(coords)coords.textContent='LAT — / LNG —';});
  mapCv.addEventListener('click',()=>{if(hoveredEv)openModal(hoveredEv);});

  document.querySelectorAll('.mc-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.mc-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');mapFilter=btn.dataset.f;hoveredEv=null;drawMap(mapFilter);
    });
  });
  window.addEventListener('resize',resize);
  resize();
  (function anim(){drawMap(mapFilter);requestAnimationFrame(anim);})();
}

/* ── GAUGE ── */
function updateGauge(pct){
  const f=$('gaugeFill');if(!f)return;
  f.style.strokeDashoffset=String(276-(pct/100)*276);
  const n=$('gaugeNeedle');if(n)n.style.transform=`rotate(${-90+pct*1.8}deg)`;
  if($('riskIndex'))$('riskIndex').textContent=Math.round(pct);
}

/* ── CHIPS ── */
function renderChips(list){
  const el=$('alertChips');if(!el)return;
  const c={green:0,yellow:0,orange:0,red:0};
  list.forEach(e=>{if(c[e.alert]!==undefined)c[e.alert]++;});
  el.innerHTML=Object.entries(c).map(([k,v])=>`
    <div class="ac" style="border-color:${AC[k]}30;background:${AC[k]}08">
      <span class="ac-count" style="color:${AC[k]}">${v}</span>
      <span class="ac-lbl mono" style="color:${AC[k]}aa">${k.toUpperCase()}</span>
    </div>`).join('');
}

/* ── SUMMARY ── */
function updateSummary(list){
  const n=list.length;
  const maxMag=n?Math.max(...list.map(e=>e.magnitude)):0;
  const avgDepth=n?Math.round(list.reduce((a,e)=>a+e.depth,0)/n):0;
  const alert=topAlert(list);
  const pct=Math.min(100,(maxMag/9.5)*100);
  const avgCdi=n?(list.reduce((a,e)=>a+e.cdi,0)/n).toFixed(1):'0.0';
  const avgMmi=n?(list.reduce((a,e)=>a+e.mmi,0)/n).toFixed(1):'0.0';
  const risk=maxMag<4?'LOW':maxMag<6?'MODERATE':maxMag<7?'HIGH':'SEVERE';
  const set=(id,v)=>{const el=$(id);if(el)el.textContent=v;};
  const sc=(id,c)=>{const el=$(id);if(el)el.style.color=c;};
  set('stEvents',n);set('stMaxMag',maxMag.toFixed(1));set('stDepth',avgDepth);
  set('stAlert',alert.toUpperCase());sc('stAlert',AC[alert]);
  set('stCdi',avgCdi);set('stMmi',avgMmi);
  if($('riskBar'))$('riskBar').style.width=`${Math.max(1,pct)}%`;
  if($('rbarPct'))$('rbarPct').textContent=`${Math.round(pct)}%`;
  updateGauge(pct);
  if($('riskLabel')){$('riskLabel').textContent=`${risk} RISK`;sc('riskLabel',riskCol(maxMag));}
  set('hTotal',n);set('hMaxMag',maxMag.toFixed(1));
  if($('hRisk')){$('hRisk').textContent=risk;sc('hRisk',riskCol(maxMag));}
  const now=new Date(),p=v=>String(v).padStart(2,'0');
  set('hTime',`${p(now.getHours())}:${p(now.getMinutes())}`);
  set('lastUpdated',`UPDATED ${now.toLocaleTimeString()}`);
  const sd=$('sysDot'),sl=$('sysLbl');
  if(alert==='red'||alert==='orange'){
    if(sd){sd.style.background=AC[alert];sd.style.boxShadow=`0 0 12px ${AC[alert]}`;}
    if(sl){sl.textContent=alert==='red'?'CRITICAL':'WARNING';sl.style.color=AC[alert];}
  } else {
    if(sd){sd.style.background='#00e87a';sd.style.boxShadow='0 0 10px rgba(0,232,122,.9)';}
    if(sl){sl.textContent='NOMINAL';sl.style.color='#00e87a';}
  }
  renderChips(list);renderHisto(list);
}

/* ── HISTOGRAM ── */
function renderHisto(list){
  const el=$('histo');if(!el)return;
  const bins=[{r:'<4',min:0,max:4},{r:'4-5',min:4,max:5},{r:'5-6',min:5,max:6},{r:'6-7',min:6,max:7},{r:'7-8',min:7,max:8},{r:'8+',min:8,max:99}];
  const counts=bins.map(b=>list.filter(e=>e.magnitude>=b.min&&e.magnitude<b.max).length);
  const maxC=Math.max(...counts,1);
  el.innerHTML=bins.map((b,i)=>`
    <div class="hb-w">
      <div class="hb" style="height:${Math.max(3,Math.round((counts[i]/maxC)*60))}px"></div>
      <span class="hb-l">${b.r}</span>
      <span class="hb-l" style="color:var(--text)">${counts[i]}</span>
    </div>`).join('');
}

/* ── EVENTS TABLE ── */
function renderEvents(list,pg){
  const body=$('eventsBody');if(!body)return;
  const start=(pg-1)*PAGE;
  const rows=list.slice(start,start+PAGE);
  if(!rows.length){body.innerHTML='<div style="padding:2rem;text-align:center;font-family:var(--fm);font-size:.8rem;color:var(--muted2)">No events match filters</div>';return;}
  body.innerHTML=rows.map(e=>`
    <div class="e-row" onclick="openModal(allEvents.find(x=>x.id===${e.id}))">
      <span class="e-id">#${e.id}</span>
      <span class="e-loc">${e.location}</span>
      <span class="e-mag" style="color:${riskCol(e.magnitude)}">M ${e.magnitude.toFixed(1)}</span>
      <span class="e-cell">${e.depth.toFixed(0)} km</span>
      <span class="e-cell">${e.cdi.toFixed(1)}</span>
      <span class="e-cell">${e.mmi.toFixed(1)}</span>
      <span class="e-cell">${Math.round(e.sig)}</span>
      <span><span class="badge badge-${e.alert}">${e.alert.toUpperCase()}</span></span>
    </div>`).join('');
  renderPg(list.length,pg);
}

function renderPg(total,cur){
  const el=$('pgRow');if(!el)return;
  const pages=Math.ceil(total/PAGE);if(pages<=1){el.innerHTML='';return;}
  let h='';
  if(cur>1)h+=`<button class="pg" onclick="goPage(${cur-1})">←</button>`;
  for(let p=Math.max(1,cur-2);p<=Math.min(pages,cur+2);p++)h+=`<button class="pg ${p===cur?'active':''}" onclick="goPage(${p})">${p}</button>`;
  if(cur<pages)h+=`<button class="pg" onclick="goPage(${cur+1})">→</button>`;
  el.innerHTML=h;
}
function goPage(p){curPage=p;renderEvents(filtered,p);document.getElementById('events')?.scrollIntoView({behavior:'smooth',block:'start'});}

/* ── FILTERS ── */
function applyFilters(){
  const s=($('search')?.value||'').trim().toLowerCase();
  const a=($('alertF')?.value||'all');
  const r=($('regionF')?.value||'all');
  const mm=parseFloat($('minMagF')?.value||'0')||0;
  const so=($('sortF')?.value||'id');
  filtered=allEvents.filter(e=>
    e.magnitude>=mm&&(a==='all'||e.alert===a)&&
    (r==='all'||e.region===r)&&(!s||e.location.toLowerCase().includes(s))
  ).slice().sort((a,b)=>{
    if(so==='mag_d')return b.magnitude-a.magnitude;
    if(so==='mag_a')return a.magnitude-b.magnitude;
    if(so==='sig_d')return(b.sig||0)-(a.sig||0);
    if(so==='dep_a')return a.depth-b.depth;
    return b.id-a.id;
  });
  curPage=1;updateSummary(filtered);renderEvents(filtered,1);
}

/* ── MODAL ── */
function openModal(e){
  if(!e)return;
  const set=(id,v,c)=>{const el=$(id);if(!el)return;el.textContent=v;if(c)el.style.color=c;};
  set('mTitle',e.location);set('mSub',`${e.alert.toUpperCase()} · ${e.region.toUpperCase()} · ID #${e.id}`);
  set('dMag',`M ${e.magnitude.toFixed(1)}`,riskCol(e.magnitude));
  set('dDepth',`${e.depth.toFixed(0)} km`);set('dAlert',e.alert.toUpperCase(),AC[e.alert]);
  set('dCdi',e.cdi.toFixed(1));set('dMmi',e.mmi.toFixed(1));
  set('dRegion',e.region.toUpperCase());set('dSig',String(Math.round(e.sig||0)));
  const m=$('modal');if(m){m.classList.add('open');m.setAttribute('aria-hidden','false');}
}
function closeModal(){const m=$('modal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}}

/* ── SIMULATE ── */
const TEMPLATES=[
  {location:'Himalayan Region',region:'asia',lat:30,lng:80},
  {location:'Istanbul, Turkey',region:'europe',lat:41,lng:29},
  {location:'Mexico City',region:'america',lat:19.4,lng:-99.1},
  {location:'Sumatra, Indonesia',region:'asia',lat:-.6,lng:101.3},
  {location:'Alaska, USA',region:'america',lat:64.2,lng:-153.4},
  {location:'Naples, Italy',region:'europe',lat:40.9,lng:14.3},
];
function simulate(){
  const t=TEMPLATES[Math.floor(Math.random()*TEMPLATES.length)];
  const id=Math.max(...allEvents.map(e=>e.id))+1;
  const mag=Math.round((3.5+Math.random()*5)*10)/10;
  const depth=Math.round(5+Math.random()*80);
  const sig=Math.round(Math.max(0,mag*140+Math.random()*800));
  const alert=sig>1300||mag>=7?'red':sig>900||mag>=6?'orange':sig>350||mag>=5?'yellow':'green';
  allEvents=[{id,...t,magnitude:mag,depth,cdi:parseFloat((mag+Math.random()*2-1).toFixed(2)),mmi:parseFloat((mag+Math.random()*1.5-.75).toFixed(2)),sig,alert},...allEvents].slice(0,450);
  applyFilters();
}

/* ── EXPORT ── */
function exportJSON(){
  const b=new Blob([JSON.stringify({at:new Date().toISOString(),n:filtered.length,events:filtered},null,2)],{type:'application/json'});
  const u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download='impactsense-events.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
}

/* ── BOOT ── */
function boot(){
  $('year')&&($('year').textContent=new Date().getFullYear());
  initWave();initMap();
  $('btnSimulate')?.addEventListener('click',simulate);
  $('modalBg')?.addEventListener('click',closeModal);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  ['search','alertF','regionF','sortF'].forEach(id=>$(id)?.addEventListener('change',applyFilters));
  $('search')?.addEventListener('input',applyFilters);
  $('minMagF')?.addEventListener('input',applyFilters);
  applyFilters();
}
boot();
