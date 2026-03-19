import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

/* ══════════════════════════════════════════
   IMPACTSENSE — script.js
   Full seismic intelligence platform
══════════════════════════════════════════ */

/* ── State ── */
let events = [
  { id:1, location:"Near Tokyo, Japan", mag:5.6, depth:10, cdi:5.2, mmi:4.9, sig:620, alert:"yellow", region:"asia", time:"10 min ago", lat:35.6895, lng:139.6917 },
  { id:2, location:"California, USA", mag:4.2, depth:8, cdi:3.1, mmi:3.4, sig:220, alert:"green", region:"america", time:"25 min ago", lat:36.7783, lng:-119.4179 },
  { id:3, location:"Gujarat, India", mag:6.1, depth:15, cdi:6.0, mmi:5.8, sig:980, alert:"orange", region:"asia", time:"1 hour ago", lat:22.2587, lng:71.1924 },
  { id:4, location:"Chile coast", mag:7.0, depth:30, cdi:7.2, mmi:6.9, sig:1550, alert:"red", region:"america", time:"2 hours ago", lat:-35.6751, lng:-71.543 },
  { id:5, location:"Greece", mag:3.8, depth:5, cdi:2.2, mmi:2.6, sig:120, alert:"green", region:"europe", time:"3 hours ago", lat:39.0742, lng:21.8243 },
  { id:6, location:"New Zealand", mag:5.1, depth:20, cdi:4.5, mmi:4.2, sig:510, alert:"yellow", region:"asia", time:"4 hours ago", lat:-40.9, lng:174.9 },
  { id:7, location:"Alaska, USA", mag:6.4, depth:35, cdi:5.8, mmi:5.5, sig:1100, alert:"orange", region:"america", time:"5 hours ago", lat:64.2, lng:-153.4 },
  { id:8, location:"Iran, Persia", mag:4.9, depth:12, cdi:4.0, mmi:3.8, sig:380, alert:"yellow", region:"asia", time:"6 hours ago", lat:32.4, lng:53.7 },
];

const $ = id => document.getElementById(id);
const STORAGE_KEY = "impactsense.v4"; // bumped to clear old stale settings
let autoTimer = null;
let globeDots = [];

/* ── Helpers ── */
const riskLabel = mag => mag<4?"LOW":mag<6?"MODERATE":mag<7?"HIGH":"SEVERE";
const riskColor = label => ({ LOW:"#22c55e", MODERATE:"#fb923c", HIGH:"#ef4444", SEVERE:"#ef4444" })[label] || "#22c55e";
const alertColor = a => ({ green:"#22c55e", yellow:"#facc15", orange:"#fb923c", red:"#ef4444" })[String(a).toLowerCase()] || "#22c55e";
const alertRank = a => ({ red:4, orange:3, yellow:2, green:1 })[String(a||"").toLowerCase()] || 1;
const topAlert = list => { let b="green",r=0; for(const e of list){ const rr=alertRank(e.alert); if(rr>r){r=rr;b=e.alert||"green";} } return String(b); };

/* ── UTC Clock ── */
function tickClock() {
  const el = $("utcClock");
  if (!el) return;
  const now = new Date();
  const pad = n => String(n).padStart(2,"0");
  el.textContent = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}
setInterval(tickClock, 1000);
tickClock();

