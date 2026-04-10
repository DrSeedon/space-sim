import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SUN, BODIES, getRotation } from './constants.js';

// Рендер с camera-relative origin, HDR tonemap, bloom

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    90, window.innerWidth / window.innerHeight, 0.1, 1e13
  );

  // Postprocessing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,   // strength — сильнее чтобы корона Солнца была яркой
    0.5,   // radius
    0.95   // threshold — только очень яркие HDR объекты (Солнце)
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- Starfield ---
  const loader = new THREE.TextureLoader();
  const starTex = loader.load('assets/textures/8k_stars_milky_way.jpg');
  starTex.colorSpace = THREE.SRGBColorSpace;
  const starGeo = new THREE.SphereGeometry(1e12, 64, 64);
  const starMat = new THREE.MeshBasicMaterial({
    map: starTex, side: THREE.BackSide, depthWrite: false,
    transparent: true, opacity: 0,
  });
  const starSphere = new THREE.Mesh(starGeo, starMat);
  scene.add(starSphere);

  // --- Солнечный свет ---
  // В космосе свет белый (нет атмосферного рассеяния), интенсивность высокая
  const sunLight = new THREE.PointLight(0xffffff, 5.0, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.008));   // почти 0, тёмная сторона чёрная

  // --- Тела ---
  const bodyMeshes = new Map();
  const extraMeshes = new Map();  // облака, кольца
  const rotatables = [];          // для обновления вращения

  function makeBody(def) {
    const group = new THREE.Group();
    let mat;
    if (def.texture) {
      const tex = loader.load(`assets/textures/${def.texture}`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (def.emissive) {
        // Солнце: MeshBasicMaterial с яркой белой базой поверх текстуры.
        // color > 1.0 в HDR даёт переяркость → bloom цепляется → корона
        mat = new THREE.MeshBasicMaterial({
          map: tex,
          color: new THREE.Color(3.0, 3.0, 2.8),   // переяркий (HDR)
          toneMapped: false,                         // не резать tone mapping'ом
        });
      } else {
        const matOpts = { map: tex, roughness: 0.92, metalness: 0 };
        if (def.normalTexture) {
          const nt = loader.load(`assets/textures/${def.normalTexture}`);
          nt.anisotropy = renderer.capabilities.getMaxAnisotropy();
          matOpts.normalMap = nt;
          matOpts.normalScale = new THREE.Vector2(1.5, 1.5);
        }
        if (def.specularTexture) {
          // specular map: белый = океан (гладкий), чёрный = суша (шероховатая).
          // Three.js roughnessMap: чёрный = гладкий, белый = шероховатый — ИНВЕРСИЯ.
          // Решаем через onBeforeCompile (ниже).
          const st = loader.load(`assets/textures/${def.specularTexture}`);
          st.anisotropy = renderer.capabilities.getMaxAnisotropy();
          matOpts.roughnessMap = st;
          matOpts.roughness = 1.0;
          matOpts.metalness = 0.0;   // БЕЗ металличности — она и давала блики на городах
        }
        // Ночная текстура → emissiveMap (огни городов)
        if (def.nightTexture) {
          const nt2 = loader.load(`assets/textures/${def.nightTexture}`);
          nt2.colorSpace = THREE.SRGBColorSpace;
          nt2.anisotropy = renderer.capabilities.getMaxAnisotropy();
          matOpts.emissiveMap = nt2;
          matOpts.emissive = new THREE.Color(0xffffff);
          matOpts.emissiveIntensity = 1.0;
        }
        mat = new THREE.MeshStandardMaterial(matOpts);

        // Патчим шейдер: инвертируем roughness и делаем emissive только на ночной стороне
        mat.onBeforeCompile = (shader) => {
          // Инвертируем roughness (specular map): white=ocean должен быть чуть глаже.
          // Реалистичные значения: океан ~0.5 (рябь), суша ~0.95
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `
            float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
              vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
              // белый (вода) = 0.5 (не зеркало, есть рябь), чёрный (суша) = 0.95
              roughnessFactor *= mix(0.95, 0.5, texelRoughness.g);
            #endif
            `
          );
          // Emissive только на ночной стороне: умножаем на (1 - NdotL)
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `
            #ifdef USE_EMISSIVEMAP
              vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
              // dot(normal, lightDir) > 0 → день, < 0 → ночь
              // directLight из прошлых include, но проще взять из vViewPosition и point lights
              // Берём нормализованную нормаль в world space и направление на солнце
              float nightFactor = 1.0;
              #if NUM_POINT_LIGHTS > 0
                vec3 worldN = inverseTransformDirection( normal, viewMatrix );
                vec3 toLight = normalize( pointLights[0].position - (-vViewPosition) );
                vec3 worldL = inverseTransformDirection( toLight, viewMatrix );
                float NdotL = dot( worldN, worldL );
                // плавный переход: яркие огни там где темно
                nightFactor = smoothstep( 0.1, -0.1, NdotL );
              #endif
              totalEmissiveRadiance *= emissiveColor.rgb * nightFactor;
            #endif
            `
          );
        };
      }
    } else {
      // без текстуры — цветной
      mat = new THREE.MeshStandardMaterial({ color: def.color || 0x888888, roughness: 0.9, metalness: 0 });
    }

    const geo = new THREE.SphereGeometry(def.radius, 64, 64);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Облака Земли
    if (def.cloudTexture) {
      const ct = loader.load(`assets/textures/${def.cloudTexture}`);
      ct.colorSpace = THREE.SRGBColorSpace;
      const cmat = new THREE.MeshStandardMaterial({
        map: ct, transparent: true, opacity: 0.6, depthWrite: false,
      });
      const cgeo = new THREE.SphereGeometry(def.radius * 1.005, 64, 64);
      const clouds = new THREE.Mesh(cgeo, cmat);
      group.add(clouds);
      extraMeshes.set(def.name + '_clouds', clouds);
    }

    // Кольца
    if (def.ring) {
      const rt = loader.load(`assets/textures/${def.ring}`);
      rt.colorSpace = THREE.SRGBColorSpace;
      const rgeo = new THREE.RingGeometry(def.ringInner, def.ringOuter, 256);
      const pos = rgeo.attributes.position;
      const uv = rgeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const r = Math.sqrt(x*x + y*y);
        uv.setXY(i, (r - def.ringInner) / (def.ringOuter - def.ringInner), 0);
      }
      const rmat = new THREE.MeshBasicMaterial({ map: rt, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const ring = new THREE.Mesh(rgeo, rmat);
      ring.rotation.x = Math.PI / 2 - 0.47;   // наклон Сатурна ~26.7°
      group.add(ring);
    }

    // Многослойная корона Солнца — несколько сфер с разной прозрачностью/размером
    if (def.emissive) {
      // Слой 1: ближняя хромосфера (тёплое свечение вблизи поверхности)
      const halo1Geo = new THREE.SphereGeometry(def.radius * 1.05, 64, 64);
      const halo1Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.5, 2.2, 1.5), transparent: true, opacity: 0.55,
        side: THREE.BackSide, toneMapped: false, depthWrite: false,
      });
      group.add(new THREE.Mesh(halo1Geo, halo1Mat));

      // Слой 2: средняя корона
      const halo2Geo = new THREE.SphereGeometry(def.radius * 1.25, 64, 64);
      const halo2Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.8, 1.5, 0.9), transparent: true, opacity: 0.25,
        side: THREE.BackSide, toneMapped: false, depthWrite: false,
      });
      group.add(new THREE.Mesh(halo2Geo, halo2Mat));

      // Слой 3: внешняя корона (дальний glow)
      const halo3Geo = new THREE.SphereGeometry(def.radius * 1.7, 32, 32);
      const halo3Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.2, 0.9, 0.5), transparent: true, opacity: 0.12,
        side: THREE.BackSide, toneMapped: false, depthWrite: false,
      });
      group.add(new THREE.Mesh(halo3Geo, halo3Mat));
    }

    // Axial tilt + rotation: внешняя группа = tilt, внутренняя mesh = spin
    const rot = getRotation(def.name);
    group.rotation.x = rot.tilt * Math.PI / 180;   // наклон оси
    rotatables.push({ name: def.name, group, rot });

    scene.add(group);
    return group;
  }

  bodyMeshes.set('Sun', makeBody(SUN));
  for (const b of BODIES) bodyMeshes.set(b.name, makeBody(b));

  // Принудительно загрузить все текстуры на GPU чтобы при повороте камеры
  // не было фризов от ленивой декомпрессии/upload. Traverse всех материалов.
  setTimeout(() => {
    scene.traverse((obj) => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            if (m[key]) {
              try { renderer.initTexture(m[key]); } catch (e) {}
            }
          }
        }
      }
    });
    console.log('[space-sim] textures preloaded to GPU');
  }, 100);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, composer, bodyMeshes, extraMeshes, sunLight, starSphere, rotatables };
}

