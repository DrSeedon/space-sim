import * as THREE from 'three';
import { createRenderer, updateScene } from './renderer.js';
import { computeAllBodies, integrateShuttle, findNearestBody, nowSimSeconds } from './physics.js';
import {
  createShuttle, updateShuttleAttitude, thrustAccel,
  applyDeltaV, killVel, setSpeedMagnitude, pointAt,
} from './shuttle.js';
import { createInput, consumeToggle, consumeMouseDelta, consumeWheel } from './controls.js';
import { createWarp, warpMultiplier, warpStep, clampWarpNearBody } from './timewarp.js';
import { createHud, updateHud, toggleHud, toggleMarkers, computeMarkers } from './hud.js';
import { createShipModel, updateEngineGlow, getNozzleWorldPositions } from './ship.js';
import { createExhaust } from './exhaust.js';
import { createCam, updateCamera, toggleMode } from './camera.js';
import { createTrajectory, updateTrajectory, refreshTrajectoryGeometry, addTrajectoryToScene, setTrajectoryVisible, setPeriodsMultiplier } from './trajectory.js';
import { createBodyOrbits, addBodyOrbitsToScene, refreshBodyOrbits, setBodyOrbitsVisible } from './bodyorbits.js';
import { createStarfield } from './stars.js';
import { createAutopilotUI } from './autopilot.js';

const canvas = document.getElementById('canvas');
const ctx = createRenderer(canvas);

let simTime = nowSimSeconds();
const shuttle = createShuttle(simTime);
const input = createInput();
const warp = createWarp();
const hud = createHud();
const cam = createCam();

// Корабль
const { group: shipGroup, nozzles } = createShipModel();
ctx.scene.add(shipGroup);

// Выхлоп
const exhaust = createExhaust();
ctx.scene.add(exhaust.points);

// Траектория (3 линии: Солнце, ближайшая планета, ближайший спутник)
const traj = createTrajectory();
addTrajectoryToScene(traj, ctx.scene);
updateTrajectory(traj, shuttle, simTime);

// Орбиты всех тел (статические эллипсы планет + лун)
const bodyOrbits = createBodyOrbits();
addBodyOrbitsToScene(bodyOrbits, ctx.scene);

// Реальные звёзды из каталога HYG (async)
createStarfield().then(({ points, count }) => {
  ctx.scene.add(points);
  console.log(`[space-sim] loaded ${count} real stars`);
}).catch((e) => console.error('[space-sim] starfield failed:', e));

// Автопилот
const shuttleRef = { shuttle, pointTarget: null };
const ap = createAutopilotUI(shuttleRef, () => simTime);

// --- FOV / телескоп ---
const BASE_FOV = 90;
const MIN_FOV = 0.0005;   // ~180000x зум
let currentFov = BASE_FOV;

let lastRealTime = performance.now() / 1000;
let trajUpdateTimer = 0;

// Set speed диалог (вызов через V)
function askSetSpeed() {
  const s = prompt('Set speed magnitude (m/s) relative to nearest body — direction preserved:', '1000');
  if (s === null) return;
  const v = parseFloat(s);
  if (Number.isFinite(v) && v >= 0) setSpeedMagnitude(shuttle, v, simTime);
}

