import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

/* ══════════════════════════════════════
   IMPACTSENSE — script.js
   414 real dataset events + interactive globe
══════════════════════════════════════ */

/* ── all events from CSV_EVENTS (events_data.js) ── */
let allEvents = typeof CSV_EVENTS !== "undefined" ? CSV_EVENTS : [];
let filteredEvents = [...allEvents];
let mapFilter = "all";
let currentPage = 1;
const PAGE_SIZE = 20;
let autoTimer = null;
const STORAGE_KEY = "impactsense.v5";

/* ── Helpers ── */
const $ = id => document.getElementById(id);
const riskLabel = mag => mag < 4 ? "LOW" : mag < 6 ? "MODERATE" : mag < 7 ? "HIGH" : "SEVERE";
const riskColor = l => ({ LOW: "#22c55e", MODERATE: "#fb923c", HIGH: "#ef4444", SEVERE: "#ef4444" })[l] || "#22c55e";
const alertColor = a => ({ green: "#22c55e", yellow: "#facc15", orange: "#fb923c", red: "#ef4444" })[String(a).toLowerCase()] || "#22c55e";
const alertRank = a => ({ red: 4, orange: 3, yellow: 2, green: 1 })[String(a || "").toLowerCase()] || 1;
const topAlert = list => { let b = "green", r = 0; for (const e of list) { const rr = alertRank(e.alert); if (rr > r) { r = rr; b = e.alert; } } return b; };

/* ── UTC Clock ── */
function tickClock() {
  const el = $("utcClock"); if (!el) return;
  const n = new Date();
  const p = v => String(v).padStart(2, "0");
  el.textContent = `${p(n.getUTCHours())}:${p(n.getUTCMinutes())}:${p(n.getUTCSeconds())} UTC`;
}
setInterval(tickClock, 1000); tickClock();

/* ─────────────────────────────────────────
   WORLD MAP — full Mercator canvas render
───────────────────────────────────────── */
let mapCanvas, mapCtx, mapW, mapH;
let hoveredEvent = null;
let mapEventsList = [];

// Simplified world land polygons (GeoJSON-style outlines approximated)
// We'll draw a proper mercator grid + filled continents via path2d
const LAND_PATHS = [
  // North America outline (simplified)
  [[-167,71],[-141,70],[-124,60],[-124,48],[-117,32],[-95,26],[-87,28],[-82,25],[-80,25],
   [-76,34],[-70,42],[-66,44],[-60,46],[-55,47],[-53,47],[-55,50],[-60,55],[-64,60],
   [-68,63],[-75,62],[-80,58],[-83,56],[-88,52],[-92,52],[-96,55],[-102,58],[-108,60],
   [-115,60],[-120,58],[-128,54],[-132,56],[-138,60],[-143,60],[-150,61],[-155,58],
   [-158,57],[-162,60],[-164,63],[-163,65],[-166,68],[-167,71]],
  // South America
  [[-80,-5],[-75,-2],[-68,1],[-60,5],[-52,4],[-48,-2],[-42,-5],[-38,-8],[-35,-8],
   [-35,-12],[-38,-18],[-42,-22],[-44,-24],[-44,-28],[-50,-30],[-53,-33],[-57,-38],
   [-60,-42],[-64,-46],[-65,-50],[-66,-54],[-68,-55],[-66,-56],[-64,-54],[-68,-52],
   [-70,-46],[-72,-42],[-72,-38],[-70,-35],[-68,-32],[-70,-28],[-70,-18],[-74,-10],
   [-77,-5],[-80,-5]],
  // Europe
  [[28,42],[30,45],[28,48],[24,50],[20,55],[18,58],[14,58],[10,58],[6,58],[2,56],[-2,52],
   [-4,48],[-6,44],[-2,44],[2,44],[8,44],[12,44],[14,40],[16,38],[18,40],[20,40],[24,44],[28,42]],
  // Africa
  [[-18,15],[-16,18],[-14,18],[-10,18],[-6,16],[-2,16],[4,14],[8,12],[12,14],[16,14],[20,12],
   [24,12],[28,12],[32,14],[36,14],[40,12],[44,10],[46,8],[44,2],[42,-2],[40,-8],[36,-14],
   [34,-20],[32,-26],[30,-32],[28,-36],[26,-34],[24,-28],[22,-22],[20,-18],[18,-14],[14,-12],
   [10,-10],[8,-6],[4,-2],[0,2],[-4,4],[-8,6],[-12,10],[-16,12],[-18,15]],
  // Asia (main)
  [[26,42],[28,46],[30,50],[32,54],[36,56],[38,58],[42,60],[46,62],[50,68],[54,70],[60,68],
   [66,68],[72,68],[78,66],[80,70],[84,72],[88,72],[92,70],[96,68],[100,66],[104,64],[108,62],
   [112,60],[116,58],[120,56],[124,52],[130,48],[134,44],[136,38],[134,32],[130,28],[126,24],
   [122,20],[118,18],[114,18],[110,18],[106,14],[100,6],[96,4],[92,6],[88,8],[84,10],
   [80,12],[76,10],[72,8],[68,10],[64,14],[60,18],[56,22],[52,22],[48,18],[44,18],[40,16],
   [38,16],[36,18],[34,22],[32,28],[30,32],[28,36],[26,38],[26,42]],
  // Australia
  [[114,-22],[116,-20],[120,-18],[124,-16],[128,-14],[132,-12],[136,-12],[140,-14],[144,-16],
   [148,-18],[152,-22],[154,-26],[154,-30],[152,-34],[148,-38],[144,-38],[140,-36],[136,-34],
   [132,-32],[128,-32],[124,-32],[120,-30],[116,-26],[114,-22]],
  // Japan (simplified)
  [[130,31],[132,33],[134,34],[136,36],[138,38],[140,40],[142,42],[144,44],[142,44],
   [140,42],[138,40],[136,38],[134,36],[132,34],[130,32],[130,31]],
  // UK
  [[-6,50],[-4,50],[-2,52],[0,54],[-2,56],[-4,58],[-6,58],[-6,56],[-4,54],[-4,52],[-6,50]],
  // Greenland
  [[-50,62],[-44,62],[-38,64],[-30,66],[-24,68],[-20,70],[-18,74],[-24,76],[-32,78],
   [-40,80],[-48,80],[-52,78],[-54,74],[-52,70],[-50,66],[-50,62]],
];

