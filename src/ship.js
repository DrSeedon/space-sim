import * as THREE from 'three';

// Процедурная модель корабля — фюзеляж, нос, крылья, хвост, 3 сопла, кабина.
// Ориентация: нос по -Z, верх по +Y (как принято в Three.js для камеры)

export function createShipModel() {
  const group = new THREE.Group();
  group.name = 'ship';

  // --- Фюзеляж ---
  const fuselageGeo = new THREE.CylinderGeometry(2.2, 2.8, 25, 32, 1);
  fuselageGeo.rotateX(Math.PI / 2);  // ось вдоль Z
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8ec, roughness: 0.35, metalness: 0.85,
  });
  const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
  group.add(fuselage);

  // --- Нос (конус) ---
  const noseGeo = new THREE.ConeGeometry(2.2, 8, 32);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.z = -16.5;
  group.add(nose);

  // --- Кабина (полусфера со стеклом) ---
  const cockpitGeo = new THREE.SphereGeometry(2.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpitMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1a33, roughness: 0.05, metalness: 0.2,
    transmission: 0.7, transparent: true, opacity: 0.9,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    envMapIntensity: 1.5,
  });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 1.2, -10);
  cockpit.rotation.x = -Math.PI / 2;
  group.add(cockpit);

  // --- Крылья (дельта) ---
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(12, -8);
  wingShape.lineTo(14, -8);
  wingShape.lineTo(0, 4);
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.8, bevelEnabled: false });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.7 });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0, -1, 5);
  wingL.rotation.y = -Math.PI / 2;
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.scale.x = -1;
  group.add(wingR);

  // --- Вертикальное оперение ---
  const finGeo = new THREE.BoxGeometry(0.6, 6, 5);
  const fin = new THREE.Mesh(finGeo, wingMat);
  fin.position.set(0, 3.5, 10);
  group.add(fin);

  // --- Сопла (3 штуки, треугольником сзади) ---
  const nozzles = [];
  const nozzlePositions = [
    new THREE.Vector3(0, 1.5, 12.5),
    new THREE.Vector3(-1.6, -0.5, 12.5),
    new THREE.Vector3(1.6, -0.5, 12.5),
  ];

  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x222222, roughness: 0.3, metalness: 1.0,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x4488ff, transparent: true, opacity: 0,
  });

  for (const pos of nozzlePositions) {
    // внешний кожух сопла — конус
    const outerGeo = new THREE.ConeGeometry(1.1, 3.5, 24, 1, true);
    outerGeo.rotateX(Math.PI / 2);
    const outer = new THREE.Mesh(outerGeo, nozzleMat);
    outer.position.copy(pos);
    outer.position.z += 1.75;
    group.add(outer);

    // внутренний светящийся диск — виден когда включены двигатели
    const glowGeo = new THREE.CircleGeometry(0.9, 24);
    const glow = new THREE.Mesh(glowGeo, glowMat.clone());
    glow.position.copy(pos);
    glow.position.z += 3.3;
    glow.rotation.y = Math.PI;  // смотрит назад
    group.add(glow);

    // точечный свет у сопла (даёт свечение на фюзеляже)
    const pl = new THREE.PointLight(0x4488ff, 0, 15, 2);
    pl.position.copy(pos);
    pl.position.z += 3.5;
    group.add(pl);

    nozzles.push({ glow, light: pl, worldPosOffset: pos.clone().setZ(pos.z + 3.5) });
  }

  // масштаб — немного увеличим для видимости
  group.scale.setScalar(1.0);

  return { group, nozzles };
}

// Обновить визуал двигателей: intensity 0..1
export function updateEngineGlow(nozzles, throttleNormalized) {
  const t = Math.min(1, Math.max(0, throttleNormalized));
  for (const n of nozzles) {
    n.glow.material.opacity = t * 0.5;
    n.glow.material.color.setRGB(0.2 + t * 0.3, 0.3 + t * 0.3, 0.7);
    n.light.intensity = t * 3;
  }
}

// Мировые позиции сопел (для спавна частиц)
export function getNozzleWorldPositions(shipGroup, nozzles) {
  const result = [];
  for (const n of nozzles) {
    const wp = n.worldPosOffset.clone();
    wp.applyMatrix4(shipGroup.matrixWorld);
    result.push(wp);
  }
  return result;
}
