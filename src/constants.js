// Реальные константы Солнечной системы (JPL / NASA, эпоха J2000.0)
// Все единицы СИ: метры, килограммы, секунды, радианы.

export const G = 6.6743e-11;
export const AU = 1.495978707e11;
export const DAY = 86400;
export const YEAR = 365.25 * DAY;

// Эпоха J2000.0 в Unix ms
export const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

const deg = (d) => d * Math.PI / 180;

// Период вращения вокруг оси (часы). Минус = ретроградное.
// Начальный сдвиг по долготе (градусы) — поворот текстуры в момент J2000.
// axialTilt — наклон оси к нормали орбиты (градусы).
const ROTATION = {
  Sun: { period: 609.12, tilt: 7.25, offset: 0 },           // 25.38 дней
  Mercury: { period: 1407.5, tilt: 0.034, offset: 0 },      // 58.6 дней
  Venus: { period: -5832.5, tilt: 177.36, offset: 0 },      // ретроградное
  Earth: { period: 23.9345, tilt: 23.44, offset: 280 },     // 280° — GMST на J2000
  Moon: { period: 655.72, tilt: 6.68, offset: 38 },         // 27.3 дней, sync с орбитой
  Mars: { period: 24.6229, tilt: 25.19, offset: 150 },
  Jupiter: { period: 9.925, tilt: 3.13, offset: 67 },       // 9.9 часов!
  Saturn: { period: 10.656, tilt: 26.73, offset: 227 },
  Uranus: { period: -17.24, tilt: 97.77, offset: 0 },       // ретроградное, ось набок
  Neptune: { period: 16.11, tilt: 28.32, offset: 0 },
  Io: { period: 42.46, tilt: 0.04, offset: 0 },
  Europa: { period: 85.23, tilt: 0.47, offset: 0 },
  Ganymede: { period: 171.71, tilt: 0.33, offset: 0 },
  Callisto: { period: 400.54, tilt: 0, offset: 0 },
  Titan: { period: 382.69, tilt: 0, offset: 0 },
  Enceladus: { period: 32.89, tilt: 0, offset: 0 },
  Mimas: { period: 22.62, tilt: 0, offset: 0 },
  Phobos: { period: 7.66, tilt: 0, offset: 0 },
  Deimos: { period: 30.31, tilt: 0, offset: 0 },
  Triton: { period: -141.04, tilt: 156.87, offset: 0 },
};

export function getRotation(name) { return ROTATION[name] || { period: 24, tilt: 0, offset: 0 }; }

export const SUN = {
  name: 'Sun', mass: 1.98892e30, radius: 6.9634e8,
  texture: '8k_sun.jpg', emissive: true, parent: null, color: 0xfff0b0,
};