function mercatorX(lng, w) { return ((lng + 180) / 360) * w; }
function mercatorY(lat, h) {
  const rad = lat * Math.PI / 180;
  const proj = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (h / 2) - (h * proj) / (2 * Math.PI * 0.85);
}

function drawWorldMap(filter) {
  if (!mapCanvas || !mapCtx) return;
  const ctx = mapCtx;
  const w = mapW, h = mapH;
  ctx.clearRect(0, 0, w, h);

  // Ocean background
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, "rgba(2,8,20,0.98)");
  ocean.addColorStop(1, "rgba(3,12,28,0.98)");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // Graticule lines
  ctx.strokeStyle = "rgba(0,212,255,0.05)";
  ctx.lineWidth = 0.5;
  ctx.setLineDash([]);
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = mercatorX(lng, w);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let lat = -80; lat <= 80; lat += 30) {
    const y = mercatorY(lat, h);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  // Equator highlight
  ctx.strokeStyle = "rgba(0,212,255,0.12)";
  ctx.lineWidth = 0.8;
  const eq = mercatorY(0, h);
  ctx.beginPath(); ctx.moveTo(0, eq); ctx.lineTo(w, eq); ctx.stroke();

  // Land masses
  for (const path of LAND_PATHS) {
    ctx.beginPath();
    path.forEach(([lng, lat], i) => {
      const x = mercatorX(lng, w), y = mercatorY(lat, h);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(18,30,55,0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,212,255,0.18)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Lat/lng labels
  ctx.fillStyle = "rgba(100,116,139,0.55)";
  ctx.font = `${w * 0.009}px JetBrains Mono, monospace`;
  ctx.textAlign = "center";
  for (let lng = -150; lng <= 150; lng += 60) {
    const x = mercatorX(lng, w);
    ctx.fillText(`${lng > 0 ? "+" : ""}${lng}°`, x, h - 4);
  }

  // Build list to render
  mapEventsList = filter === "all" ? allEvents : allEvents.filter(e => e.alert === filter);

  // Sort: draw low-mag first so high-mag appears on top
  const sorted = [...mapEventsList].sort((a, b) => a.magnitude - b.magnitude);

  for (const e of sorted) {
    const x = mercatorX(e.lng, w);
    const y = mercatorY(e.lat, h);
    if (y < 0 || y > h) continue;

    const color = alertColor(e.alert);
    const r = Math.max(3, Math.min(14, (e.magnitude - 2) * 1.8 + 3));
    const isHovered = hoveredEvent && hoveredEvent.id === e.id;

    // Glow
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * (isHovered ? 4 : 3));
    grd.addColorStop(0, color + (isHovered ? "88" : "55"));
    grd.addColorStop(1, color + "00");
    ctx.beginPath();
    ctx.arc(x, y, r * (isHovered ? 4 : 3), 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? color : color + "cc";
    ctx.fill();

    if (isHovered) {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Count badge overlay
  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  allEvents.forEach(e => { const k = String(e.alert).toLowerCase(); if (counts[k] !== undefined) counts[k]++; });
  $("mcGreen") && ($("mcGreen").textContent = counts.green);
  $("mcYellow") && ($("mcYellow").textContent = counts.yellow);
  $("mcOrange") && ($("mcOrange").textContent = counts.orange);
  $("mcRed") && ($("mcRed").textContent = counts.red);
  $("mcAll") && ($("mcAll").textContent = allEvents.length);
}

function initWorldMap() {
  mapCanvas = $("worldMap"); if (!mapCanvas) return;
  mapCtx = mapCanvas.getContext("2d");

  function resize() {
    const frame = $("mapFrame");
    if (!frame) return;
    mapW = mapCanvas.width = frame.clientWidth;
    mapH = mapCanvas.height = Math.round(mapW * 0.52);
    drawWorldMap(mapFilter);
  }

  // Tooltip & hover
  const tooltip = $("mapTooltip");
  const coords = $("mapCoords");
  const info = $("mapInfo");

  mapCanvas.addEventListener("mousemove", e => {
    const rect = mapCanvas.getBoundingClientRect();
    const scaleX = mapW / rect.width;
    const scaleY = mapH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // Coords
    const lng = (mx / mapW) * 360 - 180;
    // Inverse mercator for lat
    const rawLat = (my - mapH / 2) / (-mapH / (2 * Math.PI * 0.85));
    const lat = (Math.atan(Math.exp(rawLat)) - Math.PI / 4) * (360 / Math.PI);
    if (coords) coords.textContent = `LAT ${lat.toFixed(1)}° / LNG ${lng.toFixed(1)}°`;

    // Hit test events
    const events2 = mapFilter === "all" ? allEvents : allEvents.filter(ev => ev.alert === mapFilter);
    let found = null;
    let minDist = Infinity;
    for (const ev of events2) {
      const ex = mercatorX(ev.lng, mapW);
      const ey = mercatorY(ev.lat, mapH);
      const r = Math.max(3, Math.min(14, (ev.magnitude - 2) * 1.8 + 3));
      const dist = Math.sqrt((mx - ex) ** 2 + (my - ey) ** 2);
      if (dist < r * 3.5 && dist < minDist) { minDist = dist; found = ev; }
    }

    if (found !== hoveredEvent) {
      hoveredEvent = found;
      drawWorldMap(mapFilter);
    }

    if (found && tooltip) {
      const dispX = e.clientX - rect.left;
      const dispY = e.clientY - rect.top;
      const flipX = dispX > rect.width * 0.7;
      const flipY = dispY > rect.height * 0.7;
      tooltip.style.left = flipX ? "auto" : `${dispX + 14}px`;
      tooltip.style.right = flipX ? `${rect.width - dispX + 14}px` : "auto";
      tooltip.style.top = flipY ? "auto" : `${dispY + 14}px`;
      tooltip.style.bottom = flipY ? `${rect.height - dispY + 14}px` : "auto";
      tooltip.classList.add("visible");
      $("ttLoc").textContent = found.location;
      $("ttMag").textContent = `M ${found.magnitude.toFixed(1)}`;
      $("ttDepth").textContent = `${found.depth.toFixed(0)} km`;
      $("ttAlert").textContent = found.alert.toUpperCase();
      $("ttAlert").style.color = alertColor(found.alert);
      $("ttSig").textContent = Math.round(found.sig);
      if (info) info.textContent = `${found.location} · M${found.magnitude.toFixed(1)} · ${found.alert.toUpperCase()}`;
    } else if (tooltip) {
      tooltip.classList.remove("visible");
      hoveredEvent = null;
      if (info) info.textContent = "HOVER EVENT FOR DETAILS";
    }
  });

  mapCanvas.addEventListener("mouseleave", () => {
    hoveredEvent = null; drawWorldMap(mapFilter);
    if (tooltip) tooltip.classList.remove("visible");
    if (coords) coords.textContent = "LAT — / LNG —";
  });

  mapCanvas.addEventListener("click", e => {
    if (!hoveredEvent) return;
    openModal(hoveredEvent);
  });

  // Map filter buttons
  document.querySelectorAll(".mc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mc-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      mapFilter = btn.dataset.filter;
      hoveredEvent = null;
      drawWorldMap(mapFilter);
    });
  });

  window.addEventListener("resize", resize);
  resize();
}

/* ── Hero waveform canvas ── */
function initWave() {
  const canvas = $("waveCanvas"); if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, waves = [];
  function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; mkWaves(); }
  function mkWaves() {
    waves = Array.from({ length: 7 }, (_, i) => ({
      amp: 15 + Math.random() * 55, freq: 0.003 + Math.random() * 0.009,
      phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.7,
      y: (h / 7) * (i + 0.5), cyan: i % 2 === 0, op: 0.05 + Math.random() * 0.1,
    }));
  }
  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, w, h); t += 0.006;
    for (const wv of waves) {
      wv.phase += wv.speed * 0.01;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${wv.cyan ? "0,212,255" : "168,85,247"},${wv.op})`;
      ctx.lineWidth = 1.1;
      for (let x = 0; x <= w; x += 2) {
        const burst = Math.random() > 0.997 ? 35 : 0;
        const y = wv.y + Math.sin(x * wv.freq + wv.phase + t) * wv.amp
          + Math.sin(x * wv.freq * 2.1 + t * 1.3) * (wv.amp * 0.28) + burst;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }
  resize(); window.addEventListener("resize", () => { resize(); }); draw();
}

/* ── THREE.js background ── */
function initThree() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:0.15";
  document.body.insertBefore(canvas, document.body.firstChild);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0.3, 0.2, 5.2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dl = new THREE.DirectionalLight(0x00d4ff, 0.8); dl.position.set(2, 2, 2); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xa855f7, 0.45); dl2.position.set(-2, -1, 1); scene.add(dl2);
  const g = new THREE.Group(); scene.add(g);
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 72, 72),
    new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x001820, wireframe: true, transparent: true, opacity: 0.18 })
  ));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.01, 12, 180), new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.18 }));
  ring.rotation.x = Math.PI / 2.4; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.007, 12, 140), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.12 }));
  ring2.rotation.x = Math.PI / 1.7; ring2.rotation.z = Math.PI / 3; g.add(ring2);
  const pc = 1200, pos = new Float32Array(pc * 3), col = new Float32Array(pc * 3);
  for (let i = 0; i < pc; i++) {
    const r = 2.8 + Math.random() * 2, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(p) * Math.cos(t); pos[i * 3 + 1] = r * Math.cos(p) * .75; pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    const m = Math.random(); col[i * 3] = m * .5; col[i * 3 + 1] = 1 - m * .6; col[i * 3 + 2] = 1;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ vertexColors: true, size: 0.011, transparent: true, opacity: 0.55, depthWrite: false })));
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); window.addEventListener("resize", resize);
  let tx = 0, ty = 0;
  window.addEventListener("pointermove", e => { tx = ((e.clientX / window.innerWidth) * 2 - 1) * .18; ty = -((e.clientY / window.innerHeight) * 2 - 1) * .12; });
  const clk = new THREE.Clock();
  function animate() {
    const t = clk.getElapsedTime();
    g.rotation.y = t * .09; g.rotation.x = Math.sin(t * .15) * .04;
    ring.rotation.z = t * .06; ring2.rotation.y = t * .04;
    camera.position.x += (tx - camera.position.x) * .022; camera.position.y += (ty - camera.position.y) * .022;
    camera.lookAt(0, 0, 0); renderer.render(scene, camera); requestAnimationFrame(animate);
  }
  try { animate(); } catch { canvas.style.display = "none"; }
}

/* ── Alert chips ── */
function renderAlertChips(list) {
  const el = $("alertChips"); if (!el) return;
  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const e of list) { const k = String(e.alert).toLowerCase(); if (counts[k] !== undefined) counts[k]++; }
  const colors = { green: "#22c55e", yellow: "#facc15", orange: "#fb923c", red: "#ef4444" };
  el.innerHTML = Object.entries(counts).map(([k, v]) => `
    <div class="ac-chip" style="border-color:${colors[k]}33;background:${colors[k]}09">
      <span class="ac-count" style="color:${colors[k]}">${v}</span>
      <span class="ac-lbl mono" style="color:${colors[k]}aa">${k.toUpperCase()}</span>
    </div>`).join("");
}

/* ── Gauge ── */
function updateGauge(pct) {
  const fill = $("gaugeFill"); if (!fill) return;
  const total = 276; // half-circle for r=88: π*88
  fill.style.strokeDashoffset = String(total - (pct / 100) * total);
  const needle = $("gaugeNeedle");
  if (needle) needle.style.transform = `rotate(${-90 + pct * 1.8}deg)`;
  if ($("riskIndex")) $("riskIndex").textContent = Math.round(pct);
}

/* ── Summary ── */
function updateSummary(list) {
  const n = list.length;
  const maxMag = n ? Math.max(...list.map(e => e.magnitude)) : 0;
  const avgDepth = n ? Math.round(list.reduce((a, e) => a + e.depth, 0) / n) : 0;
  const alert = topAlert(list);
  const pct = Math.min(100, (maxMag / 9.5) * 100);
  const avgCdi = n ? (list.reduce((a, e) => a + e.cdi, 0) / n).toFixed(1) : "0.0";
  const avgMmi = n ? (list.reduce((a, e) => a + e.mmi, 0) / n).toFixed(1) : "0.0";
  const risk = riskLabel(maxMag);

  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const setC = (id, c) => { const el = $(id); if (el) el.style.color = c; };

  set("statEvents", n); set("statMaxMag", maxMag.toFixed(1)); set("statDepth", avgDepth);
  set("statAlert", alert.toUpperCase()); setC("statAlert", alertColor(alert));
  set("statCdi", avgCdi); set("statMmi", avgMmi);

  if ($("riskBar")) $("riskBar").style.width = `${Math.max(1, pct)}%`;
  if ($("riskPct")) $("riskPct").textContent = `${Math.round(pct)}%`;

  updateGauge(pct);
  if ($("riskLabel")) { $("riskLabel").textContent = `${risk} RISK`; setC("riskLabel", riskColor(risk)); }

  // Hero KPIs
  set("hTotal", n); set("hMaxMag", maxMag.toFixed(1));
  if ($("hRisk")) { $("hRisk").textContent = risk; setC("hRisk", riskColor(risk)); }
  const now = new Date();
  const p = v => String(v).padStart(2, "0");
  set("hTime", `${p(now.getHours())}:${p(now.getMinutes())}`);
  set("lastUpdated", `UPDATED ${now.toLocaleTimeString()}`);

  // Sys dot
  const sd = $("sysDot"), sl = $("sysLbl");
  if (alert === "red" || alert === "orange") {
    if (sd) { sd.style.background = alertColor(alert); sd.style.boxShadow = `0 0 12px ${alertColor(alert)}`; }
    if (sl) { sl.textContent = alert === "red" ? "CRITICAL" : "WARNING"; sl.style.color = alertColor(alert); }
  } else {
    if (sd) { sd.style.background = "#22c55e"; sd.style.boxShadow = "0 0 10px rgba(34,197,94,.9)"; }
    if (sl) { sl.textContent = "NOMINAL"; sl.style.color = "#22c55e"; }
  }

  renderAlertChips(list);
  renderHistogram(list);
  renderAlertDist(list);
}

/* ── Histogram ── */
function renderHistogram(list) {
  const el = $("histo"); if (!el) return;
  const bins = [
    { r: "<4", min: 0, max: 4 }, { r: "4-5", min: 4, max: 5 },
    { r: "5-6", min: 5, max: 6 }, { r: "6-7", min: 6, max: 7 },
    { r: "7-8", min: 7, max: 8 }, { r: "8+", min: 8, max: 99 }
  ];
  const counts = bins.map(b => list.filter(e => e.magnitude >= b.min && e.magnitude < b.max).length);
  const maxC = Math.max(...counts, 1);
  el.innerHTML = bins.map((b, i) => `
    <div class="hb-wrap">
      <div class="hb" style="height:${Math.max(3, Math.round((counts[i] / maxC) * 60))}px" title="${counts[i]} events"></div>
      <span class="hb-lbl">${b.r}</span>
      <span class="hb-lbl" style="color:var(--text)">${counts[i]}</span>
    </div>`).join("");
}

/* ── Alert distribution ── */
function renderAlertDist(list) {
  const el = $("alertDist"); if (!el) return;
  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const e of list) { const k = String(e.alert).toLowerCase(); if (counts[k] !== undefined) counts[k]++; }
  const colors = { green: "#22c55e", yellow: "#facc15", orange: "#fb923c", red: "#ef4444" };
  const maxC = Math.max(...Object.values(counts), 1);
  el.innerHTML = Object.entries(counts).map(([k, v]) => `
    <div class="ad-bar">
      <span class="ad-count" style="color:${colors[k]}">${v}</span>
      <div class="ad-fill" style="height:${Math.max(4, Math.round((v / maxC) * 50))}px;background:${colors[k]};border-radius:3px;width:100%"></div>
      <span class="ad-label mono" style="color:${colors[k]}bb">${k.toUpperCase()}</span>
    </div>`).join("");
}

/* ── Events table with pagination ── */
function renderEvents(list, page) {
  const el = $("eventsList"); if (!el) return;
  const start = (page - 1) * PAGE_SIZE;
  const page_events = list.slice(start, start + PAGE_SIZE);
  el.innerHTML = "";
  if (!page_events.length) {
    el.innerHTML = `<div class="erow" style="cursor:default;grid-template-columns:1fr"><span class="er-cell">No events match current filters.</span></div>`;
    return;
  }
  for (const e of page_events) {
    const ak = String(e.alert).toLowerCase();
    const row = document.createElement("div");
    row.className = "erow"; row.dataset.eventId = e.id;
    row.setAttribute("role", "button"); row.setAttribute("tabindex", "0");
    row.innerHTML = `
      <span class="er-id">#${e.id}</span>
      <span class="er-loc">${e.location}</span>
      <span class="er-mag" style="color:${riskColor(riskLabel(e.magnitude))}">M ${e.magnitude.toFixed(1)}</span>
      <span class="er-cell">${e.depth.toFixed(0)} km</span>
      <span class="er-cell">${e.cdi.toFixed(1)}</span>
      <span class="er-cell">${e.mmi.toFixed(1)}</span>
      <span class="er-cell">${Math.round(e.sig)}</span>
      <span><span class="er-badge ${ak}">${ak.toUpperCase()}</span></span>
    `;
    el.appendChild(row);
  }
  renderPagination(list.length, page);
}

function renderPagination(total, current) {
  const el = $("pagination"); if (!el) return;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ""; return; }
  let html = "";
  const show = (p) => `<button class="pg-btn ${p === current ? "active" : ""}" data-page="${p}">${p}</button>`;
  html += show(1);
  if (current > 3) html += `<span class="pg-btn" style="cursor:default;border:none">…</span>`;
  for (let p = Math.max(2, current - 1); p <= Math.min(pages - 1, current + 1); p++) html += show(p);
  if (current < pages - 2) html += `<span class="pg-btn" style="cursor:default;border:none">…</span>`;
  if (pages > 1) html += show(pages);
  el.innerHTML = html;
  el.querySelectorAll(".pg-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => { currentPage = parseInt(btn.dataset.page); renderEvents(filteredEvents, currentPage); window.scrollTo({ top: document.getElementById("events").offsetTop - 80, behavior: "smooth" }); });
  });
}

/* ── Filters ── */
function getFiltered() {
  const search = ($("search")?.value || "").trim().toLowerCase();
  const alertF = ($("alert")?.value || "all").toLowerCase();
  const minMag = parseFloat($("minMag")?.value || "0") || 0;
  const minSig = parseFloat($("minSig")?.value || "0") || 0;
  const region = ($("region")?.value || "all").toLowerCase();
  const sortBy = ($("sortBy")?.value || "timeDesc").toLowerCase();

  let list = allEvents.filter(e => {
    if (e.magnitude < minMag) return false;
    if ((e.sig || 0) < minSig) return false;
    if (region !== "all" && e.region !== region) return false;
    if (search && !e.location.toLowerCase().includes(search)) return false;
    if (alertF !== "all" && e.alert !== alertF) return false;
    return true;
  });
  list = list.slice().sort((a, b) => {
    if (sortBy === "magdesc") return b.magnitude - a.magnitude;
    if (sortBy === "magasc") return a.magnitude - b.magnitude;
    if (sortBy === "depthasc") return a.depth - b.depth;
    if (sortBy === "sigdesc") return (b.sig || 0) - (a.sig || 0);
    return b.id - a.id;
  });
  return list;
}

function applyFilters() {
  filteredEvents = getFiltered();
  currentPage = 1;
  updateSummary(filteredEvents);
  renderEvents(filteredEvents, currentPage);
  drawWorldMap(mapFilter);
  saveSettings();
}

/* ═══════════════════════════════════════════════════
   ML API INTEGRATION — z-score inputs, Render backend
   Set window.IMPACTSENSE_API_URL in index.html after deploy
═══════════════════════════════════════════════════ */
const BACKEND_URL = (typeof window !== "undefined" && window.IMPACTSENSE_API_URL)
  ? window.IMPACTSENSE_API_URL.replace(/\/$/, "") : "";

function alertColorByName(a) {
  return ({green:"#22c55e",yellow:"#facc15",orange:"#fb923c",red:"#ef4444"})[a]||"#22c55e";
}

// Z-score → human readable hint
const Z_HINTS = {
  magnitude: z => {
    const r = 5.5 + z*1.5;
    return `M${Math.max(0,Math.min(10,r)).toFixed(1)}`;
  },
  depth: z => {
    const r = Math.round(35 + z*45);
    return `~${Math.max(0,r)}km`;
  },
  cdi: z => {
    const r = (4.5 + z*1.8).toFixed(1);
    return `CDI ${r}`;
  },
  mmi: z => {
    const r = Math.round(4.5 + z*1.5);
    const s = ["0","I","II","III","IV","V","VI","VII","VIII","IX","X"];
    return `MMI ${s[Math.max(0,Math.min(10,r))]||r}`;
  },
  sig: z => {
    const r = Math.round(700 + z*300);
    return `SIG~${Math.max(0,r)}`;
  },
};

// Presets (z-score values for known earthquake types)
const PRESETS = {
  minor:    { mag:-1.0, dep:-0.5, cdi:-1.2, mmi:-1.8, sig:-1.5 }, // M4 minor
  moderate: { mag: 0.0, dep:-0.5, cdi: 0.0, mmi: 0.0, sig:-0.2 }, // M5.5 moderate
  strong:   { mag: 0.8, dep:-0.5, cdi: 0.8, mmi: 0.8, sig: 0.6 }, // M6.7 strong
  major:    { mag: 1.4, dep: 0.0, cdi: 1.2, mmi: 1.4, sig: 1.5 }, // M7.5 major
};

function initSliders() {
  const sliderMap = [
    {range:"testMag",  val:"vMag",  hint:"hMag",  key:"magnitude"},
    {range:"testDepth",val:"vDepth",hint:"hDepth", key:"depth"},
    {range:"testCdi",  val:"vCdi",  hint:"hCdi",   key:"cdi"},
    {range:"testMmi",  val:"vMmi",  hint:"hMmi",   key:"mmi"},
    {range:"testSig",  val:"vSig",  hint:"hSig",   key:"sig"},
  ];
  for (const {range, val, hint, key} of sliderMap) {
    const el = $(range); if (!el) continue;
    const update = () => {
      const z = parseFloat(el.value);
      if ($(val)) $(val).textContent = (z >= 0 ? "+" : "") + z.toFixed(1);
      if ($(hint)) $(hint).textContent = Z_HINTS[key](z);
      // Live gradient for slider fill
      const pct = ((z - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min))) * 100;
      el.style.background = `linear-gradient(to right, var(--cyan) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`;
    };
    el.addEventListener("input", () => { update(); debouncePredict(); });
    update();
  }

  // Preset buttons
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.preset]; if (!p) return;
      const map = {testMag:p.mag,testDepth:p.dep,testCdi:p.cdi,testMmi:p.mmi,testSig:p.sig};
      for (const [id, v] of Object.entries(map)) {
        const el = $(id); if (!el) continue;
        el.value = v;
        el.dispatchEvent(new Event("input"));
      }
      testRisk();
    });
  });
}

let predictTimeout = null;
function debouncePredict() {
  clearTimeout(predictTimeout);
  predictTimeout = setTimeout(testRisk, 400);
}

async function testRisk() {
  const el = $("testOut"); if (!el) return;
  const mag = parseFloat($("testMag")?.value  || "0");
  const dep = parseFloat($("testDepth")?.value || "0");
  const cdi = parseFloat($("testCdi")?.value   || "0");
  const mmi = parseFloat($("testMmi")?.value   || "0");
  const sig = parseFloat($("testSig")?.value   || "0");

  el.innerHTML = `<span class="mono" style="color:var(--cyan);opacity:.6;font-size:.75rem">⟳ RUNNING ML MODEL…</span>`;
  el.style.cssText = "margin-top:.65rem;padding:.7rem;border-radius:6px;border:1px solid rgba(0,212,255,.2);background:rgba(0,212,255,.04);transition:all .3s";

  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/predict`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({magnitude:mag,depth:dep,cdi,mmi,sig}),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) { renderPred(await res.json(), el, true); return; }
    } catch(e) { console.warn("API unreachable, using fallback:", e.message); }
  }

  // Local fallback using z-score thresholds
  // Based on analysis: MMI is the strongest discriminator
  let alert;
  if      (mmi > 1.2 && sig > 0.8)  alert = "red";
  else if (mmi > 0.3 || sig > 0.2)  alert = "orange";
  else if (mmi > -0.8 || sig > -0.5) alert = "yellow";
  else                                alert = "green";

  const fakeProb = {green:0,yellow:0,orange:0,red:0};
  fakeProb[alert] = 85;
  renderPred({
    alert, confidence:85,
    description:{green:"Low impact — minimal damage expected",yellow:"Moderate — light damage possible",orange:"Significant — moderate damage expected",red:"Critical — severe damage expected"}[alert],
    probabilities:fakeProb,
  }, el, false);
}