/* ── Seismic Waveform Canvas ── */
function initWaveCanvas() {
  const canvas = $("waveCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, waves = [];

  function resize() {
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
  }

  function initWaves() {
    waves = Array.from({ length: 6 }, (_, i) => ({
      amp: 20 + Math.random() * 60,
      freq: 0.003 + Math.random() * 0.009,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.8,
      y: (h / 6) * (i + 0.5),
      color: i % 2 === 0 ? "rgba(0,212,255," : "rgba(168,85,247,",
      opacity: 0.06 + Math.random() * 0.1,
    }));
  }

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += 0.008;
    for (const wave of waves) {
      wave.phase += wave.speed * 0.01;
      ctx.beginPath();
      ctx.strokeStyle = `${wave.color}${wave.opacity})`;
      ctx.lineWidth = 1.2;
      for (let x = 0; x <= w; x += 2) {
        const disturbance = Math.sin(x * 0.008 + t * 3) * (Math.random() > 0.995 ? 40 : 0);
        const y = wave.y + Math.sin(x * wave.freq + wave.phase + t) * wave.amp
          + Math.sin(x * wave.freq * 2.3 + t * 1.4) * (wave.amp * 0.3)
          + disturbance;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", () => { resize(); initWaves(); });
  initWaves();
  draw();
}

/* ── World Map (Canvas) ── */
const WORLD_DOTS = [
  // North America
  [-100,50],[-95,55],[-90,45],[-80,40],[-70,45],[-120,45],[-110,35],[-85,30],[-75,35],
  // South America
  [-60,-15],[-50,-25],[-65,-10],[-70,-35],[-55,-30],[-45,-20],[-80,-10],
  // Europe
  [10,50],[20,50],[0,50],[30,50],[15,40],[25,40],[-5,40],[5,48],[2,46],
  // Africa
  [20,0],[30,0],[10,10],[25,10],[15,-20],[30,20],[0,15],[35,-15],
  // Asia
  [80,30],[90,30],[100,30],[70,40],[60,50],[120,40],[130,40],[140,35],[110,30],[90,50],[75,30],
  // Oceania
  [145,-35],[150,-28],[140,-22],[130,-25],[170,-40],[175,-38],[180,-16],
];

function latLngToXY(lat, lng, w, h) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

function initGlobeCanvas() {
  const canvas = $("globeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const coordDisplay = $("wmCoords");

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw graticule
    ctx.strokeStyle = "rgba(0,212,255,0.05)";
    ctx.lineWidth = 0.5;
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng + 180) / 360) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = ((90 - lat) / 180) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw continent dots
    for (const [lng, lat] of WORLD_DOTS) {
      const { x, y } = latLngToXY(lat, lng, w, h);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,212,255,0.18)";
      ctx.fill();
    }

    // Equator
    const eq = latLngToXY(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,212,255,0.12)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(0, eq.y); ctx.lineTo(w, eq.y); ctx.stroke();
    ctx.setLineDash([]);

    // Draw event dots
    for (const e of globeDots) {
      const { x, y } = latLngToXY(e.lat, e.lng, w, h);
      const color = alertColor(e.alert);
      const radius = 4 + e.mag * 1.2;

      // Glow
      const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
      grd.addColorStop(0, color + "66");
      grd.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function onResize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.width * 0.51);
    draw();
  }

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const lat = (90 - (my / canvas.height) * 180).toFixed(1);
    const lng = ((mx / canvas.width) * 360 - 180).toFixed(1);
    if (coordDisplay) coordDisplay.textContent = `LAT ${lat}° / LNG ${lng}°`;
  });

  window.addEventListener("resize", onResize);
  onResize();

  // Animate pulsing dots
  let t = 0;
  function animate() {
    const w = canvas.width, h = canvas.height;
    // Clear and redraw base
    ctx.clearRect(0, 0, w, h);

    // Graticule
    ctx.strokeStyle = "rgba(0,212,255,0.05)";
    ctx.lineWidth = 0.5;
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng+180)/360)*w;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = ((90-lat)/180)*h;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }

    // Continent dots
    for (const [lng, lat] of WORLD_DOTS) {
      const { x, y } = latLngToXY(lat, lng, w, h);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2);
      ctx.fillStyle = "rgba(0,212,255,0.16)"; ctx.fill();
    }

    // Equator dashed
    const eq = latLngToXY(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,212,255,0.1)"; ctx.lineWidth=0.8;
    ctx.setLineDash([4,8]);
    ctx.beginPath(); ctx.moveTo(0,eq.y); ctx.lineTo(w,eq.y); ctx.stroke();
    ctx.setLineDash([]);

    // Event dots with pulse
    t += 0.03;
    for (const e of globeDots) {
      if (!e.lat && !e.lng) continue;
      const { x, y } = latLngToXY(e.lat, e.lng, w, h);
      const color = alertColor(e.alert);
      const baseR = 4 + (e.mag-3)*1.4;
      const pulse = Math.sin(t + e.id) * 0.4 + 0.6;

      // Outer pulse ring
      ctx.beginPath();
      ctx.arc(x, y, baseR * (2 + pulse), 0, Math.PI*2);
      ctx.fillStyle = color + "18";
      ctx.fill();

      // Mid ring
      ctx.beginPath();
      ctx.arc(x, y, baseR * 1.5, 0, Math.PI*2);
      ctx.fillStyle = color + "30";
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth=0.8;
      ctx.stroke();
    }
    requestAnimationFrame(animate);
  }
  animate();
  return { redraw: onResize };
}

