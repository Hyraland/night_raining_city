// The cat: a giant hologram of a tabby standing in the street, where the idol stood. It sits there,
// now and then licks a paw, now and then looks left and right; now and then it gets up and runs off (beyond the
// projection's reach it is out of it, and gone), and soon comes running back, turns to face the street and sits
// again. Drawn as the other holograms are (light only, added on top, its own front surface only).
//
// The model (assets/cat.glb, from the earth_history project: "Medium poly Cat In Motion 3d Model Free" by
// iRahulRajput, CC BY 4.0, see CREDITS.md) is a still cat mid-stride; all its moving is done in the vertex
// shader, as in earth_history's src/walker.js (from where catDeform and markTail come, with a look round added):
// each part of the body (legs, head, tail) chosen by where it is and turned about its own joint.
// Model frame: 1 long, head toward +x, feet at y = 0, two legs on either side (+z near, -z far).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { shared, COMMON, DEFINES } from './toon.js';
import { LAYER } from './city.js';

const DEFORM_GLSL = /* glsl */ `
uniform float uPhase;   // the gait's phase (radians)
uniform float uWalk;    // how far it steps (0: standing)
uniform float uRun;     // 0 walk, 1 run
uniform float uSit;     // sitting
uniform float uLook;    // head up, looking ahead
uniform float uLick;    // a paw up, licking it
uniform float uScan;    // looking left and right
uniform float uCam;     // which side of it its paw and tail favour: +1 its +z side, -1 its -z side
uniform vec3 uTailRoot; // where the tail joins the hips
uniform float uTime;
attribute vec2 aTail;   // x: tail or not (0/1); y: along the tail (0 root, 1 tip); worked out on loading

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

void catDeform(vec3 p, out vec3 q, inout vec3 n) {
  q = p;
  float front = step(0.03, p.x);
  float near = step(0.0, p.z);
  float camSide = step(0.0, p.z * uCam);
  float isLeg = step(-0.33, p.x) * step(p.x, 0.46) * smoothstep(0.34, 0.22, p.y) * (1.0 - step(0.33, p.x) * step(0.36, p.y)) * (1.0 - aTail.x);
  float frontLeg = isLeg * front, hindLeg = isLeg * (1.0 - front);

  // the tail, about its root: up when walking (more toward the tip, a question mark), out behind when running,
  // round beside it along the ground when sitting
  vec3 tb = uTailRoot;
  float tt = aTail.y, tw = aTail.x;
  float up = mix(-2.5, -1.3, uRun) * (1.0 - uSit) * tw * (0.75 + 0.25 * tt);
  q.xy = tb.xy + rot(q.xy - tb.xy, up);
  float sway = (0.18 * sin(uPhase) * uWalk + 0.12 * sin(uTime * 0.9) * (1.0 - uWalk)) * tw * tt;
  float wrap = -1.7 * uCam * uSit * tw * tt;
  vec2 tz = rot(vec2(q.x - tb.x, q.z), sway + wrap);
  q.x = tb.x + tz.x; q.z = tz.y;

  // the head, about the neck: a little up when sitting, now and then a slow look round; down when licking, in
  // little strokes; and (uScan) a look to one side and the other
  vec2 nk = vec2(0.33, 0.46);
  float hw = smoothstep(0.30, 0.38, p.x) * smoothstep(0.33, 0.40, p.y);
  float lickBob = 0.12 * sin(uTime * 11.0) * uLick;
  float pitch = (0.12 * uLook - 0.45 * uLick - lickBob - 0.4 * uSit) * hw;   // (its head level again as it sits back)
  q.xy = nk + rot(q.xy - nk, pitch);
  n.xy = mix(n.xy, rot(n.xy, pitch), hw);
  float yawH = (0.18 * sin(uTime * 0.37) * smoothstep(0.6, 1.0, sin(uTime * 0.13)) * uLook * (1.0 - uLick)
    + 0.75 * sin(uTime * 0.9) * uScan) * hw;
  vec2 hz = rot(vec2(q.x - nk.x, q.z), yawH);
  q.x = nk.x + hz.x; q.z = hz.y;

  // the legs: walking and running; standing, under it
  vec2 piv = mix(vec2(-0.17, 0.36), vec2(0.2, 0.36), front);
  float a0 = mix(mix(-0.27, 0.23, near), mix(0.50, -0.145, near), front);
  float offWalk = mix(mix(3.1416, 0.0, near), mix(4.7124, 1.5708, near), front);
  float offRun = mix(mix(0.6, 0.0, near), mix(3.8, 3.2, near), front);
  float psi = uPhase + mix(offWalk, offRun, uRun);
  float amp = mix(0.36, 0.62, uRun);
  float ang = (amp * sin(psi) * uWalk - a0 * 0.8) * isLeg;
  // licking: the front paw on its favoured side up to its mouth
  float lk = uLick * frontLeg * camSide;
  ang = mix(ang, 2.25 + 0.08 * sin(uTime * 11.0), lk);
  vec2 lv = rot(q.xy - piv, ang);
  lv *= mix(1.0, 0.55, lk);
  q.xy = piv + lv;
  n.xy = rot(n.xy, ang);
  float swing = max(0.0, cos(psi));
  q.y += mix(0.035, 0.07, uRun) * swing * swing * uWalk * isLeg * smoothstep(0.3, 0.0, p.y) * (1.0 - lk);

  // sitting: the front legs stay, the body leans back about the shoulders, the hind legs fold forward from the
  // hips, their paws flat on the ground just behind the front ones: each hind leg as it stood (qs: from its hip down
  // to its paw, the paw's middle further back on the far side, as the model has it) laid along the line from its hip
  // to there, its paw still level
  float sitA = 0.5 * uSit * (1.0 - frontLeg);
  vec2 sh = vec2(0.2, 0.36), qs = q.xy;
  q.xy = sh + rot(q.xy - sh, sitA);
  vec2 hip = sh + rot(vec2(-0.17, 0.36) - sh, 0.5 * uSit);
  float fold = uSit * hindLeg, u = clamp(qs.y / 0.36, 0.0, 1.0);
  vec2 stood = mix(vec2(mix(-0.188, -0.146, near), 0.0), vec2(-0.17, 0.36), u);
  q.xy = mix(q.xy, mix(vec2(0.06, 0.0), hip, u) + qs - stood, fold);
  n.xy = rot(n.xy, sitA * (1.0 - fold));
  q.y = mix(q.y, max(q.y, 0.004), uSit);

  // the body's rise and fall: twice a stride walking; rocking fore and aft running
  float body = 1.0 - isLeg;
  q.y += (0.006 * sin(uPhase * 2.0) * (1.0 - uRun) + 0.022 * sin(uPhase) * uRun) * uWalk * body;
  q.xy = vec2(0.0, 0.36) + rot(q.xy - vec2(0.0, 0.36), 0.07 * sin(uPhase + 0.8) * uRun * uWalk * body);
}
`;

