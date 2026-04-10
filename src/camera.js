import * as THREE from 'three';

// Два режима камеры:
// 1) 'orbit' (дефолт) — мышь всегда крутит орбиту вокруг шаттла (azimuth/elevation).
// 2) 'telescope' — камера у носа корабля, мышь крутит обзор на 360°
//    полностью независимо (можно смотреть назад, вбок, вверх). Корабль скрыт.

export function createCam() {
  return {
    mode: 'orbit',
    // orbit state
    orbitYaw: 0,
    orbitPitch: 0.15,
    distance: 80,
    // telescope state — независимая ориентация взгляда (yaw/pitch в мире, не привязаны к кораблю)
    telYaw: 0,
    telPitch: 0,
  };
}

export function toggleMode(cam, shuttle) {
  cam.mode = cam.mode === 'orbit' ? 'telescope' : 'orbit';
  if (cam.mode === 'telescope') {
    // начальное направление телескопа — по носу корабля
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
    cam.telYaw = Math.atan2(fwd.x, fwd.z);
    cam.telPitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
  }
}

export function updateCamera(cam, shuttle, mouseDelta, fovRatio = 1) {
  const shipQ = shuttle.quaternion;

  if (cam.mode === 'orbit') {
    cam.orbitYaw -= mouseDelta.dx * 0.004;
    cam.orbitPitch += mouseDelta.dy * 0.004;
    cam.orbitPitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, cam.orbitPitch));

    const r = cam.distance;
    const local = new THREE.Vector3(
      Math.sin(cam.orbitYaw) * Math.cos(cam.orbitPitch) * r,
      Math.sin(cam.orbitPitch) * r,
      Math.cos(cam.orbitYaw) * Math.cos(cam.orbitPitch) * r
    );

    const pos = local.applyQuaternion(shipQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(shipQ);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0,0,0), up);
    const quat = new THREE.Quaternion().setFromRotationMatrix(m);
    return { pos, quat };
  }

  // --- telescope: полный 360° обзор ---
  // Позиция — у кабины корабля (чуть впереди + вверх)
  const eyeLocal = new THREE.Vector3(0, 3, -12);
  const pos = eyeLocal.applyQuaternion(shipQ);

  // Независимые углы обзора (yaw/pitch в мировых координатах)
  // Чувствительность пропорциональна FOV: при зуме крутится медленнее,
  // чтоб при максимальном приближении пиксель ≈ пиксель
  const telSens = 0.003 * fovRatio;
  cam.telYaw -= mouseDelta.dx * telSens;
  cam.telPitch -= mouseDelta.dy * telSens;
  cam.telPitch = Math.max(-Math.PI/2 + 0.02, Math.min(Math.PI/2 - 0.02, cam.telPitch));

  // Построить направление взгляда из сферических углов
  const forward = new THREE.Vector3(
    Math.sin(cam.telYaw) * Math.cos(cam.telPitch),
    Math.sin(cam.telPitch),
    Math.cos(cam.telYaw) * Math.cos(cam.telPitch)
  );
  const target = pos.clone().add(forward);

  const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
  const quat = new THREE.Quaternion().setFromRotationMatrix(m);
  return { pos, quat };
}
