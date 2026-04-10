# TODO — Space Sim

## ✅ Done

### Physics & simulation
- Newtonian gravity from all bodies + Velocity Verlet integrator for the shuttle
- Keplerian orbits for planets & moons (stable at any time warp)
- Smooth logarithmic time warp (x1 → x1,000,000) via `.` / `,`
- Shuttle trajectory prediction (3 colors: around Sun / nearest planet / nearest moon)
- Static Keplerian ellipses for all 8 planets and 12 moons
- Adjustable trajectory length multiplier (0.5×..100×) via `[` / `]`
- Autopilot: point-at target + teleport-to-orbit for any body
- Delta-v nudge along nose (`+`/`-`), killvel (`K`), exact speed (`V`)
- Axial rotation for all bodies (real periods, real tilts)
- 12 moons: Moon, Phobos, Deimos, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Titan, Triton

### Rendering
- 8K textures for Sun, Earth, Moon, Mars, Jupiter, Saturn + Milky Way backup
- Earth PBR: normal map, specular map (ocean reflects, land doesn't) via custom `onBeforeCompile`
- Earth night city lights — glow only on dark side via NdotL shader injection
- HDR Sun with overbright core + three-layer corona
- UnrealBloomPass + ACES Filmic tone mapping
- Logarithmic depth buffer for planetary-scale precision
- 5000 real stars from HYG Database (real constellations, spectral-class colors)

### Camera & controls
- Orbit mode (mouse spin around ship) + Telescope mode (`T`, 360° free look, up to 180,000× zoom)
- Adaptive mouse sensitivity scaled with FOV
- Procedural shuttle model (fuselage + wings + nozzles + cockpit glass)
- Particle exhaust with additive blending, hidden-by-planet fix
- Pointer lock for infinite mouse rotation
- Ctrl+W / Ctrl+T browser shortcut blocker

### UI
- Full HUD: nearest body, altitude, distance, velocities, thrust, accel, FOV+zoom×, warp, cam mode, traj multiplier
- Planet markers (`M`) with distance labels
- Autopilot panel (`P`) with all bodies
- Single-key hide-all (`H`) — HUD + trajectories + orbits

---

## 📋 Planned

### Graphics
- [ ] **Atmosphere shader for Earth** — Rayleigh/Mie scattering, blue limb glow, gradient from bright-blue at surface to black in space
- [ ] **Normal/specular maps for Mars and Moon** (available on solarsystemscope.com)
- [ ] **Gas giant cloud animation** — slowly-shifting cloud bands via UV scroll on Jupiter/Saturn
- [ ] **Ring shadows on Saturn** — real cast shadow from rings onto the planet (and vice versa)

### HUD / UI
- [ ] **System minimap** — small 2D/isometric overview in corner showing current shuttle position
- [ ] **Prograde / retrograde markers** — KSP-style velocity vector indicators relative to nearest body (prograde/retrograde/radial-in/out/normal/anti-normal)
- [ ] **Attitude indicator** — angle between ship nose and velocity vector (useful for correct burn orientation)

### Persistence
- [ ] **Save state in localStorage** — position, velocity, orientation, simTime, warp, FOV, camera mode. Auto-save every 10 seconds + manual reset button

### Navigation
- [ ] **Maneuver nodes** — place a point on the orbit, set delta-v vector, preview resulting trajectory (KSP-style)
- [ ] **Hohmann transfer assist** — compute launch window and delta-v to any target planet
- [ ] **Auto-circularize** — one-click burn assist to stabilize current orbit

### Content
- [ ] **Pluto + Charon** (optional)
- [ ] **Asteroid belt** — procedural field between Mars and Jupiter
- [ ] **Comets** — eccentric orbit with particle tail pointing away from Sun

### Dev ergonomics
- [ ] **`run.sh` launcher** — one-command start: http server + open browser
- [ ] **Screenshot hotkey** (F12) — save canvas snapshot to `/screenshots/`
- [ ] **Config file for initial position** — spawn at ISS / Moon / Mars on launch via URL param

---

## 🐛 Known issues

- **Float precision at extreme telescope zoom** (>50,000×) — quaternion camera matrix quantizes to float32, causing minor pixel-level jitter. Inherent WebGL limitation
- **Patched conics problem** — trajectory prediction uses full gravity but doesn't re-center on target body's sphere of influence. Interplanetary transfers may look inaccurate near destination
- **Starfield at 33 AU** — stars sit on a finite sphere, not infinitely far. Noticeable parallax only beyond Neptune
- **Trajectory multi-body Verlet CPU cost** — recomputed every 0.5s, ~100ms per refresh. Minor hitch at high periods multiplier (50×+)
- **Time warp + high throttle** — can numerically escape the Solar System in seconds; no auto-clamp (by design, full freedom)