// Орбитальные элементы — гелиоцентрические/геоцентрические, эклиптика J2000
export const BODIES = [
  // Планеты
  { name: 'Mercury', mass: 3.3011e23, radius: 2.4397e6, texture: '2k_mercury.jpg', parent: 'Sun', color: 0x8c7853,
    orbit: { a: 0.38709927*AU, e: 0.20563593, i: deg(7.00497902),
             Omega: deg(48.33076593), omega: deg(77.45779628-48.33076593),
             M0: deg(252.25032350-77.45779628) } },
  { name: 'Venus', mass: 4.8675e24, radius: 6.0518e6, texture: '2k_venus_surface.jpg', parent: 'Sun', color: 0xffc87c,
    orbit: { a: 0.72333566*AU, e: 0.00677672, i: deg(3.39467605),
             Omega: deg(76.67984255), omega: deg(131.60246718-76.67984255),
             M0: deg(181.97909950-131.60246718) } },
  { name: 'Earth', mass: 5.97219e24, radius: 6.371e6, texture: '8k_earth_daymap.jpg',
    nightTexture: '8k_earth_nightmap.jpg', cloudTexture: '8k_earth_clouds.jpg',
    normalTexture: '8k_earth_normal.jpg', specularTexture: '8k_earth_specular.jpg',
    parent: 'Sun', color: 0x4080ff,
    orbit: { a: 1.00000261*AU, e: 0.01671123, i: deg(-0.00001531),
             Omega: deg(0.0), omega: deg(102.93768193),
             M0: deg(100.46457166-102.93768193) } },
  { name: 'Mars', mass: 6.4171e23, radius: 3.3895e6, texture: '8k_mars.jpg', parent: 'Sun', color: 0xc1440e,
    orbit: { a: 1.52371034*AU, e: 0.09339410, i: deg(1.84969142),
             Omega: deg(49.55953891), omega: deg(-23.94362959-49.55953891),
             M0: deg(-4.55343205+23.94362959) } },
  { name: 'Jupiter', mass: 1.8982e27, radius: 6.9911e7, texture: '8k_jupiter.jpg', parent: 'Sun', color: 0xc9a27e,
    orbit: { a: 5.20288700*AU, e: 0.04838624, i: deg(1.30439695),
             Omega: deg(100.47390909), omega: deg(14.72847983-100.47390909),
             M0: deg(34.39644051-14.72847983) } },
  { name: 'Saturn', mass: 5.6834e26, radius: 5.8232e7, texture: '8k_saturn.jpg',
    ring: '8k_saturn_ring_alpha.png', ringInner: 7.4e7, ringOuter: 1.4e8,
    parent: 'Sun', color: 0xd4bb88,
    orbit: { a: 9.53667594*AU, e: 0.05386179, i: deg(2.48599187),
             Omega: deg(113.66242448), omega: deg(92.59887831-113.66242448),
             M0: deg(49.95424423-92.59887831) } },
  { name: 'Uranus', mass: 8.6810e25, radius: 2.5362e7, texture: '2k_uranus.jpg', parent: 'Sun', color: 0x9cd3e0,
    orbit: { a: 19.18916464*AU, e: 0.04725744, i: deg(0.77263783),
             Omega: deg(74.01692503), omega: deg(170.95427630-74.01692503),
             M0: deg(313.23810451-170.95427630) } },
  { name: 'Neptune', mass: 1.02413e26, radius: 2.4622e7, texture: '2k_neptune.jpg', parent: 'Sun', color: 0x4b70dd,
    orbit: { a: 30.06992276*AU, e: 0.00859048, i: deg(1.77004347),
             Omega: deg(131.78422574), omega: deg(44.96476227-131.78422574),
             M0: deg(-55.12002969-44.96476227) } },

  // Луна Земли
  { name: 'Moon', mass: 7.342e22, radius: 1.7374e6, texture: '8k_moon.jpg', parent: 'Earth', color: 0xaaaaaa,
    orbit: { a: 3.844e8, e: 0.0549, i: deg(5.145),
             Omega: deg(125.08), omega: deg(318.15), M0: deg(135.27) } },

  // Спутники Марса
  { name: 'Phobos', mass: 1.0659e16, radius: 1.126e4, parent: 'Mars', color: 0x887766,
    orbit: { a: 9.378e6, e: 0.0151, i: deg(1.093),
             Omega: deg(0), omega: deg(0), M0: deg(0) } },
  { name: 'Deimos', mass: 1.4762e15, radius: 6.2e3, parent: 'Mars', color: 0x998877,
    orbit: { a: 2.3459e7, e: 0.00033, i: deg(0.93),
             Omega: deg(0), omega: deg(0), M0: deg(180) } },

  // Галилеевы спутники Юпитера
  { name: 'Io', mass: 8.9319e22, radius: 1.8216e6, parent: 'Jupiter', color: 0xe8d95e,
    orbit: { a: 4.217e8, e: 0.0041, i: deg(0.036),
             Omega: deg(0), omega: deg(0), M0: deg(0) } },
  { name: 'Europa', mass: 4.7998e22, radius: 1.5608e6, parent: 'Jupiter', color: 0xd6c8a0,
    orbit: { a: 6.709e8, e: 0.0094, i: deg(0.466),
             Omega: deg(0), omega: deg(0), M0: deg(90) } },
  { name: 'Ganymede', mass: 1.4819e23, radius: 2.6341e6, parent: 'Jupiter', color: 0xa89070,
    orbit: { a: 1.0704e9, e: 0.0013, i: deg(0.177),
             Omega: deg(0), omega: deg(0), M0: deg(180) } },
  { name: 'Callisto', mass: 1.0759e23, radius: 2.4103e6, parent: 'Jupiter', color: 0x605040,
    orbit: { a: 1.8827e9, e: 0.0074, i: deg(0.192),
             Omega: deg(0), omega: deg(0), M0: deg(270) } },

  // Спутники Сатурна
  { name: 'Mimas', mass: 3.7493e19, radius: 1.982e5, parent: 'Saturn', color: 0xcccccc,
    orbit: { a: 1.8552e8, e: 0.0196, i: deg(1.574),
             Omega: deg(0), omega: deg(0), M0: deg(0) } },
  { name: 'Enceladus', mass: 1.08022e20, radius: 2.521e5, parent: 'Saturn', color: 0xf0f0f0,
    orbit: { a: 2.3802e8, e: 0.0047, i: deg(0.009),
             Omega: deg(0), omega: deg(0), M0: deg(45) } },
  { name: 'Titan', mass: 1.3452e23, radius: 2.5747e6, parent: 'Saturn', color: 0xd4a968,
    orbit: { a: 1.22187e9, e: 0.0288, i: deg(0.348),
             Omega: deg(0), omega: deg(0), M0: deg(120) } },

  // Спутник Нептуна
  { name: 'Triton', mass: 2.139e22, radius: 1.3534e6, parent: 'Neptune', color: 0xd0b894,
    orbit: { a: 3.5476e8, e: 0.000016, i: deg(156.865),
             Omega: deg(0), omega: deg(0), M0: deg(0) } },
];

// Дефолтные высоты орбиты для телепорта (м над поверхностью)
export const DEFAULT_ORBIT_ALTITUDES = {
  Sun: 1e10, Mercury: 300e3, Venus: 400e3, Earth: 408e3, Moon: 100e3,
  Mars: 400e3, Phobos: 50e3, Deimos: 30e3,
  Jupiter: 500e3, Io: 200e3, Europa: 200e3, Ganymede: 200e3, Callisto: 200e3,
  Saturn: 500e3, Mimas: 50e3, Enceladus: 50e3, Titan: 300e3,
  Uranus: 400e3, Neptune: 400e3, Triton: 100e3,
};

// Начальные условия шаттла
export const SHUTTLE_INIT = {
  altitude: 408e3,
  inclination: deg(51.64),
  mass: 120000,              // 120 тонн (сухая масса Шаттла без бака, для играбельности)
  thrust: 5e6,               // стартовая тяга 5 МН (увеличим при необходимости)
  length: 37,
};