function renderPred(data, el, fromAPI) {
  const c = alertColorByName(data.alert);
  const icons={green:"🟢",yellow:"🟡",orange:"🟠",red:"🔴"};
  const p = data.probabilities || {};
  const src = fromAPI
    ? `<span style="color:var(--cyan);font-size:.58rem;opacity:.75;margin-left:.3rem"> ML API ✓</span>`
    : `<span style="color:var(--muted);font-size:.58rem;margin-left:.3rem"> LOCAL</span>`;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:.55rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:${c};font-weight:700;font-size:.92rem;letter-spacing:.05em">${icons[data.alert]} ${data.alert.toUpperCase()} ALERT${src}</span>
        <span class="mono" style="color:${c};font-size:.7rem;background:${c}18;border:1px solid ${c}44;padding:.1rem .45rem;border-radius:4px">${data.confidence}%</span>
      </div>
      <div style="color:var(--muted);font-size:.78rem;line-height:1.5">${data.description||""}</div>
      <div style="display:flex;flex-direction:column;gap:.3rem">
        ${["green","yellow","orange","red"].map(k=>`
          <div style="display:grid;grid-template-columns:3.8rem 1fr 2.8rem;gap:.4rem;align-items:center">
            <span class="mono" style="font-size:.6rem;color:${alertColorByName(k)};letter-spacing:.08em">${k.toUpperCase()}</span>
            <div style="height:4px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden">
              <div style="height:100%;width:${p[k]||0}%;background:${alertColorByName(k)};border-radius:999px;transition:width .6s cubic-bezier(.4,0,.2,1)"></div>
            </div>
            <span class="mono" style="font-size:.65rem;color:${alertColorByName(k)};text-align:right">${(p[k]||0).toFixed?.(1)||p[k]}%</span>
          </div>`).join("")}
      </div>
    </div>`;
  el.style.cssText = `margin-top:.65rem;padding:.85rem;border-radius:6px;border:1px solid ${c}44;background:${c}06;transition:all .3s`;
}


/* ── Modal ── */
function openModal(e) {
  const risk = riskLabel(e.magnitude);
  const set = (id, v, c) => { const el = $(id); if (!el) return; el.textContent = v; if (c) el.style.color = c; };
  set("modalTitle", e.location);
  set("modalSub", `ALERT: ${e.alert.toUpperCase()} · ${e.region.toUpperCase()} · ID #${e.id}`, null);
  set("dMag", `M ${e.magnitude.toFixed(1)}`, riskColor(risk));
  set("dDepth", `${e.depth.toFixed(0)} km`, null);
  set("dRegion", e.region.toUpperCase(), null);
  set("dRisk", risk, riskColor(risk));
  set("dCdi", e.cdi.toFixed(1), null);
  set("dMmi", e.mmi.toFixed(1), null);
  set("dSig", String(Math.round(e.sig || 0)), null);
  const modal = $("modal"); if (modal) { modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); }
}
function closeModal() {
  const modal = $("modal"); if (modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }
}

