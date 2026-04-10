import * as THREE from 'three';

export function createHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <style>
      #hud { position: fixed; inset: 0; pointer-events: none; color: #0f0;
        font-family: 'Courier New', monospace; font-size: 12px;
        text-shadow: 0 0 3px #0f0, 0 0 6px #000; }
      #hud.hidden { display: none; }
      #hud .panel { position: absolute; padding: 8px 12px;
        background: rgba(0,10,0,0.38); border: 1px solid rgba(0,255,0,0.4);
        border-radius: 4px; backdrop-filter: blur(3px); min-width: 220px; }
      #hud #topleft { top: 10px; left: 10px; }
      #hud #topright { top: 10px; right: 10px; text-align: right; }
      #hud #bottomleft { bottom: 70px; left: 10px; font-size: 11px; }
      #hud #bottomright { bottom: 70px; right: 10px; text-align: right; font-size: 10px; color: #9f9; min-width: 280px; }
      #hud .label { color: #6f6; }
      #hud .val { color: #cfc; }
      #hud .big { font-size: 15px; color: #fff; margin-bottom: 4px; }
      #hud .warp { color: #ff0; font-weight: bold; }
      #hud .thrust { color: #f90; }
      #hud .danger { color: #f44; font-weight: bold; }
      #hud .marker { position: absolute; transform: translate(-50%, -50%);
        font-size: 10px; color: #0ff; text-shadow: 0 0 3px #000; white-space: nowrap;
        pointer-events: none; }
      #hud .marker .m-name { background: rgba(0,0,0,0.5); padding: 1px 4px; border: 1px solid #0ff44; border-radius: 2px; }
      #hud .reticle { position: absolute; left: 50%; top: 50%; width: 36px; height: 36px;
        margin: -18px 0 0 -18px; border: 1px solid rgba(0,255,0,0.4); border-radius: 50%; }
      #hud .reticle::before { content: ''; position: absolute; left: 50%; top: -10px;
        width: 1px; height: 56px; margin-left: -0.5px; background: rgba(0,255,0,0.4); }
      #hud .reticle::after { content: ''; position: absolute; top: 50%; left: -10px;
        width: 56px; height: 1px; margin-top: -0.5px; background: rgba(0,255,0,0.4); }
    </style>
    <div class="panel" id="topleft">
      <div class="big" id="hud-nearest">—</div>
      <div><span class="label">ALT    :</span> <span class="val" id="hud-alt">—</span></div>
      <div><span class="label">DIST   :</span> <span class="val" id="hud-dist">—</span></div>
      <div><span class="label">V rel  :</span> <span class="val" id="hud-vrel">—</span></div>
      <div><span class="label">V sun  :</span> <span class="val" id="hud-vsun">—</span></div>
      <div><span class="label">ACCEL  :</span> <span class="val" id="hud-accel">—</span></div>
    </div>
    <div class="panel" id="topright">
      <div><span class="label">TIME :</span> <span class="val" id="hud-time">—</span></div>
      <div><span class="label">WARP :</span> <span class="warp" id="hud-warp">x1</span></div>
      <div><span class="label">THRUST:</span> <span class="thrust" id="hud-thrust">0 N</span></div>
      <div><span class="label">FOV  :</span> <span class="val" id="hud-fov">60°</span></div>
      <div><span class="label">CAM  :</span> <span class="val" id="hud-cam">chase</span></div>
      <div><span class="label">TRAJ :</span> <span class="val" id="hud-traj">5x</span></div>
    </div>
    <div class="reticle"></div>
    <div class="panel" id="bottomright">
      <b>NAV</b>  [WASD] pitch/yaw  [QE] roll<br>
      <b>ENG</b>  [Shift/Ctrl] thrust  [Space] full  [X] cutoff<br>
      <b>Δv</b>   [+/-] ±100 m/s nose  [K] killvel  [V] set speed<br>
      <b>TIME</b> [. ,] warp  [wheel] warp (outside RMB)<br>
      <b>VIEW</b> [mouse] orbit around ship  [T] telescope mode<br>
      <b>ZOOM</b> [wheel] orbit distance / telescope FOV<br>
      <b>UI</b>   [H] HUD  [M] markers  [Y] trajectory  [O] orbits  [P] autopilot<br>
      <b>TRAJ</b> [ [ / ] ] length × (0.5..100)
    </div>
    <div id="markers"></div>
  `;
  document.body.appendChild(root);

  const el = (id) => document.getElementById(id);
  return {
    root,
    nearest: el('hud-nearest'), alt: el('hud-alt'), dist: el('hud-dist'),
    vrel: el('hud-vrel'), vsun: el('hud-vsun'), accel: el('hud-accel'),
    time: el('hud-time'), warp: el('hud-warp'), thrust: el('hud-thrust'),
    fov: el('hud-fov'), cam: el('hud-cam'), traj: el('hud-traj'),
    markers: el('markers'),
    visible: true, markersVisible: true,
  };
}

function fmtDist(m) {
  if (m < 1000) return `${m.toFixed(0)} m`;
  if (m < 1e6) return `${(m/1000).toFixed(2)} km`;
  if (m < 1e9) return `${(m/1e6).toFixed(2)} Mm`;
  if (m < 1.5e11) return `${(m/1e9).toFixed(2)} Gm`;
  return `${(m/1.495978707e11).toFixed(3)} AU`;
}
function fmtSpeed(v) {
  if (v < 10) return `${v.toFixed(2)} m/s`;
  if (v < 1000) return `${v.toFixed(1)} m/s`;
  return `${(v/1000).toFixed(2)} km/s`;
}
function fmtThrust(n) {
  if (n === 0) return '0 N';
  if (n < 1e3) return `${n.toFixed(0)} N`;
  if (n < 1e6) return `${(n/1e3).toFixed(1)} kN`;
  if (n < 1e9) return `${(n/1e6).toFixed(2)} MN`;
  return `${(n/1e9).toFixed(2)} GN`;
}
function fmtTime(simSeconds) {
  const ms = 946728000000 + simSeconds * 1000;
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}
function fmtFov(deg) {
  // Адаптивный формат: большие FOV в градусах, мелкие в минутах/секундах
  if (deg >= 1) return `${deg.toFixed(1)}°`;
  if (deg >= 1/60) return `${(deg * 60).toFixed(1)}'`;   // угловые минуты
  return `${(deg * 3600).toFixed(1)}"`;                   // угловые секунды
}

