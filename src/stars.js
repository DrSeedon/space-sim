import * as THREE from 'three';

// Реальные звёзды из каталога HYG. Загружается async из stars.json.
// Формат: [[ra_deg, dec_deg, magnitude, color_index_bv], ...]
// Звёзды отрисованы как Points с кастомным шейдером, размер и яркость
// зависят от magnitude, цвет — от color index (температура).

const STAR_DISTANCE = 5e12;   // ~33 AU, за орбитой Нептуна — чтобы звёзды не пересекали траектории

// Color index B-V → RGB (упрощённая blackbody curve)
function ciToColor(ci) {
  // ci < 0: голубые горячие, ci > 1.5: красные холодные
  if (ci < -0.3) return [0.7, 0.8, 1.0];       // O-тип синий
  if (ci < 0.0) return [0.8, 0.85, 1.0];       // B-тип голубовато-белый
  if (ci < 0.3) return [1.0, 1.0, 1.0];        // A-тип белый
  if (ci < 0.6) return [1.0, 0.98, 0.9];       // F-тип желтовато-белый
  if (ci < 1.0) return [1.0, 0.95, 0.7];       // G-тип жёлтый (Солнце)
  if (ci < 1.4) return [1.0, 0.8, 0.5];        // K-тип оранжевый
  return [1.0, 0.6, 0.4];                       // M-тип красный
}

export async function createStarfield() {
  const res = await fetch('assets/stars/stars.json');
  const data = await res.json();

  // Убираем Солнце (первая запись mag ≈ -26.7)
  const stars = data.filter((s) => s[2] > -20);

  const n = stars.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, ci] = stars[i];
    // RA/Dec → декартовы координаты на сфере радиуса STAR_DISTANCE
    const raRad = ra * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    positions[i*3+0] = STAR_DISTANCE * Math.cos(decRad) * Math.cos(raRad);
    positions[i*3+1] = STAR_DISTANCE * Math.sin(decRad);
    positions[i*3+2] = STAR_DISTANCE * Math.cos(decRad) * Math.sin(raRad);

    const [r, g, b] = ciToColor(ci);
    // brightness: ярче = крупнее и ярче. Формула ~2.5^(-mag)
    const brightness = Math.max(0.15, Math.pow(2.5, -mag * 0.4 + 1.0));
    colors[i*3+0] = r * brightness;
    colors[i*3+1] = g * brightness;
    colors[i*3+2] = b * brightness;

    // размер: от 1 до 6 пикселей в зависимости от яркости
    sizes[i] = Math.max(1, 4.5 - mag * 0.7);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const vertexShader = `
    attribute float size;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = size;
    }
  `;
  const fragmentShader = `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,           // чтобы планеты перекрывали звёзды
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return { points, count: n };
}