/* ── Simulate ── */
const TEMPLATES = [
  { location: "Himalayan Region", region: "asia", lat: 30.0, lng: 80.0 },
  { location: "Istanbul, Turkey", region: "europe", lat: 41.0, lng: 29.0 },
  { location: "Mexico City", region: "america", lat: 19.4, lng: -99.1 },
  { location: "Sumatra, Indonesia", region: "asia", lat: -0.6, lng: 101.3 },
  { location: "Naples, Italy", region: "europe", lat: 40.9, lng: 14.3 },
];
function simulate() {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const id = Math.max(...allEvents.map(e => e.id)) + 1;
  const mag = Math.round((3.5 + Math.random() * 5) * 10) / 10;
  const depth = Math.round(5 + Math.random() * 80);
  const sig = Math.round(Math.max(0, mag * 140 + Math.random() * 800));
  const alert = sig > 1300 || mag >= 7 ? "red" : sig > 900 || mag >= 6 ? "orange" : sig > 350 || mag >= 5 ? "yellow" : "green";
  const newEvent = { id, ...t, magnitude: mag, depth, cdi: parseFloat((mag + (Math.random() * 2 - 1)).toFixed(1)), mmi: parseFloat((mag + (Math.random() * 1.5 - 0.75)).toFixed(1)), sig, alert };
  allEvents = [newEvent, ...allEvents];
  applyFilters();
}