// Переставить все меши относительно позиции шаттла (camera-relative origin)
export function updateScene(ctx, bodyPositions, shuttle, camPos, camQuat, simTime) {
  const { bodyMeshes, extraMeshes, sunLight, starSphere, camera, rotatables } = ctx;
  const origin = shuttle.pos;

  for (const [name, pos] of bodyPositions) {
    const group = bodyMeshes.get(name);
    if (group) group.position.set(pos.x - origin.x, pos.y - origin.y, pos.z - origin.z);
  }

  // Axial rotation всех тел — внутренний mesh (сфера) крутится вокруг локального Y
  // с правильным угловым смещением в зависимости от simTime.
  for (const { name, group, rot } of rotatables) {
    if (group.children.length > 0) {
      const mesh = group.children[0];
      const periodSec = rot.period * 3600;
      const angleRad = ((simTime / periodSec) * 2 * Math.PI + rot.offset * Math.PI / 180) % (2 * Math.PI);
      mesh.rotation.y = angleRad;
    }
  }

  // Облака Земли — чуть быстрее вращаются чем сама Земля
  const clouds = extraMeshes.get('Earth_clouds');
  if (clouds) {
    const earthRot = getRotation('Earth');
    const periodSec = earthRot.period * 3600;
    clouds.rotation.y = ((simTime / periodSec) * 2 * Math.PI * 1.05 + earthRot.offset * Math.PI / 180) % (2 * Math.PI);
  }

  // солнечный свет
  const sp = bodyPositions.get('Sun');
  sunLight.position.set(sp.x - origin.x, sp.y - origin.y, sp.z - origin.z);

  // камера
  camera.position.copy(camPos);
  camera.quaternion.copy(camQuat);

  // starfield — центрирован на камере
  starSphere.position.copy(camera.position);
}
