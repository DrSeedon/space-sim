import * as THREE from 'three';
import { G, SUN, BODIES } from './constants.js';
import { computeAllBodies, bodyPosition } from './physics.js';

// Три траектории разными цветами:
// - Жёлтая: вокруг Солнца (доминирующее — Солнце)
// - Зелёная: вокруг ближайшей планеты
// - Голубая: вокруг ближайшего спутника этой планеты

const NUM_POINTS = 400;
const MAX_TOTAL_TIME = 20 * 365.25 * 86400;   // до 20 лет

function makeLine(color) {
  const positions = new Float32Array(NUM_POINTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9,
    depthWrite: false, depthTest: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 999;
  geo.setDrawRange(0, 0);
  return { line, geo, positions, relPoints: null, dominantName: null, validCount: 0 };
}

export function createTrajectory() {
  return {
    sun: makeLine(0xffdd40),       // жёлтая — Солнце
    planet: makeLine(0x40ff60),    // зелёная — планета
    moon: makeLine(0x40c8ff),      // голубая — луна
    visible: true,
    lastUpdate: -1,
    periodsMultiplier: 5,          // сколько орбитальных периодов показывать
  };
}

// Найти ближайшую планету (не луну, не Солнце)
function findNearestPlanet(shuttlePos, bodyPositions) {
  const planetNames = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  let best = null, minD = Infinity;
  for (const name of planetNames) {
    const p = bodyPositions.get(name);
    const d = Math.hypot(p.x - shuttlePos.x, p.y - shuttlePos.y, p.z - shuttlePos.z);
    if (d < minD) { minD = d; best = name; }
  }
  return best;
}

// Найти ближайший спутник данной планеты (или null если спутников нет)
function findNearestMoon(planetName, shuttlePos, bodyPositions) {
  const moons = BODIES.filter((b) => b.parent === planetName).map((b) => b.name);
  if (moons.length === 0) return null;
  let best = null, minD = Infinity;
  for (const name of moons) {
    const p = bodyPositions.get(name);
    const d = Math.hypot(p.x - shuttlePos.x, p.y - shuttlePos.y, p.z - shuttlePos.z);
    if (d < minD) { minD = d; best = name; }
  }
  return best;
}

// Оценка периода через vis-viva, с учётом относительной скорости шаттла
// относительно центрального тела.
function estimatePeriod(pos, vel, centerName, simTime) {
  let centerPos = { x: 0, y: 0, z: 0 };
  let centerVel = { x: 0, y: 0, z: 0 };
  let mass;
  if (centerName === 'Sun') {
    mass = SUN.mass;
  } else {
    const b = BODIES.find((x) => x.name === centerName);
    centerPos = bodyPosition(b, simTime);
    const p2 = bodyPosition(b, simTime + 1);
    centerVel = { x: p2.x - centerPos.x, y: p2.y - centerPos.y, z: p2.z - centerPos.z };
    mass = b.mass;
  }
  const dx = pos.x - centerPos.x, dy = pos.y - centerPos.y, dz = pos.z - centerPos.z;
  const r = Math.hypot(dx, dy, dz);
  const rVx = vel.x - centerVel.x, rVy = vel.y - centerVel.y, rVz = vel.z - centerVel.z;
  const v2 = rVx*rVx + rVy*rVy + rVz*rVz;
  const mu = G * mass;
  const invA = 2/r - v2/mu;
  if (invA <= 0) return 6 * 3600;
  const a = 1 / invA;
  return 2 * Math.PI * Math.sqrt(a*a*a / mu);
}

// Velocity Verlet с полной гравитацией всех тел. Траектория сохраняется
// относительно centerName (в его системе отсчёта). Это даёт правильные
// возмущения от других планет/лун, но точность зависит от dt.
function computeTrack(track, shuttle, simTime, centerName, periodsMult) {
  if (!centerName) {
    track.validCount = 0;
    track.geo.setDrawRange(0, 0);
    track.dominantName = null;
    track.relPoints = null;
    return;
  }

  const pos = { x: shuttle.pos.x, y: shuttle.pos.y, z: shuttle.pos.z };
  const vel = { x: shuttle.vel.x, y: shuttle.vel.y, z: shuttle.vel.z };

  const period = estimatePeriod(pos, vel, centerName, simTime);
  const totalTime = Math.min(Math.max(period * periodsMult, 600), MAX_TOTAL_TIME);
  const dt = totalTime / NUM_POINTS;

  function domPos(t) {
    if (centerName === 'Sun') return { x: 0, y: 0, z: 0 };
    const b = BODIES.find((x) => x.name === centerName);
    return bodyPosition(b, t);
  }

  function accel(p, t) {
    const bp = computeAllBodies(t);
    let ax = 0, ay = 0, az = 0;
    const all = [{ name: 'Sun', mass: SUN.mass, radius: SUN.radius }, ...BODIES];
    for (const b of all) {
      const bpp = bp.get(b.name);
      const dx = bpp.x - p.x, dy = bpp.y - p.y, dz = bpp.z - p.z;
      const r2 = dx*dx + dy*dy + dz*dz;
      const r = Math.sqrt(r2);
      if (r < b.radius) return { x: 0, y: 0, z: 0, crashed: true };
      const f = G * b.mass / (r2 * r);
      ax += f * dx; ay += f * dy; az += f * dz;
    }
    return { x: ax, y: ay, z: az, crashed: false };
  }

  const relPts = [];
  let a = accel(pos, simTime);
  let crashed = a.crashed;

  for (let i = 0; i < NUM_POINTS; i++) {
    const dp = domPos(simTime + i * dt);
    relPts.push({ x: pos.x - dp.x, y: pos.y - dp.y, z: pos.z - dp.z });
    if (crashed) continue;

    pos.x += vel.x * dt + 0.5 * a.x * dt * dt;
    pos.y += vel.y * dt + 0.5 * a.y * dt * dt;
    pos.z += vel.z * dt + 0.5 * a.z * dt * dt;

    const aNew = accel(pos, simTime + (i + 1) * dt);
    if (aNew.crashed) { crashed = true; continue; }
    vel.x += 0.5 * (a.x + aNew.x) * dt;
    vel.y += 0.5 * (a.y + aNew.y) * dt;
    vel.z += 0.5 * (a.z + aNew.z) * dt;
    a = aNew;
  }

  track.relPoints = relPts;
  track.dominantName = centerName;
  track.validCount = relPts.length;
  track.geo.setDrawRange(0, track.validCount);
}

export function updateTrajectory(traj, shuttle, simTime) {
  const bp = computeAllBodies(simTime);

  const nearestPlanet = findNearestPlanet(shuttle.pos, bp);
  const nearestMoon = nearestPlanet ? findNearestMoon(nearestPlanet, shuttle.pos, bp) : null;

  const m = traj.periodsMultiplier;
  computeTrack(traj.sun, shuttle, simTime, 'Sun', m);
  computeTrack(traj.planet, shuttle, simTime, nearestPlanet, m);
  computeTrack(traj.moon, shuttle, simTime, nearestMoon, m);

  traj.lastUpdate = simTime;
}

export function setPeriodsMultiplier(traj, mult) {
  traj.periodsMultiplier = Math.max(0.5, Math.min(100, mult));
}

function refreshOne(track, shuttlePos, simTime) {
  if (!track.relPoints || !track.dominantName) return;
  const { positions, geo } = track;

  let domX = 0, domY = 0, domZ = 0;
  if (track.dominantName !== 'Sun') {
    const b = BODIES.find((x) => x.name === track.dominantName);
    const p = bodyPosition(b, simTime);
    domX = p.x; domY = p.y; domZ = p.z;
  }

  const n = track.relPoints.length;
  for (let i = 0; i < n; i++) {
    const p = track.relPoints[i];
    positions[i*3+0] = (p.x + domX) - shuttlePos.x;
    positions[i*3+1] = (p.y + domY) - shuttlePos.y;
    positions[i*3+2] = (p.z + domZ) - shuttlePos.z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeBoundingSphere();
}

export function refreshTrajectoryGeometry(traj, shuttlePos, simTime) {
  refreshOne(traj.sun, shuttlePos, simTime);
  refreshOne(traj.planet, shuttlePos, simTime);
  refreshOne(traj.moon, shuttlePos, simTime);
}

export function setTrajectoryVisible(traj, visible) {
  traj.visible = visible;
  traj.sun.line.visible = visible;
  traj.planet.line.visible = visible;
  traj.moon.line.visible = visible;
}

export function addTrajectoryToScene(traj, scene) {
  scene.add(traj.sun.line);
  scene.add(traj.planet.line);
  scene.add(traj.moon.line);
}