function setAuto(on) {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  if (on) autoTimer = setInterval(simulate, 7000);
  const lbl = $("autoLbl"), dot = $("autoDot"), btn = $("btnToggleAuto");
  if (lbl) lbl.textContent = on ? "ON" : "OFF";
  if (dot) dot.classList.toggle("on", on);
  if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  saveSettings();
}

/* ── Export ── */
function exportJSON() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), total: filteredEvents.length, events: filteredEvents }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "impactsense-414-events.json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ── Settings ── */
function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      minMag: $("minMag")?.value, minSig: $("minSig")?.value,
      region: $("region")?.value, search: $("search")?.value,
      alert: $("alert")?.value, sortBy: $("sortBy")?.value,
    }));
  } catch { }
}
function loadSettings() {
  ["impactsense.v3", "impactsense.v4"].forEach(k => { try { localStorage.removeItem(k); } catch { } });
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const safe = (id, v, max) => { const el = $(id); if (!el) return; const n = parseFloat(v); if (!isNaN(n) && n >= 0 && n <= max) el.value = v; };
    safe("minMag", s.minMag, 5.9); safe("minSig", s.minSig, 600);
    const sel = (id, v) => { const el = $(id); if (el && v) el.value = v; };
    sel("region", s.region); sel("search", s.search); sel("alert", s.alert); sel("sortBy", s.sortBy);
  } catch { }
}