// Its tail: everything within 0.3 (along its surface) of the tail's tip, fading out to 0.38 (the legs are further
// round the hips than that), and how far along it each point is. Seams split vertices: joined by place first.
const TAIL_LEN = 0.34;
function markTail(geometry) {
  const p = geometry.attributes.position, idx = geometry.index.array, n = p.count;
  const rep = new Int32Array(n), seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!seen.has(k)) seen.set(k, i);
    rep[i] = seen.get(k);
  }
  const adj = new Map();
  const link = (a, b) => {
    const w = Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b));
    (adj.get(a) ?? adj.set(a, []).get(a)).push(b, w);
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
    link(a, b); link(b, a); link(b, c); link(c, b); link(a, c); link(c, a);
  }
  let tip = 0;
  for (let i = 1; i < n; i++) if (p.getX(i) < p.getX(tip)) tip = i;
  tip = rep[tip];
  const dist = new Float32Array(n).fill(Infinity), inQueue = new Uint8Array(n);
  dist[tip] = 0;
  const queue = [tip];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    inQueue[u] = 0;
    const e = adj.get(u) ?? [];
    for (let k = 0; k < e.length; k += 2) {
      const v = e[k], d = dist[u] + e[k + 1];
      if (d < dist[v] - 1e-7 && d < 0.5) {
        dist[v] = d;
        if (!inQueue[v]) { inQueue[v] = 1; queue.push(v); }
      }
    }
  }
  const attr = new Float32Array(n * 2), root = new THREE.Vector3();
  let rootN = 0;
  for (let i = 0; i < n; i++) {
    const d = dist[rep[i]];
    if (d === Infinity) continue;
    attr[i * 2] = 1 - THREE.MathUtils.smoothstep(d, 0.3, 0.38);
    attr[i * 2 + 1] = Math.max(0, 1 - d / TAIL_LEN);
    if (d > 0.3 && d < TAIL_LEN) { root.x += p.getX(i); root.y += p.getY(i); root.z += p.getZ(i); rootN++; }
  }
  geometry.setAttribute('aTail', new THREE.BufferAttribute(attr, 2));
  return rootN ? root.multiplyScalar(1 / rootN) : new THREE.Vector3(-0.32, 0.4, 0.02);
}

export async function loadHoloCat(url) {
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url);
  draco.dispose();
  return gltf.scene;
}

