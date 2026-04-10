import { G, J2000_EPOCH_MS, SUN, BODIES } from './constants.js';

// ---------- Kepler для планет ----------
// Решение уравнения Кеплера M = E - e*sin(E) методом Ньютона-Рафсона
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 8; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
    if (Math.abs(f) < 1e-10) break;
  }
  return E;
}

// Стандартный гравитационный параметр центрального тела для орбиты
function muFor(parentName) {
  if (parentName === 'Sun') return G * SUN.mass;
  const parent = BODIES.find((b) => b.name === parentName);
  return G * parent.mass;
}

// Позиция тела на момент t (секунды от J2000) в гелиоцентрических координатах
export function bodyPosition(body, t) {
  const { a, e, i, Omega, omega, M0 } = body.orbit;
  const mu = muFor(body.parent);
  const n = Math.sqrt(mu / (a * a * a));        // средняя угловая скорость
  const M = M0 + n * t;
  const E = solveKepler(M, e);

  // позиция в плоскости орбиты
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // поворот в 3D: ω (перигелий), i (наклонение), Ω (узел)
  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosi = Math.cos(i), sini = Math.sin(i);

  const x = (cosO * cosw - sinO * sinw * cosi) * xOrb + (-cosO * sinw - sinO * cosw * cosi) * yOrb;
  const y = (sinO * cosw + cosO * sinw * cosi) * xOrb + (-sinO * sinw + cosO * cosw * cosi) * yOrb;
  const z = (sinw * sini) * xOrb + (cosw * sini) * yOrb;

  // Для лун возвращаем координату + позиция родителя
  if (body.parent !== 'Sun') {
    const parent = BODIES.find((b) => b.name === body.parent);
    const parentPos = bodyPosition(parent, t);
    return { x: parentPos.x + x, y: parentPos.y + y, z: parentPos.z + z };
  }
  return { x, y, z };
}

// Вычислить все позиции за один проход и вернуть Map
export function computeAllBodies(t) {
  const map = new Map();
  map.set('Sun', { x: 0, y: 0, z: 0 });
  for (const body of BODIES) {
    map.set(body.name, bodyPosition(body, t));
  }
  return map;
}

// ---------- Ньютон для шаттла ----------
// Velocity Verlet интегратор
export function integrateShuttle(shuttle, bodyPositions, thrust, dt) {
  // acceleration от гравитации всех тел
  const accel = (pos) => {
    let ax = 0, ay = 0, az = 0;
    // Солнце
    const allBodies = [{ name: 'Sun', mass: SUN.mass }, ...BODIES];
    for (const b of allBodies) {
      const bp = bodyPositions.get(b.name);
      const dx = bp.x - pos.x, dy = bp.y - pos.y, dz = bp.z - pos.z;
      const r2 = dx*dx + dy*dy + dz*dz;
      const r = Math.sqrt(r2);
      const f = G * b.mass / (r2 * r);
      ax += f * dx; ay += f * dy; az += f * dz;
    }
    return { x: ax, y: ay, z: az };
  };

  const a1 = accel(shuttle.pos);
  // добавляем тягу (уже в world coords от управления)
  a1.x += thrust.x; a1.y += thrust.y; a1.z += thrust.z;

  // позиция на следующем шаге
  const newPos = {
    x: shuttle.pos.x + shuttle.vel.x * dt + 0.5 * a1.x * dt * dt,
    y: shuttle.pos.y + shuttle.vel.y * dt + 0.5 * a1.y * dt * dt,
    z: shuttle.pos.z + shuttle.vel.z * dt + 0.5 * a1.z * dt * dt,
  };

  const a2 = accel(newPos);
  a2.x += thrust.x; a2.y += thrust.y; a2.z += thrust.z;

  shuttle.pos = newPos;
  shuttle.vel = {
    x: shuttle.vel.x + 0.5 * (a1.x + a2.x) * dt,
    y: shuttle.vel.y + 0.5 * (a1.y + a2.y) * dt,
    z: shuttle.vel.z + 0.5 * (a1.z + a2.z) * dt,
  };
}

// Найти ближайшее тело (для HUD и time warp clamp)
export function findNearestBody(shuttlePos, bodyPositions) {
  let nearest = null, minDist = Infinity;
  const allBodies = [{ name: 'Sun', radius: SUN.radius }, ...BODIES];
  for (const b of allBodies) {
    const bp = bodyPositions.get(b.name);
    const dx = bp.x - shuttlePos.x, dy = bp.y - shuttlePos.y, dz = bp.z - shuttlePos.z;
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (d < minDist) { minDist = d; nearest = b; }
  }
  return { body: nearest, distance: minDist, altitude: minDist - nearest.radius };
}

// Текущее время симуляции (секунды от J2000)
export function nowSimSeconds() {
  return (Date.now() - J2000_EPOCH_MS) / 1000;
}