let globeInstance = null;

/* ── CSV Loader ── */
async function loadCsvEvents() {
  try {
    const res = await fetch("earthquake_week2_processed.csv");
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length <= 1) return;
    const headers = lines[0].split(",");
    const idx = n => headers.indexOf(n);
    const [iMag,iDepth,iCdi,iMmi,iSig,iAlert] = ["magnitude","depth","cdi","mmi","sig","alert"].map(idx);
    if ([iMag,iDepth,iCdi,iMmi,iSig,iAlert].some(i=>i===-1)) return;

    const REGIONS = ["asia","europe","america"];
    const LOCS = ["Pacific Ring","South Asian Belt","Mediterranean Zone","Caribbean Plate",
      "Andean Region","East African Rift","Himalayan Arc","Aleutian Trench",
      "Cascadia Zone","New Zealand Region","Balkan Zone","Arabian Plate",
      "Mid-Atlantic Ridge","Zagros Belt","Japan Trench","Mariana Zone"];
    const LATS = [35,-10,45,18,-35,5,30,55,45,-40,44,26,0,32,36,15];
    const LNGS = [139,120,20,-75,-70,38,80,-170,-122,175,22,46,-25,47,141,145];
    const alertMap = {0:"green",1:"yellow",2:"orange",3:"red"};

    const newEvents = [];
    for (let i=1; i<Math.min(lines.length,60); i++) {
      const cols = lines[i].split(",");
      if (!cols.length) continue;
      const mag = parseFloat(cols[iMag]||"0");
      const depth = Math.abs(parseFloat(cols[iDepth]||"0"));
      const cdi = parseFloat(cols[iCdi]||"0");
      const mmi = parseFloat(cols[iMmi]||"0");
      const sig = parseFloat(cols[iSig]||"0");
      const alert = alertMap[parseInt(cols[iAlert]||"0",10)] || "green";
      const li = i % LOCS.length;
      newEvents.push({
        id:i, location:`${LOCS[li]} #${i}`,
        mag, depth, cdi, mmi, sig, alert,
        region: REGIONS[i%3],
        time: `${i} events ago`,
        lat: LATS[li] + (Math.random()*6-3),
        lng: LNGS[li] + (Math.random()*6-3),
      });
    }
    if (newEvents.length) { events = newEvents; console.log(`Loaded ${events.length} from CSV`); }
  } catch(e) { console.warn("CSV:", e); }
}

/* ── Alert Matrix ── */
function renderAlertMatrix(list) {
  const el = $("alertMatrix");
  if (!el) return;
  const counts = {green:0,yellow:0,orange:0,red:0};
  for (const e of list) { const k=String(e.alert||"green").toLowerCase(); if(counts[k]!==undefined) counts[k]++; }
  const colors = {green:"#22c55e",yellow:"#facc15",orange:"#fb923c",red:"#ef4444"};
  el.innerHTML = Object.entries(counts).map(([k,v])=>`
    <div class="am-cell" style="border-color:${colors[k]}30;background:${colors[k]}08">
      <span class="am-cell-count" style="color:${colors[k]}">${v}</span>
      <span class="am-cell-lbl" style="color:${colors[k]}aa">${k.toUpperCase()}</span>
    </div>
  `).join("");
}

/* ── Magnitude Histogram ── */
function renderHistogram(list) {
  const el = $("histogram");
  if (!el) return;
  const bins = [{range:"<4",min:0,max:4},{range:"4-5",min:4,max:5},{range:"5-6",min:5,max:6},{range:"6-7",min:6,max:7},{range:"7+",min:7,max:99}];
  const counts = bins.map(b => list.filter(e=>e.mag>=b.min&&e.mag<b.max).length);
  const maxC = Math.max(...counts, 1);
  el.innerHTML = bins.map((b,i)=>{
    const h = Math.max(4, Math.round((counts[i]/maxC)*60));
    return `<div class="hb-wrap">
      <div class="hb" style="height:${h}px"></div>
      <span class="hb-lbl">${b.range}</span>
    </div>`;
  }).join("");
}

