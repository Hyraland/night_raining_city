// The trees along the pavements, in the plazas and on the podium roofs: slim trunks and soft faceted
// crowns in the same flat tones as everything else, about half of them strung with tiny lights that drift
// round their crowns, pulse in waves, and some of which wander off like fireflies and come back.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propsMaterial, glowMaterial, shared, DEFINES, COMMON, TINT, pickOf } from './toon.js';
import { LAYER } from './city.js';
import { mulberry32 } from './rand.js';

const albedo = (g, a) => g.setAttribute('aAlbedo', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(a), 1));

export function buildTrees(list, pixelRatio) {
  const rnd = mulberry32(9);
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.12, 1, 6).translate(0, 0.5, 0);
  // a crown of three overlapping lobes, so it has an outline like foliage rather than a ball
  const crownGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.78, 1).translate(0, 0.12, 0),
    new THREE.IcosahedronGeometry(0.6, 1).translate(0.42, -0.12, 0.18),
    new THREE.IcosahedronGeometry(0.58, 1).translate(-0.36, -0.2, -0.24),
  ]);
  albedo(trunkGeo, 0.5);
  albedo(crownGeo, 0.5);
  // in the colour mode: bark, and leaves each tree a green of its own
  const tint = (g, t) => g.setAttribute('aTint', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).map((_, i) => t[i % 3]), 3));
  tint(trunkGeo, TINT.bark);
  tint(crownGeo, TINT.OWN);
  const greens = ['#4f8a4c', '#3f7a52', '#5c8f45', '#36704f', '#6a9a5a'].map((h) => new THREE.Color(h).toArray());
  const trunkMat = propsMaterial(), crownMat = propsMaterial();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const trunkAt = [], crownAt = [];
  // the lights: where each one sits on its crown (and the crown), how it moves; see the shader below
  const pos = [], crown = [], orb = [], kind = [];
  list.forEach((t, i) => {
    m.compose(p.set(t.x, t.y, t.z), q.identity(), sc.set(1, t.h * 0.55, 1));
    trunkAt.push(m.clone());
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    const cy = t.y + t.h * 0.62, ry = t.h * 0.36;
    m.compose(p.set(t.x, cy, t.z), q, sc.set(t.r, ry, t.r));
    crownAt.push(m.clone());
    if (t.lights) {
      const treeSeed = rnd(), spin = (rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.12);
      for (let k = 0; k < 44; k++) {
        const u = rnd() * 1.8 - 0.9, a = rnd() * Math.PI * 2;
        pos.push(t.x, cy, t.z);
        crown.push(t.x, cy, t.z, treeSeed);
        orb.push(a, u, t.r * 1.12, ry * 1.1);   // just outside the leaves
        kind.push(rnd() < 0.25 ? 1 : 0, rnd(), spin, rnd() < 0.3 ? 1 : 0);
      }
    }
  });
  const group = new THREE.Group();
  // (in lots 100 m long along the street, each culled when out of view, and drawn only from near enough: lots, for
  // main.js; each tree its own green as it always was)
  const byLot = new Map();
  list.forEach((t, i) => { const k = Math.floor(t.z / 100); if (!byLot.has(k)) byLot.set(k, []); byLot.get(k).push(i); });
  const lots = [];
  for (const [k, idx] of byLot) {
    const cg = crownGeo.clone();
    cg.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(idx.flatMap((i) => pickOf(greens, i))), 3));
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, idx.length), crowns = new THREE.InstancedMesh(cg, crownMat, idx.length);
    idx.forEach((i, j) => { trunks.setMatrixAt(j, trunkAt[i]); crowns.setMatrixAt(j, crownAt[i]); });
    for (const mesh of [trunks, crowns]) {
      mesh.layers.set(LAYER.SOLID);
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    lots.push({ x: 0, z: (k + 0.5) * 100, reach: 550, refl: 70, meshes: [trunks, crowns] });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCrown', new THREE.Float32BufferAttribute(crown, 4));  // centre, the tree's seed
  g.setAttribute('aOrb', new THREE.Float32BufferAttribute(orb, 4));      // angle round, height (-1..1), radii
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 4));    // firefly?, phase, spin, cyan?
  const points = new THREE.Points(g, new THREE.ShaderMaterial({
    defines: { ...DEFINES },
    uniforms: { ...shared, uPR: { value: pixelRatio } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uPR;
      attribute vec4 aCrown, aOrb, aKind;
      varying float vA;
      varying vec3 vCol;
      void main() {
        float ph = aKind.y * 6.2832, fly = aKind.x;
        // most of them drift slowly round the crown, all of a tree's the same way, bobbing a little
        float th = aOrb.x + uTime * aKind.z * (1.0 + fly * 1.5);
        float u = clamp(aOrb.y + 0.06 * sin(uTime * 0.5 + ph), -0.97, 0.97);
        float away = 1.0;
        float glow = 1.0;
        if (fly > 0.5) {
          // fireflies: wander out from the crown in slow loops and come back, fading in and out
          away = 1.0 + 0.45 * (0.5 + 0.5 * sin(uTime * 0.35 + ph)) + 0.15 * sin(uTime * 1.3 + ph * 2.0);
          u += 0.25 * sin(uTime * 0.7 + ph);
          glow = smoothstep(0.1, 0.6, 0.5 + 0.5 * sin(uTime * 0.9 + ph * 3.0));
        }
        float s = sqrt(max(1.0 - u * u, 0.0));
        vec3 p = aCrown.xyz + vec3(cos(th) * s * aOrb.z * away, u * aOrb.w * (fly > 0.5 ? away : 1.0), sin(th) * s * aOrb.z * away);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // a wave of light rising up the tree, now and then a bright band sweeping round it, and each one's twinkle
        float t0 = uTime + aCrown.w * 40.0;
        float rise = 0.55 + 0.45 * sin(u * 3.0 - t0 * 1.4);
        float sweep = pow(0.5 + 0.5 * cos(th - t0 * 0.8), 10.0) * smoothstep(0.6, 0.9, sin(t0 * 0.21));
        float tw = 0.75 + 0.25 * sin(uTime * (1.7 + aKind.y) + ph * 7.0);
        vA = (rise * tw + sweep * 1.4) * glow * (1.0 - fogAmount(p) * 0.85);
        vCol = uHue * mix(vec3(1.5, 1.7, 1.7), vec3(0.45, 1.5, 1.75), aKind.w);
        if (uColorMode > 0.5) vCol = aKind.w > 0.5 ? vCol : uLampColor * 1.7;   // fairy lights: warm, a few cyan
        gl_PointSize = clamp(70.0 / -mv.z, 1.2, 4.5) * (fly > 0.5 ? 1.25 : 1.0) * (0.8 + 0.4 * sweep) * uPR;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vCol;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vCol * vA * (1.0 - d * 1.6), 1.0);
      }`,
  }));
  points.layers.set(LAYER.GLOW);
  points.frustumCulled = false;
  group.add(points);

  // Some trees wrapped in thin rings of light, tilted, slowly turning round the crown.
  const banded = list.filter((t) => t.bands);
  const RINGS = 3;
  const ringGeo = new THREE.TorusGeometry(1, 0.012, 4, 64).rotateX(Math.PI / 2);
  const n = ringGeo.attributes.position.count;
  ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [0.35, 1.5, 1.7][i % 3]), 3));
  ringGeo.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  const rings = new THREE.InstancedMesh(ringGeo, glowMaterial(), Math.max(1, banded.length * RINGS));
  rings.count = banded.length * RINGS;
  rings.layers.set(LAYER.GLOW);
  rings.frustumCulled = false;
  group.add(rings);
  const e = new THREE.Euler(), one = new THREE.Vector3();
  // (the rings only of trees within 200 m of the viewer: so thin, further off they would not be seen)
  const update = (time, viewerZ = 0) => {
    let n = 0;
    banded.forEach((t, i) => {
      if (Math.abs(t.z - viewerZ) > 200) return;
      const cy = t.y + t.h * 0.62, ry = t.h * 0.36;
      for (let k = 0; k < RINGS; k++) {
        const y = cy + (k - 1) * ry * 0.45, f = Math.sqrt(Math.max(0.2, 1 - Math.pow((y - cy) / (ry * 1.1), 2)));
        e.set(0.28 * Math.sin(k * 2.1 + i), time * (0.15 + 0.07 * k) * (k % 2 ? -1 : 1) + k, 0.25 * Math.cos(k * 1.7 + i));
        q.setFromEuler(e);
        const rr = t.r * 1.12 * f;
        m.compose(p.set(t.x, y, t.z), q, one.set(rr, rr, rr));
        rings.setMatrixAt(n++, m);
      }
    });
    rings.count = n;
    rings.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update, lots };
}
