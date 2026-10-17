// Flying traffic high over the street: dark craft in lanes at several heights, white lights ahead, cyan
// behind, streaming by both ways. They keep to a stretch of street around the viewer, wrapping round.

import * as THREE from 'three';
import { glowMaterial, propsMaterial, TINT, PALETTES, pickOf } from './toon.js';
import { LAYER } from './city.js';
import { makeRandom } from './rand.js';

const SPAN = { back: 160, ahead: 700 };

export function buildTraffic() {
  const R = makeRandom(3);
  const lanes = [];
  for (const y of [34, 47, 61, 78, 98, 122]) {
    for (const dir of [-1, 1]) lanes.push({ y: y + R.range(-2, 2), x: dir * R.range(2.5, 5.5), dir, speed: R.range(22, 42) });
  }
  const cars = [];
  for (const lane of lanes) {
    const n = R.int(2, 5);
    for (let i = 0; i < n; i++) cars.push({ lane, off: R.next() * (SPAN.back + SPAN.ahead), speed: lane.speed * R.range(0.9, 1.1), bob: R.next() * 6 });
  }

  const body = new THREE.BoxGeometry(2.2, 0.9, 5.2);
  body.setAttribute('aAlbedo', new THREE.Float32BufferAttribute(new Float32Array(body.attributes.position.count).fill(0.5), 1));
  // in the colour mode each its own paint
  body.setAttribute('aTint', new THREE.Float32BufferAttribute(new Float32Array(body.attributes.position.count * 3).fill(-1), 3));
  body.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(cars.flatMap((_, i) => pickOf(PALETTES.car, i))), 3));
  // the lights: a bar across the front (white) and the back (cyan), in the car's frame (front toward -z)
  const lights = new THREE.BoxGeometry(2.0, 0.18, 0.1);
  const front = lights.clone().translate(0, 0, -2.62), backBar = lights.clone().translate(0, 0, 2.62);
  const paint = (g, rgb) => {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => rgb[i % 3]), 3));
    g.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    return g;
  };
  paint(front, [3, 3.3, 3.3]);
  paint(backBar, [0.3, 2.0, 2.4]);

  const mk = (geom, mat, layer) => {
    const m = new THREE.InstancedMesh(geom, mat, cars.length);
    m.frustumCulled = false;
    m.layers.set(layer);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  const bodies = mk(body, propsMaterial(), LAYER.GLOW);
  const fronts = mk(front, glowMaterial(), LAYER.GLOW);
  const backs = mk(backBar, glowMaterial({ fixed: 1 }), LAYER.GLOW);   // in colour: red-coral tail lights
  const group = new THREE.Group();
  group.add(bodies, fronts, backs);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const still = new THREE.Quaternion(), turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const len = SPAN.back + SPAN.ahead;

  return {
    group,
    update(t, viewerZ) {
      cars.forEach((c, i) => {
        const { lane } = c;
        // how far along the stretch (from viewerZ + back to viewerZ - ahead), wrapping round
        const u = (c.off + t * c.speed) % len;
        const z = lane.dir < 0 ? viewerZ + SPAN.back - u : viewerZ - SPAN.ahead + u;
        pos.set(lane.x, lane.y + Math.sin(t * 0.7 + c.bob) * 0.4, z);
        q.copy(lane.dir > 0 ? turn : still);
        m4.compose(pos, q, one);
        bodies.setMatrixAt(i, m4);
        fronts.setMatrixAt(i, m4);
        backs.setMatrixAt(i, m4);
      });
      for (const m of [bodies, fronts, backs]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
