import * as THREE from 'three';
import { G, BODIES, SHUTTLE_INIT, DEFAULT_ORBIT_ALTITUDES, SUN } from './constants.js';
import { bodyPosition, computeAllBodies } from './physics.js';

// Создание шаттла на стартовой орбите
export function createShuttle(t0) {
  const earth = BODIES.find((b) => b.name === 'Earth');
  const earthPos = bodyPosition(earth, t0);
  const r = earth.radius + SHUTTLE_INIT.altitude;
  const vCirc = Math.sqrt(G * earth.mass / r);

  const pos = { x: earthPos.x + r, y: earthPos.y, z: earthPos.z };
  const inc = SHUTTLE_INIT.inclination;
  const vel = { x: 0, y: vCirc * Math.cos(inc), z: vCirc * Math.sin(inc) };

  // добавить скорость Земли отн. Солнца
  const dt = 1;
  const earthPos2 = bodyPosition(earth, t0 + dt);
  vel.x += (earthPos2.x - earthPos.x) / dt;
  vel.y += (earthPos2.y - earthPos.y) / dt;
  vel.z += (earthPos2.z - earthPos.z) / dt;

  return {
    pos, vel,
    quaternion: new THREE.Quaternion(),
    thrust: 0,                      // текущая тяга в Ньютонах
    maxThrust: Infinity,            // без капа
    baseThrust: SHUTTLE_INIT.thrust,
    mass: SHUTTLE_INIT.mass,
  };
}

// Поворот корабля по инпуту
export function updateShuttleAttitude(shuttle, input, dt) {
  const rotSpeed = 0.8;
  const q = shuttle.quaternion;
  if (input.pitch) {
    const pq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), input.pitch * rotSpeed * dt);
    q.multiply(pq);
  }
  if (input.yaw) {
    const yq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), input.yaw * rotSpeed * dt);
    q.multiply(yq);
  }
  if (input.roll) {
    const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), input.roll * rotSpeed * dt);
    q.multiply(rq);
  }
  q.normalize();
}

// Вектор ускорения от тяги (в м/с²)
export function thrustAccel(shuttle) {
  if (shuttle.thrust === 0) return { x: 0, y: 0, z: 0 };
  const a = shuttle.thrust / shuttle.mass;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
  return { x: dir.x * a, y: dir.y * a, z: dir.z * a };
}

// Мгновенно добавить delta-v по носу
export function applyDeltaV(shuttle, amount) {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
  shuttle.vel.x += dir.x * amount;
  shuttle.vel.y += dir.y * amount;
  shuttle.vel.z += dir.z * amount;
}

// Обнулить скорость относительно ближайшего тела
export function killVel(shuttle, simTime) {
  const positions = computeAllBodies(simTime);
  // найти ближайшее
  let nearest = null, minD = Infinity;
  const all = [{ name: 'Sun', mass: SUN.mass }, ...BODIES];
  for (const b of all) {
    const p = positions.get(b.name);
    const d = Math.hypot(p.x-shuttle.pos.x, p.y-shuttle.pos.y, p.z-shuttle.pos.z);
    if (d < minD) { minD = d; nearest = b; }
  }
  // скорость тела численно
  const p1 = positions.get(nearest.name);
  const p2 = computeAllBodies(simTime + 1).get(nearest.name);
  shuttle.vel.x = p2.x - p1.x;
  shuttle.vel.y = p2.y - p1.y;
  shuttle.vel.z = p2.z - p1.z;
}

// Мгновенно выставить модуль скорости относительно ближайшего тела,
// сохраняя направление текущего движения (то есть траекторию).
// Абсолютная скорость шаттла = скорость ближайшего тела + relative*k
export function setSpeedMagnitude(shuttle, targetSpeed, simTime) {
  // скорость ближайшего тела отн. Солнца
  const positions = computeAllBodies(simTime);
  let nearest = null, minD = Infinity;
  const all = [{ name: 'Sun', mass: SUN.mass }, ...BODIES];
  for (const b of all) {
    const p = positions.get(b.name);
    const d = Math.hypot(p.x-shuttle.pos.x, p.y-shuttle.pos.y, p.z-shuttle.pos.z);
    if (d < minD) { minD = d; nearest = b; }
  }
  const p1 = positions.get(nearest.name);
  const p2 = computeAllBodies(simTime + 1).get(nearest.name);
  const bodyVel = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };

  // относительная скорость шаттла
  const relX = shuttle.vel.x - bodyVel.x;
  const relY = shuttle.vel.y - bodyVel.y;
  const relZ = shuttle.vel.z - bodyVel.z;
  const cur = Math.hypot(relX, relY, relZ);

  let nrx, nry, nrz;
  if (cur < 1e-6) {
    // стоим относительно тела — используем направление носа
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(shuttle.quaternion);
    nrx = dir.x; nry = dir.y; nrz = dir.z;
  } else {
    nrx = relX / cur; nry = relY / cur; nrz = relZ / cur;
  }

  shuttle.vel.x = bodyVel.x + nrx * targetSpeed;
  shuttle.vel.y = bodyVel.y + nry * targetSpeed;
  shuttle.vel.z = bodyVel.z + nrz * targetSpeed;
}

// Телепорт на круговую орбиту вокруг тела
export function teleportToOrbit(shuttle, bodyName, simTime) {
  let target;
  if (bodyName === 'Sun') {
    target = { pos: { x:0, y:0, z:0 }, mass: SUN.mass, radius: SUN.radius };
  } else {
    const b = BODIES.find((x) => x.name === bodyName);
    target = { pos: bodyPosition(b, simTime), mass: b.mass, radius: b.radius };
  }

  const altitude = DEFAULT_ORBIT_ALTITUDES[bodyName] || 200e3;
  const r = target.radius + altitude;
  const vCirc = Math.sqrt(G * target.mass / r);

  // поставить на +X от тела
  shuttle.pos.x = target.pos.x + r;
  shuttle.pos.y = target.pos.y;
  shuttle.pos.z = target.pos.z;

  // орбитальная скорость по +Y плюс скорость тела отн. Солнца
  shuttle.vel.x = 0;
  shuttle.vel.y = vCirc;
  shuttle.vel.z = 0;

  if (bodyName !== 'Sun') {
    const b = BODIES.find((x) => x.name === bodyName);
    const p2 = bodyPosition(b, simTime + 1);
    shuttle.vel.x += p2.x - target.pos.x;
    shuttle.vel.y += p2.y - target.pos.y;
    shuttle.vel.z += p2.z - target.pos.z;
  }
}

// Развернуть корабль носом на цель (плавно, slerp)
export function pointAt(shuttle, bodyName, simTime, dt) {
  let targetPos;
  if (bodyName === 'Sun') {
    targetPos = { x: 0, y: 0, z: 0 };
  } else {
    targetPos = bodyPosition(BODIES.find((x) => x.name === bodyName), simTime);
  }
  const dir = new THREE.Vector3(
    targetPos.x - shuttle.pos.x,
    targetPos.y - shuttle.pos.y,
    targetPos.z - shuttle.pos.z
  ).normalize();
  // Нос корабля — по -Z локально. lookAt(eye, target, up) создаёт матрицу где -Z смотрит на target.
  // eye = 0, target = dir — корабль будет смотреть носом на цель.
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
  const targetQ = new THREE.Quaternion().setFromRotationMatrix(m);
  shuttle.quaternion.slerp(targetQ, Math.min(1, dt * 3));
}