function frame() {
  const now = performance.now() / 1000;
  const realDtRaw = now - lastRealTime;   // для варпа: реальное прошедшее время
  const realDt = Math.min(0.05, realDtRaw);   // для физики/управления: clamp чтобы при лаге не было скачков
  lastRealTime = now;

  // --- Управление: поворот и тяга ---
  updateShuttleAttitude(shuttle, input, realDt);

  // Тяга (Ньютоны) — плавное изменение без капа
  if (input.thrustUp) shuttle.thrust += shuttle.baseThrust * realDt * 2;
  if (input.thrustDown) shuttle.thrust -= shuttle.baseThrust * realDt * 2;
  if (input.thrustMax) shuttle.thrust = Math.max(shuttle.thrust, shuttle.baseThrust * 5);
  if (input.cutoff) shuttle.thrust = 0;
  shuttle.thrust = Math.max(0, shuttle.thrust);

  // Delta-v ±100 м/с (continuous while held, чтобы было удобнее)
  if (input.deltaVPlus) applyDeltaV(shuttle, 100 * realDt * 10);   // ~1 км/с за секунду удержания
  if (input.deltaVMinus) applyDeltaV(shuttle, -100 * realDt * 10);

  // Одноразовые
  if (consumeToggle(input, 'killVel')) killVel(shuttle, simTime);
  if (consumeToggle(input, 'setSpeed')) askSetSpeed();
  if (consumeToggle(input, 'toggleHud')) {
    toggleHud(hud);
    // Скрываем/показываем траектории и орбиты тел вместе с HUD.
    // Сохраняем user-visibility чтобы при повторном H вернуть к тому же состоянию.
    if (hud.visible) {
      if (hud._savedTrajVisible !== undefined) setTrajectoryVisible(traj, hud._savedTrajVisible);
      if (hud._savedOrbitsVisible !== undefined) setBodyOrbitsVisible(bodyOrbits, hud._savedOrbitsVisible);
    } else {
      hud._savedTrajVisible = traj.visible;
      hud._savedOrbitsVisible = bodyOrbits.visible;
      setTrajectoryVisible(traj, false);
      setBodyOrbitsVisible(bodyOrbits, false);
    }
  }
  if (consumeToggle(input, 'toggleMarkers')) toggleMarkers(hud);
  if (consumeToggle(input, 'toggleTraj')) {
    setTrajectoryVisible(traj, !traj.visible);
  }
  if (consumeToggle(input, 'toggleAutopilot')) ap.toggle();
  if (consumeToggle(input, 'toggleTelescope')) toggleMode(cam, shuttle);
  if (consumeToggle(input, 'toggleBodyOrbits')) setBodyOrbitsVisible(bodyOrbits, !bodyOrbits.visible);

  // Time warp (только клавиши . ,)
  if (input.warpUp) warpStep(warp, realDt * 1.5);
  if (input.warpDown) warpStep(warp, -realDt * 1.5);

  // Множитель длины траектории ([ ])
  if (input.trajLonger) {
    setPeriodsMultiplier(traj, traj.periodsMultiplier * (1 + realDt * 1.2));
    trajUpdateTimer = 0;   // сразу пересчитать
  }
  if (input.trajShorter) {
    setPeriodsMultiplier(traj, traj.periodsMultiplier / (1 + realDt * 1.2));
    trajUpdateTimer = 0;
  }

  // Autopilot: point at
  if (shuttleRef.pointTarget) {
    pointAt(shuttle, shuttleRef.pointTarget, simTime, realDt);
    // отменить через 5 сек или когда угол < 1°
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
    // для простоты просто сбрасываем через 3 сек
    shuttleRef.pointTimer = (shuttleRef.pointTimer || 0) + realDt;
    if (shuttleRef.pointTimer > 3) {
      shuttleRef.pointTarget = null;
      shuttleRef.pointTimer = 0;
    }
  }

  // Колесо: в orbit-режиме — отдаление камеры, в telescope — FOV зум
  const wheel = consumeWheel(input);
  if (wheel !== 0) {
    if (cam.mode === 'telescope') {
      const factor = Math.exp(wheel * 0.0015);
      const next = currentFov * factor;
      if (Number.isFinite(next) && next > 0) {
        currentFov = Math.max(MIN_FOV, Math.min(BASE_FOV, next));
      }
    } else {
      const factor = Math.exp(wheel * 0.001);
      const next = cam.distance * factor;
      if (Number.isFinite(next) && next > 0) {
        cam.distance = Math.max(20, next);
      }
    }
  }

  ctx.camera.fov = currentFov;
  ctx.camera.updateProjectionMatrix();

  // --- Физика ---
  const mult = warpMultiplier(warp);
  // Для simTime используем нерезаный realDt — чтобы при лагах не терять время
  const simDt = realDtRaw * mult;
  simTime += simDt;

  const bodyPositions = computeAllBodies(simTime);
  const nearest = findNearestBody(shuttle.pos, bodyPositions);

  // Подшаги для шаттла
  const speed = Math.hypot(shuttle.vel.x, shuttle.vel.y, shuttle.vel.z);
  const maxSubDt = Math.max(0.1, nearest.altitude / Math.max(speed, 1) / 50);
  const nSub = Math.max(1, Math.ceil(simDt / maxSubDt));
  const dtPer = simDt / nSub;
  const thrust = thrustAccel(shuttle);
  for (let i = 0; i < nSub; i++) {
    integrateShuttle(shuttle, bodyPositions, thrust, dtPer);
  }

  // --- Камера ---
  const mouseDelta = consumeMouseDelta(input);
  // fovRatio: 1 при нормальном FOV, 0.001 при макс зуме → чувствительность пропорционально
  const fovRatio = currentFov / BASE_FOV;
  const camInfo = updateCamera(cam, shuttle, mouseDelta, fovRatio);

  // --- Корабль (в camera-relative, всегда в origin шаттла) ---
  shipGroup.position.set(0, 0, 0);
  shipGroup.quaternion.copy(shuttle.quaternion);
  shipGroup.updateMatrixWorld(true);
  // в режиме телескопа скрываем корабль (мешает обзору)
  shipGroup.visible = cam.mode !== 'telescope';

  // Engine glow proportionally to thrust vs base
  const throttleNorm = Math.min(1, shuttle.thrust / shuttle.baseThrust);
  updateEngineGlow(nozzles, throttleNorm);

  // --- Выхлоп ---
  // Сдвиг существующих частиц при движении шаттла (они в координатах относительно шаттла)
  // Здесь удобнее держать частицы в camera-relative: они спавнятся в локальных коорд корабля,
  // и каждый кадр "сдвигаются" на -shuttle_delta_pos, так как шаттл всегда в origin.
  // Проще: держим частицы в мировых (относительно текущего shuttle.pos), без сдвига не нужно.
  exhaust.update(realDt, camInfo.pos);

  if (throttleNorm > 0.01) {
    // спавним частицы у каждого сопла в camera-relative координатах
    // (шаттл всегда в origin 0,0,0 → позиции сопел через matrixWorld тоже camera-relative)
    const nozzleLocalPositions = getNozzleWorldPositions(shipGroup, nozzles);
    // направление выхлопа — по +Z шаттла (назад) в world-relative координатах
    // поскольку шаттл в origin, направление это просто поворот через quaternion
    const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(shuttle.quaternion);
    for (const lp of nozzleLocalPositions) {
      exhaust.spawn(lp, backDir, throttleNorm);
    }
  }

  // --- Траектория (раз в полсекунды) ---
  trajUpdateTimer -= realDt;
  if (trajUpdateTimer <= 0 && traj.visible) {
    updateTrajectory(traj, shuttle, simTime);
    trajUpdateTimer = 0.5;
  }
  if (traj.visible) refreshTrajectoryGeometry(traj, shuttle.pos, simTime);
  refreshBodyOrbits(bodyOrbits, shuttle.pos, simTime);

  // --- Рендер ---
  updateScene(ctx, bodyPositions, shuttle, camInfo.pos, camInfo.quat, simTime);
  ctx.composer.render();

  // --- HUD ---
  const bpNear = bodyPositions.get(nearest.body.name);
  const bpNearSoon = computeAllBodies(simTime + 1).get(nearest.body.name);
  const bodyVel = {
    x: bpNearSoon.x - bpNear.x,
    y: bpNearSoon.y - bpNear.y,
    z: bpNearSoon.z - bpNear.z,
  };
  const vrel = Math.hypot(shuttle.vel.x - bodyVel.x, shuttle.vel.y - bodyVel.y, shuttle.vel.z - bodyVel.z);
  const vsun = Math.hypot(shuttle.vel.x, shuttle.vel.y, shuttle.vel.z);
  const accelMag = Math.hypot(thrust.x, thrust.y, thrust.z);

  updateHud(hud, {
    nearest: nearest.body.name,
    altitude: nearest.altitude,
    distance: nearest.distance,
    vrel, vsun,
    accel: accelMag,
    simTime,
    warp: mult,
    thrust: shuttle.thrust,
    fov: currentFov,
    camMode: cam.mode,
    trajMult: traj.periodsMultiplier,
    markers: computeMarkers(bodyPositions, shuttle, ctx.camera),
  });

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
