// The natural history museum's heavy things, loaded only when one comes near and let go again when one has
// gone far enough (the plaza, the buildings, the galleries' walls and plinths, and the cosmos's stations drawn in
// light, are part of the city: city.js museum()): the fossils on the stations round the ring gallery.
// The scans are from ../earth_history (Smithsonian CC0 and Sketchfab CC BY 4.0, see CREDITS.md); drawn here in
// the city's own flat tones, the colour of bone.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { propsMaterial } from './toon.js';
import { LAYER } from './city.js';

// How each scan is set straight before it is placed (rotations in its own frame, as in earth_history's
// exhibits/scan.js): the Stegosaurus's lean taken out (here, with its sides level as it stands on its platform).
const ORIENT = { stegosaurus: [0.061, 0, 0] };

// and a turn more about the vertical, where a scan's length lies askew in its own frame (the Stegosaurus's along its
// platform, its head toward the top of the ramp)
const TURN = { stegosaurus: -0.732 + Math.PI, mammoth: Math.PI };   // (the mammoth's head, too, toward the top of the ramp)

// how far down into its plinth (a share of its height): a mount's tail hangs lower than its feet
const SINK = { stegosaurus: 0.03 };

// load within near metres of the rotunda's centre, let go beyond far
const LOTS = { walk: { near: 110, far: 160 } };

function loader() {
  // (the scans are Draco-compressed: the decoder comes from the CDN, only when wanted)
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  return { gltf: new GLTFLoader().setDRACOLoader(draco), draco };
}

const bone = new THREE.Color('#e9dfc8').toArray();
let boneMaterial = null;
// A scan made over into the city's tones, its longest side size, its middle over (x, z), its lowest point at y
// (or, hung, its highest), turned by yaw.
function place(root, { x, y, z, size, yaw = 0, hang = false, orient = null, sink = 0 }) {
  boneMaterial ||= propsMaterial();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = g.attributes.position.count;
    g.setAttribute('aAlbedo', new THREE.BufferAttribute(new Float32Array(n).fill(0.88), 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => bone[i % 3]), 3));
    for (const m of [o.material].flat()) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) m[k]?.dispose();
      m.dispose();
    }
    o.material = boneMaterial;
    o.layers.set(LAYER.SOLID);
  });
  if (orient) root.rotation.set(...orient);
  const outer = new THREE.Group();
  outer.add(root);
  outer.rotation.y = yaw;
  outer.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(outer, true);
  const ext = box.getSize(new THREE.Vector3());
  outer.scale.setScalar(size / Math.max(ext.x, ext.y, ext.z));
  outer.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(outer, true);
  const h = box.max.y - box.min.y;
  outer.position.set(x - (box.min.x + box.max.x) / 2, hang ? y - box.max.y : y - box.min.y - sink * h, z - (box.min.z + box.max.z) / 2);
  return outer;
}

function release(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (o.material !== boneMaterial) { o.material.map?.dispose(); o.material.dispose(); }
  });
  obj.removeFromParent();
}

// spot: from city.js museum(): { centre: { x, z }, stations: [...] }
export function createMuseum(scene, spot) {
  const lots = {};
  for (const name of Object.keys(LOTS)) lots[name] = { state: 'away', gen: 0, group: null };

  async function loadWalk() {
    const L = loader();
    const g = new THREE.Group();
    await Promise.all(spot.stations.map(async (st) => {
      if (!st.model) return;
      const gltf = await L.gltf.loadAsync(`assets/museum/${st.model}.glb`);
      // (the scans lie along their own z: a quarter turn puts them along the ring; the slab on the wall stays facing out)
      g.add(place(gltf.scene, { x: st.x, y: st.y, z: st.z, size: st.size, yaw: st.yaw + (st.wall ? 0 : Math.PI / 2) + (TURN[st.model] || 0), hang: !!st.hang, orient: ORIENT[st.model], sink: SINK[st.model] || 0 }));
    }));
    L.draco.dispose();
    return g;
  }

  async function load(name) {
    const lot = lots[name];
    lot.state = 'loading';
    const mine = ++lot.gen;
    try {
      const group = await loadWalk();
      if (lot.state !== 'loading' || mine !== lot.gen) { release(group); return; }   // gone again before it came
      scene.add(group);
      lot.group = group;
      lot.state = 'here';
    } catch (e) {
      console.warn(`museum: the ${name} did not load`, e);
      lot.state = 'failed';
    }
  }

  return {
    lots,
    update(viewer) {
      if (!spot) return;
      for (const [name, { near, far }] of Object.entries(LOTS)) {
        const d = Math.hypot(viewer.x - spot.centre.x, viewer.z - spot.centre.z), lot = lots[name];
        if (d < near && lot.state === 'away') load(name);
        else if (d > far && (lot.state === 'here' || lot.state === 'loading')) {
          if (lot.group) release(lot.group);
          lot.group = null;
          lot.state = 'away';
        }
      }
    },
  };
}
