// Плавный time warp на логарифмической шкале от x1 до x1e6

const MIN_LOG = 0;
const MAX_LOG = 6;

export function createWarp() {
  return { logMult: 0 };
}

export function warpMultiplier(w) {
  return Math.pow(10, w.logMult);
}

export function warpStep(w, step) {
  w.logMult = Math.max(MIN_LOG, Math.min(MAX_LOG, w.logMult + step));
}

// Автоснижение warp только если шаттл действительно падает на тело
// (радиальная скорость отрицательная и высота малая).
// Если мы на орбите и летим параллельно поверхности — warp не ограничиваем.
export function clampWarpNearBody(w, nearest, shuttle, bodyPositions) {
  const bp = bodyPositions.get(nearest.body.name);
  // вектор от центра тела к шаттлу
  const dx = shuttle.pos.x - bp.x;
  const dy = shuttle.pos.y - bp.y;
  const dz = shuttle.pos.z - bp.z;
  const r = Math.hypot(dx, dy, dz);
  if (r < 1) return;

  // скорость тела (численно — через кеплер на +1 сек)
  // упрощение: используем абсолютную скорость шаттла, этого достаточно
  // для оценки радиального движения
  const nx = dx / r, ny = dy / r, nz = dz / r;

  // радиальная скорость шаттла — проекция velocity на нормаль (положительная = удаляется)
  const radialV = shuttle.vel.x * nx + shuttle.vel.y * ny + shuttle.vel.z * nz;

  // если удаляется или стабилен — не ограничиваем
  if (radialV >= -1) return;

  // падает: время до удара о поверхность
  const timeToSurface = nearest.altitude / (-radialV);
  const mult = warpMultiplier(w);
  // если на текущем warp до удара < 30 сек — снижаем
  if (timeToSurface / mult < 30) {
    const maxMult = Math.max(1, timeToSurface / 30);
    w.logMult = Math.min(w.logMult, Math.log10(maxMult));
  }
}