/* ── Ring Gauge ── */
function updateRingGauge(pct) {
  const fill = $("rgFill");
  if (!fill) return;
  // stroke-dasharray="465" for circumference of r=74 circle * (468deg/360deg)
  const total = 465;
  const offset = total - (pct/100)*total;
  fill.style.strokeDashoffset = String(offset);
  const idx = $("riskIndex");
  if (idx) idx.textContent = Math.round(pct).toString();
}

/* ── Summary Update ── */
function updateSummary(list) {
  const n = list.length;
  const maxMag = n ? Math.max(...list.map(e=>e.mag)) : 0;
  const avgDepth = n ? list.reduce((a,e)=>a+e.depth,0)/n : 0;
  const alert = topAlert(list);
  const risk = riskLabel(maxMag);
  const pct = Math.min(100,(maxMag/8)*100);
  const avgCdi = n ? list.reduce((a,e)=>a+(Number(e.cdi)||0),0)/n : 0;
  const avgMmi = n ? list.reduce((a,e)=>a+(Number(e.mmi)||0),0)/n : 0;

  const set = (id, val) => { const el=$(id); if(el) el.textContent=val; };
  const setColor = (id, color) => { const el=$(id); if(el) el.style.color=color; };

  set("eventsToday", String(n));
  set("maxMag", maxMag.toFixed(1));
  set("avgDepth", Math.round(avgDepth).toString());
  set("summaryAlert", alert.toUpperCase());
  set("avgCdi", avgCdi.toFixed(1));
  set("avgMmi", avgMmi.toFixed(1));
  setColor("summaryAlert", alertColor(alert));

  const riskBar = $("riskBar");
  if (riskBar) riskBar.style.width = `${Math.max(1,pct)}%`;
  const riskBarPct = $("riskBarPct");
  if (riskBarPct) riskBarPct.textContent = `${Math.round(pct)}%`;

  updateRingGauge(pct);
  const rl = $("riskLabel");
  if (rl) { rl.textContent = `${risk} RISK`; rl.style.color = riskColor(risk); }

  // Hero
  set("heroEvents", String(n));
  set("heroMaxMag", maxMag.toFixed(1));
  const hr = $("heroRisk");
  if (hr) { hr.textContent = risk; hr.style.color = riskColor(risk); }

  // System status
  const ss = $("systemStatus");
  if (ss) ss.textContent = autoTimer ? "AUTO SCAN" : "NOMINAL";
  const sd = $("sysDot");
  if (sd) {
    if (alert==="red") { sd.style.background="#ef4444"; sd.style.boxShadow="0 0 10px rgba(239,68,68,.9)"; }
    else if (alert==="orange") { sd.style.background="#fb923c"; sd.style.boxShadow="0 0 10px rgba(251,146,60,.9)"; }
    else { sd.style.background="#22c55e"; sd.style.boxShadow="0 0 10px rgba(34,197,94,.9)"; }
  }

  renderAlertMatrix(list);
  renderHistogram(list);
  globeDots = list.filter(e=>e.lat||e.lng);
}

/* ── Render Events ── */
function renderEvents(list) {
  const el = $("eventsList");
  if (!el) return;
  el.innerHTML = "";
  if (!list.length) {
    el.innerHTML = `<div class="event-row" style="cursor:default;grid-template-columns:1fr">
      <span style="font-family:var(--font-mono);font-size:.78rem;color:var(--muted)">NO EVENTS MATCH CURRENT FILTERS — adjust parameters above</span>
    </div>`;
    return;
  }
  for (const e of list) {
    const ak = String(e.alert||"green").toLowerCase();
    const risk = riskLabel(e.mag);
    const row = document.createElement("div");
    row.className = "event-row";
    row.setAttribute("role","button"); row.setAttribute("tabindex","0");
    row.dataset.eventId = String(e.id);
    row.innerHTML = `
      <div class="er-loc">${e.location}</div>
      <div class="er-mag" style="color:${riskColor(risk)}">M ${e.mag.toFixed(1)}</div>
      <div class="er-cell">${e.depth.toFixed(0)} km</div>
      <div class="er-cell">${Number(e.cdi).toFixed(1)}</div>
      <div class="er-cell">${Number(e.mmi).toFixed(1)}</div>
      <div class="er-cell">${Math.round(Number(e.sig)||0)}</div>
      <div><span class="er-badge ${ak}">${ak.toUpperCase()}</span></div>
      <div class="er-time">${e.time}</div>
    `;
    el.appendChild(row);
  }
}