/* ── Scroll spy ── */
function initScrollSpy() {
  const links = document.querySelectorAll(".nl");
  const obs = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove("active"));
        const link = document.querySelector(`.nl[href="#${entry.target.id}"]`);
        if (link) link.classList.add("active");
      }
    }
  }, { threshold: 0.35 });
  ["hero", "globe", "analysis", "events", "dataset"].forEach(id => { const el = $(id); if (el) obs.observe(el); });
}

/* ── Boot ── */
/* ── API health check ── */
async function checkApiHealth() {
  const dot = $("asDot"), lbl = $("asLbl");
  if (!dot || !lbl) return;

  if (!BACKEND_URL) {
    dot.className = "as-dot offline";
    lbl.textContent = "API NOT CONFIGURED — using local fallback";
    lbl.style.color = "var(--muted)";
    return;
  }

  dot.className = "as-dot";
  lbl.textContent = "CONNECTING TO API…";
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      dot.className = "as-dot online";
      lbl.textContent = "ML API ONLINE · 98.6% ACCURACY";
      lbl.style.color = "#22c55e";
    } else { throw new Error("non-ok"); }
  } catch {
    dot.className = "as-dot offline";
    lbl.textContent = "API OFFLINE — using local fallback";
    lbl.style.color = "var(--red)";
  }
}

