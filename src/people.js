// People: walking along the pavements both ways under umbrellas whose rims glow, and standing or sitting
// about in the plazas, under the covered squares without. The walkers keep to a stretch of street round
// the viewer, wrapping round at its ends, so the street always has its passers-by.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propsMaterial, glowMaterial, TINT, PALETTES, pickOf } from './toon.js';
import { LAYER, CURB } from './city.js';
import { makeRandom } from './rand.js';
import { canopyGeometry, rimGeometry as rimTube } from './umbrella.js';

const SPAN = { back: 70, ahead: 230 };
const WALKERS = 120;

// albedo, and the colour in the colour mode (TINT.OWN: the person's own, a coat or an umbrella of their own)
const tagged = (g, a, t = TINT.white) => {
  const n = g.attributes.position.count;
  g.setAttribute('aAlbedo', new THREE.Float32BufferAttribute(new Float32Array(n).fill(a), 1));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => t[i % 3]), 3));
  return g;
};

function bodyGeometry() {
  const parts = [
    tagged(new THREE.BoxGeometry(0.13, 0.82, 0.16).translate(-0.09, 0.41, 0), 0.35, TINT.denim),            // legs
    tagged(new THREE.BoxGeometry(0.13, 0.82, 0.16).translate(0.09, 0.41, 0), 0.35, TINT.denim),
    tagged(new THREE.CylinderGeometry(0.17, 0.23, 0.72, 10).translate(0, 1.1, 0), 0.55, TINT.OWN),         // coat
    tagged(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6).translate(0, 1.5, 0), 0.6, TINT.skin),           // neck
    tagged(new THREE.SphereGeometry(0.115, 12, 8).translate(0, 1.62, 0), 0.7, TINT.skin),                  // head
  ];
  return mergeGeometries(parts);
}
function umbrellaGeometry() {
  return mergeGeometries([
    tagged(canopyGeometry(0.6, 0.32).translate(0.05, 1.95, -0.05), 0.8, TINT.OWN),                    // (its ribs curved: umbrella.js)
    tagged(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4).translate(0.12, 1.65, -0.08), 0.5),
  ]);
}
// each one's own colour, from a palette (the same every time)
const ownColours = (n, list, salt) => new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: n }, (_, i) => pickOf(list, i + salt)).flat()), 3);
function rimGeometry() {
  const g = rimTube(0.6, 0.32, 0.014).translate(0.05, 1.95, -0.05);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}

// walkers: how many walk the pavements; layer: where they are drawn (the metro station's people have its own)
export function buildPeople(statics, { walkers: nWalk = WALKERS, layer = LAYER.GLOW } = {}) {
  const R = makeRandom(41);
  const walkers = Array.from({ length: nWalk }, () => {
    const s = R.chance(0.5) ? -1 : 1;
    return {
      x: s * R.range(9.3, 12.2), dir: R.chance(0.5) ? -1 : 1, speed: R.range(0.95, 1.55),
      off: R.next() * (SPAN.back + SPAN.ahead), phase: R.next() * 10,
    };
  });
  const withUmbrella = statics.filter((p) => p.umbrella);
  const nBodies = nWalk + statics.length, nUmb = Math.max(1, nWalk + withUmbrella.length);

  const mk = (geom, mat, n) => {
    const m = new THREE.InstancedMesh(geom, mat, n);
    m.frustumCulled = false;
    m.layers.set(layer);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  const bodies = mk(bodyGeometry(), propsMaterial(), nBodies);
  const umbrellas = mk(umbrellaGeometry(), propsMaterial(), nUmb);
  const rims = mk(rimGeometry(), glowMaterial({ fixed: -2 }), nUmb);   // in colour: rims of every colour
  const bodyTint = ownColours(nBodies, PALETTES.cloth, 3), umbTint = ownColours(nUmb, PALETTES.umbrella, 7);
  bodies.geometry.setAttribute('iTint', bodyTint);
  umbrellas.geometry.setAttribute('iTint', umbTint);
  umbrellas.count = rims.count = nWalk + withUmbrella.length;   // none at all, indoors
  // the umbrellas' rims: mostly cyan, some white, a few dim
  const col = new THREE.Color(), rimCols = [];
  for (let i = 0; i < nUmb; i++) {
    const r = R.next();
    rimCols.push(r < 0.55 ? [0.35, 1.5, 1.7] : r < 0.85 ? [1.5, 1.7, 1.7] : [0.3, 0.6, 0.7]);
    rims.setColorAt(i, col.fromArray(rimCols[i]));
  }
  const group = new THREE.Group();
  group.add(bodies, umbrellas, rims);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  // those standing about are placed once (for all of them; see near below)
  const place = () => {
    statics.forEach((p, i) => {
      m4.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), one);
      bodies.setMatrixAt(nWalk + i, m4);
    });
    withUmbrella.forEach((p, i) => {
      m4.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), one);
      umbrellas.setMatrixAt(nWalk + i, m4);
      rims.setMatrixAt(nWalk + i, m4);
    });
  };
  place();
  // (out on the street, only those within NEAR of the viewer drawn, each with its own colours: they are too small
  // to see further off; again as the viewer goes on every 10 m)
  const NEAR = 260, B0 = bodyTint.array.slice(), U0 = umbTint.array.slice();
  let nearAt = null;
  const near = (viewerZ) => {
    if (nearAt !== null && Math.abs(viewerZ - nearAt) < 10) return;
    nearAt = viewerZ;
    let nb = nWalk, nu = nWalk;
    statics.forEach((p, i) => {
      if (Math.abs(p.z - viewerZ) > NEAR) return;
      m4.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), one);
      bodies.setMatrixAt(nb, m4);
      bodyTint.array.set(B0.subarray((nWalk + i) * 3, (nWalk + i) * 3 + 3), nb * 3);
      nb++;
      if (!p.umbrella) return;
      const k = nWalk + withUmbrella.indexOf(p);
      umbrellas.setMatrixAt(nu, m4);
      rims.setMatrixAt(nu, m4);
      umbTint.array.set(U0.subarray(k * 3, k * 3 + 3), nu * 3);
      rims.setColorAt(nu, col.fromArray(rimCols[k]));
      nu++;
    });
    bodies.count = nb;
    umbrellas.count = rims.count = nu;
    bodyTint.needsUpdate = umbTint.needsUpdate = true;
    rims.instanceColor.needsUpdate = true;
  };

  const len = SPAN.back + SPAN.ahead;
  return {
    group,
    update(t, viewerZ) {
      near(viewerZ);
      walkers.forEach((w, i) => {
        const u = (w.off + t * w.speed) % len;
        const z = w.dir < 0 ? viewerZ + SPAN.back - u : viewerZ - SPAN.ahead + u;
        const step = t * w.speed * 1.6 + w.phase;
        pos.set(w.x, CURB + Math.abs(Math.sin(step * Math.PI)) * 0.035, z);
        q.setFromAxisAngle(up, (w.dir < 0 ? 0 : Math.PI) + Math.sin(step * Math.PI) * 0.03);
        m4.compose(pos, q, one);
        bodies.setMatrixAt(i, m4);
        umbrellas.setMatrixAt(i, m4);
        rims.setMatrixAt(i, m4);
      });
      for (const m of [bodies, umbrellas, rims]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