/* ── Filters ── */
function getFiltered() {
  const search = ($("search")?.value||"").trim().toLowerCase();
  const alert = ($("alert")?.value||"all").toLowerCase();
  const minMag = parseFloat($("minMag")?.value||"0")||0;
  const minSig = parseFloat($("minSig")?.value||"0")||0;
  const region = ($("region")?.value||"all").toLowerCase();
  const sortBy = ($("sortBy")?.value||"timeDesc").toLowerCase();

  let list = events.filter(e => {
    if (e.mag < minMag) return false;
    if ((Number(e.sig)||0) < minSig) return false;
    if (region!=="all" && e.region!==region) return false;
    if (search && !e.location.toLowerCase().includes(search)) return false;
    if (alert!=="all" && String(e.alert||"").toLowerCase()!==alert) return false;
    return true;
  });
  list = list.slice().sort((a,b) => {
    if (sortBy==="magdesc") return b.mag-a.mag;
    if (sortBy==="magasc") return a.mag-b.mag;
    if (sortBy==="depthasc") return a.depth-b.depth;
    if (sortBy==="depthdesc") return b.depth-a.depth;
    return b.id-a.id;
  });
  return list;
}

function applyFilters() {
  const list = getFiltered();
  renderEvents(list);
  updateSummary(list);
  const now = new Date();
  const lu = $("lastUpdated");
  if (lu) lu.textContent = `LAST UPDATE: ${now.toLocaleTimeString()}`;
  const lus = $("lastUpdatedShort");
  if (lus) lus.textContent = now.toLocaleTimeString();
  saveSettings();
}

/* ── Test risk ── */
function handleTestRisk() {
  const mag = parseFloat($("testMag")?.value||"0")||0;
  const label = riskLabel(mag);
  const color = riskColor(label);
  const el = $("testRiskResult");
  if (!el) return;
  el.innerHTML = `<span style="color:${color};font-weight:600">M${mag.toFixed(1)} → ${label} RISK</span>`;
  el.style.borderColor = color + "44";
  el.style.background = color + "08";
}

