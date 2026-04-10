import * as THREE from 'three';

// Particle-based двигательный выхлоп.
// Частицы спавнятся у сопел, летят в локальном -Z шаттла + случайный разброс,
// fade out за время жизни.

const MAX_PARTICLES = 1500;
const LIFETIME = 1.2;   // секунд

export function createExhaust() {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const ages = new Float32Array(MAX_PARTICLES);
  const velocities = new Float32Array(MAX_PARTICLES * 3);

  // начальный "возраст" = LIFETIME (мертвые)
  for (let i = 0; i < MAX_PARTICLES; i++) ages[i] = LIFETIME;

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
      gl_PointSize = size * (300.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fragmentShader = `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, d) * 0.08;
      gl_FragColor = vec4(vColor * 0.25, alpha);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,             // всегда поверх планет
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 998;

  let nextParticle = 0;

  // Все координаты — в camera-relative (относительно origin шаттла, который всегда в 0,0,0).
  // localPos — позиция сопла относительно origin шаттла.
  // localDir — направление выхлопа относительно origin шаттла (не world — чтобы не смешивать с orbital velocity).
  function spawn(localPos, localDir, throttle) {
    const count = Math.floor(throttle * 20);
    for (let k = 0; k < count; k++) {
      const i = nextParticle;
      nextParticle = (nextParticle + 1) % MAX_PARTICLES;

      positions[i*3+0] = localPos.x;
      positions[i*3+1] = localPos.y;
      positions[i*3+2] = localPos.z;

      const spread = 6;
      const speed = 40 + Math.random() * 40;
      velocities[i*3+0] = localDir.x * speed + (Math.random()-0.5) * spread;
      velocities[i*3+1] = localDir.y * speed + (Math.random()-0.5) * spread;
      velocities[i*3+2] = localDir.z * speed + (Math.random()-0.5) * spread;

      const heat = Math.random();
      colors[i*3+0] = 0.6 + heat * 0.4;
      colors[i*3+1] = 0.7 + heat * 0.3;
      colors[i*3+2] = 1.0;

      sizes[i] = 10 + Math.random() * 14;
      ages[i] = 0;
    }
  }

  function update(dt, cameraPos) {
    // cameraPos не используем напрямую, но может быть нужно для LOD
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (ages[i] >= LIFETIME) continue;
      ages[i] += dt;
      positions[i*3+0] += velocities[i*3+0] * dt;
      positions[i*3+1] += velocities[i*3+1] * dt;
      positions[i*3+2] += velocities[i*3+2] * dt;

      // fade + cool
      const t = ages[i] / LIFETIME;
      const fade = 1 - t;
      colors[i*3+0] *= 0.985;
      colors[i*3+1] *= 0.985;
      colors[i*3+2] *= 0.985;
      sizes[i] *= 0.995;

      if (ages[i] >= LIFETIME) {
        // скрыть (размер 0)
        sizes[i] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  // сдвиг всех активных частиц на delta (при camera-relative rendering)
  function shift(dx, dy, dz) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (ages[i] >= LIFETIME) continue;
      positions[i*3+0] += dx;
      positions[i*3+1] += dy;
      positions[i*3+2] += dz;
    }
  }

  return { points, spawn, update, shift };
}
