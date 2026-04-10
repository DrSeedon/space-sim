import * as THREE from 'three';
import { BODIES, SUN, G } from './constants.js';
import { bodyPosition } from './physics.js';

// Статические орбиты всех планет и лун — вычисляются один раз через кеплеровские
// элементы, потом каждый кадр только сдвигаются в camera-relative координаты
// (прибавляя текущую позицию parent тела).
//
// Память: ~20 тел × 256 точек × 3 float × 2 (позиции+буфер) ≈ 120 KB. Легко.

const POINTS_PER_ORBIT = 256;

// Цвета для планет (приятные, чтобы не слишком ярко)
const PLANET_COLORS = {
  Mercury: 0x998877,
  Venus: 0xccaa66,
  Earth: 0x4090ff,
  Mars: 0xcc4422,
  Jupiter: 0xccaa88,
  Saturn: 0xd4c080,
  Uranus: 0x88ccdd,
  Neptune: 0x5577dd,
};
const DEFAULT_MOON_COLOR = 0x666688;

// Построить массив локальных точек эллипса (относительно центрального тела)
// через тот же алгоритм что bodyPosition, но проходя по eccentric anomaly 0..2π
function buildOrbitPoints(body, centralMass) {
  const { a, e, i, Omega, omega } = body.orbit;
  const points = new Float32Array(POINTS_PER_ORBIT * 3);

  const cosO = Math.cos(Omega), sinO = Math.sin(Omega);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);
  const cosi = Math.cos(i), sini = Math.sin(i);

  for (let k = 0; k < POINTS_PER_ORBIT; k++) {
    const E = (k / (POINTS_PER_ORBIT - 1)) * 2 * Math.PI;
    const xOrb = a * (Math.cos(E) - e);
    const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const x = (cosO * cosw - sinO * sinw * cosi) * xOrb + (-cosO * sinw - sinO * cosw * cosi) * yOrb;
    const y = (sinO * cosw + cosO * sinw * cosi) * xOrb + (-sinO * sinw + cosO * cosw * cosi) * yOrb;
    const z = (sinw * sini) * xOrb + (cosw * sini) * yOrb;

    points[k*3+0] = x;
    points[k*3+1] = y;
    points[k*3+2] = z;
  }
  return points;
}

// Создать все линии орбит (планет + лун) один раз при инициализации.
// Возвращает массив { line, body, localPoints, geo, positions } для каждой.
export function createBodyOrbits() {
  const entries = [];

  for (const body of BODIES) {
    const parentName = body.parent;
    const centralMass = parentName === 'Sun' ? SUN.mass : BODIES.find((x) => x.name === parentName).mass;
    const localPoints = buildOrbitPoints(body, centralMass);

    // Буфер для camera-relative позиций (обновляется каждый кадр)
    const positions = new Float32Array(POINTS_PER_ORBIT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const isPlanet = parentName === 'Sun';
    const color = isPlanet
      ? (PLANET_COLORS[body.name] || 0x888888)
      : DEFAULT_MOON_COLOR;

    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: isPlanet ? 0.35 : 0.25,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.LineLoop(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 997;

    entries.push({ line, body, parentName, localPoints, positions, geo, isPlanet });
  }

  return { entries, visible: true };
}

export function addBodyOrbitsToScene(orbits, scene) {
  for (const e of orbits.entries) scene.add(e.line);
}

// Каждый кадр: сдвинуть все точки так чтобы они были в camera-relative системе.
// Для планет (parent=Sun) локальные точки уже в гелиоцентрической → надо вычесть shuttlePos.
// Для лун — прибавить текущую позицию родителя и вычесть shuttlePos.
export function refreshBodyOrbits(orbits, shuttlePos, simTime) {
  if (!orbits.visible) return;

  // Кеш позиций родителей чтобы не звать bodyPosition повторно для каждой луны
  const parentCache = new Map();
  parentCache.set('Sun', { x: 0, y: 0, z: 0 });

  for (const e of orbits.entries) {
    let parentPos = parentCache.get(e.parentName);
    if (!parentPos) {
      parentPos = bodyPosition(BODIES.find((b) => b.name === e.parentName), simTime);
      parentCache.set(e.parentName, parentPos);
    }

    const { localPoints, positions, geo } = e;
    const baseX = parentPos.x - shuttlePos.x;
    const baseY = parentPos.y - shuttlePos.y;
    const baseZ = parentPos.z - shuttlePos.z;

    for (let i = 0; i < POINTS_PER_ORBIT; i++) {
      positions[i*3+0] = localPoints[i*3+0] + baseX;
      positions[i*3+1] = localPoints[i*3+1] + baseY;
      positions[i*3+2] = localPoints[i*3+2] + baseZ;
    }
    geo.attributes.position.needsUpdate = true;
  }
}

export function setBodyOrbitsVisible(orbits, visible) {
  orbits.visible = visible;
  for (const e of orbits.entries) e.line.visible = visible;
}