/* ── Modal ── */
function openModal(e) {
  const risk = riskLabel(e.mag);
  const alert = String(e.alert||"green").toUpperCase();
  const set = (id,v,color) => { const el=$(id); if(el){el.textContent=v; if(color) el.style.color=color;} };
  set("modalTitle", e.location);
  set("modalSub", `ALERT: ${alert} · ${e.time} · ${e.region.toUpperCase()}`);
  set("dMag", `M ${e.mag.toFixed(1)}`, riskColor(risk));
  set("dDepth", `${e.depth.toFixed(0)} km`);
  set("dRegion", e.region.toUpperCase());
  set("dRisk", risk, riskColor(risk));
  set("dCdi", Number(e.cdi).toFixed(1));
  set("dMmi", Number(e.mmi).toFixed(1));
  set("dSig", String(Math.round(Number(e.sig)||0)));
  const modal = $("modal");
  if (modal) { modal.classList.add("is-open"); modal.setAttribute("aria-hidden","false"); }
}
function closeModal() {
  const modal = $("modal");
  if (modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden","true"); }
}

/* ── Simulate ── */
const TEMPLATES = [
  {location:"Himalayan Region",region:"asia",lat:30.0,lng:80.0},
  {location:"Istanbul, Turkey",region:"europe",lat:41.0,lng:29.0},
  {location:"Mexico City",region:"america",lat:19.4,lng:-99.1},
  {location:"Sumatra, Indonesia",region:"asia",lat:-0.6,lng:101.3},
  {location:"Naples, Italy",region:"europe",lat:40.9,lng:14.3},
  {location:"Alaska USA",region:"america",lat:64.2,lng:-153.4},
  {location:"New Zealand",region:"asia",lat:-41.0,lng:174.9},
  {location:"Pacific Northwest",region:"america",lat:47.6,lng:-122.3},
];

function simulate() {
  const t = TEMPLATES[Math.floor(Math.random()*TEMPLATES.length)];
  const id = Math.max(...events.map(e=>e.id)) + 1;
  const mag = Math.round((3.1+Math.random()*4.5)*10)/10;
  const depth = Math.round(4+Math.random()*55);
  const cdi = Math.max(0,Math.min(10,Math.round((mag+Math.random()*2.4-1.2)*10)/10));
  const mmi = Math.max(0,Math.min(10,Math.round((mag+Math.random()*2-1)*10)/10));
  const sig = Math.round(Math.max(0,mag*140+Math.random()*900));
  const alert = sig>1300||mag>=7?"red":sig>900||mag>=6?"orange":sig>350||mag>=5?"yellow":"green";
  events = [{id,...t,mag,depth,cdi,mmi,sig,alert,time:"just now"},...events].slice(0,30);
  applyFilters();
}

/* ── Auto refresh ── */
function setAuto(on) {
  if (autoTimer) { clearInterval(autoTimer); autoTimer=null; }
  if (on) autoTimer = setInterval(simulate, 7000);
  const label = $("autoLabel");
  const dot = $("autoDot");
  const btn = $("btnToggleAuto");
  if (label) label.textContent = on?"ON":"OFF";
  if (dot) dot.classList.toggle("on", on);
  if (btn) btn.setAttribute("aria-pressed", on?"true":"false");
  updateSummary(getFiltered());
  saveSettings();
}

/* ── Export ── */
function exportJSON() {
  const blob = new Blob([JSON.stringify({exportedAt:new Date().toISOString(),events},null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="impactsense-events.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── Settings ── */
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
    minMag:$("minMag")?.value, minSig:$("minSig")?.value,
    region:$("region")?.value, search:$("search")?.value,
    alert:$("alert")?.value, sortBy:$("sortBy")?.value,
    auto:Boolean(autoTimer)
  })); } catch {}
}
function loadSettings() {
  // Clear stale keys from old versions
  ["impactsense.v3","impactsense.v2","impactsense.v1","impactsense.eq.ui.settings.v1"].forEach(k=>{try{localStorage.removeItem(k);}catch{}});
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    // Safe restore — cap numbers to avoid blank outputs
    const safeNum = (id, v, maxOk) => {
      const el = $(id); if (!el) return;
      const n = parseFloat(v);
      if (!isNaN(n) && n >= 0 && n <= maxOk) el.value = String(n);
    };
    safeNum("minMag", s.minMag, 5.9);
    safeNum("minSig", s.minSig, 600);
    const sel = (id,v) => { const el=$(id); if(el&&v!==undefined) el.value=v; };
    sel("region", s.region); sel("search", s.search); sel("alert", s.alert); sel("sortBy", s.sortBy);
    if (s.auto) setAuto(true);
  } catch {}
}