export function updateHud(hud, info) {
  if (!hud.visible) return;
  hud.nearest.textContent = info.nearest;
  hud.alt.textContent = fmtDist(info.altitude);
  hud.dist.textContent = fmtDist(info.distance);
  hud.vrel.textContent = fmtSpeed(info.vrel);
  hud.vsun.textContent = fmtSpeed(info.vsun);
  hud.accel.textContent = `${info.accel.toFixed(2)} m/s²`;
  hud.time.textContent = fmtTime(info.simTime);
  hud.warp.textContent = `x${info.warp >= 100 ? Math.round(info.warp).toLocaleString() : info.warp.toFixed(1)}`;
  hud.thrust.textContent = fmtThrust(info.thrust);
  // FOV + zoom множитель
  const zoomX = 90 / info.fov;
  hud.fov.textContent = `${fmtFov(info.fov)} (${zoomX < 10 ? zoomX.toFixed(1) : Math.round(zoomX).toLocaleString()}x)`;
  hud.cam.textContent = info.camMode === 'telescope' ? 'TELESCOPE' : 'orbit';
  hud.traj.textContent = `${info.trajMult.toFixed(1)}x`;

  if (hud.markersVisible) {
    hud.markers.innerHTML = info.markers.map((m) =>
      `<div class="marker" style="left:${m.x}px;top:${m.y}px"><span class="m-name">${m.name}</span><br>${fmtDist(m.dist)}</div>`
    ).join('');
  } else {
    hud.markers.innerHTML = '';
  }
}

export function toggleHud(hud) {
  hud.visible = !hud.visible;
  hud.root.classList.toggle('hidden', !hud.visible);
  // Прячем вообще все оверлеи: тректорию и автопилот тоже
  const ap = document.getElementById('autopilot');
  if (ap) ap.style.display = hud.visible ? '' : 'none';
}
export function toggleMarkers(hud) { hud.markersVisible = !hud.markersVisible; if (!hud.markersVisible) hud.markers.innerHTML = ''; }

export function computeMarkers(bodyPositions, shuttle, camera) {
  const out = [];
  const origin = shuttle.pos;
  for (const [name, pos] of bodyPositions) {
    const rel = new THREE.Vector3(pos.x - origin.x, pos.y - origin.y, pos.z - origin.z);
    const dist = rel.length();
    const sp = rel.clone().project(camera);
    if (sp.z > 1 || sp.z < -1) continue;
    const x = (sp.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-sp.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -50 || x > window.innerWidth + 50 || y < -50 || y > window.innerHeight + 50) continue;
    out.push({ name, dist, x, y });
  }
  return out;
}