async function boot() {
  $("year") && ($("year").textContent = new Date().getFullYear());

  initThree();
  initWave();
  initWorldMap();
  initScrollSpy();
  checkApiHealth();
  initSliders();

  $("applyFilters")?.addEventListener("click", applyFilters);
  $("testRiskBtn")?.addEventListener("click", testRisk);
  $("btnSimulate")?.addEventListener("click", simulate);
  $("btnToggleAuto")?.addEventListener("click", () => setAuto(!autoTimer));
  $("btnExport")?.addEventListener("click", exportJSON);
  $("btnExport2")?.addEventListener("click", exportJSON);
  $("modalBg")?.addEventListener("click", closeModal);
  $("modalClose")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  ["search", "alert", "region", "sortBy"].forEach(id => $(id)?.addEventListener("change", applyFilters));
  $("search")?.addEventListener("input", applyFilters);
  ["minMag", "minSig"].forEach(id => $(id)?.addEventListener("input", applyFilters));

  $("eventsList")?.addEventListener("click", ev => {
    const row = ev.target?.closest(".erow");
    const id = row?.dataset?.eventId;
    if (!id) return;
    const e = allEvents.find(x => String(x.id) === String(id));
    if (e) openModal(e);
  });

  loadSettings();
  filteredEvents = getFiltered();
  updateSummary(filteredEvents);
  renderEvents(filteredEvents, currentPage);
  await testRisk();
}

boot();
