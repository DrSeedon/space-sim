import { BODIES, SUN } from './constants.js';
import { teleportToOrbit } from './shuttle.js';

// UI панель со списком целей. Каждая цель — Point (развернуть нос) или Teleport (на орбиту).

export function createAutopilotUI(shuttleRef, simTimeRef) {
  const panel = document.createElement('div');
  panel.id = 'autopilot';
  panel.innerHTML = `
    <style>
      #autopilot { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
        background: rgba(0,10,0,0.55); border: 1px solid rgba(0,255,0,0.4);
        color: #cfc; font-family: 'Courier New', monospace; font-size: 11px;
        padding: 8px 12px; border-radius: 4px; pointer-events: auto;
        max-width: 90vw; overflow-x: auto; white-space: nowrap;
        backdrop-filter: blur(3px); }
      #autopilot.hidden { display: none; }
      #autopilot .title { color: #6f6; margin-right: 10px; font-weight: bold; }
      #autopilot .body { display: inline-block; margin-right: 8px; padding: 2px 4px; border: 1px solid #040; border-radius: 3px; }
      #autopilot .body .name { color: #fff; margin-right: 4px; }
      #autopilot .body button { background: #021; color: #0f0; border: 1px solid #060;
        font-family: monospace; font-size: 10px; padding: 1px 5px; margin-left: 2px; cursor: pointer; }
      #autopilot .body button:hover { background: #042; color: #fff; }
      #autopilot .close-hint { color: #888; margin-left: 10px; }
    </style>
    <span class="title">AUTOPILOT:</span>
    <div id="ap-bodies" style="display:inline"></div>
    <span class="close-hint">[P] hide</span>
  `;
  document.body.appendChild(panel);

  const bodiesEl = document.getElementById('ap-bodies');
  const all = [{ name: 'Sun' }, ...BODIES];
  for (const b of all) {
    const el = document.createElement('span');
    el.className = 'body';
    el.innerHTML = `<span class="name">${b.name}</span><button data-act="point">⊙</button><button data-act="tp">⇥</button>`;
    el.querySelector('[data-act="point"]').addEventListener('click', () => {
      shuttleRef.pointTarget = b.name;
    });
    el.querySelector('[data-act="tp"]').addEventListener('click', () => {
      teleportToOrbit(shuttleRef.shuttle, b.name, simTimeRef());
    });
    bodiesEl.appendChild(el);
  }

  return {
    panel,
    visible: true,
    toggle() {
      this.visible = !this.visible;
      panel.classList.toggle('hidden', !this.visible);
    },
  };
}