const VERTEX = /* glsl */ `
  ${DEFORM_GLSL}
  varying vec3 vWorld, vNormal; varying vec2 vUv;
  void main() {
    vec3 n = normal, q;
    catDeform(position, q, n);
    vUv = uv;
    vec4 wp = modelMatrix * vec4(q, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

// its skin, light: as the idol's (her own colours in the colour mode); nothing outside the projection (uStage:
// its middle x, z and how far it reaches)
function holoSkin(uniforms, map) {
  return new THREE.ShaderMaterial({
    defines: { ...DEFINES },
    uniforms: { ...shared, ...uniforms, uMap: { value: map }, uHasMap: { value: map ? 1 : 0 } },
    transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uScrMid, uStage;
      varying vec3 vWorld, vNormal; varying vec2 vUv;
      float lineAt(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(d) * 1.2, abs(d)); }
      void main() {
        if (length(vWorld.xz - uStage.xy) > uStage.z) discard;
        vec4 tx = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(0.8);
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(clamp(1.0 - abs(dot(normalize(vNormal), V)), 0.0, 1.0), 2.0);
        float t = uTime;
        float scan = lineAt(fract(vWorld.y * 1.4 - t * 0.7) - 0.5, 0.2);
        float lum = sqrt(dot(tx.rgb, vec3(0.299, 0.587, 0.114)));
        float v = 0.04 + lum * 0.55 + rim * 0.55 + scan * 0.1;
        v *= 0.9 + 0.1 * hash11(floor(t * 20.0));
        v *= 1.0 - step(0.95, hash11(floor(vWorld.y * 1.5 + t * 4.0) + floor(t * 3.0) * 7.0)) * 0.7;
        vec3 c;
        if (uColorMode > 0.5) c = min(pow(tx.rgb, vec3(0.6)) * (0.3 + v * 1.1), vec3(0.85)) + uLampColor * rim * 0.6;
        else if (uThree > 0.5) {
          float l1 = smoothstep(0.14, 0.2, v), l2 = smoothstep(0.6, 0.68, v);
          c = mix(mix(uScrMid * v, uScrMid * 0.75, l1), uHue * vec3(1.8, 2.1, 2.1), l2);
        } else c = mix(uScrMid * 0.35 * min(v / 0.3, 1.0), uHue * vec3(1.8, 2.1, 2.1), smoothstep(0.38, 0.45, v));
        gl_FragColor = vec4(c * (1.0 - fogAmount(vWorld) * 0.8), 1.0);
      }`,
  });
}

const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, dt * rate);