/* ── THREE.js background globe ── */
function initThreeGlobe() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:0.18";
  document.body.insertBefore(canvas, document.body.firstChild);

  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55,1,0.1,100);
  camera.position.set(0.3,0.2,5);

  scene.add(new THREE.AmbientLight(0xffffff,0.4));
  const dl = new THREE.DirectionalLight(0x00d4ff,0.8); dl.position.set(2,2,2); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xa855f7,0.4); dl2.position.set(-2,-1,1); scene.add(dl2);

  const g = new THREE.Group(); scene.add(g);
  const sGeo = new THREE.SphereGeometry(1.3,72,72);
  const wMat = new THREE.MeshStandardMaterial({color:0x00d4ff,emissive:0x001a20,wireframe:true,transparent:true,opacity:0.2,metalness:0.3,roughness:0.3});
  g.add(new THREE.Mesh(sGeo,wMat));

  const rGeo = new THREE.TorusGeometry(1.7,0.01,12,180);
  const rMat = new THREE.MeshBasicMaterial({color:0x00d4ff,transparent:true,opacity:0.2});
  const ring = new THREE.Mesh(rGeo,rMat); ring.rotation.x=Math.PI/2.4; g.add(ring);

  const r2Geo = new THREE.TorusGeometry(2.0,0.008,12,140);
  const r2Mat = new THREE.MeshBasicMaterial({color:0xa855f7,transparent:true,opacity:0.15});
  const ring2 = new THREE.Mesh(r2Geo,r2Mat); ring2.rotation.x=Math.PI/1.7; ring2.rotation.z=Math.PI/3; g.add(ring2);

  const pCount = 1400, pos = new Float32Array(pCount*3), col = new Float32Array(pCount*3);
  for (let i=0;i<pCount;i++) {
    const r=2.8+Math.random()*2.2, t=Math.random()*Math.PI*2, p=Math.acos(2*Math.random()-1);
    pos[i*3]=r*Math.sin(p)*Math.cos(t); pos[i*3+1]=r*Math.cos(p)*0.75; pos[i*3+2]=r*Math.sin(p)*Math.sin(t);
    const mix=Math.random(); col[i*3]=mix*0.6; col[i*3+1]=1-mix*0.7; col[i*3+2]=1;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  pGeo.setAttribute("color",new THREE.BufferAttribute(col,3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({vertexColors:true,size:0.011,transparent:true,opacity:0.6,depthWrite:false})));

  function resize() {
    const w=window.innerWidth,h=window.innerHeight;
    renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  resize(); window.addEventListener("resize",resize);

  let tx=0,ty=0;
  window.addEventListener("pointermove",e=>{
    tx=((e.clientX/window.innerWidth)*2-1)*0.2;
    ty=-((e.clientY/window.innerHeight)*2-1)*0.12;
  });

  const clock = new THREE.Clock();
  function animate() {
    const t = clock.getElapsedTime();
    g.rotation.y = t*0.09;
    g.rotation.x = Math.sin(t*0.15)*0.04;
    ring.rotation.z = t*0.06;
    ring2.rotation.y = t*0.04;
    camera.position.x += (tx-camera.position.x)*0.02;
    camera.position.y += (ty-camera.position.y)*0.02;
    camera.lookAt(0,0,0);
    renderer.render(scene,camera);
    requestAnimationFrame(animate);
  }
  try { animate(); } catch { canvas.style.display="none"; }
}

/* ── Nav active link on scroll ── */
function initScrollSpy() {
  const sections = ["overview","worldmap","analysis","events","dataset"];
  const links = document.querySelectorAll(".nav-link");
  const obs = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove("active"));
        const link = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (link) link.classList.add("active");
      }
    }
  }, { threshold: 0.4 });
  sections.forEach(id => { const el=$(id); if(el) obs.observe(el); });
}

/* ── Boot ── */
async function boot() {
  $("year") && ($("year").textContent = String(new Date().getFullYear()));

  // Init visual systems
  initThreeGlobe();
  initWaveCanvas();
  globeInstance = initGlobeCanvas();
  initScrollSpy();

  // Wire up events
  $("applyFilters")?.addEventListener("click", applyFilters);
  $("testRiskBtn")?.addEventListener("click", handleTestRisk);
  $("btnSimulate")?.addEventListener("click", simulate);
  $("btnToggleAuto")?.addEventListener("click", () => setAuto(!autoTimer));
  $("btnExport")?.addEventListener("click", exportJSON);
  $("btnExport2")?.addEventListener("click", exportJSON);
  $("modalBackdrop")?.addEventListener("click", closeModal);
  $("modalClose")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", e => { if(e.key==="Escape") closeModal(); });

  // Live filters
  ["search","alert","region","sortBy"].forEach(id => $(`${id}`)?.addEventListener("change", applyFilters));
  $("search")?.addEventListener("input", applyFilters);
  ["minMag","minSig"].forEach(id => $(id)?.addEventListener("input", applyFilters));

  // Event list click
  $("eventsList")?.addEventListener("click", ev => {
    const row = ev.target?.closest?.(".event-row");
    const id = row?.dataset?.eventId;
    if (!id) return;
    const e = events.find(x=>String(x.id)===String(id));
    if (e) openModal(e);
  });

  // Load
  loadSettings();
  await loadCsvEvents();
  applyFilters();
  handleTestRisk();
}

boot();
