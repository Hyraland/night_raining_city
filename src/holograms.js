// Holograms: a whale of light that materializes over the street and swims away down it, a turning ring of
// words over the first crossing, a globe over the second, and small floating street signs. All drawn with
// light only (added on top, no depth), posterized like everything else: a faint cyan body, cyan lines, and
// white edges bright enough to bloom; scan lines, flicker and the odd slipped band.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shared, DEFINES, COMMON } from './toon.js';
import { CROSSINGS, LAYER, CURB, shopAlong, SHOPS } from './city.js';
import { makeRandom } from './rand.js';

const WHALE_LEN = 44;
const KIND = { WHALE: 0, GLOBE: 1, RING: 2, SIGN: 3, BEAM: 4, ORBIT: 5, WORDS: 6 };

function holoMaterial(kind, { atlas = null, rect = new THREE.Vector4(), swim = false, side = THREE.DoubleSide } = {}) {
  return new THREE.ShaderMaterial({
    defines: { ...DEFINES, SWIM: swim ? 1 : 0 },
    uniforms: {
      ...shared,
      uKind: { value: kind }, uAtlas: { value: atlas }, uRect: { value: rect },
      uReveal: { value: 1 }, uFade: { value: 0 }, uSeed: { value: Math.random() }, uRepeat: { value: 1 }, uWords: { value: new THREE.Vector3(1.95, 2.0, 2.05) },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec4 aWhale;
      varying vec3 vWorld, vNormal; varying vec2 vUv; varying float vS; varying vec4 vWhale;
      void main() {
        vec3 p = position;
        vS = clamp((p.z + ${(WHALE_LEN / 2).toFixed(1)}) / ${WHALE_LEN.toFixed(1)}, 0.0, 1.0);
#if SWIM
        // a slow beat of the tail, the body following it
        float s = vS;
        p.y += 1.3 * sin(s * 4.2 - uTime * 1.25) * s * s * 1.6 - 0.4 * sin(uTime * 1.25) * (1.0 - s);
        p.y += aWhale.a * 0.7 * sin(uTime * 0.8 + 1.0);   // the flippers, slowly
#endif
        vWhale = aWhale;
        vUv = uv;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uKind, uReveal, uFade, uSeed, uRepeat; uniform sampler2D uAtlas; uniform vec4 uRect; uniform vec3 uScrMid, uWords;
      varying vec3 vWorld, vNormal; varying vec2 vUv; varying float vS; varying vec4 vWhale;
      float lineAt(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(d) * 1.2, abs(d)); }
      float text(vec2 uv) { return texture2D(uAtlas, mix(uRect.xy, uRect.zw, clamp(uv, 0.0, 1.0))).r; }
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(clamp(1.0 - abs(dot(normalize(vNormal), V)), 0.0, 1.0), 2.2);
        float t = uTime + uSeed * 40.0;
        float scan = lineAt(fract(vWorld.y * 1.6 - t * 0.9) - 0.5, 0.18);
        float v = 0.0;

        if (uKind < 0.5) {               // whale: a lattice of rings and meridians, edges glowing
          vec2 g = vUv * vec2(56.0, 20.0);
          float grid = max(lineAt(fract(g.x) - 0.5, 0.07), lineAt(fract(g.y) - 0.5, 0.07));
          // the throat pleats, lines along the belly in place of the lattice, fading out before they are
          // too fine to draw
          float pv = vUv.y * 120.0;
          float pleats = lineAt(fract(pv) - 0.5, 0.2) * vWhale.r * (1.0 - smoothstep(0.3, 0.6, fwidth(pv)));
          grid *= 1.0 - vWhale.r;
          // the mouth line (in metres from it), and the eye: a ring round a bright dot (the blowholes too)
          float mouth = lineAt((vWhale.g - 0.5) * 4.0, 0.1) * (1.0 - smoothstep(0.17, 0.19, vUv.x));
          float e = vWhale.b * 2.0;
          float eye = max(lineAt(e - 0.3, 0.08), 1.0 - smoothstep(0.1, 0.14, e));
          // and the mottling on its back that makes a blue whale's blue
          float mottle = step(0.68, vnoise(vUv * vec2(300.0, 46.0))) * smoothstep(-0.1, 0.4, sin(vUv.y * 6.2832));
          v = 0.05 + rim * 0.8 + grid * 0.2 + pleats * 0.5 + mottle * 0.1 + max(mouth, eye) * 0.9 + scan * 0.08;
          // the scan that builds it, sweeping from the head
          float front = uReveal * 1.15 - vS;
          v *= step(0.0, front);
          v += lineAt(front, 0.012) * 1.5 * step(uReveal, 0.999);
        } else if (uKind < 1.5) {        // globe: latitude and longitude, dotted land
          vec2 g = vUv * vec2(24.0, 12.0);
          float grid = max(lineAt(fract(g.x) - 0.5, 0.05), lineAt(fract(g.y) - 0.5, 0.05));
          float land = step(0.56, vnoise(vUv * vec2(9.0, 4.5) + 3.0) * 0.7 + vnoise(vUv * vec2(26.0, 13.0)) * 0.3);
          vec2 d = fract(vUv * vec2(160.0, 80.0)) - 0.5;
          float dots = land * (1.0 - smoothstep(0.2, 0.35, length(d)));
          v = 0.04 + rim * 0.55 + grid * 0.24 + dots * 0.4 + scan * 0.06;
        } else if (uKind < 2.5) {        // ring of words
          float tx = text(vec2(fract(vUv.x * uRepeat), (vUv.y - 0.5) * 1.15 + 0.5));
          float edges = lineAt(abs(vUv.y - 0.5) - 0.47, 0.03);
          v = 0.04 + tx * 0.9 + edges * 0.6 + scan * 0.08;
          v *= gl_FrontFacing ? 1.0 : 0.35;
        } else if (uKind < 3.5) {        // floating sign
          vec2 m = min(vUv, 1.0 - vUv);
          float frame = lineAt(min(m.x, m.y) - 0.04, 0.02);
          float tx = text((vUv - 0.5) * vec2(1.1, 1.25) + 0.5);
          v = 0.06 + tx * 0.95 + frame * 0.7 + scan * 0.15;
          v *= gl_FrontFacing ? 1.0 : 0.3;
        } else if (uKind < 4.5) {        // projector beam: a column of light, brighter at the core
          v = (0.05 + 0.25 * pow(1.0 - rim, 4.0)) * (0.7 + 0.3 * scan) * (1.0 - vUv.y * 0.5);
        } else if (uKind < 5.5) {        // orbit lines
          v = 0.7 + 0.3 * scan;
        } else {                         // words alone, no frame, nothing round them (white, below)
          float tx = text((vUv - 0.5) * vec2(1.1, 1.25) + 0.5);
          v = tx * (0.85 + 0.15 * scan);
          v *= gl_FrontFacing ? 1.0 : 0.0;
        }

        // flicker, and now and then a band that drops out
        v *= 0.88 + 0.12 * hash11(floor(t * 20.0));
        v *= 1.0 - step(0.93, hash11(floor(vWorld.y * 0.8 + t * 5.0) + floor(t * 3.0) * 7.0)) * 0.7;
        v *= 1.0 - uFade;

        vec3 c;
        if (uThree > 0.5) {
          float l1 = smoothstep(0.14, 0.2, v), l2 = smoothstep(0.62, 0.7, v);
          c = mix(mix(uScrMid * v, uScrMid * 0.75, l1), uHue * vec3(1.8, 2.1, 2.1), l2);
        } else {
          c = mix(uScrMid * 0.35 * min(v / 0.3, 1.0), uHue * vec3(1.8, 2.1, 2.1), smoothstep(0.38, 0.45, v));
        }
        if (uKind > 5.5) c = uWords * v;   // (words alone: white light, or its own colour)
        gl_FragColor = vec4(c * (1.0 - fogAmount(vWorld) * 0.8), 1.0);
      }`,
  });
}
// A double helix of dots, H high from the ground, its axis upright at the mesh's place: each dot's place on the helix
// in an attribute (its height; which: 0 or 1 a strand, 2 a pair between them, t where across it), turned in the shader
function dnaHelix(H) {
  const P = [], R = 1.7;
  for (let h = 0.4; h < H; h += 0.2) for (const w of [0, 1]) P.push(h, w, 0, 0);
  for (let h = 0.6; h < H; h += 0.62) for (let k = 1; k < 8; k++) P.push(h, 2, k / 8, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(P.length / 4 * 3), 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(P, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uR: { value: R }, uH: { value: H }, uScrMid: shared.uScrMid, uHue: shared.uHue },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aP; uniform float uTime, uR, uH; varying float vB, vPair;
      void main() {
        float h = aP.x, a = h * 0.42 + uTime * 0.45;
        vec3 p0 = vec3(cos(a) * uR, h, sin(a) * uR), p1 = vec3(-cos(a) * uR, h, -sin(a) * uR);
        vec3 p = aP.y < 0.5 ? p0 : aP.y < 1.5 ? p1 : mix(p0, p1, aP.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0), mc = modelViewMatrix * vec4(0.0, h, 0.0, 1.0);
        float away = mv.z < mc.z ? 0.45 : 1.0;                                  // (the far side dimmer)
        float band = exp(-pow(h - mod(uTime * 3.5, uH + 8.0) + 4.0, 2.0) * 0.6);   // (a light going up)
        vB = away * (1.0 + 1.2 * band); vPair = aP.y > 1.5 ? 1.0 : 0.0;
        gl_PointSize = (aP.y > 1.5 ? 0.2 : 0.32) * 620.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uScrMid; uniform mat3 uHue; varying float vB, vPair;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = 1.0 - smoothstep(0.15, 0.5, d);
        vec3 c = mix(uHue * vec3(0.55, 1.35, 1.5), uHue * vec3(1.5, 1.7, 1.75), vPair * 0.3 + core * 0.4);
        gl_FragColor = vec4(c * core * vB, 1.0);
      }`,
  });
  const m = new THREE.Points(g, mat);
  m.frustumCulled = false;
  return m;
}
// ------------------------------------------------------------------ the whale

