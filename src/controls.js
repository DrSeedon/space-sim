// Управление: клавиатура + мышь
// WASD - pitch/yaw, QE - roll, Shift/Ctrl - thrust +/-, Space - full, X - cutoff
// + / - (или ] [) - delta-v ±100 м/с по носу
// K - killvel (обнулить скорость отн. ближайшего тела)
// V - ввод точной скорости
// . , - time warp плавно (log scale)
// H - HUD, M - markers, C - free camera (hold), T - trajectory
// RMB + wheel - телескоп

export function createInput() {
  const state = {
    pitch: 0, yaw: 0, roll: 0,
    thrustUp: false, thrustDown: false, thrustMax: false, cutoff: false,
    deltaVPlus: false, deltaVMinus: false,
    warpUp: false, warpDown: false,
    killVel: false, setSpeed: false,
    toggleHud: false, toggleMarkers: false, toggleTraj: false, toggleAutopilot: false,
    toggleTelescope: false, toggleBodyOrbits: false,
    trajLonger: false, trajShorter: false,
    rightMouseDown: false,
    telescopeWheel: 0,
    mouseDx: 0, mouseDy: 0,
  };

  const keyMap = {
    KeyW: () => state.pitch = 1,
    KeyS: () => state.pitch = -1,
    KeyA: () => state.yaw = 1,
    KeyD: () => state.yaw = -1,
    KeyQ: () => state.roll = 1,
    KeyE: () => state.roll = -1,
    ShiftLeft: () => state.thrustUp = true,
    ControlLeft: () => state.thrustDown = true,
    Space: () => state.thrustMax = true,
    KeyX: () => state.cutoff = true,
    Equal: () => state.deltaVPlus = true,
    NumpadAdd: () => state.deltaVPlus = true,
    Minus: () => state.deltaVMinus = true,
    NumpadSubtract: () => state.deltaVMinus = true,
    Period: () => state.warpUp = true,
    Comma: () => state.warpDown = true,
    BracketRight: () => state.trajLonger = true,
    BracketLeft: () => state.trajShorter = true,
  };
  const keyUpMap = {
    KeyW: () => state.pitch = 0,
    KeyS: () => state.pitch = 0,
    KeyA: () => state.yaw = 0,
    KeyD: () => state.yaw = 0,
    KeyQ: () => state.roll = 0,
    KeyE: () => state.roll = 0,
    ShiftLeft: () => state.thrustUp = false,
    ControlLeft: () => state.thrustDown = false,
    Space: () => state.thrustMax = false,
    KeyX: () => state.cutoff = false,
    Equal: () => state.deltaVPlus = false,
    NumpadAdd: () => state.deltaVPlus = false,
    Minus: () => state.deltaVMinus = false,
    NumpadSubtract: () => state.deltaVMinus = false,
    Period: () => state.warpUp = false,
    Comma: () => state.warpDown = false,
    BracketRight: () => state.trajLonger = false,
    BracketLeft: () => state.trajShorter = false,
  };

  // Одноразовые toggles
  const toggleKeys = {
    KeyH: 'toggleHud',
    KeyM: 'toggleMarkers',
    KeyY: 'toggleTraj',
    KeyP: 'toggleAutopilot',
    KeyK: 'killVel',
    KeyV: 'setSpeed',
    KeyT: 'toggleTelescope',
    KeyO: 'toggleBodyOrbits',
  };

  // Блокируем системные шорткаты браузера которые могут закрыть вкладку
  const blockedShortcuts = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyR', 'KeyP', 'KeyS', 'KeyD', 'KeyF', 'KeyA']);
  window.addEventListener('keydown', (e) => {
    // Ctrl+W / Ctrl+T / Ctrl+N и т.д. — блокируем
    if ((e.ctrlKey || e.metaKey) && blockedShortcuts.has(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.repeat) return;
    if (keyMap[e.code]) { keyMap[e.code](); e.preventDefault(); }
    if (toggleKeys[e.code]) { state[toggleKeys[e.code]] = true; }
  }, { capture: true });
  window.addEventListener('keyup', (e) => {
    if (keyUpMap[e.code]) keyUpMap[e.code]();
  });

  // beforeunload подстраховка — предупредить при случайном закрытии
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button === 2) { state.rightMouseDown = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) state.rightMouseDown = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // Pointer lock: по клику на canvas → бесконечное вращение мыши как в шутерах.
  // ESC снимает lock → можно кликать HUD/автопилот панели.
  state.pointerLocked = false;
  const canvas = document.getElementById('canvas');

  canvas.addEventListener('click', () => {
    if (!state.pointerLocked) canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === canvas;
  });

  window.addEventListener('mousemove', (e) => {
    if (state.pointerLocked) {
      state.mouseDx += e.movementX || 0;
      state.mouseDy += e.movementY || 0;
    }
  });

  window.addEventListener('wheel', (e) => {
    state.wheel = (state.wheel || 0) + e.deltaY;
    e.preventDefault();
  }, { passive: false });

  return state;
}

export function consumeToggle(state, key) {
  if (state[key]) { state[key] = false; return true; }
  return false;
}

export function consumeMouseDelta(state) {
  const dx = state.mouseDx, dy = state.mouseDy;
  state.mouseDx = 0; state.mouseDy = 0;
  return { dx, dy };
}

export function consumeWheel(state) {
  const w = state.wheel || 0;
  state.wheel = 0;
  return w;
}