// at: { x, y, z, scale }: where it stands (y: the ground's height), how many metres long the cat is
export function buildHoloCat(model, { x, y, z, scale }) {
  const group = new THREE.Group(), root = new THREE.Group(), body = new THREE.Group();
  group.add(root);
  root.add(body);
  root.position.set(x, y, z);
  const R = scale * 0.62;                                 // how far the projection reaches
  const uniforms = {
    uPhase: { value: 0 }, uWalk: { value: 0 }, uRun: { value: 0 }, uSit: { value: 1 }, uLook: { value: 1 }, uLick: { value: 0 },
    uScan: { value: 0 }, uCam: { value: 1 }, uTailRoot: { value: new THREE.Vector3(-0.32, 0.4, 0.02) },
    uStage: { value: new THREE.Vector3(x, z, R) },
  };
  model.scale.setScalar(scale);
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    uniforms.uTailRoot.value.copy(markTail(m.geometry));
    const map = m.material.map || null;
    // its depth first, so only its front surface is lit (pushed back a hair)
    const depthMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...uniforms }, vertexShader: VERTEX, colorWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8,
      fragmentShader: `uniform vec3 uStage; varying vec3 vWorld; void main() { if (length(vWorld.xz - uStage.xy) > uStage.z) discard; gl_FragColor = vec4(0.0); }`,
    });
    const twin = new THREE.Mesh(m.geometry, depthMat);
    twin.position.copy(m.position); twin.quaternion.copy(m.quaternion); twin.scale.copy(m.scale);
    twin.renderOrder = 20;
    m.parent.add(twin);
    m.material.dispose();
    m.material = holoSkin(uniforms, map);
    m.renderOrder = 21;
  }
  model.traverse((o) => { o.layers.set(LAYER.GLOW); o.frustumCulled = false; });
  body.add(model);

  // (no stage under it: it stands in the street itself; past R from its middle it is out of the projection still)

  // what it is doing: sitting (licking now and then, looking round now and then), getting up, running off,
  // away, running back, turning to face the street; each pose eased in and out
  const FRONT = -Math.PI / 2;                             // (its head toward +z: down the street, toward the start)
  const pose = { walk: 0, run: 0, sit: 1, look: 1, lick: 0, scan: 0 };
  let mode = 'sit', modeT = 0, at = 0, dir = 1, yaw = FRONT, phase = 0, awayFor = 2;
  let nextLick = 5 + Math.random() * 5, nextScan = 12 + Math.random() * 6, leaveAt = 25 + Math.random() * 20;
  const go = (m) => { mode = m; modeT = 0; };
  const light = { x, y: y + scale * 0.4, z, power: 0.6, reach: scale * 2.5 };

  return {
    group,
    light,
    // (to see one of its doings now: 'lick', 'look', 'leave')
    act(what) {
      if (mode !== 'sit') return;
      if (what === 'lick') nextLick = modeT;
      else if (what === 'look') nextScan = modeT;
      else if (what === 'leave') { dir = Math.random() < 0.5 ? -1 : 1; go('rise'); }
    },
    update(t, dt) {
      modeT += dt;
      const want = { walk: 0, run: 0, sit: 0, look: 0, lick: 0, scan: 0 };
      let speed = 0, wantYaw = yaw;
      if (mode === 'sit') {
        want.sit = 1; want.look = 1;
        if (modeT > nextLick && modeT < nextLick + 3.2) { want.lick = 1; want.look = 0; }
        else if (modeT > nextLick + 3.2) nextLick = modeT + 7 + Math.random() * 8;
        if (modeT > nextScan && modeT < nextScan + 4.5 && !want.lick) want.scan = 1;
        else if (modeT > nextScan + 4.5) nextScan = modeT + 9 + Math.random() * 9;
        if (modeT > leaveAt && !want.lick && !want.scan) { dir = Math.random() < 0.5 ? -1 : 1; go('rise'); }
      } else if (mode === 'rise') {                     // up, and round toward the way it will go
        wantYaw = dir > 0 ? 0 : Math.PI;
        want.walk = modeT > 0.5 ? 0.7 : 0;
        if (modeT > 1.2) go('off');
      } else if (mode === 'off') {                      // away at a run, out of the projection
        wantYaw = dir > 0 ? 0 : Math.PI;
        want.walk = 1; want.run = 1;
        speed = scale * 1.3 * Math.min(1, modeT / 0.6);
        at += dir * speed * dt;
        if (Math.abs(at) > R + scale * 0.8) { awayFor = 1.5 + Math.random() * 2.5; go('away'); }
      } else if (mode === 'away') {                     // gone a little while
        if (modeT > awayFor) {
          dir = Math.random() < 0.5 ? -1 : 1;           // back from one side or the other: running toward the middle
          at = -dir * (R + scale * 0.8);
          go('back');
        }
      } else if (mode === 'back') {
        wantYaw = dir > 0 ? 0 : Math.PI;
        const left = Math.abs(at), slow = THREE.MathUtils.clamp(left / (scale * 0.8), 0.25, 1);
        want.walk = 1; want.run = slow > 0.6 ? 1 : 0;
        speed = scale * 1.3 * slow;
        at += dir * speed * dt;
        if (dir * at >= 0) { at = 0; go('settle'); }
      } else if (mode === 'settle') {                   // round to face the street, and down
        wantYaw = FRONT;
        want.walk = Math.abs(yaw - FRONT) > 0.08 ? 0.6 : 0;
        if (Math.abs(yaw - FRONT) < 0.08 && modeT > 0.8) { want.sit = 1; want.look = 1; }
        if (modeT > 2.4) { go('sit'); nextLick = 6 + Math.random() * 6; nextScan = 3 + Math.random() * 4; leaveAt = 25 + Math.random() * 25; }
      }
      // turn the shorter way round
      let dy = wantYaw - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * Math.min(1, dt * 4);
      body.rotation.y = yaw;
      root.position.x = x + at;

      pose.walk = approach(pose.walk, want.walk, 5, dt);
      pose.run = approach(pose.run, want.run, 3, dt);
      pose.sit = approach(pose.sit, want.sit, want.sit ? 1.6 : 7, dt);
      pose.look = approach(pose.look, want.look, 2.5, dt);
      pose.lick = approach(pose.lick, want.lick, 4, dt);
      pose.scan = approach(pose.scan, want.scan, 1.5, dt);
      const cadence = THREE.MathUtils.lerp(Math.max(speed / scale * 6, Math.abs(dy) > 0.05 ? 5 : 0, 4), 11, pose.run);
      phase += cadence * dt * Math.max(pose.walk, 0.001);

      const u = uniforms;
      u.uPhase.value = phase;
      u.uWalk.value = pose.walk;
      u.uRun.value = pose.run;
      u.uSit.value = pose.sit;
      u.uLook.value = pose.look;
      u.uLick.value = pose.lick;
      u.uScan.value = pose.scan;
      light.x = x + at;
    },
  };
}