// The whale is a blue whale built in Blender (blender/build_whale.py): 44 m, head toward -z. Its vertex
// colours, renamed aWhale here, mark what the hologram draws on it: throat pleats, the mouth line, the eye and
// blowholes, and how far each flipper sways. Beside it, to compare, the downloaded one made over the same way
// (blender/convert_reference_whale.py); the tuning chooses (holo.whale).
export async function loadWhales() {
  const loader = new GLTFLoader();
  const load = async (file) => {
    const geom = (await loader.loadAsync(file)).scene.getObjectByProperty('isMesh', true).geometry;
    geom.setAttribute('aWhale', geom.getAttribute('color'));
    geom.deleteAttribute('color');
    return geom;
  };
  const [ours, sketchfab] = await Promise.all([load('assets/whale.glb'), load('assets/whale_ref.glb')]);
  return { ours, sketchfab };
}

// extra: more floating signs where the city asks for them: { x, y, z, text (a horizontal strip of the atlas) };
// whales: from loadWhales()
export function buildHolograms(atlas, extra, whales) {
  const group = new THREE.Group();
  const R = makeRandom(77);
  const lights = []; // { x, y, z, power, reach } updated each frame

  // the whale
  const whaleMat = holoMaterial(KIND.WHALE, { swim: true });
  const whale = new THREE.Mesh(whales.ours, whaleMat);
  whale.frustumCulled = false;
  whale.layers.set(LAYER.GLOW);
  group.add(whale);
  const whaleLight = { x: 0, y: 0, z: 0, power: 0, reach: 42 };
  lights.push(whaleLight);
  const swim = { start: -1e9, z0: 0, dur: 150, speed: 5.2 };

  // the ring of words over the first crossing, on a beam from the road
  const ringZ = CROSSINGS[0], ringY = 27;
  const ringMat = holoMaterial(KIND.RING, { atlas: atlas.texture, rect: atlas.rects.h[0] });
  ringMat.uniforms.uRepeat.value = 3;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3.4, 96, 1, true), ringMat);
  ring.position.set(0, ringY, ringZ);
  const ring2Mat = holoMaterial(KIND.RING, { atlas: atlas.texture, rect: atlas.rects.h[12] });
  ring2Mat.uniforms.uRepeat.value = 4;
  const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2, 96, 1, true), ring2Mat);
  ring2.position.set(0, ringY - 4.2, ringZ);
  const beamMat = holoMaterial(KIND.BEAM);
  // under it (the museum's), a double helix of DNA in dots, turning: two strands, the pairs between them as rows of
  // dots across; the half turned away dimmer; a brighter band going up it now and then
  const helix = dnaHelix(ringY - 5.4);
  helix.position.set(0, 0, ringZ);
  lights.push({ x: 0, y: ringY, z: ringZ, power: 0.7, reach: 26 });

  // the globe over the second crossing, with two orbits
  const globeZ = CROSSINGS[1], globeY = 24;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(7, 64, 32), holoMaterial(KIND.GLOBE));
  globe.position.set(0, globeY, globeZ);
  globe.rotation.z = 0.35;
  const orbitMat = holoMaterial(KIND.ORBIT);
  const orbits = [0.9, -0.6].map((tilt, i) => {
    const o = new THREE.Mesh(new THREE.TorusGeometry(9.5 + i * 1.6, 0.05, 6, 160), orbitMat);
    o.position.copy(globe.position);
    o.rotation.set(Math.PI / 2 + tilt, 0, 0);
    return o;
  });
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.8, globeY - 7, 24, 1, true).translate(0, (globeY - 7) / 2, 0), beamMat);
  beam2.position.set(0, 0, globeZ);
  lights.push({ x: 0, y: globeY, z: globeZ, power: 0.5, reach: 30 });

  // Floating signs: two faces back to back, each seen only from its own side, so the words never read
  // mirrored; the back may say something else (a sign meant for one way, with another for the way back).
  const signs = [];
  // (size: how many times the usual size; white: its words alone, in white light (or words: their colour))
  const sign = (front, back = front, size = 1, white = false, words = null) => {
    const g = new THREE.Group();
    const h = 0.9 * size;
    const aspect = (r) => (r.z - r.x) / (r.w - r.y);
    const w = Math.min(5.5 * size, h * Math.max(aspect(front), aspect(back)) * 0.95);
    for (const [rect, turn] of [[front, 0], [back, Math.PI]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 1.3), holoMaterial(white ? KIND.WORDS : KIND.SIGN, { atlas: atlas.texture, rect, side: THREE.FrontSide }));
      if (words) m.material.uniforms.uWords.value.set(...words);
      m.rotation.y = turn;
      m.position.z = turn ? -0.01 : 0.01;
      g.add(m);
    }
    return g;
  };
  for (let z = 120; z > -980; z -= R.range(60, 110)) {
    const s = R.chance(0.5) ? -1 : 1;
    const g = sign(atlas.rects.h[R.pick([5, 9, 15, 0, 13, 10])]);
    g.position.set(s * R.range(9.5, 11.2), CURB + R.range(2.7, 3.4), z);
    if (shopAlong(s, z - 4, z + 4)) g.position.y = CURB + 5.6;   // over a shop's front: up above its signs
    // (and above the ad over 流波月's front)
    if (SHOPS.some((sh) => sh.s === s && sh.brand === 'pearl-moon' && sh.z0 - 4 < z && z < sh.z1 + 4)) g.position.y = CURB + 8.4;
    g.userData.y = g.position.y;
    g.userData.phase = R.next() * 6;
    signs.push(g);
  }
  // those the city asks for: text (and back: what its other face says) from the atlas set 'h' or 'h2'; size;
  // white: its words alone, in white light
  for (const e of extra) {
    const set = atlas.rects[e.set || 'h'];
    const g = sign(set[e.text], set[e.back ?? e.text], e.size, e.white, e.words);
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = e.rotY || 0;
    g.userData.inside = !!e.inside;   // in the metro station, below the street: its own layer
    g.userData.y = e.y;
    g.userData.phase = R.next() * 6;
    signs.push(g);
  }

  for (const m of [ring, ring2, helix, globe, ...orbits, beam2, ...signs]) {
    const layer = m.userData.inside ? LAYER.INSIDE : LAYER.GLOW;
    m.traverse((o) => { o.layers.set(layer); o.frustumCulled = false; });
    m.frustumCulled = false;
    group.add(m);
  }

  return {
    group,
    lights,
    whale,
    setWhale(name) { whale.geometry = whales[name] || whales.ours; },
    update(t, dt, viewer) {
      // the whale: appears behind and above the viewer, swims off down the street, fades into the rain
      let age = t - swim.start;
      if (age > swim.dur) {
        swim.start = t;
        swim.z0 = viewer.z + 70;
        age = 0;
      }
      const z = swim.z0 - age * swim.speed;
      const y = 40 + 3 * Math.sin(age * 0.21);
      const x = 3.5 * Math.sin(age * 0.045 + 1.0);
      whale.position.set(x, y, z);
      const vx = 3.5 * 0.045 * Math.cos(age * 0.045 + 1.0), vy = 3 * 0.21 * Math.cos(age * 0.21);
      whale.rotation.set(Math.atan2(vy, swim.speed), -Math.atan2(vx, swim.speed), 0, 'YXZ');
      whaleMat.uniforms.uReveal.value = THREE.MathUtils.clamp(age / 6, 0, 1);
      whaleMat.uniforms.uFade.value = THREE.MathUtils.smoothstep(age, swim.dur - 12, swim.dur);
      Object.assign(whaleLight, { x, y, z, power: 0.6 * whaleMat.uniforms.uReveal.value * (1 - whaleMat.uniforms.uFade.value) });

      ring.rotation.y = t * 0.12;
      ring2.rotation.y = -t * 0.2;
      globe.rotation.y = t * 0.08;
      orbits[0].rotation.z = t * 0.3;
      orbits[1].rotation.z = -t * 0.22;
      for (const s of signs) s.position.y = s.userData.y + Math.sin(t * 0.9 + s.userData.phase) * 0.08;
    },
  };
}
