// The street: a long, straight paved promenade running toward -z, crossed by three side streets, lined
// with glass towers that vanish into the low clouds. The towers stand at different depths from the street:
// some on the street line, some behind a forecourt or a whole plaza, some on a podium with a garden on its
// roof, some reaching out over a covered square on columns. In front of and between them: trees, benches,
// pools, glass kiosks, sculptures, lawns, people. Laid out from a fixed seed, the same city every time.
// Everything static is merged into a handful of meshes (one per material). Alongside the meshes this returns
// what lights the street (lamps, screens, lobbies), what one bumps into, what is worth looking at, and where
// the trees and the people who stand about are.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRandom } from './rand.js';
import { Goods } from './goods.js';
import { canopyGeometry, rimGeometry } from './umbrella.js';
import { BRANDS, METRO, OTHER_CASES } from './ads/brands.js';
import { makeInfoBoard } from './infoBoard.js';
import { glassMaterial, propsMaterial, glowMaterial, beamMaterial, groundMaterial, shared, TINT } from './toon.js';
import { screenMaterial, PROG, VFX } from './screens.js';
import { adOf, adUniforms, BRAND_ADS, N_AD, AD, ADS } from './ads/catalog.js';
import { SCENES, AIR, SPRING_GOODS } from './ads/scenes.js';
import { VERTICAL, HORIZONTAL, SINGLE, STAR_RING, S2 } from './atlas.js';

export const ROAD = 7;          // half width of the promenade between the pavements
export const FACADE = 13;       // the street line: nothing is built nearer the middle than this
export const CURB = 0.15;       // pavement height
export const CROSSINGS = [-150, -420, -720];
export const CROSS_HALF = 11;   // half width of a side street
export const WALK = { zMin: -1000, zMax: 240 };
const GEN = { zMin: -1400, zMax: 520 };
const LAMP_HEAD_Y = 8.4;
const LOBBY = 5.2;
// Spots redesigned by hand, found by side and a z inside the plot: before the tower with the mascot's tall
// screen just ahead of the start, a raised terrace with a stair up to a deck at the second floor (terrace());
// next to it, a tower on a low plinth (plinth()); across the street from the station, a podium whose ground
// floor is a bookshop, with flower beds and a rain shelter on the pavement before it (books()). Their heights:
const SITES = [{ s: -1, z: 10, kind: 'terrace' }, { s: -1, z: -36, kind: 'plinth' }, { s: 1, z: -10, kind: 'books' }];
const TERRACE = 1.35, PLINTH = 0.75;
// The shops in the towers' ground floors along the first stretch (see streetShops): side, from where to where
// along the tower's street face (z), what it is, its brand, and where its sculpture stands: out at the kerb
// ('curb'), or by the door on its left or right (as one faces the shop).
export const SHOPS = [
  { s: -1, z0: 30.6, z1: 39.2, kind: 'cafe', brand: 'float-cafe', statue: 'left' },
  { s: 1, z0: 13.3, z1: 23.0, kind: 'icecream', brand: 'cloud-gelato', statue: 'curb' },
  { s: 1, z0: 24.6, z1: 34.7, kind: 'tea', brand: 'pearl-moon', statue: 'right' },
  { s: 1, z0: -41.6, z1: -32.0, kind: 'dessert', brand: 'frost-dessert', statue: 'left' },
  { s: 1, z0: -55.0, z1: -45.4, kind: 'bakery', brand: 'dawn-bakery', statue: 'curb' },
  { s: 1, z0: -68.2, z1: -58.6, kind: 'cute', brand: 'meow-store', statue: 'curb' },
  { s: 1, z0: -83.5, z1: -75.0, kind: 'florist', brand: 'firefly-garden', statue: 'right' },
  { s: 1, z0: -93.5, z1: -84.5, kind: 'travel', brand: 'star-ring', statue: null },   // (灯笼面馆's, once; no sculpture)
  { s: 1, z0: -103.5, z1: -94.5, kind: 'diner', brand: 'night-lamp-diner', statue: 'right' },
  { s: -1, z0: -104.4, z1: -94.2, kind: 'books', brand: 'photon-books', statue: 'curb' },
  { s: -1, z0: -121.0, z1: -111.0, kind: 'umbrella', brand: 'glow-umbrella', statue: 'left' },
  { s: -1, z0: -137.8, z1: -127.8, kind: 'tea', brand: 'pearl-moon', statue: 'curb' },
  // (further along, where a blade sign said 咖啡 and 浮岛咖啡's ad looks on from the side street across: its third
  // shop; last, so that the shops before it keep their numbers)
  { s: 1, z0: -755.2, z1: -745.4, kind: 'cafe', brand: 'float-cafe', statue: 'left' },
  // (长夏乐馆, where its hologram is: last, so that the shops before it keep their numbers)
  { s: 1, z0: -181, z1: -171, kind: 'concert', brand: 'rain-concert', statue: null },
];
// is there a shop on side s anywhere from z0 to z1?
export const shopAlong = (s, z0, z1) => SHOPS.some((sh) => sh.s === s && sh.z0 < z1 && sh.z1 > z0);

// layers: 0 casts shadows and is mirrored in the wet street; 2 mirrored only; 3 neither (rain, beams);
// 4 the ground itself
// 5: inside the metro station (seen only from the main camera: not in the shadow map, not in the mirror of the
// wet street, under which the station lies)
export const LAYER = { SOLID: 0, GLOW: 2, AIR: 3, GROUND: 4, INSIDE: 5 };

const nearCrossing = (z, pad = 0) => CROSSINGS.some((c) => Math.abs(z - c) < CROSS_HALF + pad);

// ---------------------------------------------------------------- geometry helpers

// A geometry with constant per-vertex attributes added (values: name -> number or array).
function tag(geom, values) {
  const n = geom.attributes.position.count;
  for (const [name, v] of Object.entries(values)) {
    const a = Array.isArray(v) ? v : [v];
    const data = new Float32Array(n * a.length);
    for (let i = 0; i < n; i++) data.set(a, i * a.length);
    geom.setAttribute(name, new THREE.BufferAttribute(data, a.length));
  }
  return geom;
}
const box = (x0, x1, y0, y1, z0, z1) =>
  new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
    .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
// a plane w x h centred at (x, y, z), facing along +x (face 'x'), -x ('-x'), +z ('z') or -z ('-z')
function panel(w, h, x, y, z, face) {
  const g = new THREE.PlaneGeometry(w, h);
  if (face === 'x') g.rotateY(Math.PI / 2);
  else if (face === '-x') g.rotateY(-Math.PI / 2);
  else if (face === '-z') g.rotateY(Math.PI);
  return g.translate(x, y, z);
}
const sorted = (p, q) => (p < q ? [p, q] : [q, p]);
// a prism made into a solid prop (white bands, slabs, terraces): props need uvs and an index, not aU
function asProp(g) {
  g.deleteAttribute('aU');
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.setIndex([...Array(g.attributes.position.count).keys()]);
  return g;
}
const xzBox = (x0, x1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });

// The plan of a building, as points round it in the x-z plane: a rectangle, one with rounded or cut
// corners (r), or an ellipse filling the rectangle.
function outline(shape, x0, x1, z0, z1, r = 0) {
  const pts = [];
  if (shape === 'round') {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
    }
  } else if (shape === 'rounded') {
    r = Math.min(r, (x1 - x0) / 2 - 0.2, (z1 - z0) / 2 - 0.2);
    for (const [cx, cz, a0] of [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, 0.5], [x0 + r, z0 + r, 1], [x1 - r, z0 + r, 1.5]]) {
      for (let k = 0; k <= 6; k++) {
        const a = (a0 + k / 12) * Math.PI;
        pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
    }
  } else if (shape === 'chamfer') {
    const c = Math.min(r, (x1 - x0) / 3, (z1 - z0) / 3);
    pts.push([x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]);
  } else {
    pts.push([x0, z0], [x1, z0], [x1, z1], [x0, z1]);
  }
  return pts;
}

// A vertical prism on a plan: flat glass panels round it (aU: the distance along the wall, running the
// way the glass shader expects), a roof, and if asked an underside.
function prism(pts, y0, y1, { bottom = false } = {}) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    area += ax * bz - bx * az;
  }
  if (area > 0) pts = [...pts].reverse(); // so that (-t.z, t.x) points outward
  const pos = [], nrm = [], us = [];
  const vert = (x, y, z, n, u) => { pos.push(x, y, z); nrm.push(...n); us.push(u); };
  let u = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const n = [-(bz - az) / len, 0, (bx - ax) / len];
    vert(ax, y0, az, n, u); vert(bx, y0, bz, n, u + len); vert(bx, y1, bz, n, u + len);
    vert(ax, y0, az, n, u); vert(bx, y1, bz, n, u + len); vert(ax, y1, az, n, u);
    u += len;
  }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const cap = (y, up) => {
    for (let i = 0; i < pts.length; i++) {
      let [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      // counter-clockwise seen from the side the cap faces
      if (((az - cz) * (bx - cx) - (ax - cx) * (bz - cz) > 0) !== up) [ax, az, bx, bz] = [bx, bz, ax, az];
      const n = [0, up ? 1 : -1, 0];
      vert(cx, y, cz, n, 0); vert(ax, y, az, n, 0); vert(bx, y, bz, n, 0);
    }
  };
  cap(y1, true);
  if (bottom) cap(y0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  return g;
}

// A random number for a thing by where it is (the same for things close together, so a shop front's lights
// go together), for the colour mode's accents (see toon.js glowMaterial). Not drawn from the layout's random
// sequences, so it moves nothing.
const centre = new THREE.Vector3();
function keyOf(geom) {
  geom.computeBoundingBox();
  geom.boundingBox.getCenter(centre);
  const h = Math.sin(Math.floor(centre.x / 7) * 127.1 + Math.floor(centre.y / 7) * 311.7 + Math.floor(centre.z / 7) * 74.7) * 43758.5453;
  return 0.001 + (h - Math.floor(h)) * 0.998;
}

class Bin {
  constructor() { this.parts = []; }
  // things that glow (a colour given) get their key; solid things without a colour of their own, none (white)
  add(geom, values) {
    if ('color' in values && !('aKey' in values)) values = { ...values, aKey: keyOf(geom) };
    else if ('aAlbedo' in values && !('aTint' in values)) values = { ...values, aTint: [0, 0, 0] };
    this.parts.push(tag(geom, values));
    return geom;
  }
  mesh(material, layer) {
    // (to merge, its parts must be all indexed or all not: where they are mixed, those without are indexed)
    if (this.parts.some((g) => g.index) && this.parts.some((g) => !g.index)) this.parts = this.parts.map((g) => (g.index ? g : mergeVertices(g)));
    const geom = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    const m = new THREE.Mesh(geom, material);
    m.frustumCulled = false;
    m.layers.set(layer);
    m.matrixAutoUpdate = false;
    return m;
  }
  // the same, in lots chunk long along the street (z, by each part's middle), each its own mesh, culled when out of
  // view (its centre: userData.z)
  meshes(material, layer, chunk) {
    if (this.parts.some((g) => g.index) && this.parts.some((g) => !g.index)) this.parts = this.parts.map((g) => (g.index ? g : mergeVertices(g)));
    const lots = new Map();
    for (const g of this.parts) {
      g.computeBoundingBox();
      const k = Math.floor((g.boundingBox.min.z + g.boundingBox.max.z) / 2 / chunk);
      if (!lots.has(k)) lots.set(k, []);
      lots.get(k).push(g);
    }
    const out = [...lots].map(([k, parts]) => {
      const m = new THREE.Mesh(mergeGeometries(parts, false), material);
      m.geometry.computeBoundingSphere();
      m.layers.set(layer);
      m.matrixAutoUpdate = false;
      m.userData.z = (k + 0.5) * chunk;
      return m;
    });
    this.parts.forEach((g) => g.dispose());
    return out;
  }
}

// ---------------------------------------------------------------- the city

// caseFonts: the CSS font families of words that may be set in another font ({ round: 白云乡's and 流波月's names, a
// round hand (站酷快乐体), on their shops' signs and 白云乡's case })
// statues: models for the shops' sculptures ({ cat: 喵星杂货's, a geometry }), where one has been made
export function buildCity({ atlas, reflection, cases = true, icons = null, caseFonts = {}, statues = {} }) {
  caseFonts = { round: '"ZCOOL KuaiLe", "PingFang SC", sans-serif', ...caseFonts };
  const refonts = {};   // the labels drawn in each of those fonts, to be drawn again when it changes (setCaseFont)
  const R = makeRandom(20261011);
  const ads = adUniforms(atlas);   // the catalog's tables for the screens' shader
  // a second sequence for later choices and the hand-made spots, so that adding them moves nothing else
  const R2 = makeRandom(4242);
  // and one of their own for the hand-made spots, so that changing them changes nothing elsewhere
  const RS = makeRandom(515);
  // and one for which towers get a contemporary upper part (see modernTop)
  const RM = makeRandom(808);
  // and one for the backs of the alleys
  const RP = makeRandom(616);
  // and one for the side streets
  const RX = makeRandom(717);
  const RA = makeRandom(718);    // (more brands' cases on the side streets' towers, see there)
  // and one for the goods in the shops
  const RG = makeRandom(929);
  // and one for the bookshop across from the station and the pavement before it
  const RB = makeRandom(1313);
  const CANAL = 56;                // where the side streets end for walkers: |x| of a canal across them
  const sideWalks = [];
  const bins = { glass: new Bin(), props: new Bin(), glow: new Bin(), drift: new Bin(), orbit: new Bin(), slide: new Bin(), spin: new Bin(), tide: new Bin(), pop: new Bin(), screens: new Bin(), beams: new Bin(), pools: [] };
  const caseIn = new Bin();     // what is in the brands' cases (brandCase), lit as goods in a shop window
  const caseLabels = [];        // and the names held in some of them (nameplate)
  const infoBoards = [];        // the shelters' boards inside (the time, the weather, the next train): planes
  const inside = { props: new Bin(), glow: new Bin(), screens: new Bin() };   // the metro station
  const goods = new Goods();   // what the shops sell, drawn as instances (see goods.js)
  // the bookshop's inside, drawn like the station's (lit as a room, only from near enough), and its books;
  // the flowers in the beds out on the street
  const bookIn = { props: new Bin(), goods: new Goods() };
  const streetGoods = new Goods();
  let bookAt = null;
  // automatic sliding doors: each { x, z, leaves: [{ mesh, z, dir }], collider, open } (main.js opens them)
  const doors = [];
  const doorGroup = new THREE.Group();
  const doorSolid = propsMaterial(), doorGlow = glowMaterial();
  const holoSigns = [];  // floating holographic signs asked for here: { x, y, z, text, set?, rotY?, inside?, size? }
  const insidePeople = []; // the people in the metro station (drawn on its own layer)
  let station = null;
  const lamps = [];      // { x, y, z }
  const emitters = [];   // screens and lobbies as lights: { x, y, z, nx, ny, nz, power, reach, tint }
  const colliders = [];  // circles { x, z, r } and boxes { x0, x1, z0, z1 }
  const sights = [];     // big screens worth a look: { x, y, z, r }
  const trees = [];      // { x, y, z, h, r, lights }
  const people = [];     // people standing about: { x, y, z, rot, umbrella }
  const plots = [];      // the street-front towers, for the bridges: { s, zB, zA, front, top }
  const cats = [];       // the mascot's ad screens: { x, y, z, nx, nz, w, h }
  const bridges = [];    // { z0, z1, y0, y1 }
  const concertBeat = { value: 0 }; // how loud 长夏乐馆's music is just now, as heard (main.js): its live signs swell with it
  const sunken = [];     // the floors of sunken plazas, wet like the street (the ground's kind 3)
  const floors = [];     // raised ground one can walk up onto: { x0, x1, z0, z1, at(x, z) -> height }
  const raised = [];     // the tops of terraces and plinths, paved and wet like the pavement
  const covers = [];     // roofs over open ground the rain doesn't reach under: { x0, x1, z0, z1, y } (y: underside)
  const lifts = [];      // ground raised above the pavement, for the rain's splashes: { x0, x1, z0, z1, y }
  const faces = [];      // the great screens on towers' street faces: { s, z, y, w, h }
  const moderns = [];    // the towers with a contemporary upper part: { kind, x, z, y0, h }

  // base: where the building's ground floor starts (its lobby is the first 5.2 m above it)
  // bright: [how much brighter its rooms are, up to what height above its base] (every room there lit)
  // The newer facades (toon.js: 5 staggered panels, 6 waving fins, 7 ribbons in waves), or a diagrid, chosen by
  // seed: no grid of windows. Every building behind the start (z beyond BEHIND, seen looking back down the
  // street), and about a third of the towers ahead (newerFace; not the hand-made spots). Only the look
  // changes: nothing is drawn from the layout's sequences.
  const BEHIND = 40, NEWER = [5, 6, 7, 4, 7, 5, 6];
  const newerFace = (zc, seed) => zc > BEHIND || (seed * 7919) % 1 < 0.33;
  const behind = (geom) => { geom.computeBoundingBox(); return (geom.boundingBox.min.z + geom.boundingBox.max.z) / 2 > BEHIND; };
  // newer: whether it takes a newer facade (left out: if it stands behind the start)
  const glass = (geom, win, seed, base = 0, bright = [1, 0], newer = null) => bins.glass.add(geom, {
    aWin: newer ?? behind(geom) ? [win[0], win[1], Math.max(win[2], 0.45), NEWER[Math.floor(seed * 997) % NEWER.length]] : win,
    aSeed: seed, aBase: base, aBright: bright,
  });
  // tint: its colour in the colour mode (toon.js TINT); none: white
  const props = (geom, albedo, tint) => bins.props.add(geom, tint ? { aAlbedo: albedo, aTint: tint } : { aAlbedo: albedo });
  const glow = (geom, rgb, blink = 0) => bins.glow.add(geom, { color: rgb, aBlink: blink });
  // a light that keeps its own colour in the colour mode too (the museum's cases and dioramas); within a brand's
  // case its key says which brand's (-2 - its place in BRANDS), so that that brand's colours can be turned
  // (toon.js glowMaterial, uCaseAdj)
  let caseOf = -1;
  const ownKey = () => (caseOf >= 0 ? -2 - caseOf : -1);
  const shown = (geom, rgb) => bins.glow.add(geom, { color: rgb, aBlink: 0, aKey: ownKey() });
  // and one that drifts as in water, about its middle (toon.js glowMaterial, drift)
  const drifting = (geom, rgb, [x, y, z], phase) => bins.drift.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aDrift: [x, y, z, phase] });
  // one that goes round an upright axis at (x, z), speed radians a second, from angle phase
  const orbiting = (geom, rgb, [x, z], speed, phase = 0) => bins.orbit.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aOrbit: [x, z, speed, phase] });
  // one carried along a strip (see toon.js glowMaterial, slide): start and way [x, z, dx, dz], [L, its middle, step, turn]
  const sliding = (geom, rgb, way, along) => bins.slide.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aSlide: way, aSlide2: along });
  // one turning about an axis through a point, seen only within a case (toon.js glowMaterial, spin)
  const spinning = (geom, rgb, spin, axis, clip, clip2) => bins.spin.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aSpin: spin, aAxis: axis, aClip: clip, aClip2: clip2 });
  // one carried by the tide, or lit by it (toon.js glowMaterial, tide): tide [light 0/1, its mark, how far, lag]
  const tidal = (geom, rgb, tide, clip, clip2) => bins.tide.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aTide: tide, aClip: clip, aClip2: clip2 });
  // one that hops, pops, drops in or bobs (toon.js glowMaterial, pop): pop [its pivot, when], pop2 [kind, round, amp, top]
  const popping = (geom, rgb, pop, pop2) => bins.pop.add(geom, { color: rgb, aBlink: 0, aKey: ownKey(), aPop: pop, aPop2: pop2 });
  // a screen showing the plain ad of a template (prog), or (screenAd) a given entry of the catalog
  // (灯笼面馆 is gone: wherever its ad was drawn, another brand's, picked at random (its own numbers, so that the rest
  // draw as they did), not 星环旅行's, whose shop is where its was and whose ads are many already. And 希洛地铁's ads
  // likewise, by numbers of their own (its mark on its pylon before the station stays: drawn as it was); and
  // 深蓝泳池's and 银河通讯's, by numbers of theirs)
  const RGONE = makeRandom(7130), OTHERS = BRAND_ADS.filter((i) => i !== AD['brand-lantern-noodles'] && i !== AD['brand-star-ring']);
  const RMETRO = makeRandom(7140), NOT_METRO = OTHERS.filter((i) => i !== AD['brand-neo-metro']);
  const GONE = [AD['brand-deep-blue'], AD['brand-galaxy-link']], RGONE2 = makeRandom(7150), LEFT = NOT_METRO.filter((i) => !GONE.includes(i));
  const alive = (ad) => {
    if (ad === AD['brand-lantern-noodles']) ad = RGONE.pick(OTHERS);
    if (ad === AD['brand-neo-metro']) ad = RMETRO.pick(NOT_METRO);
    return GONE.includes(ad) ? RGONE2.pick(LEFT) : ad;
  };
  const screenAd = (geom, ad, w, h, seed, rect = new THREE.Vector4()) =>
    bins.screens.add(geom, { aScr: [alive(ad), seed, w, h], aRect: [rect.x, rect.y, rect.z, rect.w] });
  // (a screen of words that would say 咖啡 CAFÉ: 浮岛咖啡's own instead (cafeSign: its name, or a scrolling one its
  // cups going by); its number drawn all the same)
  // (and a scrolling strip that would say 去星环 · STAR RING: 星环旅行's own, its view of space going by: starTicker)
  const screen = (geom, prog, w, h, rect = new THREE.Vector4(), seed = R.next()) => ((prog === PROG.TEXT || prog === PROG.TICKER) && rect === atlas.rects.h[4]
    ? caseLabels.push(cafeSign(geom, w, h, prog === PROG.TICKER ? 'row' : 'name', props))
    : prog === PROG.TICKER && rect === atlas.rects.h[11] ? caseLabels.push(starTicker(geom, w, h, seed))
    : screenAd(geom, adOf(prog), w, h, seed, rect));
  // a brand's ad w x h centred at (x, y, z) facing face: a shallow case with its product in it (brandCase), or
  // (cases off, or not a brand) a screen
  const adPanel = (w, h, x, y, z, face, ad0, seed, scene = null, ad = alive(ad0)) => (cases && ADS[ad]?.brand && SCENES[scene || ADS[ad].brand]
    ? brandCase(w, h, x, y, z, face, ad, seed, scene) : screenAd(panel(w, h, x, y, z, face), ad, w, h, seed));
  const CYAN = [0.35, 1.5, 1.7], WHITE = [1.7, 1.9, 1.9], SOFT = [0.8, 1.0, 1.0];
  const atlasRect = (kind, i) => atlas.rects[kind][i];
  const rectAspect = (r) => (r.z - r.x) / (r.w - r.y);
  const signWords = VERTICAL.map((_, i) => i).filter((i) => !SINGLE.includes(i));
  const boxCollider = (x0, x1, z0, z1) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
  const newWinRP = () => [RP.range(1.4, 2.1), RP.range(3.6, 4.2), RP.range(0.18, 0.5), RP.pick([0, 0, 2, 3])];
  const newWin = () => [R.range(1.4, 2.1), R.range(3.6, 4.2), R.range(0.18, 0.5), R.pick([0, 0, 1, 2, 3])];

  // ---------------------------------------------------------------- street furniture

  // the height of the ground the furniture below stands on: the pavement, or a raised plinth or terrace
  let G = CURB;
  // (about a third of them wrapped in rings of light: chosen with their own numbers, so nothing else moves)
  const RTB = makeRandom(6100);
  const tree = (x, y, z, big = 1, rng = R, bands = false) => {
    bands = RTB.chance(0.32) || bands;
    trees.push({ x, y, z, h: rng.range(5, 7.5) * big, r: rng.range(1.5, 2.2) * big, lights: rng.chance(0.45), bands });
    colliders.push({ x, z, r: 0.35 });
  };
  const planterTree = (x, z, rng = R) => {
    props(new THREE.CylinderGeometry(1.15, 1.2, 0.5, 20).translate(x, G + 0.25, z), 0.88);
    tree(x, G + 0.5, z, 0.9, rng);
    colliders.push({ x, z, r: 1.25 });
  };
  // a bench, its seat running along z
  const bench = (x, z, len = 1.9) => {
    props(box(x - 0.24, x + 0.24, G + 0.42, G + 0.5, z - len / 2, z + len / 2), 0.85, TINT.wood);
    for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) props(box(x - 0.2, x + 0.2, G, G + 0.42, z + dz - 0.05, z + dz + 0.05), 0.5);
    boxCollider(x - 0.3, x + 0.3, z - len / 2, z + len / 2);
  };
  const person = (x, z, umbrella = true, y = G, rng = R) => people.push({ x, y, z, rot: rng.range(0, Math.PI * 2), umbrella });

  // Run fn for its random numbers only and keep nothing it makes, so that a spot can be redesigned by hand
  // while everything after it in the city draws the same numbers and stays where it was.
  let mutedNow = false;   // (a case made while muted is not kept in the list of cases either)
  function muted(fn) {
    const lists = [emitters, colliders, sights, trees, people, cats, bins.pools, covers, faces, moderns, caseLabels, infoBoards];
    const all = [bins.glass, bins.props, bins.glow, bins.drift, bins.orbit, bins.slide, bins.spin, bins.tide, bins.pop, bins.screens, bins.beams, caseIn];
    lists.forEach((l) => { l.push = () => l.length; });
    all.forEach((b) => { b.add = (g) => g; });
    mutedNow = true;
    try { return fn(); } finally {
      mutedNow = false;
      lists.forEach((l) => { delete l.push; });
      all.forEach((b) => { delete b.add; });
    }
  }
  // replace: where it is, the street's own level doesn't count (below the street: the metro station)
  const floorAt = (x0, x1, z0, z1, at, replace = false) => floors.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), at, replace });
  // a wall that only stops someone whose feet are between y0 and y1 (the edge of a terrace, a railing)
  const wall = (x0, x1, z0, z1, y0, y1) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 });
  const bollards = (a, z0, z1, s) => {
    for (let z = z0 + 1.5; z < z1 - 1; z += 3.5) glow(box(s * a - 0.07, s * a + 0.07, G, G + 0.8, z - 0.07, z + 0.07), SOFT);
  };

  // Fill a plaza or forecourt: s the side, |x| from a0 to a1, z from z0 to z1; covered: under an overhang.
  // A few things, placed so they don't overlap, by theme.
  function furnish(s, a0, a1, z0, z1, covered) {
    const used = [];
    const place = (w, d) => {  // w across (|x|), d along z
      if (a1 - a0 < w || z1 - z0 < d) return null;
      for (let tries = 0; tries < 24; tries++) {
        const a = R.range(a0 + w / 2, a1 - w / 2), z = R.range(z0 + d / 2, z1 - d / 2);
        if (used.every((u) => Math.abs(u.a - a) > (u.w + w) / 2 || Math.abs(u.z - z) > (u.d + d) / 2)) {
          used.push({ a, z, w, d });
          return { a, z };
        }
      }
      return null;
    };
    const X = (a) => s * a;
    const depth = a1 - a0;
    bollards(a0 - 0.3, z0, z1, s);

    if (depth < 10) {
      // a forecourt: a row of trees in planters, benches between, someone waiting
      for (let z = z0 + 3; z < z1 - 2; z += 8) {
        const a = a0 + Math.min(2, depth / 2);
        used.push({ a, z, w: 2.6, d: 2.6 });
        if (G === PLINTH) muted(() => planterTree(X(a), z));     // (深蓝计算's, on its plinth: none)
        else planterTree(X(a), z);
        if (z + 4 < z1 - 1) bench(X(a), z + 4, 1.8);
      }
      for (let i = R.int(0, 3); i > 0; i--) { const p = place(0.8, 0.8); if (p) person(X(p.a), p.z, !covered); }
      return;
    }

    const themes = R.chance(0.5) ? ['pool', 'grove'] : R.chance(0.5) ? ['kiosk', 'grove', 'sculpture'] : ['lawn', 'sculpture', 'grove'];
    if (covered) themes.unshift('tables');
    for (const theme of themes) {
      if (theme === 'pool') {
        const w = Math.min(depth - 3, R.range(5, 9)), d = Math.min(z1 - z0 - 4, R.range(8, 16));
        const p = w > 3 && d > 4 && place(w + 1, d + 1);
        if (!p) continue;
        const [x0, x1] = sorted(X(p.a - w / 2), X(p.a + w / 2));
        props(box(x0, x1, G, G + 0.32, p.z - d / 2, p.z + d / 2), 0.9);       // the rim
        bins.pools.push(new THREE.PlaneGeometry(x1 - x0 - 0.5, d - 0.5).rotateX(-Math.PI / 2).translate(X(p.a), G + 0.33, p.z));
        boxCollider(x0, x1, p.z - d / 2, p.z + d / 2);
      } else if (theme === 'grove') {
        for (let i = R.int(2, 5); i > 0; i--) {
          const p = place(2.8, 2.8);
          if (!p) break;
          planterTree(X(p.a), p.z);
        }
        for (let i = R.int(1, 3); i > 0; i--) { const p = place(0.9, 2.4); if (p) bench(X(p.a), p.z); }
      } else if (theme === 'kiosk') {
        const p = place(5.5, 6.5);
        if (!p) continue;
        const [kx0, kx1] = sorted(X(p.a - 2), X(p.a + 2));
        glass(prism(outline('rect', kx0, kx1, p.z - 2.5, p.z + 2.5), G, 3.4), [1.2, 3.4, 1, 3], R.next());
        props(box(X(p.a - 2.7), X(p.a + 2.7), 3.4, 3.6, p.z - 3.2, p.z + 3.2), 0.9);
        glow(box(X(p.a - 2.72), X(p.a + 2.72), 3.38, 3.42, p.z - 3.22, p.z + 3.22), SOFT);
        emitters.push({ x: X(p.a - 2.1), y: 1.8, z: p.z, nx: -s, ny: 0, nz: 0, power: 0.6, reach: 10, tint: 0.2 });
        boxCollider(kx0, kx1, p.z - 2.5, p.z + 2.5);
        for (let i = R.int(1, 3); i > 0; i--) person(X(p.a - 3) + R.range(-0.5, 0.5), p.z + R.range(-2.5, 2.5), false);
      } else if (theme === 'sculpture') {
        const p = place(3.6, 3.6);
        if (!p) continue;
        // (before 潮汐能源's office, out toward the street a little)
        const sa = s === -1 && z0 < -80 && z1 > -80 ? Math.max(a0 + 1.8, p.a - 4) : p.a;
        props(box(X(sa) - 0.8, X(sa) + 0.8, G, G + 0.4, p.z - 0.8, p.z + 0.8), 0.75);
        props(new THREE.TorusGeometry(1.5, 0.16, 12, 48).rotateY(R.range(0, Math.PI)).translate(X(sa), G + 2.0, p.z), 0.98);
        colliders.push({ x: X(sa), z: p.z, r: 1.0 });
      } else if (theme === 'lawn') {
        const w = Math.min(depth - 2, R.range(6, 12)), d = Math.min(z1 - z0 - 3, R.range(8, 18));
        const p = w > 3 && d > 4 && place(w, d);
        if (!p) continue;
        props(box(X(p.a - w / 2), X(p.a + w / 2), G, G + 0.22, p.z - d / 2, p.z + d / 2), 0.4, TINT.grass);
        const tops = [], tide = s === -1 && z0 < -80 && z1 > -80;
        // (潮汐能源's: its trees off the line to its door, toward the lawn's corners)
        const corners = [[0.22, 0.34], [0.22, -0.34], [-0.22, 0.34]];
        for (let i = R.int(1, 3), k = 0; i > 0; i--, k++) {
          let tx = X(p.a + R.range(-w / 3, w / 3)), tz = p.z + R.range(-d / 3, d / 3);
          if (tide) { tx = X(p.a + corners[k][0] * w); tz = p.z + corners[k][1] * d; }
          tree(tx, G + 0.22, tz, R.range(0.9, 1.3));
          tops.push([tx, tz]);
        }
        if (tide) lawnLights(s, p.a, p.z, w, d);   // (潮汐能源's: not so dark)
      } else if (theme === 'tables') {
        for (let i = R.int(2, 5); i > 0; i--) {
          const p = place(1.8, 1.8);
          if (!p) break;
          props(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16).translate(X(p.a), G + 0.74, p.z), 0.95);
          props(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6).translate(X(p.a), G + 0.37, p.z), 0.5);
          colliders.push({ x: X(p.a), z: p.z, r: 0.5 });
          if (R.chance(0.7)) person(X(p.a) + R.range(-0.8, 0.8), p.z + 0.75, false);
        }
      }
    }
    for (let i = R.int(1, 4); i > 0; i--) { const p = place(0.8, 0.8); if (p) person(X(p.a), p.z, !covered); }
  }

  // ---------------------------------------------------------------- a tower

  // The glass tower: s the side; its street face at |x| = front, reaching back depth; z from zB to zA;
  // a plan shape; tiers set back as it rises. Returns the first tier: its top, flat front stretch, shape.
  // The kinds of contemporary upper part (see modernTop), and how often: about three tall towers in four
  const MODERN = ['twist', 'stack', 'garden', 'diagrid', 'green', 'stream', 'cantilever', 'green', 'stream', null, null];

  // pilotis: its ground floor left open beneath it (the metro station's hall; see metroStation)
  function tower(s, front, depth, zB, zA, h, shape, win, seed, { minTop = 0, base = 0, bright = [1, 0], classic = false, pilotis = false } = {}) {
    const X = (a) => s * a;
    const newer = !classic && newerFace((zA + zB) / 2, seed);   // a newer facade (see glass()): no balconies or fins of its own
    const tiers = h < 60 ? 1 : R.chance(0.35) ? 1 : R.chance(0.6) ? 2 : 3;
    const r = shape === 'rounded' ? R.range(4, 9) : shape === 'chamfer' ? R.range(3, 7) : 0;
    // Some of the taller towers end in something more contemporary. Above a first tier, their usual upper
    // tiers are drawn for their numbers only; a single tier is finished later (finish), cut above whatever
    // hangs on it (screens, bridges) and topped from there.
    const modern = !classic && h > 70 ? RM.pick(MODERN) : null;
    const replaced = modern && modern !== 'diagrid';
    const later = replaced && tiers === 1;
    let a0 = front, d = depth, z0 = zB, z1 = zA, y = base, info = null, sh = shape;
    for (let t = 0; t < tiers; t++) {
      const top = t === tiers - 1 ? h : Math.max(minTop + 8, y + (h - y) * R.range(0.45, 0.7));
      const [x0, x1] = sorted(X(a0), X(a0 + d));
      const tierWin = modern === 'diagrid' && (t > 0 || tiers === 1) ? [win[0], win[1], win[2], 4] : win;
      const pts = outline(sh, x0, x1, z0, z1, r), ya = y;
      const open = pilotis && t === 0;
      const tier = (to = top) => glass(prism(pts, open ? ya + LOBBY : ya, to, { bottom: open }), tierWin, seed, base, bright, newer);
      if (t > 0 && replaced) muted(() => tier());
      else if (!(t === 0 && later)) tier();
      if (t === 0) {
        if (pilotis) { /* walls of its own */ }
        else if (sh === 'round') colliders.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.min(x1 - x0, z1 - z0) / 2 });
        else boxCollider(x0, x1, z0, z1);
        info = { top, flat: sh === 'round' ? null : [z0 + r + 0.5, z1 - r - 0.5], r, shape: sh, d, z0, z1, out: 0, tier,
          glassOf: { pts, win: tierWin, seed, base, bright, newer } };
      }
      // a line of light along the top edge of the street face
      const crown = () => {
        if (t === tiers - 1 && sh !== 'round' && R.chance(0.4)) {
          glow(box(X(a0 - 0.08), X(a0 + 0.1), top - 0.35, top, z0 + r + 0.3, z1 - r - 0.3), R.chance(0.5) ? CYAN : WHITE);
        }
      };
      if ((t > 0 || later) && replaced) muted(crown);
      else crown();
      y = top;
      a0 += R.range(2, 6);
      z0 += R.range(1.5, 4);
      z1 -= R.range(1.5, 4);
      d -= R.range(3, 8);
      if (R.chance(0.3)) sh = R.pick(['rounded', 'rect', 'chamfer']);
      if (z1 - z0 < 10 || d < 10) break;
    }
    const where = { kind: modern, x: X(front + depth / 2), z: (zA + zB) / 2, y0: info.top, h };
    if (replaced && !later) modernTop(s, modern, front, depth, zB, zA, info.top, h, win, seed);
    if (modern && !later) moderns.push(where);
    // a slender spire with a slow beacon on some of the tallest
    if (h > 180 && R.chance(0.35)) {
      const ax = X(front + depth * 0.5), az = (zA + zB) / 2, ah = R.range(18, 40);
      props(new THREE.CylinderGeometry(0.12, 0.4, ah, 6).translate(ax, h + ah / 2, az), 0.8);
      glow(box(ax - 0.35, ax + 0.35, h + ah, h + ah + 0.7, az - 0.35, az + 0.35), WHITE, R.next() + 0.01);
    }
    // balconies (deep white floor bands) or slender vertical fins on the street face, up to where the
    // first tier ends (for a tower finished later, where it is cut)
    const { flat } = info;
    if (flat && !newer && win[3] === 1) info.out = 1.35; // screens on this face must stand clear of the balconies
    else if (flat && !newer && win[3] === 2) info.out = 0.75;
    const skin = (upTo) => {
      if (newer) return;
      if (flat && win[3] === 1) {
        for (let k = 1, yb = LOBBY + win[1]; yb < upTo - 2 && k < 46; yb += win[1], k++) {
          props(box(X(front - 1.3), X(front + 0.05), yb - 0.18, yb, flat[0], flat[1]), 0.92);
        }
      } else if (flat && win[3] === 2) {
        for (let zf = flat[0]; zf <= flat[1]; zf += win[0] * 2) props(box(X(front - 0.7), X(front), LOBBY, upTo, zf - 0.09, zf + 0.09), 0.88);
      }
    };
    if (!later) skin(info.top);
    else {
      // cut at height cut (or left whole if that leaves too little to top), then topped
      info.finish = (cut) => {
        if (cut > h - 24) { info.tier(h); skin(h); return; }
        info.tier(cut);
        skin(cut);
        modernTop(s, modern, front, depth, zB, zA, cut, h, win, seed);
        moderns.push({ ...where, y0: cut });
      };
    }
    return info;
  }

  // Contemporary upper parts, from a tower's first tier (top y0) up to h, inside its footprint:
  //   twist       blocks of two floors, each turned a little further round the middle, 45–90 degrees in all
  //   stack       a few boxes piled up off-centre, overhanging one another, some turned a quarter
  //   garden      every few floors a tall recessed floor round a bright core, big trees at its edge, plants
  //               hanging over, a line of light
  //   green       homes stepping back every two floors, each step a terrace with planters, shrubs and
  //               greenery hanging over its edge
  //   stream      a flowing tower: an oval plan swelling and drifting floor by floor, a white band at each
  //               floor (after Zaha Hadid)
  //   cantilever  a slim lit neck, then a great block reaching out over the street, a slimmer tower above
  function modernTop(s, kind, front, depth, zB, zA, y0, h, win, seed) {
    const Q = RM, X = (a) => s * a;
    const cx = X(front + depth / 2), cz = (zA + zB) / 2;
    const hx = depth / 2 - 2.5, hz = (zA - zB) / 2 - 2.5;
    if (hx < 5 || hz < 5) return;
    const turned = (pts, th) => pts.map(([x, z]) => [cx + (x - cx) * Math.cos(th) - (z - cz) * Math.sin(th), cz + (x - cx) * Math.sin(th) + (z - cz) * Math.cos(th)]);
    const rectAt = (w, d, ox = 0, oz = 0, r = 0, sh = r ? 'rounded' : 'rect') => outline(sh, cx + ox - w, cx + ox + w, cz + oz - d, cz + oz + d, r);
    const far = front > 80; // the towers behind: no single shrubs, too many to draw for so little
    const shrub = (x, y, z, big) => far && big < 1 ? 0 : trees.push({ x, y, z, h: Q.range(2.2, 3.2) * big, r: Q.range(0.7, 1.0) * big, lights: Q.chance(0.25), bands: false });
    const homes = [win[0], win[1], Math.max(win[2], 0.55), 0];
    if (kind === 'twist') {
      const seg = win[1] * 2, n = Math.max(2, Math.ceil((h - y0) / seg)), total = Q.range(0.8, 1.6) * (Q.chance(0.5) ? 1 : -1);
      const w = Math.min(hx, hz) * 0.95, dd = Math.max(hx, hz) * 0.8, r = Q.chance(0.5) ? 3 : 0;
      for (let k = 0; k < n; k++) {
        const ya = y0 + k * seg, yb = Math.min(h, ya + seg);
        glass(prism(turned(rectAt(w, dd, 0, 0, r), (total * k) / n), ya, yb, { bottom: true }), [win[0], win[1], win[2], 0], seed);
      }
    } else if (kind === 'stack') {
      const n = Q.int(3, 5), hb = (h - y0) / n;
      for (let k = 0; k < n; k++) {
        const quarter = Q.chance(0.35);
        const w = (quarter ? hz : hx) * Q.range(0.7, 1.05), dd = (quarter ? hx : hz) * Q.range(0.7, 1.05);
        const ox = Q.range(-3, 3), oz = Q.range(-5, 5);
        glass(prism(rectAt(w, dd, ox, oz), y0 + k * hb, y0 + (k + 1) * hb, { bottom: true }), [win[0], win[1], win[2], Q.pick([0, 3])], seed);
        glow(box(cx + ox - w, cx + ox + w, y0 + (k + 1) * hb - 0.25, y0 + (k + 1) * hb, cz + oz - dd - 0.05, cz + oz - dd + 0.05), Q.chance(0.5) ? CYAN : SOFT);
      }
    } else if (kind === 'garden') {
      const block = win[1] * Q.int(3, 4), gardenH = win[1] * 2;
      for (let ya = y0; ya < h; ya += block + gardenH) {
        const yb = Math.min(h, ya + block);
        glass(prism(rectAt(hx, hz, 0, 0, 3), ya, yb, { bottom: ya > y0 }), win, seed);
        if (yb + gardenH >= h - 4) break;
        // the garden: a bright glass core, trees at the very edge so their crowns hang out over it, plants
        // trailing down from the slab above, and a line of light along each edge
        glass(prism(rectAt(hx * 0.42, hz * 0.42), yb, yb + gardenH), [win[0], win[1], 1, 3], seed, 0, [1.8, 1e4]);
        const n = Math.max(6, Math.round((hx + hz) / 3));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + Q.range(-0.15, 0.15);
          shrub(cx + Math.cos(a) * hx * 0.86, yb, cz + Math.sin(a) * hz * 0.86, Q.range(1.6, 2.0));
        }
        for (const sz of [-1, 1]) {
          glow(box(cx - hx, cx + hx, yb + 0.02, yb + 0.08, cz + sz * hz - 0.05, cz + sz * hz + 0.05), CYAN);
          for (let x = cx - hx + 1; x < cx + hx - 1; x += Q.range(1.2, 2.4)) {
            const len = Q.range(1.5, 3.5);
            props(box(x - 0.25, x + 0.25, yb + gardenH - len, yb + gardenH, cz + sz * (hz + 0.1) - 0.15, cz + sz * (hz + 0.1) + 0.15), 0.32);
          }
        }
        for (const sx of [-1, 1]) glow(box(cx + sx * hx - 0.05, cx + sx * hx + 0.05, yb + 0.02, yb + 0.08, cz - hz, cz + hz), CYAN);
      }
    } else if (kind === 'green') {
      let w = hx, dd = hz, ox = 0;
      const step = win[1] * 2;
      for (let ya = y0; ya < h - 2 && w > 5 && dd > 5; ya += step) {
        const yb = Math.min(h, ya + step);
        glass(prism(rectAt(w, dd, ox, 0), ya, yb, { bottom: ya > y0 }), homes, seed);
        // the step back: from the street side and both ends, leaving a terrace on top of this one
        const nw = w - Q.range(1.0, 1.5), ndd = dd - Q.range(0.6, 1.2), nox = ox + s * (w - nw);
        if (yb >= h - 2) break;
        const fx = cx + ox - s * w;                                   // this step's street edge
        props(box(fx, fx + s * 0.9, yb, yb + 0.6, cz - dd + 0.3, cz + dd - 0.3), 0.36);   // planter
        for (let z = cz - dd + 1; z < cz + dd - 1; z += Q.range(2.2, 3.4)) shrub(fx + s * 0.45, yb + 0.6, z, Q.range(0.45, 0.6));
        for (let z = cz - dd + 0.6; z < cz + dd - 0.6; z += Q.range(0.8, 1.6)) {
          const len = Q.range(0.8, 2.6);
          props(box(fx - s * 0.12, fx + s * 0.08, yb + 0.5 - len, yb + 0.5, z - 0.2, z + 0.2), 0.3, TINT.leaf);   // greenery hanging over
        }
        glow(box(fx - 0.04, fx + 0.04, yb - 0.08, yb - 0.02, cz - dd, cz + dd), SOFT);
        w = nw; dd = ndd; ox = nox;
      }
    } else if (kind === 'stream') {
      const seg = win[1], n = Math.max(3, Math.ceil((h - y0) / seg));
      const p1 = Q.range(0, 6), p2 = Q.range(0, 6), swell = Q.range(0.08, 0.16), drift = Q.range(1.5, 3.5);
      const w0 = Math.min(hx, hz * 1.4), d0 = hz;
      for (let k = 0; k < n; k++) {
        const ya = y0 + k * seg, yb = Math.min(h, ya + seg), t = k / n;
        const f = 1 + swell * Math.sin(t * Math.PI * 2 + p1), ox = drift * Math.sin(t * Math.PI * 1.3 + p2);
        glass(prism(rectAt(w0 * f, d0 * f, ox, 0, 0, 'round'), ya, yb, { bottom: true }), [win[0] * 1.4, win[1], win[2], 0], seed);
        props(asProp(prism(rectAt(w0 * f + 0.45, d0 * f + 0.45, ox, 0, 0, 'round'), ya - 0.22, ya + 0.1, { bottom: true })), 0.95);
      }
    } else {
      // cantilever: the neck, the great block reaching out toward the street, a slimmer tower above
      const neck = win[1] * 2;
      glass(prism(rectAt(hx * 0.42, hz * 0.42), y0, y0 + neck), [win[0], win[1], 1, 3], seed, 0, [1.8, 1e4]);
      for (const sz of [-1, 1]) glow(box(cx - hx * 0.42, cx + hx * 0.42, y0 + neck - 0.3, y0 + neck - 0.25, cz + sz * hz * 0.42 - 0.04, cz + sz * hz * 0.42 + 0.04), CYAN);
      const reach = Math.min(Q.range(6, 11), front - 9);
      const bh = Math.min(h - y0 - neck, Q.range(16, 28)), yb0 = y0 + neck;
      const [bx0, bx1] = sorted(X(front - reach), X(front + depth - 2));
      glass(prism(outline('rect', bx0, bx1, cz - hz - 1.5, cz + hz + 1.5), yb0, yb0 + bh, { bottom: true }), [win[0], win[1], win[2], 3], seed);
      for (let z = cz - hz; z <= cz + hz; z += 3) glow(box(bx0 + 0.5, bx1 - 0.5, yb0 - 0.06, yb0 - 0.02, z - 0.05, z + 0.05), SOFT);
      if (h - (yb0 + bh) > 10) glass(prism(rectAt(hx * 0.8, hz * 0.8, s * 2), yb0 + bh, h), win, seed);
    }
  }

  // a great screen on a flat street face at |x| = front, from y0 and below top; returns its top (0: none)
  function faceScreen(s, front, zc, w, y0, top, extra = 0) {
    const X = (a) => s * a;
    const landscape = R.chance(0.45);
    let sh, prog;
    if (landscape && R.chance(0.35)) { sh = w / R.range(4.5, 6.5); prog = PROG.TICKER; }
    else if (landscape) { sh = w * R.range(0.45, 0.7); prog = R.pick([PROG.RIBBONS, PROG.VORTEX, PROG.HORIZON, PROG.INTERFERENCE, PROG.CAT, PROG.CAT]); }
    else { sh = w * R.range(1.3, 2.3); prog = R.pick([PROG.BLOBS, PROG.GLYPH, PROG.GLYPH, PROG.TUNNEL, PROG.CELLS, PROG.CAT, PROG.CAT, PROG.RIBBONS]); }
    if (y0 + sh > top - 3) return 0;
    const rect = prog === PROG.GLYPH ? atlasRect('v', R.pick(SINGLE)) : prog === PROG.TICKER ? atlasRect('h', R.int(0, HORIZONTAL.length - 1))
      : prog === PROG.CAT ? atlasRect('h', STAR_RING) : undefined;
    // The mascot's ad stays on about a third of the screens that drew it, at about half the size; the rest show
    // one of the visual programs instead.
    let show = prog, sw = w, shh = sh;
    if (prog === PROG.CAT) {
      if ((s === -1 && Math.abs(zc - 11.4) < 3) || R2.chance(0.35)) { sw = w * 0.55; shh = sh * 0.55; }
      else show = R2.pick(VFX);
    }
    const yc = y0 + sh / 2;
    // (the mascot's tall screen just ahead of the start taken down: the tower's own glass and light show there,
    // and the brands' cases round it keep clear; its random number drawn all the same)
    if (show === PROG.CAT && s === -1 && Math.abs(zc - 11.4) < 3) {
      R.next();
      faces.push({ s, z: zc, y: yc, w: sw, h: shh });
      return y0 + sh;
    }
    props(box(X(front - 0.3), X(front), yc - shh / 2 - 0.4, yc + shh / 2 + 0.4, zc - sw / 2 - 0.4, zc + sw / 2 + 0.4), 0.5);
    // (the great screen one sees looking back from the start: 光合书店's case of 无风之日 instead; its number still drawn)
    // (and on 潮汐能源's office, by the great cat, its own case where the mascot's small screen was)
    const tideOffice = show === PROG.CAT && s === -1 && Math.abs(zc + 80.3) < 2;
    if (s === -1 && zc > 60 && zc < 120 && show === PROG.HORIZON) brandCase(sw, shh, X(front - 0.33), yc, zc, 'x', AD['brand-photon-books'], R.next(), 'wufeng');
    else if (tideOffice) brandCase(sw, shh, X(front - 0.33), yc, zc, 'x', AD['brand-tide-energy'], R.next());
    // (and on 长夏乐馆's tower, its great screen sound itself, in the city's tones, swelling with its music: soundScreen)
    else if (s === 1 && Math.abs(zc + 184.4) < 1) { R.next(); caseLabels.push(soundScreen(sw, shh, X(front - 0.33), yc, zc, '-x')); }
    else screen(panel(sw, shh, X(front - 0.33), yc, zc, s < 0 ? 'x' : '-x'), show, sw, shh, rect);
    if (show === PROG.CAT && !tideOffice && !(s === 1 && Math.abs(zc + 184.4) < 1)) cats.push({ x: X(front - 0.33), y: yc, z: zc, nx: -s, nz: 0, w: sw, h: shh });
    faces.push({ s, z: zc, y: yc, w: sw, h: shh });
    const big = Math.sqrt(sw * shh);
    emitters.push({ x: X(front - 0.5), y: yc, z: zc, nx: -s, ny: 0, nz: 0, power: 1.2, reach: THREE.MathUtils.clamp(big * 2.6, 24, 70), tint: 0.6 });
    sights.push({ x: X(front), y: yc, z: zc, r: big * 2.5 + extra });
    return y0 + sh;
  }

  // a curved screen round part of a circle (centre cx, cz, radius r) from angle th0 over len
  function arcScreen(cx, cz, r, th0, len, y0, sh) {
    const arc = new THREE.CylinderGeometry(r, r, sh, 28, 1, true, th0, len).translate(cx, y0 + sh / 2, cz);
    screen(arc, R.pick([PROG.RINGS, PROG.VORTEX, PROG.BLOBS, PROG.INTERFERENCE, PROG.RIBBONS]), r * len, sh);
    const mid = th0 + len / 2, nx = Math.sin(mid), nz = Math.cos(mid);
    const x = cx + nx * r, z = cz + nz * r;
    emitters.push({ x, y: y0 + sh / 2, z, nx, ny: 0, nz, power: 1.25, reach: 46, tint: 0.65 });
    sights.push({ x, y: y0 + sh / 2, z, r: 60 });
  }

  // the lobby's light, a glass canopy over the way in and maybe a little sign on its edge (an office's: its name
  // on the canopy in white light instead, a hologram of words alone; the numbers for the little sign still drawn)
  // (where on the canopy, from the tower's face in; how large; its colour)
  const OFFICES = [{ s: -1, z: -80, name: '潮汐能源 TIDE ENERGY', b: 2.95, size: 1.15 },
    { s: -1, z: -36, name: '深蓝计算 DEEP BLUE COMPUTING', b: 2.95, size: 1.4, words: [0.75, 1.25, 1.65] }];
  // 千秋影院's way in, as an old Broadway theatre's: over its canopy (w long) its name, a strip of film flowing behind
  // it (cinemaLED's sign); by its doors and past the shelter, a case each, as a cinema's posters: its scenes on film on
  // one, by a projector's beam on the other; and round them all and along the canopy's edge, rows of little round
  // bulbs, warm white, chasing (marquee)
  function cinemaFront(s, front, zc, w) {
    const X = (a) => s * a, face = s < 0 ? 'x' : '-x', ww = Math.min(w * 0.85, 9), hh = 1.5, y0 = 4.62 + 0.4, yc = y0 + hh / 2;
    // (its sign on a dark board, its bulbs round it on the board's margin)
    props(box(X(front - 3.0), X(front - 2.9), y0 - 0.4, y0 + hh + 0.4, zc - ww / 2 - 0.4, zc + ww / 2 + 0.4), 0.3);
    props(box(X(front - 2.9), X(front - 2.75), 4.62, y0 - 0.4, zc - 0.6, zc + 0.6), 0.3);   // (its stand on the canopy)
    caseLabels.push(cinemaLED(ww, hh, X(front - 3.06), yc, zc, face, { mode: 'film', palette: 'moon', kind: 'sign' }));
    marquee(bulbRing(X(front - 3.06), yc, zc, ww + 0.5, hh + 0.5, face, 0.29), 0.07);
    // (along the canopy's edge, under it: from the wall out, across its front, back to the wall)
    const cw = Math.min(w, 12) / 2, under = 4.43, edge = [];
    for (let b = 0.3; b < 2.95; b += 0.3) edge.push([X(front - b), under, zc + cw - 0.06]);
    for (let z = zc + cw - 0.06; z > zc - cw + 0.06; z -= 0.3) edge.push([X(front - 2.97), under, z]);
    for (let b = 2.97; b > 0.3; b -= 0.3) edge.push([X(front - b), under, zc - cw + 0.06]);
    marquee(edge, 0.06);
    for (const [dz, seed, scene] of [[7.6, 0.3141, 'moon-cinema-film'], [-12.2, 0.2718, 'moon-cinema-beam']]) {   // (the beam's between the shelter by the kerb and its tree)
      props(box(X(front - 0.06), X(front), 0.2, 5.0, zc + dz - 1.62, zc + dz + 1.62), 0.3);
      brandCase(2.4, 3.6, X(front - 0.06), 2.6, zc + dz, face, AD['brand-moon-cinema'], seed, scene);
      marquee(bulbRing(X(front - 0.12), 2.6, zc + dz, 2.95, 4.15, face, 0.25), 0.062);
    }
    emitters.push({ x: X(front - 3.5), y: yc, z: zc, nx: -s, ny: 0, nz: 0, power: 0.9, reach: 16, tint: 0.5 });
  }
  // a ring of bulbs gap apart round a rectangle w x h, its middle at (x, y, z), in the plane facing face; in order
  // round it (for their chase)
  function bulbRing(x, y, z, w, h, face, gap) {
    const along = { x: [0, 0, -1], '-x': [0, 0, 1], z: [1, 0, 0], '-z': [-1, 0, 0] }[face], pts = [];
    const at = (u, v) => pts.push([x + along[0] * u, y + v, z + along[2] * u]);
    const side = (u0, v0, u1, v1) => {
      const n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / gap));
      for (let i = 0; i < n; i++) at(u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n);
    };
    side(-w / 2, -h / 2, w / 2, -h / 2); side(w / 2, -h / 2, w / 2, h / 2); side(w / 2, h / 2, -w / 2, h / 2); side(-w / 2, h / 2, -w / 2, -h / 2);
    return pts;
  }
  // little round bulbs (radius r) at pts, warm white whatever the city's colours, chasing as on an old theatre's
  // marquee: one in three lit, running along them (8 s); then all of them blinking, every other one in turn (2 s);
  // then all lit (2 s); the unlit glowing faintly, as filaments cooling
  function marquee(pts, r) {
    const geo = new THREE.SphereGeometry(r, 8, 6);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime },
      vertexShader: /* glsl */ `
        attribute float aIndex; varying float vIndex; varying vec3 vN;
        void main() { vIndex = aIndex; vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying float vIndex; varying vec3 vN;
        void main() {
          float c = mod(uTime, 12.0), on;
          if (c < 8.0) on = mod(vIndex - floor(uTime * 7.0), 3.0) < 0.5 ? 1.0 : 0.0;
          else if (c < 10.0) on = mod(vIndex + floor(uTime * 4.0), 2.0) < 0.5 ? 1.0 : 0.0;
          else on = 1.0;
          float face = 0.55 + 0.45 * pow(max(vN.z, 0.0), 2.0);   // (brightest at its middle, as a round bulb)
          gl_FragColor = vec4(mix(vec3(0.5, 0.34, 0.15), vec3(1.95, 1.6, 0.9), on) * face, 1.0);
        }`,
    });
    const m = new THREE.InstancedMesh(geo, mat, pts.length), M = new THREE.Matrix4();
    pts.forEach((p, i) => m.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2])));
    geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(new Float32Array(pts.map((_, i) => i)), 1));
    m.computeBoundingSphere();
    m.layers.set(LAYER.GLOW);
    caseLabels.push(m);
  }
  function entrance(s, front, zc, span) {
    const X = (a) => s * a, office = OFFICES.find((o) => o.s === s && Math.abs(o.z - zc) < span / 2);
    const named = () => holoSigns.push({ x: X(front - office.b), y: 4.62 + 0.42 * office.size * 1.3, z: zc, set: 'h2', text: S2[office.name], rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2,
      size: office.size, white: true, words: office.words });
    emitters.push({ x: X(front - 0.6), y: 2.6, z: zc, nx: -s, ny: 0, nz: 0, power: 0.7, reach: 12, tint: 0.25 });
    if (span < 10 || !R.chance(0.7)) { if (office) named(); return; }
    const canopy = () => {
      const w = Math.min(span - 2, R.range(7, 12));
      props(box(X(front - 3), X(front), 4.5, 4.62, zc - w / 2, zc + w / 2), 0.95);
      glow(box(X(front - 3.03), X(front - 2.97), 4.48, 4.64, zc - w / 2, zc + w / 2), SOFT);
      if (R.chance(0.55)) {
        const rect = atlasRect('h', R.int(0, HORIZONTAL.length - 1));
        const hh = 0.55, ww = Math.min(w * 0.8, hh * rectAspect(rect) * 0.95);
        if (office) R.next();
        else if (s === -1 && Math.abs(zc + 184.9) < 1) { R.next(); cinemaFront(s, front, zc, w); }   // (千秋影院's: its numbers kept)
        else screen(panel(ww, hh, X(front - 3.06), 4.9, zc, s < 0 ? 'x' : '-x'), PROG.TEXT, ww, hh, rect);
      }
      if (office) named();
    };
    // over shops' fronts (see streetShops) it would hide their signs: drawn for its numbers only
    if (shopAlong(s, zc - 6, zc + 6)) muted(canopy);
    else canopy();
  }

  // ---------------------------------------------------------------- one plot on the street

  function plot(s, zB, zA) {
    const X = (a) => s * a;
    const w = zA - zB;
    const roll = R.next();
    const type = roll < 0.28 ? 'line' : roll < 0.52 ? 'forecourt' : roll < 0.78 ? 'plaza' : 'podium';
    const hr = R.next();
    const h = hr < 0.18 ? R.range(32, 60) : hr < 0.75 ? R.range(60, 170) : R.range(170, 320);
    const win = newWin(), seed = R.next();
    let shape = R.pick(['rect', 'rect', 'rounded', 'rounded', 'chamfer', 'round']);
    if (shape === 'round' && w < 26) shape = 'rounded';
    const depth = R.range(26, 42);

    const site = SITES.find((t) => t.s === s && zB < t.z && t.z < zA)?.kind;
    if (type === 'podium') {
      // a low glass podium on the street line, a garden on its roof, the tower set well back on it
      const pf = FACADE + R.range(0, 1.5), ph = R.range(9, 16);
      const [x0, x1] = sorted(X(pf), X(pf + depth + 12));
      const podWin = [win[0], win[1], R.range(0.5, 0.9), 3], podSeed = R.next();
      if (site === 'books') {       // its ground floor open: the bookshop
        glass(prism(outline('rect', x0, x1, zB, zA), LOBBY, ph, { bottom: true }), podWin, podSeed);
        books(s, pf, zB, zA, pf + depth + 12, (g) => glass(g, podWin, podSeed));
      } else {
        glass(prism(outline('rect', x0, x1, zB, zA), 0, ph), podWin, podSeed);
        boxCollider(x0, x1, zB, zA);
      }
      glow(box(X(pf - 0.05), X(pf + 0.1), ph, ph + 1.0, zB + 0.5, zA - 0.5), [0.25, 0.5, 0.55]); // the roof garden's glass rail
      const tf = pf + R.range(8, 14);
      for (let z = zB + 3; z < zA - 2; z += R.range(5, 8)) tree(X(pf + R.range(2, tf - pf - 2)), ph, z, 0.75);
      entrance(s, pf, (zA + zB) / 2, w);
      if (w > 14 && R.chance(0.6)) faceScreen(s, pf, (zA + zB) / 2, Math.min(w * 0.6, 24), R.range(5.6, 6.5), ph);
      let hung = ph;
      const info = tower(s, tf, depth, zB + R.range(1, 4), zA - R.range(1, 4), Math.max(h, ph + 40), shape === 'round' ? 'rounded' : shape, win, seed, { minTop: ph });
      if (info.flat && info.flat[1] - info.flat[0] > 10 && R.chance(0.6)) {
        const fw = info.flat[1] - info.flat[0];
        hung = Math.max(hung, faceScreen(s, tf - info.out, (info.flat[0] + info.flat[1]) / 2, Math.min(34, fw * R.range(0.6, 0.9)), ph + R.range(4, 20), info.top, 10));
      }
      plots.push({ s, zB, zA, front: tf, top: info.top, back: pf + depth + 12, info, hung, type, site, face: pf });
      return;
    }

    const setback = type === 'line' ? R.range(0, 1.5) : type === 'forecourt' ? R.range(4, 9) : R.range(13, 26);
    const front = FACADE + setback;
    const cantilever = type === 'plaza' && shape !== 'round' && R.chance(0.45);
    const base = site === 'terrace' ? TERRACE : site === 'plinth' ? PLINTH : 0;
    // on the terrace, its lobby and the two floors over it bright, every room lit (they face the deck)
    const bright = site === 'terrace' ? [1.6, LOBBY + win[1] * 2] : [1, 0];
    const info = tower(s, front, depth, zB, zA, h, shape, win, seed, { base, bright, classic: !!site, pilotis: site === 'terrace' });
    let screenTop = LOBBY, arcTop = 0;

    // what stands in front of the tower; on the terrace site, drawn for its numbers only (see terrace())
    const forecourt = () => {
    if (cantilever) {
      // the upper floors reach out over the plaza on slender columns: a covered square beneath
      const yc = R.range(11, 16), hc = win[1] * R.int(2, 5);
      const ca = FACADE + R.range(1.5, 3), cz0 = zB + 2, cz1 = zA - 2;
      const [x0, x1] = sorted(X(ca), X(front + 6));
      glass(prism(outline('rect', x0, x1, cz0, cz1), yc, yc + hc, { bottom: true }), win, seed);
      const bays = Math.max(1, Math.round((cz1 - cz0 - 2) / 9));
      for (let i = 0; i <= bays; i++) {
        const z = cz0 + 1 + (cz1 - cz0 - 2) * (i / bays);
        props(new THREE.CylinderGeometry(0.22, 0.22, yc, 10).translate(X(ca + 0.8), yc / 2, z), 0.9);
        colliders.push({ x: X(ca + 0.8), z, r: 0.3 });
      }
      for (let a = ca + 1.5; a < front - 1; a += 3) glow(box(X(a) - 0.06, X(a) + 0.06, yc - 0.06, yc - 0.01, cz0 + 1, cz1 - 1), SOFT);
      emitters.push({ x: X((ca + front) / 2), y: yc - 0.5, z: (cz0 + cz1) / 2, nx: 0, ny: -1, nz: 0, power: 0.75, reach: 16, tint: 0.2 });
      covers.push({ ...xzBox(X(ca), X(front), cz0, cz1), y: yc });
      screenTop = yc + hc + 2;
      if (R.chance(0.6)) faceScreen(s, ca, (cz0 + cz1) / 2, Math.min(cz1 - cz0 - 4, R.range(14, 26)), yc + 0.6, yc + hc + 0.4);
    }
    G = site === 'plinth' ? PLINTH : CURB;
    entrance(s, front, (zA + zB) / 2, w);
    if (type !== 'line') furnish(s, FACADE + 0.6, front - 1.5, zB + 1, zA - 1, cantilever);
    G = CURB;
    };
    if (site === 'terrace') muted(forecourt);
    else forecourt();

    // screens: flat ones on the street face, or curved round a rounded corner or a round tower
    if (info.flat && info.flat[1] - info.flat[0] > 10) {
      const fw = info.flat[1] - info.flat[0];
      for (let k = 0; k < (h > 110 ? 2 : 1); k++) {
        if (!R.chance(k ? 0.45 : 0.8)) continue;
        const sw = Math.min(36, fw * R.range(0.6, 0.92));
        const zc = (info.flat[0] + info.flat[1]) / 2 + R.range(-1, 1) * (fw - sw) * 0.4;
        const y0 = k ? Math.max(screenTop + 4, R.range(50, 110)) : Math.max(screenTop + 3, R.range(7, 30));
        const top = faceScreen(s, front - info.out, zc, sw, y0, info.top, k * 10);
        if (top) screenTop = top;
      }
    }
    if (info.shape === 'rounded' && info.r >= 5 && R.chance(0.4)) {
      const dz = R.chance(0.5) ? 1 : -1;
      const cz = dz > 0 ? info.z1 - info.r : info.z0 + info.r;
      const thx = -s * Math.PI / 2, thz = dz > 0 ? 0 : (s < 0 ? Math.PI : -Math.PI);
      const y0 = Math.max(screenTop + 3, R.range(8, 26)), sh = R.range(14, 28);
      if (y0 + sh < info.top - 3) { arcScreen(X(front + info.r), cz, info.r + 0.45, Math.min(thx, thz), Math.PI / 2, y0, sh); arcTop = y0 + sh; }
    } else if (info.shape === 'round' && R.chance(0.6)) {
      const rad = Math.min(info.d, info.z1 - info.z0) / 2;
      const y0 = R.range(9, 26), sh = R.range(14, 30);
      if (y0 + sh < info.top - 3) { arcScreen(X(front + info.d / 2), (info.z0 + info.z1) / 2, rad + 0.45, -s * Math.PI / 2 - 0.75, 1.5, y0, sh); arcTop = y0 + sh; }
    }

    // a slim blade sign by some doors on the street line
    if (type === 'line' && w > 8 && R.chance(0.3)) {
      const zc = zB + 3 + R.next() * (w - 6);
      const rect = atlasRect('v', R.pick(signWords));
      const bw = 1.8, bh = THREE.MathUtils.clamp(bw / rectAspect(rect) * 0.9, 4, 9), by = R.range(5.8, 9);
      const xa = front - 2.3, xb = front - 0.3, xm = X((xa + xb) / 2), seedS = R.next();
      // (over 白云乡, its ice cream instead of words; over 流波月, none: its own ad hangs there; by 浮岛咖啡,
      // none: its own upright stands there)
      const gelato = SHOPS.some((sh) => sh.s === s && sh.brand === 'cloud-gelato' && sh.z0 - 2 < zc && zc < sh.z1 + 2);
      const underAd = SHOPS.some((sh) => sh.s === s && ['pearl-moon', 'float-cafe'].includes(sh.brand) && sh.z0 - 1.5 < zc && zc < sh.z1 + 1.5);
      if (!underAd) {
        props(box(X(xa), X(xb), by - 0.12, by + bh + 0.12, zc - 0.12, zc + 0.12), 0.8);
        props(box(X(xb), X(front), by + bh * 0.5 - 0.05, by + bh * 0.5 + 0.05, zc - 0.06, zc + 0.06), 0.6);
        for (const face of ['z', '-z']) {
          const pg = panel(bw - 0.2, bh, xm, by + bh / 2, zc + (face === 'z' ? 0.13 : -0.13), face);
          if (gelato) caseLabels.push(ledPicture(pg, bw - 0.2, bh, drawGelatoLED, { density: 28, screen: true }));
          else screen(pg, PROG.TEXT, bw - 0.2, bh, rect, seedS);
          emitters.push({ x: xm, y: by + bh / 2, z: zc + (face === 'z' ? 0.4 : -0.4), nx: 0, ny: 0, nz: face === 'z' ? 1 : -1, power: 0.6, reach: 10, tint: 0.5 });
        }
      }
    }
    plots.push({ s, zB, zA, front, top: info.top, back: front + depth, info, hung: Math.max(screenTop, arcTop), type, site, face: front });
    if (site === 'terrace') terrace(s, zB, zA, front, info);
    if (site === 'plinth') plinth(s, zB, zA, front);
  }

  // An open garden bridge from x0 to x1 over the street, z from z0 to z1, its deck at y: planters and trees
  // down both sides, glass railings with lit top rails, lines of light beneath.
  function gardenBridge(x0, x1, z0, z1, y) {
    const Q = RM, DIM = [0.25, 0.5, 0.55];
    props(box(x0, x1, y - 0.6, y, z0, z1), 0.8);
    for (const [za, zb] of [[z0 + 0.3, z0 + 1.3], [z1 - 1.3, z1 - 0.3]]) {
      props(box(x0 + 1, x1 - 1, y, y + 0.55, za, zb), 0.36);
      for (let x = x0 + 2; x < x1 - 2; x += Q.range(3.5, 5)) {
        trees.push({ x, y: y + 0.55, z: (za + zb) / 2, h: Q.range(3.2, 4.5), r: Q.range(1.1, 1.5), lights: Q.chance(0.6), bands: false });
      }
      for (let x = x0 + 1; x < x1 - 1; x += Q.range(0.9, 1.8)) {
        const len = Q.range(0.8, 2.2), zz = za < (z0 + z1) / 2 ? z0 - 0.05 : z1 + 0.05;
        props(box(x - 0.2, x + 0.2, y - 0.6 - len, y - 0.1, zz - 0.12, zz + 0.12), 0.3, TINT.leaf);   // greenery hanging over
      }
    }
    for (const zz of [z0 + 0.05, z1 - 0.05]) {
      glow(box(x0, x1, y, y + 1.1, zz - 0.02, zz + 0.02), DIM);
      glow(box(x0, x1, y + 1.08, y + 1.12, zz - 0.04, zz + 0.04), CYAN);
    }
    for (let z = z0 + 1.5; z < z1 - 1; z += 2.5) glow(box(x0 + 0.5, x1 - 0.5, y - 0.64, y - 0.6, z - 0.05, z + 0.05), SOFT);
  }

  // ---------------------------------------------------------------- the hand-made spots

  // A freestanding glass ad on a terrace: a pane on two slim posts, its picture seen from both ways along
  // the street, lit edges.
  function glassAd(s, a, z, y, prog) {
    const X = (q) => s * q, w = 3.2, h = 4.8, seed = RS.next();
    for (const dx of [-w / 2 - 0.06, w / 2 + 0.06]) props(box(X(a + dx) - 0.05, X(a + dx) + 0.05, y, y + h + 0.5, z - 0.05, z + 0.05), 0.85);
    for (const face of ['z', '-z']) {
      screen(panel(w, h, X(a), y + 0.4 + h / 2, z + (face === 'z' ? 0.03 : -0.03), face), prog, w, h, new THREE.Vector4(), seed);
      emitters.push({ x: X(a), y: y + 0.4 + h / 2, z: z + (face === 'z' ? 0.4 : -0.4), nx: 0, ny: 0, nz: face === 'z' ? 1 : -1, power: 0.75, reach: 11, tint: 0.5 });
    }
    glow(box(X(a - w / 2), X(a + w / 2), y + h + 0.42, y + h + 0.46, z - 0.03, z + 0.03), SOFT);
    wall(X(a - w / 2 - 0.2), X(a + w / 2 + 0.2), z - 0.25, z + 0.25, y - 0.6, y + 2);
  }

  // Lit rooms behind a stretch of a tower's flat street face (at x, z0 to z1, ya to yb), in step with its own
  // glass (the same outline, panes and rooms: g, as its tier was drawn), more of them lit; a hair in front of it
  function litGlass(g, x, z0, z1, ya, yb) {
    let pts = g.pts, area = 0;
    for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length]; area += ax * bz - bx * az; }
    if (area > 0) pts = [...pts].reverse();                                     // (as prism() walks it)
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      if (Math.abs(ax - x) < 0.05 && Math.abs(bx - x) < 0.05) {
        const dir = Math.sign(bz - az), nx = -(bz - az) / len, fx = ax + nx * 0.08;
        const [za, zb] = dir > 0 ? [z0, z1] : [z1, z0], uAt = (zz) => u + (zz - az) * dir;
        const pos = [], nrm = [], us = [];
        for (const [zz, yy] of [[za, ya], [zb, ya], [zb, yb], [za, ya], [zb, yb], [za, yb]]) { pos.push(fx, yy, zz); nrm.push(nx, 0, 0); us.push(uAt(zz)); }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geom.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
        glass(geom, [g.win[0], g.win[1], Math.max(g.win[2], 0.9), g.win[3]], g.seed, g.base, g.bright, g.newer);
        return;
      }
      u += len;
    }
  }

  // A wall of ads: the street face of a tower (at |x| = a, the flat part of its first tier, from y0 up) filled
  // nearly edge to edge with brand ads around the great screens already on it: tall strips beside them,
  // banners above and below, each brand once.
  function adWall(s, a, info, zB, zA, y0) {
    if (!info.flat) return;
    const X = (q) => s * q, gap = 0.7;
    const [f0, f1] = [info.flat[0] + 0.4, info.flat[1] - 0.4], y1 = info.top - 2.5;
    const taken = faces.filter((f) => f.s === s && f.z > zB && f.z < zA)
      .map((f) => ({ z0: f.z - f.w / 2 - gap, z1: f.z + f.w / 2 + gap, y0: f.y - f.h / 2 - gap, y1: f.y + f.h / 2 + gap }));
    const brands = [...BRAND_ADS].sort(() => RS.next() - 0.5);
    const free = (r) => taken.every((t) => r.z1 <= t.z0 || r.z0 >= t.z1 || r.y1 <= t.y0 || r.y0 >= t.y1);
    let placed = 0;
    const put = (z0, z1, ya, yb) => {
      const r = { z0, z1, y0: ya, y1: yb };
      if (z1 - z0 < 2.5 || yb - ya < 2 || !free(r) || !brands.length) return;
      // (every third place left as the tower's own glass, its rooms lit, not a dark gap)
      if (placed++ % 3 === 1) {
        if (info.glassOf) litGlass(info.glassOf, X(a), z0, z1, ya, yb); brands.pop(); RS.next(); taken.push({ z0: z0 - gap, z1: z1 + gap, y0: ya - gap, y1: yb + gap }); return; }
      const w = z1 - z0, h = yb - ya, zc = (z0 + z1) / 2, yc = (ya + yb) / 2;
      // (灯笼面馆's place given to 浮岛咖啡 (灯笼面馆 itself gone since: alive); 光合书店's and
      // 月台电影's places swapped, the bookshop's long strip down at the foot, showing 往昔之信)
      const swap = { [AD['brand-lantern-noodles']]: AD['brand-float-cafe'], [AD['brand-float-cafe']]: AD['brand-lantern-noodles'],
        [AD['brand-photon-books']]: AD['brand-moon-cinema'], [AD['brand-moon-cinema']]: AD['brand-photon-books'] };
      const drawn = brands.pop(), ad = swap[drawn] ?? drawn, seed = RS.next();
      // (星环旅行's and 月台电影's held, to be put up elsewhere: below)
      if (ad === AD['brand-star-ring'] || ad === AD['brand-moon-cinema'] || ad === AD['brand-cloud-gelato']) heldAds[ADS[ad].brand] = { w, h, seed, s, a, zc };
      else hang(w, h, yc, zc, ad, seed);
      hung[ad] = r;
      taken.push({ z0: z0 - gap, z1: z1 + gap, y0: ya - gap, y1: yb + gap });
    };
    const hung = {};
    const hang = (w, h, yc, zc, ad, seed) => {
      props(box(X(a - 0.28), X(a), yc - h / 2 - 0.25, yc + h / 2 + 0.25, zc - w / 2 - 0.25, zc + w / 2 + 0.25), 0.45);
      adPanel(w, h, X(a - 0.31), yc, zc, s < 0 ? 'x' : '-x', ad, seed, ad === AD['brand-photon-books'] ? 'wangxi' : null);
      emitters.push({ x: X(a - 0.5), y: yc, z: zc, nx: -s, ny: 0, nz: 0, power: 1.0, reach: THREE.MathUtils.clamp(Math.sqrt(w * h) * 2.4, 16, 50), tint: 0.5 });
    };
    // beside each great screen: a tall strip on either side, as high as the screen
    for (const t of [...taken]) {
      put(f0, t.z0, t.y0 + gap, t.y1 - gap);
      put(t.z1, f1, t.y0 + gap, t.y1 - gap);
    }
    // then rows of banners across the whole face, from the bottom up: full rows below and above the great
    // screens (their sides are filled already), a row ending where a screen begins
    for (let y = y0; y < y1 - 3; ) {
      let h = Math.min(RS.range(5, 8), y1 - y);
      const inside = taken.filter((t) => t.y0 <= y + 0.01 && t.y1 > y);
      if (inside.length) { y = Math.max(...inside.map((t) => t.y1)); continue; }
      const next = taken.filter((t) => t.y0 > y && t.y0 < y + h);
      if (next.length) h = Math.min(...next.map((t) => t.y0)) - y;
      if (h > 2.5) {
        if (f1 - f0 > 22 && RS.chance(0.6)) {
          const zm = f0 + (f1 - f0) * RS.range(0.4, 0.6);
          put(f0, zm - gap / 2, y, y + h);
          put(zm + gap / 2, f1, y, y + h);
        } else put(f0, f1, y, y + h);
      }
      y += h + gap;
    }
    // 星环旅行's: its foot on the top of 夕光烘焙's, its right side against the left of 白云乡's (their frames
    // touching; as one faces the wall, its right toward -z on this side of the street); 白云乡's then brought down,
    // the foot of its frame level with the foot of 星环旅行's
    const star = heldAds['star-ring'], gelA = heldAds['cloud-gelato'], bake = hung[AD['brand-dawn-bakery']], gel = hung[AD['brand-cloud-gelato']];
    const rim = (q, r2) => THREE.MathUtils.clamp(Math.min(q, r2) * 0.035, 0.08, 0.45);
    if (star && bake && gel && s < 0) {
      const rs = rim(star.w, star.h), rg = rim(gelA.w, gelA.h), sy = bake.y1 + rim(bake.z1 - bake.z0, bake.y1 - bake.y0) + rs + star.h / 2;
      hang(star.w, star.h, sy, gel.z1 + rg + rs + star.w / 2, AD['brand-star-ring'], star.seed);
      hang(gelA.w, gelA.h, sy - star.h / 2 - rs + rg + gelA.h / 2, gelA.zc, AD['brand-cloud-gelato'], gelA.seed);
    } else if (gelA) hang(gelA.w, gelA.h, (gel.y0 + gel.y1) / 2, gelA.zc, AD['brand-cloud-gelato'], gelA.seed);
  }
  const heldAds = {};   // (ads a wall drew its numbers for but did not put up there: by brand, { w, h, seed })

  // Before the tower with the mascot's tall screen, just ahead of the start: its ground floor raised onto a
  // terrace reached by broad steps from the pavement, with planters and trees, benches and two freestanding
  // glass ads; from the terrace a long stair, every step edge lit, climbs to a deck in front of the second
  // floor, with its own planters, trees and lines of light, and beneath the deck a covered place to sit.
  function terrace(s, zB, zA, front, info) {
    const X = (a) => s * a, Q = RS;
    const T1 = TERRACE, T2 = TERRACE + LOBBY;
    const z0 = zB + 0.5, z1 = zA - 0.5;
    const DIM = [0.25, 0.5, 0.55];                             // glass rails: a faint line of light
    G = T1;

    // the broad steps up from the pavement, a lit line along each edge
    const sa0 = FACADE + 1, n1 = 8, tr1 = 0.4, sa1 = sa0 + n1 * tr1;
    for (let i = 0; i < n1; i++) {
      const top = CURB + ((i + 1) * (T1 - CURB)) / n1;
      props(box(X(sa0 + i * tr1), X(sa1 + 0.5), 0, top, z0, z1), 0.72);
      glow(box(X(sa0 + i * tr1) - 0.02, X(sa0 + i * tr1) + 0.02, top - 0.03, top, z0 + 0.3, z1 - 0.3), DIM);
    }
    floorAt(X(sa0), X(sa1), z0, z1, (x) => CURB + THREE.MathUtils.clamp((Math.abs(x) - sa0) / (sa1 - sa0), 0, 1) * (T1 - CURB));
    // the terrace itself, paved and wet; its ends a wall to anyone below
    props(box(X(sa1), X(front + 1), 0, T1 - 0.02, z0, z1), 0.72);
    raised.push(box(X(sa1), X(front + 0.4), T1 - 0.02, T1, z0, z1));
    lifts.push({ ...xzBox(X(sa1), X(front), z0, z1), y: T1 });
    floorAt(X(sa1), X(front + 1), z0, z1, () => T1);
    for (const zz of [z0, z1]) wall(X(sa0), X(front + 1), zz - 0.25, zz + 0.25, -1, T1 - 0.45);
    glow(box(X(sa1) - 0.03, X(sa1) + 0.03, T1, T1 + 0.015, z0 + 0.4, z1 - 0.4), CYAN);   // a line of light at the top of the steps

    // the deck before the second floor, on slender columns
    const da = front - 9.5, dz0 = zB + 2, dz1 = zB + 16;
    props(box(X(da), X(front), T2 - 0.32, T2, dz0, dz1), 0.85);
    floorAt(X(da), X(front), dz0, dz1, () => T2);
    for (const z of [dz0 + 0.6, (dz0 + dz1) / 2, dz1 - 0.6]) {
      props(new THREE.CylinderGeometry(0.17, 0.17, T2 - 0.32 - T1, 10).translate(X(da + 0.5), (T1 + T2 - 0.32) / 2, z), 0.9);
      colliders.push({ x: X(da + 0.5), z, r: 0.3, y0: -1, y1: T2 - 1 });
    }
    // its edge, a long band of flowing light ribbons facing the street
    screenAd(panel(dz1 - dz0, 0.58, X(da - 0.03), T2 - 0.31, (dz0 + dz1) / 2, s < 0 ? 'x' : '-x'), adOf(PROG.RIBBONS), dz1 - dz0, 0.58, Q.next());
    emitters.push({ x: X(da - 0.4), y: T2 - 0.3, z: (dz0 + dz1) / 2, nx: -s, ny: 0, nz: 0, power: 0.7, reach: 12, tint: 0.6 });
    covers.push({ ...xzBox(X(da), X(front), dz0, dz1), y: T2 - 0.6 });
    lifts.push({ ...xzBox(X(da), X(front), dz0, dz1), y: T2 });
    // beneath it, two banners hung from the soffit, seen from the street and from the lobby
    // (the first: the way to the metro, the metro's own board; the second: 光合书店's 无风之日, a case on either face)
    for (const z of [dz0 + 3.6, dz1 - 3.6]) {
      const a = da + 1.8, seedB = Q.next(), way = z < 0;
      for (const face of ['x', '-x']) {
        const f = (s < 0) === (face === 'x') ? 1 : -1; // +1: the face toward the street
        if (way) caseLabels.push(metroBoard(panel(4.4, 1.15, X(a) + (s < 0 ? f : -f) * 0.03, T2 - 1.35, z, face), 4.4, 1.15, 'way', { down: f < 0 }));   // (its arrow down on the face toward the lobby)
        else brandCase(4.4, 1.15, X(a), T2 - 1.35, z, face, AD['brand-photon-books'], seedB + (f > 0 ? 0 : 0.5), 'wufeng');
        emitters.push({ x: X(a) + (s < 0 ? f : -f) * 0.4, y: T2 - 1.35, z, nx: s < 0 ? f : -f, ny: 0, nz: 0, power: 0.65, reach: 9, tint: 0.6 });
      }
      props(box(X(a) - 0.04, X(a) + 0.04, T2 - 0.75, T2 - 0.32, z - 2.1, z - 2.0), 0.6);
      props(box(X(a) - 0.04, X(a) + 0.04, T2 - 0.75, T2 - 0.32, z + 2.0, z + 2.1), 0.6);
      props(box(X(a) - 0.015, X(a) + 0.015, T2 - 1.97, T2 - 0.73, z - 2.25, z + 2.25), 0.4);
    }
    for (let a = da + 1.5; a < front - 0.5; a += 2.5) glow(box(X(a) - 0.06, X(a) + 0.06, T2 - 0.34, T2 - 0.32, dz0 + 0.5, dz1 - 0.5), SOFT);
    emitters.push({ x: X((da + front) / 2), y: T2 - 0.6, z: (dz0 + dz1) / 2, nx: 0, ny: -1, nz: 0, power: 0.8, reach: 12, tint: 0.2 });

    // the stair to it, rising toward the deck along the tower
    const sA0 = da + 0.5, sA1 = da + 3.0, n2 = 35, tr2 = 0.45, zTop = dz1, zBot = dz1 + n2 * tr2;
    for (let i = 0; i < n2; i++) {
      const top = T1 + ((i + 1) * (T2 - T1)) / n2, zf = zBot - i * tr2;
      props(box(X(sA0), X(sA1), T1, top, zf - tr2, zf), 0.86);
      glow(box(X(sA0 + 0.1), X(sA1 - 0.1), top - 0.03, top, zf - 0.04, zf), DIM);
    }
    floorAt(X(sA0), X(sA1), zTop, zBot, (x, z) => T1 + THREE.MathUtils.clamp((zBot - z) / (zBot - zTop), 0, 1) * (T2 - T1));
    const slope = Math.atan2(T2 - T1, zBot - zTop), len = Math.hypot(T2 - T1, zBot - zTop);
    for (const a of [sA0, sA1]) {                                   // glass balustrades, their top rails lit
      const rail = new THREE.BoxGeometry(0.05, 0.05, len).rotateX(slope).translate(X(a), (T1 + T2) / 2 + 1.0, (zTop + zBot) / 2);
      bins.glow.add(rail, { color: CYAN, aBlink: 0 });
      wall(X(a) - 0.12, X(a) + 0.12, zTop, zBot, T1 + 0.4, T2 + 2);
    }
    wall(X(sA0), X(sA1), zTop, zBot - 2, -1, T1 + 0.3);           // the stair's bulk, for anyone beside it below
    // the deck's glass railing, open where the stair arrives
    glow(box(X(da) - 0.03, X(da) + 0.03, T2, T2 + 1.05, dz0, dz1), DIM);
    glow(box(X(da), X(front), T2, T2 + 1.05, dz0 - 0.03, dz0 + 0.03), DIM);
    glow(box(X(sA1 + 0.05), X(front), T2, T2 + 1.05, dz1 - 0.03, dz1 + 0.03), DIM);
    glow(box(X(da), X(front), T2 + 1.02, T2 + 1.06, dz0 - 0.04, dz0 + 0.04), CYAN);
    wall(X(da) - 0.2, X(da) + 0.2, dz0, dz1, T2 - 0.6, T2 + 2);
    wall(X(da), X(front), dz0 - 0.2, dz0 + 0.2, T2 - 0.6, T2 + 2);
    wall(X(sA1 + 0.05), X(front), dz1 - 0.2, dz1 + 0.2, T2 - 0.6, T2 + 2);

    // up on the deck: planters along the tower with small trees, a bench, a line of light in the floor
    props(box(X(front - 1.7), X(front - 0.3), T2, T2 + 0.6, dz0 + 1, dz1 - 1), 0.8);
    wall(X(front - 1.9), X(front), dz0 + 1, dz1 - 1, T2 - 0.6, T2 + 2);
    for (let z = dz0 + 2.2; z < dz1 - 1.5; z += 3.6) tree(X(front - 1.0), T2 + 0.6, z + Q.range(-0.4, 0.4), Q.range(0.5, 0.65), Q);
    glow(box(X(front - 1.75), X(front - 1.7), T2 + 0.45, T2 + 0.6, dz0 + 1, dz1 - 1), CYAN);
    glow(box(X(da + 1.2) - 0.03, X(da + 1.2) + 0.03, T2, T2 + 0.015, dz0 + 0.5, dz1 - 0.5), CYAN);
    G = T2;
    bench(X(da + 5), (dz0 + dz1) / 2 - 2, 1.9);
    G = T1;
    colliders[colliders.length - 1].y0 = T2 - 0.6; colliders[colliders.length - 1].y1 = T2 + 2;
    for (let i = 0; i < 3; i++) person(X(Q.range(da + 2, front - 2.5)), Q.range(dz0 + 1, dz1 - 1), true, T2, Q);

    // beneath the deck: benches, a table, people out of the rain
    for (const [a, z] of [[da + 3.5, dz0 + 3], [da + 3.5, dz1 - 3]]) {
      bench(X(a), z, 2.2);
      colliders[colliders.length - 1].y1 = T1 + 1.5;
    }
    for (let i = 0; i < 3; i++) person(X(Q.range(da + 1.5, front - 1.5)), Q.range(dz0 + 1, dz1 - 1), false, T1, Q);

    // on the terrace: trees in planters, a hedge, benches, the two glass ads, someone or other
    for (const z of [z0 + 3.5, z1 - 9]) {
      props(new THREE.CylinderGeometry(1.15, 1.2, 0.5, 20).translate(X(sa1 + 2.4), T1 + 0.25, z), 0.88);
      tree(X(sa1 + 2.4), T1 + 0.5, z, 0.95, Q, true);           // these two wrapped in thin rings of light
      colliders.push({ x: X(sa1 + 2.4), z, r: 1.25, y1: T1 + 2 });
      emitters.push({ x: X(sa1 + 2.4), y: T1 + 4.5, z, nx: -s, ny: 0, nz: 0, power: 0.45, reach: 8, tint: 0.8 });
    }
    // slim lamps along the top of the steps
    for (const z of [z0 + 1.2, (z0 + z1) / 2 - 2, z1 - 1.2]) {
      const px = X(sa1 + 0.35), hx = X(sa1 + 1.2), top = T1 + 4.6;
      props(new THREE.CylinderGeometry(0.05, 0.08, 4.7, 8).translate(px, T1 + 2.35, z), 0.7);
      props(box(px, hx, top - 0.06, top, z - 0.04, z + 0.04), 0.7);
      glow(box(hx - 0.45, hx + 0.45, top - 0.1, top - 0.06, z - 0.07, z + 0.07), [3, 3.2, 3.2]);
      lamps.push({ x: hx, y: top - 0.2, z });
      colliders.push({ x: px, z, r: 0.2, y0: T1 - 0.5 });
      bins.beams.add(new THREE.CylinderGeometry(0.3, 3.4, top - 0.2 - T1, 16, 1, true).translate(hx, (top - 0.2 + T1) / 2, z), {});
    }
    adWall(s, front - info.out, info, zB, zA, T2 + 2.2);
    metroStation(s, front, info, zB, zA);
    // a floating holographic sign at the foot of the steps, pointing the way
    holoSigns.push({ x: X(FACADE - 0.6), y: CURB + 2.9, z: (zA + zB) / 2 - 4, set: 'h2', text: S2['← 地铁 METRO'], back: S2['地铁 METRO →'] });
    props(box(X(sa1 + 0.7), X(sa1 + 1.7), T1, T1 + 0.5, z0 + 7, z1 - 13), 0.8);
    wall(X(sa1 + 0.6), X(sa1 + 1.8), z0 + 7, z1 - 13, T1 - 0.6, T1 + 2);
    for (let z = z0 + 8; z < z1 - 13; z += 2.2) tree(X(sa1 + 1.2), T1 + 0.5, z, Q.range(0.3, 0.38), Q);
    bench(X(sa1 + 4.5), z0 + 9, 2.0);
    colliders[colliders.length - 1].y1 = T1 + 2;
    // the two glass ads show what they were made for: the spiral galaxy, and the glowing cells (each still
    // draws its old random pick, so that nothing after it changes)
    Q.pick(VFX);
    glassAd(s, sa1 + 3.0, z1 - 4.5, T1, PROG.VORTEX);
    Q.pick(VFX);
    glassAd(s, sa1 + 5.5, (z0 + z1) / 2 + 1, T1, PROG.CELLS);
    for (let i = 0; i < 4; i++) person(X(Q.range(sa1 + 2.3, da - 0.5)), Q.range(z0 + 1, z1 - 1), true, T1, Q);
    emitters.push({ x: X(front - 0.6), y: T1 + 2.6, z: (zA + zB) / 2 + 6, nx: -s, ny: 0, nz: 0, power: 0.7, reach: 12, tint: 0.25 });
    G = CURB;
  }

  // The metro station under the terrace's tower. The tower stands on columns over an open hall at the
  // terrace's level; from its middle escalators and a stair go down about 7 m into a concourse under the
  // terrace: ticket machines, the line's map, signs, and a row of fare gates, which is as far as it goes (the
  // gates stay shut). Everything in it is drawn on its own layer (not in the shadows or the street's mirror)
  // and lit only by its own lamps.
  // Goods along a shelf len long, in blocks of one product each (one kind, one tone), now and then a gap where
  // one has sold out; put(kind, t, { tone, scale }) places one t along it. 'block' is a box of any size.
  const WIDE = { bottle: 0.075, can: 0.072, carton: 0.082, snack: 0.165, noodle: 0.12, cup: 0.1 };
  let rowBlocks = 0;
  const row = (len, kinds, put) => {
    let t = 0.04;
    while (t < len - 0.1) {
      const kind = RG.pick(kinds), tone = RG.pick([0.32, 0.55, 0.8, 1.0, 1.0]), end = Math.min(len - 0.04, t + RG.range(0.6, 1.4));
      const pick = (rowBlocks++ * 0.6180339) % 1;          // its colour in the colour mode (not drawn from RG)
      const size = kind === 'block' ? [RG.range(0.1, 0.2), RG.range(0.16, 0.3), RG.range(0.06, 0.12)] : null;
      const w = size ? size[0] + 0.01 : WIDE[kind];
      for (t += w / 2; t + w / 2 <= end; t += w) if (!RG.chance(0.03)) put(kind, t, { tone, pick, scale: size || 1, tilt: kind === 'snack' ? -0.1 : 0 });
      t += 0.04;
    }
  };

  function metroStation(s, front, info, zB, zA) {
    const X = (a) => s * a, Q = RS;
    const ip = (g, albedo) => inside.props.add(g, { aAlbedo: albedo });
    const ig = (g, rgb, blink = 0) => inside.glow.add(g, { color: rgb, aBlink: blink });
    const is = (g, ad, w, h) => inside.screens.add(g, { aScr: [alive(ad), Q.next(), w, h], aRect: [0, 0, 0, 0] });
    // the metro's own boards (metroBoard), down here (the number a screen there drew, still drawn)
    const board = (g, w, h, kind) => { Q.next(); const m = metroBoard(g, w, h, kind); m.layers.set(LAYER.INSIDE); caseLabels.push(m); };
    const DIM = [0.25, 0.5, 0.55], STRIP = [1.2, 1.35, 1.35], PALE = [0.9, 1.25, 1.3];
    const T1 = TERRACE, HALL = TERRACE + LOBBY, CF = T1 - 7.2, CC = CF + 4.25;
    const toStreet = s < 0 ? 'x' : '-x', fromStreet = s < 0 ? '-x' : 'x';
    // the hall: inside the tower's plan, clear of its cut corners
    const hz0 = zB + info.r + 0.3, hz1 = zA - info.r - 0.3, ha1 = front + 26;
    const zc = THREE.MathUtils.clamp(2, hz0 + 5, hz1 - 9);
    const ez0 = zc - 3.6, ez1 = zc + 3.6, ea0 = front + 6, ea1 = front + 20;      // the well of the escalators
    const cz0 = zc - 10, cz1 = zc + 12, ca0 = front + 4, ca1 = front + 42, gate = front + 26;
    station = { x: X(front + 15), z: zc };
    const hole = xzBox(X(ea0), X(ea1), ez0, ez1);   // just the escalators' well: the rest is under the hall's floor
    shared.uHole.value.set(hole.x0, hole.x1, hole.z0, hole.z1);

    // --- the hall
    const floorPieces = [[front + 0.4, ea0, hz0, hz1], [ea0, ea1, hz0, ez0], [ea0, ea1, ez1, hz1], [ea1, ha1, hz0, hz1]];
    for (const [a0, a1, z0, z1] of floorPieces) {
      ip(box(X(a0), X(a1), T1 - 0.35, T1, z0, z1), 0.42);
      floorAt(X(a0), X(a1), z0, z1, () => T1);
    }
    for (const z of [hz0, hz1]) {
      ip(box(X(front + 0.6), X(ha1), T1, HALL, z - 0.15, z + 0.15), 0.72);
      wall(X(front + 0.6), X(ha1), z - 0.3, z + 0.3, T1 - 0.5, HALL);
    }
    ip(box(X(ha1), X(ha1 + 0.3), T1, HALL, hz0, hz1), 0.72);
    wall(X(ha1 - 0.1), X(ha1 + 0.4), hz0, hz1, T1 - 0.5, HALL);
    // the open strips beside the hall, under the tower's edges: closed off
    wall(X(front + 0.6), X(front + 1.4), zB, hz0, -1, HALL);
    wall(X(front + 0.6), X(front + 1.4), hz1, zA, -1, HALL);
    // lines of light under the tower, lamps, the hall roofed against the rain
    for (let a = front + 1.5; a < ha1; a += 2.5) ig(box(X(a) - 0.07, X(a) + 0.07, HALL - 0.06, HALL - 0.02, hz0 + 0.6, hz1 - 0.6), STRIP);
    for (const [a, z] of [[front + 3, zc], [front + 13, hz0 + 2.5], [front + 13, hz1 - 3], [front + 23, zc + 4]]) lamps.push({ x: X(a), y: HALL - 0.3, z, power: 0.7 });
    covers.push({ ...xzBox(X(front), X(front + info.d), zB, zA), y: HALL, room: true });
    // the line's map over the top of the escalators, both faces; 萤伞's ad along the wall
    for (const face of [toStreet, fromStreet]) {
      const f = face === toStreet ? -1 : 1;
      board(panel(5.2, 1.1, X(ea0 - 0.6) + s * f * 0.03, T1 + 3.9, zc, face), 5.2, 1.1, 'map');
    }
    ip(box(X(ea0 - 0.6) - 0.02, X(ea0 - 0.6) + 0.02, T1 + 3.3, T1 + 4.5, zc - 2.7, zc + 2.7), 0.4);
    // 浮岛咖啡's ad on the hall's side wall, by the top of the escalators (its own numbers)
    adPanel(5.6, 3.0, X(front + 8.6), T1 + 3.0, hz0 + 0.16, 'z', AD['brand-float-cafe'], makeRandom(5910).next());
    emitters.push({ x: X(front + 8.6), y: T1 + 3.0, z: hz0 + 0.8, nx: 0, ny: 0, nz: 1, power: 0.6, reach: 10, tint: 0.5 });
    const sz0 = ez1 + 3;                                    // the convenience store's front, beside the escalators
    {
      // (where the line's map was: 萤伞's umbrellas drifting up as jellyfish, framed, its name in the middle; the map's number
      // still drawn)
      Q.next();
      const m = umbrellaLED(10, 2, X(ha1 - 0.17), T1 + 3.0, (hz0 + sz0) / 2, toStreet, BRANDS.find((b) => b.key === 'glow-umbrella'), { framed: true });
      m.layers.set(LAYER.INSIDE);
      caseLabels.push(m);
    }
    emitters.push({ x: X(ea0 - 0.6), y: T1 + 3.9, z: zc, nx: -s, ny: 0, nz: 0, power: 0.6, reach: 10, tint: 0.4 });
    for (let i = 0; i < 3; i++) person(X(Q.range(front + 2, ea0 - 1)), Q.range(hz0 + 1, sz0 - 1), false, T1, Q);

    // --- a convenience store in the hall, beside the escalators: open to the hall through a glazed front,
    // aisles of shelves lit along their tops, coolers glowing along one side, a counter by the door
    {
      const a0 = front + 8, a1 = front + 24, z0 = sz0, z1 = hz1 - 0.15, ceil = T1 + 3.6, door = [front + 9.5, front + 13];
      const face = '-z';                                                                     // toward the escalators
      // (views of it: from across the hall, from its door, from the way in)
      const mid = (a0 + a1) / 2, dm = (door[0] + door[1]) / 2;
      shopSpots.push({ brand: 'spring-mart', name: '春晴便利店', where: '地铁站大厅', views: {
        front: { from: [X(mid), T1 + 2.2, z0 - 8.5], to: [X(mid), T1 + 3.0, z0] },
        inside: { from: [X(dm), T1 + 1.75, z0 + 0.8], to: [X(dm + 4), T1 + 1.5, z1] },
        along: { from: [X(front + 2.5), T1 + 1.8, z0 - 1.5], to: [X(a0 + 5), T1 + 3.0, z0] } } });
      for (const a of [a0, a1]) {
        ip(box(X(a) - 0.12, X(a) + 0.12, T1, HALL, z0, z1), 0.7);
        wall(X(a) - 0.3, X(a) + 0.3, z0, z1, T1 - 0.5, HALL);
      }
      ip(box(X(a0), X(a1), ceil, ceil + 0.2, z0, z1), 0.6);
      for (let a = a0 + 1.5; a < a1 - 1; a += 2.6) ig(box(X(a) - 0.5, X(a) + 0.5, ceil - 0.04, ceil, z0 + 1, z1 - 1), [1.3, 1.4, 1.4]);
      ip(box(X(a0), X(a1), ceil, HALL, z0 - 0.12, z0 + 0.12), 0.65);                       // the fascia
      Q.next();                                                                  // (its sign: springSign; the number its screen drew still drawn)
      { const m = springSign(panel(7, 0.8, X((a0 + a1) / 2 + 2), ceil + 0.75, z0 - 0.14, face), 7, 0.8); m.layers.set(LAYER.INSIDE); caseLabels.push(m); }
      for (let a = a0 + 0.2; a <= a1 - 0.2; a += 2) {                                      // the glazing's mullions
        if (a > door[0] - 0.1 && a < door[1] + 0.1) continue;
        ip(box(X(a) - 0.05, X(a) + 0.05, T1, ceil, z0 - 0.05, z0 + 0.05), 0.35);
      }
      wall(X(a0), X(door[0]), z0 - 0.2, z0 + 0.2, T1 - 0.5, HALL);
      wall(X(door[1]), X(a1), z0 - 0.2, z0 + 0.2, T1 - 0.5, HALL);
      // the aisles: shelves both sides of a spine, goods along every shelf, a line of light along the top
      const SHELF = [0.12, 0.52, 0.92, 1.32], PRICE = [0.5, 0.75, 0.8];
      const STOCK = [['carton', 'block'], ['noodle', 'snack'], ['snack', 'noodle', 'block'], ['bottle', 'can']];
      for (let z = z0 + 3; z < z1 - 2.5; z += 2.6) {
        const aA = a0 + 2, aB = a1 - 2.5;
        ip(box(X(aA), X(aB), T1, T1 + 0.12, z - 0.44, z + 0.44), 0.3);
        ip(box(X(aA), X(aB), T1, T1 + 1.7, z - 0.03, z + 0.03), 0.08);              // the spine: dark, for the goods to stand out
        for (const a of [aA, aB]) ip(box(X(a) - 0.03, X(a) + 0.03, T1, T1 + 1.7, z - 0.44, z + 0.44), 0.6);
        ig(box(X(aA), X(aB), T1 + 1.7, T1 + 1.73, z - 0.3, z + 0.3), CYAN);
        for (const f of [-1, 1]) {
          SHELF.forEach((y, k) => {
            ip(box(X(aA), X(aB), T1 + y - 0.02, T1 + y, ...sorted(z + f * 0.03, z + f * 0.44)), 0.75);
            ig(box(X(aA), X(aB), T1 + y - 0.045, T1 + y - 0.02, ...sorted(z + f * 0.44, z + f * 0.447)), PRICE);   // the price strip
            row(aB - aA, STOCK[k], (kind, t, o) => goods.put(kind, X(aA + t), T1 + y, z + f * 0.27, { ...o, rot: f > 0 ? 0 : Math.PI }));
          });
        }
        wall(X(a0 + 2), X(a1 - 2.5), z - 0.45, z + 0.45, T1 - 0.5, HALL);
      }
      // the coolers along the far wall: lit inside, drinks in rows on glass shelves, the doors framed in steel
      {
        const ca = a1 - 0.95, cb = a1 - 0.15, za = z0 + 1.8, zb = z1 - 0.8, toShop = -s * Math.PI / 2;
        ig(box(X(cb - 0.05), X(cb), T1 + 0.25, T1 + 2.1, za, zb), [0.8, 0.95, 1.0]);
        ip(box(X(ca), X(cb), T1, T1 + 0.25, za, zb), 0.35);
        ip(box(X(ca), X(cb), T1 + 2.1, T1 + 2.45, za, zb), 0.4);
        ig(box(X(ca) - 0.012, X(ca) + 0.012, T1 + 2.22, T1 + 2.3, za + 0.1, zb - 0.1), CYAN);
        for (const z of [za, zb]) ip(box(X(ca), X(cb), T1, T1 + 2.45, z - 0.04, z + 0.04), 0.4);
        const doors = Math.round((zb - za) / 0.75);
        for (let i = 0; i <= doors; i++) {
          const z = za + (zb - za) * i / doors;
          ip(box(X(ca) - 0.025, X(ca) + 0.025, T1 + 0.25, T1 + 2.1, z - 0.025, z + 0.025), 0.3);
          if (i < doors) ig(box(X(ca) - 0.035, X(ca) + 0.035, T1 + 0.95, T1 + 1.45, z + 0.07, z + 0.09), PALE);   // a handle
        }
        for (const y of [0.25, 0.62, 0.99, 1.36, 1.73]) {
          ig(box(X(ca + 0.05), X(cb - 0.05), T1 + y, T1 + y + 0.012, za, zb), PRICE);
          row(zb - za, y > 1.7 ? ['carton'] : ['bottle', 'bottle', 'can', 'carton'], (kind, t, o) => goods.put(kind, X(ca + 0.3), T1 + y + 0.012, za + t, { ...o, rot: toShop }));
        }
        wall(X(ca - 0.1), X(a1), za, zb, T1 - 0.5, HALL);
      }
      // the counter: a till, a cabinet of warm buns, a coffee machine at its end
      const c0 = door[1] + 0.5, c1 = door[1] + 3.5;
      ip(box(X(c0), X(c1), T1, T1 + 1.05, z0 + 1.2, z0 + 1.8), 0.55);
      ig(box(X(c0), X(c1), T1 + 1.05, T1 + 1.08, z0 + 1.2, z0 + 1.8), CYAN);
      wall(X(c0 - 0.1), X(c1 + 0.1), z0 + 1.1, z0 + 1.9, T1 - 0.5, HALL);
      ip(box(X(c0 + 0.3), X(c0 + 0.75), T1 + 1.08, T1 + 1.25, z0 + 1.45, z0 + 1.75), 0.4);
      ig(box(X(c0 + 0.32), X(c0 + 0.73), T1 + 1.27, T1 + 1.5, z0 + 1.52, z0 + 1.55), PALE);
      ip(box(X(c0 + 1.0), X(c0 + 1.9), T1 + 1.08, T1 + 1.1, z0 + 1.25, z0 + 1.75), 0.5);
      ip(box(X(c0 + 1.0), X(c0 + 1.9), T1 + 1.5, T1 + 1.53, z0 + 1.25, z0 + 1.75), 0.5);
      ig(box(X(c0 + 1.0), X(c0 + 1.9), T1 + 1.1, T1 + 1.5, z0 + 1.72, z0 + 1.75), [1.0, 1.1, 1.1]);
      ig(box(X(c0 + 1.0), X(c0 + 1.9), T1 + 1.29, T1 + 1.3, z0 + 1.25, z0 + 1.72), PRICE);
      for (const y of [1.1, 1.3]) for (let a = c0 + 1.1; a < c0 + 1.85; a += 0.12) goods.put('roll', X(a), T1 + y, z0 + 1.45, { rot: RG.range(0, 6), tone: RG.range(0.8, 1) });
      ip(box(X(c1 - 0.6), X(c1 - 0.1), T1 + 1.08, T1 + 1.75, z0 + 1.3, z0 + 1.75), 0.8);
      ig(box(X(c1 - 0.6), X(c1 - 0.1), T1 + 1.55, T1 + 1.6, z0 + 1.28, z0 + 1.3), CYAN);
      for (let k = 0; k < 4; k++) goods.put('cup', X(c1 - 0.85), T1 + 1.08 + k * 0.03, z0 + 1.5, { tone: 1 });
      // magazines in a rack along the glass, between the counter and the coolers
      {
        const m0 = c1 + 0.4, m1 = a1 - 1.3;
        ip(box(X(m0), X(m1), T1, T1 + 0.4, z0 + 0.15, z0 + 0.6), 0.5);
        ip(box(X(m0), X(m1), T1, T1 + 1.25, z0 + 0.12, z0 + 0.2), 0.5);
        [[0.4, 0.5], [0.72, 0.38], [1.0, 0.28]].forEach(([y, d]) => {
          ip(box(X(m0), X(m1), T1 + y - 0.02, T1 + y, z0 + 0.2, z0 + d + 0.08), 0.6);
          for (let a = m0 + 0.15; a < m1 - 0.12; a += 0.23) goods.put('block', X(a), T1 + y, z0 + d, { scale: [0.21, 0.28, 0.008], tilt: -0.3, tone: RG.range(0.4, 1) });
        });
        wall(X(m0), X(m1), z0, z0 + 0.7, T1 - 0.5, HALL);
      }
      // by the door, outside: umbrellas to buy, in a stand
      {
        const ux = X(door[0] - 0.7), uz = z0 - 0.5;
        ip(new THREE.CylinderGeometry(0.22, 0.2, 0.55, 14, 1, true).translate(ux, T1 + 0.275, uz), 0.5);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2, r = 0.11 + 0.05 * (i % 2);
          goods.put('umbrella', ux + Math.cos(a) * r, T1 + 0.05, uz + Math.sin(a) * r, { rot: RG.range(0, 6.3), tilt: Math.sin(a) * 0.12, roll: -Math.cos(a) * 0.12, tone: RG.range(0.5, 1) });
        }
        colliders.push({ x: ux, z: uz, r: 0.4, y0: T1 - 0.5, y1: HALL });
      }
      person(X(door[1] + 2), z0 + 2.5, false, T1, Q);
      for (let i = 0; i < 3; i++) person(X(Q.range(a0 + 1, a1 - 3)), z0 + 1.7 + 2.6 * Q.int(0, 3), false, T1, Q);
      emitters.push({ x: X((a0 + a1) / 2), y: T1 + 2, z: z0 - 0.6, nx: 0, ny: 0, nz: -1, power: 0.75, reach: 12, tint: 0.2 });
      lamps.push({ x: X((a0 + a1) / 2), y: ceil - 0.2, z: (z0 + z1) / 2, power: 0.5 });
      // its flank, facing the way in: its own ad, wide, the rain clearing for whoever comes in out of it (springAd;
      // the number the screen there drew still drawn)
      Q.next();
      { const m = springAd(panel(z1 - z0 - 2, 3.6, X(a0 - 0.22), T1 + 2.6, (z0 + z1) / 2, toStreet), z1 - z0 - 2, 3.6); m.layers.set(LAYER.INSIDE); caseLabels.push(m); }
      caseSpots.push({ brand: 'spring-mart', x: X(a0 - 0.22), y: T1 + 2.6, z: (z0 + z1) / 2, nx: -s, nz: 0, w: z1 - z0 - 2, h: 3.6 });
      ip(box(X(a0 - 0.2), X(a0 + 0.1), T1 + 0.6, T1 + 4.6, z0 + 0.8, z1 - 0.8), 0.25);   // (its frame, out from the flank's face, round it)
      emitters.push({ x: X(a0 - 0.6), y: T1 + 2.6, z: (z0 + z1) / 2, nx: -s, ny: 0, nz: 0, power: 0.8, reach: 14, tint: 0.6 });
    }

    // --- a slim pylon on the terrace before the hall (the metro's mark once): 白云乡's case on the face to the street,
    // 流波月's on the other (their numbers as the screens there drew)
    {
      const pa = front - 2.6, pz = zc + 8, ph = 4.8;
      props(box(X(pa) - 0.35, X(pa) + 0.35, T1, T1 + ph, pz - 0.6, pz + 0.6), 0.5);
      for (const face of [toStreet, 'z']) {
        const [cx, cz] = face === 'z' ? [X(pa), pz + 0.62] : [X(pa) - s * 0.37, pz];
        brandCase(1.0, ph - 0.6, cx, T1 + ph / 2, cz, face, AD[face === 'z' ? 'brand-pearl-moon' : 'brand-cloud-gelato'], Q.next());
      }
      glow(box(X(pa) - 0.36, X(pa) + 0.36, T1 + ph, T1 + ph + 0.05, pz - 0.61, pz + 0.61), CYAN);
      colliders.push({ x: X(pa), z: pz, r: 0.8, y0: T1 - 0.5 });
      emitters.push({ x: X(pa - 0.8), y: T1 + 3, z: pz, nx: -s, ny: 0, nz: 0, power: 0.5, reach: 8, tint: 0.7 });
    }

    // --- down: two escalators and a stair between them
    const drop = T1 - CF, run = ea1 - ea0, slope = Math.atan2(drop, run), len = Math.hypot(drop, run);
    const incl = (z0, z1, lift, thick, make) => {
      const g = new THREE.BoxGeometry(len, thick, z1 - z0).rotateZ(s < 0 ? slope : -slope)
        .translate(X((ea0 + ea1) / 2), (T1 + CF) / 2 + lift, (z0 + z1) / 2);
      make(g);
    };
    for (const [z0, z1] of [[ez0 + 0.2, ez0 + 1.4], [ez1 - 1.4, ez1 - 0.2]]) {
      incl(z0, z1, -0.45, 0.9, (g) => ip(g, 0.42));                         // the escalator's body
      for (let k = 0.4; k < len - 0.3; k += 0.42) {                          // its steps, edged with light
        const u = k / len, a = ea0 + run * u, y = T1 - drop * u;
        ig(box(X(a) - 0.02, X(a) + 0.02, y + 0.005, y + 0.03, z0 + 0.05, z1 - 0.05), DIM);
      }
      for (const z of [z0, z1]) {
        incl(z - 0.03, z + 0.03, 0.5, 0.9, (g) => inside.glow.add(g, { color: DIM, aBlink: 0 }));   // glass balustrade
        incl(z - 0.05, z + 0.05, 0.98, 0.07, (g) => ip(g, 0.2));                                   // handrail
        incl(z - 0.04, z + 0.04, 0.9, 0.03, (g) => inside.glow.add(g, { color: CYAN, aBlink: 0 })); // light beneath it
      }
    }
    const n = 24, rise = drop / n, tread = run / n;
    for (let i = 0; i < n; i++) {                                            // the stair
      const top = T1 - i * rise, a0 = ea0 + i * tread;
      ip(box(X(a0), X(a0 + tread), CF, top, ez0 + 1.6, ez1 - 1.6), 0.6);
      ig(box(X(a0) - 0.02, X(a0) + 0.02, top - 0.03, top, ez0 + 1.7, ez1 - 1.7), DIM);
    }
    floorAt(X(ea0), X(ea1), ez0, ez1, (x) => T1 - THREE.MathUtils.clamp((Math.abs(x) - ea0) / run, 0, 1) * drop, true);
    // the well round them, its glass balustrade at the hall, and walls down to the concourse ceiling
    for (const z of [ez0, ez1]) {
      ip(box(X(ea0), X(ea1), CC, T1 - 0.35, z - 0.15, z + 0.15), 0.7);
      ig(box(X(ea0), X(ea1), T1, T1 + 1.1, z - 0.02, z + 0.02), DIM);
      ig(box(X(ea0), X(ea1), T1 + 1.08, T1 + 1.12, z - 0.04, z + 0.04), CYAN);
      wall(X(ea0), X(ea1), z - 0.25, z + 0.25, CF - 0.5, HALL);
    }
    ip(box(X(ea1), X(ea1 + 0.3), CC, T1 - 0.35, ez0, ez1), 0.7);
    ig(box(X(ea1) - 0.02, X(ea1) + 0.02, T1, T1 + 1.1, ez0, ez1), DIM);
    wall(X(ea1 - 0.2), X(ea1 + 0.3), ez0, ez1, T1 - 0.5, HALL);

    // --- the concourse: a hall below the street, lit like a room, shops and machines along its walls
    floorAt(X(ca0), X(ca1), cz0, cz1, () => CF, true);
    ip(box(X(ca0), X(ca1), CF - 0.3, CF, cz0, cz1), 0.4);
    for (const [a0, a1, z0, z1] of [[ca0, ea0, cz0, cz1], [ea0, ea1, cz0, ez0], [ea0, ea1, ez1, cz1], [ea1, ca1, cz0, cz1]]) {
      ip(box(X(a0), X(a1), CC, CC + 0.3, z0, z1), 0.55);
    }
    for (const a of [ca0, ca1]) {
      if (a === ca0) ip(box(X(a) - 0.15, X(a) + 0.15, CF, CC, cz0, cz1), 0.7);   // (at ca1 the platform's doors: below)
      wall(X(a) - 0.3, X(a) + 0.3, cz0, cz1, CF - 1, CC);
    }
    // its long walls, open where a shop is set into them (openings: [a0, a1])
    const longWall = (z, openings) => {
      let a = ca0;
      for (const [o0, o1] of [...openings, [ca1, ca1]]) {
        if (o0 > a) {
          ip(box(X(a), X(o0), CF, CC, z - 0.15, z + 0.15), 0.7);
          wall(X(a), X(o0), z - 0.3, z + 0.3, CF - 1, CC);
        }
        ip(box(X(o0), X(o1), CC - 0.6, CC, z - 0.15, z + 0.15), 0.7);   // the lintel over a shop's front
        a = o1;
      }
    };
    // A small shop set into the wall at z (its room going on away from the concourse, dir), from a0 to a1:
    // a bright room, its sign over the way in, someone at work in it, and what it sells: fit (below) fills it.
    // In a fit, d is the depth in from the wall's line (below 0: out on the concourse before the shop) and y the
    // height above the floor; bx makes a box, put places goods (facing out of the shop unless turned: rot),
    // block keeps the walker out, staff says where the shopkeeper stands.
    const shop = (z, dir, a0, a1, sign, fit) => {
      const zb = z + dir * 3.4, face = dir > 0 ? '-z' : 'z', at = (d) => z + dir * d, out = dir > 0 ? Math.PI : 0;
      ip(box(X(a0), X(a1), CF - 0.3, CF, ...sorted(z, zb)), 0.5);
      ip(box(X(a0), X(a1), CC - 0.3, CC, ...sorted(z, zb)), 0.6);
      for (const a of [a0, a1]) {
        ip(box(X(a) - 0.1, X(a) + 0.1, CF, CC, ...sorted(z, zb)), 0.7);
        wall(X(a) - 0.25, X(a) + 0.25, ...sorted(z, zb), CF - 1, CC);
      }
      const c = {
        a0, a1, dir, at, out, room: CC - 0.3 - CF, staff: [(a0 + a1) / 2 - 0.5, 2.4],
        bx: (b0, b1, y0, y1, d0, d1) => box(X(b0), X(b1), CF + y0, CF + y1, ...sorted(at(d0), at(d1))),
        put: (kind, a, y, d, o = {}) => goods.put(kind, X(a), CF + y, at(d), { ...o, rot: o.rot ?? out }),
        block: (b0, b1, d0, d1) => wall(X(b0), X(b1), ...sorted(at(d0), at(d1)), CF - 1, CC),
        // the inward rot of goods on the shop's side walls, at a0 and at a1
        side: [s * Math.PI / 2, -s * Math.PI / 2],
      };
      fit(c);
      insidePeople.push({ x: X(c.staff[0]), y: CF, z: at(c.staff[1]), rot: dir > 0 ? Math.PI : 0, umbrella: false });
      floorAt(X(a0), X(a1), ...sorted(z, zb), () => CF, true);
      // (sign: an ad's number, an atlas rect of words, a function making a sign of its own, or { holo: words of
      // 'h2' } for a hologram before a band of dark glass, as the bookshop across from the station has; the
      // number of a screen still drawn for those)
      if (typeof sign === 'function') {
        Q.next();
        const m = sign(panel(a1 - a0 - 0.5, 0.56, X((a0 + a1) / 2), CC - 0.3, z - dir * 0.18, face), a1 - a0 - 0.5, 0.56, 'name', ip);
        m.layers.set(LAYER.INSIDE);
        caseLabels.push(m);
      } else if (sign.holo !== undefined) {
        Q.next();
        ip(box(X(a0 + 0.2), X(a1 - 0.2), CC - 0.62, CC - 0.0, ...sorted(z - dir * 0.12, z - dir * 0.04)), 0.12);
        for (const y of [CC - 0.62, CC]) ig(box(X(a0 + 0.2), X(a1 - 0.2), y - 0.02, y + 0.02, ...sorted(z - dir * 0.14, z - dir * 0.1)), CYAN);
        holoSigns.push({ x: X((a0 + a1) / 2), y: CC - 0.31, z: z - dir * 0.4, set: 'h2', text: sign.holo, rotY: dir > 0 ? Math.PI : 0, size: 0.62, inside: true });
      } else if (typeof sign === 'number') is(panel(a1 - a0 - 0.5, 0.56, X((a0 + a1) / 2), CC - 0.3, z - dir * 0.18, face), sign, a1 - a0 - 0.5, 0.56);
      else inside.screens.add(panel(a1 - a0 - 0.5, 0.56, X((a0 + a1) / 2), CC - 0.3, z - dir * 0.18, face),
        { aScr: [adOf(PROG.TEXT), Q.next(), a1 - a0 - 0.5, 0.56], aRect: [sign.x, sign.y, sign.z, sign.w] });
      emitters.push({ x: X((a0 + a1) / 2), y: CF + 1.8, z: z - dir * 0.6, nx: 0, ny: 0, nz: -dir, power: 0.8, reach: 10, tint: 0.2 });
      lamps.push({ x: X((a0 + a1) / 2), y: CC - 0.5, z: at(1.8), power: 0.35 });
    };
    // the parts most shops have: a counter across the room (the shopkeeper behind it), a lit back wall
    const counter = ({ bx, block }, b0, b1) => {
      ip(bx(b0, b1, 0, 1.05, 1.2, 1.8), 0.55);
      ig(bx(b0, b1, 1.05, 1.08, 1.2, 1.8), CYAN);
      block(b0, b1, 1.1, 3.4);
    };
    // (lit: from and to what height it glows; albedo: how light the rest of it is, dark behind light goods)
    const backWall = ({ a0, a1, bx, room }, lit, albedo = 0.5) => {
      if (lit) ig(bx(a0 + 0.1, a1 - 0.1, lit[0], lit[1], 3.37, 3.4), [0.85, 0.98, 1.0]);
      ip(bx(a0 + 0.1, a1 - 0.1, 0, room, 3.4, 3.43), albedo);
      ig(bx(a0 + 0.1, a1 - 0.1, room - 0.45, room - 0.4, 3.3, 3.37), PALE);
    };
    const FLOWERS = ['round', 'cupped', 'star', 'spike'];
    const bucket = (c, a, y, d) => c.put(RG.pick(FLOWERS), a, y, d, { rot: RG.range(0, 6.3), tone: RG.range(0.75, 1.05) });

    // a florist: flowers in buckets on stands stepping up to the back and out on the concourse, plants
    // hanging from the ceiling, fireflies among them all
    const florist = (c) => {
      const { a0, a1, bx, put, block, room } = c;
      backWall(c, null);
      [[2.3, 0.3], [2.7, 0.62], [3.05, 0.94]].forEach(([d, h]) => {
        ip(bx(a0 + 0.2, a1 - 0.2, 0, h, d, 3.38), 0.62);
        for (let a = a0 + 0.42; a < a1 - 0.3; a += 0.3) bucket(c, a, h, d + 0.17);
      });
      block(a0, a1, 2.2, 3.4);
      ip(bx(a0 + 0.3, a0 + 1.9, 0, 0.95, 1.0, 1.5), 0.55);                          // a small counter
      ig(bx(a0 + 0.3, a0 + 1.9, 0.95, 0.98, 1.0, 1.5), CYAN);
      put('block', a0 + 0.6, 0.98, 1.25, { scale: [0.5, 0.004, 0.35], rot: c.out + 0.2, tone: 0.9 });   // paper for wrapping
      bucket(c, a0 + 1.6, 0.98, 1.25);
      block(a0 + 0.2, a0 + 2.0, 0.9, 2.2);
      c.staff = [a0 + 1.1, 1.85];
      ip(bx(a1 - 2.3, a1 - 1.3, 0, 0.7, 1.0, 1.8), 0.6);                             // a table of bunches
      for (const [a, d] of [[a1 - 2.05, 1.2], [a1 - 1.55, 1.35], [a1 - 1.85, 1.62]]) bucket(c, a, 0.7, d);
      block(a1 - 2.4, a1 - 1.2, 0.9, 1.9);
      for (const [a, d] of [[a0 + 0.9, 0.8], [a0 + 2.6, 1.7], [a1 - 0.9, 0.6], [a1 - 2.8, 2.6], [a0 + 3.6, 0.5]]) put('hanging', a, room - 0.85 - RG.range(0, 0.3), d, { rot: RG.range(0, 6.3) });
      // out on the concourse: two steps of buckets, and a tall plant by the wall
      ip(bx(a0 + 0.25, a1 - 1.8, 0, 0.25, -1.25, -0.2), 0.62);
      ip(bx(a0 + 0.25, a1 - 1.8, 0.25, 0.5, -0.72, -0.2), 0.62);
      for (let a = a0 + 0.45; a < a1 - 1.9; a += 0.3) { bucket(c, a, 0.25, -1.0); bucket(c, a, 0.5, -0.46); }
      block(a0 + 0.2, a1 - 1.75, -1.35, 0);
      put('fern', a1 + 0.45, 0, -0.45, { rot: RG.range(0, 6.3), tone: 0.95 });
      colliders.push({ x: X(a1 + 0.45), z: c.at(-0.45), r: 0.5, y0: CF - 1, y1: CC });
      for (let i = 0; i < 60; i++) put('mote', RG.range(a0 + 0.3, a1 - 0.3), RG.range(0.5, 2.9), RG.range(-1.4, 3.2));
    };
    // umbrellas for hire (萤伞's, in the station): a rack of them along the back, their rims alight; open ones hung
    // from the ceiling by their tips, their rims lit, and fireflies about them, some brighter than others (their own
    // numbers)
    const umbrellas = (c) => {
      const { a0, a1, bx, put, room } = c;
      backWall(c, [0.3, 2.3]);
      // the rack: a rail high on the wall, the umbrellas hung from it by their handles, over the counter
      ip(bx(a0 + 0.3, a1 - 0.3, 1.93, 1.98, 3.05, 3.38), 0.35);
      ig(bx(a0 + 0.3, a1 - 0.3, 1.98, 2.0, 3.05, 3.07), PALE);
      for (let a = a0 + 0.42; a < a1 - 0.35; a += 0.13) put('umbrella', a, 1.17, 3.15, { rot: RG.pick([0, Math.PI]), roll: RG.range(-0.03, 0.03), tone: RG.range(0.5, 1) });
      for (const a of [a0 + 1.0, (a0 + a1) / 2, a1 - 1.0]) RG.range(0.7, 1);   // (the open ones once on show here; their numbers still drawn)
      {
        const RF = makeRandom(6363);
        for (const [a, d, r] of [[a0 + 0.9, 0.9, 0.42], [a0 + 2.1, 1.7, 0.36], [a1 - 1.9, 0.8, 0.4], [a1 - 0.9, 1.9, 0.34], [(a0 + a1) / 2, 2.4, 0.3]]) {
          const yb = room - 0.25 - r * 0.55, ux = X(a), uz = c.at(d);   // (its rim at yb, its tip on a wire from the ceiling)
          ip(canopyGeometry(r, r * 0.55).translate(ux, CF + yb, uz), 0.85);
          ig(rimGeometry(r, r * 0.55, 0.014).translate(ux, CF + yb, uz), [0.6, 1.7, 0.8].map((v) => v * RF.range(0.6, 1)));
          ip(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4).translate(ux, CF + room - 0.125, uz), 0.3);
        }
        for (let i = 0; i < 26; i++) ig(new THREE.SphereGeometry(0.022, 6, 4).translate(X(RF.range(a0 + 0.3, a1 - 0.3)), CF + RF.range(1.4, room - 0.5), c.at(RF.range(0.3, 3.0))), [1.0, 1.7, 0.5].map((v) => v * RF.range(0.35, 1)));
      }
      counter(c, a0 + 0.4, a1 - 1.6);
      ip(bx(a0 + 0.8, a0 + 1.2, 1.08, 1.3, 1.35, 1.6), 0.4);                         // the hire terminal
      ig(bx(a0 + 0.82, a0 + 1.18, 1.3, 1.52, 1.4, 1.43), PALE);
      // a stand of them out on the concourse, to take as one goes
      const ux = X(a0 + 0.55), uz = c.at(-0.45);
      ip(new THREE.CylinderGeometry(0.22, 0.2, 0.55, 14, 1, true).translate(ux, CF + 0.275, uz), 0.5);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r = 0.12;
        goods.put('umbrella', ux + Math.cos(a) * r, CF + 0.05, uz + Math.sin(a) * r, { rot: RG.range(0, 6.3), tilt: Math.sin(a) * 0.12, roll: -Math.cos(a) * 0.12, tone: RG.range(0.5, 1) });
      }
      colliders.push({ x: ux, z: uz, r: 0.4, y0: CF - 1, y1: CC });
    };
    // a bakery: baskets of loaves and baguettes on the shelves behind, a glass case of pastries for a counter
    // a bakery (夕光烘焙's, in the station, as its shop on the street): baskets on the shelves behind, a glass case
    // for a counter; its breads in its ink (Noto Emoji's glyphs, duskPic), standing turned to the concourse, the
    // wall behind pale; over the shelves a row of its medallions (their numbers still drawn as they were)
    const bakery = (c) => {
      const { a0, a1, bx, put, room, at, dir } = c, breads = [];
      const bread = (name, a, y, d, size) => breads.push({ pic: duskPic.glyph(name), x: (dir > 0 ? -1 : 1) * X(a), y, z: -d, s: size });
      backWall(c, null, 0.8);
      let n = 0;
      for (const y of [0.85, 1.4, 1.95]) {
        ip(bx(a0 + 0.2, a1 - 0.2, y - 0.04, y, 2.95, 3.4), 0.65);
        ig(bx(a0 + 0.2, a1 - 0.2, y - 0.06, y - 0.04, 2.95, 2.96), PALE);
        for (let a = a0 + 0.45; a < a1 - 0.3; a += 0.42) {
          put('basket', a, y, 3.18, { tone: 0.9 });
          if (y > 1.9) { for (let k = 0; k < 3; k++) RG.range(0.75, 0.95); bread('baguette', a, y + 0.02, 3.1, 0.3); }
          else for (const da of [-0.07, 0.07]) { RG.range(0, 6.3); RG.range(0.75, 0.95); bread(['bread', 'croissant', 'bagel', 'bread', 'flatbread'][n++ % 5], a + da, y + 0.03, 3.1, 0.2); }
          if (y <= 1.9) { RG.range(0, 6.3); RG.range(0.75, 0.95); }
        }
      }
      // the case: a base, glass shelves edged with light, pastries in rows, a slim frame round the glass
      const b0 = a0 + 0.4, b1 = a1 - 1.6;
      ip(bx(b0, b1, 0, 0.85, 1.2, 1.8), 0.55);
      ip(bx(b0, b1, 1.42, 1.45, 1.2, 1.8), 0.6);
      for (const a of [b0, b1]) ip(bx(a, a + (a === b0 ? 0.03 : -0.03), 0.85, 1.45, 1.2, 1.8), 0.4);
      ig(bx(b0, b1, 0.85, 0.87, 1.2, 1.21), PALE);
      for (const y of [0.87, 1.14]) {
        ig(bx(b0 + 0.03, b1 - 0.03, y, y + 0.01, 1.22, 1.78), PALE);
        for (let a = b0 + 0.15, k = 0; a < b1 - 0.1; a += 0.15, k++) {
          for (const d of [1.38, 1.6]) RG.range(-0.4, 0.4), RG.range(0.8, 1);
          bread(y > 1 ? ['bread', 'cookie', 'pie', 'waffle'][k % 4] : ['croissant', 'pretzel', 'bagel'][k % 3], a, y + 0.01, 1.5, 0.15);
        }
      }
      c.block(b0, b1, 1.1, 3.4);
      const MENU = ['croissant', 'baguette', 'bread', 'bagel', 'pretzel', 'pie', 'waffle', 'cookie', 'flatbread', 'pancakes'];
      const m0 = Math.min(7, Math.floor((a1 - a0 - 0.6) / 0.5));
      for (let k = 0; k < m0; k++) breads.push({ pic: duskPic.medal(MENU[k % MENU.length]), x: (dir > 0 ? -1 : 1) * X(a0 + 0.3 + (k + 0.5) * (a1 - a0 - 0.6) / m0), y: Math.min(2.45, room - 0.75), z: -3.38, s: 0.36 });
      const m = emojiStage(breads, { gain: 0.8 });
      m.rotation.y = dir > 0 ? Math.PI : 0; m.position.set(0, CF, at(0));
      m.layers.set(LAYER.INSIDE);
      caseLabels.push(m);
    };
    // a café: a coffee machine on the counter behind, cups warming on top, the menu above; two tables outside
    const cafe = (c) => {
      const { a0, a1, bx, put, room, at, dir } = c;
      backWall(c, null, 0.2);
      ip(bx(a0 + 0.2, a1 - 0.2, 0, 0.95, 2.85, 3.38), 0.6);
      ig(bx(a0 + 0.2, a1 - 0.2, 0.95, 0.97, 2.85, 2.86), CYAN);
      ip(bx(a0 + 0.6, a0 + 1.5, 0.97, 1.45, 2.95, 3.35), 0.85);                        // the espresso machine
      ig(bx(a0 + 0.6, a0 + 1.5, 1.3, 1.34, 2.94, 2.95), CYAN);
      for (const a of [a0 + 0.85, a0 + 1.25]) ip(bx(a - 0.05, a + 0.05, 1.08, 1.18, 2.85, 2.95), 0.3);
      for (let a = a0 + 0.7; a < a0 + 1.45; a += 0.11) put('cup', a, 1.45, 3.15, { tone: 1 });
      ip(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10).translate(X(a0 + 1.8), CF + 1.12, at(3.1)), 0.7);   // the grinder
      for (let a = a1 - 1.6; a < a1 - 0.4; a += 0.12) for (let k = 0; k < 3; k++) put('cup', a, 0.97 + k * 0.035, 3.1, { tone: 0.95 });
      const mw = a1 - a0 - 1.2;
      RG.next();                                                                 // (its board: as on the street; the number still drawn)
      const board = cafeBoard(panel(mw, 0.95, X((a0 + a1) / 2), CF + room - 0.9, at(3.36), dir > 0 ? '-z' : 'z'), mw, 0.95);
      board.layers.set(LAYER.INSIDE);
      caseLabels.push(board);
      counter(c, a0 + 0.4, a1 - 1.6);
      ip(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16).translate(X(a0 + 1.0), CF + 1.09, at(1.5)), 0.7);   // a cake stand
      ig(new THREE.TorusGeometry(0.16, 0.006, 3, 24).rotateX(Math.PI / 2).translate(X(a0 + 1.0), CF + 1.11, at(1.5)), PALE);
      put('loaf', a0 + 1.0, 1.1, 1.5, { scale: [0.8, 1.2, 1.4], tone: 0.85 });
      for (let k = 0; k < 5; k++) put('cup', a1 - 2.0, 1.08 + k * 0.03, 1.5, { tone: 1 });
      // outside, two little floating islands to sit at (as in its shop on the street: see floatIsland), a lamp on
      // one, a tree on the other (their own numbers)
      const RI = makeRandom(5800), igOwn = (g, rgb) => inside.glow.add(g, { color: rgb, aBlink: 0, aKey: -1 });
      [[a0 + 1.2, 'lamp'], [a0 + 3.4, 'tree']].forEach(([a, middle]) => {
        const tx = X(a), tz = at(-1.75);
        floatIsland(ip, igOwn, tx, CF, tz, 0.85, middle, RI);
        put('cup', a + 0.3, 0.75, -1.75, { tone: 1 });
        colliders.push({ x: tx, z: tz, r: 1.0, y0: CF - 1, y1: CC });
      });
    };
    // a bookshop: shelves of books to the ceiling on three walls, piles of them on the counter
    const bookshop = (c) => {
      const { a0, a1, bx, put, room, side } = c;
      backWall(c, null);
      const shelves = (len, at, rot) => {
        for (let y = 0.1; y < room - 0.6; y += 0.38) {
          let t = 0.03;
          while (t < len - 0.06) {
            const w = RG.range(0.018, 0.05), h = RG.range(0.17, 0.3), tone = RG.range(0.3, 1.0);
            if (t + w > len - 0.03) break;
            if (!RG.chance(0.04)) at(t + w / 2, y, { scale: [w, h, RG.range(0.13, 0.2)], rot, tone, roll: RG.chance(0.06) ? RG.range(-0.25, 0.25) : 0 });
            t += w + 0.002;
          }
        }
      };
      // the back wall's cases, and those down both sides
      for (let y = 0.1; y < room - 0.6; y += 0.38) {
        ip(bx(a0 + 0.1, a1 - 0.1, y - 0.03, y, 3.05, 3.4), 0.6);
        for (const [b0, b1] of [[a0 + 0.1, a0 + 0.45], [a1 - 0.45, a1 - 0.1]]) ip(bx(b0, b1, y - 0.03, y, 0.3, 3.05), 0.6);
      }
      shelves(a1 - a0 - 0.2, (t, y, o) => put('block', a0 + 0.1 + t, y, 3.25, o), c.out);
      shelves(2.7, (t, y, o) => put('block', a0 + 0.28, y, 0.35 + t, o), side[0]);
      shelves(2.7, (t, y, o) => put('block', a1 - 0.28, y, 0.35 + t, o), side[1]);
      counter(c, a0 + 0.7, a1 - 1.6);
      for (let a = a0 + 0.9; a < a1 - 1.9; a += 0.32) {                              // piles of new books
        let y = 1.08;
        for (let k = RG.int(2, 6); k > 0; k--) {
          const h = RG.range(0.025, 0.045);
          put('block', a, y, 1.5, { scale: [0.17, h, 0.24], rot: c.out + RG.range(-0.15, 0.15), tone: RG.range(0.4, 1) });
          y += h;
        }
      }
      ig(bx(a1 - 2.0, a1 - 1.75, 1.08, 1.5, 1.45, 1.47), PALE);                       // a reading lamp
    };
    // A machine against the wall at z (facing away from it), centred at a: w wide, h high, its front an ad. (The
    // capsule, blind-box and card machines are 喵星杂货's: its yellow, two cat's ears on top, an LED front of many
    // animals' faces in tiles turning over one after another, meowLED 'flip'; the number a screen there drew still drawn)
    // (The drinks machines are 春晴便利店's: pale, its sign along the top as over its shop, a window below it, lit,
    // its shelves of what its shop's shelves have (their own numbers), a slot for them at the foot, its buttons)
    const MEOW = { [AD.gacha]: 'gacha', [AD['blind-box']]: 'box', [AD['card-draw']]: 'cards' };
    const RV = makeRandom(6464), VEND = [['bottle', 'can'], ['carton', 'bottle'], ['snack', 'noodle'], ['can', 'bottle', 'carton']];
    const machine = (z, dir, a, w, h, ad, fh = h * 0.8) => {
      const z0 = z - dir * 0.15, z1 = z - dir * 0.95, meow = MEOW[ad];
      if (ad === AD.vending) {
        const [b0, b1] = sorted(z0, z1), fz = z1, out = dir > 0 ? Math.PI : 0, wa = a - w / 2 + 0.08, wb = a + w / 2 - 0.22;
        const shell = (y0, y1) => ip(box(X(a - w / 2), X(a + w / 2), CF + y0, CF + y1, b0, b1), 0.85);
        shell(0, 0.62); shell(h - 0.36, h);                                                    // its foot and its head
        ig(box(X(wa), X(wb), CF + 0.62, CF + h - 0.36, ...sorted(z0, z0 - dir * 0.08)), [0.55, 0.68, 0.74]);   // its back, lit
        for (const e of [a - w / 2, a + w / 2]) ip(box(X(e) - 0.04, X(e) + 0.04, CF + 0.62, CF + h - 0.36, b0, b1), 0.85);
        ip(box(X(wb + 0.02), X(a + w / 2), CF + 0.62, CF + h - 0.36, ...sorted(fz, fz + dir * 0.1)), 0.85);   // the buttons' panel
        for (let k = 0; k < 6; k++) ig(box(X(wb + 0.08) - 0.03, X(wb + 0.08) + 0.03, CF + 0.8 + k * 0.17, CF + 0.84 + k * 0.17, ...sorted(fz - dir * 0.005, fz)), [0.5, 1.4, 0.9]);
        ip(box(X(a - w / 2 + 0.15), X(wb - 0.05), CF + 0.18, CF + 0.42, ...sorted(fz - dir * 0.005, fz + dir * 0.12)), 0.1);   // the slot
        ig(box(X(wa), X(wb), CF + h - 0.39, CF + h - 0.37, ...sorted(fz + dir * 0.05, fz + dir * 0.1)), [1.1, 1.2, 1.2]);     // its light
        const ys = [0.66, 0.9, 1.14, 1.38].filter((y) => y < h - 0.6);
        ys.forEach((y, k) => {
          ip(box(X(wa), X(wb), CF + y - 0.015, CF + y, ...sorted(fz + dir * 0.05, z0 - dir * 0.1)), 0.7);
          ig(box(X(wa), X(wb), CF + y - 0.03, CF + y - 0.015, ...sorted(fz + dir * 0.05, fz + dir * 0.06)), [0.5, 0.75, 0.8]);
          const kinds = VEND[k % VEND.length];
          for (let t = wa + 0.05; t < wb - 0.04;) {
            const kind = RV.pick(kinds), wd = { bottle: 0.075, can: 0.072, carton: 0.082, snack: 0.165, noodle: 0.12 }[kind];
            if (t + wd > wb - 0.02) break;
            goods.put(kind, X(t + wd / 2), CF + y, fz + dir * 0.3, { rot: out, tone: RV.pick([0.32, 0.55, 0.8, 1.0]), pick: RV.next() });
            t += wd + 0.01;
          }
        });
        // its sign along its head, as over its shop (springSign; the number the screen there drew still drawn)
        Q.next();
        const sm = springSign(panel(w - 0.12, 0.26, X(a), CF + h - 0.18, fz - dir * 0.01, dir > 0 ? '-z' : 'z'), w - 0.12, 0.26);
        sm.layers.set(LAYER.INSIDE); caseLabels.push(sm);
      } else if (meow) {
        const YELLOW = new THREE.Color('#ffd166').toArray();
        inside.props.add(box(X(a - w / 2), X(a + w / 2), CF, CF + h, ...sorted(z0, z1)), { aAlbedo: 0.85, aTint: YELLOW });
        for (const e of [-1, 1]) inside.props.add(new THREE.ConeGeometry(w * 0.13, 0.24, 4).rotateY(Math.PI / 4).scale(1, 1, 0.5).translate(X(a + e * w * 0.3), CF + h + 0.12, (z0 + z1) / 2), { aAlbedo: 0.85, aTint: YELLOW });
        Q.next();
        const m = meowLED(panel(w - 0.14, fh, X(a), CF + h - fh / 2 - 0.08, z1 - dir * 0.01, dir > 0 ? '-z' : 'z'), w - 0.14, fh, a * 0.37 + meow.length,
          BRANDS.find((b) => b.key === 'meow-store'), { layout: 'flip', fine: 70 });
        m.layers.set(LAYER.INSIDE);
        caseLabels.push(m);
      } else {
      ip(box(X(a - w / 2), X(a + w / 2), CF, CF + h, ...sorted(z0, z1)), 0.45);
      is(panel(w - 0.14, fh, X(a), CF + h - fh / 2 - 0.08, z1 - dir * 0.01, dir > 0 ? '-z' : 'z'), ad, w - 0.14, fh);
      }
      ig(box(X(a - w / 2), X(a + w / 2), CF + h, CF + h + 0.04, ...sorted(z0, z1)), CYAN);
      wall(X(a - w / 2), X(a + w / 2), ...sorted(z0, z1 - dir * 0.2), CF - 1, CC);
      emitters.push({ x: X(a), y: CF + h * 0.6, z: z1 - dir * 0.3, nx: 0, ny: 0, nz: -dir, power: 0.45, reach: 5, tint: 0.5 });
    };
    const h2 = (t) => atlas.rects.h2[S2[t]];
    // the north wall: ticket machines, a convenience store, drinks; past the gates a bakery, drinks, gacha
    longWall(cz1, [[front + 10.6, front + 15.6], [front + 16.5, front + 21.5], [front + 29, front + 34]]);
    for (let i = 0; i < 4; i++) {
      const a = front + 5.2 + i * 1.4;
      ip(box(X(a - 0.6), X(a + 0.6), CF, CF + 1.9, cz1 - 0.95, cz1 - 0.15), 0.5);
      ig(box(X(a - 0.42), X(a + 0.42), CF + 1.0, CF + 1.6, cz1 - 0.97, cz1 - 0.95), STRIP);
    }
    wall(X(front + 4.4), X(front + 10.2), cz1 - 1.1, cz1, CF - 1, CC);
    shop(cz1, 1, front + 10.6, front + 15.6, floristSign, florist);
    // (萤伞's sign: its umbrellas drifting up as jellyfish along an LED strip, its name at the end, as on the street)
    shop(cz1, 1, front + 16.5, front + 21.5, (g, w, h) => umbrellaLED(w, h, X(front + 19), CC - 0.3, cz1 - 0.18, '-z', BRANDS.find((b) => b.key === 'glow-umbrella'), {}), umbrellas);
    machine(cz1, 1, front + 22.4, 1.1, 2.0, AD.vending);
    machine(cz1, 1, front + 23.7, 1.1, 2.0, AD.vending);
    // (夕光烘焙's sign: its name and its breads on its yellow-green, as on the street: dawnPanel)
    shop(cz1, 1, front + 29, front + 34, (g, w, h) => dawnPanel(w, h, X(front + 31.5), CC - 0.3, cz1 - 0.18, '-z', BRANDS.find((b) => b.key === 'dawn-bakery'), 'sign'), bakery);
    machine(cz1, 1, front + 35.3, 1.1, 2.0, AD.vending);
    machine(cz1, 1, front + 36.6, 0.85, 1.55, AD.gacha, 1.0);
    machine(cz1, 1, front + 37.6, 0.85, 1.55, AD.gacha, 1.0);
    // the south wall: gacha, the line's map, a café, a card machine; past the gates blind boxes, cards, flowers
    longWall(cz0, [[front + 18, front + 23], [front + 33, front + 38]]);
    for (const a of [front + 5.2, front + 6.2, front + 7.2]) machine(cz0, -1, a, 0.85, 1.55, AD.gacha, 1.0);
    // (over the capsule machines, where the line's map was: 喵星杂货's case of blind boxes on shelves; its number still drawn)
    brandCase(6.8, 2.1, X(front + 8.5), CF + 2.98, cz0 + 0.15, 'z', AD['brand-meow-store'], Q.next(), 'meow-store');
    shop(cz0, -1, front + 18, front + 23, cafeSign, cafe);
    machine(cz0, -1, front + 24.2, 1.0, 1.8, AD['card-draw'], 1.0);
    machine(cz0, -1, front + 29.2, 2.4, 2.0, AD['blind-box'], 1.6);
    machine(cz0, -1, front + 31.3, 1.0, 1.8, AD['card-draw'], 1.0);
    shop(cz0, -1, front + 33, front + 38, { holo: S2['光合书店 BOOKS'] }, bookshop);
    machine(cz0, -1, front + 39.4, 1.1, 2.0, AD.vending);
    // two columns of ads in the middle, and a great screen on the wall facing the way down (the columns' ads as the
    // street's: each a case of its brand's own (brandCase), where it has one; a screen where not)
    for (const z of [zc + 8.5, zc - 6.5]) {
      const a = front + 12;
      ip(box(X(a - 0.4), X(a + 0.4), CF, CC, z - 0.4, z + 0.4), 0.6);
      colliders.push({ x: X(a), z, r: 0.7, y0: CF - 1, y1: CC });
      for (const f of [-1, 1]) {
        const face = f * s < 0 ? '-x' : 'x', ad = alive(Q.pick(BRAND_ADS)), seed = Q.next(), px = X(a + f * 0.42);
        if (cases && SCENES[ADS[ad].brand]) brandCase(0.7, 2.6, px, CF + 1.7, z, face, ad, seed);
        else inside.screens.add(panel(0.7, 2.6, px, CF + 1.7, z, face), { aScr: [ad, seed, 0.7, 2.6], aRect: [0, 0, 0, 0] });
      }
    }
    is(panel(9, 2.4, X(ca0 + 0.17), CF + 2.2, zc + 2, fromStreet), adOf(PROG.RIBBONS), 9, 2.4);
    // lines of light in the floor from the foot of the escalators to the gates and on beyond
    for (const z of [zc + 0.6, zc + 1.4]) {
      ig(box(X(ea1 + 0.3), X(gate - 1), CF, CF + 0.015, z - 0.03, z + 0.03), CYAN);
      ig(box(X(gate + 1), X(ca1 - 2), CF, CF + 0.015, z - 0.03, z + 0.03), CYAN);
    }
    // the ceiling: big light panels in rows, and its lamps
    for (let a = ca0 + 1.5; a < ca1 - 1; a += 3) {
      for (let z = cz0 + 2; z < cz1 - 1; z += 3) {
        if (a > ea0 - 1 && a < ea1 + 1 && z > ez0 - 1 && z < ez1 + 1) continue;
        ig(box(X(a - 1.1), X(a + 1.1), CC - 0.05, CC - 0.01, z - 0.5, z + 0.5), [1.25, 1.35, 1.35]);
      }
    }
    for (const [a, z] of [[front + 9, zc - 6], [front + 9, zc + 8], [front + 16, zc - 6], [front + 16, zc + 8], [front + 23, zc - 4], [front + 23, zc + 6], [front + 31, zc - 5], [front + 31, zc + 7], [front + 38, zc + 1]]) {
      lamps.push({ x: X(a), y: CC - 0.2, z, power: 0.5 });
    }
    // the gates: a row of cabinets, lit on top, glass flaps closed between them
    for (let z = cz0 + 0.9; z <= cz1 - 0.9; z += 1.15) {
      ip(box(X(gate - 0.8), X(gate + 0.8), CF, CF + 1.0, z - 0.11, z + 0.11), 0.55);
      ig(box(X(gate - 0.8), X(gate + 0.8), CF + 1.0, CF + 1.04, z - 0.11, z + 0.11), CYAN);
      ig(box(X(gate - 0.82), X(gate - 0.8), CF + 0.75, CF + 0.95, z - 0.08, z + 0.08), STRIP);
      if (z + 1.15 <= cz1 - 0.9) ig(box(X(gate) - 0.02, X(gate) + 0.02, CF + 0.45, CF + 0.95, z + 0.12, z + 1.03), DIM);
    }
    wall(X(gate - 0.9), X(gate + 0.9), cz0, cz1, CF - 1, CC);
    // beyond them: benches, people waiting, the way to the trains, the station's name on the far wall
    for (const z of [zc - 2, zc + 4]) {
      ip(box(X(front + 32), X(front + 35), CF + 0.42, CF + 0.5, z - 0.25, z + 0.25), 0.8);
      ip(box(X(front + 32.2), X(front + 34.8), CF, CF + 0.42, z - 0.15, z + 0.15), 0.4);
    }
    for (let i = 0; i < 6; i++) insidePeople.push({ x: X(Q.range(gate + 2, ca1 - 2)), y: CF, z: Q.range(cz0 + 2, cz1 - 2), rot: Q.range(0, 6.28), umbrella: false });
    for (let i = 0; i < 4; i++) insidePeople.push({ x: X(Q.range(ea1 + 1, gate - 2)), y: CF, z: Q.range(cz0 + 2, cz1 - 2), rot: Q.range(0, 6.28), umbrella: false });
    // (the way's board over the gates, both faces, gone: the hologram 列车即将到站 where it was; their numbers still
    // drawn)
    Q.next(); Q.next();
    // --- the platform, past the gates (no trains yet): the concourse's far end a wall of platform screen doors, glass
    // from the floor to a dark header, as Shanghai's are: fixed panels and pairs of sliding doors between steel posts,
    // a light over each door, a line of light along the floor before them; through the glass the track in its
    // trench, sleepers and rails, the tunnel's far wall with dim lamps along it, running on past both ends
    // (the line's map and the two ads once on that wall: their numbers still drawn)
    Q.next();
    for (let i = 0; i < 2; i++) { alive(Q.pick(BRAND_ADS)); Q.next(); }
    {
      const pa = ca1 - 0.25, tw = 5.0, TF = CF - 1.3, HD = CC - 0.55, L0 = cz0 - 8, L1 = cz1 + 8;
      const glassM = new THREE.MeshBasicMaterial({ color: 0x86bcd8, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });   // (pale, as the concourse)
      const pane = (z0, z1, y0, y1) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0).rotateY(Math.PI / 2).translate(X(pa), (y0 + y1) / 2, (z0 + z1) / 2), glassM);
        m.layers.set(LAYER.INSIDE); caseLabels.push(m);
      };
      const post = (z) => ip(box(X(pa) - 0.06, X(pa) + 0.06, CF, HD, z - 0.05, z + 0.05), 0.75);
      ip(box(X(pa) - 0.12, X(pa) + 0.12, HD, CC, cz0, cz1), 0.72);                             // the header
      ig(box(X(pa - 0.13) - 0.01, X(pa - 0.13) + 0.01, HD + 0.03, HD + 0.06, cz0, cz1), CYAN);
      ig(box(X(pa - 0.55) - 0.05, X(pa - 0.55) + 0.05, CF, CF + 0.012, cz0 + 0.3, cz1 - 0.3), CYAN);   // the line on the floor
      const unit = 4.4, nU = Math.floor((cz1 - cz0 - 0.2) / unit), zs = cz0 + (cz1 - cz0 - nU * unit) / 2;
      post(cz0 + 0.05); post(cz1 - 0.05);
      pane(cz0, zs, CF, HD); pane(zs + nU * unit, cz1, CF, HD);
      for (let i = 0; i < nU; i++) {
        const u0 = zs + i * unit, d0 = u0 + 1.2, d1 = d0 + 2.0, u1 = u0 + unit;
        for (const z of [u0, d0, d1, u1]) post(z);
        pane(u0, d0, CF, HD); pane(d1, u1, CF, HD);                                            // the fixed panels
        pane(d0, d1, CF, CF + 2.3);                                                            // the doors' glass
        ip(box(X(pa) - 0.04, X(pa) + 0.04, CF + 2.3, HD, d0, d1), 0.78);                       // over them
        ip(box(X(pa) - 0.03, X(pa) + 0.03, CF, CF + 2.3, (d0 + d1) / 2 - 0.015, (d0 + d1) / 2 + 0.015), 0.6);   // the seam
        for (const y of [CF + 0.04, CF + 2.27]) ip(box(X(pa) - 0.035, X(pa) + 0.035, y - 0.03, y + 0.03, d0, d1), 0.6);
        ig(box(X(pa - 0.14) - 0.01, X(pa - 0.14) + 0.01, CF + 2.4, CF + 2.48, d0 + 0.75, d1 - 0.75), [0.4, 1.4, 0.8]);   // a light over the door
      }
      // the trench: its floor, the platform's edge, sleepers and rails; the tunnel's far wall and its roof, its ends
      const t0 = ca1 + 0.15, t1 = ca1 + tw, mid = ca1 + tw / 2;
      ip(box(X(t0), X(t1), TF - 0.2, TF, L0, L1), 0.25);
      ip(box(X(ca1 - 0.15), X(t0), TF, CF, L0, L1), 0.3);
      ip(box(X(t1), X(t1 + 0.3), TF, CC + 0.3, L0, L1), 0.16);                                // (dark: the tunnel)
      ip(box(X(ca1), X(t1 + 0.3), CC, CC + 0.3, L0, L1), 0.12);
      for (const z of [L0, L1]) ip(box(X(ca1), X(t1), TF, CC, z - 0.15, z + 0.15), 0.1);
      for (const r of [-0.72, 0.72]) ip(box(X(mid + r) - 0.04, X(mid + r) + 0.04, TF, TF + 0.17, L0, L1), 0.85);
      for (let z = L0 + 0.3; z < L1; z += 0.65) ip(box(X(mid - 1.2), X(mid + 1.2), TF, TF + 0.08, z - 0.12, z + 0.12), 0.35);
      for (let z = L0 + 2; z < L1 - 1; z += 3.5) ig(box(X(t1) - 0.02, X(t1) + 0.02, CC - 1.0, CC - 0.92, z - 0.6, z + 0.6), [0.7, 0.8, 0.8]);
      ig(box(X(t1) - 0.02, X(t1) + 0.02, CF + 0.55, CF + 0.59, L0, L1), DIM);
    }

    // --- floating holographic signs, the kind the metro uses, inside and around it
    const faceIn = s < 0 ? Math.PI / 2 : -Math.PI / 2;    // turned to face someone walking in, away from the street
    holoSigns.push(
      { x: X(gate - 1.6), y: CC - 0.75, z: zc + 1, set: 'h2', text: S2['列车即将到站'], rotY: faceIn, inside: true, size: 0.8 },   // (where the way's board was, its size)
      // for those coming out: welcome; for those going in, the station's name
      { x: X(front - 1.5), y: T1 + 3.4, z: zc - 1, set: 'h2', text: S2['欢迎来到星港'], back: S2['星港南 STAR PORT SOUTH'], rotY: -faceIn },
    );
  }

  // ---------------------------------------------------------------- the shops along the street

  // Twelve shops in the towers' ground floors along the first stretch, from the start to the first crossing,
  // each named in SHOPS (at the top). The tower's glass is opened there (toon.js uCuts) and the shop built behind; on the pavement before it, a
  // sculpture of what it sells. Their insides are drawn only from near enough (interiors), all of them as one.
  // (their insides kept by stretch of street, 400 m or so each; drawn in lots of 100 m, each only near it)
  const shopIns = new Map();
  let shopIn = null;
  const RSH = makeRandom(2024);
  const cuts = [];
  const lighter = (hex, k = 0.55) => { const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k); return c.toArray(); };

  function streetShops() {
    for (const spec of SHOPS) {
      const zc = (spec.z0 + spec.z1) / 2;
      const plot = plots.find((p) => p.s === spec.s && p.zB < zc && zc < p.zA);
      if (!plot) continue;
      streetShop(spec, plot.face);
    }
    brandAds();
    antSculpture();
    officeTrees();
    // The towers' (and podiums') blocks that stand in the way of the shops: each cut back to behind them where
    // they are, whole along the rest of its street face.
    const D = 8;
    for (const c of [...colliders]) {
      if (c.r !== undefined || c.y0 !== undefined) continue;
      const s = c.x0 > 0 ? 1 : -1, face = s > 0 ? c.x0 : -c.x1;
      const here = SHOPS.filter((sh) => sh.s === s && sh.z0 >= c.z0 - 0.5 && sh.z1 <= c.z1 + 0.5
        && plots.some((p) => p.s === s && Math.abs(p.face - face) < 0.6 && p.zB < sh.z1 && sh.z0 < p.zA));
      if (!here.length || face < FACADE - 0.5 || face > 30) continue;
      colliders.splice(colliders.indexOf(c), 1);
      boxCollider(s * (face + D - 0.3), s > 0 ? c.x1 : c.x0, c.z0, c.z1);
      let z = c.z0;
      for (const sh of [...here].sort((a, b) => a.z0 - b.z0)) {
        if (sh.z0 > z) boxCollider(s * face, s * (face + D), z, sh.z0);
        z = sh.z1;
      }
      if (c.z1 > z) boxCollider(s * face, s * (face + D), z, c.z1);
    }
    cuts.slice(0, 16).forEach((c, i) => shared.uCuts.value[i].set(...c));
    shared.uCutN.value = Math.min(cuts.length, 16);
  }

  // A shop's own ad on its tower, near it but not over it: high on the street face, above the great screens there,
  // off to one side of the shop (dz: from the shop's middle along the street); a case w x h, its own numbers
  function brandAds() {
    // (by: the shop it is by, dz along the street from it; or at: [side, z]; w x h; its numbers; the ad shown and its
    // scene; y0: no lower than. By 星环旅行's shop (the noodle shop's once), high on its tower, 光合书店's 往昔之信; past the crossing at -720,
    // on the left, 流萤花园's bouquet, moved there from high up the side street, where it could not be seen)
    for (const e of [
      { by: 'star-ring', dz: 13, w: 11, h: 6.2, seed: 5920, shows: 'photon-books', scene: 'wangxi', y0: 16 },
      { at: [-1, -742], w: 9, h: 10, seed: 5930, shows: 'firefly-garden', scene: 'firefly-bouquet', y0: 8 },
      // (and 月台电影's, from the top of the tower over the metro's way down to the next one, just over 浮岛咖啡's
      // scrolling strip there: as large as it was, its own numbers)
      ...(heldAds['moon-cinema'] ? [{ at: [-1, -34.99], w: heldAds['moon-cinema'].w, h: heldAds['moon-cinema'].h, seed0: heldAds['moon-cinema'].seed, shows: 'moon-cinema', scene: 'moon-cinema-bright', y: 24.85 }] : []),
    ]) {
      const sh = e.by ? SHOPS.find((q) => q.brand === e.by) : null, side = sh ? sh.s : e.at[0], { w, h } = e;
      const zc = sh ? (sh.z0 + sh.z1) / 2 + e.dz : e.at[1];
      const plot = plots.find((p) => p.s === side && p.zB < zc - w / 2 - 1 && zc + w / 2 + 1 < p.zA);
      if (!plot) continue;
      const X = (q) => side * q, a = plot.front - (plot.info?.out || 0), y0 = e.y ?? Math.max(plot.hung + 2, e.y0);   // (clear of its fins or balconies; y: just there)
      if (y0 + h > plot.top - 3) continue;
      props(box(X(a - 0.28), X(a), y0 - 0.25, y0 + h + 0.25, zc - w / 2 - 0.25, zc + w / 2 + 0.25), 0.45);
      adPanel(w, h, X(a - 0.31), y0 + h / 2, zc, side < 0 ? 'x' : '-x', AD[`brand-${e.shows}`], e.seed0 ?? makeRandom(e.seed).next(), e.scene);
      emitters.push({ x: X(a - 0.5), y: y0 + h / 2, z: zc, nx: -side, ny: 0, nz: 0, power: 1.0, reach: 30, tint: 0.5 });
    }
  }
  function streetShop({ s, z0: za, z1: zb, kind, brand, statue: statueAt = 'curb' }, face) {
    {
      const key = Math.round((za + zb) / 2 / 400);
      if (!shopIns.has(key)) shopIns.set(key, { props: new Bin(), goods: new Goods(), zs: [] });
      shopIn = shopIns.get(key);
      shopIn.zs.push((za + zb) / 2);
    }
    const X = (a) => s * a, Q = RSH, F = CURB, CEIL = 3.55, D = 8, zc = (za + zb) / 2, W = zb - za;
    shopSpots.push({ brand, kind, s, za, zb, face, depth: D });
    const toStreet = s < 0 ? 'x' : '-x', faceStreet = -s * Math.PI / 2;
    const B = BRANDS.find((b) => b.key === brand);
    const wallTint = kind === 'diner' ? new THREE.Color('#353c66').toArray() : kind === 'concert' ? new THREE.Color('#2b3550').toArray() : lighter(B.color, 0.55), floorTint = ['cafe', 'bakery', 'books', 'diner', 'concert'].includes(kind) ? TINT.wood : lighter(B.color, 0.75);
    const WARM = [1.15, 1.25, 1.25], PALE = [0.9, 1.25, 1.3], DIM = [0.25, 0.5, 0.55];
    // in the shop: b is the depth in from its front, y the height above its floor
    const ip = (g, albedo, tint = [0, 0, 0]) => shopIn.props.add(g, { aAlbedo: albedo, aTint: tint });
    const bx = (b0, b1, y0, y1, c0, c1) => box(X(face + b0), X(face + b1), F + y0, F + y1, c0, c1);
    const shownIn = shown;   // (lights in the shop that keep their own colour in every mode)
    const put = (k, b, y, z, o = {}) => shopIn.goods.put(k, X(face + b), F + y, z, { ...o, rot: o.rot ?? faceStreet });
    const block = (b0, b1, c0, c1) => wall(X(face + b0), X(face + b1), c0, c1, -1, CEIL);
    const counter = (b0, b1, c0, c1, tint = TINT.darkWood) => {
      ip(bx(b0, b1, 0, 1.02, c0, c1), 0.6, tint);
      glow(bx(b0, b1, 1.02, 1.04, c0, c1), CYAN);
      block(b0 - 0.1, b1 + 0.1, c0 - 0.1, c1 + 0.1);
    };
    const table = (b, z, chairs = 2) => {
      ip(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16).translate(X(face + b), F + 0.74, z), 0.85, TINT.wood);
      ip(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(X(face + b), F + 0.37, z), 0.4);
      for (let i = 0; i < chairs; i++) {
        const a = (i / chairs) * Math.PI * 2 + 0.6, sb = b + Math.cos(a) * 0.65, sz = z + Math.sin(a) * 0.65;
        ip(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12).translate(X(face + sb), F + 0.46, sz), 0.75, wallTint);
        ip(new THREE.CylinderGeometry(0.025, 0.025, 0.44, 6).translate(X(face + sb), F + 0.22, sz), 0.4);
      }
      colliders.push({ x: X(face + b), z, r: 0.9, y0: -1, y1: CEIL });
    };
    const menu = (w, h, z, y = 2.5) => screenAd(panel(w, h, X(face + D - 0.18), F + y, z, toStreet), AD[`brand-${brand}`], w, h, Q.next());
    const shelves = (b0, b1, c0, c1, ys, fill) => {          // shelves against a wall, and what is on them
      for (const y of ys) { ip(bx(b0, b1, y - 0.03, y, c0, c1), 0.7, TINT.wood); fill(y); }
      block(b0, b1, c0, c1);
    };

    // the glass opened, the room: floor, ceiling with its lights, walls tinted in the brand's colour
    cuts.push([...sorted(X(face - 0.4), X(face + D)), za, zb]);
    ip(bx(0, D, -0.05, 0.01, za, zb), 0.5, floorTint);
    ip(bx(0.1, D, CEIL, CEIL + 0.1, za, zb), 0.75);
    ip(bx(D - 0.12, D, 0, CEIL, za, zb), 0.55, wallTint);
    for (const z of [za, zb]) ip(bx(0, D, 0, CEIL, z - 0.08, z + 0.08), 0.6, wallTint);
    if (kind !== 'diner' && kind !== 'concert') for (let b = 1.2; b < D - 0.5; b += 2.2) glow(bx(b - 0.5, b + 0.5, CEIL - 0.04, CEIL, za + 0.8, zb - 0.8), WARM);   // (时雨餐厅 dim: its own lamps)
    covers.push({ ...xzBox(X(face), X(face + D), za, zb), y: F + CEIL, room: true });
    boxCollider(X(face + D - 0.2), X(face + D + 0.4), za, zb);
    for (const z of [za, zb]) wall(X(face), X(face + D), z - 0.2, z + 0.2, -1, CEIL);
    lamps.push({ x: X(face + D / 2), y: F + CEIL - 0.1, z: zc, power: kind === 'diner' || kind === 'concert' ? 0.2 : 0.6 });
    emitters.push({ x: X(face - 0.5), y: F + 2.0, z: zc, nx: -s, ny: 0, nz: 0, power: 0.75, reach: 12, tint: 0.2 });
    // the glass front: slim mullions, a kerb, a dark transom, the door in the middle
    const door = [zc - 1.1, zc + 1.1];
    const n = Math.max(2, Math.round(W / 2.2));
    for (let i = 0; i <= n; i++) {
      const z = za + 0.1 + (W - 0.2) * i / n;
      if (z > door[0] - 0.05 && z < door[1] + 0.05) continue;
      props(box(X(face) - 0.05, X(face) + 0.05, F, F + CEIL, z - 0.04, z + 0.04), 0.3);
    }
    props(box(X(face) - 0.08, X(face) + 0.08, F + CEIL, F + 3.9, za, zb), 0.25);
    glow(box(X(face) - 0.09, X(face) + 0.09, F + CEIL - 0.03, F + CEIL, za, zb), DIM);
    for (const [c0, c1] of [[za, door[0]], [door[1], zb]]) {
      props(box(X(face) - 0.06, X(face) + 0.06, F, F + 0.2, c0, c1), 0.3);
      wall(X(face - 0.2), X(face + 0.2), c0, c1, -1, CEIL);
    }
    slidingDoor(X(face + 0.12), door[0], door[1], F, F + 2.7);
    // 时雨餐厅's windows fogged, rain on them, its name written in the fog on the one before the door
    if (brand === 'night-lamp-diner') {
      for (const [c0, c1, named] of [[za + 0.12, door[0] - 0.05, s > 0], [door[1] + 0.05, zb - 0.12, s < 0]]) {
        caseLabels.push(rainWindow(c1 - c0, CEIL - 0.25, X(face) - s * 0.03, F + 0.2 + (CEIL - 0.25) / 2, (c0 + c1) / 2, toStreet, B, { glass: true, name: named }));
      }
    }
    // The signs of the shops that have their own (THEME): LED dots in their colour, a light all round the edge, on
    // the dots, crisp: 'name' (the name, the brand's marks either side of it by turns, mirrored about the middle),
    // 'icon' (its mark, small in the middle), 'menu' (no words: each flavour's mark in its own colour, as many as
    // there are left of it, the rest faint). 白云乡: pale pink, white, clouds and ice creams (Google's);
    // 流波月: night blue, moonlight cream, the moon in its phases, cups of tea. (白云乡's own ice cream, on
    // the tower's blade sign over it: see plot)
    const turnTo = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };
    const THEMES = {
      'cloud-gelato': { low: [1.0, 0.6, 0.74], deep: [0.62, 0.3, 0.42], bg: [0.06, 0.03, 0.045], ink: '#ffffff', shade: 'rgba(70, 10, 40, 0.75)', rim: [1.7, 1.85, 1.9],
        font: () => `400 X ${caseFonts.round}`, refont: 'round', mark: 'material/icecream',   // (in its round hand, which may be changed)
        side: (k) => (k % 2 ? ['material/icecream'] : ['material/cloud']),
        stock: [['#ff8fb3', 5], ['#ffc4d8', 3], ['#fff1d6', 4], ['#e9c08a', 1], ['#a8d8a0', 5], ['#ffd27a', 2]] },
      'pearl-moon': { low: [0.2, 0.2, 0.55], deep: [0.14, 0.13, 0.38], bg: [0.02, 0.02, 0.06], ink: '#fff3d6', shade: 'rgba(10, 5, 40, 0.8)', rim: [1.6, 1.4, 0.95],
        font: () => `400 X ${caseFonts.round}`, refont: 'round', mark: 'material/bedtime',   // (in its round hand, which may be changed)
        side: (k) => [['material/bedtime', true], ['full'], ['material/bedtime']][k % 3],
        stock: [['#d9b38c', 5], ['#b99ad9', 3], ['#a8d8a0', 4], ['#8a5a3c', 2], ['#ffb3a0', 5], ['#f5f0dc', 1]], cup: 'material/emoji_food_beverage' },
    };
    const theme = THEMES[brand];
    // (a mark, or the full moon, drawn at (cx, cy); flip: mirrored)
    const mark = (g, [name, flip], cx, cy, size, fill) => {
      if (name === 'full') { g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, size * 0.36, 0, Math.PI * 2); g.fill(); return; }
      if (flip) { g.save(); g.translate(cx, cy); g.scale(-1, 1); drawIcon(g, name, 0, 0, size, fill); g.restore(); } else drawIcon(g, name, cx, cy, size, fill);
    };
    const shopSign = (w, h, x, y, z, fc, what) => {
      const T = theme;
      caseLabels.push(ledPicture(panel(w, h, x, y, z, fc), w, h, (g, Wc, Hc) => { g.fillStyle = '#808080'; g.fillRect(0, 0, Wc, Hc); },
        { low: what === 'menu' ? T.deep : T.low, high: [1.95, 1.85, 1.9], bg: T.bg, density: Math.max(22, 90 / w) }));   // (finer dots on a small one)
      const turn = turnTo[fc], nx = Math.sin(turn), nz = Math.cos(turn);
      const over = (pw, ph, draw) => {
        const m = canvasPlane(new THREE.PlaneGeometry(pw, ph).rotateY(turn).translate(x + nx * 0.015, y, z + nz * 0.015), pw / ph, true, draw, 512);
        caseLabels.push(m);
        return m;
      };
      const shade = (g) => { g.shadowColor = T.shade; g.shadowBlur = 12; };
      if (what === 'name') {
        const m = over(w * 0.96, h * 0.8, (g, Wc, Hc) => {
        shade(g); g.fillStyle = T.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (typeof T.font === 'function' ? T.font() : T.font).replace('X', `${Hc * 0.7}px`);
        const name = [...B.name].join(String.fromCharCode(8202)), tw = Math.min(g.measureText(name).width, Wc * 0.6);
        g.fillText(name, Wc / 2, Hc * 0.54, Wc * 0.6);
        const size = Hc * 0.62, step = Hc * 0.86, n = Math.max(0, Math.floor(((Wc - tw) / 2 - Hc * 0.3) / step));
        for (let k = 0; k < n; k++) {
          const off = tw / 2 + Hc * 0.25 + step * (k + 0.5), [nm, fl] = T.side(k);
          for (const e of [-1, 1]) mark(g, [nm, e < 0 ? !fl : fl], Wc / 2 + e * off, Hc * 0.52, size, T.ink);
        }
        });
        if (T.refont) (refonts[T.refont] ||= []).push(m);
      }
      if (what === 'icon') over(h * 0.56, h * 0.56, (g, Wc, Hc) => { shade(g); mark(g, [T.mark], Wc / 2, Hc / 2, Hc * 0.92, T.ink); });
      if (what === 'menu') over(w * 0.94, h * 0.9, (g, Wc, Hc) => {
        shade(g);
        const most = 5, size = Hc * 0.27, step = Hc * 0.29;
        T.stock.forEach(([hex, left], i) => {
          const cx0 = Wc * (i < 3 ? 0.25 : 0.75) - (most - 1) * step / 2, cy = Hc * (0.2 + (i % 3) * 0.3);
          for (let k = 0; k < most; k++) mark(g, [T.cup || T.mark], cx0 + k * step, cy, size, k < left ? hex : 'rgba(255, 255, 255, 0.16)');
        });
      });
      const t = 0.035, rim = [box(-w / 2 - t, w / 2 + t, h / 2, h / 2 + t, 0, 0.04), box(-w / 2 - t, w / 2 + t, -h / 2 - t, -h / 2, 0, 0.04),
        box(-w / 2 - t, -w / 2, -h / 2, h / 2, 0, 0.04), box(w / 2, w / 2 + t, -h / 2, h / 2, 0, 0.04)];
      for (const g of rim) shown(g.rotateY(turn).translate(x, y, z), T.rim);
    };
    // (a case of the brand's own, as its ads are made, for a sign of its shop's: makeCase, its colours as the brand's)
    const shopCase = (w, h, x, y, z, fc, seed, sceneKey) => {
      caseOf = BRANDS.indexOf(B);
      try { makeCase(w, h, x, y, z, fc, AD[`brand-${brand}`], seed, sceneKey); } finally { caseOf = -1; }
    };
    // its name over the front, on the glass above (白云乡's its own: its number still drawn)
    if (theme) {
      Q.next();
      shopSign(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet, 'name');
    } else if (brand === 'float-cafe') {
      // (浮岛咖啡's: on a clear screen, as its menu (cafeSign); its number still drawn)
      Q.next();
      caseLabels.push(cafeSign(panel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet), W - 1.2, 0.85, 'name', props));
    } else if (brand === 'meow-store') {
      // (喵星杂货's: an LED screen, its kitten's faces in a row, its name in the four in the middle: meowLED)
      caseLabels.push(meowLED(panel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet), W - 1.2, 0.85, Q.next(), B, { layout: 'tiles', rows: 1, fine: 40 }));
    } else if (brand === 'firefly-garden') {
      // (流萤花园's: its polka dots and flowers of dots, the name in the middle: floristSign; its number still drawn)
      Q.next();
      caseLabels.push(floristSign(panel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet), W - 1.2, 0.85));
    } else if (brand === 'frost-dessert') {
      // (霜满天's: as its case, one row of its cakes going by behind its nameplate, makeCase 'frost-sign'; its number
      // still drawn)
      shopCase(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet, Q.next(), 'frost-sign');
    } else if (brand === 'dawn-bakery') {
      // (夕光烘焙's: its name, its breads either side, on its yellow-green, dawnStage 'sign'; its number still drawn)
      Q.next();
      caseLabels.push(dawnPanel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet, B, 'sign'));
    } else if (brand === 'star-ring') {
      // (星环旅行's: its strip, the edge of the Earth and the station going by all along it, its name over them at
      // the left, starTicker)
      caseLabels.push(starTicker(panel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet), W - 1.2, 0.85, Q.next()));
    } else if (brand === 'photon-books') {
      // (光合书店's: its name a hologram before a band of dark glass, edged in light, as at its great shop across
      // from the station; its number still drawn)
      Q.next();
      props(box(...sorted(X(face - 0.1), X(face - 0.02)), 3.85, 5.05, zc - (W - 1.2) / 2, zc + (W - 1.2) / 2), 0.12, new THREE.Color('#1c2433').toArray());
      for (const y of [3.85, 5.05]) glow(box(...sorted(X(face - 0.12), X(face - 0.08)), y - 0.025, y + 0.025, zc - (W - 1.2) / 2, zc + (W - 1.2) / 2), CYAN);
      holoSigns.push({ x: X(face - 0.45), y: 4.45, z: zc, set: 'h2', text: S2['光合书店 BOOKS'], rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2, size: 1.15 });
    } else if (brand === 'rain-concert') {
      // (长夏乐馆's: its river of sound along an LED strip, its name at the end, swelling with its music; its number
      // still drawn)
      Q.next();
      caseLabels.push(concertWaves(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet, { live: true, palette: 'tone' }));
    } else if (brand === 'glow-umbrella') {
      // (萤伞's: its umbrellas drifting up as jellyfish along an LED strip, its name at the end; its number still drawn)
      Q.next();
      caseLabels.push(umbrellaLED(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet, B, {}));
    } else if (brand === 'night-lamp-diner') {
      // (时雨餐厅's: none over its front; its name is written in the fog on its window, see below; its number still drawn)
      Q.next();
    } else screenAd(panel(W - 1.2, 0.85, X(face - 0.07), 4.45, zc, toStreet), AD[`brand-${brand}`], W - 1.2, 0.85, Q.next());
    // 流波月's own ad, a case over its front on the tower (its own numbers)
    if (brand === 'pearl-moon') brandCase(W - 1.6, 2.6, X(face - 0.02), F + 6.35, zc, toStreet, AD[`brand-${brand}`], 0.4142);
    // and a blade sign standing out from the front at its far end, both faces, read from along the pavement
    {
      // (浮岛咖啡's upright: three of its menu's cups one over another, from the darkest to the milkiest, cafeSign)
      const bz = zb - 0.6, [bw, bh, by] = brand === 'float-cafe' ? [0.8, 1.6, 3.15] : [1.3, 0.9, 3.0];
      props(box(X(face - 1.6), X(face), F + by + bh / 2 + 0.06, F + by + bh / 2 + 0.11, bz - 0.03, bz + 0.03), 0.4);
      props(box(X(face - 0.85 - bw / 2 - 0.05), X(face - 0.85 + bw / 2 + 0.05), F + by - bh / 2 - 0.05, F + by + bh / 2 + 0.05, bz - 0.05, bz + 0.05), 0.3);
      for (const f of [-1, 1]) {
        if (theme) { Q.next(); shopSign(bw - 0.08, bh - 0.08, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z', 'icon'); }
        else if (brand === 'float-cafe') {
          Q.next();
          caseLabels.push(cafeSign(panel(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z'), bw - 0.06, bh - 0.06, 'column', props));
        }
        else if (brand === 'frost-dessert') { Q.next(); shopCase(bw - 0.08, bh - 0.08, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z', 0.5, 'frost-blade'); }
        else if (brand === 'dawn-bakery') {                     // (a bread fading into another before the sun)
          Q.next();
          caseLabels.push(dawnPanel(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.065, f > 0 ? 'z' : '-z', B, 'blade'));
        }
        else if (brand === 'star-ring') {                       // (a corner of its station's wheel, turning: starBlade)
          Q.next();
          caseLabels.push(starBlade(panel(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z'), bw - 0.06, bh - 0.06));
        }
        else if (brand === 'meow-store') {                      // (its kitten's face on an LED screen)
          caseLabels.push(meowLED(panel(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z'), bw - 0.06, bh - 0.06, Q.next(), B, { words: false, fine: 40 }));
        }
        else if (brand === 'firefly-garden') {                  // (a flower of dots on the night's blue, a rim of light)
          Q.next();
          caseLabels.push(inBrandColours(canvasPlane(panel(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z'), (bw - 0.06) / (bh - 0.06), false, (g, Wc, Hc) => {
            g.fillStyle = '#16263f'; g.fillRect(0, 0, Wc, Hc);
            dotFlower(g, Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.36, '#ff9cc2');
            g.strokeStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = Hc * 0.035; g.strokeRect(Hc * 0.02, Hc * 0.02, Wc - Hc * 0.04, Hc - Hc * 0.04);
          }, 256), BRANDS.indexOf(B)));
        }
        else if (brand === 'rain-concert') {                    // (its river of sound, no name)
          Q.next();
          caseLabels.push(concertWaves(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.065, f > 0 ? 'z' : '-z', { kind: 'blade', live: true, palette: 'tone' }));
        }
        else if (brand === 'glow-umbrella') {                   // (its umbrellas drifting up, no name)
          Q.next();
          caseLabels.push(umbrellaLED(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.065, f > 0 ? 'z' : '-z', B, { kind: 'blade' }));
        }
        else if (brand === 'night-lamp-diner') {                // (a little fogged window, the bowl under the lamp)
          Q.next();
          caseLabels.push(rainWindow(bw - 0.06, bh - 0.06, X(face - 0.85), F + by, bz + f * 0.065, f > 0 ? 'z' : '-z', B, { kind: 'blade' }));
        }
        else screenAd(panel(bw, bh, X(face - 0.85), F + by, bz + f * 0.06, f > 0 ? 'z' : '-z'), AD[`brand-${brand}`], bw, bh, Q.next());
      }
      emitters.push({ x: X(face - 0.85), y: F + by, z: bz, nx: 0, ny: -0.3, nz: 1, power: 0.35, reach: 6, tint: 0.5 });
    }
    // 白云乡's tables out on the pavement, either side of its door: round, pink-topped, two or three chairs each
    if (brand === 'cloud-gelato') {
      const PINK = lighter(B.color, 0.6);
      for (const [z, n] of [[za + 1.7, 3], [zb - 1.9, 2]]) {
        const tx = X(face - 2.3);
        props(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20).translate(tx, F + 0.74, z), 0.85, PINK);
        props(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(tx, F + 0.37, z), 0.4);
        props(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12).translate(tx, F + 0.01, z), 0.4);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.4, cx = tx + Math.cos(a) * 0.72, cz = z + Math.sin(a) * 0.72;
          props(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).translate(cx, F + 0.46, cz), 0.85, TINT.white);
          props(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6).translate(cx, F + 0.22, cz), 0.4);
          props(new THREE.BoxGeometry(0.34, 0.32, 0.03).translate(0, 0.16, -0.2).rotateY(Math.PI / 2 - a).translate(cx, F + 0.48, cz), 0.85, PINK);
        }
        colliders.push({ x: tx, z, r: 1.0, y0: -1, y1: 2 });
      }
    }
    // someone at work, a customer or two
    const staff = (b, z) => people.push({ x: X(face + b), y: F, z, rot: faceStreet + Math.PI, umbrella: false });
    for (let i = Q.int(1, 3); i > 0; i--) people.push({ x: X(face + Q.range(1.2, 3.5)), y: F, z: Q.range(za + 1, zb - 1), rot: Q.range(0, 6.3), umbrella: false });

    // what it sells
    if (kind === 'cafe' || kind === 'tea') {
      counter(4.4, 5.1, za + 0.6, zb - 2.2);
      staff(5.9, zc - 0.5);
      ip(bx(D - 0.75, D - 0.12, 0, 0.95, za + 0.3, zb - 0.3), 0.6, TINT.darkWood);       // the back counter
      if (kind === 'cafe') {
        ip(bx(D - 0.7, D - 0.2, 0.95, 1.45, za + 1.0, za + 2.0), 0.85);                 // the espresso machine
        glow(bx(D - 0.71, D - 0.7, 1.28, 1.32, za + 1.0, za + 2.0), CYAN);
        for (let z = za + 1.1; z < za + 1.95; z += 0.11) put('cup', D - 0.45, 1.45, z, { tone: 1 });
        for (let z = za + 2.4; z < zb - 1; z += 0.13) for (let k = 0; k < 3; k++) put('cup', D - 0.45, 0.95 + k * 0.035, z, { tone: 1 });
        for (let z = za + 1; z < zb - 2.4; z += 0.3) put('cup', 4.75, 1.04, z, { tone: 1 });
      } else {
        for (let y = 1.4; y < 2.6; y += 0.42) {                                           // jars of toppings on the wall
          ip(bx(D - 0.4, D - 0.12, y - 0.03, y, za + 0.4, zb - 0.4), 0.7, TINT.wood);
          for (let z = za + 0.6; z < zb - 0.5; z += 0.2) put('jar', D - 0.26, y, z, { tone: Q.range(0.8, 1) });
        }
        for (let z = za + 1; z < zb - 1; z += 0.6) ip(bx(D - 0.65, D - 0.25, 0.95, 1.35, z - 0.15, z + 0.15), 0.8);   // the sealers
        for (let z = za + 0.9; z < zb - 2.4; z += 0.12) put('teacup', 4.75, 1.04, z, { tone: 1 });
      }
      if (theme) { Q.next(); shopSign(Math.min(W - 2, 4), 1.0, X(face + D - 0.18), F + 3.0, zc, toStreet, 'menu'); }   // (over the jars, its number still drawn)
      else if (brand === 'float-cafe') {
        Q.next(); const mw = Math.min(W - 2, 4);
        ip(bx(D - 0.15, D - 0.12, 1.7, 3.2, zc - mw / 2 - 0.3, zc + mw / 2 + 0.3), CAFE_WALL);   // (the board behind it, as its signs' backs)
        caseLabels.push(cafeBoard(panel(mw, 1.1, X(face + D - 0.18), F + 2.45, zc, toStreet), mw, 1.1));
      }
      else menu(Math.min(W - 2, 4), 1.1, zc, 2.45);
      // 流波月's moons: three round lanterns hung in its window, the moon in three sizes
      if (brand === 'pearl-moon') {
        for (const [b, dz, r, hy] of [[1.2, -2.2, 0.42, 2.55], [1.6, 0.4, 0.28, 2.75], [1.1, 2.6, 0.2, 2.9]]) {
          shown(new THREE.SphereGeometry(r, 24, 14).translate(X(face + b), F + hy, zc + dz), [1.55, 1.42, 1.05]);
          ip(new THREE.CylinderGeometry(0.006, 0.006, CEIL - hy - r, 4).translate(X(face + b), F + (CEIL + hy + r) / 2, zc + dz), 0.3);
          lamps.push({ x: X(face + b), y: F + hy, z: zc + dz, power: 0.25 });
        }
        // its goods on the side wall: a board of night blue, canvas totes hung on it with a moon printed on each, and
        // on two shelves its moons to take home, soft, round or crescent, no faces; a warm light along the top
        const wz = zb - 0.1, CANVAS = new THREE.Color('#efe6d2').toArray(), INDIGO = new THREE.Color('#2b2f6b').toArray();
        const MOONS = ['#f6e7a6', '#fff3d6', '#f2d27a'].map((c) => new THREE.Color(c).toArray());
        ip(bx(0.5, 3.5, 0.85, 2.7, wz - 0.03, wz), 0.6, INDIGO);
        glow(bx(0.55, 3.45, 2.66, 2.69, wz - 0.06, wz - 0.03), WARM);
        for (const [b, print] of [[0.85, 'round'], [1.35, 'crescent'], [1.85, 'round']]) {
          const top = 2.2, bh = 0.42, bw = 0.36, fz = wz - 0.05;
          ip(bx(b - bw / 2, b + bw / 2, top - bh, top, fz - 0.02, fz), 0.85, CANVAS);
          ip(new THREE.TorusGeometry(0.12, 0.009, 4, 14, Math.PI).translate(X(face + b), F + top, fz - 0.01), 0.85, CANVAS);   // its strap, over the peg
          ip(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 5).rotateX(Math.PI / 2).translate(X(face + b), F + top + 0.12, wz - 0.03), 0.3);   // its peg
          const moon = iconShape('material/bedtime', 0.2);                     // its print: the shop's crescent
          if (moon) ip(moon.rotateY(Math.PI).translate(X(face + b), F + top - bh * 0.5, fz - 0.03), 0.35, print === 'crescent' ? INDIGO : new THREE.Color('#e8b85a').toArray());   // (darker than the canvas, so it shows in the tones too)
        }
        for (const sy of [1.1, 1.65]) {
          ip(bx(2.15, 3.4, sy - 0.03, sy, wz - 0.28, wz - 0.03), 0.75, TINT.wood);
          for (let b = 2.3, k = 0; b < 3.3; b += 0.27, k++) {
            const r = [0.09, 0.12, 0.08, 0.11][k % 4], tint = MOONS[k % 3], mz = wz - 0.15;
            if ((k + (sy > 1.4 ? 1 : 0)) % 2) ip(new THREE.SphereGeometry(r, 14, 10).scale(1, 0.95, 0.75).translate(X(face + b), F + sy + r * 0.95, mz), 0.85, tint);
            else ip(new THREE.TorusGeometry(r * 0.75, r * 0.38, 8, 16, Math.PI * 1.2).rotateZ(k % 4 < 2 ? 1.26 : -1.88).translate(X(face + b), F + sy + r * 1.1, mz), 0.85, tint);   // (a crescent, open to one side)
          }
        }
      }
      if (brand === 'float-cafe') {
        // 浮岛咖啡: two floating islands for its seats (a tree on one, a lamp on the other), an island lamp hung in its
        // window, warm lamps over its bar (its own numbers)
        const RI = makeRandom(5700);
        floatIsland(ip, shownIn, X(face + 2.1), F, za + 1.75, 1.15, 'tree', RI);
        floatIsland(ip, shownIn, X(face + 2.1), F, zb - 1.75, 1.0, 'lamp', RI);
        colliders.push({ x: X(face + 2.1), z: za + 1.75, r: 1.3, y0: -1, y1: CEIL }, { x: X(face + 2.1), z: zb - 1.75, r: 1.15, y0: -1, y1: CEIL });
        islandLamp(ip, shownIn, X(face + 0.9), F + 2.75, zc - 2.2, F + CEIL, RI);
        for (const z of [za + 1.4, zc - 0.5, zb - 2.6]) {
          shownIn(new THREE.SphereGeometry(0.13, 14, 10).scale(1, 0.75, 1).translate(X(face + 4.75), F + 2.25, z), [1.6, 1.12, 0.65]);
          ip(new THREE.CylinderGeometry(0.005, 0.005, CEIL - 2.33, 4).translate(X(face + 4.75), F + (CEIL + 2.33) / 2, z), 0.3);
          lamps.push({ x: X(face + 4.75), y: F + 2.1, z, power: 0.2 });
        }
        glow(bx(4.38, 4.4, 0.9, 0.95, za + 0.6, zb - 2.2), [1.6, 1.12, 0.65]);      // (a warm line along the bar's front)
      } else { table(1.6, za + 1.4); table(1.6, za + 3.6, 3); if (W > 9) table(2.4, zb - 1.2); }
    } else if (kind === 'icecream') {
      // the freezer: a long low case, lit along its glass, tubs of every flavour in two rows
      counter(3.6, 4.6, za + 0.8, zb - 1.6, lighter(B.color, 0.3));
      for (let z = za + 1.0; z < zb - 1.7; z += 0.25) for (const b of [3.85, 4.3]) put('tub', b, 0.92, z, { tone: Q.range(0.85, 1) });
      glow(bx(3.58, 3.6, 0.9, 1.25, za + 0.8, zb - 1.6), PALE);
      for (let k = 0; k < 8; k++) put('cone', 4.5, 1.04 + k * 0.02, zb - 1.9, { tone: 1, rot: 0 });
      staff(5.6, zc);
      Q.next();                                                                 // (the board over the counter: its menu, as the sign outside)
      shopSign(Math.min(W - 2, 4.4), 1.6, X(face + D - 0.18), F + 2.3, zc, toStreet, 'menu');
      ip(bx(D - 0.6, D - 0.12, 0, 0.95, za + 0.3, zb - 0.3), 0.6, lighter(B.color, 0.3));
      table(1.5, za + 1.5);
      if (brand === 'cloud-gelato') {
        // cones made and waiting in a stand on the counter, a scoop or two on each
        const RG = makeRandom(5600);
        ip(bx(3.72, 3.98, 1.02, 1.1, za + 0.95, za + 2.45), 0.85, TINT.white);
        for (let z = za + 1.08; z < za + 2.4; z += 0.22) {
          const xb = X(face + 3.85), y0 = F + 1.1;
          ip(new THREE.ConeGeometry(0.038, 0.15, 8).rotateX(Math.PI).translate(xb, y0 + 0.05, z), 0.8, TINT.wood);
          const n = RG.chance(0.5) ? 2 : 1;
          for (let k = 0; k < n; k++) ip(new THREE.IcosahedronGeometry(0.046 - k * 0.006, 1).translate(xb, y0 + 0.15 + k * 0.065, z), 0.85, new THREE.Color(RG.pick(['#ff9cbf', '#ffc4d8', '#fff1f5', '#a8d8a0', '#ffd27a'])).toArray());
        }
        // a freezer of tubs to take home, standing by the wall: tall, three glass doors, lit within, its shelves
        // full of pints in their paper tubs, each flavour's colour on its band and lid
        const fz0 = zb - 0.8, fz1 = zb - 0.1, fb0 = 0.7, fb1 = 3.1, fh = 2.1, fr = 0.05;
        ip(bx(fb0, fb1, 0, 0.12, fz0, fz1), 0.3);                                              // its plinth
        ip(bx(fb0, fb1, fh - 0.22, fh, fz0, fz1), 0.85, TINT.white);                            // its head
        for (const b of [fb0, fb1 - 0.06]) ip(bx(b, b + 0.06, 0, fh, fz0, fz1), 0.85, TINT.white);
        ip(bx(fb0, fb1, 0.12, fh - 0.22, fz1 - 0.04, fz1), 0.6, lighter(B.color, 0.6));         // its back
        glow(bx(fb0 + 0.06, fb1 - 0.06, fh - 0.25, fh - 0.22, fz0 + 0.1, fz1 - 0.1), PALE);     // its light
        glow(bx(fb0 + 0.3, fb1 - 0.3, fh - 0.17, fh - 0.06, fz0 - 0.005, fz0), [1.5, 0.9, 1.1]); // a band of pink along its head
        const FLAV = ['#ff8fb3', '#ffc4d8', '#fff1d6', '#e9c08a', '#a8d8a0', '#ffd27a'];
        for (const y of [0.12, 0.55, 0.98, 1.41]) {
          ip(bx(fb0 + 0.06, fb1 - 0.06, y, y + 0.02, fz0 + 0.05, fz1 - 0.05), 0.5, TINT.white);
          let k = RG.int(0, 5);
          for (let b = fb0 + 0.17; b < fb1 - 0.12; b += 0.15) for (const dz of [0.18, 0.42]) {
            if (RG.chance(0.12)) continue;
            const flav = new THREE.Color(FLAV[k++ % FLAV.length]).toArray(), px = X(face + b), pz = fz0 + dz;
            ip(new THREE.CylinderGeometry(0.06, 0.054, 0.13, 10).translate(px, F + y + 0.02 + 0.065, pz), 0.85, TINT.white);
            ip(new THREE.CylinderGeometry(0.0605, 0.0605, 0.04, 10).translate(px, F + y + 0.02 + 0.06, pz), 0.8, flav);
            ip(new THREE.CylinderGeometry(0.063, 0.063, 0.015, 10).translate(px, F + y + 0.02 + 0.138, pz), 0.8, flav);
          }
        }
        // its doors: three, framed, handles lit; the glass itself left clear
        for (let d = 0; d < 3; d++) {
          const d0 = fb0 + 0.06 + d * (fb1 - fb0 - 0.12) / 3, d1 = d0 + (fb1 - fb0 - 0.12) / 3;
          for (const b of [d0, d1 - fr]) ip(bx(b, b + fr, 0.12, fh - 0.22, fz0 - 0.03, fz0), 0.85, TINT.white);
          for (const y of [0.12, fh - 0.22 - fr]) ip(bx(d0, d1, y, y + fr, fz0 - 0.03, fz0), 0.85, TINT.white);
          glow(bx(d1 - 0.12, d1 - 0.1, 0.8, 1.3, fz0 - 0.05, fz0 - 0.03), PALE);
        }
        block(fb0 - 0.1, fb1 + 0.1, fz0 - 0.15, fz1);
      } else table(1.5, zb - 1.3, 3);
    } else if (kind === 'dessert' || kind === 'bakery') {
      // a glass case of cakes or pastries for a counter; shelves of bread or cakes behind
      // (夕光烘焙's breads: their glyphs in its ink, standing turned to the street, as on its cases; their numbers
      // still drawn)
      const c0 = za + 0.8, c1 = zb - 2.0, breads = [], bread = (name, b, y, z, size) => breads.push({ pic: duskPic.glyph(name), x: s * (z - zc), y, z: -b, s: size });
      ip(bx(3.8, 4.6, 0, 0.85, c0, c1), 0.6, TINT.darkWood);
      for (const y of [0.87, 1.17]) {
        glow(bx(3.82, 4.58, y, y + 0.01, c0 + 0.02, c1 - 0.02), PALE);
        let n = 0;
        for (let z = c0 + 0.15; z < c1 - 0.1; z += kind === 'dessert' ? 0.26 : 0.16, n++) {
          if (kind === 'dessert') put('cake', 4.2, y + 0.01, z, { tone: 1 });
          else {
            Q.range(0, 6.3); Q.range(0.8, 1);
            bread(y > 1 ? ['bread', 'cookie', 'bread', 'pie', 'waffle'][n % 5] : ['croissant', 'pretzel', 'croissant', 'bagel'][n % 4], 4.2, y + 0.01, z, 0.17);
          }
        }
      }
      ip(bx(3.8, 4.6, 1.45, 1.48, c0, c1), 0.6);
      for (const z of [c0, c1]) ip(bx(3.8, 4.6, 0.85, 1.45, z - 0.02, z + 0.02), 0.4);
      block(3.7, 4.7, c0, c1);
      shelves(D - 0.5, D - 0.12, za + 0.4, zb - 0.4, [0.9, 1.45, 2.0], (y) => {
        for (let z = za + 0.7; z < zb - 0.6; z += 0.42) {
          if (kind === 'bakery') {
            put('basket', D - 0.3, y, z, { tone: 0.9 });
            for (const dz of [-0.06, 0.06]) {
              Q.range(0, 6.3); Q.range(0.8, 1);
              bread(y > 1.9 ? 'baguette' : ['bread', 'croissant', 'bagel', 'bread', 'flatbread'][breads.length % 5], D - 0.36, y + 0.03, z + dz * 1.4, y > 1.9 ? 0.3 : 0.2);
            }
          } else put('cake', D - 0.3, y, z, { tone: 1 });
        }
      });
      // (夕光烘焙's menu: two rows of its medallions on the wall over the shelves, a bread on each)
      if (kind === 'bakery') {
        const MENU = ['croissant', 'baguette', 'bread', 'bagel', 'pretzel', 'pie', 'waffle', 'cookie', 'flatbread', 'pancakes', 'sandwich', 'doughnut', 'coffee', 'milk'];
        const d = 0.4, gap = 0.5, n = Math.min(7, Math.floor((W - 2.4) / gap));
        for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) {
          breads.push({ pic: duskPic.medal(MENU[(r * n + k) % MENU.length]), x: (k - (n - 1) / 2) * gap, y: 2.42 + (1 - r) * 0.5, z: -(D - 0.13), s: d });
        }
      }
      if (breads.length) {
        const m = emojiStage(breads, { gain: 0.8 });
        m.rotation.y = faceStreet; m.position.set(X(face), F, zc);
        caseLabels.push(m);
      }
      // (霜满天's menu over its shelves: its case's three rows of cakes, its nameplate in the middle)
      if (brand === 'frost-dessert') shopCase(Math.min(W - 2, 4), 0.95, X(face + D - 0.14), F + 2.95, zc, toStreet, 0.7, 'frost-menu');
      staff(5.4, zc);
      table(1.6, za + 1.5); table(1.6, zb - 1.3);
    } else if (kind === 'cute') {
      // plush kittens and boxes on every wall, a table piled high in the middle
      for (const [c0, c1, rot] of [[za + 0.1, za + 0.55, 0], [zb - 0.55, zb - 0.1, Math.PI]]) {
        shelves(1.0, D - 0.6, c0, c1, [0.4, 0.85, 1.3, 1.75, 2.2], (y) => {
          for (let b = 1.15; b < D - 0.7; b += 0.2) {
            if (Q.chance(0.75)) put('plush', b, y, (c0 + c1) / 2, { rot, tone: 1 });
            else put('block', b, y, (c0 + c1) / 2, { rot, tone: 1, scale: [0.15, Q.range(0.12, 0.22), 0.12] });   // a boxed figure
          }
        });
      }
      shelves(D - 0.5, D - 0.12, za + 0.7, zb - 0.7, [0.4, 0.85, 1.3, 1.75, 2.2], (y) => {
        for (let z = za + 0.85; z < zb - 0.8; z += 0.2) put('plush', D - 0.3, y, z, { tone: 1, scale: y < 0.5 ? 1.6 : 1 });
      });
      ip(bx(3.0, 4.8, 0, 0.7, zc - 0.9, zc + 0.9), 0.75, TINT.wood);
      for (let i = 0; i < 26; i++) put('plush', Q.range(3.15, 4.65), 0.7 + (i > 16 ? 0.17 : 0), zc + Q.range(-0.75, 0.75), { rot: Q.range(0, 6.3), tone: 1 });
      put('plush', 3.9, 1.05, zc, { scale: 3.2, tone: 1 });
      block(2.9, 4.9, zc - 1, zc + 1);
      counter(1.0, 1.6, zb - 2.6, zb - 0.8);
      staff(0.6, zb - 1.7);
    } else if (kind === 'travel') {
      // a travel agent's for the ring station, a place to ask and sit a while: a long white counter across the
      // back, two at it; over it, on the back wall, the brand's own case (the station seen from space, no name);
      // racks of brochures along one side wall; by the other, a corner to sit in (a sofa, two armchairs, a table)
      counter(D - 1.5, D - 0.9, za + 0.9, zb - 0.9, TINT.white);
      for (const z of [zc - W * 0.2, zc + W * 0.2]) staff(D - 0.45, z);
      shopCase(Math.min(W - 2.4, 5), 1.5, X(face + D - 0.14), F + 2.45, zc, toStreet, 0.6, 'star-ring-window');
      // (brochures in racks, in its colours and white)
      for (const [c0, c1] of [[za + 0.12, za + 0.4]]) {
        ip(bx(1.0, D - 2.2, 0, 1.5, c0, c1), 0.6, TINT.white);
        for (const y of [0.55, 0.95, 1.35]) for (let b = 1.15; b < D - 2.3; b += 0.24) {
          ip(bx(b - 0.09, b + 0.09, y - 0.02, y + 0.22, c0 + 0.02, c1 - 0.02), 0.85, (Math.round(b * 7 + y * 3) % 3) ? TINT.white : new THREE.Color(B.color).toArray());
        }
      }
      // (the corner to sit in: a sofa against the wall, a low round table before it, two armchairs across it, a
      // plant; a soft blue-grey, white, warm wood)
      const SOFA = TINT.fabric, sofa = (b0, b1, c0, c1, back) => {          // (back: which side its back is, +1 toward zb)
        ip(bx(b0, b1, 0.1, 0.42, c0, c1), 0.85, SOFA);
        const cb = back > 0 ? [c1 - 0.18, c1] : [c0, c0 + 0.18];
        ip(bx(b0, b1, 0.42, 0.85, ...cb), 0.85, SOFA);
        for (const bb of [[b0, b0 + 0.16], [b1 - 0.16, b1]]) ip(bx(...bb, 0.42, 0.62, c0, c1), 0.85, SOFA);
        ip(bx(b0 + 0.05, b1 - 0.05, 0, 0.1, c0 + 0.05, c1 - 0.05), 0.4);
      };
      sofa(1.5, 3.5, zb - 0.95, zb - 0.2, 1);
      for (const b of [1.8, 3.2]) sofa(b - 0.38, b + 0.38, zb - 3.0, zb - 2.3, -1);
      ip(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24).translate(X(face + 2.5), F + 0.4, zb - 1.6), 0.9, TINT.white);
      ip(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 8).translate(X(face + 2.5), F + 0.19, zb - 1.6), 0.6, TINT.wood);
      ip(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 12).translate(X(face + 4.1), F + 0.21, zb - 0.45), 0.8, TINT.white);
      ip(new THREE.SphereGeometry(0.38, 12, 10).scale(1, 1.3, 1).translate(X(face + 4.1), F + 0.85, zb - 0.45), 0.7, TINT.leaf);
      block(1.3, 4.5, zb - 3.1, zb - 0.1);
    } else if (kind === 'concert') {
      // 长夏乐馆: a tavern with music, not a concert hall. A bar along one side, stools at it, bottles on shelves
      // behind it, lit warm; in the far corner a little stage, an upright piano against the wall, someone singing
      // at a microphone; over it a round screen of its river of sound, no words, swelling with the music; small round
      // tables about the floor, a candle on each, low lamps hung over them; dim, in the city's blue and white
      // (its own numbers)
      const RT = makeRandom(6565), LAMP = [1.25, 1.45, 1.55], DARKW = new THREE.Color('#2b3550').toArray();
      const hang = (b, z, y, r = 0.07) => {
        ip(new THREE.CylinderGeometry(0.005, 0.005, CEIL - y, 4).translate(X(face + b), F + (CEIL + y) / 2, z), 0.3);
        shownIn(new THREE.SphereGeometry(r, 10, 8).translate(X(face + b), F + y, z), LAMP);
        lamps.push({ x: X(face + b), y: F + y - 0.1, z, power: 0.2 });
      };
      // the bar, along the side at zb, from the middle of the room back
      const bz0 = zb - 1.5, bz1 = zb - 0.95, ba0 = 3.0, ba1 = D - 0.4;
      ip(bx(ba0, ba1, 0, 1.08, bz0, bz1), 0.4, DARKW);
      glow(bx(ba0, ba1, 1.08, 1.11, bz0, bz1), LAMP);
      block(ba0 - 0.1, ba1, bz0 - 0.1, zb);
      for (let b = ba0 + 0.4; b < ba1 - 0.3; b += 0.75) {
        ip(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12).translate(X(face + b), F + 0.75, bz0 - 0.4), 0.5, DARKW);
        ip(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6).translate(X(face + b), F + 0.37, bz0 - 0.4), 0.3);
        hang(b, (bz0 + bz1) / 2, 2.2, 0.06);
      }
      for (const y of [1.3, 1.75, 2.2]) {                                                   // its shelves of bottles
        ip(bx(ba0, ba1, y - 0.03, y, zb - 0.32, zb - 0.1), 0.6, DARKW);
        glow(bx(ba0, ba1, y - 0.05, y - 0.03, zb - 0.33, zb - 0.32), [0.5, 0.85, 1.0]);
        for (let b = ba0 + 0.1; b < ba1 - 0.1; b += 0.11) put('bottle', b, y, zb - 0.2, { tone: RT.pick([0.35, 0.55, 0.8, 1.0]), rot: faceStreet });
      }
      // the stage, in the far corner at za: low, its edge lit; an upright piano against the back wall; a singer
      const sb0 = D - 3.0, sz1 = za + 3.6;
      ip(bx(sb0, D - 0.12, 0, 0.3, za + 0.2, sz1), 0.3, DARKW);
      glow(bx(sb0 - 0.02, sb0, 0.27, 0.3, za + 0.2, sz1), LAMP);
      glow(bx(sb0, D - 0.12, 0.27, 0.3, sz1, sz1 + 0.02), LAMP);
      block(sb0, D, za, sz1);
      ip(bx(D - 0.75, D - 0.15, 0.3, 1.55, za + 0.5, za + 2.0), 0.2, DARKW);                    // the piano
      ip(bx(D - 0.95, D - 0.75, 1.0, 1.08, za + 0.55, za + 1.95), 0.25, DARKW);
      ip(bx(D - 1.45, D - 1.15, 0.3, 0.75, za + 1.0, za + 1.5), 0.3, DARKW);                   // its bench
      const mz = za + 2.8, mb = sb0 + 0.9;
      ip(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 5).translate(X(face + mb - 0.35), F + 0.3 + 0.72, mz), 0.3);   // the microphone
      ip(new THREE.SphereGeometry(0.04, 8, 6).translate(X(face + mb - 0.35), F + 1.77, mz), 0.3);
      people.push({ x: X(face + mb), y: F + 0.3, z: mz, rot: faceStreet + Math.PI, umbrella: false });   // the singer, turned to the room
      for (const z of [za + 1.0, za + 2.6]) shownIn(new THREE.SphereGeometry(0.08, 10, 8).translate(X(face + sb0 + 0.3), F + CEIL - 0.25, z), LAMP);
      caseLabels.push(concertWaves(1.9, 1.9, X(face + D - 0.16), F + 2.35, (za + sz1) / 2, toStreet, { named: false, palette: 'tone', live: true, round: true }));
      // small round tables, a candle on each, a lamp hung low over it, chairs about them
      for (const [b, z, n] of [[1.4, za + 1.4, 2], [1.5, zc + 0.6, 3], [2.9, za + 3.2, 2], [3.2, zc + 2.2, 2], [1.4, zb - 2.6, 2]]) {
        ip(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16).translate(X(face + b), F + 0.74, z), 0.4, DARKW);
        ip(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).translate(X(face + b), F + 0.37, z), 0.3);
        shownIn(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 8).translate(X(face + b), F + 0.8, z), [1.3, 1.5, 1.6]);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + RT.range(0, 1), cb = b + Math.cos(a) * 0.62, cz = z + Math.sin(a) * 0.62;
          ip(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12).translate(X(face + cb), F + 0.46, cz), 0.5, DARKW);
          ip(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6).translate(X(face + cb), F + 0.22, cz), 0.3);
        }
        hang(b, z, 1.9);
        colliders.push({ x: X(face + b), z, r: 0.95, y0: -1, y1: CEIL });
      }
    } else if (kind === 'diner') {
      // 时雨餐厅: a long counter inside its fogged glass either side of the door, stools at it, people at it looking
      // out at the rain, a small warm lamp hung low over each place; a bar along the back before the kitchen's pass,
      // lit; two small tables between, a lamp over each; otherwise dim (its own numbers)
      const RD = makeRandom(6161), LAMP = [1.6, 1.12, 0.65];
      const hang = (b, z, y) => {
        ip(new THREE.CylinderGeometry(0.005, 0.005, CEIL - y - 0.1, 4).translate(X(face + b), F + (CEIL + y + 0.1) / 2, z), 0.3);
        ip(new THREE.CylinderGeometry(0.05, 0.13, 0.13, 12, 1, true).translate(X(face + b), F + y + 0.05, z), 0.35, new THREE.Color('#1b2140').toArray());
        shownIn(new THREE.SphereGeometry(0.055, 10, 8).translate(X(face + b), F + y, z), LAMP);
        lamps.push({ x: X(face + b), y: F + y - 0.1, z, power: 0.18 });
      };
      const stool = (b, z, y = 0.72) => {
        ip(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).translate(X(face + b), F + y, z), 0.6, TINT.darkWood);
        ip(new THREE.CylinderGeometry(0.025, 0.025, y, 6).translate(X(face + b), F + y / 2, z), 0.4);
      };
      for (const [c0, c1] of [[za + 0.3, door[0] - 0.3], [door[1] + 0.3, zb - 0.3]]) {
        ip(bx(0.22, 0.68, 1.0, 1.05, c0, c1), 0.6, TINT.darkWood);                      // the counter along the glass
        ip(bx(0.3, 0.36, 0, 1.0, c0, c1), 0.4);
        glow(bx(0.66, 0.68, 0.96, 1.0, c0 + 0.05, c1 - 0.05), DIM);
        block(0.15, 0.75, c0, c1);
        for (let z = c0 + 0.35; z < c1 - 0.2; z += 0.7) {
          hang(0.45, z, 2.15);
          if (RD.chance(0.55)) {                                                   // someone there, looking out
            people.push({ x: X(face + 0.95), y: F, z, rot: faceStreet + Math.PI, umbrella: false });
            put('bowl', 0.45, 1.05, z, { tone: 1 });
          } else stool(0.95, z);
        }
      }
      ip(bx(D - 1.6, D - 0.12, 0, 1.0, za + 0.3, zb - 0.3), 0.55, TINT.darkWood);
      glow(bx(D - 1.62, D - 1.6, 0.95, 1.0, za + 0.3, zb - 0.3), LAMP);
      ip(bx(D - 0.5, D - 0.12, 1.0, 2.6, za + 0.3, zb - 0.3), 0.75);                      // the pass, lit warm
      shownIn(bx(D - 0.52, D - 0.5, 1.4, 2.4, za + 0.6, zb - 0.6), LAMP);
      block(D - 1.7, D, za, zb);
      for (let z = za + 0.8; z < zb - 0.6; z += 0.75) {
        stool(D - 2.05, z);
        put('bowl', D - 1.4, 1.0, z, { tone: 1 });
      }
      staff(D - 1.0, zc);
      for (const z of [za + 2.0, zb - 2.0]) {                                       // two small tables, a lamp over each
        ip(bx(3.0, 3.7, 0.72, 0.76, z - 0.35, z + 0.35), 0.85, TINT.darkWood);
        ip(bx(3.32, 3.38, 0, 0.72, z - 0.03, z + 0.03), 0.4);
        for (const db of [-0.6, 0.6]) stool(3.35 + db, z, 0.46);
        put('bowl', 3.35, 0.76, z, { tone: 1 });
        hang(3.35, z, 1.9);
        colliders.push({ x: X(face + 3.35), z, r: 1.0, y0: -1, y1: CEIL });
      }
    } else if (kind === 'florist') {
      [[D - 1.6, 0.3], [D - 1.1, 0.62], [D - 0.6, 0.94]].forEach(([b, h]) => {
        ip(bx(b, D - 0.12, 0, h, za + 0.3, zb - 0.3), 0.62, TINT.wood);
        for (let z = za + 0.5; z < zb - 0.4; z += 0.3) put(Q.pick(['round', 'cupped', 'star', 'spike']), b + 0.2, h, z, { rot: Q.range(0, 6.3), tone: Q.range(0.8, 1.05) });
      });
      block(D - 1.7, D, za, zb);
      ip(bx(2.8, 4.2, 0, 0.75, zc - 0.8, zc + 0.8), 0.62, TINT.wood);
      for (let i = 0; i < 6; i++) put(Q.pick(['round', 'cupped', 'star', 'spike']), Q.range(3.0, 4.0), 0.75, zc + Q.range(-0.6, 0.6), { rot: Q.range(0, 6.3), tone: 1 });
      block(2.7, 4.3, zc - 0.9, zc + 0.9);
      for (const [b, z] of [[1.2, za + 0.7], [2.6, zb - 0.9], [5.2, za + 1.4]]) put('hanging', b, CEIL - 0.9, z, { rot: Q.range(0, 6.3) });
      for (let z = za + 0.6; z < door[0] - 0.4; z += 0.32) put(Q.pick(['round', 'cupped', 'star', 'spike']), 0.5, 0, z, { rot: Q.range(0, 6.3), tone: 1 });
      for (let i = 0; i < 30; i++) put('mote', Q.range(0.3, D - 0.4), Q.range(0.6, 2.8), Q.range(za + 0.3, zb - 0.3));
      counter(1.2, 1.8, zb - 2.6, zb - 0.6);
      staff(0.7, zb - 1.6);
    } else if (kind === 'books') {
      shelves(D - 0.45, D - 0.12, za + 0.3, zb - 0.3, [0.12, 0.52, 0.92, 1.32, 1.72, 2.12, 2.52], (y) => booksAlong(za + 0.35, zb - 0.35, (z, o) => put('block', D - 0.28, y, z, o)));
      for (const [c0, c1, rot] of [[za + 0.1, za + 0.45, 0], [zb - 0.45, zb - 0.1, Math.PI]]) {
        shelves(1.0, D - 0.5, c0, c1, [0.12, 0.52, 0.92, 1.32, 1.72], (y) => booksAlong(1.05, D - 0.55, (b, o) => put('block', b, y, (c0 + c1) / 2, { ...o, rot })));
      }
      ip(bx(2.6, 4.6, 0.76, 0.8, zc - 0.7, zc + 0.7), 0.8, TINT.wood);
      for (let b = 2.8; b < 4.5; b += 0.35) for (const dz of [-0.35, 0.05, 0.4]) {
        let y = 0.8;
        for (let k = Q.int(1, 5); k > 0; k--) { const h = Q.range(0.025, 0.045); put('block', b, y, zc + dz, { scale: [0.17, h, 0.24], rot: Q.range(-0.2, 0.2), tone: Q.pick([0.4, 0.7, 1]) }); y += h; }
      }
      block(2.5, 4.7, zc - 0.8, zc + 0.8);
      counter(1.0, 1.6, zb - 2.4, zb - 0.6);
      staff(0.6, zb - 1.5);
    } else if (kind === 'umbrella') {
      glow(bx(D - 0.15, D - 0.12, 0.3, 2.4, za + 0.3, zb - 0.3), [0.85, 0.98, 1.0]);
      ip(bx(D - 0.5, D - 0.2, 1.93, 1.98, za + 0.4, zb - 0.4), 0.35);
      for (let z = za + 0.5; z < zb - 0.45; z += 0.14) put('umbrella', D - 0.35, 1.17, z, { rot: Q.pick([0, Math.PI]), tone: Q.range(0.5, 1) });
      // (its open ones: hung from the ceiling by their tips over the front of the shop, their rims lit, fireflies
      // about them, some brighter than others, as in its shop in the station; its own numbers)
      const RJ = makeRandom(6262);
      for (const [b, z, r] of [[1.0, za + 1.4, 0.45], [1.9, za + 3.0, 0.38], [1.1, zc + 2.6, 0.42], [2.1, zb - 1.5, 0.45], [2.8, zc - 0.4, 0.34], [2.6, za + 1.9, 0.32]]) {
        const yb = CEIL - 0.25 - r * 0.55, ux = X(face + b);
        ip(canopyGeometry(r, r * 0.55).translate(ux, F + yb, z), 0.85);
        glow(rimGeometry(r, r * 0.55, 0.014).translate(ux, F + yb, z), [0.6, 1.7, 0.8].map((v) => v * RJ.range(0.6, 1)));
        ip(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4).translate(ux, F + CEIL - 0.125, z), 0.3);
      }
      for (let i = 0; i < 30; i++) glow(new THREE.SphereGeometry(0.022, 6, 4).translate(X(face + RJ.range(0.3, 3.4)), F + RJ.range(1.4, CEIL - 0.5), RJ.range(za + 0.3, zb - 0.3)), [1.0, 1.7, 0.5].map((v) => v * RJ.range(0.35, 1)));
      counter(3.6, 4.3, za + 1.0, zb - 2.0);
      staff(5.0, zc);
      for (const [b, z] of [[1.2, za + 1.0], [1.2, zb - 1.0]]) {
        ip(new THREE.CylinderGeometry(0.22, 0.2, 0.55, 14, 1, true).translate(X(face + b), F + 0.275, z), 0.5);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          shopIn.goods.put('umbrella', X(face + b) + Math.cos(a) * 0.12, F + 0.05, z + Math.sin(a) * 0.12, { rot: Q.range(0, 6.3), tilt: Math.sin(a) * 0.12, roll: -Math.cos(a) * 0.12, tone: Q.range(0.5, 1) });
        }
        colliders.push({ x: X(face + b), z, r: 0.4, y0: -1, y1: CEIL });
      }
    }

    // the sculpture on the pavement before it: at the kerb, or by the door on the left or right
    if (statueAt) statue(kind, s, zc, B.color, statueAt, face, door);
  }
  // books along a shelf from t0 to t1; put(t, opts)
  function booksAlong(t0, t1, put) {
    let t = t0;
    while (t < t1 - 0.06) {
      const w = RSH.range(0.022, 0.055);
      if (!RSH.chance(0.05)) put(t + w / 2, { scale: [w, RSH.range(0.17, 0.3), RSH.range(0.13, 0.2)], tone: RSH.pick([0.3, 0.55, 0.8, 1.0]) });
      t += w + 0.002;
    }
  }

  // A sculpture of what a shop sells, on a round plinth on the outer edge of the pavement before it: a giant
  // ice-cream cone, a cup of bubble tea, the mascot kitten... Moved along a little if a tree or a lamp is there.
  // where: 'curb', or 'left' / 'right' of the door (face: the shop's front, door: its z from and to)
  function statue(kind, s, zWant, color, where = 'curb', face = FACADE, door = [zWant, zWant]) {
    const R0 = 0.8, byDoor = where !== 'curb';
    const ax = byDoor ? face - 1.15 : 8.25;
    // (as one faces the shop from the street, its right is toward +z on the right side of the street)
    const right = (where === 'right') === (s > 0);
    if (byDoor) zWant = right ? door[1] + 1.7 : door[0] - 1.7;
    const clear = (z) => colliders.every((c) => (c.r !== undefined
      ? Math.hypot(c.x - s * ax, c.z - z) > c.r + R0 + 0.4
      : s * ax + R0 < c.x0 - 0.3 || s * ax - R0 > c.x1 + 0.3 || z + R0 < c.z0 - 0.3 || z - R0 > c.z1 + 0.3));
    let z = zWant;
    for (const dz of [0, 2, -2, 3.5, -3.5, 5, -5]) if (clear(zWant + dz)) { z = zWant + dz; break; }
    const x = s * ax, G0 = CURB, top = G0 + 0.3;
    const at = (g, y = 0) => g.translate(x, top + y, z);
    const turn = (g) => g.rotateY(-s * Math.PI / 2);             // its face toward the street's middle
    const tint = (hex) => new THREE.Color(hex).toArray();
    const own = tint(color);
    props(at(new THREE.CylinderGeometry(R0 - 0.05, R0, 0.3, 28).translate(0, -0.15, 0)), 0.75, TINT.stone);
    glow(at(new THREE.TorusGeometry(R0 - 0.04, 0.02, 4, 40).rotateX(Math.PI / 2), -0.01), CYAN);
    colliders.push({ x, z, r: R0 + 0.1 });
    if (kind === 'icecream') {
      props(at(new THREE.ConeGeometry(0.42, 1.3, 20).rotateX(Math.PI).translate(0, 0.65, 0)), 0.8, TINT.bread);
      props(at(new THREE.SphereGeometry(0.47, 20, 14).translate(0, 1.55, 0)), 0.9, tint('#ff9ec4'));
      props(at(new THREE.SphereGeometry(0.4, 20, 14).translate(0.05, 2.08, 0)), 0.9, tint('#b9f3d0'));
      props(at(new THREE.SphereGeometry(0.11, 10, 8).translate(0.08, 2.52, 0)), 0.7, [0.9, 0.05, 0.08]);
      glow(at(new THREE.TorusGeometry(0.44, 0.02, 4, 36).rotateX(Math.PI / 2).translate(0, 1.32, 0)), CYAN);
    } else if (kind === 'tea') {
      props(at(new THREE.CylinderGeometry(0.52, 0.42, 1.6, 24).translate(0, 0.8, 0)), 0.85, tint('#d9b38c'));
      props(at(new THREE.SphereGeometry(0.53, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 1.6, 0)), 0.92, TINT.white);
      props(at(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10).rotateZ(0.25).translate(0.12, 2.05, 0)), 0.7, own);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        props(at(new THREE.SphereGeometry(0.1, 8, 6).translate(Math.cos(a) * 0.42, 0.18 + (i % 2) * 0.12, Math.sin(a) * 0.42)), 0.15, TINT.white);
      }
      glow(at(new THREE.TorusGeometry(0.53, 0.02, 4, 40).rotateX(Math.PI / 2).translate(0, 1.6, 0)), CYAN);
    } else if (kind === 'cafe') {
      props(at(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 28).translate(0, 0.04, 0)), 0.9, TINT.white);
      props(at(new THREE.CylinderGeometry(0.55, 0.42, 0.95, 24).translate(0, 0.55, 0)), 0.92, TINT.white);
      props(at(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 24).translate(0, 0.98, 0)), 0.4, TINT.crust);
      props(at(new THREE.TorusGeometry(0.22, 0.06, 8, 16).rotateY(Math.PI / 2).translate(0, 0.6, 0.58)), 0.9, TINT.white);
      for (const dx of [-0.18, 0.18]) {
        const curve = new THREE.CatmullRomCurve3([0, 1, 2, 3].map((k) => new THREE.Vector3(dx + Math.sin(k * 1.7 + dx * 9) * 0.12, 1.1 + k * 0.32, 0)));
        glow(at(new THREE.TubeGeometry(curve, 16, 0.025, 4)), PALE_LIGHT);
      }
    } else if (kind === 'cute' && statues.cat) {
      // the mascot, sitting up (modelled in Blender, facing +z), turned to face the street; its eyes alight, a collar
      // of light round its neck
      const fur = tint('#fff4e6'), g = statues.cat.clone();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      props(at(turn(g)), 0.95, fur);
      for (const f of [-1, 1]) glow(at(turn(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.15, 0.7).translate(f * 0.2, 1.67, 0.52))), CYAN);
      glow(at(turn(new THREE.TorusGeometry(0.33, 0.025, 4, 36).rotateX(Math.PI / 2).translate(0, 1.13, 0.05))), CYAN);
    } else if (kind === 'cute') {
      // the mascot, sitting up: made facing +z, then turned to face the street
      const fur = tint('#fff4e6');
      props(at(new THREE.SphereGeometry(0.62, 20, 14).scale(1, 0.95, 0.85).translate(0, 0.58, 0)), 0.95, fur);
      props(at(new THREE.SphereGeometry(0.52, 20, 14).translate(0, 1.5, 0.05)), 0.95, fur);
      for (const f of [-1, 1]) props(at(turn(new THREE.ConeGeometry(0.17, 0.36, 8).rotateZ(-f * 0.3).translate(f * 0.3, 2.0, 0.02))), 0.95, fur);
      // the tail: from behind at the bottom, out and curling up its back
      const tail = new THREE.CatmullRomCurve3([[0, 0.15, -0.45], [0.05, 0.1, -0.8], [0.12, 0.45, -1.0], [0.1, 0.9, -0.88], [0.02, 1.08, -0.68]].map((p) => new THREE.Vector3(...p)));
      props(at(turn(new THREE.TubeGeometry(tail, 24, 0.085, 8))), 0.95, fur);
      for (const f of [-1, 1]) glow(at(turn(new THREE.SphereGeometry(0.075, 10, 8).translate(f * 0.17, 1.55, 0.47))), CYAN);
      glow(at(new THREE.TorusGeometry(0.4, 0.025, 4, 30).rotateX(Math.PI / 2).translate(0, 1.08, 0.05)), CYAN);
    } else if (kind === 'bakery') {
      // (夕光烘焙's: a round medallion standing on the plinth, its croissant in its ink on its yellow-green, a ring
      // round it, the same either side)
      const medal = duskPic.medal('croissant');
      props(at(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 8).translate(0, 0.17, 0)), 0.4);
      for (const back of [0, 1]) {
        const m = emojiStage([{ pic: medal, x: 0, y: 0.3, s: 1.3 }], { gain: 0.9 });
        m.rotation.y = -s * Math.PI / 2 + back * Math.PI; m.position.set(x, top, z); m.translateZ(0.01);
        caseLabels.push(m);
      }
    } else if (kind === 'dessert') {
      // a slice: a wedge in layers, its point toward the street
      const wedge = (y0, h, al, t) => {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0); sh.absarc(0, 0, 0.95, -0.5, 0.5, false); sh.lineTo(0, 0);
        const g = mergeVertices(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2));
        props(at(g.translate(-0.48, y0, 0).rotateY(s > 0 ? 0 : Math.PI)), al, t);
      };
      wedge(0, 0.35, 0.85, own); wedge(0.35, 0.1, 0.95, TINT.white); wedge(0.45, 0.35, 0.85, own); wedge(0.8, 0.12, 0.95, TINT.white);
      props(at(new THREE.SphereGeometry(0.16, 12, 10).scale(1, 1.2, 1).translate(0, 1.1, 0)), 0.7, [0.9, 0.05, 0.08]);
      glow(at(new THREE.TorusGeometry(0.75, 0.02, 4, 40).rotateX(Math.PI / 2).translate(0, 0.93, 0)), CYAN);
    } else if (kind === 'florist') {
      props(at(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8).translate(0, 0.9, 0)), 0.4, TINT.leaf);
      for (const f of [-1, 1]) props(at(new THREE.BoxGeometry(0.22, 0.02, 0.9).translate(0, 0, 0.45).rotateX(-0.9).rotateY(f * 1.2).translate(0, 0.5 + f * 0.1, 0)), 0.45, TINT.leaf);
      props(at(new THREE.CylinderGeometry(0.42, 0.16, 0.6, 6, 1, true).translate(0, 2.05, 0)), 0.95, tint('#ff5f8a'));
      glow(at(new THREE.SphereGeometry(0.1, 10, 8).translate(0, 1.95, 0)), [1.5, 1.7, 1.7]);
    } else if (kind === 'diner') {
      {
        props(at(new THREE.CylinderGeometry(0.75, 0.75, 0.35, 24, 1, true).translate(0, 0.17, 0)), 0.6, TINT.kraft);
        props(at(new THREE.SphereGeometry(0.62, 20, 12).scale(1, 0.7, 1).translate(0, 0.55, 0)), 0.95, tint('#fff4e6'));
        props(at(new THREE.ConeGeometry(0.16, 0.22, 10).translate(0, 1.05, 0)), 0.95, tint('#fff4e6'));
      }
      for (const dx of [-0.25, 0, 0.25]) {
        const curve = new THREE.CatmullRomCurve3([0, 1, 2, 3].map((k) => new THREE.Vector3(dx + Math.sin(k * 1.5 + dx * 7) * 0.1, 1.0 + k * 0.3, 0)));
        glow(at(new THREE.TubeGeometry(curve, 16, 0.022, 4)), PALE_LIGHT);
      }
    } else if (kind === 'books') {
      for (const f of [-1, 1]) {
        props(at(turn(new THREE.BoxGeometry(0.75, 1.05, 0.06).translate(f * 0.38, 0, 0).rotateY(f * 0.35)).translate(0, 0.62, 0)), 0.95, TINT.white);
        props(at(turn(new THREE.BoxGeometry(0.8, 1.1, 0.03).translate(f * 0.4, 0, -0.04).rotateY(f * 0.35)).translate(0, 0.62, 0)), 0.6, own);
      }
      glow(at(new THREE.TorusGeometry(0.7, 0.02, 4, 40).rotateX(Math.PI / 2).translate(0, 1.3, 0)), CYAN);
    } else if (kind === 'umbrella') {
      // (萤伞's: a hologram, as on its ads: umbrellas afloat as jellyfish over the plinth, rising and sinking, their
      // bells breathing, their shafts swaying under them; in its ads' colours, its lines and its fill)
      const LINE = [0.55, 1.6, 0.95], FILL = [0.06, 0.32, 0.2];
      for (const [ox, oy, oz, r, phase] of [[0.05, 2.35, -0.1, 0.88, 0], [-0.42, 1.4, 0.35, 0.56, 0.37], [0.45, 3.3, 0.25, 0.46, 0.71]]) {
        const h = r * 0.55, mid = [x + ox, top + oy, z + oz];
        const piece = (g) => g.translate(...mid);
        drifting(piece(canopyGeometry(r * 0.97, h * 0.97)), FILL, mid, phase);
        drifting(piece(rimGeometry(r, h, 0.022)), LINE, mid, phase);
        for (let k = 0; k < 8; k++) {                                          // its ribs, curving down from the tip
          const a = (k / 8) * Math.PI * 2, pts = [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector3(Math.cos(a) * r * t, h * (1 - t * t) + 0.01, Math.sin(a) * r * t));
          drifting(piece(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.012, 3)), LINE, mid, phase);
        }
        // its shaft and hook, swaying under it
        const hook = new THREE.CatmullRomCurve3([[0, h, 0], [0, -r * 1.1, 0], [0.05, -r * 1.3, 0], [0.13, -r * 1.25, 0]].map((p) => new THREE.Vector3(...p)));
        drifting(piece(new THREE.TubeGeometry(hook, 12, 0.014, 4)), LINE, mid, phase);
      }
    }
    // someone taking a photo of it, now and then
    if (RSH.chance(0.5)) people.push({ x: s * (byDoor ? ax - 1.8 : ax + 1.6), y: CURB, z: z + RSH.range(-0.6, 0.6), rot: (s > 0) === byDoor ? Math.PI / 2 : -Math.PI / 2, umbrella: true });
  }
  const PALE_LIGHT = [0.9, 1.25, 1.3];

  // ---------------------------------------------------------------- the natural history museum

  // At the end of the side street on the left at the first crossing, where it used to stop at a canal: a solar
  // system over a plinth in the street before it; broad steps down into a sunken plaza that opens out
  // between the museum's two wings (their windows dioramas of a reef and a rainforest); at its end the museum's
  // glass rotunda, a great Tree of Life inside, and round it, below the street, a ring gallery: a walk through
  // time, from the young Earth to us. Its heavy things (the skeletons, their labels) are loaded by museum.js as
  // one comes near. In the walk's plan, a is the distance from the main street's middle along the side street,
  // dz across it from its middle; the rotunda's centre is at a = RC.
  const MUSEUM = { c: CROSSINGS[0], s: -1, steps: 44, wings: 68 };
  const museumIn = { props: new Bin() };
  let museumSpot = null;
  function museum(c, s) {
    const X = (a) => s * a, Q = makeRandom(3100);
    const A0 = MUSEUM.steps, A1 = 56, AW = MUSEUM.wings, AE = 98, RC = 120, RI = 12, RO = 22, DEEP = -5, F = CURB;
    const NARROW = 10.5, WIDE = 21, WING = 35, CEIL = 5, AR = RC - RO + 2;   // AR: where the wings step back clear of the ring
    const DIM = [0.25, 0.5, 0.55], WARM = [1.15, 1.25, 1.25];
    const T = (hex) => new THREE.Color(hex).toArray();
    const ip = (g, albedo, tint = [0, 0, 0]) => museumIn.props.add(g, { aAlbedo: albedo, aTint: tint });
    const at = (a, dz) => [X(a), c + dz];
    // a point on a circle round the rotunda's centre: r out, at angle th from the front (toward the street)
    const polar = (r, th) => [X(RC - r * Math.cos(th)), c + r * Math.sin(th)];
    const STRATA = [[0.75, '#c9a77a'], [0.6, '#7a7468'], [0.88, '#d8d0bf'], [0.7, '#b8794a'], [0.55, '#5f6a75']];
    const banded = (x0, x1, z0, z1, y0, y1, lit = true, glassy = 0, R = Q) => {   // a mass in layers of rock
      for (let y = y0, k = 0; y < y1; k++) {
        const h = Math.min(R.range(1.0, 2.6), y1 - y);
        if (glassy && R.chance(glassy) && y > 1.5) glass(prism(outline('rect', x0, x1, z0, z1), y, y + h), [1.8, 3.8, 0.85, 0], R.next(), -40);
        else {
          const [al, hex] = STRATA[(k * 3 + R.int(0, 2)) % STRATA.length];
          props(box(x0, x1, y, y + h, z0, z1), al, T(hex));
          if (lit) glow(box(x0 - 0.02, x1 + 0.02, y + h - 0.05, y + h - 0.01, z0 - 0.02, z1 + 0.02), [0.55, 0.8, 0.85]);
        }
        y += h;
      }
    };

    // ---- before it, in the street: a solar system over a plinth (as the young Earth begins the walk inside):
    // the Sun alight on a slim column, the planets going round it on rings of light, the inner ones quicker, a belt
    // of stones between Mars and Jupiter, Saturn's ring, the Earth's Moon; high enough to walk under
    const ma = 32, PH = 1.2;
    props(new THREE.CylinderGeometry(2.6, 2.8, PH, 40).translate(X(ma), F + PH / 2, c), 0.75, TINT.stone);
    glow(new THREE.TorusGeometry(2.62, 0.03, 4, 64).rotateX(Math.PI / 2).translate(X(ma), F + PH, c), CYAN);
    colliders.push({ x: X(ma), z: c, r: 3.0 });
    {
      const sx = X(ma), sz = c, sy = F + PH + 3.0, round = (r, rate) => 0.9 / Math.pow(r, 1.5) * rate;
      props(new THREE.CylinderGeometry(0.1, 0.18, sy - 0.7 - (F + PH), 8).translate(sx, (F + PH + sy - 0.7) / 2, sz), 0.6, T('#3d4b5a'));
      shown(new THREE.IcosahedronGeometry(0.72, 1).translate(sx, sy, sz), [1.9, 1.35, 0.6]);                       // the Sun
      lamps.push({ x: sx, y: sy, z: sz, power: 1.0 });
      const SO = makeRandom(3600);
      // [how far out, how big, its light]
      const PLANETS = [[1.3, 0.12, [1.1, 1.0, 0.9]], [1.75, 0.2, [1.6, 1.3, 0.8]], [2.25, 0.21, [0.5, 1.0, 1.7]], [2.75, 0.16, [1.6, 0.6, 0.4]],
        [4.0, 0.42, [1.5, 1.1, 0.75]], [4.9, 0.34, [1.5, 1.3, 0.9]], [5.6, 0.26, [0.6, 1.4, 1.5]], [6.2, 0.25, [0.5, 0.7, 1.7]]];
      PLANETS.forEach(([r, size, rgb], i) => {
        glow(new THREE.TorusGeometry(r, 0.012, 3, 96).rotateX(Math.PI / 2).translate(sx, sy, sz), [0.3, 0.6, 0.7]);   // its way round
        const speed = round(r, 1), start = SO.range(0, Math.PI * 2);
        orbiting(new THREE.IcosahedronGeometry(size, 1).translate(sx + r, sy, sz), rgb, [sx, sz], speed, start);
        if (i === 2) orbiting(new THREE.IcosahedronGeometry(0.06, 0).translate(sx + r + 0.42, sy + 0.08, sz), [1.4, 1.4, 1.4], [sx, sz], speed, start);
        if (i === 5) orbiting(new THREE.TorusGeometry(size * 1.75, size * 0.18, 3, 24).rotateX(Math.PI / 2 - 0.45).translate(sx + r, sy, sz), [1.2, 1.05, 0.75], [sx, sz], speed, start);
      });
      for (let k = 0; k < 46; k++) {                                            // the belt
        const r = SO.range(3.2, 3.55);
        orbiting(new THREE.IcosahedronGeometry(SO.range(0.03, 0.07), 0).translate(sx + r, sy + SO.range(-0.12, 0.12), sz), [0.8, 0.85, 0.9], [sx, sz], round(r, 1), SO.range(0, Math.PI * 2));
      }
    }
    for (const [da, dz] of [[-4, -3], [-4, 3], [4, 0]]) emitters.push({ x: X(ma + da), y: F + 0.3, z: c + dz, nx: -s * Math.sign(da) * 0.5, ny: 0.8, nz: -Math.sign(dz) * 0.3, power: 1.0, reach: 9, tint: 0.1 });

    // ---- the sunken plaza: steps down, then a narrow stretch between the corner buildings, then wide
    const holes = [[A0, AW, -NARROW, NARROW], [AW, AE, -WIDE, WIDE]];
    holes.forEach(([a0, a1, d0, d1], i) => shared.uHoles.value[i].set(...sorted(X(a0), X(a1)), c + d0, c + d1));
    shared.uHoleFloor.value = [200, DEEP];                                     // (the rain's splashes: none on the steps)
    shared.uHoleRing.value.set(X(RC), c, RO + 0.3);                             // (and none of the street's ground across the round hall)
    const n = 24, rise = -DEEP / n, tread = (A1 - A0) / n;
    for (let i = 0; i < n; i++) {
      const top = -i * rise, a0 = A0 + i * tread;
      props(box(X(a0), X(a0 + tread), DEEP, top, c - NARROW, c + NARROW), 0.72, TINT.stone);
      if (i % 2 === 0) glow(box(X(a0) - 0.02, X(a0) + 0.02, top - 0.03, top, c - NARROW + 0.4, c + NARROW - 0.4), DIM);
    }
    floorAt(X(A0), X(A1), c - NARROW, c + NARROW, (x) => DEEP * THREE.MathUtils.clamp((Math.abs(x) - A0) / (A1 - A0), 0, 1), true);
    // its floor: wet paving with puddles that mirror what is above (when one is down here), two lines of light
    // along it (toon.js groundMaterial, kind 3; nothing else drawn under it, or the two would flicker in each other)
    for (const [a0, a1, d] of [[A1, AW, NARROW], [AW, AE, WIDE]]) {
      floorAt(X(a0), X(a1), c - d, c + d, () => DEEP, true);
      sunken.push(new THREE.PlaneGeometry(a1 - a0, 2 * d).rotateX(-Math.PI / 2).translate(X((a0 + a1) / 2), DEEP, c));
    }
    shared.uSunkLines.value.set(c, 4.2);
    // and on under the ring's curved front, round to the stepped-back wings, and under the tree (a hair lower,
    // clear of the galleries' own floor)
    props(box(X(AE), X(RC + RO + 1), DEEP - 0.1, DEEP - 0.004, c - RO - 1.5, c + RO + 1.5), 0.42, TINT.stone);
    // its walls in layers of rock; a glass railing along the narrow stretch, the corner buildings behind
    for (const f of [-1, 1]) {
      const z = c + f * NARROW;
      for (let y = DEEP, k = 0; y < 0; k++) {
        const h = Math.min(Q.range(0.5, 1.0), -y), [al, hex] = STRATA[k % STRATA.length];
        props(box(X(A0), X(AW), y, y + h, ...sorted(z - f * Q.range(0, 0.1), z + f * 0.4)), al - 0.15, T(hex));
        y += h;
      }
      props(box(X(A0), X(AW), -0.05, 0.12, ...sorted(z, z + f * 0.5)), 0.82, TINT.stone);
      glow(box(X(A0), X(AW), 0.12, 1.2, z + f * 0.25 - 0.02, z + f * 0.25 + 0.02), DIM);
      glow(box(X(A0), X(AW), 1.18, 1.22, z + f * 0.25 - 0.04, z + f * 0.25 + 0.04), CYAN);
      wall(X(A0 - 0.5), X(AW), ...sorted(z - f * 0.1, z + f * 0.5), -0.6, 4);
      wall(X(A0), X(AW), ...sorted(z - f * 0.25, z + f * 0.5), -7, -0.6);
      // where it opens out: a wall across, down to the plaza
      props(box(X(AW - 0.4), X(AW), DEEP, 0.1, ...sorted(z, c + f * WIDE)), 0.6, T('#c9a77a'));
      wall(X(AW - 0.5), X(AW + 0.2), ...sorted(z, c + f * WIDE), -7, 4);
    }
    // trees in planters, benches, lamps; people about
    for (const [a, dz] of [[62, -6], [62, 6], [76, -14], [76, 14], [90, -14], [90, 14]]) {
      props(new THREE.CylinderGeometry(1.0, 1.05, 0.5, 20).translate(X(a), DEEP + 0.25, c + dz), 0.8, TINT.stone);
      tree(X(a), DEEP + 0.5, c + dz, 0.9, Q);
    }
    G = DEEP;
    for (const [a, dz] of [[70, -6], [70, 6], [84, -6], [84, 6]]) bench(X(a), c + dz, 2.4);
    G = CURB;
    for (const [a, dz] of [[60, -9.6], [60, 9.6], [80, -19.6], [80, 19.6], [94, -19.6], [94, 19.6]]) {
      props(new THREE.CylinderGeometry(0.06, 0.09, 4.2, 8).translate(X(a), DEEP + 2.1, c + dz), 0.6);
      glow(new THREE.SphereGeometry(0.22, 12, 8).translate(X(a), DEEP + 4.3, c + dz), WARM);
      lamps.push({ x: X(a), y: DEEP + 4.1, z: c + dz, power: 0.9 });
    }
    for (let i = 0; i < 9; i++) people.push({ x: X(Q.range(A1 + 2, AE - 3)), y: DEEP, z: c + Q.range(-9, 9), rot: Q.range(0, 6.3), umbrella: true });
    for (let i = 0; i < 3; i++) { const a = Q.range(A0 + 1, A1 - 1); people.push({ x: X(a), y: DEEP * (a - A0) / (A1 - A0), z: c + Q.range(-8, 8), rot: Q.range(0, 6.3), umbrella: true }); }
    // flower beds between the benches and the trees, either side of the way to the door (their own numbers)
    const RBD = makeRandom(3500);
    for (const [a0, a1] of [[71.8, 73.8], [86.8, 88.8]]) for (const f of [-1, 1]) flowerBed(s, a0, a1, ...sorted(c + f * 7.6, c + f * 12.6), DEEP, RBD);

    // ---- the wings, either side of the wide plaza: windows onto dioramas below, layers of rock above
    for (const f of [-1, 1]) {
      const zi = c + f * WIDE, zo = c + f * WING, [z0, z1] = sorted(zi, zo);
      const da0 = AW + 3, da1 = AE - 2, dy1 = DEEP + 4.2, back = c + f * (WIDE + 2.4);
      // up to the museum's front (beyond: its main block); (its old stepped-back end drawn for its numbers only)
      const zr = c + f * (RO + 1.5);
      banded(...sorted(X(AW), X(AR)), z0, z1, 0, 15, true, 0.3);
      muted(() => banded(...sorted(X(AR), X(RC + 4)), ...sorted(zr, zo), DEEP, 15, true, 0.3));
      // below the street: solid, but for the diorama's deep window
      banded(...sorted(X(AW), X(AR)), ...sorted(back, zo), DEEP, 0, false);
      for (const [a0, a1] of [[AW, da0], [da1, AR]]) banded(...sorted(X(a0), X(a1)), ...sorted(zi, back), DEEP, 0, false);
      props(box(X(da0), X(da1), dy1 + 0.3, 0, ...sorted(zi, back)), 0.55, T('#c9a77a'));
      // a planted terrace on the wing's top, its parapet lit
      for (let i = 0; i < 4; i++) {
        let a = Q.range(AW + 4, AE);
        const dz = Q.range(WIDE + 3, WING - 3);
        if (f < 0 && a < AW + 9 && dz < WIDE + 8) a = AW + 9;                   // clear of the lantern tower on its corner
        tree(X(a), 15, c + f * dz, Q.range(0.9, 1.3), Q);
      }
      boxCollider(...sorted(X(AW), X(AR)), z0, z1);
      // the diorama: deep behind glass, lit from within; a reef on one side, a rainforest on the other
      const reef = f > 0;
      // (its lit backdrop just in front of the wall behind, not on it: the two would flicker in each other)
      shown(box(X(da0), X(da1), DEEP + 0.3, dy1, ...sorted(back - f * 0.08, back - f * 0.03)), reef ? [0.25, 0.85, 1.25] : [0.45, 1.05, 0.75]);
      ip(box(X(da0), X(da1), DEEP, DEEP + 0.3, ...sorted(zi, back)), 0.5, reef ? T('#c9b48a') : T('#4a3a2c'));
      for (let a = da0 + 0.8; a < da1 - 0.5; a += Q.range(0.8, 1.6)) {
        const dz = f * Q.range(WIDE + 0.6, WIDE + 2.2);
        if (reef) {
          ip(new THREE.IcosahedronGeometry(Q.range(0.25, 0.6), 0).scale(1, Q.range(0.8, 2.2), 1).translate(X(a), DEEP + 0.35, c + dz), 0.5, T(Q.pick(['#ff8fab', '#ffd166', '#c77dff', '#ff7b54'])));
          if (Q.chance(0.4)) glow(new THREE.ConeGeometry(0.08, 0.3, 5).rotateZ(Math.PI / 2).translate(X(a), DEEP + Q.range(1.2, 3.4), c + dz), [1.2, 1.5, 1.6]);
        } else {
          ip(new THREE.CylinderGeometry(0.08, 0.14, Q.range(2, 4), 6).translate(X(a), DEEP + 1.5, c + dz), 0.35, TINT.bark);
          ip(new THREE.IcosahedronGeometry(Q.range(0.5, 1.0), 1).scale(1, 0.7, 1).translate(X(a), DEEP + Q.range(2.4, 3.8), c + dz), 0.45, TINT.leaf);
        }
      }
      for (let a = da0; a <= da1; a += (da1 - da0) / 6) props(box(X(a) - 0.06, X(a) + 0.06, DEEP, dy1 + 0.3, ...sorted(zi - f * 0.1, zi + f * 0.1)), 0.3);
      props(box(X(da0), X(da1), dy1, dy1 + 0.3, ...sorted(zi - f * 0.15, zi + f * 0.1)), 0.3);
      emitters.push({ x: X((da0 + da1) / 2), y: DEEP + 2, z: zi - f * 0.6, nx: 0, ny: 0, nz: -f, power: 1.0, reach: 14, tint: reef ? 0.8 : 0.4 });
    }

    // ---- the hall: round, open from the plaza's floor up to the roof (HROOF), the Tree of Life in its middle.
    // Round its wall the walk through time climbs as a ramp, from GATE (left of the way in) round behind the tree
    // to the far side, up to the first floor (L1); there a deck runs on over the way in, out to the great window
    // in the museum's front. Over the tree, out of the square roof, a drum of glass, its top cut on a slant:
    // highest (TOP + TILT) at the angle PEAK.
    const [cx, cz] = polar(0, 0), HROOF = 17, L1 = 5.5, RP = 14.8, GATE = 0.62, FRONT = 0.27;
    const TOP = 27, TILT = 3, PEAK = 1.1, ABACK = RC + 26;
    const STONE = T('#d8d0bf'), SLATE = T('#3d4b5a'), W = makeRandom(3400);
    const topAt = (th) => TOP + TILT * Math.cos(th - PEAK);
    // the slant's height over (x, z); the angle a three.js cylinder or turn puts at th; th at (x, z) (0 to 2 pi)
    const slantAt = (x, z) => TOP + (TILT / RI) * (-s * (x - cx) * Math.cos(PEAK) + (z - cz) * Math.sin(PEAK));
    const thetaOf = (th) => (s < 0 ? Math.PI / 2 - th : th - Math.PI / 2);
    const arcStart = (half) => (s < 0 ? Math.PI / 2 + half : -Math.PI / 2 + half);   // a cylinder open round th = 0
    const angleAt = (x, z) => { const t = Math.atan2(z - cz, -s * (x - cx)); return t < 0 ? t + Math.PI * 2 : t; };
    const toFront = (th) => (RC - AE) / Math.cos(th);                          // out to the museum's front at th
    // the ramp's height round the hall
    const rampY = (th) => DEEP + THREE.MathUtils.clamp((th - GATE) / (Math.PI * 2 - 2 * GATE), 0, 1) * (L1 - DEEP);

    // surfaces round the centre, built from points (props and glow need an index, normals, uvs), turned to face `want`
    const sheet = (n, m, at, want) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { pos.push(...at(i / n, j / m)); uv.push(i / n, j / m); }
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const p = i * (m + 1) + j, q = p + m + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const nm = g.attributes.normal;
      if (nm.getX(0) * want[0] + nm.getY(0) * want[1] + nm.getZ(0) * want[2] < 0) {
        for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
        g.setIndex(idx);
        g.computeVertexNormals();
      }
      return g;
    };
    const steps = (th0, th1) => Math.max(4, Math.ceil(Math.abs(th1 - th0) * 24));
    const flat = (y) => () => y;
    // flat round the centre, from r0(th) to r1(th), th0 to th1, at y(th), facing up (or down)
    const band = (r0, r1, th0, th1, y, down = false) => {
      const R0 = typeof r0 === 'function' ? r0 : () => r0, R1 = typeof r1 === 'function' ? r1 : () => r1, Y = typeof y === 'function' ? y : flat(y);
      return sheet(steps(th0, th1) * 2, 1, (u, v) => {
        const th = th0 + (th1 - th0) * u, [x, z] = polar(R0(th) + (R1(th) - R0(th)) * v, th);
        return [x, Y(th), z];
      }, [0, down ? -1 : 1, 0]);
    };
    // upright, at r, from y0(th) to y1(th), facing out (or in)
    const curve = (r, th0, th1, y0, y1, inward = false) => {
      const Y0 = typeof y0 === 'function' ? y0 : flat(y0), Y1 = typeof y1 === 'function' ? y1 : flat(y1);
      const [ox, oz] = polar(1, th0), k = inward ? -1 : 1;
      return sheet(steps(th0, th1) * 2, 1, (u, v) => {
        const th = th0 + (th1 - th0) * u, [x, z] = polar(r, th);
        return [x, Y0(th) + (Y1(th) - Y0(th)) * v, z];
      }, [(ox - cx) * k, 0, (oz - cz) * k]);
    };
    // something built across x, out along z (from the centre), turned to stand at th
    const radial = (th) => (g) => g.rotateY(thetaOf(th)).translate(cx, 0, cz);

    // the glass drum over the tree, out of the roof: its mullions, rings, slanted lit rim, a shallow dome on it
    for (let k = 0; k < 24; k++) {
      const th = (k / 24) * Math.PI * 2, [x, z] = polar(RI, th), top = topAt(th);
      props(new THREE.CylinderGeometry(0.09, 0.09, top - HROOF, 6).translate(x, (top + HROOF) / 2, z), 0.85);
    }
    for (const y of [HROOF + 0.45, HROOF + 4]) glow(new THREE.TorusGeometry(RI, 0.05, 4, 72).rotateX(Math.PI / 2).translate(cx, y, cz), DIM);
    {
      const rim = [];
      for (let k = 0; k < 48; k++) { const th = (k / 48) * Math.PI * 2, [x, z] = polar(RI, th); rim.push(new THREE.Vector3(x, topAt(th), z)); }
      glow(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 144, 0.12, 4, true), CYAN);
      const roof = new THREE.CircleGeometry(RI + 0.4, 48).rotateX(-Math.PI / 2).translate(cx, 0, cz), p = roof.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x - cx, z - cz) / (RI + 0.4);
        p.setY(i, slantAt(x, z) + 1.4 * (1 - r * r));
      }
      roof.computeVertexNormals();
      props(roof, 0.85, TINT.white);
      glow(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).translate(cx, TOP + 2, cz), WARM);                     // its lantern
    }
    covers.push({ ...xzBox(cx - RI, cx + RI, cz - RI, cz + RI), y: TOP - TILT });                                // no rain in under the glass

    // the Tree of Life: buttressed trunk, a great crown (trees.js, with its lights and rings), ring lights hung round it
    trees.push({ x: cx, y: DEEP, z: cz, h: 30, r: 9.5, lights: true, bands: true });
    ip(new THREE.CylinderGeometry(1.1, 2.0, 12, 12).translate(cx, DEEP + 6, cz), 0.45, TINT.bark);
    for (let k = 0; k < 7; k++) {
      const th = (k / 7) * Math.PI * 2 + 0.3, [x, z] = polar(2.4, th);
      ip(new THREE.ConeGeometry(0.9, 3.2, 5).rotateZ(Math.PI / 2 * 0.55).rotateY(-th + (s < 0 ? 0 : Math.PI)).translate(x, DEEP + 1.0, z), 0.45, TINT.bark);
    }
    colliders.push({ x: cx, z: cz, r: 4.2, y0: -7, y1: HROOF });
    ip(new THREE.CylinderGeometry(4.6, 4.6, 0.45, 40, 1, true).translate(cx, DEEP + 0.22, cz), 0.6, TINT.wood);   // a ring bench round it
    ip(new THREE.RingGeometry(4.0, 4.6, 40).rotateX(-Math.PI / 2).translate(cx, DEEP + 0.45, cz), 0.75, TINT.wood);
    for (const [y, r] of [[7, 7.5], [11, 9]]) glow(new THREE.TorusGeometry(r, 0.07, 4, 80).rotateX(Math.PI / 2).translate(cx, y, cz), WARM);
    for (const [r, y] of [[6, 3], [9, 2]]) for (let k = 0; k < 4; k++) { const [x, z] = polar(r, (k / 4) * Math.PI * 2 + 0.4); lamps.push({ x, y, z, power: 0.7 }); }
    // its leaves alight: a few hundred glowing through the crown, like the Tree of Life it is
    for (let k = 0; k < 420; k++) {
      const u = Q.range(0, Math.PI * 2), v = Math.acos(Q.range(-0.6, 1)), rr = Math.cbrt(Q.next());
      const x = cx + Math.sin(v) * Math.cos(u) * 9.2 * rr, z = cz + Math.sin(v) * Math.sin(u) * 9.2 * rr, y = DEEP + 18.6 + Math.cos(v) * 9 * rr;
      glow(new THREE.IcosahedronGeometry(Q.range(0.06, 0.13), 0).translate(x, y, z), Q.chance(0.8) ? WARM : CYAN);
    }
    // and the tree lit: from high in the drum, and up from round its foot
    for (let k = 0; k < 4; k++) { const [x, z] = polar(10, (k / 4) * Math.PI * 2); lamps.push({ x, y: TOP - 4, z, power: 1.2 }); }
    for (let k = 0; k < 4; k++) {
      const th = (k / 4) * Math.PI * 2 + 0.78, [x, z] = polar(6.5, th), [tx, tz] = polar(0, 0);
      const dx = tx - x, dz2 = tz - z, l = Math.hypot(dx, dz2);
      emitters.push({ x, y: DEEP + 0.5, z, nx: dx / l * 0.45, ny: 0.89, nz: dz2 / l * 0.45, power: 1.3, reach: 26, tint: 0.2 });
    }
    // (the old drum's walls and roof garden, drawn for their numbers only)
    muted(() => {
      for (let y = 0; y < CEIL + 0.5;) y += Math.min(Q.range(1.0, 2.0), CEIL + 0.5 - y);
      for (let k = 0; k < 10; k++) { Q.range(RI + 3, RO - 2); Q.range(0.8, 5.5); tree(0, 0, 0, Q.range(0.8, 1.2), Q); }
    });

    // the hall's floor; its wall (below the deck open only for the way in, above it open onto the deck); the
    // wedges between it and the front either side of the deck closed; its ceiling out to the front, lit round
    ip(new THREE.RingGeometry(RI, RO, 72).rotateX(-Math.PI / 2).translate(cx, DEEP + 0.01, cz), 0.45, TINT.stone);
    ip(new THREE.CylinderGeometry(RO, RO, L1 - 0.5 - DEEP, 72, 1, true, arcStart(FRONT), Math.PI * 2 - 2 * FRONT).translate(cx, (L1 - 0.5 + DEEP) / 2, cz), 0.62, STONE);
    ip(new THREE.CylinderGeometry(RO, RO, HROOF - (L1 - 0.5), 72, 1, true, arcStart(GATE), Math.PI * 2 - 2 * GATE).translate(cx, (HROOF + L1 - 0.5) / 2, cz), 0.62, STONE);
    for (const e of [-1, 1]) ip(radial(e * GATE)(box(-0.15, 0.15, DEEP, HROOF, RO, toFront(GATE) + 0.2)), 0.62, STONE);
    // (a hair under the roof: the tall block's foot is at HROOF over part of it, and the two would flicker in each other)
    ip(band(RI, RO, 0, Math.PI * 2, HROOF - 0.03, true), 0.6);
    ip(band(RO, (th) => toFront(th) - 0.3, -GATE, GATE, HROOF - 0.03, true), 0.6);
    for (let k = 0; k < 64; k++) {
      const th = (k / 64) * Math.PI * 2, [x, z] = polar(17.5, th);
      glow(box(x - 0.25, x + 0.25, HROOF - 0.08, HROOF - 0.04, z - 0.25, z + 0.25), WARM);
    }
    covers.push({ ...xzBox(...sorted(X(AE), X(ABACK)), c - WING, c + WING), y: HROOF, room: true });

    // the ramp: its floor and underside, its parapet toward the tree (a handrail of light along it), the line of
    // time on its floor
    const RAMP = [GATE, Math.PI * 2 - GATE], up = (dy) => (th) => rampY(th) + dy;
    ip(band(RP, RO - 0.05, ...RAMP, up(0)), 0.5, TINT.stone);
    ip(band(RP, RO - 0.05, ...RAMP, up(-0.45), true), 0.6);
    ip(curve(RP, ...RAMP, up(-0.45), up(1.0), true), 0.65, STONE);
    ip(curve(RP + 0.15, ...RAMP, up(0), up(1.0)), 0.65, STONE);
    ip(band(RP, RP + 0.15, ...RAMP, up(1.0)), 0.65, STONE);
    glow(band(18.9, 19.1, ...RAMP, up(0.02)), CYAN);
    const rail = [];
    for (let th = RAMP[0]; th <= RAMP[1] + 1e-6; th += 0.05) { const [x, z] = polar(RP + 0.075, th); rail.push(new THREE.Vector3(x, rampY(th) + 1.04, z)); }
    for (let th = -GATE + 0.05; th <= GATE + 1e-6; th += 0.05) { const [x, z] = polar(RP + 0.075, th); rail.push(new THREE.Vector3(x, L1 + 1.04, z)); }
    glow(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), rail.length * 2, 0.035, 4, false), WARM);

    // the deck: on from the ramp's top over the way in, out to the front's glass; its parapet, its end over the
    // ramp's foot, a low wall along the glass
    ip(band(RP, (th) => toFront(th) - 0.3, -GATE, GATE, L1), 0.55, TINT.wood);
    ip(band(RP, (th) => toFront(th) - 0.3, -GATE, GATE, L1 - 0.45, true), 0.6);
    ip(curve(RP, -GATE, GATE, L1 - 0.45, L1 + 1.0, true), 0.65, STONE);
    ip(curve(RP + 0.15, -GATE, GATE, L1, L1 + 1.0), 0.65, STONE);
    ip(band(RP, RP + 0.15, -GATE, GATE, L1 + 1.0), 0.65, STONE);
    ip(radial(GATE)(box(-0.08, 0.08, L1, L1 + 1.0, RP, toFront(GATE) - 0.3)), 0.65, STONE);
    ip(box(...sorted(X(AE + 0.05), X(AE + 0.3)), L1, L1 + 1.0, c - toFront(GATE) * Math.sin(GATE), c + toFront(GATE) * Math.sin(GATE)), 0.65, STONE);
    for (let k = 0; k < 4; k++) {                                               // people up on it, looking out, or at the tree
      const th = W.range(-GATE + 0.1, GATE - 0.1), [x, z] = polar(W.range(16, 21), th);
      people.push({ x, y: L1, z, rot: W.range(0, Math.PI * 2), umbrella: false });
    }
    for (const th of [-0.35, 0.35]) { const [x, z] = polar(20, th); lamps.push({ x, y: L1 + 3.5, z, power: 0.8 }); }

    // walking it: the hall's floor, the ramp, the deck (one stands on the highest within a step of one's feet)
    const hallRect = [...sorted(X(RC - RO - 1), X(RC + RO + 1)), cz - RO - 1, cz + RO + 1];
    floorAt(...hallRect, () => DEEP, true);
    floorAt(...hallRect, (x, z) => {
      const r = Math.hypot(x - cx, z - cz), th = angleAt(x, z);
      return r >= RP - 0.2 && r <= RO && th >= RAMP[0] && th <= RAMP[1] ? rampY(th) : -Infinity;
    }, true);
    floorAt(...sorted(X(AE), X(RC)), cz - 16, cz + 16, (x, z) => {
      const r = Math.hypot(x - cx, z - cz), th = angleAt(x, z), t = th > Math.PI ? th - Math.PI * 2 : th;
      return r >= RP - 0.2 && Math.abs(t) <= GATE ? L1 : -Infinity;
    }, true);
    // kept in: by the hall's wall (but for the way in below the deck, and the deck itself above it)
    for (let k = 0; k < 140; k++) {
      const th = (k / 140) * Math.PI * 2, t = Math.atan2(Math.sin(th), Math.cos(th));
      if (Math.abs(t) < FRONT) continue;
      const [x, z] = polar(RO + 0.6, th);
      colliders.push({ x, z, r: 0.75, y0: -7, y1: Math.abs(t) < GATE ? L1 - 0.5 : HROOF });
    }
    // by the ramp's parapet (open at its foot), the deck's (for those up on it), the deck's ends and its glass;
    // and under the ramp's high end, from below the deck, closed
    for (let th = RAMP[0] + 0.25; th <= RAMP[1]; th += 0.03) { const [x, z] = polar(RP - 0.1, th); colliders.push({ x, z, r: 0.35, y0: -7, y1: HROOF }); }
    for (let th = -GATE; th <= GATE; th += 0.03) { const [x, z] = polar(RP - 0.1, th); colliders.push({ x, z, r: 0.35, y0: L1 - 0.5, y1: HROOF }); }
    for (let r = RP; r <= toFront(GATE); r += 0.5) { const [x, z] = polar(r, GATE + 0.03); colliders.push({ x, z, r: 0.3, y0: L1 - 0.5, y1: HROOF }); }
    for (let r = RO; r <= toFront(GATE); r += 0.5) { const [x, z] = polar(r, -GATE - 0.03); colliders.push({ x, z, r: 0.3, y0: L1 - 0.5, y1: HROOF }); }
    wall(...sorted(X(AE - 0.3), X(AE + 0.35)), c - 16, c + 16, L1 - 0.5, HROOF);
    for (let r = RP; r <= RO; r += 0.5) { const [x, z] = polar(r, -GATE - 0.06); colliders.push({ x, z, r: 0.35, y0: -7, y1: DEEP + 1 }); }

    // ---- the museum's faces: lit cases of specimens, the way a museum shows itself (with their own random
    // numbers, so all else stays as it was). On each wing's face onto the plaza, over its diorama: a slim ledge,
    // a row of cases, and above them one great backlit window (the deep sea; dusk with pterosaurs) beside fins
    // over light, the window at the far end on one wing and at the near end on the other. On the rainforest
    // wing's roof, at its corner, a lantern tower with a weather mast. Down the steps, fossils set in the rock
    // walls, the older the deeper. (The museum's front, and its cases, below.)
    const V = makeRandom(3300), METAL = T('#3d4b5a'), AMBER = [1.05, 0.75, 0.42], DARK = T('#1c1a28'), BONE = T('#e9dfc8');
    const hexes = (...list) => list.map(T);
    const BUTTER = hexes('#ff5f8a', '#ffd166', '#3a86ff', '#c77dff', '#ff7b54', '#2a9d8f', '#ffffff');
    const BEETLES = hexes('#2a9d8f', '#80b918', '#3a86ff', '#1b1f2a', '#c9a227', '#8c2f39');
    const EGGS = hexes('#f2efe6', '#bfe3e0', '#d9c3a0', '#9fc6d9', '#e8d8c0');
    const SHELLS = hexes('#f2e0c8', '#e8b4a0', '#d9a066', '#fff4e6', '#c98f8f');
    const URCHINS = hexes('#6b4f7a', '#8c2f39', '#2f4a6b', '#c77dff'), STARFISH = hexes('#ff7b54', '#f4a261', '#e63946');
    // where things go on a face: built round x = 0 along it, y as it is, z out of it toward the one looking
    const onWing = (f, a) => (g) => g.rotateY(f > 0 ? Math.PI : 0).translate(X(a), 0, c + f * WIDE);
    const onWall = (f, a) => (g) => g.rotateY(f > 0 ? Math.PI : 0).translate(X(a), 0, c + f * (NARROW - 0.1));
    const SKIN = AE - 0.3, onSkin = (dz) => (g) => g.rotateY(-s * Math.PI / 2).translate(X(SKIN), 0, c + dz);   // the museum's front
    // a case: its lit back a little off the face (never on it: the two would flicker), a frame of dark metal
    // round it, a line of light along its sill; light null: its back is drawn by what is in it
    const showcase = (at, w, y0, y1, light, depth = 0.7, rim = 0.18) => {
      if (light) shown(at(box(-w / 2, w / 2, y0, y1, 0.06, 0.1)), light);
      for (const g of [box(-w / 2 - rim, w / 2 + rim, y0 - rim, y0, 0, depth), box(-w / 2 - rim, w / 2 + rim, y1, y1 + rim, 0, depth),
        box(-w / 2 - rim, -w / 2, y0, y1, 0, depth), box(w / 2, w / 2 + rim, y0, y1, 0, depth)]) props(at(g), 0.3, METAL);
      glow(at(box(-w / 2, w / 2, y0 - 0.04, y0, depth - 0.05, depth)), PALE_LIGHT);
    };
    // a back in bands of light, darker going up, as the sky or the sea does
    const bands = (at, w, y0, y1, list) => list.forEach((rgb, i) =>
      shown(at(box(-w / 2, w / 2, y0 + (y1 - y0) * i / list.length, y0 + (y1 - y0) * (i + 1) / list.length, 0.06, 0.1)), rgb));
    // an ammonite: whorls inside whorls, standing on edge
    const ammonite = (r) => mergeGeometries([0, 1, 2, 3].map((k) => {
      const rr = r * Math.pow(0.6, k);
      return new THREE.TorusGeometry(rr * 0.78, rr * 0.22, 6, 28).translate((r - rr) * 0.25, 0, 0);
    }));

    // what is in the cases: the light of its back, and how it is filled (at: onto the face, w wide, y0 to y1)
    const SPECIMENS = {
      butterflies: [[1.1, 0.85, 0.5], (at, w, y0, y1) => {                        // pinned in rows
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          const x = -w / 2 + (i + 0.5) * w / 4, y = y0 + (j + 0.5) * (y1 - y0) / 3, k = V.range(0.75, 1.2), tint = V.pick(BUTTER);
          for (const e of [-1, 1]) {
            const dz = e * 0.004;
            ip(at(new THREE.BoxGeometry(0.26 * k, 0.18 * k, 0.02).rotateZ(e * 0.45).translate(x + e * 0.13 * k, y + 0.06 * k, 0.17 + dz)), 0.75, tint);
            ip(at(new THREE.BoxGeometry(0.16 * k, 0.14 * k, 0.02).rotateZ(-e * 0.6).translate(x + e * 0.09 * k, y - 0.09 * k, 0.145 + dz)), 0.75, tint);
          }
          ip(at(new THREE.BoxGeometry(0.035, 0.24 * k, 0.04).translate(x, y, 0.19)), 0.2, DARK);
        }
      }],
      insects: [[0.75, 1.0, 0.35], (at, w, y0, y1) => {                           // beetles, pinned
        for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
          const x = -w / 2 + (i + 0.5) * w / 5, y = y0 + (j + 0.5) * (y1 - y0) / 3, k = V.range(0.65, 1.2);
          ip(at(new THREE.SphereGeometry(0.1 * k, 10, 6).scale(0.8, 1.3, 0.5).translate(x, y - 0.03 * k, 0.17)), 0.55, V.pick(BEETLES));
          ip(at(new THREE.SphereGeometry(0.05 * k, 8, 5).translate(x, y + 0.13 * k, 0.17)), 0.3, DARK);
          for (const e of [-1, 1]) for (const d of [-1, 0, 1]) {
            ip(at(new THREE.BoxGeometry(0.13 * k, 0.012, 0.012).rotateZ(e * d * 0.5).translate(x + e * 0.1 * k, y + d * 0.06 * k, 0.15)), 0.3, DARK);
          }
        }
      }],
      eggs: [[0.45, 1.0, 0.75], (at, w, y0, y1) => {                              // on two shelves
        for (const sy of [y0 + 0.06, y0 + (y1 - y0) * 0.52]) {
          ip(at(box(-w / 2, w / 2, sy - 0.06, sy, 0.11, 0.6)), 0.6, TINT.wood);
          for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += V.range(0.38, 0.6)) {
            const r = V.range(0.07, 0.17);
            ip(at(new THREE.SphereGeometry(r, 12, 8).scale(1, 1.3, 1).translate(x, sy + r * 1.3, V.range(0.28, 0.42))), 0.85, V.pick(EGGS));
          }
        }
      }],
      crystals: [[0.45, 0.3, 0.95], (at, w, y0) => {                              // clusters, alight, on their rock
        for (const x0 of [-w * 0.3, 0.05, w * 0.3]) {
          const rgb = V.pick([[1.5, 0.6, 1.4], [0.6, 1.4, 1.7], [1.2, 0.9, 1.7]]);
          ip(at(new THREE.IcosahedronGeometry(0.3, 0).scale(1.4, 0.55, 1).translate(x0, y0 + 0.16, 0.35)), 0.35, T('#5f6a75'));
          for (let k = V.int(4, 7); k > 0; k--) {
            const h = V.range(0.3, 0.95), r = V.range(0.04, 0.09);
            const g = mergeGeometries([new THREE.CylinderGeometry(r, r, h, 6).translate(0, h / 2, 0), new THREE.ConeGeometry(r, r * 2.2, 6).translate(0, h + r * 1.1, 0)]);
            shown(at(g.rotateZ(V.range(-0.6, 0.6)).rotateX(V.range(-0.3, 0.3)).translate(x0 + V.range(-0.22, 0.22), y0 + 0.22, 0.35)), rgb);
          }
        }
      }],
      skull: [[0.7, 0.85, 1.15], (at, w, y0, y1) => {                            // a sabre-toothed cat's, on a stand
        const y = y0 + (y1 - y0) * 0.58;
        ip(at(box(-0.5, 0.5, y0, y0 + 0.1, 0.15, 0.6)), 0.3, METAL);
        ip(at(box(-0.05, 0.05, y0 + 0.1, y - 0.42, 0.28, 0.38)), 0.3, METAL);
        ip(at(new THREE.SphereGeometry(0.42, 16, 10).scale(1.25, 0.8, 0.7).translate(-0.18, y + 0.06, 0.33)), 0.85, BONE);
        ip(at(new THREE.BoxGeometry(0.6, 0.26, 0.4).translate(0.4, y - 0.08, 0.33)), 0.85, BONE);
        ip(at(new THREE.BoxGeometry(0.78, 0.08, 0.3).rotateZ(-0.12).translate(0.12, y - 0.38, 0.33)), 0.85, BONE);
        for (const dz of [0.2, 0.46]) ip(at(new THREE.ConeGeometry(0.045, 0.62, 6).rotateX(Math.PI).translate(0.48, y - 0.5, dz)), 0.9, BONE);
        ip(at(new THREE.SphereGeometry(0.09, 8, 6).translate(0.02, y + 0.05, 0.58)), 0.1, DARK);
      }],
      meteorite: [[0.15, 0.25, 0.8], (at, w, y0, y1) => {                        // under stars, and a slice of one
        for (let k = 0; k < 28; k++) shown(at(new THREE.IcosahedronGeometry(V.range(0.012, 0.03), 0).translate(V.range(-w / 2, w / 2), V.range(y0 + 0.4, y1 - 0.05), 0.12)), [1.6, 1.6, 1.7]);
        const rock = new THREE.IcosahedronGeometry(0.5, 1), p = rock.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const k = 0.8 + 0.35 * Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7));
          p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k * 0.6);
        }
        rock.computeVertexNormals();
        ip(at(rock.translate(-0.55, y0 + 0.5, 0.36)), 0.3, T('#4a4440'));
        ip(at(box(-1.0, 0.0, y0, y0 + 0.1, 0.12, 0.62)), 0.3, METAL);
        ip(at(box(0.62, 0.68, y0, y0 + 0.75, 0.3, 0.36)), 0.3, METAL);
        shown(at(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 28).rotateX(Math.PI / 2).translate(0.65, y0 + 1.1, 0.38)), [1.25, 1.2, 1.1]);
      }],
      shells: [[1.05, 0.55, 0.5], (at, w, y0, y1) => {                           // on two shelves
        for (const sy of [y0 + 0.06, y0 + (y1 - y0) * 0.52]) {
          ip(at(box(-w / 2, w / 2, sy - 0.06, sy, 0.11, 0.6)), 0.6, TINT.wood);
          for (let x = -w / 2 + 0.35; x < w / 2 - 0.25; x += V.range(0.5, 0.75)) {
            const r = V.range(0.12, 0.22);
            if (V.chance(0.5)) ip(at(ammonite(r).translate(x, sy + r + 0.01, 0.32)), 0.8, V.pick(SHELLS));
            else ip(at(new THREE.ConeGeometry(r * 0.75, r * 2.6, 10).translate(x, sy + r * 1.3, 0.34)), 0.8, V.pick(SHELLS));
          }
        }
      }],
      urchins: [[0.2, 0.85, 0.95], (at, w, y0, y1) => {                          // starfish on the back, urchins below
        for (let k = 0; k < 5; k++) {
          const x = V.range(-w / 2 + 0.4, w / 2 - 0.4), y = V.range(y0 + 1.3, y1 - 0.4), r = V.range(0.18, 0.3), tint = V.pick(STARFISH), turn = V.range(0, 1.3);
          for (let j = 0; j < 5; j++) ip(at(new THREE.BoxGeometry(r, r * 0.32, 0.04).translate(r / 2, 0, 0).rotateZ(turn + j * Math.PI * 2 / 5).translate(x, y, 0.13 + j * 0.01)), 0.7, tint);
        }
        const up = new THREE.Vector3(0, 1, 0);
        for (let x = -w / 2 + 0.4; x < w / 2 - 0.3; x += V.range(0.6, 0.9)) {
          const r = V.range(0.1, 0.18), parts = [new THREE.SphereGeometry(r, 10, 7)];
          for (let j = 0; j < 16; j++) {
            const d = new THREE.Vector3(V.range(-1, 1), V.range(-0.3, 1), V.range(-1, 1)).normalize();
            parts.push(new THREE.ConeGeometry(0.014, r * 1.3, 4).translate(0, r * 1.6, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d)));
          }
          ip(at(mergeGeometries(parts).translate(x, y0 + r, 0.36)), 0.6, V.pick(URCHINS));
        }
      }],
    };
    // the great windows
    const deepSea = (at, w, y0, y1) => {                                        // jellyfish, alight, in the dark
      bands(at, w, y0, y1, [[0.12, 0.45, 0.85], [0.09, 0.34, 0.72], [0.06, 0.24, 0.58], [0.04, 0.15, 0.44]]);
      for (let k = 0; k < 40; k++) shown(at(new THREE.IcosahedronGeometry(V.range(0.015, 0.04), 0).translate(V.range(-w / 2, w / 2), V.range(y0 + 0.2, y1 - 0.2), V.range(0.12, 0.5))), [0.7, 1.4, 1.6]);
      for (let k = 0; k < 9; k++) {
        const r = V.range(0.4, 0.9), x = -w / 2 + (k + 0.5) * w / 9 + V.range(-0.5, 0.5), y = V.range(y0 + 2.4 + r, y1 - 0.4 - r * 0.6), z = V.range(0.15 + r * 0.5, 0.9 - r * 0.5);
        const rgb = V.pick([[1.6, 0.7, 1.4], [0.95, 0.65, 1.7], [0.6, 1.6, 1.7]]), phase = k / 9 + V.range(0, 0.1);
        const bell = at(new THREE.SphereGeometry(r, 18, 8).scale(1, 0.6, 0.5).translate(x, y, z)), mid = new THREE.Vector3();
        bell.computeBoundingBox();
        bell.boundingBox.getCenter(mid);
        drifting(bell, rgb, mid.toArray(), phase);
        for (let j = 0; j < 7; j++) {
          const a = (j / 7) * Math.PI * 2, len = V.range(1.2, Math.min(2.8, y - y0 - 0.4));
          drifting(at(new THREE.CylinderGeometry(0.025, 0.035, len, 3, 6).translate(0, -len / 2, 0).rotateZ(V.range(-0.12, 0.12)).translate(x + Math.cos(a) * r * 0.7, y, z + Math.sin(a) * r * 0.35)), rgb.map((v) => v * 0.55), mid.toArray(), phase);
        }
      }
    };
    const dusk = (at, w, y0, y1) => {                                           // pterosaurs over a cycad forest
      bands(at, w, y0, y1, [[1.3, 0.62, 0.3], [1.05, 0.5, 0.45], [0.72, 0.4, 0.66], [0.42, 0.3, 0.75]]);
      shown(at(new THREE.CylinderGeometry(1.3, 1.3, 0.04, 40).rotateX(Math.PI / 2).translate(w * 0.18, y0 + 1.5, 0.13)), [1.8, 1.3, 0.7]);   // the sun, going down
      for (let x = -w / 2; x < w / 2; x += V.range(1.2, 2.4)) {
        ip(at(new THREE.SphereGeometry(V.range(1.0, 2.0), 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, V.range(0.4, 0.8), 0.25).translate(x, y0, 0.32)), 0.12, DARK);
      }
      for (let k = 0; k < 7; k++) {
        const x = V.range(-w / 2 + 0.8, w / 2 - 0.8), h = V.range(1.2, 2.6), z = V.range(0.45, 0.75);
        ip(at(new THREE.CylinderGeometry(0.06, 0.1, h, 6).translate(x, y0 + h / 2, z)), 0.12, DARK);
        for (let j = 0; j < 9; j++) {
          ip(at(new THREE.BoxGeometry(V.range(0.8, 1.3), 0.06, 0.06).translate(0.5, 0, 0).rotateZ(j % 2 ? -0.1 : -0.45).rotateY((j / 9) * Math.PI * 2).scale(1, 1, 0.25).translate(x, y0 + h, z)), 0.12, DARK);
        }
      }
      for (let k = 0; k < 5; k++) {
        const x = -w / 2 + (k + 0.5) * w / 5 + V.range(-0.8, 0.8), y = V.range(y0 + 3.4, y1 - 0.7), z = V.range(0.45, 0.75), size = V.range(0.7, 1.3), bank = V.range(-0.2, 0.2);
        const parts = [new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.8, 1.8), new THREE.ConeGeometry(0.05, 0.5, 4).translate(0, 0.35, -0.05)];
        for (const e of [0, Math.PI]) {
          parts.push(new THREE.BoxGeometry(0.85, 0.22, 0.03).translate(0.42, 0, 0).rotateZ(0.28).rotateY(e));
          parts.push(new THREE.BoxGeometry(1.0, 0.14, 0.03).translate(0.5, 0, 0).rotateZ(-0.25).translate(0.817, 0.235, 0).rotateY(e));
        }
        ip(at(mergeGeometries(parts).scale(size, size, size).rotateZ(bank).translate(x, y, z)), 0.12, DARK);
      }
    };
    const fins = (at, w, y0, y1) => {                                           // fins over light
      shown(at(box(-w / 2, w / 2, y0, y1, 0.06, 0.1)), [0.4, 0.62, 0.7]);
      for (let x = -w / 2 + 0.25; x < w / 2; x += 0.55) props(at(box(x - 0.06, x + 0.06, y0, y1, 0.1, 0.8)), 0.45, METAL);
    };

    for (const f of [-1, 1]) {
      const reef = f > 0, a0 = AW + 2, a1 = AE - 1.4, at = (a) => onWing(f, a);   // (a1: short of the museum's front)
      // a slim ledge over the diorama, lit along its edge
      props(box(X(AW), X(SKIN), -0.05, 0.25, ...sorted(c + f * WIDE, c + f * (WIDE - 0.7))), 0.5, METAL);
      glow(box(X(AW), X(SKIN), 0, 0.05, ...sorted(c + f * (WIDE - 0.72), c + f * (WIDE - 0.68))), CYAN);
      // the cases
      const order = reef ? ['shells', 'urchins', 'crystals', 'meteorite', 'eggs', 'skull', 'shells'] : ['butterflies', 'eggs', 'crystals', 'skull', 'insects', 'meteorite', 'butterflies'];
      const pitch = (a1 - a0) / order.length;
      order.forEach((kind, i) => {
        const [light, fill] = SPECIMENS[kind], a = a0 + (i + 0.5) * pitch, w = pitch - 0.9;
        showcase(at(a), w, 1.0, 3.9, light);
        fill(at(a), w, 1.0, 3.9);
      });
      // above: the great window (a golden share of the length) and the fins
      const gap = 1.2, big = (a1 - a0 - gap) * 0.618, rest = a1 - a0 - gap - big, Y0 = 6.2, Y1 = 13.2;
      const [w0, w1] = reef ? [a1 - big, a1] : [a0, a0 + big], [f0, f1] = reef ? [a0, a0 + rest] : [a1 - rest, a1];
      showcase(at((w0 + w1) / 2), w1 - w0, Y0, Y1, null, 1.0, 0.3);
      (reef ? deepSea : dusk)(at((w0 + w1) / 2), w1 - w0, Y0, Y1);
      for (let k = 1; k < 5; k++) props(at(w0 + (w1 - w0) * k / 5)(box(-0.07, 0.07, Y0, Y1, 0.9, 1.0)), 0.3, METAL);   // its mullions
      props(at((w0 + w1) / 2)(box(-(w1 - w0) / 2, (w1 - w0) / 2, 11.0, 11.12, 0.9, 1.0)), 0.3, METAL);                   // and transom
      showcase(at((f0 + f1) / 2), f1 - f0, Y0, Y1, null, 0.85, 0.3);
      fins(at((f0 + f1) / 2), f1 - f0, Y0, Y1);
      emitters.push({ x: X((w0 + w1) / 2), y: 9, z: c + f * (WIDE - 1.5), nx: 0, ny: -0.3, nz: -f, power: 1.0, reach: 18, tint: reef ? 0.8 : 0.3 });
    }

    // the lantern tower on the rainforest wing's roof: slats over a warm light, a cap, a weather mast
    {
      const f = -1, [x0, x1] = sorted(X(AW + 0.4), X(AW + 5.4)), [z0, z1] = sorted(c + f * (WIDE + 0.4), c + f * (WIDE + 5.4)), y0 = 15, top = 28;
      const SLAT = T('#d8d0bf');
      shown(box(x0 + 0.35, x1 - 0.35, y0, top, z0 + 0.35, z1 - 0.35), [1.0, 0.82, 0.55]);
      for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) props(box(px - 0.2, px + 0.2, y0, top, pz - 0.2, pz + 0.2), 0.4, METAL);
      for (let y = y0 + 0.5; y < top - 0.3; y += 0.5) {
        props(box(x0, x1, y, y + 0.14, z0 - 0.05, z0 + 0.3), 0.55, SLAT);
        props(box(x0, x1, y, y + 0.14, z1 - 0.3, z1 + 0.05), 0.55, SLAT);
        props(box(x0 - 0.05, x0 + 0.3, y, y + 0.14, z0 + 0.3, z1 - 0.3), 0.55, SLAT);
        props(box(x1 - 0.3, x1 + 0.05, y, y + 0.14, z0 + 0.3, z1 - 0.3), 0.55, SLAT);
      }
      props(box(x0 - 0.4, x1 + 0.4, top, top + 0.35, z0 - 0.4, z1 + 0.4), 0.5, METAL);
      glow(box(x0 - 0.42, x1 + 0.42, top + 0.3, top + 0.34, z0 - 0.42, z1 + 0.42), CYAN);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, mt = top + 4.5;
      props(new THREE.CylinderGeometry(0.06, 0.09, mt - top, 6).translate(mx, (top + mt) / 2, mz), 0.5, METAL);
      for (let k = 0; k < 3; k++) {                                             // the anemometer's arms and cups
        const a = k * Math.PI * 2 / 3;
        props(new THREE.BoxGeometry(0.7, 0.04, 0.04).translate(0.35, 0, 0).rotateY(a).translate(mx, mt - 0.6, mz), 0.5, METAL);
        props(new THREE.SphereGeometry(0.12, 10, 6).scale(1, 1, 0.6).translate(0.7, 0, 0).rotateY(a).translate(mx, mt - 0.6, mz), 0.6, TINT.white);
      }
      props(new THREE.BoxGeometry(0.9, 0.3, 0.03).translate(-0.3, 0, 0).translate(mx, mt - 1.6, mz), 0.5, METAL);    // a vane
      glow(new THREE.SphereGeometry(0.16, 10, 8).translate(mx, mt + 0.1, mz), [2.2, 0.35, 0.3], 0.37);               // a light, blinking
      lamps.push({ x: mx, y: top - 2, z: mz, power: 0.6 });
    }

    // down the steps, fossils in the walls: the youngest at the top, the oldest at the bottom
    const FOSSIL = T('#5e4c3a'), fp = (at, g, y) => ip(at(g.translate(0, y, 0.14)), 0.45, FOSSIL);
    const FOSSILS = {
      leaf: (at, y) => {
        fp(at, new THREE.SphereGeometry(0.2, 12, 8).scale(0.55, 1, 0.12).rotateZ(0.5), y);
        fp(at, new THREE.BoxGeometry(0.02, 0.24, 0.02).rotateZ(0.5).translate(0.15, -0.27, 0), y);
      },
      fish: (at, y) => {
        fp(at, new THREE.BoxGeometry(0.6, 0.025, 0.025), y);
        for (let k = 0; k < 7; k++) fp(at, new THREE.BoxGeometry(0.012, 0.16 - Math.abs(k - 3) * 0.02, 0.012).translate(-0.18 + k * 0.06, 0, -0.006), y);
        fp(at, new THREE.ConeGeometry(0.07, 0.16, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-0.36, 0, 0), y);
        for (const e of [-1, 1]) fp(at, new THREE.BoxGeometry(0.14, 0.02, 0.02).rotateZ(e * 0.6).translate(0.35, e * 0.04, 0), y);
      },
      ammonite: (at, y) => fp(at, ammonite(0.27).scale(1, 1, 0.5), y),
      fern: (at, y) => {
        fp(at, new THREE.BoxGeometry(0.02, 0.58, 0.02).rotateZ(0.08), y);
        for (let k = 0; k < 8; k++) {
          const len = 0.17 - k * 0.016, yy = -0.24 + k * 0.068;
          for (const e of [-1, 1]) fp(at, new THREE.BoxGeometry(len, 0.035, 0.02).translate(e * len / 2, 0, -0.01).rotateZ(e * 0.6).translate(-yy * 0.08, yy, 0), y);
        }
      },
      shell: (at, y) => {
        fp(at, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20).rotateX(Math.PI / 2).scale(1, 0.85, 1), y);
        for (let k = 0; k < 7; k++) fp(at, new THREE.BoxGeometry(0.014, 0.32, 0.01).translate(0, 0.16, 0.02).rotateZ((k - 3) * 0.22).translate(0, -0.17, 0), y);
      },
      trilobite: (at, y) => {
        fp(at, new THREE.SphereGeometry(0.2, 14, 8).scale(0.75, 1.1, 0.12), y - 0.04);
        fp(at, new THREE.SphereGeometry(0.17, 14, 8).scale(1.1, 0.55, 0.14).translate(0, 0.2, 0), y - 0.04);
        fp(at, new THREE.BoxGeometry(0.07, 0.36, 0.04).translate(0, -0.02, 0.02), y - 0.04);
        for (let k = 0; k < 7; k++) fp(at, new THREE.BoxGeometry(0.26 - Math.abs(k - 2) * 0.02, 0.018, 0.03).translate(0, -0.14 + k * 0.04, 0.015), y - 0.04);
      },
    };
    for (const f of [-1, 1]) Object.values(FOSSILS).forEach((draw, i) => {
      const a = 48.6 + i * 3.2 + (f > 0 ? 1.6 : 0), floor = DEEP * THREE.MathUtils.clamp((a - A0) / (A1 - A0), 0, 1);
      const y = Math.min(floor + (i % 2 ? 1.5 : 1.25), -0.55), at = onWall(f, a);
      showcase(at, 0.9, y - 0.32, y + 0.32, AMBER, 0.22, 0.08);
      draw(at, y);
    });

    // ---- the museum's front and its main block: one building with the wings, square round the round hall. The
    // front (at AE) in stone: on the ground floor the way in between two cases (an aquarium, a bank of seeds), a
    // band with the museum's name over it; above, the great window off the middle (the deck and the tree behind
    // it); to its right two cases one over the other; to its left the tall block (TALL), rising past the roof in
    // fins over light, a small observatory on its top. On the right of the roof a garden; the block's sides and
    // back in layers of rock.
    const TALL = 25, GW = [-12, 9];                                             // GW: the great window, across
    const skin = (dz0, dz1, y0, y1) => props(box(...sorted(X(SKIN), X(AE)), y0, y1, c + dz0, c + dz1), 0.72, STONE);
    skin(-WIDE, -6, DEEP, DEEP + 3.8);
    skin(6, WIDE, DEEP, DEEP + 3.8);
    skin(-WIDE, WIDE, DEEP + 3.8, L1 - 0.5);
    skin(-WIDE, GW[0], L1 - 0.5, HROOF - 1.2);
    skin(GW[1], 13, L1 - 0.5, HROOF - 1.2);
    skin(-WIDE, 13, HROOF - 1.2, HROOF + 0.9);
    skin(-WING, -WIDE, 15, HROOF + 0.9);
    skin(13, WIDE, L1 - 0.5, TALL);
    skin(WIDE, WING, 15, TALL);
    glow(box(...sorted(X(SKIN - 0.03), X(SKIN + 0.05)), HROOF + 0.82, HROOF + 0.88, c - WING, c + 13), CYAN);
    for (const [y0, y1] of [[DEEP + 3.75, DEEP + 3.85], [L1 - 0.55, L1 - 0.45]]) glow(box(...sorted(X(SKIN - 0.03), X(SKIN + 0.05)), y0, y1, c - WIDE, c + 13), [0.55, 0.8, 0.85]);
    for (const [z0, z1] of [[c - WIDE, c - 7], [c + 7, c + WIDE]]) wall(...sorted(X(AE - 0.4), X(AE)), z0, z1, -7, L1 - 0.5);
    // a slim ledge across under the great window, as along the wings, lit along its edge; light washing up the front
    props(box(...sorted(X(SKIN - 1.2), X(SKIN)), L1 - 0.85, L1 - 0.55, c - WIDE, c + 13), 0.5, METAL);
    glow(box(...sorted(X(SKIN - 1.23), X(SKIN - 1.19)), L1 - 0.8, L1 - 0.75, c - WIDE, c + 13), CYAN);
    for (const dz of [-18, -9.5, 9.5, 17]) emitters.push({ x: X(AE - 1.5), y: DEEP + 0.3, z: c + dz, nx: s * 0.35, ny: 0.94, nz: 0, power: 1.0, reach: 20, tint: 0.1 });
    // the great window: a frame, mullions, two transoms; the deck's low wall seen through it
    {
      const [g0, g1] = GW, y0 = L1 - 0.5, y1 = HROOF - 1.2, d = [X(SKIN - 0.25), X(AE)];
      for (const g of [box(...sorted(...d), y0 - 0.3, y0, c + g0 - 0.3, c + g1 + 0.3), box(...sorted(...d), y1, y1 + 0.3, c + g0 - 0.3, c + g1 + 0.3),
        box(...sorted(...d), y0, y1, c + g0 - 0.3, c + g0), box(...sorted(...d), y0, y1, c + g1, c + g1 + 0.3)]) props(g, 0.3, SLATE);
      for (let k = 1; k < 7; k++) { const z = c + g0 + (g1 - g0) * k / 7; props(box(...sorted(X(SKIN - 0.15), X(AE - 0.05)), y0, y1, z - 0.07, z + 0.07), 0.3, SLATE); }
      for (const y of [L1 + 1.0, L1 + 6.2]) props(box(...sorted(X(SKIN - 0.15), X(AE - 0.05)), y, y + 0.12, c + g0, c + g1), 0.3, SLATE);
      emitters.push({ x: X(AE + 2), y: L1 + 3, z: c + (g0 + g1) / 2, nx: -s, ny: -0.2, nz: 0, power: 1.0, reach: 30, tint: 0.3 });
    }
    // to its right, two cases one over the other
    for (const [kind, y0, y1] of [['eggs', 6.0, 9.4], ['meteorite', 10.6, 14.0]]) {
      const [light, fill] = SPECIMENS[kind];
      showcase(onSkin(-16.5), 5.6, y0, y1, light);
      fill(onSkin(-16.5), 5.6, y0, y1);
    }
    // the tall block on its left: fins over light down its front and along its side toward the glass drum
    banded(...sorted(X(AE + 0.05), X(AE + 26)), c + 13, c + WING, HROOF, TALL, true, 0.2, W);
    fins(onSkin(17), WIDE - 13 - 0.6, L1 + 0.2, TALL - 1.2);
    fins(onSkin((WIDE + WING) / 2), WING - WIDE - 0.6, 15.6, TALL - 1.2);
    fins((g) => g.rotateY(Math.PI).translate(X(AE + 13), 0, c + 13), 23, HROOF + 0.6, TALL - 1.2);
    glow(box(...sorted(X(SKIN - 0.03), X(AE + 26)), TALL - 0.08, TALL - 0.02, c + 12.97, c + 13.03), CYAN);
    glow(box(...sorted(X(SKIN - 0.06), X(SKIN - 0.02)), TALL - 0.08, TALL - 0.02, c + 13, c + WING), CYAN);
    {                                                                           // an observatory on its top
      const ox = X(AE + 15), oz = c + 25, oy = TALL;
      props(new THREE.CylinderGeometry(2.9, 2.9, 1.2, 32).translate(ox, oy + 0.6, oz), 0.7, STONE);
      props(new THREE.SphereGeometry(2.8, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(ox, oy + 1.2, oz), 0.85, TINT.white);
      glow(new THREE.TorusGeometry(2.92, 0.04, 4, 64).rotateX(Math.PI / 2).translate(ox, oy + 1.2, oz), CYAN);
      // its slit, open, a warm light within
      shown(new THREE.BoxGeometry(0.7, 0.3, 2.4).translate(0, 0, 1.4).rotateX(-0.75).translate(ox, oy + 1.25, oz), [1.2, 0.95, 0.6]);
    }
    // the roof, round the glass drum, out to the block's edges; on its right a garden
    const rOut = (th) => {
      const co = Math.cos(th), si = Math.sin(th);
      let r = WING / Math.max(Math.abs(si), 1e-6);
      if (co > 1e-6) r = Math.min(r, (RC - AE) / co);
      if (co < -1e-6) r = Math.min(r, (ABACK - RC) / -co);
      return r;
    };
    props(band(RI + 0.3, rOut, 0, Math.PI * 2, HROOF + 0.3), 0.55, TINT.stone);   // (a hand over the hall's ceiling)
    props(box(...sorted(X(AE + 1.5), X(ABACK - 1.5)), HROOF + 0.3, HROOF + 0.65, c - WING + 1.5, c - RI - 2), 0.5, TINT.grass);
    for (let k = 0; k < 6; k++) tree(X(W.range(AE + 4, ABACK - 4)), HROOF + 0.65, c - W.range(RI + 4.5, WING - 3), W.range(0.8, 1.15), W);
    // its sides and back in layers of rock (behind the wings, past them)
    for (const f of [-1, 1]) banded(...sorted(X(AR), X(ABACK)), ...sorted(c + f * (WING - 0.6), c + f * WING), DEEP, HROOF + 0.9, true, 0.25, W);
    banded(...sorted(X(ABACK - 0.6), X(ABACK)), c - WING, c + WING, DEEP, HROOF + 0.9, true, 0.25, W);
    // (one keeps off its roofs from the street)
    for (const f of [-1, 1]) wall(...sorted(X(AE), X(ABACK)), ...sorted(c + f * (RO + 1.2), c + f * WING), -0.6, 200);
    wall(...sorted(X(RC + RO + 0.8), X(ABACK)), c - WING, c + WING, -0.6, 200);

    // either side of the way in, set into the front: an aquarium, a bank of seeds
    for (const [dz, aquarium] of [[9.5, true], [-9.5, false]]) {
      const w = 4.6, y0 = DEEP + 0.6, y1 = DEEP + 3.4, at = onSkin(dz);
      showcase(at, w, y0, y1, aquarium ? [0.1, 0.55, 1.15] : [1.15, 0.8, 0.4]);
      if (aquarium) {
        for (let u = -w / 2 + 0.25; u < w / 2; u += 0.5) ip(at(new THREE.BoxGeometry(0.52, V.range(0.18, 0.35), 0.55).translate(u, y0 + 0.08, 0.4)), 0.6, T('#c9b48a'));   // sand
        for (let k = 0; k < 9; k++) ip(at(new THREE.IcosahedronGeometry(V.range(0.12, 0.3), 0).scale(1, V.range(0.8, 2.2), 1).translate(V.range(-w / 2 + 0.3, w / 2 - 0.3), y0 + 0.35, V.range(0.25, 0.5))), 0.5, T(V.pick(['#ff8fab', '#ffd166', '#c77dff', '#ff7b54'])));
        for (let k = 0; k < 9; k++) { const h = V.range(0.8, 2.0); ip(at(new THREE.CylinderGeometry(0.03, 0.05, h, 5).translate(V.range(-w / 2 + 0.3, w / 2 - 0.3), y0 + 0.2 + h / 2, V.range(0.2, 0.4))), 0.4, TINT.leaf); }
        for (let k = 0; k < 14; k++) {                                          // fish, alight
          const size = V.range(0.7, 1.3), rgb = V.pick([[1.6, 1.3, 0.4], [1.6, 0.7, 0.3], [1.1, 1.5, 1.7]]);
          const g = mergeGeometries([new THREE.SphereGeometry(0.08, 8, 6).scale(1.8, 1, 0.6), new THREE.ConeGeometry(0.06, 0.12, 4).rotateZ(Math.PI / 2).translate(0.18, 0, 0)]);
          shown(at(g.rotateY(V.chance(0.5) ? Math.PI : 0).scale(size, size, size).translate(V.range(-w / 2 + 0.3, w / 2 - 0.3), V.range(y0 + 0.9, y1 - 0.3), V.range(0.25, 0.55))), rgb);
        }
        for (const u of [-0.8, 0.9]) for (let k = 0; k < 8; k++) shown(at(new THREE.SphereGeometry(V.range(0.025, 0.045), 6, 4).translate(u + V.range(-0.05, 0.05), y0 + 0.5 + k * 0.27, 0.3)), [1.2, 1.5, 1.7]);
      } else {
        for (const sy of [y0 + 0.05, y0 + 0.95, y0 + 1.85]) {
          ip(at(box(-w / 2, w / 2, sy - 0.05, sy, 0.12, 0.6)), 0.6, TINT.wood);
          for (let u = -w / 2 + 0.2; u < w / 2 - 0.1; u += 0.3) {
            if (!V.chance(0.85)) continue;
            const h = V.range(0.35, 0.6);
            ip(at(new THREE.CylinderGeometry(0.1, 0.1, h, 10).translate(u, sy + h / 2, 0.36)), 0.55, T('#d4e6ea'));
            ip(at(new THREE.CylinderGeometry(0.105, 0.105, 0.06, 10).translate(u, sy + h + 0.03, 0.36)), 0.4, METAL);
          }
        }
      }
      emitters.push({ x: X(SKIN - 1), y: DEEP + 2, z: c + dz, nx: -s, ny: 0, nz: 0, power: 0.8, reach: 10, tint: aquarium ? 0.8 : 0.3 });
    }

    // ---- the way in: from the plaza through the front, under a canopy, into the hall
    const door = [c - 1.4, c + 1.4], ea = RC - RO;
    props(box(X(ea - 3.2), X(ea + 0.3), DEEP + 3.6, DEEP + 3.8, c - 6, c + 6), 0.9);
    glow(box(X(ea - 3.22), X(ea - 3.18), DEEP + 3.55, DEEP + 3.85, c - 6, c + 6), CYAN);
    for (let dz = -5.5; dz <= 5.5; dz += 1.1) if (Math.abs(dz) > 1.5) props(box(X(ea) - 0.05, X(ea) + 0.05, DEEP, DEEP + 3.6, c + dz - 0.04, c + dz + 0.04), 0.3);
    glow(box(X(ea) - 0.06, X(ea) + 0.06, DEEP + 3.4, DEEP + 3.45, c - 5.5, c + 5.5), WARM);
    slidingDoor(X(ea + 0.12), door[0], door[1], DEEP, DEEP + 3.0);
    for (const [z0, z1] of [[c - 7, door[0]], [door[1], c + 7]]) wall(X(ea - 0.2), X(ea + 0.2), z0, z1, -7, -0.6);
    const nw = 14, nh = 1.6, ny = 2.6;                                         // its name, on the front over the way in
    screen(panel(nw, nh, X(ea - 0.6), ny, c, s < 0 ? 'x' : '-x'), PROG.TEXT, nw, nh, atlasRect('h', 12), Q.next());
    props(box(X(ea - 0.55), X(ea - 0.45), ny - nh / 2 - 0.25, ny + nh / 2 + 0.25, c - nw / 2 - 0.25, c + nw / 2 + 0.25), 0.3);
    emitters.push({ x: X(ea - 1.5), y: ny, z: c, nx: -s, ny: -0.3, nz: 0, power: 1.0, reach: 34, tint: 0.5 });
    emitters.push({ x: X(ea - 0.8), y: DEEP + 2, z: c, nx: -s, ny: 0, nz: 0, power: 0.9, reach: 14, tint: 0.15 });

    // the desk, on the right as one comes in (the ramp starts on the left)
    people.push({ x: X(RC - RI - 2), y: DEEP, z: c - 5.5, rot: s < 0 ? Math.PI / 2 : -Math.PI / 2, umbrella: false });
    ip(box(X(RC - RI - 2.6), X(RC - RI - 1.6), DEEP, DEEP + 1.05, c - 7.5, c - 3.5), 0.6, TINT.darkWood);
    glow(box(X(RC - RI - 2.6) - 0.01, X(RC - RI - 2.6) + 0.01, DEEP + 0.95, DEEP + 1.0, c - 7.5, c - 3.5), CYAN);
    colliders.push({ x: X(RC - RI - 2.1), z: c - 5.5, r: 2.0, y0: -7, y1: CEIL });

    // ---- the stations of the walk: where each age stands round the ring, what it shows (museum.js loads the
    // fossils), its light. From the beginning of everything up the
    // ramp to now: the cosmos's history (drawn here in light, cosmos below), then the Earth's: the young Earth, its
    // first life, a Stegosaurus, a mammoth, and the Earth today; and over the deck at the top, along the great window,
    // a whale (Cetotherium) afloat
    const STATIONS = [
      { th: 0.75, era: 'bigbang', show: 'bigbang' },
      { th: 1.12, era: 'firstlight', show: 'firstlight' },
      { th: 1.5, era: 'firststars', show: 'firststars' },
      { th: 1.88, era: 'galaxy', show: 'galaxy' },
      { th: 2.25, era: 'supernova', show: 'supernova' },
      { th: 2.62, era: 'solar', show: 'solar' },
      { th: 3.12, era: 'hadean', show: 'earth' },
      { th: 3.6, era: 'archean', show: 'stromatolites' },
      { th: 4.45, era: 'jurassic', model: 'stegosaurus', size: 7.0 },
      { th: 5.05, era: 'pleistocene', model: 'mammoth', size: 5.5 },
      { th: 5.5, era: 'today', show: 'today' },
    ];
    // the cosmos's stations, in light over their plinths (top: the plinth's top; its own numbers, CQ)
    const CQ = makeRandom(3700);
    const unit = () => { const u = CQ.range(-1, 1), a = CQ.range(0, Math.PI * 2), r = Math.sqrt(1 - u * u); return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)); };
    const mixRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const PLANET_RGB = [[1.1, 1.0, 0.9], [1.6, 1.3, 0.8], [0.5, 1.0, 1.7], [1.6, 0.6, 0.4], [1.5, 1.1, 0.75], [0.6, 1.4, 1.5]];   // (as the solar system's before it)
    // a sphere's faces sorted by a smooth pattern over it into colours (for the first light and the Earth): each lot
    // of faces its own geometry
    const patterned = (r, detail, buckets, fine = 7) => {
      const g = new THREE.IcosahedronGeometry(r, detail).toNonIndexed(), p = g.attributes.position, waves = Array.from({ length: 6 }, () => [unit(), CQ.range(3, fine), CQ.range(0, 6.3)]);
      const lots = buckets.map(() => []), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        c.set(0, 0, 0);
        for (let k = 0; k < 3; k++) c.x += p.getX(i + k), c.y += p.getY(i + k), c.z += p.getZ(i + k);
        c.normalize();
        const n = waves.reduce((sum, [d, f, ph]) => sum + Math.sin(c.dot(d) * f + ph), 0) / 6 * 0.5 + 0.5;
        const k = Math.min(buckets.length - 1, Math.floor(n * buckets.length * 1.25 - buckets.length * 0.125));
        for (let j = 0; j < 3; j++) lots[Math.max(0, k)].push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
      }
      return lots.map((arr) => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(arr.length / 3 * 2), 2)); q.computeVertexNormals(); return q; });
    };
    const cosmos = (show, x, z, top, inward) => {
      if (show === 'bigbang') {                                                 // the beginning: no centre, no blast; space itself growing, everything in it moving
        const C = new THREE.Vector3(x, top + 1.4, z);                           // apart from everything else, the further the faster, quickly at first, again and again
        const lots = PLANET_RGB.map(() => []);
        for (let k = 0; k < 46; k++) {
          const d = unit(), r = Math.cbrt(CQ.next()) * 1.1;                     // (as many in each bit of space)
          lots[k % lots.length].push(new THREE.IcosahedronGeometry(CQ.range(0.04, 0.09), 1).translate(C.x + d.x * r, C.y + d.y * r, C.z + d.z * r));
        }
        lots.forEach((parts, i) => popping(mergeGeometries(parts), PLANET_RGB[i], [C.x, C.y, C.z, 0], [7, 8, 0.15, 999]));
      } else if (show === 'firstlight') {                                       // the first light: the sky's warmth all round, a little warmer here, cooler there
        const C = [x, top + 1.4, z];
        const PLANCK = [[0.1, 0.22, 0.85], [0.2, 0.55, 0.9], [0.85, 0.85, 0.38], [0.95, 0.5, 0.2], [0.9, 0.22, 0.16]];
        patterned(0.8, 4, PLANCK, 11).forEach((g, k) => orbiting(g.translate(...C), PLANCK[k], [x, z], 0.12));
      } else if (show === 'firststars') {                                       // the first stars, great and blue, in the gas and dust they were made of
        const C = new THREE.Vector3(x, top + 1.4, z);
        for (let k = 0; k < 90; k++) {                                         // (the gas and dust: fine grains, unlit, drifting about them)
          const d = unit(), r = CQ.range(0.3, 1.0);
          ip(new THREE.IcosahedronGeometry(CQ.range(0.02, 0.05), 0).rotateX(CQ.range(0, 6.3)).translate(C.x + d.x * r - inward.x * 0.2, C.y + d.y * r * 0.55, C.z + d.z * r - inward.z * 0.2), 0.6, T(CQ.chance(0.5) ? '#8f88b8' : '#7d8fb0'));
        }
        for (const [dx, dy, size, ph] of [[-0.38, 0.18, 0.24, 0], [0.45, -0.12, 0.18, 1.3], [0.05, 0.55, 0.14, 2.4]]) {
          const p = new THREE.Vector3(C.x - inward.z * dx + inward.x * 0.35, C.y + dy, C.z + inward.x * dx + inward.z * 0.35);
          popping(new THREE.IcosahedronGeometry(size, 1).translate(p.x, p.y, p.z), [1.5, 1.75, 2.0], [p.x, p.y, p.z, ph], [3, 1, 0.05, 999]);
        }
      } else if (show === 'galaxy') {                                           // a galaxy, standing face on to the ramp, its arms slowly turning
        const C = new THREE.Vector3(x, top + 1.45, z), k = new THREE.Vector3(inward.x, 0, inward.z).normalize(), u = new THREE.Vector3(-k.z, 0, k.x);
        const lots = { core: [], arm: [], pink: [], ring: [] }, RGB = { core: [1.6, 1.3, 0.8], arm: [0.5, 1.3, 1.7], pink: [1.5, 0.6, 0.9], ring: [0.3, 0.6, 0.7] };
        const ball = (lot, a, b, size) => lots[lot].push(new THREE.IcosahedronGeometry(size, 1).translate(C.x + u.x * a, C.y + b, C.z + u.z * a));
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 64; i++) {
          const t = CQ.next(), r = 0.25 + 0.9 * t + CQ.range(-0.04, 0.04), th = arm * Math.PI + t * 4.2 + CQ.range(-0.12, 0.12);
          ball(CQ.chance(0.14) ? 'pink' : 'arm', r * Math.cos(th), r * Math.sin(th), CQ.range(0.03, 0.06) * (1.2 - t * 0.5));
        }
        lots.core.push(new THREE.IcosahedronGeometry(0.22, 2).scale(1, 1, 1).translate(C.x, C.y, C.z));
        lots.ring.push(new THREE.TorusGeometry(1.25, 0.012, 3, 96).rotateY(Math.PI / 2).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), k)).translate(C.x, C.y, C.z));
        const clip = [C.x - u.x * 50, C.z - u.z * 50, u.x, u.z], clip2 = [100, -100, 100, 0];
        for (const [lot, parts] of Object.entries(lots)) spinning(mergeGeometries(parts), RGB[lot], [C.x, C.y, C.z, -0.12], [k.x, k.y, k.z, 0], clip, clip2);
      } else if (show === 'supernova') {                                        // what is left of a star blown apart, and the pulsar at its heart
        const C = new THREE.Vector3(x, top + 1.4, z);
        const COLS = [[1.6, 0.5, 0.4], [0.5, 1.3, 1.5], [1.6, 1.2, 0.6]];
        for (let i = 0; i < 54; i++) {                                         // (its shell: pieces alight and pieces of rock, thrown out)
          const d = unit(), at = CQ.range(0.62, 0.88), g = new THREE.IcosahedronGeometry(CQ.range(0.04, 0.1), 0).rotateX(CQ.range(0, 6.3)).translate(C.x + d.x * at, C.y + d.y * at, C.z + d.z * at);
          if (i % 5 < 3) shown(g, COLS[i % 3]); else ip(g, 0.6, TINT.stone);
        }
        for (const [tx, tz, rgb] of [[0.9, 0.3, COLS[0]], [-0.5, 1.4, COLS[1]]]) shown(new THREE.TorusGeometry(0.78, 0.014, 3, 64).rotateX(tx).rotateZ(tz).translate(C.x, C.y, C.z), rgb);
        shown(new THREE.IcosahedronGeometry(0.1, 1).translate(C.x, C.y, C.z), [1.8, 1.9, 2.0]);
        const beams = mergeGeometries([0.45, 0.45 + Math.PI].map((a) => new THREE.ConeGeometry(0.06, 1.0, 8, 1, true).translate(0, -0.5, 0).rotateX(Math.PI).rotateZ(a)));
        orbiting(beams.translate(C.x, C.y, C.z), [0.6, 1.4, 1.9], [C.x, C.z], 2.4);   // (sweeping round, as a lighthouse's)
      } else if (show === 'solar') {                                            // the Sun young, its jets, the disc round it with its gaps, things in it going round
        const C = [x, top + 0.55, z];
        shown(new THREE.IcosahedronGeometry(0.26, 2).translate(...C), [1.9, 1.35, 0.6]);
        for (const f of [-1, 1]) shown(new THREE.CylinderGeometry(f > 0 ? 0.035 : 0.012, f > 0 ? 0.012 : 0.035, 0.85, 6).translate(C[0], C[1] + f * 0.55, C[2]), [0.5, 1.3, 1.9]);   // (widening as they go)
        for (let r = 0.34; r < 1.4; r += 0.055) {
          if ((r > 0.6 && r < 0.7) || (r > 0.97 && r < 1.06)) continue;
          glow(new THREE.TorusGeometry(r, 0.011, 3, 72).rotateX(Math.PI / 2).translate(...C), mixRGB([1.45, 0.92, 0.45], [0.55, 0.32, 0.3], (r - 0.34) / 1.05).map((v) => v * CQ.range(0.75, 1.1)));
        }
        const round = (r) => 0.55 / Math.pow(r, 1.5);
        for (let k = 0; k < 34; k++) {
          const r = CQ.range(0.36, 1.38);
          orbiting(new THREE.IcosahedronGeometry(CQ.range(0.03, 0.06), 1).translate(C[0] + r, C[1] + CQ.range(-0.02, 0.02), C[2]), PLANET_RGB[k % PLANET_RGB.length], [x, z], round(r), CQ.range(0, 6.3));
        }
        for (const [r, size] of [[0.65, 0.08], [1.015, 0.1]]) orbiting(new THREE.IcosahedronGeometry(size, 1).translate(C[0] + r, C[1], C[2]), [1.4, 1.1, 0.8], [x, z], round(r), CQ.range(0, 6.3));
      } else if (show === 'today') {                                            // the Earth today: its seas and lands, its lights, the Moon, and what we have sent up round it
        const C = [x, top + 1.3, z];
        const [sea, land] = patterned(0.5, 3, [[0.26, 0.58, 1.2], [0.3, 0.95, 0.42]]);
        orbiting(sea.translate(...C), [0.26, 0.58, 1.2], [x, z], 0.2);
        orbiting(land.scale(1.01, 1.01, 1.01).translate(...C), [0.3, 0.95, 0.42], [x, z], 0.2);
        for (let k = 0; k < 70; k++) {                                          // (its lights: on the lands, as they turn)
          const d = unit();
          orbiting(new THREE.IcosahedronGeometry(0.008, 0).translate(C[0] + d.x * 0.51, C[1] + d.y * 0.51, C[2] + d.z * 0.51), [1.8, 1.4, 0.7], [x, z], 0.2);
        }
        orbiting(new THREE.IcosahedronGeometry(0.11, 1).translate(C[0] + 1.0, C[1] + 0.05, C[2]), [1.2, 1.2, 1.25], [x, z], 0.35);
        glow(new THREE.TorusGeometry(1.0, 0.006, 3, 72).rotateX(Math.PI / 2).translate(C[0], C[1] + 0.05, C[2]), [0.3, 0.5, 0.6]);
        for (let k = 0; k < 7; k++) orbiting(new THREE.IcosahedronGeometry(0.012, 0).translate(C[0] + CQ.range(0.6, 0.7), C[1] + CQ.range(-0.28, 0.28), C[2]), [1.6, 1.8, 1.9], [x, z], CQ.range(0.9, 1.4), CQ.range(0, 6.3));
      }
    };
    const stations = [];
    for (const st of STATIONS) {
      const big = st.size > 3 && !st.wall && !st.hang, rr = st.wall ? RO - 0.8 : big ? RO - 3.0 : st.hang ? (RI + RO) / 2 : RO - 3.2, [x, z] = polar(rr, st.th);
      const yaw = -st.th + (s < 0 ? Math.PI / 2 : -Math.PI / 2);   // along the ring
      const ph = st.case ? 1.0 : big ? 0.35 : 0.8;
      const F0 = rampY(st.th);                                                  // where it stands on the ramp
      if (big) {                                                                // a long low platform along the outer side (its ends in the ramp)
        ip(new THREE.BoxGeometry(st.size + 1.6, ph + 0.6, 5.0).rotateY(yaw).translate(x, F0 + ph / 2 - 0.3, z), 0.65, TINT.stone);
        const edge = new THREE.BoxGeometry(st.size + 1.6, 0.03, 0.04).translate(0, 0, -2.52).rotateY(yaw).translate(x, F0 + ph, z);
        glow(edge, CYAN);
        for (let t = -0.5; t <= 0.5; t += 0.25) {
          const d = t * (st.size + 0.8);
          colliders.push({ x: x + Math.cos(yaw) * d, z: z - Math.sin(yaw) * d, r: 2.55, y0: -7, y1: HROOF });
        }
      } else if (!st.wall && !st.hang) {
        ip(new THREE.CylinderGeometry(0.9, 1.0, ph + 0.4, 32).translate(x, F0 + ph / 2 - 0.2, z), 0.65, TINT.stone);
        glow(new THREE.TorusGeometry(0.92, 0.02, 3, 48).rotateX(Math.PI / 2).translate(x, F0 + ph, z), CYAN);
        colliders.push({ x, z, r: 1.2, y0: -7, y1: HROOF });
      }
      if (st.show && !['earth', 'stromatolites'].includes(st.show)) {
        const [cx0, cz0] = polar(0, st.th), il = Math.hypot(cx0 - x, cz0 - z);
        cosmos(st.show, x, z, F0 + ph, { x: (cx0 - x) / il, z: (cz0 - z) / il });
      } else if (st.show === 'earth') {                                                // the young Earth: a glowing ball, a ring of debris
        glow(new THREE.SphereGeometry(1.1, 32, 16).translate(x, F0 + ph + 1.6, z), [1.4, 1.6, 1.7]);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2, rr2 = 1.9 + Q.range(-0.15, 0.15);
          ip(new THREE.IcosahedronGeometry(Q.range(0.06, 0.16), 0).translate(x + Math.cos(a) * rr2, F0 + ph + 1.6 + Math.sin(a * 3) * 0.12, z + Math.sin(a) * rr2), 0.6);
        }
      } else if (st.show === 'stromatolites') {                               // the first life: stromatolites in a shallow pool
        glow(new THREE.CircleGeometry(0.85, 24).rotateX(-Math.PI / 2).translate(x, F0 + ph + 0.01, z), DIM);
        for (let k = 0; k < 9; k++) {
          const a = Q.range(0, 6.3), rr2 = Q.range(0, 0.6), h = Q.range(0.25, 0.6);
          ip(new THREE.SphereGeometry(Q.range(0.12, 0.25), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h * 4, 1).translate(x + Math.cos(a) * rr2, F0 + ph, z + Math.sin(a) * rr2), 0.6, T('#b8794a'));
        }
      }
      if (st.case) {                                                            // a case: only its frame and lit edges
        for (const [dx, dz] of [[-0.75, -0.75], [-0.75, 0.75], [0.75, -0.75], [0.75, 0.75]]) ip(box(x + dx - 0.02, x + dx + 0.02, F0 + ph, F0 + ph + 1.1, z + dz - 0.02, z + dz + 0.02), 0.3);
        glow(new THREE.TorusGeometry(1.06, 0.015, 3, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).translate(x, F0 + ph + 1.1, z), PALE_LIGHT);
      }
      lamps.push({ x, y: F0 + 4.2, z, power: 0.9 });
      stations.push({ ...st, x, z, y: st.hang ? F0 + st.hang + 2.2 : F0 + (st.wall ? 1.4 : ph), yaw, floor: F0 });
      // a few visitors
      if (Q.chance(0.7)) { const pr = Q.range(15, 18), pt = st.th + Q.range(-0.12, 0.12), [px, pz] = polar(pr, pt); people.push({ x: px, y: rampY(pt), z: pz, rot: Q.range(0, 6.3), umbrella: false }); }
    }

    // the whale: afloat over the deck, along the great window, a little in from its glass
    {
      const x = X(AE + 3), z = c + (GW[0] + GW[1]) / 2;
      stations.push({ era: 'cenozoic', model: 'cetotherium', size: 10, hang: true, x, z, y: L1 + 6.4, yaw: -Math.PI / 2, floor: L1 });
      lamps.push({ x, y: L1 + 8, z, power: 0.8 });
    }

    museumSpot = {
      centre: { x: cx, z: cz },
      floor: DEEP,                                                              // (the street's mirror, when one is down there)
      stations,
    };
  }


  // An automatic door across a doorway at x from z0 to z1, floor F to top: two glass leaves (their frames and
  // edges, the glass itself only seen by what is behind it) that slide apart along z when someone comes near.
  function slidingDoor(x, z0, z1, F, top) {
    const w = (z1 - z0) / 2, h = top - F - 0.02;
    const solid = mergeGeometries([
      box(-0.03, 0.03, 0, 0.06, -w / 2, w / 2), box(-0.03, 0.03, h - 0.06, h, -w / 2, w / 2),
      box(-0.03, 0.03, 0, h, -w / 2, -w / 2 + 0.05), box(-0.03, 0.03, 0, h, w / 2 - 0.05, w / 2),
    ].map((g) => tag(g, { aAlbedo: 0.35, aTint: [0, 0, 0] })));
    const leaves = [-1, 1].map((dir) => {
      const leaf = new THREE.Group();
      leaf.add(new THREE.Mesh(solid, doorSolid));
      // its glass's inner edge lit, and a slim pull
      const edge = tag(box(-0.035, 0.035, 0.06, h - 0.06, -dir * (w / 2 - 0.06) - 0.012, -dir * (w / 2 - 0.06) + 0.012), { color: [0.9, 1.25, 1.3], aBlink: 0 });
      leaf.add(new THREE.Mesh(edge, doorGlow));
      const zc = dir < 0 ? z0 + w / 2 : z1 - w / 2;
      leaf.position.set(x, F, zc);
      leaf.traverse((o) => { o.layers.set(LAYER.GLOW); o.frustumCulled = false; });
      doorGroup.add(leaf);
      return { mesh: leaf, z: zc, dir, travel: w * 0.92 };
    });
    const collider = { x0: x - 0.25, x1: x + 0.25, z0, z1, y0: F - 1, y1: top };
    colliders.push(collider);
    doors.push({ x, z: (z0 + z1) / 2, leaves, collider, open: 0, top });
  }

  // ---- Across the street from the station: a bookshop in the podium's ground floor, open behind its glass front
  // to the street, and before it on the pavement flower beds and a glass rain shelter (no buses here: a place to
  // wait out the rain, read the news, charge a phone). pf: the podium's street face, back: its far side;
  // podGlass: glass as the podium's own.
  function books(s, pf, zB, zA, back, podGlass) {
    const X = (a) => s * a, Q = RB, F = CURB, H = LOBBY;
    const ip = (g, albedo, tint = [0, 0, 0]) => bookIn.props.add(g, { aAlbedo: albedo, aTint: tint });
    const toStreet = s < 0 ? 'x' : '-x', fromStreet = s < 0 ? '-x' : 'x';
    const DIM = [0.25, 0.5, 0.55], PALE = [0.9, 1.25, 1.3], WARM = [1.15, 1.25, 1.25];
    const d0 = pf, d1 = pf + 14, z0 = zB + 0.4, z1 = zA - 0.4, zc = (zA + zB) / 2, door = [zc - 1.7, zc + 1.7];
    bookAt = { x: X((d0 + d1) / 2), z: zc, s, zB, zA };
    // books along a shelf len long; put(t, opts) places one t along it
    const shelf = (len, put) => {
      let t = 0.03;
      while (t < len - 0.06) {
        const w = Q.range(0.022, 0.055), h = Q.range(0.17, 0.3);
        if (t + w > len - 0.03) break;
        if (!Q.chance(0.05)) put(t + w / 2, { scale: [w, h, Q.range(0.13, 0.2)], tone: Q.pick([0.3, 0.5, 0.7, 0.9, 1.0]), roll: Q.chance(0.05) ? Q.range(-0.25, 0.25) : 0 });
        t += w + 0.002;
      }
    };
    const book = (x, y, z, o) => bookIn.goods.put('block', x, y, z, o);

    // the room: floor, ceiling, the podium's ground floor closed beyond it and at its ends
    ip(box(X(d0), X(d1), F - 0.05, F + 0.01, z0, z1), 0.42, TINT.LAMP);
    ip(box(X(d0 + 0.1), X(d1), H - 0.12, H - 0.02, z0, z1), 0.6, TINT.LAMP);
    podGlass(prism(outline('rect', ...sorted(X(d1), X(back)), zB, zA), 0, H));
    for (const [za, zb] of [[zB, z0], [z1, zA]]) podGlass(prism(outline('rect', ...sorted(X(d0), X(d1)), za, zb), 0, H));
    ip(box(X(d1 - 0.2), X(d1), F, H, z0, z1), 0.55, TINT.LAMP);
    for (const z of [z0, z1]) ip(box(X(d0), X(d1), F, H, z - 0.1, z + 0.1), 0.6, TINT.LAMP);
    boxCollider(X(d1 - 0.3), X(back), zB, zA);
    for (const [za, zb] of [[zB, z0 + 0.3], [z1 - 0.3, zA]]) boxCollider(X(d0), X(d1), za, zb);
    covers.push({ ...xzBox(X(d0), X(d1), z0, z1), y: H, room: true });
    // the glass front: slim mullions, a transom, a low kerb, the doors' frames lit
    for (let z = z0 + 0.1; z <= z1; z += (z1 - z0 - 0.2) / 14) {
      if (z > door[0] - 0.05 && z < door[1] + 0.05) continue;
      props(box(X(d0) - 0.05, X(d0) + 0.05, F, H, z - 0.05, z + 0.05), 0.3);
    }
    props(box(X(d0) - 0.06, X(d0) + 0.06, 4.0, 4.12, z0, z1), 0.3);
    glow(box(X(d0) - 0.07, X(d0) + 0.07, 4.12, 4.15, z0, z1), DIM);
    for (const [za, zb] of [[z0, door[0]], [door[1], z1]]) {
      props(box(X(d0) - 0.06, X(d0) + 0.06, F, F + 0.22, za, zb), 0.3);
      wall(X(d0 - 0.2), X(d0 + 0.2), za, zb, -1, H);
    }
    for (const z of door) glow(box(X(d0) - 0.06, X(d0) + 0.06, F, 3.0, z - 0.03, z + 0.03), PALE);
    glow(box(X(d0) - 0.06, X(d0) + 0.06, 2.97, 3.0, door[0], door[1]), PALE);
    slidingDoor(X(d0 + 0.12), door[0], door[1], F, 2.95);
    // its name over the front, a hologram floating before the podium's glass (where a screen once was: its
    // number still drawn), a band of dark glass behind it so that it shows, edged in light
    Q.next();
    props(box(...sorted(X(pf - 0.14), X(pf - 0.04)), H + 0.25, H + 2.15, zc - 5.8, zc + 5.8), 0.12, new THREE.Color('#1c2433').toArray());
    for (const y of [H + 0.25, H + 2.15]) glow(box(...sorted(X(pf - 0.16), X(pf - 0.12)), y - 0.025, y + 0.025, zc - 5.8, zc + 5.8), CYAN);
    emitters.push({ x: X(pf - 0.6), y: H + 1.2, z: zc, nx: -s, ny: 0, nz: 0, power: 0.6, reach: 16, tint: 0.5 });
    holoSigns.push({ x: X(pf - 0.5), y: H + 1.2, z: zc, set: 'h2', text: S2['光合书店 BOOKS'], rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2, size: 1.8 });
    // the light of the shop out on the pavement
    for (const z of [zc - 9, zc, zc + 9]) emitters.push({ x: X(d0 - 0.5), y: 2.4, z, nx: -s, ny: 0, nz: 0, power: 0.7, reach: 13, tint: 0.15 });

    // the back wall: shelves to above head height the whole length, two ladders on a rail
    for (let y = 0.12; y < 3.9; y += 0.42) {
      ip(box(X(d1 - 0.45), X(d1 - 0.2), F + y - 0.03, F + y, z0 + 0.3, z1 - 0.3), 0.62, TINT.wood);
      shelf(z1 - z0 - 0.6, (t, o) => book(X(d1 - 0.33), F + y, z0 + 0.3 + t, { ...o, rot: -s * Math.PI / 2 }));
    }
    ip(box(X(d1 - 0.5), X(d1 - 0.45), F + 4.05, F + 4.1, z0 + 0.3, z1 - 0.3), 0.3);
    glow(box(X(d1 - 0.5), X(d1 - 0.46), F + 4.15, F + 4.2, z0 + 0.3, z1 - 0.3), WARM);
    for (const z of [z0 + 8, z1 - 11]) {
      for (const dz of [-0.22, 0.22]) ip(box(X(d1 - 1.3), X(d1 - 1.24), F, F + 4.1, z + dz - 0.03, z + dz + 0.03), 0.3);
      for (let y = 0.35; y < 4; y += 0.35) ip(box(X(d1 - 1.3), X(d1 - 1.24), F + y - 0.02, F + y, z - 0.22, z + 0.22), 0.3);
    }
    // down both ends, lower shelves, a lamp-lit line along their tops
    for (const [z, f] of [[z0 + 0.1, 1], [z1 - 0.1, -1]]) {
      for (let y = 0.12; y < 2.1; y += 0.42) {
        ip(box(X(d0 + 1), X(d1 - 0.5), F + y - 0.03, F + y, ...sorted(z, z + f * 0.3)), 0.62, TINT.wood);
        shelf(d1 - d0 - 1.5, (t, o) => book(X(d0 + 1 + t), F + y, z + f * 0.16, { ...o, rot: f > 0 ? 0 : Math.PI }));
      }
      glow(box(X(d0 + 1), X(d1 - 0.5), F + 2.2, F + 2.23, ...sorted(z, z + f * 0.3)), WARM);
    }
    // freestanding shelves, double sided, in rows running back from the window, either side of the door
    const rows = [];
    for (let z = z0 + 10.5; z < door[0] - 3.5; z += 2.8) rows.push(z);
    for (let z = door[1] + 6; z < z1 - 1.5; z += 2.8) rows.push(z);
    for (const z of rows) {
      const a0 = d0 + 5.5, a1 = d0 + 10.5;
      ip(box(X(a0), X(a1), F, F + 1.55, z - 0.04, z + 0.04), 0.1);
      ip(box(X(a0), X(a1), F, F + 0.1, z - 0.35, z + 0.35), 0.3);
      glow(box(X(a0), X(a1), F + 1.55, F + 1.58, z - 0.3, z + 0.3), WARM);
      for (const f of [-1, 1]) {
        for (const y of [0.1, 0.48, 0.86, 1.24]) {
          ip(box(X(a0), X(a1), F + y - 0.025, F + y, ...sorted(z + f * 0.04, z + f * 0.35)), 0.7, TINT.wood);
          shelf(a1 - a0, (t, o) => book(X(a0 + t), F + y, z + f * 0.2, { ...o, rot: f > 0 ? 0 : Math.PI }));
        }
      }
      wall(X(a0), X(a1), z - 0.4, z + 0.4, -1, H);
    }
    // tables by the window, books piled and propped up on them
    const tables = [z0 + 11, z0 + 16, door[1] + 7, door[1] + 12].filter((z) => z < z1 - 1.5 && (z < door[0] - 1.5 || z > door[1] + 1.5));
    for (const z of tables) {
      const a0 = d0 + 1.4, a1 = d0 + 3.2;
      ip(box(X(a0), X(a1), F + 0.76, F + 0.8, z - 0.55, z + 0.55), 0.8, TINT.wood);
      for (const [a, dz] of [[a0 + 0.1, -0.45], [a1 - 0.1, -0.45], [a0 + 0.1, 0.45], [a1 - 0.1, 0.45]]) ip(box(X(a) - 0.03, X(a) + 0.03, F, F + 0.76, z + dz - 0.03, z + dz + 0.03), 0.3);
      for (let a = a0 + 0.25; a < a1 - 0.15; a += 0.38) {
        for (const dz of [-0.28, 0.12]) {
          let y = F + 0.8;
          for (let k = Q.int(1, 5); k > 0; k--) {
            const h = Q.range(0.025, 0.045);
            book(X(a), y, z + dz, { scale: [0.17, h, 0.24], rot: Q.range(-0.2, 0.2), tone: Q.pick([0.35, 0.6, 0.85, 1.0]) });
            y += h;
          }
        }
        book(X(a), F + 0.8, z + 0.42, { scale: [0.16, 0.24, 0.025], tilt: -0.25, rot: -s * Math.PI / 2, tone: Q.pick([0.4, 0.8, 1.0]) });
      }
      wall(X(a0), X(a1), z - 0.6, z + 0.6, -1, H);
    }
    // by the door, the counter: a till, a lamp, a stack of paper bags; someone behind it
    {
      const za = door[1] + 1.2, zb = door[1] + 4.6, a0 = d0 + 4.2, a1 = d0 + 5.0;
      ip(box(X(a0), X(a1), F, F + 1.02, za, zb), 0.6, TINT.darkWood);
      glow(box(X(a0) - 0.01, X(a0) + 0.01, F + 0.9, F + 0.94, za, zb), CYAN);
      ip(box(X(a0 + 0.2), X(a0 + 0.6), F + 1.02, F + 1.2, za + 0.4, za + 0.8), 0.4);
      glow(box(X(a0 + 0.22), X(a0 + 0.58), F + 1.22, F + 1.45, za + 0.45, za + 0.48), PALE);
      glow(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12).translate(X(a0 + 0.4), F + 1.5, zb - 0.5), WARM);
      ip(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6).translate(X(a0 + 0.4), F + 1.25, zb - 0.5), 0.3);
      for (let k = 0; k < 6; k++) book(X(a0 + 0.4), F + 1.02 + k * 0.012, za + 1.6, { scale: [0.3, 0.01, 0.4], tone: 0.95 });
      wall(X(a0 - 0.1), X(a1 + 0.1), za - 0.1, zb + 0.1, -1, H);
      insidePeople.push({ x: X(a1 + 0.5), y: F, z: (za + zb) / 2, rot: s < 0 ? -Math.PI / 2 : Math.PI / 2, umbrella: false });
    }
    // a small garden of tropical plants in the open floor before the tower's glass (where the tower above comes
    // down into the shop): low beds of stone in rounded clumps, a palm tree or two over the rest, a path of
    // stepping stones in to a bench in a clearing among them, plants hung from the ceiling over it; one bed out on
    // its own toward the window. Then the book of the week: a display beside the counter (to its left, as one
    // faces it), the temples of the case outside cut out over it. (Their own numbers.)
    {
      const RT = makeRandom(5400), out = (g) => g.rotateY(-s * Math.PI / 2);      // (built facing +z: turned to face the street)
      const top = F + 0.34;
      const bed = (a, dz, r) => {
        ip(new THREE.CylinderGeometry(r, r, 0.32, 16).translate(X(a), F + 0.16, zc + dz), 0.5, TINT.stone);
        ip(new THREE.CylinderGeometry(r - 0.09, r - 0.09, 0.34, 16).translate(X(a), F + 0.17, zc + dz), 0.3, TINT.soil);
        colliders.push({ x: X(a), z: zc + dz, r: r + 0.12, y0: -1, y1: H });
      };
      const plant = (a, dz, kind, size) => tropicalPlant(ip, X(d0 + a), zc + dz, top, kind, RT, { pot: false, size });
      // the beds, in clumps of rounds: either side of the clearing, and the one toward the window
      for (const [a, dz, r] of [[8.4, -4.8, 0.95], [7.4, -4.6, 0.85], [8.5, -3.3, 0.9], [7.2, -3.4, 0.8], [8.6, -2.0, 0.7], [6.5, -4.0, 0.6], [6.3, -2.6, 0.55],
        [8.5, 2.1, 0.75], [8.4, 3.4, 0.9], [7.3, 3.2, 0.8], [8.3, 4.7, 0.9], [7.1, 4.5, 0.7], [6.3, 3.0, 0.55],
        [2.8, -4.2, 0.85], [3.5, -4.9, 0.6]]) bed(d0 + a, dz, r);
      // tall at the back, lower going forward, ferns at the edges
      for (const [a, dz, kind, size] of [
        [8.6, -4.9, 'tree', 1.15], [8.7, -2.2, 'tree', 0.8], [7.6, -4.4, 'banana', 0.95], [8.2, -3.4, 'elephant', 0.9], [7.0, -3.2, 'monstera', 0.85],
        [6.4, -4.0, 'bird', 0.75], [6.4, -2.5, 'bird', 0.6], [6.9, -5.0, 'fern', 1.0], [7.9, -2.2, 'fern', 0.8], [8.1, -5.5, 'fern', 0.9], [6.7, -1.9, 'fern', 0.7],
        [8.5, 3.9, 'tree', 1.0], [8.4, 2.3, 'banana', 0.8], [7.3, 4.6, 'elephant', 1.0], [7.4, 3.0, 'monstera', 0.9], [8.4, 5.2, 'palm', 0.8], [6.3, 3.0, 'bird', 0.65],
        [6.8, 2.4, 'fern', 0.8], [6.6, 4.1, 'fern', 0.9], [8.9, 1.6, 'fern', 0.7], [7.8, 5.2, 'fern', 0.9],
        [2.8, -4.2, 'monstera', 1.1], [3.5, -4.9, 'bird', 0.6], [2.4, -3.6, 'fern', 0.8], [3.3, -3.6, 'fern', 0.7],
        [8.9, -3.9, 'elephant', 0.7], [7.7, -5.3, 'bird', 0.7], [7.5, -2.5, 'palm', 0.6], [8.8, 3.0, 'monstera', 0.8], [8.9, 4.6, 'bird', 0.8], [7.0, 5.0, 'banana', 0.6]]) plant(a, dz, kind, size);
      // the stepping stones in, the bench in the clearing (its back to the glass)
      [[5.5, 0.15], [6.2, -0.1], [6.9, 0.12], [7.6, -0.05]].forEach(([a, dz]) => ip(new THREE.CylinderGeometry(0.27, 0.29, 0.03, 10).translate(X(d0 + a), F + 0.015, zc + dz), 0.75, TINT.stone));
      {
        const ba = d0 + 8.55, za = zc - 0.85, zb = zc + 0.85;
        ip(box(...sorted(X(ba - 0.25), X(ba + 0.25)), F + 0.4, F + 0.46, za, zb), 0.75, TINT.wood);
        ip(box(...sorted(X(ba + 0.2), X(ba + 0.27)), F + 0.46, F + 0.88, za, zb), 0.75, TINT.wood);
        for (const z of [za + 0.1, zb - 0.1]) ip(box(...sorted(X(ba - 0.2), X(ba + 0.2)), F, F + 0.4, z - 0.04, z + 0.04), 0.3);
        wall(...sorted(X(ba - 0.3), X(ba + 0.3)), za, zb, -1, H);
      }
      // plants hung over it, trailing
      for (const [a, dz] of [[7.6, -1.3], [7.9, 1.3], [6.2, 3.3]]) {
        const hx = X(d0 + a), hz = zc + dz, hy = H - 1.9;
        ip(new THREE.SphereGeometry(0.24, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(hx, hy + 0.2, hz), 0.75, TINT.terracotta);
        ip(new THREE.CylinderGeometry(0.006, 0.006, H - 0.12 - hy - 0.2, 4).translate(hx, (H - 0.12 + hy + 0.2) / 2, hz), 0.3);
        for (let k = 0; k < 9; k++) {
          const t = (k / 9) * Math.PI * 2, rr = RT.range(0.12, 0.24), len = RT.range(0.5, 1.3), vx = hx + Math.cos(t) * rr, vz = hz + Math.sin(t) * rr;
          ip(new THREE.CylinderGeometry(0.008, 0.008, len, 3).translate(vx, hy + 0.2 - len / 2, vz), 0.3, new THREE.Color('#2f6b3c').toArray());
          for (let y = hy + 0.12, j = 0; y > hy + 0.25 - len; y -= 0.11, j++) {
            const la = RT.range(0, 6.3);
            ip(new THREE.SphereGeometry(1, 5, 3).scale(0.045, 0.012, 0.075).translate(0, 0, 0.06).rotateX(0.5).rotateY(la).translate(vx, y, vz), 0.45, new THREE.Color(RT.pick(['#3f7f46', '#4f9a52', '#6aa84f'])).toArray());
          }
        }
      }
      // the display, beside the counter: low, a step up at its back, a lilac cloth along it, the book stood up and
      // piled in indigo and violet
      const da0 = d0 + 4.1, da1 = d0 + 5.0, dz0 = door[1] - 0.75, dz1 = door[1] + 1.05, LILAC = new THREE.Color('#b9a6e0').toArray();
      ip(box(...sorted(X(da0), X(da1)), F, F + 0.62, dz0, dz1), 0.6, TINT.darkWood);
      ip(box(...sorted(X(da0 + 0.45), X(da1)), F + 0.62, F + 0.84, dz0, dz1), 0.6, TINT.darkWood);
      ip(box(...sorted(X(da0 - 0.01), X(da1)), F + 0.62, F + 0.635, dz0 + 0.1, dz1 - 0.1), 0.85, LILAC);
      glow(box(X(da0) - 0.01, X(da0) + 0.01, F + 0.56, F + 0.6, dz0, dz1), WARM);
      for (let z = dz0 + 0.22, k = 0; z < dz1 - 0.15; z += 0.36, k++) {
        const pick = k % 2 ? 0.1 : 0.47;
        book(X(da0 + 0.16), F + 0.635, z, { scale: [0.16, 0.24, 0.025], tilt: -0.3, rot: -s * Math.PI / 2, pick, tone: 0.9 });
        let y = F + 0.84;
        for (let n = RT.int(2, 5); n > 0; n--) { book(X(da0 + 0.68), y, z, { scale: [0.17, 0.035, 0.24], rot: RT.range(-0.15, 0.15), pick, tone: 0.9 }); y += 0.035; }
      }
      wall(...sorted(X(da0 - 0.1), X(da1 + 0.1)), dz0 - 0.1, dz1 + 0.1, -1, H);
      // over it, cut from card: the second row of the temples of the case outside (the great pagoda, its halls, a
      // pine), standing on the step, lit as the shop is
      {
        const wN = 1.25, hk = (dz1 - dz0 - 0.1) / wN, L = templeLayers(wN)[2], foot = 0.03;
        const shapes = [[[-wN / 2, 0], [wN / 2, 0], [wN / 2, foot], [-wN / 2, foot]], ...L.polys.map((p) => p.map(([px, py]) => [px, py - L.yb + foot]))]
          .map((p) => new THREE.Shape(p.map(([px, py]) => new THREE.Vector2(px * hk, py * hk))));
        const g = new THREE.ExtrudeGeometry(shapes, { depth: 0.02, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, -0.01);
        ip(out(g).translate(X(da1 - 0.1), F + 0.84, (dz0 + dz1) / 2), 0.35, new THREE.Color('#4f5f92').toArray());
      }
    }
    // the reading corner at the far end: a rug, two sofas, armchairs, a low table, floor lamps, plants
    {
      const za = z0 + 0.8, zb = z0 + 9, a0 = d0 + 1.2, a1 = d1 - 1.4;
      ip(box(X(a0 + 1), X(a1 - 1), F + 0.01, F + 0.025, za + 1, zb - 1), 0.4, TINT.rug);
      const sofa = (a, z, len, along) => {          // along: its length runs along z (true) or across
        const [w, d] = along ? [0.9, len] : [len, 0.9];
        ip(box(X(a - w / 2), X(a + w / 2), F, F + 0.42, z - d / 2, z + d / 2), 0.7, TINT.fabric);
        const back = along ? box(X(a + w / 2 - 0.2), X(a + w / 2), F, F + 0.85, z - d / 2, z + d / 2) : box(X(a - w / 2), X(a + w / 2), F, F + 0.85, z + d / 2 - 0.2, z + d / 2);
        ip(back, 0.6, TINT.fabric);
        wall(X(a - w / 2), X(a + w / 2), z - d / 2, z + d / 2, -1, H);
      };
      sofa(a1 - 1, (za + zb) / 2, 3.2, true);
      sofa((a0 + a1) / 2, zb - 1.2, 2.6, false);
      for (const [a, z] of [[a0 + 2, za + 1.8], [a0 + 2, zb - 2.6], [(a0 + a1) / 2 - 1.2, za + 1.4]]) {
        ip(box(X(a - 0.42), X(a + 0.42), F, F + 0.45, z - 0.42, z + 0.42), 0.75, TINT.leather);
        ip(box(X(a - 0.42), X(a + 0.42), F, F + 0.8, z - 0.42, z - 0.25), 0.62, TINT.leather);
        colliders.push({ x: X(a), z, r: 0.5, y0: -1, y1: H });
      }
      const tc = (za + zb) / 2;
      ip(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 20).translate(X((a0 + a1) / 2), F + 0.42, tc), 0.85, TINT.wood);
      ip(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8).translate(X((a0 + a1) / 2), F + 0.2, tc), 0.3);
      colliders.push({ x: X((a0 + a1) / 2), z: tc, r: 0.7, y0: -1, y1: H });
      for (let k = 0; k < 3; k++) book(X((a0 + a1) / 2 + 0.2), F + 0.445 + k * 0.035, tc - 0.1, { scale: [0.2, 0.033, 0.26], rot: k * 0.4, tone: 0.5 + 0.2 * k });
      for (const [a, z] of [[a1 - 0.4, za + 0.6], [a0 + 0.6, zb - 0.5], [a1 - 0.4, zb - 0.4]]) {
        ip(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6).translate(X(a), F + 0.75, z), 0.3);
        glow(new THREE.CylinderGeometry(0.14, 0.2, 0.22, 14, 1, true).translate(X(a), F + 1.55, z), WARM);
        lamps.push({ x: X(a), y: F + 1.8, z, power: 0.25 });
      }
      for (const [a, z] of [[d0 + 0.6, za + 0.2], [d0 + 0.6, zb - 0.3]]) {
        bookIn.goods.put('fern', X(a), F, z, { rot: Q.range(0, 6.3), scale: 1.6, tone: 0.95 });
        colliders.push({ x: X(a), z, r: 0.45, y0: -1, y1: H });
      }
      for (let i = 0; i < 4; i++) insidePeople.push({ x: X(Q.range(a0 + 1, a1 - 2)), y: F, z: Q.range(za + 2, zb - 2), rot: Q.range(0, 6.3), umbrella: false });
    }
    // pendant lights in rows, and the lamps that light the room
    for (let a = d0 + 2.2; a < d1 - 1; a += 3.6) {
      for (let z = z0 + 2; z < z1 - 1; z += 3.4) {
        glow(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 16).translate(X(a), H - 1.1, z), WARM);
        props(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4).translate(X(a), H - 0.6, z), 0.3);
      }
    }
    for (let z = z0 + 4; z < z1; z += 7) lamps.push({ x: X(d0 + 6), y: H - 0.8, z, power: 0.85 });
    for (let i = 0; i < 6; i++) {
      const z = rows.length ? Q.pick(rows) + Q.pick([-1.4, 1.4]) : zc;
      insidePeople.push({ x: X(Q.range(d0 + 6, d0 + 10)), y: F, z, rot: Q.chance(0.5) ? 0 : Math.PI, umbrella: false });
    }

    // ---- on the pavement before it: flower beds, and the rain shelter (the lamp at z -8 between them), its
    // hologram over it
    flowerBed(s, 7.5, 9.0, -22.6, -16.2, F, Q);
    flowerBed(s, 7.5, 9.0, -15.4, -9.2, F, Q);
    flowerBed(s, 7.5, 9.0, 1.8, 6.6, F, Q);
    rainShelter(s, 7.35, 9.6, -6.2, 1.2, F, Q, { holo: true, inner: AD['brand-galaxy-link'], outer: AD['brand-photon-books'], outerScene: 'luoyang', outerWideScene: 'wangxi' });
    // and another past the ringed tree at the shop's far end, the Star Ring's ad on it (its own numbers)
    rainShelter(s, 7.35, 9.6, zB - 6.2, zB + 1.2, F, makeRandom(5300), { inner: AD['metro-sign'], outer: AD['brand-star-ring'] });
  }

  // Two stalls, Art Deco, streamlined: glass all round on rounded corners, chrome and brass, open at the front over
  // a glass counter; no names on them. Facing each other across the street on its pavements, their fronts in line
  // with the lamps:
  //   陇云边草  on the left, between 萤伞 and 流波月: a rounded oblong, lines along its walls low down; herbs tied in
  //            bundles (mugwort, lemongrass, lavender, rosemary), standing on its shelves and in baskets, hung over
  //            its counter, stacked on it
  //   春怀酒浓  across from it, a little further along (clear of the tree there): its front a half oval, the counter
  //            curving round it; drink in all sorts of glass as in an apothecary's (bottles, flasks, decanters,
  //            jars, phials, a carboy, barrels)
  // After the street's furniture, so that nothing else moves; with its own numbers
  function stalls() {
    const Rs = makeRandom(6060), T = (h) => new THREE.Color(h).toArray(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const CHROME = T('#c9d2d8'), BRASS = T('#b08d57'), DARK = T('#262a31'), PALE = T('#cfe0e4'), WARM = [1.9, 1.4, 0.75];
    const H = 3.45, B0 = 0.32;   // (its height; the top of its plinth)
    // glass: faint, brighter where seen edge on (its curves), at its top and foot, a streak of light across it now
    // and then (uv: x in metres along it, y 0..1 up it)
    const glassMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv; varying vec3 vN, vV;
        void main() {
          vUv = uv; vN = normalMatrix * normal;
          vec4 p = modelViewMatrix * vec4(position, 1.0); vV = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vN, vV;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          float rim = 1.0 - smoothstep(0.0, 0.025, min(vUv.y, 1.0 - vUv.y));
          float streak = smoothstep(0.07, 0.0, abs(fract((vUv.x + vUv.y * 1.6) / 2.4) - 0.5)) * 0.3;
          gl_FragColor = vec4(vec3(0.045, 0.06, 0.07) + vec3(0.3, 0.4, 0.44) * fres + vec3(0.28, 0.35, 0.38) * rim + vec3(0.15, 0.18, 0.2) * streak, 1.0);
        }`,
    });
    // outlines, as points [x, z]: a rounded rectangle's, going round from the middle of its -x side's (open) end
    const arc = (cx, cz, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
    const roundRect = (x0, x1, z0, z1, r) => [
      ...arc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5), ...arc(x1 - r, z0 + r, r, Math.PI * 1.5, Math.PI * 2),
      ...arc(x1 - r, z1 - r, r, 0, Math.PI / 2), ...arc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI)];
    const clean = (pts) => pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
    // a band of glass (or light) standing on a line of points
    const strip = (pts, y0, y1) => {
      const pos = [], uv = [], nor = [];
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
        if (l < 1e-5) continue;
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
        uv.push(s, 0, s + l, 0, s + l, 1, s, 0, s + l, 1, s, 1);
        for (let k = 0; k < 6; k++) nor.push((bz - az) / l, 0, -(bx - ax) / l);
        s += l;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.userData.length = s;
      return g;
    };
    // a slab of an outline (holes: outlines cut out of it), y0..y1; or flat, at y0 (sheet)
    const shape = (pts, holes = []) => {
      const sh = new THREE.Shape(clean(pts).map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const h of holes) sh.holes.push(new THREE.Path(clean(h).map(([x, z]) => new THREE.Vector2(x, -z))));
      return sh;
    };
    const slab = (pts, y0, y1, holes) => new THREE.ExtrudeGeometry(shape(pts, holes), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
    const sheet = (pts, y) => {
      const g = new THREE.ShapeGeometry(shape(pts)).rotateX(-Math.PI / 2).translate(0, y, 0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5);
      return g;
    };
    // a rod from a to b; rods along a line of points at a height
    const rod = (a, b, r) => {
      const d = b.clone().sub(a), l = d.length();
      return new THREE.CylinderGeometry(r, r, l, 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    const rods = (pts, y, r) => pts.slice(0, -1).map((p, i) => [p, pts[i + 1]]).filter(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4).map(([p, q]) => rod(V(p[0], y, p[1]), V(q[0], y, q[1]), r));
    // herbs: a bundle of stems from a tie of red string (or kraft), leaves along their upper parts. at: where its
    // tie is and which way it points (its stems along +y of that frame)
    const HERBS = [
      { stem: '#7d8a68', leaf: '#9fae8c', w: 0.038, l: 0.065, n: 5 },             // mugwort
      { stem: '#a9a65c', leaf: '#c3c27a', w: 0.012, l: 0.2, n: 1 },               // lemongrass
      { stem: '#77836a', leaf: '#93a084', w: 0.01, l: 0.04, n: 3, tip: '#8e72b8' },  // lavender
      { stem: '#4f6a4b', leaf: '#6a875e', w: 0.008, l: 0.035, n: 7 },             // rosemary
    ];
    const bundle = (P, at, kind, size = 1) => {
      const K = HERBS[kind], n = Rs.int(11, 15), C = { stem: T(K.stem), leaf: T(K.leaf), tip: K.tip && T(K.tip) };
      for (let i = 0; i < n; i++) {
        const len = Rs.range(0.3, 0.44) * size, m = at.clone().multiply(new THREE.Matrix4().makeRotationY(Rs.range(0, Math.PI * 2))).multiply(new THREE.Matrix4().makeRotationZ(Rs.range(-0.28, 0.28)));
        P(new THREE.CylinderGeometry(0.004, 0.006, len, 3).translate(0, len / 2, 0).applyMatrix4(m), 0.85, C.stem);
        for (let k = 0; k < K.n; k++) {
          const t = 0.4 + 0.6 * (k + 0.5) / K.n, l = K.l * size * Rs.range(0.8, 1.2);
          P(new THREE.SphereGeometry(1, 5, 3).scale(K.w * size, l / 2, 0.004).translate(0, l / 2, 0)
            .rotateZ((k % 2 ? 1 : -1) * Rs.range(0.35, 0.7)).rotateY(Rs.range(0, Math.PI)).translate(0, len * t, 0).applyMatrix4(m), 0.85, C.leaf);
        }
        if (C.tip) P(new THREE.CylinderGeometry(0.011, 0.007, 0.09 * size, 5).translate(0, len + 0.03 * size, 0).applyMatrix4(m), 0.85, C.tip);
      }
      P(new THREE.CylinderGeometry(0.036, 0.036, 0.065, 8).translate(0, 0.07 * size, 0).applyMatrix4(at), 0.85, T(Rs.chance(0.6) ? '#c8302c' : '#a2754a'));
    };
    // a bundle as it lies in a stack, made simply: its stems a tapering sheaf from the tie, cut square behind it, its
    // head a brush of leaves splaying out from them (blades for lemongrass, narrow for lavender with its purple
    // spikes, fine for rosemary, broad for mugwort). at: as bundle's
    const sheaf = (P, at, kind) => {
      const K = HERBS[kind], len = Rs.range(0.4, 0.5), C = { stem: T(K.stem), leaf: T(K.leaf) };
      P(new THREE.CylinderGeometry(0.038, 0.026, len * 0.7, 7).translate(0, len * 0.27, 0).applyMatrix4(at), 0.85, C.stem);
      P(new THREE.CylinderGeometry(0.031, 0.031, 0.04, 8).translate(0, 0.02, 0).applyMatrix4(at), 0.85, T(Rs.chance(0.6) ? '#c8302c' : '#a2754a'));
      const n = kind === 3 ? 13 : 10, l = kind === 1 ? 0.3 : 0.17, w = [0.05, 0.016, 0.014, 0.01][kind];
      for (let k = 0; k < n; k++) {
        const lk = l * Rs.range(0.75, 1.15), turn = (k / n) * Math.PI * 2 + Rs.range(-0.25, 0.25);
        P(new THREE.SphereGeometry(1, 6, 3).scale(w, lk / 2, 0.005).translate(0, lk / 2, 0).rotateX(Rs.range(0.15, 0.6)).rotateY(turn)
          .translate(0, len * Rs.range(0.5, 0.62), 0).applyMatrix4(at), 0.85, C.leaf);
      }
      if (K.tip) for (let k = 0; k < 5; k++) {
        const turn = k * 1.26 + 0.3;
        P(new THREE.CylinderGeometry(0.008, 0.012, 0.11, 4).translate(0, 0.055, 0).rotateX(0.3).rotateY(turn).translate(0, len * 0.62 + 0.09, 0).applyMatrix4(at), 0.85, T(K.tip));
      }
    };
    // drink: glass of all sorts, the drink in it lit (its colour), the glass above it pale, stoppers, labels
    const DRINK = { amber: [0.36, 0.17, 0.035], honey: [0.4, 0.27, 0.06], green: [0.07, 0.24, 0.08], emerald: [0.03, 0.26, 0.16],
      ruby: [0.32, 0.035, 0.06], rose: [0.36, 0.1, 0.15], cobalt: [0.05, 0.09, 0.36], violet: [0.19, 0.06, 0.31], clear: [0.2, 0.22, 0.22] };
    const LABEL = T('#e6dcc0'), CORK = T('#7a5a3c');
    const vessel = (P, G, type, x, y, z, s, drink) => {
      const c = DRINK[drink], cyl = (r0, r1, h, y0, seg = 10) => new THREE.CylinderGeometry(r0 * s, r1 * s, h * s, seg).translate(x, y + (y0 + h / 2) * s, z);
      const ball = (r, y0, sy = 1) => new THREE.SphereGeometry(r * s, 10, 8).scale(1, sy, 1).translate(x, y + y0 * s, z);
      if (type === 'tall') { G(cyl(0.042, 0.042, 0.2, 0), c); P(ball(0.042, 0.2, 0.6), 0.5, PALE); P(cyl(0.013, 0.016, 0.1, 0.22), 0.5, PALE); P(cyl(0.016, 0.016, 0.03, 0.31), 0.6, CORK); P(cyl(0.0435, 0.0435, 0.07, 0.05), 0.8, LABEL); }
      else if (type === 'flask') { G(ball(0.07, 0.07), c); P(cyl(0.012, 0.014, 0.12, 0.12), 0.5, PALE); P(ball(0.022, 0.255), 0.5, PALE); }
      else if (type === 'square') { G(new THREE.BoxGeometry(0.085 * s, 0.17 * s, 0.085 * s).translate(x, y + 0.085 * s, z), c); P(cyl(0.015, 0.02, 0.06, 0.17), 0.5, PALE); P(ball(0.03, 0.26, 1.2), 0.5, PALE); }
      else if (type === 'apoth') { G(cyl(0.06, 0.06, 0.14, 0, 12), c); P(cyl(0.064, 0.064, 0.02, 0.14, 12), 0.5, PALE); P(ball(0.025, 0.18), 0.5, PALE); P(cyl(0.0615, 0.0615, 0.05, 0.04, 12), 0.8, LABEL); }
      else if (type === 'erlen') { G(cyl(0.022, 0.07, 0.13, 0), c); P(cyl(0.02, 0.022, 0.07, 0.13), 0.5, PALE); P(cyl(0.024, 0.024, 0.02, 0.2), 0.6, CORK); }
      else if (type === 'gourd') { G(ball(0.055, 0.055), c); G(ball(0.036, 0.13), c); P(cyl(0.012, 0.014, 0.07, 0.16), 0.5, PALE); P(cyl(0.015, 0.015, 0.025, 0.23), 0.6, CORK); }
      else if (type === 'vials') for (const dz of [-0.04, 0, 0.04]) { G(new THREE.CylinderGeometry(0.013 * s, 0.013 * s, 0.09 * s, 6).translate(x, y + 0.045 * s, z + dz * s), DRINK[Rs.pick(Object.keys(DRINK))]); P(new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.025 * s, 6).translate(x, y + 0.1 * s, z + dz * s), 0.6, CORK); }
      else if (type === 'carboy') { G(ball(0.16, 0.16, 0.95), c); P(cyl(0.03, 0.04, 0.09, 0.3), 0.5, PALE); P(cyl(0.034, 0.034, 0.03, 0.39), 0.6, CORK); }
    };
    const WIDE = { tall: 0.1, flask: 0.16, square: 0.11, apoth: 0.14, erlen: 0.16, gourd: 0.12, vials: 0.13 };
    // one stall: its parts drawn in its own frame (its front toward -x), then turned (rotY) and set on the pavement at
    // (cx, cz); no one standing where it is
    const stall = (cx, cz, rotY, draw) => {
      const M = new THREE.Matrix4().makeTranslation(cx, CURB, cz).multiply(new THREE.Matrix4().makeRotationY(rotY));
      // (its lights: their own colours in colour mode, the city's tones outside it; toon.js glowMaterial)
      const P = (g, a, t) => props(g.applyMatrix4(M), a, t), G = (g, c) => bins.glow.add(g.applyMatrix4(M), { color: c, aBlink: 0, aKey: -100 });
      const glass = (g, mat = glassMat) => { const m = new THREE.Mesh(g.applyMatrix4(M), mat); m.layers.set(LAYER.GLOW); caseLabels.push(m); };
      const light = (x, y, z, nx, ny, nz, power, reach) => {
        const p = V(x, y, z).applyMatrix4(M), n = V(nx, ny, nz).transformDirection(M);
        emitters.push({ x: p.x, y: p.y, z: p.z, nx: n.x, ny: n.y, nz: n.z, power, reach, tint: 0.1 });
      };
      const outline = draw({ P, G, glass, light, M });
      const box3 = new THREE.Box3().setFromPoints(outline.map(([x, z]) => V(x, 0, z).applyMatrix4(M)));
      boxCollider(box3.min.x - 0.1, box3.max.x + 0.1, box3.min.z - 0.1, box3.max.z + 0.1);
      for (let i = people.length - 1; i >= 0; i--) if (people[i].x > box3.min.x - 0.5 && people[i].x < box3.max.x + 0.5 && people[i].z > box3.min.z - 0.5 && people[i].z < box3.max.z + 0.5 && people[i].y < 1) people.splice(i, 1);
    };
    // the bulbs: hung from its roof on a wire, glowing warm
    const bulb = (P, G, x, z, drop, r = 0.065) => {
      P(box(x - 0.006, x + 0.006, H - drop, H, z - 0.006, z + 0.006), 0.3);
      G(new THREE.SphereGeometry(r, 12, 8).scale(1, 1.25, 1).translate(x, H - drop - r, z), WARM);
    };
    // the roof: glass, in a lip of brass all round it
    const roof = (P, glass, loop, wider) => {
      glass(sheet(loop, H));
      P(slab(wider, H, H + 0.09, [loop]), 0.9, BRASS);
      P(slab(wider, H + 0.09, H + 0.11, [loop]), 0.6, DARK);
    };

    // 陇云边草: a rounded oblong, 2.4 deep by 3.9 (its front 7.6 out, as the lamps)
    stall(-8.8, -124.4, Math.PI, ({ P, G, glass, light }) => {
      const x0 = -1.2, x1 = 1.2, zw = 1.95, r = 0.5, za = zw - r, loop = roundRect(x0, x1, -zw, zw, r), grow = (e) => roundRect(x0 - e, x1 + e, -zw - e, zw + e, r + e);
      // its plinth, a band of brass round it; its walls of glass, chrome posts and rails, three lines round it low down
      P(slab(loop, 0, B0), 0.35, DARK);
      P(slab(grow(0.012), B0 - 0.06, B0 - 0.02), 0.9, BRASS);
      glass(strip(loop, B0, H));
      for (const g of [...rods(loop, B0, 0.025), ...rods(loop, H, 0.03), ...[0.62, 0.72, 0.82].flatMap((y) => rods(grow(0.02), y, 0.012))]) P(g, 0.95, CHROME);
      for (const [x, z] of [[x0, -za], [x0, za], [-0.6, -zw], [0, -zw], [0.6, -zw], [-0.6, zw], [0, zw], [0.6, zw], [x1, -za], [x1, -0.5], [x1, 0.5], [x1, za]])
        P(new THREE.CylinderGeometry(0.03, 0.03, H - B0, 8).translate(x, (B0 + H) / 2, z), 0.95, CHROME);
      roof(P, glass, loop, grow(0.14));
      // the counter: glass at its front, a top edged in chrome, a light along its floor
      glass(strip([[x0, -za], [x0, za]], B0, 1.15));
      P(slab(roundRect(x0 - 0.05, -0.55, -za, za, 0.06), 1.15, 1.2), 0.7, T('#cfc8b8'));
      P(rod(V(x0 - 0.05, 1.2, -za), V(x0 - 0.05, 1.2, za), 0.018), 0.95, CHROME);
      G(box(x0 + 0.04, x0 + 0.07, B0, B0 + 0.015, -za + 0.05, za - 0.05), [0.6, 0.48, 0.3]);
      // over its opening, a band, lit along its middle
      P(box(x0 - 0.06, x0 + 0.1, H - 0.42, H, -za, za), 0.4, DARK);
      for (const y of [H - 0.4, H - 0.02]) P(box(x0 - 0.075, x0 + 0.1, y - 0.015, y + 0.015, -za, za), 0.9, BRASS);
      G(box(x0 - 0.07, x0 - 0.06, H - 0.23, H - 0.19, -za + 0.1, za - 0.1), WARM);
      // inside: glass shelves along its back, herbs standing on them; baskets of tall ones in its back corners; a rail
      // across, herbs hung from it over the counter; bulbs behind it
      for (const y of [1.3, 2.0]) {
        P(slab(roundRect(0.7, x1 - 0.06, -1.15, 1.15, 0.04), y - 0.02, y), 0.5, PALE);
        P(rod(V(0.7, y, -1.15), V(0.7, y, 1.15), 0.01), 0.95, CHROME);
        for (let z = -1.0; z <= 1.01; z += 0.33) bundle(P, new THREE.Matrix4().makeTranslation(0.92 + Rs.range(-0.1, 0.1), y, z), Rs.int(0, 3), 1.15);
      }
      for (const e of [-1, 1]) {
        P(new THREE.CylinderGeometry(0.24, 0.2, 0.38, 14).translate(0.8, B0 + 0.19, e * 1.42), 0.8, T('#8a6a45'));
        for (let i = 0; i < 4; i++) bundle(P, new THREE.Matrix4().makeTranslation(0.8 + Rs.range(-0.1, 0.1), B0 + 0.3, e * 1.42 + Rs.range(-0.1, 0.1)), Rs.int(0, 3), 1.6);
      }
      P(rod(V(-0.35, H - 0.12, -1.45), V(-0.35, H - 0.12, 1.45), 0.015), 0.95, CHROME);
      for (let z = -1.25; z <= 1.26; z += 0.36) {
        P(box(-0.356, -0.344, H - 0.25, H - 0.12, z - 0.006, z + 0.006), 0.3);
        bundle(P, new THREE.Matrix4().makeTranslation(-0.35, H - 0.25, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI)), Rs.int(0, 3), 1.05);
      }
      for (const z of [-0.9, 0, 0.9]) bulb(P, G, 0.3, z, 0.5);
      // on the counter, bundles laid in a stack, their heads out toward the street over its edge, ties behind;
      // five layers, each a little shorter than the one under it
      for (let row = 0; row < 5; row++) {
        const d = 0.125, n = 22 - row * 2, y = 1.26 + row * 0.1;
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * d + (row % 2) * 0.03, kind = Rs.int(0, 3);
          sheaf(P, new THREE.Matrix4().makeTranslation(-0.72 - Rs.range(0, 0.06), y, z).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + Rs.range(-0.08, 0.08))).multiply(new THREE.Matrix4().makeRotationY(Rs.range(0, Math.PI * 2))), kind);
        }
      }
      light(0, H - 0.5, 0, 0, -1, 0, 0.7, 3.5);
      light(x0 - 0.4, 1.4, 0, -1, 0, 0, 0.55, 7);
      return loop;
    });

    // 春怀酒浓: its front a half oval (out to 1.5 before its sides), its back straight (the front of the oval 7.6 out)
    stall(9.1, -125.4, 0, ({ P, G, glass, light }) => {
      const xb = 0.9, zw = 1.95, rb = 0.35, ax = 1.5;
      const front = (e, a = ax + e, b = zw + e, t0 = Math.PI / 2, t1 = -Math.PI / 2, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const t = t0 + (t1 - t0) * i / n; return [-a * Math.cos(t), b * Math.sin(t)]; });
      const walls = (e) => [[0, -zw - e], ...arc(xb - rb, -zw + rb, rb + e, -Math.PI / 2, 0), ...arc(xb - rb, zw - rb, rb + e, 0, Math.PI / 2), [0, zw + e]];
      const loopE = (e) => [...walls(e), ...front(e).slice(1, -1)], loop = loopE(0);
      // its plinth, a band of brass; walls of glass, chrome posts and rails; a glass roof in brass
      P(slab(loop, 0, B0), 0.35, DARK);
      P(slab(loopE(0.012), B0 - 0.06, B0 - 0.02), 0.9, BRASS);
      glass(strip(walls(0), B0, H));
      for (const g of [...rods(walls(0), B0, 0.025), ...rods(walls(0), H, 0.03), ...rods(front(0), B0, 0.025)]) P(g, 0.95, CHROME);
      for (const [x, z] of [[0, -zw], [0, zw], [xb, -zw + rb], [xb, -0.55], [xb, 0.55], [xb, zw - rb]])
        P(new THREE.CylinderGeometry(0.03, 0.03, H - B0, 8).translate(x, (B0 + H) / 2, z), 0.95, CHROME);
      roof(P, glass, loop, loopE(0.14));
      // the counter, curving round its front: glass before and behind, a dark top in chrome
      const inner = (e = 0) => front(0, 0.95 + e, 1.4 + e);
      glass(strip(front(0), B0, 1.15));
      glass(strip(inner(), B0, 1.15));
      P(slab([...front(0.04), ...inner().reverse()], 1.15, 1.2), 0.6, T('#3a3f47'));
      for (const g of rods(front(0.04), 1.2, 0.018)) P(g, 0.95, CHROME);
      for (const g of rods(front(-0.05), B0 + 0.01, 0.008)) G(g, [0.6, 0.48, 0.3]);
      // over its opening, a band curving round, three lines along it, lit below them
      P(slab([...front(0.06), ...front(-0.14).reverse()], H - 0.42, H), 0.4, DARK);
      for (const y of [H - 0.32, H - 0.24, H - 0.16]) for (const g of rods(front(0.07), y, 0.012)) P(g, 0.95, CHROME);
      for (const g of rods(front(0.07, ax + 0.07, zw + 0.07, Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25), H - 0.38, 0.016)) G(g, WARM);
      // inside: shelves up its back, glass of every sort on them; two barrels and a carboy below; on the counter a
      // decanter, a rack of phials, three coupes; a globe hung in the middle, two small ones
      const kinds = Object.keys(DRINK).filter((k) => k !== 'clear').concat(['clear']);
      for (const y of [1.25, 1.75, 2.25, 2.75]) {
        P(slab(roundRect(0.5, xb - 0.05, -1.5, 1.5, 0.04), y - 0.02, y), 0.5, PALE);
        P(rod(V(0.5, y, -1.5), V(0.5, y, 1.5), 0.01), 0.95, BRASS);
        for (let z = -1.42; z < 1.42;) {
          const type = Rs.pick(['tall', 'tall', 'flask', 'square', 'apoth', 'erlen', 'gourd', 'vials']), w = WIDE[type] * 1.1;
          if (z + w > 1.45) break;
          vessel(P, G, type, 0.7 + Rs.range(-0.06, 0.06), y, z + w / 2, Rs.range(0.95, 1.15), Rs.pick(kinds));
          z += w + Rs.range(0.01, 0.05);
        }
      }
      for (const e of [-1, 1]) {
        const g = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => new THREE.Vector2(0.17 + 0.035 * Math.sin(Math.PI * i / 8), -0.24 + 0.48 * i / 8)), 16);
        P(g.rotateZ(Math.PI / 2).translate(0.6, B0 + 0.24, e * 1.0), 0.75, T('#7b5536'));
        for (const dx of [-0.17, 0.17]) P(new THREE.TorusGeometry(0.185, 0.012, 4, 20).rotateY(Math.PI / 2).translate(0.6 + dx, B0 + 0.24, e * 1.0), 0.9, BRASS);
        P(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6).rotateZ(Math.PI / 2).translate(0.32, B0 + 0.16, e * 1.0), 0.9, BRASS);
      }
      vessel(P, G, 'carboy', 0.62, B0, 0, 1.0, 'emerald');
      const onTop = (t) => [-1.22 * Math.cos(t), 1.2, 1.67 * Math.sin(t)];   // (on the counter, midway across it)
      { const [x, y, z] = onTop(-1.05); vessel(P, G, 'square', x, y, z, 1.25, 'amber'); }
      { const [x, y, z] = onTop(-0.75); P(box(x - 0.05, x + 0.05, y, y + 0.02, z - 0.12, z + 0.12), 0.9, BRASS); for (const dz of [-0.09, -0.03, 0.03, 0.09]) vessel(P, G, 'vials', x, y + 0.02, z + dz, 0.8, 'ruby'); }
      for (const t of [0.78, 0.92, 1.06]) {
        const [x, y, z] = onTop(t);
        P(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10).translate(x, y + 0.003, z), 0.5, PALE);
        P(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 5).translate(x, y + 0.05, z), 0.5, PALE);
        P(new THREE.CylinderGeometry(0.055, 0.012, 0.04, 12, 1, true).translate(x, y + 0.115, z), 0.5, PALE);
        G(new THREE.CylinderGeometry(0.048, 0.048, 0.006, 12).translate(x, y + 0.125, z), Rs.pick([DRINK.ruby, DRINK.amber, DRINK.rose]));
      }
      bulb(P, G, -0.25, 0, 0.55, 0.15);
      for (const z of [-1.1, 1.1]) bulb(P, G, 0.1, z, 0.45);
      light(-0.2, H - 0.6, 0, 0, -1, 0, 0.75, 3.5);
      light(-ax - 0.4, 1.4, 0, -1, 0, 0, 0.55, 7);
      return loop;
    });
  }

  // ---------------------------------------------------------------- along the street: flower beds, rain shelters
  // Wherever the strip of pavement beside the road is free for long enough (between the trees and lamps, clear of
  // the crossings, of plinths, terraces and stairs, of anything one would walk into), a flower bed now and then,
  // and every ninth such gap a rain shelter (without the bookshop's hologram), the two sides out of step. Last of
  // all, so it sees everything else; with its own random numbers, so nothing else moves.
  function streetFurniture() {
    const RF = makeRandom(4100), F = CURB, A0 = 7.3, A1 = 9.8;
    const clear = (s, z0, z1, treeGap) => {
      if (CROSSINGS.some((c) => z1 > c - CROSS_HALF - 3 && z0 < c + CROSS_HALF + 3)) return false;
      const [x0, x1] = sorted(s * A0, s * A1), pad = 0.3;
      const near = (x, z, r) => Math.hypot(x - Math.max(x0, Math.min(x, x1)), z - Math.max(z0, Math.min(z, z1))) < r;
      for (const c of colliders) {
        if (c.y0 !== undefined && c.y0 > 1.5) continue;
        if (c.r !== undefined ? near(c.x, c.z, c.r + pad) : c.x0 < x1 + pad && c.x1 > x0 - pad && c.z0 < z1 + pad && c.z1 > z0 - pad) return false;
      }
      if (trees.some((t) => near(t.x, t.z, treeGap))) return false;
      return !floors.some((f) => f.x0 < x1 && f.x1 > x0 && f.z0 < z1 && f.z1 > z0);
    };
    const brands = BRAND_ADS;
    for (const s of [-1, 1]) {
      const gaps = [];
      for (let z = WALK.zMin + 10; z < WALK.zMax - 15;) {
        if (!clear(s, z, z + 5.4, 1.2)) { z += 0.5; continue; }
        let e = z + 5.4;
        while (e < WALK.zMax - 10 && clear(s, z, e + 0.5, 1.2)) e += 0.5;
        gaps.push([z, e]);
        z = e + 1;
      }
      gaps.forEach(([g0, g1], i) => {
        const k = (i + (s > 0 ? 4 : 0)) % 9, mid = (g0 + g1) / 2;
        if (k === 0 && g1 - g0 >= 8.2 && clear(s, mid - 3.9, mid + 3.9, 2.6)) {
          rainShelter(s, 7.35, 9.6, mid - 3.7, mid + 3.7, F, RF, { inner: RF.pick(brands), outer: RF.pick(brands) });
        } else if ([1, 4, 6, 8].includes(k)) {
          const len = Math.min(g1 - g0 - 1, RF.range(4.6, 6.4));
          flowerBed(s, 7.5, 9.0, mid - len / 2, mid + len / 2, F, RF);
        }
      });
    }
  }

  // A brand's name on a dark plate, in the yellow of its case: drawn once on a canvas (aspect: its width over
  // its height), the geometry already placed
  function nameplate(geom, name, en, aspect) {
    const cv = document.createElement('canvas'), H = 128, Wd = Math.round(H * aspect);
    cv.width = Wd; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#110f1c';
    g.beginPath(); g.roundRect(0, 0, Wd, H, H * 0.12); g.fill();
    g.fillStyle = '#f7c548'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${H * 0.46}px "PingFang SC", "Noto Sans SC", sans-serif`;
    g.fillText(name, Wd / 2, H * 0.42, Wd * 0.9);
    g.font = `600 ${H * 0.15}px "PingFang SC", "Noto Sans SC", sans-serif`;
    g.fillText(en.split('').join(String.fromCharCode(8202)), Wd / 2, H * 0.8, Wd * 0.9);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.layers.set(LAYER.GLOW);
    return m;
  }

  // A brand's name popping in as an anime's title does: each character in turn grows out of nothing past its size
  // and settles, with a little hop, its English line after; all of them away again at the round's end. White, on
  // nothing; P the round (seconds), at when in it the first one comes; the geometry placed
  // (its characters close together, a cell each, in the middle; font: theirs, or a heavy sans)
  function popName(geom, name, en, aspect, P, at, font = null, chars0 = true) {   // (chars0 false: its English alone)
    const chars = [...name], H = 200, Wd = Math.round(H * aspect), cv = document.createElement('canvas');
    cv.width = Wd; cv.height = H;
    const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const size = Math.min(H * 0.5, Wd / chars.length * 0.78), cell = Math.min(Wd / chars.length, size * 1.08), x0 = (Wd - cell * chars.length) / 2;
    g.font = font ? `400 ${size}px ${font}` : `800 ${size}px "PingFang SC", "Noto Sans SC", sans-serif`;
    if (chars0) chars.forEach((ch, i) => {
      g.fillStyle = '#ffffff'; g.fillText(ch, x0 + (i + 0.5) * cell, H * 0.38);
    });
    g.font = `700 ${H * 0.12}px "PingFang SC", "Noto Sans SC", sans-serif`;
    const enS = en.split('').join(String.fromCharCode(8202));
    g.fillStyle = '#ffffff'; g.fillText(enS, Wd / 2, H * 0.84, Wd * 0.9);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMap: { value: tex }, uN: { value: chars.length }, uP: { value: P }, uAt: { value: at }, uBand: { value: new THREE.Vector2(x0 / Wd, cell * chars.length / Wd) } },
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform float uTime, uN, uP, uAt; uniform vec2 uBand; varying vec2 vUv;
        float backOut(float x) { float c1 = 2.2, c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }
        void main() {
          float t = mod(uTime, uP), away = 1.0 - smoothstep(uP - 0.45, uP - 0.15, t), a = 1.0;
          vec2 uv = vUv;
          if (vUv.y > 0.3) {                            // its characters, each in its cell, grown about its middle
            float bx = (vUv.x - uBand.x) / uBand.y;
            if (bx < 0.0 || bx >= 1.0) discard;
            float i = floor(bx * uN), lt = t - uAt - i * 0.11;
            float s = (lt < 0.0 ? 0.0 : lt < 0.4 ? backOut(lt / 0.4) : 1.0) * away;
            float hop = lt > 0.0 && lt < 0.4 ? sin(lt / 0.4 * 3.1416) * 0.1 : 0.0;
            float lx = (fract(bx * uN) - 0.5) / max(s, 0.001) + 0.5;
            uv.y = (vUv.y - 0.62 - hop) / max(s, 0.001) + 0.62;
            if (s < 0.01 || lx < 0.0 || lx > 1.0 || uv.y < 0.3 || uv.y > 1.0) discard;
            uv.x = uBand.x + (i + lx) / uN * uBand.y;
          } else a = smoothstep(0.0, 0.3, t - uAt - uN * 0.11 - 0.15) * away;
          vec4 tx = texture2D(uMap, uv);
          if (tx.a * a < 0.01) discard;
          gl_FragColor = vec4(tx.rgb, tx.a * a);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    m.renderOrder = 5;
    return m;
  }

  // A brand's name that comes one character after another, stays a while, and goes (12 s round, from phase):
  // light letters on nothing, drawn once on a canvas, its English line under it after them; the geometry placed
  function revealName(geom, name, en, aspect, phase) {
    const chars = [...name], H = 160, Wd = Math.round(H * aspect), cv = document.createElement('canvas');
    cv.width = Wd; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff3d6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.min(H * 0.52, Wd / chars.length * 0.8)}px "PingFang SC", "Noto Sans SC", sans-serif`;
    chars.forEach((ch, i) => g.fillText(ch, (i + 0.5) / chars.length * Wd, H * 0.38));
    g.font = `600 ${H * 0.13}px "PingFang SC", "Noto Sans SC", sans-serif`;
    g.fillText(en.split('').join(String.fromCharCode(8202)), Wd / 2, H * 0.84, Wd * 0.9);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMap: { value: tex }, uN: { value: chars.length }, uPhase: { value: phase } },
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform float uTime, uN, uPhase; varying vec2 vUv;
        void main() {
          vec4 tx = texture2D(uMap, vUv);
          float t = mod(uTime + uPhase, 12.0), step = 0.45;
          // each character in turn (its cell across), then the line under them
          float on = vUv.y > 0.3 ? smoothstep(0.0, 0.25, t - floor(vUv.x * uN) * step) : smoothstep(0.0, 0.5, t - uN * step - 0.2);
          float a = tx.a * on * (1.0 - smoothstep(7.5, 8.5, t));
          if (a < 0.01) discard;
          gl_FragColor = vec4(tx.rgb * 1.25, a);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    m.renderOrder = 5;
    return m;
  }

  // A still picture shown as an LED panel w x h (the geometry placed): drawn once on a canvas, grey on black
  // (draw(ctx, width, height)), shown through a grid of round dots, density of them a metre, each dot as bright
  // as the picture at its middle; dark where it is black, low (a colour) where it is grey, high where it is white
  // (high above 1 glows). From afar the dots blur into the picture.
  // screen: in the LED screens' own colours instead (tuning screens: its cyan for low, its white for high)
  // (glass: a clear screen, nothing behind its lit pixels, an unlit one not there at all: square pixels, rounded, a
  // gap between; its greys taken as five levels (the edge of a thing, water, coffee, milk, foam: 60, 90, 140, 200,
  // 255) in the screens' colours, dim to bright; its edge a thin line of light, a stud at each corner)
  function ledPicture(geom, w, h, draw, { low = [0.5, 0.6, 0.65], high = [1.8, 1.95, 1.95], bg = [0.012, 0.025, 0.04], density = 14, screen = false, glass = false, smoked = false, scroll = 0, loop = 0 } = {}) {
    // (loop: with scroll, how many pixels long what goes by is, drawn once and shown over and over; else as wide as the screen)
    const nx = Math.round(w * density), ny = Math.round(h * density), cv = document.createElement('canvas');
    cv.width = (scroll && loop ? loop : nx) * 4; cv.height = ny * 4;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    draw(g, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uN: { value: new THREE.Vector2(nx, ny) }, uLow: { value: new THREE.Vector3(...low) }, uHigh: { value: new THREE.Vector3(...high) }, uBg: { value: new THREE.Vector3(...bg) },
        uScreen: { value: screen ? 1 : 0 }, uGlass: { value: glass ? 1 : 0 }, uSmoked: { value: smoked ? 1 : 0 }, uScroll: { value: scroll }, uLoop: { value: scroll && loop ? loop : nx }, uTime: shared.uTime, uScrMid: shared.uScrMid, uScrHot: shared.uScrHot, uScrDark: shared.uScrDark, uHue: shared.uHue },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform vec2 uN; uniform vec3 uLow, uHigh, uBg, uScrMid, uScrDark; uniform float uScreen, uScrHot, uGlass, uSmoked, uScroll, uLoop, uTime;
        uniform mat3 uHue; varying vec2 vUv;
        void main() {
          vec3 low = uLow, high = uHigh, bg = uBg;
          if (uScreen > 0.5) { low = uScrMid; high = uHue * vec3(0.92, 1.0, 1.0) * uScrHot * 0.8; bg = uScrDark; }
          vec2 led = vUv * uN;
          float v = texture2D(uMap, (floor(led) + 0.5) / uN).r;
          if (uGlass > 0.5) {
            // (scroll: what it shows going left, a whole pixel at a time, uScroll pixels a second, round and round)
            if (uScroll > 0.0) v = texture2D(uMap, (vec2(mod(floor(led.x) + floor(uTime * uScroll), uLoop), floor(led.y)) + 0.5) / vec2(uLoop, uN.y)).r;
            float aa = 1.0 - smoothstep(0.2, 0.5, max(fwidth(led.x), fwidth(led.y)));
            float e = min(min(led.x, led.y), min(uN.x - led.x, uN.y - led.y));
            vec2 q = min(led, uN - led);
            if (length(q - 1.0) < 0.42) { gl_FragColor = vec4(vec3(0.32, 0.36, 0.4), 1.0); return; }   // a stud
            if (e < 0.16) { gl_FragColor = vec4(low * 0.3, 1.0); return; }                                // the glass's edge
            float lv = v < 0.17 ? 0.0 : v < 0.29 ? 1.0 : v < 0.45 ? 2.0 : v < 0.67 ? 3.0 : v < 0.89 ? 4.0 : 5.0;
            vec2 f = abs(fract(led) - 0.5);
            float sq = 1.0 - smoothstep(-0.04, 0.04, length(max(f - 0.24, 0.0)) - 0.14);
            if (lv < 0.5 || mix(1.0, sq, aa) < 0.5) {
              if (uSmoked < 0.5) discard;
              gl_FragColor = vec4(uScrDark * 0.55, 1.0); return;               // (smoked glass: dark, plain, behind)
            }
            float l = dot(low, vec3(0.3, 0.55, 0.15));
            vec3 c = lv < 1.5 ? mix(vec3(l), low, 0.45) * 0.8         // the edge of a thing
              : lv < 2.5 ? low * 0.2                                   // water
              : lv < 3.5 ? low * vec3(0.55, 0.75, 1.1) * 0.55          // coffee
              : lv < 4.5 ? mix(low, high * 0.62, 0.4) : high * 0.62;  // milk, foam (not so bright as to bleed)
            gl_FragColor = vec4(c * mix(0.7, 1.0, aa), 1.0);
            return;
          }
          float dotm = 1.0 - smoothstep(0.3, 0.46, length(fract(led) - 0.5));
          float aa = 1.0 - smoothstep(0.2, 0.5, max(fwidth(led.x), fwidth(led.y)));
          vec3 lit = v < 0.5 ? low * smoothstep(0.05, 0.5, v) : mix(low, high, (v - 0.5) * 2.0);
          gl_FragColor = vec4(mix(bg, lit, mix(0.55, dotm, aa)), 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 浮岛咖啡's seats: a low round platform as a little island, floating (a light in the gap under its edge), a ring of
  // table round what grows or shines in its middle (a little tree, or a lamp), cushions round it; its foot at
  // (x, y0, z), r across; into ip (solid) and ig (light), its numbers from Rn; what it is in the way of, returned
  function floatIsland(ip, ig, x, y0, z, r, middle, Rn) {
    const STONE = new THREE.Color('#c9b9a0').toArray(), MOSS = new THREE.Color('#7fa86a').toArray(), CUSH = new THREE.Color('#ff9d5c').toArray();
    ip(new THREE.CylinderGeometry(r * 0.9, r * 0.82, 0.06, 28).translate(x, y0 + 0.03, z), 0.3);                    // what it stands on, set back
    ig(new THREE.TorusGeometry(r * 0.88, 0.012, 4, 40).rotateX(Math.PI / 2).translate(x, y0 + 0.07, z), [1.6, 1.15, 0.7]);   // the light under it
    ip(new THREE.CylinderGeometry(r, r * 0.94, 0.16, 28).translate(x, y0 + 0.16, z), 0.75, STONE);
    ip(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.02, 28).translate(x, y0 + 0.25, z), 0.45, MOSS);
    const top = y0 + 0.26;
    // the ring of table round its middle, on three short legs
    ip(new THREE.RingGeometry(r * 0.28, r * 0.55, 32).rotateX(-Math.PI / 2).translate(x, top + 0.48, z), 0.85, TINT.wood);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; ip(new THREE.CylinderGeometry(0.02, 0.02, 0.48, 5).translate(x + Math.cos(a) * r * 0.45, top + 0.24, z + Math.sin(a) * r * 0.45), 0.3); }
    if (middle === 'tree') {
      ip(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 6).translate(x, top + 0.55, z), 0.4, TINT.wood);
      for (let k = 0; k < 5; k++) ip(new THREE.IcosahedronGeometry(Rn.range(0.18, 0.3), 0).translate(x + Rn.range(-0.2, 0.2), top + 1.1 + Rn.range(0, 0.3), z + Rn.range(-0.2, 0.2)), 0.35, MOSS);
    } else {
      ip(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6).translate(x, top + 0.5, z), 0.3);
      ig(new THREE.SphereGeometry(0.17, 16, 10).translate(x, top + 1.12, z), [1.6, 1.2, 0.8]);
    }
    // cushions round it, on the moss
    const n = r > 1 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.4;
      ip(new THREE.CylinderGeometry(0.2, 0.21, 0.16, 14).translate(x + Math.cos(a) * r * 0.78, top + 0.08, z + Math.sin(a) * r * 0.78), 0.8, CUSH);
    }
  }
  // the island lamp hung in its window: a little island upside down in the air (its rock to a point beneath, grass
  // and a tree on top), a cloud beside it, lit; at (x, y, z), its wire up to ceil
  function islandLamp(ip, ig, x, y, z, ceil, Rn) {
    ip(new THREE.ConeGeometry(0.42, 0.55, 9).rotateX(Math.PI).translate(x, y - 0.28, z), 0.7, new THREE.Color('#9a8a78').toArray());
    ip(new THREE.CylinderGeometry(0.43, 0.42, 0.06, 18).translate(x, y + 0.03, z), 0.45, new THREE.Color('#7fa86a').toArray());
    ip(new THREE.CylinderGeometry(0.02, 0.03, 0.35, 5).translate(x + 0.08, y + 0.23, z), 0.4, TINT.wood);
    for (let k = 0; k < 3; k++) ip(new THREE.IcosahedronGeometry(Rn.range(0.1, 0.16), 0).translate(x + 0.08 + Rn.range(-0.08, 0.08), y + 0.45 + Rn.range(0, 0.12), z + Rn.range(-0.08, 0.08)), 0.35, new THREE.Color('#7fa86a').toArray());
    for (const [dx, dy, r] of [[-0.45, 0.25, 0.16], [-0.6, 0.18, 0.12], [-0.32, 0.17, 0.12], [-0.48, 0.38, 0.11]]) ig(new THREE.SphereGeometry(r, 12, 8).translate(x + dx, y + dy, z), [1.5, 1.45, 1.35]);
    ig(new THREE.SphereGeometry(0.05, 8, 6).translate(x, y - 0.58, z), [1.6, 1.2, 0.8]);      // a light at its point
    ip(new THREE.CylinderGeometry(0.005, 0.005, ceil - y - 0.03, 4).translate(x, (ceil + y + 0.03) / 2, z), 0.3);
  }
  // the screen of scene.pixel (makeCase): w x h, its numbers from R, B the brand. Where each thing is lit, in what
  // colour, when it comes and when it goes, worked out here a pixel at a time (from Google's cloud and cup, and the
  // name, drawn large and looked at in the middle of each pixel) and kept in textures; the shader only shows them
  function pixelCafe(geom, w, h, R, B) {
    const P = 9, wide = w / h >= 1.2, NY = Math.round(wide ? 40 : 40 * h / w), NX = Math.round(NY * w / h), S = 12;
    const big = (draw) => { const c = document.createElement('canvas'); c.width = NX * S; c.height = NY * S; const g = c.getContext('2d'); draw(g); return g.getImageData(0, 0, c.width, c.height).data; };
    // where things go (in pixels): the cloud's icon U across (the cloud in it 0.92 of that, drawn 0.73 as high as it is
    // there), the cup on it, sitting a little into it, steam over it (7 rows); the name beside them (wide) or over them
    const cn = Math.max(5.6, NY * 0.14), nameW = cn * 4.15, nameH = cn * 1.75, steam = 7;   // (cn: its characters' height)
    const U0 = wide ? Math.min((NY * 0.86 - steam) / 0.63, (NX * 0.9 - nameW) / 1.02) : Math.min(NX * 0.82 / 0.92, (NY * 0.88 - nameH - 3 - steam) / 0.63);
    const at = (data, X, Y, sx = 1) => data[((Math.floor(Y * S) * NX * S) + Math.floor(X * S)) * 4 + sx];
    const tex = (NXn, NYn, fill) => {
      const a = new Uint8Array(NXn * NYn * 4);
      for (let j = 0; j < NYn; j++) for (let i = 0; i < NXn; i++) { const v = fill(i, NYn - 1 - j); if (v) a.set(v, (j * NXn + i) * 4); }
      const t = new THREE.DataTexture(a, NXn, NYn); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
      return t;
    };
    const when = (row) => [Math.round(((NY - row) / NY * 2.0 + R.range(0, 0.5)) / P * 255), Math.round(R.range(7.4, 8.6) / P * 255)];
    const inside = (i, j, n, m) => i >= 0 && j >= 0 && i < n && j < m;
    const bounds = () => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const grow = (b, x0, x1, y0, y1) => { b.x0 = Math.min(b.x0, x0); b.x1 = Math.max(b.x1, x1); b.y0 = Math.min(b.y0, y0); b.y1 = Math.max(b.y1, y1); };
    const mid = (a, b, n) => Math.round((n - (a + b)) / 2);
    const F = 3;                                                 // (the name's pixels: a third the size)
    // all of it drawn with the cloud's icon U across, and measured as it came out (what is lit, not what was meant):
    // the cloud, the cup, the steam's threads and rows, the name
    const compose = (U) => {
      const gw = wide ? U * 1.02 + nameW : U * 0.92, gh = steam + U * 0.63 + (wide ? 0 : nameH + 3);
      const gx = (NX - gw) / 2, gy = (NY - gh) / 2;                         // (the group's top left)
      const cloudX = gx - U * 0.04, cloudY = gy + (wide ? 0 : nameH + 3) + steam + U * 0.125, cloudMid = cloudY + U * 0.265;
      const cupW = U * 0.6, cupX = cloudX + U * 0.45 - cupW * 0.46, cupY = cloudY - U * 0.2;   // (its icon's box, cupW square)
      const nx0 = wide ? gx + U * 1.02 : (NX - nameW) / 2, ny0 = wide ? gy + gh * 0.5 - nameH / 2 : gy;
      const cloud = big((g) => drawIcon(g, 'material/cloud', (cloudX + U / 2) * S, cloudMid * S, U * S, '#fff'));
      const cup = big((g) => drawIcon(g, 'material/coffee', (cupX + cupW / 2) * S, (cupY + cupW / 2) * S, cupW * S, '#fff'));
      const cl = (i, j) => { const yy = cloudMid + (j + 0.5 - cloudMid) / 0.73; return inside(i, j, NX, NY) && yy > 0 && yy < NY && at(cloud, i + 0.5, yy, 3) > 128; };
      const cu = (i, j) => inside(i, j, NX, NY) && at(cup, i + 0.5, j + 0.5, 3) > 128;
      // the name: its characters, its English under, lit from the left
      const name = (() => {
        const c = document.createElement('canvas'); c.width = NX * F * 4; c.height = NY * F * 4; const g = c.getContext('2d');
        const q = F * 4, x0 = nx0 * q;
        const ax = wide ? x0 + cn * 0.04 * q : x0 + nameW * q / 2;
        g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = wide ? 'left' : 'center';
        g.font = `500 ${cn * q}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText(B.name, ax, (ny0 + cn * 0.55) * q, nameW * q);
        g.fillStyle = '#0ff'; g.font = `600 ${cn * 0.42 * q}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText(B.en.split('').join(String.fromCharCode(8202)), ax + (wide ? cn * 0.04 * q : 0), (ny0 + cn * 1.5) * q, nameW * q);
        return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width };
      })();
      const nm = (i, j) => inside(i, j, NX * F, NY * F) && name.d[((j * 4 + 2) * name.W + i * 4 + 2) * 4 + 3] >= 110;
      const sx = cupX + cupW * 0.46, sy = NY - (cupY + cupW * 0.125) + 1, sz = Math.max(2, Math.round(cupW * 0.12));
      const pic = bounds(), cupB = bounds(), txt = bounds();
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        if (cl(i, j) || cu(i, j)) grow(pic, i, i + 1, j, j + 1);
        if (cu(i, j)) grow(cupB, i, i + 1, j, j + 1);
      }
      grow(pic, Math.floor(sx - sz), Math.floor(sx + sz) + 2, NY - (Math.floor(sy) + 6), NY - Math.floor(sy));
      for (let j = 0; j < NY * F; j++) for (let i = 0; i < NX * F; i++) if (nm(i, j)) grow(txt, i / F, (i + 1) / F, j / F, (j + 1) / F);
      return { cl, cu, nm, name, sx, sy, sz, pic, cupB, txt };
    };
    // then moved, a whole pixel at a time: in a wide case the cup and the name, from the cup's left to the name's
    // right, in the middle across (the cloud reaching out past the cup as it will), the picture in the middle up and
    // down, the name too; in a tall one each in the middle across, the two over one another in the middle up and
    // down. Where the cloud would then come too near the edge, all of it drawn a little smaller and set again
    let L, pdx, pdy, tdx, tdy;                                  // (the picture's shift in pixels, the name's in its small ones)
    for (let n = 0, k = 1; n < 8; n++, k *= 0.94) {
      L = compose(U0 * k);
      const { pic, cupB, txt } = L;
      if (wide) {
        // (the name then nudged by its own small pixels, so that the two margins come out the same)
        pdx = mid(cupB.x0, txt.x1, NX); tdx = Math.round(F * (NX - (cupB.x0 + pdx) - txt.x1));
        pdy = mid(pic.y0, pic.y1, NY); tdy = mid(txt.y0 * F, txt.y1 * F, NY * F);
        if (pic.x0 + pdx >= 2 && pic.x1 + pdx <= NX - 2 && pic.y0 + pdy >= 1) break;
      } else {
        pdx = mid(pic.x0, pic.x1, NX); tdx = mid(txt.x0 * F, txt.x1 * F, NX * F);
        const dy = mid(Math.min(pic.y0, txt.y0), Math.max(pic.y1, txt.y1), NY);
        pdy = dy; tdy = dy * F;
        break;
      }
    }
    const { cl, cu, nm, name, sx, sy, sz, txt } = L;
    const tCloud = tex(NX, NY, (i, j) => (cl(i - pdx, j - pdy) ? [cl(i - pdx, j - pdy + 1) ? 1 : 2, ...when(j), 255] : null));
    const tCup = tex(NX, NY, (i, j) => (cu(i - pdx, j - pdy) ? [3, ...when(j), 255] : null));
    const tName = tex(NX * F, NY * F, (i, j) => {
      const ii = i - tdx, jj = j - tdy;
      if (!nm(ii, jj)) return null;
      const t0 = 2.3 + (ii / F - txt.x0) / Math.max(1, txt.x1 - txt.x0) * 0.9 + R.range(0, 0.15);
      return [name.d[((jj * 4 + 2) * name.W + ii * 4 + 2) * 4] < 128 ? 6 : 5, Math.round(t0 / P * 255), Math.round(R.range(7.6, 8.6) / P * 255), 255];
    });
    const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uP: { value: P }, uN: { value: new THREE.Vector2(NX, NY) }, uCloud: { value: tCloud }, uCup: { value: tCup }, uName: { value: tName },
        uSteam: { value: new THREE.Vector3(sx + pdx, sy - pdy, sz) },
        uBand: { value: [col('#0f2140'), col('#132a4f'), col('#18335d')] },
        uPal: { value: [col('#000000'), col('#cdebf5', 0.8), col('#6fbcd6', 0.7), col('#ffffff', 1.05), col('#ff9d5c', 1.1), col('#e8f8fc', 1.0), col('#5fe3f2', 0.95), col('#5fa9c4', 0.8), col('#2b5a7d', 0.8)] },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uCloud, uCup, uName; uniform vec2 uN; uniform vec3 uSteam, uBand[3], uPal[9]; uniform float uTime, uP;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        // a pixel's square (rounded, a gap round it), f where in it
        float square(vec2 f, float aa) { vec2 q = abs(f - 0.5); return mix(0.8, 1.0 - smoothstep(-0.05, 0.05, length(max(q - 0.26, 0.0)) - 0.16), aa); }
        // what a texel says: lit, in which colour, now (t); a flash of white as it comes and goes
        bool lit(vec4 s, float t, out vec3 c) {
          if (s.a < 0.5) return false;
          float a = s.g * uP, b = s.b * uP;
          if (t < a || t > b) return false;
          c = (t - a < 0.12 || b - t < 0.1) ? vec3(1.5) : uPal[int(s.r * 255.0 + 0.5)];
          return true;
        }
        vec4 texel(sampler2D T, vec2 c, vec2 n) { return (c.x < 0.0 || c.y < 0.0 || c.x >= n.x || c.y >= n.y) ? vec4(0.0) : texture2D(T, (c + 0.5) / n); }
        void main() {
          float t = mod(uTime, uP);
          vec2 g = vUv * uN, c = floor(g);
          float aa = 1.0 - smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
          vec3 band = c.y < uN.y / 3.0 ? uBand[2] : c.y < uN.y * 2.0 / 3.0 ? uBand[1] : uBand[0];
          vec3 px = band * 1.45, pc;
          bool on = false, floating = t > 2.4 && t < 7.4;
          float bob = floating ? floor(sin((t - 2.4) * 1.6) + 0.5) : 0.0;
          if (lit(texel(uCloud, c, uN), t, pc)) { px = pc; on = true; }
          vec2 cc = c - vec2(0.0, bob);
          if (lit(texel(uCup, cc, uN), t, pc)) { px = pc; on = true; }
          else if (on) {                                                         // (a pixel of dark round the cup, against the cloud)
            vec3 q;
            if (lit(texel(uCup, cc + vec2(1.0, 0.0), uN), t, q) || lit(texel(uCup, cc - vec2(1.0, 0.0), uN), t, q)
              || lit(texel(uCup, cc + vec2(0.0, 1.0), uN), t, q) || lit(texel(uCup, cc - vec2(0.0, 1.0), uN), t, q)) px = band * 1.45;
          }
          if (floating) for (int k = 0; k < 3; k++) for (int n = 0; n < 4; n++) {     // the steam: three threads going up
            float ph = mod(t * 3.0 + float(n) * 1.5 + float(k) * 2.0, 6.0), st = floor(ph);
            vec2 s = vec2(floor(uSteam.x + (float(k) - 1.0) * uSteam.z) + mod(st, 2.0), floor(uSteam.y) + st + bob);
            if (c == s) { px = ph < 4.0 ? uPal[7] : uPal[8]; on = true; }
          }
          vec3 col = mix(band * 0.55, px, square(fract(g), aa));
          vec2 gn = vUv * uN * 3.0, cn = floor(gn);
          if (lit(texel(uName, cn, uN * 3.0), t, pc)) col = mix(col, pc, square(fract(gn), 1.0 - smoothstep(0.25, 0.6, max(fwidth(gn.x), fwidth(gn.y)))));
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = uHue * col;
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 浮岛咖啡's menu, on a clear screen, no word on it: its coffees in a row as the same cup, each filled as it is
  // made (from the foot: coffee, water, milk, foam), so that the more milk in it, the whiter it is; as many as the
  // board has room for, those most asked for first, in the order of the milk in them
  const COFFEES = [
    [[140, 0.32]],                                    // 浓缩
    [[140, 0.24], [90, 0.56]],                        // 美式
    [[140, 0.3], [255, 0.14]],                        // 玛奇朵
    [[140, 0.3], [200, 0.46], [255, 0.06]],           // 澳白
    [[140, 0.18], [200, 0.52], [255, 0.18]],          // 拿铁
    [[140, 0.26], [200, 0.27], [255, 0.36]],          // 卡布奇诺
  ];
  function cafeBoard(geom, w, h) {
    return ledPicture(geom, w, h, (g, Wc, Hc) => {
      const cs = Hc * 0.72, n = THREE.MathUtils.clamp(Math.floor(Wc / (cs * 0.8)), 2, COFFEES.length);
      const which = [0, 4, 5, 3, 1, 2].slice(0, n).sort((a, b) => a - b), step = Wc / n;
      which.forEach((k, i) => coffeeCup(g, step * (i + 0.5), Hc * 0.5, cs, COFFEES[k]));
    }, { density: 28, screen: true, glass: true });
  }
  // 流萤花园's colours: its flowers (pink, yellow, lilac, white, coral), their stems and leaves, the field's night
  const FLOWERS = ['#ff9cc2', '#ffd36b', '#c9a7ff', '#f4f6ff', '#ff8a7a'];
  // The field of scene.bloom: w x h, R its numbers, B the brand, room (nw x nh) left in its middle for the name.
  // Where each flower is (its middle, how wide, its colour), its stem and leaves, worked out here cell by cell and
  // kept in a texture (colour, how much of a flower, a number of its own); the shader opens and closes them
  function floristField(geom, w, h, R, B, nw, nh) {
    const cell = Math.min(w, h) / 24, NX = Math.max(8, Math.round(w / cell)), NY = Math.max(8, Math.round(h / cell));
    const heads = Array.from({ length: Math.round(NX * NY / 14) }, () => ({ x: R.range(-1, NX + 1), y: R.range(NY * 0.08, NY * 0.95), r: R.range(1.6, 3.4), c: R.int(0, FLOWERS.length - 1), a: R.range(0, 6.3) }));
    const data = new Uint8Array(NX * NY * 4), mx = NX / 2, my = NY / 2, rx = nw / 2 / cell + 1.5, ry = nh / 2 / cell + 1.2;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cx = i + 0.5, cy = j + 0.5;                                     // (j from the foot up)
      let best = 0, c = 0;
      // (each flower five petals round a heart: how far a cell is in, measured against the petal at its angle)
      for (const f of heads) {
        const dx = cx - f.x, dy = cy - f.y, d = Math.hypot(dx, dy), petal = 0.72 + 0.28 * Math.cos(5 * (Math.atan2(dy, dx) + f.a));
        const v = 1 - d / (f.r * petal);
        if (v > best) { best = v; c = d < f.r * 0.2 ? (f.c === 1 ? 4 : 1) : f.c; }   // (its heart yellow, a yellow one's coral)
      }
      let kind = best > 0 ? 1 + c : 0;                                      // (0 nothing; 1.. a flower; 9 a stem, 10 a leaf)
      if (!kind) for (const f of heads) if (Math.abs(cx - f.x) < 0.6 && cy < f.y - f.r * 0.6 && cy > f.y - f.r - 3.5) { kind = 9; best = 0.3; break; }
      if (!kind && R.chance(0.12)) { kind = 10; best = R.range(0.25, 0.45); }
      const e = Math.hypot((cx - mx) / rx, (cy - my) / ry), keep = THREE.MathUtils.smoothstep(e, 0.85, 1.25);   // (the name's room)
      data.set([kind, Math.round(best * keep * 255), Math.round(R.next() * 255), 255], (j * NX + i) * 4);
    }
    const tex = new THREE.DataTexture(data, NX, NY); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMap: { value: tex }, uN: { value: new THREE.Vector2(NX, NY) }, uP: { value: 12 },
        uPal: { value: [col('#000000'), ...FLOWERS.map((hx) => col(hx, 1.15)), col('#000000'), col('#000000'), col('#000000'), col('#4f8f62', 0.8), col('#3d7a58', 0.7)] },
        uLow: { value: col('#14233a') }, uHigh: { value: col('#1f3554') },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform vec2 uN; uniform float uTime, uP; uniform vec3 uPal[11], uLow, uHigh;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          vec2 g = vUv * uN, c = floor(g), f = fract(g) - 0.5;
          vec4 s = texture2D(uMap, (c + 0.5) / uN);
          int kind = int(s.r * 255.0 + 0.5);
          float aa = 1.0 - smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
          // the gust: from the left, opening them (in 5 s), then a while open, then closing them the same way
          float t = mod(uTime, uP), span = uN.x + 16.0, x = c.x + s.b * 3.0;
          float open = t < 5.0 ? clamp((t / 5.0 * span - 8.0 - x) / 6.0, 0.0, 1.0)
            : t < 9.0 ? 1.0 : 1.0 - clamp(((t - 9.0) / 3.0 * span - 8.0 - x) / 6.0, 0.0, 1.0);
          float sway = 0.9 + 0.1 * sin(uTime * 2.0 + c.x * 0.35 + c.y * 0.2);
          vec3 col = mix(uLow, uHigh, vUv.y);
          float r = 0.12; vec3 dotc = mix(uLow, uHigh, vUv.y) * 1.6;           // (the field's own dots, faint)
          if (kind >= 1 && kind <= 5) { r = 0.47 * clamp(s.g * 2.2, 0.0, 1.0) * mix(0.3, 1.0, open) * sway; dotc = uPal[kind]; }
          else if (kind >= 9) { r = 0.47 * s.g * sway; dotc = uPal[kind]; }
          float d = length(f), m = 1.0 - smoothstep(r - 0.04, r + 0.04, d);
          col = mix(col, dotc, mix(r * 1.8, m, aa));
          // fireflies: a few, drifting, blinking, a soft light round each
          for (int k = 0; k < 8; k++) {
            float fk = float(k), ph = fract(sin(fk * 12.9898) * 43758.5);
            vec2 p = vec2(mod(ph * uN.x + uTime * (0.8 + ph) + sin(uTime * 0.7 + fk) * 2.0, uN.x), uN.y * (0.3 + 0.6 * fract(ph * 7.3)) + sin(uTime * 1.1 + fk * 2.0) * 1.2);
            float on = 0.5 + 0.5 * sin(uTime * 2.3 + fk * 5.0), dd = length(g - p);
            col += vec3(0.75, 1.0, 0.45) * (exp(-dd * dd / 0.6) * 0.5 + (1.0 - smoothstep(0.18, 0.3, dd)) * 1.2) * on;
          }
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = uHue * col;
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // The bouquet of scene.bouquet: w x h, B the brand, foot (how high its name's room is). Its flowers set out in
  // its heights (x from its middle, y up, r across, colour), drawn in the shader: each ring of dots lit in turn
  function floristBouquet(geom, w, h, B, foot) {
    const F = [[-0.16, 0.66, 0.12, 0], [0.08, 0.76, 0.11, 1], [0.2, 0.56, 0.1, 2], [-0.03, 0.53, 0.115, 3], [-0.26, 0.47, 0.095, 4],
      [0.14, 0.4, 0.085, 0], [-0.04, 0.86, 0.085, 2], [-0.15, 0.37, 0.08, 1]];
    const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uA: { value: w / h }, uFoot: { value: foot / h },
        uF: { value: F.map(([fx, fy, fr, c]) => new THREE.Vector4(fx * 1.4, 0.3 + (fy - 0.33) * 1.15, fr * 1.3, c)) },   // (spread to fill it)
        uPal: { value: FLOWERS.map((hx) => col(hx, 1.15)) }, uLow: { value: col('#14233a') }, uHigh: { value: col('#1f3554') },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uA, uFoot; uniform vec4 uF[8]; uniform vec3 uPal[5], uLow, uHigh;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
        void main() {
          vec2 p = vec2((vUv.x - 0.5) * uA, vUv.y);                       // (in its heights, x from its middle)
          vec3 col = mix(uLow, uHigh, vUv.y);
          // the field's own dots, faint
          vec2 gg = vUv * vec2(uA, 1.0) * 26.0, gf = fract(gg) - 0.5;
          col = mix(col, col * 1.6, 1.0 - smoothstep(0.1, 0.16, length(gf)));
          // the stems, gathered at the foot of the bouquet, a band round them
          vec2 tie = vec2(0.0, uFoot + 0.03);
          for (int i = 0; i < 8; i++) if (seg(p, uF[i].xy, tie) < 0.004) col = vec3(0.3, 0.55, 0.38);
          if (seg(p, tie + vec2(-0.03, 0.0), tie + vec2(0.03, 0.0)) < 0.01) col = vec3(1.0, 0.62, 0.78);
          // the flowers: each its rings (heart, then out), each ring's dots lit in turn; a while open; out; again
          for (int i = 0; i < 8; i++) {
            vec2 d = p - uF[i].xy; float R = uF[i].z, rr = length(d);
            if (rr > R * 1.15) continue;
            float tt = mod(uTime * 0.6 + float(i) * 0.37, 6.0), fade = tt > 5.2 ? max(0.0, 1.0 - (tt - 5.2) * 1.5) : 1.0;
            for (int k = 0; k < 4; k++) {
              float fk = float(k), rk = (fk + 0.5) / 4.0 * R, n = 5.0 + fk * 6.0;
              float on = clamp((tt - fk * 0.35) * 2.0, 0.0, 1.0) * fade;
              float a = atan(d.y, d.x) - fk * 0.4 - uTime * 0.12, st = 6.28318 / n;
              float ac = floor(a / st + 0.5) * st + fk * 0.4 + uTime * 0.12;
              vec2 c = uF[i].xy + vec2(cos(ac), sin(ac)) * rk;
              float r = R * (0.075 + (3.0 - fk) * 0.018) * on;
              if (length(p - c) < r) col = k == 0 ? vec3(1.15, 0.95, 0.45) : uPal[int(uF[i].w)];
            }
          }
          // petals drifting down
          for (int k = 0; k < 10; k++) {
            float fk = float(k), ph = fract(sin(fk * 7.13) * 4375.85);
            vec2 q = vec2((ph - 0.5) * uA * 0.9 + sin(uTime * 0.8 + fk) * 0.02, 1.05 - mod(uTime * (0.03 + ph * 0.03) + ph, 1.0) * 0.9);
            if (length(p - q) < 0.008) col = uPal[k - (k / 5) * 5];
          }
          // fireflies
          for (int k = 0; k < 6; k++) {
            float fk = float(k), ph = fract(sin(fk * 12.9898) * 43758.5);
            vec2 q = vec2((fract(ph + uTime * 0.02) - 0.5) * uA + sin(uTime * 0.7 + fk) * 0.03, 0.3 + 0.6 * fract(ph * 7.3) + sin(uTime + fk * 2.0) * 0.03);
            float on = 0.5 + 0.5 * sin(uTime * 2.3 + fk * 5.0), dd = length(p - q);
            col += vec3(0.75, 1.0, 0.45) * (exp(-dd * dd / 0.0006) * 0.45 + (1.0 - smoothstep(0.005, 0.009, dd)) * 1.2) * on;
          }
          vec3 kk = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = uHue * col;
          col = col * cos(adj.x) + cross(kk, col) * sin(adj.x) + kk * dot(kk, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // Words written in dots on a canvas, as 喵星杂货's LED screens write them: drawn small (dots high), each of its pixels
  // a round dot, at (x, y) (y its middle), size high; align 'left', 'center' or 'right'; no wider than maxW. Its width;
  // g null to have only that
  function dotText(g, text, x, y, size, color, { weight = 800, align = 'left', dots = 13, maxW = Infinity, family = '"PingFang SC", "Noto Sans SC", sans-serif' } = {}) {
    const c = document.createElement('canvas'), t = c.getContext('2d');
    t.font = `${weight} ${dots}px ${family}`;
    c.width = Math.ceil(t.measureText(text).width) + 2; c.height = Math.ceil(dots * 1.3);
    t.font = `${weight} ${dots}px ${family}`; t.textBaseline = 'middle'; t.fillStyle = '#fff'; t.fillText(text, 1, c.height / 2);
    const d = t.getImageData(0, 0, c.width, c.height).data, k = Math.min(size / dots, maxW / c.width);
    const x0 = align === 'left' ? x : align === 'center' ? x - c.width * k / 2 : x - c.width * k;
    if (!g) return c.width * k;
    g.fillStyle = color;
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      if (d[(j * c.width + i) * 4 + 3] < 110) continue;
      g.beginPath(); g.arc(x0 + (i + 0.5) * k, y + (j + 0.5 - c.height / 2) * k, k * 0.42, 0, 7); g.fill();
    }
    return c.width * k;
  }
  // 喵星杂货's LED screens: dots lit in its yellow on a dark grid (turned by its colours in 广告橱窗, as its cases are),
  // its words in finer dots. layout:
  //   'face'   its kitten's great face (Noto's cat), blinking now and then, sparkles round it; its name beside it
  //            (wide) or under it (upright); words: false for none (the upright sign by its door)
  //   'tiles'  small faces in tiles filling it, three rows (in an upright one three columns; a sign one row), each
  //            blinking in its own time; its name's four characters in the four tiles in the middle; animals: the
  //            faces of many animals (its machines' blind boxes) rather than only its kitten
  //   'flip'   its machines': tiles of many animals' faces, no words; one tile after another, in no order, lit white
  //            and turned over like a card, a different animal on its back (as its blind-box screens once picked
  //            one box after another)
  //            On a wide one (three rows), the faces turning round one after another, each a full turn (the back
  //            of its head shown as it goes round), a wave across it, a pause, again
  // (tiles the same margin from all four edges, gaps between them a fifth of a tile or more, an eighth on a machine;
  // every face a whole number of dots across, 17 or more, the dots finer if need be)
  // w x h; seed its numbers; B the brand
  const MEOW_ANIMALS = ['cat', 'rabbit', 'fox', 'bear', 'panda', 'frog', 'penguin', 'hamster', 'dog', 'tiger', 'koala', 'mouse', 'pig'];
  function meowLED(geom, w, h, seed, B, { layout = 'face', words = true, animals = false, rows = 0, cols = 0, fine = 44 } = {}) {
    const Rn = makeRandom(Math.floor(seed * 1e6) + 913), wide = w / h > 1.3;
    const cell = Math.min(w, h) / fine, S = 8;
    let NX = Math.max(4, Math.round(w / cell)), NY = Math.max(4, Math.round(h / cell));
    let q;
    // where things go, in cells (y down): faces [cx, cy, size, animal, its own moment to blink], characters [ch, cx, cy, size]
    const faces = [], chars = [], flip = layout === 'flip';
    let line = null, tiles = null, spin = false;                                           // (the words beside or under a great face)
    if (layout === 'face') {
      const tall = !wide, size = tall ? Math.min(NX * 0.9, NY * 0.62) : NY * 0.82;
      faces.push([wide ? NY * 0.46 : NX / 2, wide ? NY / 2 : (words ? NY * 0.4 : NY / 2), size, 'cat', 0]);
      if (words) line = wide ? { x0: NY * 0.92, w: NX - NY * 0.98, y: NY * 0.5, align: 'left' } : { x0: NX * 0.08, w: NX * 0.84, y: NY * 0.82, align: 'center' };
    } else {
      // (tiles: three rows across a wide one, three columns down an upright one, or as many rows as asked)
      const across = rows ? true : wide || w / h > 0.8;
      let nr = rows || (across ? 3 : Math.max(4, Math.round(NY / (NX / 3)))), nc = cols || (across ? Math.max(4, Math.round(NX / (NY / nr))) : 3);
      // (a face wants 17 dots across or so to look like itself: finer dots if it would have fewer)
      let mg = Math.min(NX, NY) * 0.07;
      const gr = flip ? 0.12 : 0.2, fit = (r, c) => Math.min((NX - 2 * mg) / (c + gr * (c - 1)), (NY - 2 * mg) / (r + gr * (r - 1))), MIN = 17;
      if (flip) {                                                            // (a machine's: whichever grid its faces fill best,
        let best = 0;                                                        // its dots kept as they are if it can)
        for (const keep of [true, false]) {
          for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) {
            const f = r * c * fit(r, c) ** 2;
            if (r * c >= 6 && r * c <= 20 && (!keep || fit(r, c) * 0.96 >= MIN) && f > best * 1.001) { best = f; nr = r; nc = c; }
          }
          if (best) break;
        }
      }
      if (fit(nr, nc) * 0.96 < MIN) { const k = (MIN + 0.5) / (fit(nr, nc) * 0.96); NX = Math.round(NX * k); NY = Math.round(NY * k); mg = Math.min(NX, NY) * 0.07; }
      const sz = fit(nr, nc);
      const gx = nc > 1 ? (NX - 2 * mg - nc * sz) / (nc - 1) : 0, gy = nr > 1 ? (NY - 2 * mg - nr * sz) / (nr - 1) : 0;
      tiles = { mg, sz, gx, gy, nr, nc };
      spin = layout === 'tiles' && across && nr >= 3;
      const mid = across ? [Math.floor(nr / 2), Math.floor((nc - 4) / 2)] : [Math.floor((nr - 4) / 2), 1];
      const kinds = Array.from({ length: nr * nc }, (_, i) => (animals || flip ? MEOW_ANIMALS[i % MEOW_ANIMALS.length] : 'cat'));
      for (let i = kinds.length - 1; i > 0; i--) { const j = Rn.int(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      const name = [...B.name];
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
        const cx = mg + sz / 2 + c * (sz + gx), cy = mg + sz / 2 + r * (sz + gy);
        const k = flip ? -1 : across ? (r === mid[0] ? c - mid[1] : -1) : (c === mid[1] ? r - mid[0] : -1);
        if (k >= 0 && k < 4 && nc * nr >= 6) chars.push([name[k], cx, cy, sz * 0.9]);
        else {
          // (each face a whole number of cells across, its corner on a cell's: so every one falls on the dots alike)
          const n = Math.round(sz * 0.96), at = (v) => Math.round(v - n / 2) + n / 2;
          faces.push([at(cx), at(cy), n, kinds[r * nc + c], Rn.next(), (nr - 1 - r) * nc + c]);   // (its tile counted from the foot up)
        }
      }
    }
    // the faces drawn large and looked at in the middle of each cell (R: as they are; G: with eyes shut, for a cat)
    // (or, flip, as they are in one of its four turns: backs[f][tile] the animal there)
    const draw = (blink, backs) => {
      const c = document.createElement('canvas'); c.width = NX * S; c.height = NY * S; const g = c.getContext('2d');
      for (const [cx, cy, size, face, , tile] of faces) {
        const px = cx * S, py = cy * S, sz = size * S, animal = backs ? backs[tile] : face;
        drawIcon(g, `noto/${animal}`, px, py, sz, '#ffffff');
        if (blink && animal === 'cat') {                                     // (its eyes, in the glyph's 512, shut: lines)
          const k = sz / 512, ox = px - 256 * k, oy = py - 256 * k;
          for (const ex of [164, 348]) {
            g.fillStyle = '#000'; g.beginPath(); g.ellipse(ox + ex * k, oy + 279 * k, 34 * k, 40 * k, 0, 0, 7); g.fill();
            g.strokeStyle = '#fff'; g.lineWidth = 12 * k; g.beginPath(); g.arc(ox + ex * k, oy + 262 * k, 26 * k, 0.35, Math.PI - 0.35); g.stroke();
          }
        }
      }
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    // (a cell lit: the great face, if lit in its middle; small faces in tiles, if lit over a third of it or so, so
    // their fine lines keep)
    const lit = layout === 'face' ? (d, i, row) => d[((row * S + S / 2) * NX * S + i * S + S / 2) * 4] > 110 : (d, i, row) => {
      let v = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = ((row * S + y) * NX * S + i * S + x) * 4; v += d[p] * d[p + 3]; }
      return v / (S * S * 255 * 255) > 0.3;
    };
    let open, shut, plan = null, L = 0;
    if (flip) {
      // its four turns: in each, every tile a different animal from the turn before (and the last from the first);
      // the plan, in rounds: every tile turned over once a round, in no order, never one twice running; four rounds
      // and each is back as it began. A texel each tile each step: its turn before, after, and whether it turns now
      const N = tiles.nr * tiles.nc, backs = [faces.map((f) => f[3])];
      for (let f = 1; f < 4; f++) {
        const b = [...backs[0]];
        for (let i = N - 1; i > 0; i--) { const j = Rn.int(0, i); [b[i], b[j]] = [b[j], b[i]]; }
        for (let pass = 0; pass < 6; pass++) for (let t = 0; t < N; t++) {
          const bad = (u) => b[u] === backs[f - 1][u] || (f === 3 && b[u] === backs[0][u]);
          if (!bad(t)) continue;
          const u = Rn.int(0, N - 1); [b[t], b[u]] = [b[u], b[t]];
        }
        backs.push(b);
      }
      const byTile = (f) => { const o = []; for (const fc of faces) o[fc[5]] = backs[f][faces.indexOf(fc)]; return o; };
      const frames = [0, 1, 2, 3].map((f) => draw(false, byTile(f)));
      open = frames;
      const order = [];
      for (let r = 0; r < 4; r++) {
        const o = Array.from({ length: N }, (_, i) => i);
        for (let i = N - 1; i > 0; i--) { const j = Rn.int(0, i); [o[i], o[j]] = [o[j], o[i]]; }
        if (order.length && o[0] === order[order.length - 1] && N > 1) [o[0], o[1]] = [o[1], o[0]];
        order.push(...o);
      }
      L = order.length; plan = new Uint8Array(N * L * 4);
      const turn = new Array(N).fill(0);
      for (let st = 0; st < L; st++) {
        for (let t = 0; t < N; t++) plan.set([turn[t] * 85, (order[st] === t ? (turn[t] + 1) % 4 : turn[t]) * 85, order[st] === t ? 255 : 0, 255], (st * N + t) * 4);
        turn[order[st]] = (turn[order[st]] + 1) % 4;
      }
    } else { open = draw(false); shut = draw(true); }
    // (each cell's own moment to blink: its face's)
    const when = new Float32Array(NX * NY);
    for (const [cx, cy, size, , m] of faces) for (let j = Math.max(0, Math.floor(cy - size / 2)); j < Math.min(NY, cy + size / 2); j++) for (let i = Math.max(0, Math.floor(cx - size / 2)); i < Math.min(NX, cx + size / 2); i++) when[j * NX + i] = m;
    // (the back of each head, as it turns: its outline filled, every cell the outside can't reach past it)
    const back = new Uint8Array(NX * NY);
    if (spin) {
      const out = new Uint8Array(NX * NY), stack = [];
      const at = (i, row) => { if (i < 0 || row < 0 || i >= NX || row >= NY || out[row * NX + i] || lit(open, i, row)) return; out[row * NX + i] = 1; stack.push(i, row); };
      for (let i = 0; i < NX; i++) { at(i, 0); at(i, NY - 1); }
      for (let r = 0; r < NY; r++) { at(0, r); at(NX - 1, r); }
      while (stack.length) { const row = stack.pop(), i = stack.pop(); at(i + 1, row); at(i - 1, row); at(i, row + 1); at(i, row - 1); }
      for (let k = 0; k < NX * NY; k++) back[k] = out[k] ? 0 : 1;
    }
    const a = new Uint8Array(NX * NY * 4);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const row = NY - 1 - j;                                               // (the texture's rows from the foot up)
      if (flip) a.set(open.map((d) => (lit(d, i, row) ? 255 : 0)), (j * NX + i) * 4);          // (RGBA: lit in each of its turns)
      else a.set([lit(open, i, row) ? 255 : 0, lit(shut, i, row) ? 255 : 0, back[row * NX + i] * 255, Math.round(when[row * NX + i] * 255)], (j * NX + i) * 4);   // (B: its back)
    }
    const tHead = new THREE.DataTexture(a, NX, NY); tHead.magFilter = tHead.minFilter = THREE.NearestFilter; tHead.needsUpdate = true;
    // the words, in dots of their own, about 13 to a character's height whatever its size (white; a second line in its
    // yellow): their grid Ft to a cell
    const big = chars.length ? chars[0][3] : line ? Math.min(NY * 0.2, line.w / 4.4) : 10, Ft = THREE.MathUtils.clamp(13 / big, 0.3, 4);
    const TX = Math.max(1, Math.round(NX * Ft)), TY = Math.max(1, Math.round(NY * Ft));
    const tc = document.createElement('canvas'); tc.width = TX * 4; tc.height = TY * 4; const tg = tc.getContext('2d');
    q = tc.width / NX;
    tg.textBaseline = 'middle'; tg.textAlign = 'center';
    for (const [ch, cx, cy, size] of chars) { tg.fillStyle = '#fff'; tg.font = `800 ${size * q}px "PingFang SC", "Noto Sans SC", sans-serif`; tg.fillText(ch, cx * q, (cy + size * 0.04) * q); }
    if (line) {
      const cn = Math.min(NY * 0.2, line.w / 4.4), ax = (line.align === 'left' ? line.x0 : NX / 2) * q;
      tg.textAlign = line.align;
      tg.fillStyle = '#fff'; tg.font = `800 ${cn * q}px "PingFang SC", "Noto Sans SC", sans-serif`; tg.fillText(B.name, ax, (line.y - cn * 0.35) * q, line.w * q);
      tg.fillStyle = '#f00'; tg.font = `700 ${cn * 0.42 * q}px "Helvetica Neue", Arial, sans-serif`; tg.fillText(B.en.split('').join(' '), ax, (line.y + cn * 0.66) * q, line.w * q);
    }
    const td = tg.getImageData(0, 0, tc.width, tc.height).data, b = new Uint8Array(TX * TY * 4);
    for (let j = 0; j < TY; j++) for (let i = 0; i < TX; i++) {
      const p = (((TY - 1 - j) * 4 + 2) * tc.width + i * 4 + 2) * 4;
      if (td[p + 3] > 110) b.set([td[p + 1] > 128 ? 255 : 0, 255, 0, 255], (j * TX + i) * 4);    // (G: lit; R: white, else its yellow)
    }
    const tText = new THREE.DataTexture(b, TX, TY); tText.magFilter = tText.minFilter = THREE.NearestFilter; tText.needsUpdate = true;
    const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
    let tPlan = null, tOrder = null, M = 0;
    if (spin) {                                                              // (each face's turn: in reading order)
      const N = tiles.nr * tiles.nc, o = new Uint8Array(N * 4);
      [...faces].sort((p, q) => p[1] - q[1] || p[0] - q[0]).forEach((f, k) => o.set([k, 255, 0, 255], f[5] * 4));
      M = faces.length; tOrder = new THREE.DataTexture(o, N, 1); tOrder.magFilter = tOrder.minFilter = THREE.NearestFilter; tOrder.needsUpdate = true;
    }
    if (flip) { tPlan = new THREE.DataTexture(plan, tiles.nr * tiles.nc, L); tPlan.magFilter = tPlan.minFilter = THREE.NearestFilter; tPlan.needsUpdate = true; }
    const mat = new THREE.ShaderMaterial({
      defines: flip ? { FLIP: 1 } : spin ? { SPIN: 1 } : {},
      uniforms: { uTime: shared.uTime, uHead: { value: tHead }, uText: { value: tText }, uN: { value: new THREE.Vector2(NX, NY) }, uT: { value: new THREE.Vector2(TX, TY) },
        uPlan: { value: tPlan }, uOrder: { value: tOrder }, uSpin: { value: new THREE.Vector2(M, M * 0.3 + 2.0) }, uTile: { value: tiles ? new THREE.Vector4(tiles.mg, tiles.sz, tiles.gx, tiles.gy) : new THREE.Vector4() },
        uGrid: { value: tiles ? new THREE.Vector3(tiles.nc, tiles.nr, L) : new THREE.Vector3() },
        uOn: { value: col('#ffd166', 1.35) }, uOff: { value: col('#1b2a4a', 1.0) }, uBg: { value: col('#0c1530') }, uWhite: { value: col('#fff6dc', 1.3) },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uHead, uText, uPlan, uOrder; uniform vec2 uN, uT, uSpin; uniform float uTime; uniform vec3 uOn, uOff, uBg, uWhite;
        uniform vec4 uTile; uniform vec3 uGrid;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        float dotm(vec2 f, float r, float aa) { return mix(r * 1.7, 1.0 - smoothstep(r - 0.05, r + 0.05, length(f - 0.5)), aa); }
        void main() {
          vec2 g = vUv * uN, c = floor(g);
          float aa = 1.0 - smoothstep(0.25, 0.6, max(fwidth(g.x), fwidth(g.y)));
          float hash = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5);
#ifdef FLIP
          // which tile, and where this is in the plan: a step of 0.4 s, one tile turning over in it (its dots squeezed
          // toward its middle, as a card seen edgewise, and out again with the next animal), lit white a while
          vec2 cs = c + 0.5, i2 = clamp(floor((cs - uTile.x + uTile.zw * 0.5) / (uTile.y + uTile.zw)), vec2(0.0), uGrid.xy - 1.0);
          vec2 mid = uTile.x + uTile.y * 0.5 + i2 * (uTile.y + uTile.zw);
          float tile = i2.y * uGrid.x + i2.x, now = mod(floor(uTime * 2.5), uGrid.z), u = fract(uTime * 2.5);
          vec4 pl = texture2D(uPlan, vec2((tile + 0.5) / (uGrid.x * uGrid.y), (now + 0.5) / uGrid.z));
          float turning = pl.b, p = clamp(u / 0.8, 0.0, 1.0), sq = turning > 0.5 ? max(abs(cos(3.14159 * p)), 0.04) : 1.0;
          float f = floor((turning > 0.5 && p > 0.5 ? pl.g : pl.r) * 3.0 + 0.5);
          vec2 at = vec2(mid.x + (cs.x - mid.x) / sq, cs.y);
          vec4 s = abs(at.x - mid.x) > uTile.y * 0.5 + 0.5 ? vec4(0.0) : texture2D(uHead, floor(at) / uN + 0.5 / uN);
          float on = f < 0.5 ? s.r : f < 1.5 ? s.g : f < 2.5 ? s.b : s.a;
          float white = turning * (1.0 - smoothstep(0.75, 1.0, u)), edge = mix(0.55, 1.0, sq);
#elif defined(SPIN)
          // its turn to go round (0.3 s after the one before, in reading order; 0.8 s a turn): its dots squeezed toward
          // its middle and out again, the back of its head (a little dimmer) while it faces away
          vec2 cs = c + 0.5, i2 = clamp(floor((cs - uTile.x + uTile.zw * 0.5) / (uTile.y + uTile.zw)), vec2(0.0), uGrid.xy - 1.0);
          vec2 mid = uTile.x + uTile.y * 0.5 + i2 * (uTile.y + uTile.zw);
          vec4 od = texture2D(uOrder, vec2((i2.y * uGrid.x + i2.x + 0.5) / (uGrid.x * uGrid.y), 0.5));
          float p = od.g > 0.5 ? clamp((mod(uTime, uSpin.y) - floor(od.r * 255.0 + 0.5) * 0.3) / 0.8, 0.0, 1.0) : 0.0;
          p = p * p * (3.0 - 2.0 * p);
          float cz = cos(6.28318 * p), sq = max(abs(cz), 0.04), away = cz < 0.0 ? 1.0 : 0.0;
          vec2 at = vec2(mid.x + (cs.x - mid.x) / sq * (away > 0.5 ? -1.0 : 1.0), cs.y);
          vec4 s = abs(at.x - mid.x) > uTile.y * 0.5 + 0.5 ? vec4(0.0) : texture2D(uHead, floor(at) / uN + 0.5 / uN);
          float bt = mod(uTime + s.a * 4.3, 4.3), shut = (bt > 3.6 && bt < 3.75) || (bt > 3.95 && bt < 4.07) ? 1.0 : 0.0;
          float on = away > 0.5 ? s.b : mix(s.r, s.g, shut), white = 0.0, edge = mix(0.55, 1.0, sq) * (away > 0.5 ? 0.78 : 1.0);
#else
          vec4 s = texture2D(uHead, (c + 0.5) / uN);
          // blinking: now and then (each face at its own moment) its eyes shut a moment, twice, quickly
          float bt = mod(uTime + s.a * 4.3, 4.3), shut = (bt > 3.6 && bt < 3.75) || (bt > 3.95 && bt < 4.07) ? 1.0 : 0.0;
          float on = mix(s.r, s.g, shut), white = 0.0, edge = 1.0;
#endif
          // a shimmer across it, and sparkles twinkling here and there
          float shimmer = 0.85 + 0.15 * sin(uTime * 2.0 - (c.x + c.y) * 0.25);
          float sp = step(0.985, hash) * max(0.0, sin(uTime * 3.0 + fract(hash * 91.3) * 40.0));
          vec3 lit = on > 0.5 ? mix(uOn * shimmer, uWhite, white) * edge : mix(uOff, uWhite, sp);
          vec3 col = mix(uBg, lit, dotm(fract(g), on > 0.5 || sp > 0.05 ? 0.44 : 0.3, aa));
          // the words, in finer dots
          vec2 gt = vUv * uT, ct = floor(gt); vec4 t = texture2D(uText, (ct + 0.5) / uT);
          if (t.g > 0.5) col = mix(col, t.r > 0.5 ? uWhite : uOn, dotm(fract(gt), 0.42, 1.0 - smoothstep(0.25, 0.6, max(fwidth(gt.x), fwidth(gt.y)))));
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = uHue * col;
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // A stage of pictures (夕光烘焙's: Noto Emoji's glyphs, words, things drawn), each moving in its own way, worked out
  // in the shader over a round of P seconds. Its geometry in the stage's own frame (x across from its middle, y up
  // from its foot, z out), the mesh set where it goes by the caller. items, drawn in their order:
  //   { pic: { key, aspect, px, draw(g, W, H) }, x, y (its foot), z, s (its height), kind, t0, amp, per, a, b }
  // kinds (t0 its moment in the round):
  //   0 still; amp: bobbing that much up and down over per seconds
  //   1 squashed soft at t0, wobbling back (柔软)
  //   2 puffed up at t0 and back (蓬松)
  //   3 dropped in from amp above at t0, bouncing, squashed as it lands; shrunk away at the round's end
  //   4 setting amp and rising again over the round (the sun)
  //   5 popped in at t0, held amp seconds, shrunk away
  //   6 gliding amp a second along a loop from a, b long, coming round again
  //   7 steam: rising amp over per seconds, fading, from t0 (a share of per)
  //   8 fading in at t0, held amp seconds, fading out
  //   9 popped in at t0, turning per times round, fast and slowing to a stop over amp seconds, shrunk away
  // clip: [x0, x1, y0, y1] beyond which nothing shows (null: all of it); gain: its light; brand: its colours turned
  // as that brand's cases' are (广告橱窗; -1 not)
  function emojiStage(items, { P = 10, clip = null, gain = 1, brand = -1 } = {}) {
    const keyOf = (it) => it.pic.key, pics = new Map();
    for (const it of items) if (!pics.has(keyOf(it))) pics.set(keyOf(it), it.pic);
    const live = items;
    // (each picture once, in rows on one canvas)
    const AW = 2048, pad = 4, at = new Map();
    let cx = pad, cy = pad, row = 0;
    for (const [k, p] of pics) {
      let H = p.px || 160, W = Math.round(H * p.aspect);
      if (W > AW - 2 * pad) { H = Math.round(H * (AW - 2 * pad) / W); W = AW - 2 * pad; }
      if (cx + W + pad > AW) { cx = pad; cy += row + pad; row = 0; }
      at.set(k, [cx, cy, W, H]);
      cx += W + pad; row = Math.max(row, H);
    }
    const AH = THREE.MathUtils.ceilPowerOfTwo(cy + row + pad), cv = document.createElement('canvas');
    cv.width = AW; cv.height = AH;
    const g = cv.getContext('2d');
    for (const [k, [px, py, W, H]] of at) { g.save(); g.translate(px, py); pics.get(k).draw(g, W, H); g.restore(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.premultiplyAlpha = true;
    // (one quad, as many times over as there are things)
    const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const n = live.length, A = { aRect: new Float32Array(n * 4), aPos: new Float32Array(n * 4), aMove: new Float32Array(n * 4), aMore: new Float32Array(n * 4) };
    live.forEach((it, i) => {
      const [px, py, W, H] = at.get(keyOf(it));
      A.aRect.set([px / AW, 1 - (py + H) / AH, (px + W) / AW, 1 - py / AH], i * 4);
      A.aPos.set([it.x, it.y, it.z || 0, it.s], i * 4);
      A.aMove.set([it.kind || 0, it.t0 || 0, it.amp || 0, it.per || 1], i * 4);
      A.aMore.set([W / H, it.a || 0, it.b || 1, 0], i * 4);
    });
    for (const [name, arr] of Object.entries(A)) geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr, 4));
    geo.instanceCount = n;
    const big = 1e5, c = clip || [-big, big, -big, big];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uAtlas: { value: tex }, uP: { value: P }, uClip: { value: new THREE.Vector4(...c) }, uGain: { value: gain },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: brand } },
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: /* glsl */ `
        attribute vec4 aRect, aPos, aMove, aMore;
        uniform float uTime, uP; varying vec2 vUv, vAt; varying float vA;
        float backOut(float x) { float c1 = 1.70158, c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }
        float bounceOut(float x) {
          if (x < 1.0 / 2.75) return 7.5625 * x * x;
          if (x < 2.0 / 2.75) { x -= 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
          if (x < 2.5 / 2.75) { x -= 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
          x -= 2.625 / 2.75; return 7.5625 * x * x + 0.984375;
        }
        void main() {
          float k = aMove.x, t0 = aMove.y, amp = aMove.z, per = aMove.w, tr = mod(uTime, uP) - t0, s = aPos.w, x = aPos.x;
          vec2 sc = vec2(1.0), off = vec2(0.0);
          float a = 1.0, mid = 0.0, rot = 0.0;                        // (mid: grown from its middle, else from its foot)
          if (k < 0.5) off.y = amp * sin(6.2832 * uTime / per + t0);
          else if (k < 1.5) {
            float u = clamp(tr / 0.9, 0.0, 1.0), b = tr > 0.0 ? sin(u * 12.566) * (1.0 - u) : 0.0;
            sc = vec2(1.0 + 0.13 * b, 1.0 - 0.17 * b);
          } else if (k < 2.5) {
            float u = clamp(tr / 1.1, 0.0, 1.0), b = tr > 0.0 ? sin(u * 3.1416) : 0.0;
            sc = vec2(1.0 + 0.16 * b * b);
          } else if (k < 3.5) {
            float gone = tr < 0.0 ? 0.0 : 1.0 - smoothstep(uP - t0 - 0.5, uP - t0 - 0.15, tr);
            off.y = tr < 0.0 ? 0.0 : amp * (1.0 - bounceOut(clamp(tr / 0.8, 0.0, 1.0)));
            float sq = tr > 0.28 && tr < 0.6 ? sin((tr - 0.28) / 0.32 * 3.1416) * 0.16 : 0.0;
            sc = vec2(gone * (1.0 + sq * 0.6), gone * (1.0 - sq));
            if (tr < 0.0) a = 0.0;
          } else if (k < 4.5) off.y = -amp * (0.5 - 0.5 * cos(6.2832 * (uTime + t0) / uP));
          else if (k < 5.5) {
            float gv = tr < 0.0 ? 0.0 : tr < 0.35 ? backOut(tr / 0.35) : tr < 0.35 + amp ? 1.0 : max(0.0, 1.0 - (tr - 0.35 - amp) / 0.25);
            sc = vec2(gv); mid = 1.0;
          } else if (k < 6.5) x = aMore.y + mod(aPos.x - aMore.y + amp * uTime, aMore.z);
          else if (k < 7.5) {
            float u = fract(uTime / per + t0);
            off = vec2(sin(u * 6.0 + t0 * 20.0) * 0.12 * s, amp * u); a = sin(u * 3.1416); sc = vec2(0.7 + 0.6 * u); mid = 1.0;
          } else if (k < 8.5) a = smoothstep(0.0, 0.9, tr) * (1.0 - smoothstep(0.9 + amp, 1.8 + amp, tr));
          else {
            float gv = tr < 0.0 ? 0.0 : tr < 0.3 ? backOut(tr / 0.3) : tr < 0.3 + amp ? 1.0 : max(0.0, 1.0 - (tr - 0.3 - amp) / 0.3);
            float u = clamp(tr / (0.3 + amp), 0.0, 1.0);
            sc = vec2(gv); mid = 1.0; rot = -6.2832 * per * (1.0 - pow(1.0 - u, 3.0));
          }
          vec2 p = vec2(x + off.x + position.x * aMore.x * s * sc.x, aPos.y + off.y + mix((position.y + 0.5) * sc.y, 0.5 + position.y * sc.y, mid) * s);
          if (rot != 0.0) {
            vec2 q = vec2(position.x * aMore.x, position.y) * s * sc;
            p = vec2(x, aPos.y + 0.5 * s) + off + vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
          }
          vUv = mix(aRect.xy, aRect.zw, uv); vAt = p; vA = a;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, aPos.z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas; uniform vec4 uClip; uniform float uGain; uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex;
        varying vec2 vUv, vAt; varying float vA;
        void main() {
          if (vAt.x < uClip.x || vAt.x > uClip.y || vAt.y < uClip.z || vAt.y > uClip.w) discard;
          vec4 c = texture2D(uAtlas, vUv) * vA;
          if (c.a < 0.01) discard;
          vec3 col = c.rgb;
          if (uIndex >= 0) {
            vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
            col = uHue * col;
            col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
            col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          }
          gl_FragColor = vec4(col * uGain, c.a);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.layers.set(LAYER.GLOW);
    return m;
  }

  // a glyph as a flat shape in one colour (its outline and all that's inside it, nothing of its lines), a soft light
  // round it if asked, for emojiStage
  function solidGlyph(name, hex, glow = 0) {
    return { key: `solid:${name}:${hex}:${glow}`, aspect: 1, px: 160, draw: (g, W, H) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const t = c.getContext('2d'), k = glow ? 0.74 : 0.98;
      drawIcon(t, `noto/${name}`, W / 2, H / 2, W * k, '#000000');
      const d = t.getImageData(0, 0, W, H), a = d.data, out = new Uint8Array(W * H), st = [];
      const go = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (out[i] || a[i * 4 + 3] > 60) return; out[i] = 1; st.push(i); };
      for (let i = 0; i < W; i++) { go(i, 0); go(i, H - 1); }
      for (let i = 0; i < H; i++) { go(0, i); go(W - 1, i); }
      while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; go(x + 1, y); go(x - 1, y); go(x, y + 1); go(x, y - 1); }
      const v = parseInt(hex.slice(1), 16), rgb = [v >> 16, (v >> 8) & 255, v & 255];
      for (let i = 0; i < W * H; i++) a.set([...rgb, out[i] ? 0 : 255], i * 4);
      t.putImageData(d, 0, 0);
      if (glow) { g.shadowColor = hex; g.shadowBlur = W * 0.1 * glow; }
      g.drawImage(c, 0, 0);
    } };
  }
  // 夕光烘焙's look: a pale yellow-green, little saturated, its breads in one dark ink (Noto Emoji's glyphs, single
  // colour), a flat sun going down; its words in a serif; things fading in and out slowly rather than bouncing
  const DUSK = { ground: '#c2c393', low: '#b1b282', light: '#dcdcb2', ink: '#3c3f2c', mid: '#7d8060' };
  const SERIF = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif', LATIN = 'Georgia, "Times New Roman", serif';
  const duskPic = {
    // a bread (or a sheaf of wheat, a cup…): its glyph in one colour
    glyph: (name, hex = DUSK.ink) => ({ key: `glyph:${name}:${hex}`, aspect: 1, px: 192, draw: (g, W, H) => drawIcon(g, `noto/${name}`, W / 2, H / 2, W * 0.96, hex) }),
    // words, in its serif (or the Latin one), spaced; vertical: one character under another
    words: (text, { fill = DUSK.ink, weight = 600, latin = false, space = 0.08, vertical = false, px = 128 } = {}) => {
      const fam = latin ? LATIN : SERIF, t = document.createElement('canvas').getContext('2d'), chars = [...text];
      t.font = `${weight} 100px ${fam}`;
      const wide = chars.reduce((a, c) => a + t.measureText(c).width, 0) + space * 100 * (chars.length - 1);
      const aspect = vertical ? 1.15 / (chars.length * (1 + space)) : (wide + 10) / 125;
      return { key: `words:${text}:${fill}:${weight}:${latin}:${vertical}`, aspect, px: vertical ? px * chars.length : px, draw: (g, W, H) => {
        g.fillStyle = fill; g.textBaseline = 'middle'; g.textAlign = 'center';
        if (vertical) {
          const step = H / chars.length;
          g.font = `${weight} ${step / (1 + space)}px ${fam}`;
          chars.forEach((c, i) => g.fillText(c, W / 2, step * (i + 0.5)));
          return;
        }
        const k = H / 125;
        g.font = `${weight} ${100 * k}px ${fam}`; g.textAlign = 'left';
        let x = 5 * k;
        for (const c of chars) { g.fillText(c, x, H / 2); x += g.measureText(c).width + space * 100 * k; }
      } };
    },
    // a round medallion: a bread's glyph in its ink on its yellow-green, a ring round it (its sculpture; its menu)
    medal: (name) => ({ key: `dusk:medal:${name}`, aspect: 1, px: 256, draw: (g, W, H) => {
      g.fillStyle = DUSK.ground; g.beginPath(); g.arc(W / 2, H / 2, W * 0.49, 0, 7); g.fill();
      g.strokeStyle = DUSK.ink; g.lineWidth = W * 0.02; g.beginPath(); g.arc(W / 2, H / 2, W * 0.44, 0, 7); g.stroke();
      drawIcon(g, `noto/${name}`, W / 2, H / 2, W * 0.6, DUSK.ink);
    } }),
    // the sun: a flat disc, a little lighter than the ground
    sun: { key: 'dusk:sun', aspect: 1, px: 256, draw: (g, W, H) => { g.fillStyle = DUSK.light; g.beginPath(); g.arc(W / 2, H / 2, W * 0.48, 0, 7); g.fill(); } },
    // a thread of steam, in the ink, faint
    steam: { key: 'dusk:steam', aspect: 0.4, px: 160, draw: (g, W, H) => {
      g.strokeStyle = 'rgba(60, 63, 44, 0.55)'; g.lineWidth = W * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(W * 0.5, H * 0.95); g.bezierCurveTo(W * 0.15, H * 0.7, W * 0.85, H * 0.45, W * 0.5, H * 0.25); g.quadraticCurveTo(W * 0.3, H * 0.14, W * 0.45, H * 0.05); g.stroke();
    } },
    // the ground before the sun: the lower colour, a fine line along its top
    land: (aspect) => ({ key: `dusk:land:${aspect.toFixed(2)}`, aspect, px: 128, draw: (g, W, H) => {
      g.fillStyle = DUSK.low; g.fillRect(0, 0, W, H);
      g.fillStyle = DUSK.ink; g.fillRect(0, 0, W, Math.max(2, H * 0.025));
    } }),
    // the sky: the ground colour, in a few bands a shade apart (lighter going down to the sun)
    sky: (aspect) => ({ key: `dusk:sky:${aspect.toFixed(2)}`, aspect, px: 256, draw: (g, W, H) => {
      ['#b9ba8a', '#bfc090', DUSK.ground, '#c8c99b'].forEach((c, i, all) => { g.fillStyle = c; g.fillRect(0, H * i / all.length, W, H / all.length + 1); });
    } }),
  };
  const BREAD_ROW = ['croissant', 'bread', 'baguette', 'bagel', 'pretzel', 'pie', 'waffle', 'cookie', 'flatbread'];
  // 夕光烘焙's cases and signs (w x h): which, by its shape, or as asked, on emojiStage
  //   'wide'  (a large wide one): its name on the left; on the right the sun going down behind a line of its breads
  //           that come in one after another and go again, steam rising thin from two
  //   'tall'  (a tall one): its name down the left, one character under another; the sun above; three breads on
  //           the line under it, coming one after another
  //   'belt'  (a small wide one): its breads going by slowly along a line, its name above, the sun at the side
  //   'one'   (a small upright one, and its blade: no name): one bread after another, each fading into the next,
  //           before the sun
  //   'sign'  its name over its front: its name in the middle, its breads either side, still
  function dawnStage(w, h, B, kind = null) {
    kind ||= h / w > 1.2 ? (w < 2.5 ? 'one' : 'tall') : w > 7 ? 'wide' : 'belt';
    const it = [], bread = (n, hex) => duskPic.glyph(BREAD_ROW[n % BREAD_ROW.length], hex), line = B.tagline.split('！').filter(Boolean).join(' · ');
    let P = 14;
    const sky = () => it.push({ pic: duskPic.sky(w / h), x: 0, y: 0, z: 0, s: h });
    // (fading in at t0, held, out again before the round's end)
    const coming = (t0, end = P - 1.4) => ({ kind: 8, t0, amp: end - t0 - 0.9 });
    if (kind === 'wide') {
      const yH = h * 0.28, nb = 4, x0 = -w * 0.04, x1 = w * 0.48, bs = Math.min(h * 0.32, (x1 - x0) / nb * 0.88);
      sky();
      it.push({ pic: duskPic.sun, x: w * 0.24, y: yH - h * 0.06, z: 0.004, s: h * 0.52, kind: 4, amp: h * 0.16 });
      it.push({ pic: duskPic.land(w / yH), x: 0, y: 0, z: 0.008, s: yH });
      for (let i = 0; i < nb; i++) {
        const x = x0 + (x1 - x0) * (i + 0.5) / nb;
        it.push({ pic: bread(i), x, y: yH - bs * 0.06, z: 0.02, s: bs, ...coming(1 + i * 0.7) });
        if (i === 1 || i === 3) it.push({ pic: duskPic.steam, x: x - bs * 0.05, y: yH + bs * 0.8, z: 0.02, s: h * 0.16, kind: 7, amp: h * 0.1, per: 4.5, t0: i * 0.3 });
      }
      it.push({ pic: duskPic.words(B.name, { space: 0.14 }), x: -w * 0.27, y: h * 0.52, z: 0.03, s: h * 0.2 });
      it.push({ pic: duskPic.words(B.en, { latin: true, weight: 400, space: 0.35 }), x: -w * 0.27, y: h * 0.4, z: 0.03, s: h * 0.065 });
      it.push({ pic: duskPic.words(line, { weight: 400, space: 0.1, fill: DUSK.mid }), x: -w * 0.27, y: h * 0.1, z: 0.03, s: h * 0.07 });
      return { items: it, P };
    }
    if (kind === 'tall') {
      const yH = h * 0.28, bs = w * 0.26;
      sky();
      it.push({ pic: duskPic.sun, x: w * 0.12, y: h * 0.46, z: 0.004, s: w * 0.6, kind: 4, amp: h * 0.05 });
      it.push({ pic: duskPic.land(w / yH), x: 0, y: 0, z: 0.008, s: yH });
      [0, 4, 2].forEach((n, i) => {
        const x = (i - 1) * w * 0.3;
        it.push({ pic: bread(n), x, y: yH - bs * 0.05, z: 0.02, s: bs, ...coming(1 + i * 0.8) });
      });
      it.push({ pic: duskPic.steam, x: -w * 0.32, y: yH + bs * 0.85, z: 0.02, s: w * 0.14, kind: 7, amp: w * 0.12, per: 4.5 });
      const cs = Math.min(h * 0.075, w * 0.16);
      it.push({ pic: duskPic.words(B.vertical || B.name, { vertical: true, space: 0.25 }), x: -w * 0.34, y: h * 0.93 - cs * 4 * 1.25, z: 0.03, s: cs * 4 * 1.25 });
      it.push({ pic: duskPic.words(B.en, { latin: true, weight: 400, space: 0.35 }), x: 0, y: h * 0.14, z: 0.03, s: h * 0.036 });
      it.push({ pic: duskPic.words(line, { weight: 400, space: 0.1, fill: DUSK.mid }), x: 0, y: h * 0.06, z: 0.03, s: h * 0.036 });
      return { items: it, P };
    }
    if (kind === 'belt') {
      const yH = h * 0.22, s = h * 0.36, step = s * 1.5, count = Math.ceil((w + step) / step) + 1, L = count * step;
      sky();
      it.push({ pic: duskPic.sun, x: w * 0.36, y: yH + h * 0.12, z: 0.004, s: h * 0.5 });
      it.push({ pic: duskPic.land(w / yH), x: 0, y: 0, z: 0.008, s: yH });
      for (let i = 0; i < count; i++) it.push({ pic: bread(i), x: -w / 2 - step / 2 + i * step, y: yH - s * 0.05, z: 0.02, s, kind: 6, amp: -0.18, a: -w / 2 - step, b: L });
      it.push({ pic: duskPic.words(B.name, { space: 0.14 }), x: -w * 0.22, y: h * 0.7, z: 0.03, s: h * 0.17 });
      it.push({ pic: duskPic.words(B.en, { latin: true, weight: 400, space: 0.35 }), x: -w * 0.22, y: h * 0.62, z: 0.03, s: h * 0.055 });
      return { items: it, P };
    }
    if (kind === 'one' || kind === 'blade') {
      const named = kind === 'one', nb = 5, per = P / nb, s = Math.min(w * 0.62, h * (named ? 0.46 : 0.74)), cy = named ? h * 0.6 : h * 0.5;
      sky();
      it.push({ pic: duskPic.sun, x: 0, y: cy - s * 0.6, z: 0.004, s: s * 1.2 });
      for (let i = 0; i < nb; i++) it.push({ pic: bread([0, 1, 3, 4, 2][i]), x: 0, y: cy - s / 2, z: 0.02, s, kind: 8, t0: i * per, amp: per - 0.9 });
      if (named) {
        it.push({ pic: duskPic.words(B.name, { space: 0.14 }), x: 0, y: h * 0.15, z: 0.03, s: Math.min(h * 0.11, w * 0.84 / 4.6) });
        it.push({ pic: duskPic.words(B.en, { latin: true, weight: 400, space: 0.3 }), x: 0, y: h * 0.06, z: 0.03, s: h * 0.035 });
      }
      return { items: it, P };
    }
    // 'sign': its name in the middle, its English under it, breads either side, still; a fine frame round it all,
    // as far in from each edge
    it.push({ pic: { key: `dusk:band:${(w / h).toFixed(2)}`, aspect: w / h, px: 192, draw: (g, W, H) => {
      g.fillStyle = DUSK.ground; g.fillRect(0, 0, W, H);
      const m = H * 0.06, t = Math.max(1, H * 0.015);
      g.strokeStyle = DUSK.ink; g.lineWidth = t; g.strokeRect(m + t / 2, m + t / 2, W - 2 * m - t, H - 2 * m - t);
    } }, x: 0, y: 0, z: 0, s: h });
    const ns = h * 0.54, nw = ns * 4 * 1.14;
    it.push({ pic: duskPic.words(B.name, { space: 0.14 }), x: 0, y: h * 0.32, z: 0.02, s: ns });
    it.push({ pic: duskPic.words(B.en, { latin: true, weight: 400, space: 0.35 }), x: 0, y: h * 0.14, z: 0.02, s: h * 0.13 });
    const bs = h * 0.6, step = bs * 1.7, per = Math.min(3, Math.max(0, Math.floor((w / 2 - nw / 2 - h * 0.4) / step)));
    for (let k = 0; k < per; k++) for (const e of [-1, 1]) it.push({ pic: bread(k * 2 + (e > 0 ? 1 : 0)), x: e * (nw / 2 + h * 0.4 + step * (k + 0.5)), y: h * 0.2, z: 0.02, s: bs });
    return { items: it, P };
  }
  // 夕光烘焙's stage put up: w x h, its middle at (x, y) (as a panel), facing face, its brand's colours
  function dawnPanel(w, h, x, y, z, face, B, kind) {
    const { items, P } = dawnStage(w, h, B, kind);
    const m = emojiStage(items, { P, clip: [-w / 2, w / 2, 0, h], brand: BRANDS.indexOf(B) });
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y - h / 2, z);
    return m;
  }
  // 时雨餐厅's window (its ads, its blade sign, the glass of its front), all of it in LED dots: fogged with the
  // warmth inside, rain on it; drops running down, lit, clear a line through the fog as they go, which mists over
  // again; its name lit in the dots, a drip or two running from it. In an ad, the room behind, blurred through the
  // fog and sharp through the drops: a lamp hung low, a bowl under it on the table, steam going up from it (kind: by
  // its shape). glass: on its shop's front a film of dots over the room itself, faint where
  // fogged, out where cleared (name: or not); 'blade' as that, on the dark, its bowl (Noto Emoji's) lit in the
  // dots in place of the name. Drops after BigWings's Heartfelt, made simpler; everything worked out
  // at each dot's middle. A mesh w x h, its middle at (x, y, z), facing face
  function rainWindow(w, h, x, y, z, face, B, { kind = null, glass = false, name = true } = {}) {
    const aspect = w / h;
    kind ||= glass ? 'glass' : aspect > 1.4 ? 'wide' : aspect < 0.8 ? 'tall' : 'square';
    if (kind === 'blade') name = false;
    const W = aspect >= 1 ? 768 : Math.round(768 * aspect), H = aspect >= 1 ? Math.round(768 / aspect) : 768;
    // where things are (0..1 across, 0..1 up): the bowl (its middle and width as a share of the width), the lamp
    // over it, the name (its middle, its height as a share of the height; down: one character under another)
    const L = {
      wide: { bowl: [0.7, 0.3, Math.min(0.26, 0.5 / aspect)], name: [0.3, 0.56, 0.24] },
      tall: { bowl: [0.6, 0.24, 0.5], name: [0.2, 0.64, 0.13], down: true },
      square: { bowl: [0.64, 0.28, 0.42], name: [0.3, 0.72, 0.17] },
      glass: { bowl: [0.5, 0.3, 0.4], name: [0.5, 0.74, 0.16] },
      blade: { bowl: [0.5, 0.3, 0.58] },
    }[kind];
    const tex = (draw) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      draw(cv.getContext('2d'));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const [bx, by, bw] = L.bowl, BX = bx * W, BW = bw * W, BY = (1 - by) * H, BH = BW * 0.42;
    // the room: deep indigo, the lamp's warm light pooled under it, the table, the bowl (broth in it, chopsticks
    // laid across), a dish by it
    const blade = kind === 'blade', scene = glass || blade ? null : tex((g) => {
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0a0e24'); sky.addColorStop(1, '#1a2146');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(70, 82, 140, 0.35)'; g.lineWidth = W * 0.004;
      for (let k = 1; k < 6; k++) { const xx = (k / 6) * W; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, BY - BH * 0.4); g.stroke(); }
      const ly = Math.max(H * 0.12, BY - BW * 1.25), pool = g.createRadialGradient(BX, ly, 0, BX, ly + BW * 0.6, BW * 1.8);
      pool.addColorStop(0, 'rgba(255, 196, 120, 0.85)'); pool.addColorStop(0.45, 'rgba(255, 170, 95, 0.28)'); pool.addColorStop(1, 'rgba(255, 160, 90, 0)');
      g.fillStyle = pool; g.fillRect(0, 0, W, H);
      const top = BY + BH * 0.18;                                                        // the table
      g.fillStyle = '#2b2233'; g.fillRect(0, top, W, H - top);
      const sheen = g.createRadialGradient(BX, top, 0, BX, top, BW * 1.6);
      sheen.addColorStop(0, 'rgba(255, 190, 120, 0.55)'); sheen.addColorStop(1, 'rgba(255, 190, 120, 0)');
      g.fillStyle = sheen; g.fillRect(0, top, W, H - top);
      g.fillStyle = 'rgba(255, 200, 140, 0.5)'; g.fillRect(0, top, W, Math.max(1, H * 0.004));
      // the lamp: its cord, its shade dark, lit inside, the bulb
      g.strokeStyle = '#0b0e1c'; g.lineWidth = Math.max(1, W * 0.004); g.beginPath(); g.moveTo(BX, 0); g.lineTo(BX, ly - BW * 0.16); g.stroke();
      g.fillStyle = '#0d1122'; g.beginPath(); g.moveTo(BX - BW * 0.1, ly - BW * 0.17); g.lineTo(BX + BW * 0.1, ly - BW * 0.17); g.lineTo(BX + BW * 0.3, ly); g.lineTo(BX - BW * 0.3, ly); g.closePath(); g.fill();
      g.fillStyle = '#ffd9a0'; g.beginPath(); g.ellipse(BX, ly, BW * 0.3, BW * 0.045, 0, 0, Math.PI); g.fill();
      const bulb = g.createRadialGradient(BX, ly + BW * 0.02, 0, BX, ly + BW * 0.02, BW * 0.2);
      bulb.addColorStop(0, 'rgba(255, 245, 220, 1)'); bulb.addColorStop(1, 'rgba(255, 210, 150, 0)');
      g.fillStyle = bulb; g.fillRect(BX - BW * 0.3, ly - BW * 0.1, BW * 0.6, BW * 0.4);
      // a little dish by it, the bowl, its broth, chopsticks across it
      g.fillStyle = '#d8cfc0'; g.beginPath(); g.ellipse(BX - BW * 0.82, top + BH * 0.02, BW * 0.2, BW * 0.05, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9fb48a'; g.beginPath(); g.ellipse(BX - BW * 0.82, top - BH * 0.02, BW * 0.12, BW * 0.03, 0, 0, Math.PI * 2); g.fill();
      const body = g.createLinearGradient(BX - BW / 2, 0, BX + BW / 2, 0); body.addColorStop(0, '#fff6e8'); body.addColorStop(1, '#b9ad9c');
      g.fillStyle = body; g.beginPath(); g.moveTo(BX - BW / 2, BY - BH * 0.5); g.bezierCurveTo(BX - BW / 2, BY + BH * 0.55, BX + BW / 2, BY + BH * 0.55, BX + BW / 2, BY - BH * 0.5); g.closePath(); g.fill();
      g.fillStyle = '#efe5d4'; g.fillRect(BX - BW * 0.16, BY + BH * 0.02, BW * 0.32, BH * 0.18);
      g.fillStyle = '#f7efe2'; g.beginPath(); g.ellipse(BX, BY - BH * 0.5, BW / 2, BW * 0.09, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c98d4c'; g.beginPath(); g.ellipse(BX, BY - BH * 0.5, BW * 0.45, BW * 0.07, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7fa06a'; for (const dx of [-0.15, 0.05, 0.2]) { g.beginPath(); g.ellipse(BX + BW * dx, BY - BH * 0.5, BW * 0.04, BW * 0.015, 0.3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#3a2a22'; g.lineWidth = Math.max(1, BW * 0.025); g.lineCap = 'round';
      for (const d of [0, BW * 0.05]) { g.beginPath(); g.moveTo(BX - BW * 0.25 + d, BY - BH * 0.62); g.lineTo(BX + BW * 0.62 + d, BY - BH * 1.05); g.stroke(); }
    });
    // the name written in the fog: brushed with a finger (soft edges), a few drips running down from it
    const RW = makeRandom(Math.round(w * 97 + h * 31));
    const words = tex((g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (blade) { drawIcon(g, 'noto/ramen', W / 2, H * 0.52, Math.min(W, H) * 0.74, '#fff'); return; }
      if (!name) return;
      const [nx, ny, nh] = L.name, chars = [...B.name], cs = nh * H;
      g.fillStyle = '#fff';
      g.font = `600 ${cs}px "PingFang SC", "Noto Sans SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const at = chars.map((c, i) => L.down ? [nx * W, (1 - ny) * H + (i - (chars.length - 1) / 2) * cs * 1.05] : [nx * W + (i - (chars.length - 1) / 2) * cs * 1.02, (1 - ny) * H]);
      chars.forEach((c, i) => g.fillText(c, ...at[i]));
      g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const [cx, cy] = at[RW.int(0, at.length - 1)], dx = cx + RW.range(-0.3, 0.3) * cs, y0 = cy + cs * 0.35, len = RW.range(0.25, 0.7) * cs;
        const grad = g.createLinearGradient(0, y0, 0, y0 + len); grad.addColorStop(0, '#fff'); grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.strokeStyle = grad; g.lineWidth = cs * 0.045; g.beginPath(); g.moveTo(dx, y0); g.lineTo(dx, y0 + len); g.stroke();
      }
    });
    const STEAM = [bx, by + (BH * 0.5) / H, bw * 0.55, 0.32];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: scene }, uWords: { value: words }, uTime: shared.uTime, uAspect: { value: aspect },
        // (the drops' scale: on its own glass, drops as they are; in a picture of a window, by its size)
        uScale: { value: glass ? 1.1 : blade ? 1.75 : THREE.MathUtils.clamp(h / 1.6, 1, 3.2) * 1.7 },   // (the blade's drops as many dots across as its front's) uSeed: { value: RW.range(0, 50) }, uSteam: { value: new THREE.Vector4(...STEAM) },
        uDots: { value: new THREE.Vector2(w, h).divideScalar(Math.min(w, h) / (glass ? 80 : 50)).floor() },   // (dots across, up)
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) },
      },
      defines: glass ? { GLASS: 1 } : blade ? { GLASS: 1, BLADE: 1 } : {},
      transparent: glass, depthWrite: !glass,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uScene, uWords; uniform float uTime, uAspect, uScale, uSeed; uniform vec4 uSteam; uniform vec2 uDots;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex;
        varying vec2 vUv;
        vec3 N13(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787)); p3 += dot(p3, p3.yzx + 19.19); return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x)); }
        float N(float t) { return fract(sin(t * 12345.564) * 7658.76); }
        float Saw(float b, float t) { return smoothstep(0.0, b, t) * smoothstep(1.0, b, t); }
        // the drops running down: (the drop itself, the line it leaves clear)
        vec2 layer(vec2 uv, float t) {
          vec2 UV = uv;
          uv.y += t * 0.75;
          vec2 a = vec2(6.0, 1.0), grid = a * 2.0, id = floor(uv * grid);
          uv.y += N(id.x);
          id = floor(uv * grid);
          vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
          vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
          float x = n.x - 0.5, y = UV.y * 20.0;
          x += sin(y + sin(y)) * (0.5 - abs(x)) * (n.z - 0.5);
          x *= 0.7;
          float ti = fract(t + n.z);
          y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
          float d = length((st - vec2(x, y)) * a.yx), drop = smoothstep(0.4, 0.0, d);
          float r = sqrt(smoothstep(1.0, y, st.y)), cd = abs(st.x - x);
          float front = smoothstep(-0.02, 0.02, st.y - y);
          float trail = smoothstep(0.23 * r, 0.15 * r * r, cd) * front * r * r;
          float yy = fract(UV.y * 10.0) + (st.y - 0.5);
          float beads = smoothstep(0.3, 0.0, length(st - vec2(x, yy)));
          return vec2(drop + beads * r * front * 0.45, trail);
        }
        // the small drops sitting on it, coming and going
        float still(vec2 uv, float t) {
          uv *= 40.0;
          vec2 id = floor(uv); uv = fract(uv) - 0.5;
          vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
          return smoothstep(0.3, 0.0, length(uv - (n.xy - 0.5) * 0.7)) * fract(n.z * 10.0) * Saw(0.025, fract(t + n.z));
        }
        vec2 drops(vec2 uv, float t) {
          vec2 m1 = layer(uv, t), m2 = layer(uv * 1.85, t);
          return vec2(smoothstep(0.3, 1.0, still(uv, t) * 0.4 + m1.x + m2.x), max(m1.y, m2.y));
        }
        // steam: soft wisps going up out of the bowl, wavering
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float steam(vec2 p, float t) {
          vec2 q = vec2((p.x - uSteam.x) / uSteam.z, (p.y - uSteam.y) / uSteam.w);
          if (q.y < 0.0 || q.y > 1.0) return 0.0;
          float sway = (noise(vec2(q.y * 3.0 - t * 0.4, 1.7)) - 0.5) * 0.6 * q.y;
          float bx = (q.x - sway) * 2.4 / (0.5 + q.y), body = exp(-bx * bx);
          float wisps = noise(vec2(q.x * 4.0, q.y * 3.0 - t * 0.9)) * noise(vec2(q.x * 7.0 + 3.1, q.y * 5.0 - t * 1.3));
          return body * smoothstep(0.0, 0.15, q.y) * smoothstep(1.0, 0.45, q.y) * smoothstep(0.03, 0.3, wisps);
        }
        void main() {
          // the dot this is in (its middle), and where in it; everything is worked out at its middle
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.47, 0.3, length(f));
          dotM = mix(dotM, 0.45, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));   // (far off: their average, no bands)
          vec2 uv = vec2(cell.x * uAspect, cell.y) / uScale;
          float t = uTime * 0.18 + uSeed;
          vec2 c = drops(uv, t), e = vec2(1.0 / (uDots.y * uScale), 0.0);   // (e: a dot over)
          vec2 nrm = vec2(drops(uv + e, t).x - c.x, drops(uv + e.yx, t).x - c.x);
          float words = textureLod(uWords, cell, 0.0).r;
          float clear = clamp(max(smoothstep(0.1, 0.25, c.x), c.y), 0.0, 1.0), drop = smoothstep(0.15, 0.4, c.x);
#ifdef GLASS
          // a film of dots on the glass: faint where it is fogged, out where cleared, bright where a drop is, the name lit
          float fog = 0.3 * (1.0 - clear);
          vec3 col = vec3(0.55, 0.66, 0.8) * fog + vec3(0.65, 1.0, 1.15) * drop + vec3(1.25, 1.05, 0.78) * words;
          col /= max(fog + drop + words, 1e-3);
          float a = clamp(fog + drop * 0.75 + words * 0.95, 0.0, 1.0) * dotM;
#ifdef BLADE
          // (on the dark: the dots between faintly there)
          col = uHue * (col * a + vec3(0.004, 0.005, 0.01) * (1.0 - a));
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
#else
          gl_FragColor = vec4(uHue * col, a);
#endif
#else
          vec2 suv = cell + nrm * 0.5 / vec2(uAspect, 1.0);
          vec3 col = textureLod(uScene, suv, mix(2.2, 0.0, clear)).rgb;
          col += vec3(0.85, 0.82, 0.78) * steam(suv, uTime) * mix(0.45, 0.8, clear);
          col = mix(col, col * 0.8 + vec3(0.045, 0.052, 0.072), 0.85 * (1.0 - clear));   // (the fog: milky, lit; the lines the drops clear dark through it, as on the front)
          col *= 1.0 - 0.45 * c.y;
          col += vec3(0.3, 0.55, 0.75) * drop * 0.45;                                   // (the drops lit, not much more than their lines)
          col = mix(col, vec3(1.25, 1.05, 0.78), words * 0.92);                          // (its name lit)
          col = col * dotM * 1.25 + vec3(0.003, 0.004, 0.009) * (1.0 - dotM);           // (as dots, on the dark between them)
          col = uHue * col;
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
#endif
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y, z);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 萤伞's ads and signs, in LED dots, as 时雨餐厅's (rainWindow): in the dark, rain falling in faint dotted lines,
  // open umbrellas drifting up through it as jellyfish do, their domes breathing, their rims pulsing with light,
  // their shafts and handles trailing and swaying below; its name lit in the dots (not on a 'blade'). kind: by its
  // shape, or 'blade'; framed: a line of lit dots round it, its name smaller, in the middle; a mesh w x h, its
  // middle at (x, y, z), facing face
  function umbrellaLED(w, h, x, y, z, face, B, { kind = null, framed = false } = {}) {
    const aspect = w / h;
    kind ||= aspect > 1.4 ? 'wide' : aspect < 0.8 ? 'tall' : 'square';
    const W = aspect >= 1 ? 768 : Math.round(768 * aspect), H = aspect >= 1 ? Math.round(768 / aspect) : 768;
    // its name: its middle, its height, as shares
    const L = { wide: { name: [0.24, 0.5, 0.34] }, tall: { name: [0.5, 0.86, 0.12] }, square: { name: [0.5, 0.86, 0.14] }, blade: {} }[kind];
    if (kind === 'wide' && aspect > 4) L.name = [0.14, 0.5, 0.62];                       // (a strip: its name larger, at its end)
    if (framed && L.name) L.name = [0.5, 0.5, 0.3];
    const RW = makeRandom(Math.round(w * 131 + h * 17));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (L.name) {
      const [nx, ny, nh] = L.name, cs = nh * H;
      g.fillStyle = '#fff'; g.font = `600 ${cs}px "PingFang SC", "Noto Sans SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      [...B.name].forEach((c, i, all) => g.fillText(c, nx * W + (i - (all.length - 1) / 2) * cs * 1.04, (1 - ny) * H));
    }
    const words = new THREE.CanvasTexture(cv);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uWords: { value: words }, uTime: shared.uTime, uAspect: { value: aspect }, uSeed: { value: RW.range(0, 50) },
        uDots: { value: new THREE.Vector2(w, h).divideScalar(Math.min(w, h) / 50).floor() },
        uNamed: { value: L.name ? 1 : 0 }, uFramed: { value: framed ? 1 : 0 },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uWords; uniform float uTime, uAspect, uSeed, uNamed, uFramed; uniform vec2 uDots;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        // how near p is to a segment, to an arc
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
        // an umbrella, its rim's middle at the origin, radius r (dh: its dome's height as a share of r; sway: its
        // shaft's lower end, sideways): (its lines' light, its dome's fill)
        vec2 umbrella(vec2 p, float r, float dh, float sway, float lw) {
          float H = r * dh;
          float e = length(vec2(p.x / r, p.y / H));
          float dome = p.y > 0.0 ? smoothstep(lw, 0.0, abs(e - 1.0) * r) : 0.0;
          float fill = p.y > 0.0 && e < 1.0 ? 1.0 : 0.0;
          float ribs = 0.0;
          for (int k = 1; k <= 2; k++) {                                      // (the ribs, curving down from the tip)
            float rk = r * float(k) / 3.0, ek = length(vec2(p.x / rk, p.y / H));
            ribs = max(ribs, p.y > 0.0 ? smoothstep(lw * 0.7, 0.0, abs(ek - 1.0) * rk) : 0.0);
          }
          float rim = smoothstep(lw, 0.0, abs(p.y)) * step(abs(p.x), r);
          vec2 foot = vec2(sway, -0.95 * r);
          float shaft = smoothstep(lw * 0.8, 0.0, seg(p, vec2(0.0, H), foot));
          vec2 hc = foot + vec2(0.12 * r, 0.0);
          float hook = p.y < foot.y ? smoothstep(lw * 0.8, 0.0, abs(length(p - hc) - 0.12 * r)) : 0.0;
          return vec2(max(max(dome, rim), max(ribs * 0.6, max(shaft, hook) * 0.8)), fill);
        }
        void main() {
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.47, 0.3, length(f)), px = 1.0 / uDots.y;
          dotM = mix(dotM, 0.45, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));   // (far off: their average, no bands)
          vec2 q = vec2(cell.x * uAspect, cell.y);
          float t = uTime + uSeed;
          vec3 LINE = vec3(0.55, 1.6, 0.95), FILL = vec3(0.04, 0.2, 0.13);
          vec3 col = vec3(0.0);
          // the rain: faint dotted lines falling
          float colI = floor(q.x / px), rn = hash(colI + 0.37 * uSeed);
          if (rn > 0.82) { float yy = fract(q.y * 0.6 + t * (0.5 + rn * 0.4) + rn * 7.0); col += vec3(0.08, 0.16, 0.2) * smoothstep(0.85, 1.0, yy) * step(0.5, fract(q.y / px * 0.5)); }
          // the umbrellas drifting up, breathing
          for (int k = 0; k < 8; k++) {
            float fk = float(k), hk = hash(fk * 3.7 + uSeed);
            float r = mix(0.12, 0.2, hash(fk * 1.3 + uSeed)) * (uAspect < 1.0 ? uAspect * 1.4 : uAspect > 4.0 ? 2.0 : 1.0);   // (larger on a strip)
            float speed = mix(0.035, 0.06, hk), yk = fract(t * speed + hk) * 1.6 - 0.3;
            float xk = (fk + 0.5) / 8.0 * uAspect + sin(t * 0.3 + fk * 2.1) * 0.04 * uAspect;
            float breath = sin(t * 1.6 + fk * 1.9);
            vec2 p = q - vec2(xk, yk);
            p.x /= 1.0 + 0.08 * breath;
            vec2 u = umbrella(p, r, 0.55 * (1.0 - 0.12 * breath), sin(t * 1.1 + fk) * 0.25 * r, px * 1.1);
            col += LINE * u.x * (0.75 + 0.35 * breath) + FILL * u.y * (1.0 + 0.5 * breath);
          }
          float words = textureLod(uWords, cell, 0.0).r;
          col = mix(col, vec3(1.1, 1.5, 1.0), words * 0.9 * uNamed);
          // (framed: a line of lit dots one in from its edge, nothing outside it)
          vec2 ci = floor(vUv * uDots);
          float edge = min(min(ci.x, uDots.x - 1.0 - ci.x), min(ci.y, uDots.y - 1.0 - ci.y));
          if (uFramed > 0.5) col = edge < 0.5 ? vec3(0.0) : abs(edge - 1.0) < 0.5 ? LINE * 0.85 : col;
          col = col * dotM * 1.2 + vec3(0.002, 0.005, 0.004) * (1.0 - dotM);
          col = uHue * col;
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y, z);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 长夏乐馆's ads and signs, in LED dots: a river of sound. Three waves (its violet, a pink, a cyan) flowing from right
  // to left across the dark, over and under one another, swelling on each beat (76 a minute, its music's); now and
  // then a note of dots floating along on the first; its name where they run calm, a dark edge round it so it
  // reads over them. kind: by its shape ('strip': its name at its end; 'tall': its name at the top, the waves
  // under it), or 'blade' (no name); named: false for none. live: swelling with its music as it is heard
  // (concertBeat), rather than to the beat alone. palette: 'brand' (its violet, a pink, a cyan), 'tone' (the
  // city's own cyans and blues), 'dusk' (amber, rose, violet), 'aurora' (green, cyan, violet), or by turns as
  // they are made. scroll: its name going by along it, over and over (a long strip); round: a round screen, w
  // across, a ring of light round its edge; clear: all but clear, only its lit dots showing, what is behind seen
  // between them. A mesh w x h, its middle at (x, y, z), facing face
  function concertWaves(w, h, x, y, z, face, { kind = null, live = false, palette = null, named = true, scroll = false, round = false, clear = false } = {}) {
    const WAVE_PALETTES = {                              // (three waves' colours and its name's)
      brand: null,
      tone: [[0.35, 1.25, 1.55], [0.9, 1.45, 1.55], [0.2, 0.55, 1.35], [1.1, 1.5, 1.6]],
      dusk: [[1.6, 0.75, 0.35], [1.5, 0.5, 0.9], [0.75, 0.45, 1.5], [1.6, 1.25, 0.95]],
      aurora: [[0.4, 1.5, 0.8], [0.35, 1.2, 1.5], [0.95, 0.5, 1.5], [1.1, 1.55, 1.25]],
    };
    palette ||= ['brand', 'tone', 'dusk', 'aurora'][(concertWaves.turns = (concertWaves.turns ?? -1) + 1) % 4];
    const B = BRANDS.find((b) => b.key === 'rain-concert'), aspect = w / h;
    kind ||= aspect > 4 ? 'strip' : aspect < 0.8 ? 'tall' : 'wide';
    // its name: middle, height (shares); where the waves run (their middle, how far they swing); where they are calm
    const L = {
      strip: { name: [0.13, 0.5, 0.62], wave: [0.5, 0.32], calm: [0, 0.27] },
      wide: { name: [0.5, 0.68, 0.24], wave: [0.34, 0.18], calm: [-1, -1] },   // (its name in the middle, over the waves)
      tall: { name: [0.5, 0.86, 0.12], wave: [0.42, 0.25], calm: [-1, -1] },
      blade: { wave: [0.5, 0.3], calm: [-1, -1] },
    }[kind];
    if (!named || scroll) { delete L.name; L.calm = [-1, -1]; }
    // (scroll: its name in a round of PERIOD heights, read going by: a round longer than it is, one name on it at a
    // time)
    const PERIOD = scroll ? Math.max(6, Math.ceil(aspect + 2)) : 6;
    const W = scroll ? 256 * PERIOD : aspect >= 1 ? 1024 : Math.round(1024 * aspect), H = scroll ? 256 : aspect >= 1 ? Math.round(1024 / aspect) : 1024;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (scroll) {
      const cs = H * 0.6;
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${cs}px "PingFang SC", "Noto Sans SC", sans-serif`;
      [...B.name].forEach((c, i, all) => g.fillText(c, W * 0.3 + (i - (all.length - 1) / 2) * cs * 1.04, H * 0.52));
    }
    if (L.name) {
      // (its size and place as they fit: never wider than 0.6 of it, never over its edge)
      const [nx, ny, nh] = L.name, chars = [...B.name], cs = Math.min(nh * H, W * 0.6 / (chars.length * 1.04)), half = chars.length * cs * 0.52;
      const cx = THREE.MathUtils.clamp(nx * W, half + W * 0.05, W - half - W * 0.05);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${cs}px "PingFang SC", "Noto Sans SC", sans-serif`;
      chars.forEach((c, i, all) => g.fillText(c, cx + (i - (all.length - 1) / 2) * cs * 1.04, (1 - ny) * H));
    }
    const P = WAVE_PALETTES[palette], violet = new THREE.Color(B.color).toArray();
    const cols = (P || [violet.map((v) => v * 1.5), [1.5, 0.6, 1.15], [0.45, 1.25, 1.5], [1.35, 1.15, 1.6]]).map((c) => new THREE.Vector3(...c));
    const mat = new THREE.ShaderMaterial({
      ...(clear ? { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } : {}),
      uniforms: { uWords: { value: new THREE.CanvasTexture(cv) }, uTime: shared.uTime, uAspect: { value: aspect },
        uDots: { value: new THREE.Vector2(w, h).divideScalar(Math.min(w, h) / (kind === 'strip' ? 30 : 50)).floor() },
        uWave: { value: new THREE.Vector4(L.wave[0], L.wave[1], L.calm[0], L.calm[1]) }, uBeat: live ? concertBeat : { value: -1 },
        uCols: { value: cols }, uScroll: { value: scroll ? PERIOD : 0 }, uRound: { value: round ? 1 : 0 }, uClear: { value: clear ? 1 : 0 }, uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uWords; uniform float uTime, uAspect, uBeat, uScroll, uRound, uClear; uniform vec2 uDots; uniform vec4 uWave; uniform vec3 uCols[4];
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.47, 0.3, length(f));
          dotM = mix(dotM, 0.45, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));
          float px = 1.0 / uDots.y, xs = cell.x * uAspect;
          // the swell: on each beat (or, live, as loud as its music is just now)
          float beatT = fract(uTime * 76.0 / 60.0), pulse = uBeat >= 0.0 ? 0.35 + 1.1 * uBeat : 0.55 + 0.45 * exp(-beatT * 4.0);
          float calm = uWave.z < 0.0 ? 1.0 : 0.15 + 0.85 * smoothstep(uWave.w * uAspect, uWave.w * uAspect + 0.35, xs);
          vec3 col = vec3(0.0);
          vec3 C[3]; C[0] = uCols[0]; C[1] = uCols[1]; C[2] = uCols[2];
          for (int i = 0; i < 3; i++) {
            float fi = float(i), k = 6.0 + fi * 3.1, sp = 0.9 + fi * 0.35, ph = fi * 2.1;
            float amp = uWave.y * (0.55 + 0.45 * sin(uTime * 0.37 + fi * 1.7 + xs * 0.9)) * calm * pulse / (1.0 + fi * 0.35);
            float yw = uWave.x + amp * sin(xs * k + uTime * sp + ph) + (fi - 1.0) * 0.04;
            float d = abs(cell.y - yw) / px;
            col += C[i] * (exp(-d * d * 0.8) + 0.18 * exp(-d * d * 0.08)) * (0.8 - fi * 0.12);
          }
          // notes floating along the first wave, leftward
          for (int n = 0; n < 3; n++) {
            float fn = float(n), nx = (1.0 - fract(uTime * 0.05 + fn * 0.37)) * (uAspect + 0.3) - 0.15;
            float amp0 = uWave.y * (0.55 + 0.45 * sin(uTime * 0.37 + nx * 0.9)) * (uWave.z < 0.0 ? 1.0 : 0.15 + 0.85 * smoothstep(uWave.w * uAspect, uWave.w * uAspect + 0.35, nx)) * pulse;
            vec2 head = vec2(nx, uWave.x + amp0 * sin(nx * 6.0 + uTime * 0.9) + px * 6.0);
            vec2 q = vec2(xs, cell.y) - head;
            float note = step(length(q * vec2(1.0, 1.3)), px * 1.6)
              + step(abs(q.x - px * 1.3), px * 0.4) * step(0.0, q.y) * step(q.y, px * 6.0)
              + step(abs(q.y - px * 5.5 + (q.x - px * 1.3) * 0.6), px * 0.5) * step(px * 1.3, q.x) * step(q.x, px * 3.2);
            col += vec3(1.3, 1.2, 1.5) * min(note, 1.0) * 0.9;
          }
          vec2 wuv = uScroll > 0.0 ? vec2(fract(xs / uScroll + uTime * 0.035), cell.y) : cell;     // (scroll: its name going by)
          float words = textureLod(uWords, wuv, 0.0).r, halo = textureLod(uWords, wuv, 3.0).r;   // (round its name, dark, so it reads)
          col *= 1.0 - min(halo * 3.0, 1.0) * 0.85;
          col = mix(col, uCols[3], words * 0.95);
          if (uRound > 0.5) col = mix(col, uCols[3] * 0.9, smoothstep(0.445, 0.46, length(cell - 0.5)));   // (round: a ring of light at its edge)
          col = col * dotM * 1.1 + vec3(0.003, 0.002, 0.008) * (1.0 - dotM) * (1.0 - uClear);   // (clear: nothing between its dots)
          col = uHue * col;
          vec3 kk = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = col * cos(adj.x) + cross(kk, col) * sin(adj.x) + kk * dot(kk, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(round ? new THREE.CircleGeometry(w / 2, 64) : new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y, z);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 长夏乐馆's tower's great screen: sound itself, in LED dots, no words; three pictures of it in turn, each melting
  // into the next (12 s each), all swelling with its music as it is heard (concertBeat) and on its beat, their colours
  // going slowly about the city's own blues (cyan to a deeper azure): the rings of three moving sources meeting all over it,
  // their crests where they add; a pulsar's pulses as on Unknown Pleasures, many lines from top to foot, ridged in
  // the middle, each hiding those behind it; and a histogram from its middle line, columns of the spectrum growing
  // up and down at once, a dot held at each one's last peak, falling slowly. A mesh w x h, its middle at (x, y, z), facing face
  function soundScreen(w, h, x, y, z, face) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uBeat: concertBeat, uAspect: { value: w / h }, uHue: shared.uHue,
        uDots: { value: new THREE.Vector2(w, h).divideScalar(Math.min(w, h) / 100).floor() } },   // (fine: its pulsar's lines one apart)
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uBeat, uAspect; uniform vec2 uDots; uniform mat3 uHue; varying vec2 vUv;
        float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        float noise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
        // one picture: what light at q (x across, y up; the middle at c; s its smaller side), at time t, in its
        // three colours (bright, white, deep)
        vec3 picture(int k, vec2 q, vec2 c, float s, float t, float amp, vec3 A, vec3 W, vec3 D) {
          vec3 col = vec3(0.0);
          float px = 1.0 / uDots.y;
          if (k == 0) {                                     // three moving sources, their rings meeting all over it
            float sum = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              vec2 src = c + vec2(s * 0.32 * sin(t * 0.21 + fi * 2.1), 0.32 * cos(t * 0.17 + fi * 1.3));
              sum += cos(length(q - src) / s * 38.0 - t * 2.4) / 3.0;
            }
            col += mix(D, A, smoothstep(0.2, 0.8, sum)) * smoothstep(0.1, 0.6, abs(sum)) * (0.5 + 0.6 * amp);
            col += W * smoothstep(0.85, 1.0, sum);
          } else if (k == 1) {                               // a pulsar's pulses, as on Unknown Pleasures: many lines, top to foot,
            // ridged in the middle, each hiding those behind (above) it where it rises over them
            float xx = (q.x - c.x) / uAspect, env = exp(-xx * xx * 14.0), front = -1.0;
            // (only the lines that can reach this point matter: its own and the few below it that rise this far;
            // those below drawn first, to hide what they rise over)
            const int N = 44;
            float gap = 0.94 / float(N), reach = 0.12 * max(amp, 0.5);
            int i0 = int(max(0.0, floor((q.y - 0.03 - reach) / gap))), i1 = int(min(float(N - 1), floor((q.y - 0.03) / gap) + 1.0));
            for (int k = 0; k < 12; k++) {
              int i = i0 + k;
              if (i > i1) break;
              float fi = float(i), base = 0.03 + fi * gap;
              float jag = noise(xx * 11.0 + fi * 5.3 + t * 1.2) * 0.75 + noise(xx * 26.0 - fi * 2.1 + t * 1.8) * 0.25;
              float y = base + (env * amp * 0.07 * pow(jag, 2.2) + 0.002 * noise(xx * 30.0 + fi * 9.0)) * (0.6 + 0.8 * noise(fi * 0.7 + t * 0.2));
              float d = abs(q.y - y) / px;
              if (q.y > front - px * 0.5) col = max(col, mix(D, W, 0.35 + 0.65 * env) * exp(-d * d * 1.4));
              front = max(front, y);
            }
          } else {                                           // a histogram from the middle, up and down at once, a peak held on each
            float n = 22.0, xn = (q.x / uAspect) * n, i = floor(xn), inCol = step(0.18, fract(xn)) * step(fract(xn), 0.82);
            float v = clamp(0.08 + 0.4 * (0.55 + 0.55 * amp) * pow(noise(i * 1.7 + t * 3.0), 0.8) * (0.6 + 0.4 * noise(i * 0.3 - t * 0.7)), 0.0, 0.47);
            float lag = clamp(0.08 + 0.4 * (0.55 + 0.55 * amp) * pow(noise(i * 1.7 + (t - 0.6) * 3.0), 0.8) * (0.6 + 0.4 * noise(i * 0.3 - (t - 0.6) * 0.7)), 0.0, 0.47);
            float dy = abs(q.y - 0.5), peak = max(v, lag) + px * 2.0;
            col += mix(A, D, smoothstep(0.0, 0.45, dy)) * step(dy, v) * inCol;
            col += W * smoothstep(px * 1.2, 0.0, abs(dy - peak)) * inCol;
            col += W * 0.5 * smoothstep(px * 0.8, 0.0, dy);                         // (its middle line)
          }
          return col;
        }
        void main() {
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.47, 0.3, length(f));
          dotM = mix(dotM, 0.45, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));
          vec2 q = vec2(cell.x * uAspect, cell.y), c = vec2(uAspect * 0.5, 0.5);
          float s = min(uAspect, 1.0), t = uTime;
          float amp = 0.45 + 0.22 * exp(-fract(t * 76.0 / 60.0) * 4.0) + 1.2 * uBeat;
          // its colours: about the city's own, going slowly between cyan and a deeper azure and back (a round of 42 s)
          float az = 0.5 + 0.5 * sin(t * 6.2832 / 42.0);
          vec3 A = mix(vec3(0.35, 1.25, 1.55), vec3(0.25, 0.85, 1.6), az), W = mix(vec3(1.15, 1.45, 1.6), vec3(0.95, 1.35, 1.65), az);
          vec3 D = mix(vec3(0.08, 0.6, 1.1), vec3(0.06, 0.45, 1.15), az);   // (deep, but toward cyan: never violet)
          float phase = t / 12.0, along = fract(phase);
          int k = int(mod(floor(phase), 3.0)), k2 = int(mod(floor(phase) + 1.0, 3.0));
          vec3 col = picture(k, q, c, s, t, amp, A, W, D);
          float fade = smoothstep(0.82, 1.0, along);
          if (fade > 0.0) col = mix(col, picture(k2, q, c, s, t, amp, A, W, D), fade);
          gl_FragColor = vec4(uHue * col * dotM + vec3(0.002, 0.004, 0.008) * (1.0 - dotM), 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y, z);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 千秋影院's, in LED dots: four small scenes of a night (the moon over the sea, its light on the water; the city's
  // towers, their windows lit and going out; the galaxy's train going up into the stars; an island, its lighthouse
  // blinking, a star falling), shown one of two ways. mode 'film': on a strip of film, its holes along its edges,
  // flowing by (flow) or pulled through a frame at a time as by a projector (its own frames held a moment, then on to
  // its title card, held longer: its moon); mode 'beam': a projector's beam across a dark hall to its screen, dust in
  // the light, the scenes melting one into the next dot by dot. palette: its colours (bright: 浮岛咖啡's strip's, the
  // pale of the city's own tones, deep blue on it); kind: by its shape ('sign': the canopy's, the film behind its name
  // on a plate). A mesh w x h, its middle at (x, y, z), facing face
  function cinemaLED(w, h, x, y, z, face, { mode = null, palette = null, kind = null } = {}) {
    const PALETTES = {
      bright: { sky0: [0.62, 0.76, 0.88], sky1: [0.86, 0.95, 1.0], ink: [0.04, 0.15, 0.34], acc: [0.15, 0.45, 0.95], rim: [0.06, 0.18, 0.38], hole: [1.0, 1.05, 1.05], panel: [0.86, 0.95, 1.0], name: [0.04, 0.15, 0.34] },
      moon: { sky0: [0.03, 0.12, 0.3], sky1: [0.12, 0.52, 0.95], ink: [0.01, 0.015, 0.04], acc: [1.7, 1.45, 0.75], rim: [0.012, 0.012, 0.02], hole: [0.9, 0.85, 0.6], panel: [0.006, 0.008, 0.02], name: [1.7, 1.5, 0.9] },
      silver: { sky0: [0.03, 0.09, 0.17], sky1: [0.25, 0.55, 0.8], ink: [0.01, 0.02, 0.035], acc: [1.45, 1.68, 1.75], rim: [0.01, 0.014, 0.02], hole: [0.7, 0.9, 1.0], panel: [0.005, 0.008, 0.014], name: [1.4, 1.65, 1.75] },
      rose: { sky0: [0.16, 0.04, 0.18], sky1: [0.85, 0.32, 0.48], ink: [0.03, 0.01, 0.03], acc: [1.75, 1.25, 0.8], rim: [0.02, 0.01, 0.015], hole: [1.0, 0.7, 0.6], panel: [0.012, 0.005, 0.012], name: [1.75, 1.05, 1.1] },
      teal: { sky0: [0.02, 0.1, 0.11], sky1: [0.12, 0.55, 0.52], ink: [0.008, 0.025, 0.025], acc: [1.25, 1.7, 1.35], rim: [0.008, 0.016, 0.016], hole: [0.7, 1.0, 0.85], panel: [0.004, 0.01, 0.01], name: [1.2, 1.7, 1.5] },
    };
    // (one after another about the city: the film, the beam; each its colours)
    const turn = (cinemaLED.turns = (cinemaLED.turns ?? -1) + 1);
    mode ||= turn % 2 ? 'beam' : 'film';
    palette ||= ['moon', 'silver', 'rose', 'teal'][Math.floor(turn / 2 + turn) % 4];
    const B = BRANDS.find((b) => b.key === 'moon-cinema'), A = w / h, P = PALETTES[palette];
    kind ||= A > 3 ? 'strip' : A < 0.8 ? 'tall' : 'wide';
    const dots = new THREE.Vector2(w, h).divideScalar(Math.min(w, h) / (kind === 'sign' ? 40 : kind === 'strip' ? 72 : 64)).floor();
    const rows = dots.y;
    // where things are, in heights from its foot and left: the film's band (x0, x1, y0, y1), the name's plate, the
    // screen, the projector; and its words, drawn red (always there) or green (its title card's, while held)
    let band = [0, 0, 0, 0], plate = [0, 0, -1, -1], scr = [0, 0, 0, 0], proj = [0, 0], axis = 0, motion = 0;
    const words = [];
    const nameAt = (x, y, size, ch = 'r') => words.push({ text: B.name, x, y, size, ch });
    const tagAt = (x, y, size) => { if (size * rows >= 8) words.push({ text: B.tagline, x, y, size, ch: 'r' }); };
    const moonAt = (x, y, r, ch) => words.push({ moon: true, x, y, r, ch });
    if (mode === 'film') {
      if (kind === 'sign') {
        band = [0, A, 0.04, 0.96]; plate = [A / 2 - 1.4, A / 2 + 1.4, 0.1, 0.9];
        nameAt(A / 2, 0.5, 0.56);
      } else if (kind === 'strip') {
        band = [1.5, A - 0.05, 0.1, 0.9];
        moonAt(0.72, 0.74, 0.12, 'r'); nameAt(0.72, 0.43, 0.26); tagAt(0.72, 0.17, 0.13);
      } else if (kind === 'wide') {
        band = [0, A, 0.06, 0.72]; motion = 1;
        nameAt(A / 2, 0.86, Math.min(0.18, A * 0.8 / 4.2));
        moonAt(A / 2, 0.39, 0.13, 'g');
      } else {
        band = [A * 0.06, A * 0.94, 0.22, 0.99]; axis = 1; motion = 1;
        nameAt(A / 2, 0.11, Math.min(0.11, A * 0.85 / 4.3));
        moonAt(A / 2, 0.605, A * 0.88 * 0.66 * 0.3, 'g');
      }
    } else if (kind === 'tall') {
      axis = 1; proj = [A / 2, 0.95];
      const sh = A * 0.84 / 1.45;
      scr = [A * 0.08, A * 0.92, 0.7 - sh, 0.7];
      const cs = Math.min(0.11, A * 0.85 / 4.3);
      nameAt(A / 2, (0.7 - sh) / 2 + 0.03, cs); tagAt(A / 2, (0.7 - sh) / 2 - cs * 1.1, cs * 0.55);
    } else {
      proj = [0.1, 0.8];
      scr = [A * 0.44, A * 0.96, 0.2, 0.92];
      const cs = Math.min(0.17, A * 0.4 * 0.92 / 4.2);
      nameAt(A * 0.24, 0.28, cs); tagAt(A * 0.24, 0.28 - cs * 1.15, Math.min(0.1, A * 0.36 / 6.3));
    }
    const W = A >= 1 ? 1024 : Math.round(1024 * A), H = A >= 1 ? Math.round(1024 / A) : 1024;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const t of words) {
      const cx = t.x / A * W, cy = (1 - t.y) * H;
      g.fillStyle = t.ch === 'g' ? '#00ff00' : '#ff0000';
      if (t.moon) {
        // (a crescent: its disc, but for one a little up and to the right of it)
        const r = t.r * H;
        g.save(); g.beginPath(); g.rect(0, 0, W, H); g.arc(cx + r * 0.42, cy - r * 0.26, r * 0.86, 0, Math.PI * 2); g.clip('evenodd');
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.restore();
        continue;
      }
      const cs = t.size * H, chars = [...t.text];
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${cs}px "PingFang SC", "Noto Sans SC", sans-serif`;
      chars.forEach((c, i) => g.fillText(c, cx + (i - (chars.length - 1) / 2) * cs * 1.04, cy));
    }
    const v3 = (c) => new THREE.Vector3(...c);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uWords: { value: new THREE.CanvasTexture(cv) }, uTime: shared.uTime, uA: { value: A }, uDots: { value: dots },
        uMode: { value: mode === 'beam' ? 1 : 0 }, uAxis: { value: axis }, uMotion: { value: motion }, uSign: { value: kind === 'sign' || kind === 'strip' ? 1 : 0 },
        uBand: { value: new THREE.Vector4(...band) }, uPlate: { value: new THREE.Vector4(...plate) }, uScreen: { value: new THREE.Vector4(...scr) }, uProj: { value: new THREE.Vector2(...proj) },
        uSky0: { value: v3(P.sky0) }, uSky1: { value: v3(P.sky1) }, uInk: { value: v3(P.ink) }, uAcc: { value: v3(P.acc) }, uRim: { value: v3(P.rim) },
        uHole: { value: v3(P.hole) }, uPanel: { value: v3(P.panel) }, uName: { value: v3(P.name) }, uBright: { value: palette === 'bright' ? 1 : 0 },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uWords; uniform float uTime, uA, uMode, uAxis, uMotion, uSign, uBright; uniform vec2 uDots, uProj;
        uniform vec4 uBand, uPlate, uScreen; uniform vec3 uSky0, uSky1, uInk, uAcc, uRim, uHole, uPanel, uName;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // scene k at q (0..1 in its frame, y up; fa its width over its height): (dark, lit)
        vec2 scene(float k, vec2 q, float fa, float t) {
          vec2 a = vec2(q.x * fa, q.y), sc = floor(a * 26.0);
          float star = step(0.972, h2(sc + k * 7.0)) * (0.55 + 0.45 * sin(t * 2.0 + h2(sc) * 30.0));
          float sil = 0.0, lit = 0.0;
          if (k < 0.5) {                       // the moon over the sea, its light on the water
            vec2 m = vec2(0.68 * fa, 0.66);
            float moon = step(length(a - m), 0.17) * step(0.15, length(a - m - vec2(0.075, 0.045)));
            float seaY = 0.3 + 0.018 * sin(a.x * 24.0 + t * 1.6), sea = step(q.y, seaY);
            float path = sea * step(abs(a.x - m.x + 0.03), 0.04 + 0.3 * (seaY - q.y)) * step(0.5, fract(q.y * 16.0 + t * 0.6 + sin(a.x * 9.0) * 0.3));
            sil = sea; lit = max(moon, path * 0.8) + star * (1.0 - sea) * (1.0 - moon) * 0.8;
          } else if (k < 1.5) {                // the city's towers, their windows
            float c = floor(a.x * 8.0), hb = 0.3 + 0.42 * h1(c * 3.1 + 1.7), bld = step(q.y, hb);
            vec2 wc = floor(vec2(a.x * 40.0, q.y * 40.0));
            float win = bld * step(0.5, mod(wc.y, 2.0)) * step(0.5, mod(wc.x, 2.0)) * step(q.y, hb - 0.05)
              * step(0.55, h2(wc + floor(t * 0.3 + h2(wc) * 5.0) * 0.37));
            float moon = step(length(a - vec2(0.2 * fa, 0.84)), 0.07);
            sil = bld; lit = win + max(moon, star * 0.7) * (1.0 - bld);
          } else if (k < 2.5) {                // the galaxy's train, going up into the stars
            float hill = step(q.y, 0.14 + 0.04 * sin(a.x * 5.0));
            float ry = 0.22 + 0.55 * q.x, dy = q.y - ry, x0 = (fract(t * 0.07) * 1.7 - 0.35) * fa;
            float train = step(x0 - 0.36 * fa, a.x) * step(a.x, x0) * step(abs(dy - 0.035), 0.035);
            float wins = train * step(0.45, fract(a.x * 14.0)) * step(abs(dy - 0.042), 0.014);
            float rail = step(abs(dy), 0.01) * step(0.5, fract(a.x * 20.0)) * (1.0 - train);
            float lamp = step(length(a - vec2(x0, ry + 0.04)), 0.028);
            sil = max(hill, train); lit = max(max(wins, lamp), rail * 0.6) + star * (1.0 - hill) * (1.0 - train);
          } else {                             // an island, its lighthouse; a star falling
            float water = step(q.y, 0.18), isl = step(q.y, 0.18 + 0.16 * exp(-pow((a.x - 0.42 * fa) * 5.0, 2.0)));
            float tower = step(abs(a.x - 0.5 * fa), 0.016) * step(q.y, 0.43);
            float lamp = step(length(a - vec2(0.5 * fa, 0.46)), 0.03) * step(0.45, fract(t * 0.5));
            float s = fract(t / 4.0);
            vec2 head = vec2(mix(0.92, 0.25, s) * fa, mix(0.94, 0.62, s)), d = normalize(vec2(0.67 * fa, 0.32));
            float along = dot(a - head, d), off = abs(dot(a - head, vec2(-d.y, d.x)));
            float fall = step(s, 0.45) * step(0.0, along) * step(along, 0.26) * step(off, 0.016 + along * 0.02) * (1.0 - along / 0.26);
            float glint = water * step(0.8, fract(a.x * 9.0 + q.y * 25.0 - t * 0.5)) * 0.35;
            sil = max(max(isl, tower), water * 0.85);
            lit = max(max(lamp, fall), glint) + star * (1.0 - isl) * (1.0 - water);
          }
          return vec2(sil, min(lit, 1.0));
        }
        vec3 shade(vec2 sl, float qy) {
          vec3 c = mix(uSky0, uSky1, qy);
          c = mix(c, uInk, sl.x);
          return mix(c, uAcc, sl.y);
        }
        void main() {
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.47, 0.3, length(f));
          dotM = mix(dotM, 0.45, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));
          vec2 p = vec2(cell.x * uA, cell.y);
          float px = 1.0 / uDots.y, t = uTime;
          vec3 col = uPanel;
          float title = 0.0;
          if (uMode < 0.5) {
            // the film: along it (u) and across it (v); its frames pitch apart, landscape
            float u = uAxis < 0.5 ? p.x : p.y, v = uAxis < 0.5 ? p.y : p.x;
            float L0 = uAxis < 0.5 ? uBand.x : uBand.z, L1 = uAxis < 0.5 ? uBand.y : uBand.w;
            float C0 = uAxis < 0.5 ? uBand.z : uBand.x, C1 = uAxis < 0.5 ? uBand.w : uBand.y;
            float S = C1 - C0, edge = 0.16 * S, fA = 0.64 * S, fL = uAxis < 0.5 ? fA * 1.36 : fA / 1.36, pitch = fL + 0.07 * S;
            // where it is: flowing, or pulled a frame at a time (four held 1.6 s, then its title held 4 s)
            float pos;
            if (uMotion < 0.5) pos = t * 0.22;
            else {
              float r = mod(t, 10.4), c = floor(t / 10.4);
              pos = c * 5.0 + (r < 6.4 ? floor(r / 1.6) + smoothstep(0.82, 1.0, fract(r / 1.6)) : 4.0 + smoothstep(0.93, 1.0, (r - 6.4) / 4.0));
              float m = floor((pos - 4.0) / 5.0 + 0.5) * 5.0 + 4.0;
              title = 1.0 - smoothstep(0.02, 0.18, abs(pos - m));
            }
            float vv = v - C0;
            if (u >= L0 && u <= L1 && vv >= 0.0 && vv <= S) {
              col = uRim;
              float sp = (u - (L0 + L1) * 0.5) / pitch + pos + 0.5, n = floor(sp), lf = (fract(sp) - 0.5) * pitch;
              // its holes, light through them
              float hs = (u - (L0 + L1) * 0.5) / (S * 0.21) + pos * pitch / (S * 0.21);
              float hole = step(abs(fract(hs) - 0.5), 0.26) * step(abs(min(vv, S - vv) - edge * 0.5), edge * 0.3);
              col = mix(col, uHole, hole);
              float ac = (vv - S * 0.5) / fA + 0.5, al = lf / fL + 0.5;
              if (abs(ac - 0.5) < 0.5 && abs(al - 0.5) < 0.5) {
                vec2 q = uAxis < 0.5 ? vec2(al, ac) : vec2(ac, al);
                float fa = uAxis < 0.5 ? fL / fA : fA / fL;
                float k = uMotion < 0.5 ? mod(n, 4.0) : mod(n, 5.0);
                float flick = uMotion > 0.5 ? 0.92 + 0.08 * h1(floor(t * 18.0)) : 1.0;
                // (its title card: dark, the night alone; its moon over it)
                col = (k > 3.5 ? mix(uSky0, uPanel, 0.6 - 0.6 * uBright) * (0.9 + 0.1 * h2(cell * 91.0)) : shade(scene(k, q, fa, t + n * 3.7), q.y)) * flick;
              }
            }
            // the canopy's: its name on a plate over the film, a line of light round it
            if (p.x > uPlate.x && p.x < uPlate.y && p.y > uPlate.z && p.y < uPlate.w) {
              float e = min(min(p.x - uPlate.x, uPlate.y - p.x), min(p.y - uPlate.z, uPlate.w - p.y));
              col = mix(uPanel, uHole * 0.8, step(e, px * 1.2));
            }
          } else {
            // the hall: its screen, the scenes melting one into the next dot by dot (7 s each)
            col = uPanel * (0.6 + 0.6 * p.y);
            vec2 q = (p - uScreen.xz) / (uScreen.yw - uScreen.xz);
            float fa = (uScreen.y - uScreen.x) / (uScreen.w - uScreen.z);
            float k0 = mod(floor(t / 7.0), 4.0), ph = fract(t / 7.0);
            if (abs(q.x - 0.5) < 0.5 && abs(q.y - 0.5) < 0.5) {
              float k = step(h2(cell * uDots + 3.1), smoothstep(0.72, 1.0, ph)) > 0.5 ? mod(k0 + 1.0, 4.0) : k0;
              col = shade(scene(k, q, fa, t), q.y) * (0.93 + 0.07 * h1(floor(t * 18.0)));
              float e = min(min(q.x, 1.0 - q.x) * fa, min(q.y, 1.0 - q.y));
              col = mix(col, uHole, step(e, 0.012) * 0.5);
            } else {
              // its beam, from the projector to the screen's near edge; dust drifting in the light
              float bt, lo, hi, xc;
              if (uAxis < 0.5) { bt = (p.x - uProj.x) / (uScreen.x - uProj.x); lo = mix(uProj.y, uScreen.z, bt); hi = mix(uProj.y, uScreen.w, bt); xc = p.y; }
              else { bt = (uProj.y - p.y) / (uProj.y - uScreen.w); lo = mix(uProj.x, uScreen.x, bt); hi = mix(uProj.x, uScreen.y, bt); xc = p.x; }
              if (bt > 0.0 && bt < 1.0 && xc > lo && xc < hi) {
                float e = min(xc - lo, hi - xc) / (hi - lo + 1e-3), ang = atan(p.y - uProj.y, p.x - uProj.x);
                float beam = smoothstep(0.0, 0.3, e) * (0.45 + 0.55 * (1.0 - bt)) * (0.75 + 0.25 * sin(ang * 70.0 + t * 0.8) * sin(ang * 23.0 - t * 0.5));
                vec2 dc = p * 9.0 + vec2(sin(t * 0.1) * 0.6, t * 0.12), id = floor(dc);
                vec2 mp = (id + 0.2 + 0.6 * vec2(h2(id), h2(id + 5.3)) + 0.15 * vec2(sin(t * 0.7 + h2(id) * 9.0), cos(t * 0.5 + h2(id) * 7.0))) / 9.0;
                vec2 mq = mp - vec2(sin(t * 0.1) * 0.6, t * 0.12) / 9.0;
                float dust = step(length(p - mq), px * 0.75) * step(0.45, h2(id + 1.7)) * (0.5 + 0.5 * sin(t * 2.3 + h2(id) * 20.0));
                col += mix(uAcc, vec3(1.5), 0.5) * (beam * 0.42 + dust * beam * 2.2);
              }
              col = mix(col, mix(uAcc, vec3(1.6), 0.6), step(length(p - uProj), px * 2.6));   // (its lens)
            }
          }
          // its words: round them in its own dark (or pale), so that they read
          vec4 wt = textureLod(uWords, cell, 0.0), wh = textureLod(uWords, cell, 3.0);
          float wa = max(wt.r, wt.g * title), ha = max(wh.r * (1.0 - uSign), wh.g * title);
          col = mix(col, uPanel, min(ha * 3.0, 1.0) * 0.8);
          col = mix(col, uName, wa * 0.95);
          // (bright: its dots' own colour between them, a little dimmer: dark on pale, it would fade to grey)
          col = uBright > 0.5 ? col * (0.86 + 0.16 * dotM) : col * dotM * 1.1 + uPanel * (1.0 - dotM) * 0.3;
          col = uHue * col;
          vec3 kk = vec3(0.57735), adj = uCaseAdj[uIndex];
          col = col * cos(adj.x) + cross(kk, col) * sin(adj.x) + kk * dot(kk, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.rotation.y = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    m.position.set(x, y, z);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // A label drawn on a canvas (canvasPlane), turned with a brand's colours as its cases are (广告橱窗): its material
  // one that turns what it shows, the canvas kept (and drawn again as before)
  function inBrandColours(m, brand) {
    const transparent = m.material.transparent;
    m.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: m.material.map }, uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: brand } },
      transparent, depthWrite: !transparent,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          vec3 c = uHue * t.rgb, k = vec3(0.57735), adj = uCaseAdj[uIndex];
          c = c * cos(adj.x) + cross(k, c) * sin(adj.x) + k * dot(k, c) * (1.0 - cos(adj.x));
          c = max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(c, t.a);
        }`,
    });
    return m;
  }
  // a flower of dots for the florist's signs: rings of dots round a yellow heart, at (cx, cy), r across
  function dotFlower(g, cx, cy, r, hex) {
    g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(cx, cy, r * 0.2, 0, 7); g.fill();
    for (const [k, n, rr] of [[1, 8, 0.55], [2, 14, 0.9]]) for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + k * 0.3;
      g.fillStyle = hex; g.beginPath(); g.arc(cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr, r * (k === 1 ? 0.15 : 0.12), 0, 7); g.fill();
    }
  }
  // 流萤花园's name sign (on the street, in the station): the night's blue; polka dots in its flowers' colours,
  // growing larger and nearer together from the name out to either end; a flower of dots either side of the name;
  // the name in the middle, its English under in its green; a thin rim of light round it; in its colours (广告橱窗)
  function floristSign(geom, w, h) {
    const B = BRANDS.find((b) => b.key === 'firefly-garden');
    return inBrandColours(canvasPlane(geom, w / h, false, (g, W, H) => {
      g.fillStyle = '#16263f'; g.fillRect(0, 0, W, H);
      const font = (px) => `600 ${px}px "PingFang SC", "Noto Sans SC", sans-serif`, name = [...B.name].join(String.fromCharCode(8202));
      g.font = font(H * 0.46); const tw = g.measureText(name).width, clear = tw / 2 + H * 0.95;
      const step = H / 7, rn = makeRandom(4242);
      for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
        const d = Math.abs(x - W / 2); if (d < clear) continue;
        const k = Math.min(1, (d - clear) / (H * 1.6)), r = step * (0.12 + 0.3 * k);
        g.fillStyle = rn.chance(0.3) ? '#2e4a6e' : FLOWERS[rn.int(0, FLOWERS.length - 1)];
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      for (const e of [-1, 1]) dotFlower(g, W / 2 + e * (tw / 2 + H * 0.5), H * 0.48, H * 0.3, '#ff9cc2');
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(H * 0.46);
      g.fillText(name, W / 2, H * 0.42);
      g.fillStyle = '#c8ff7a'; g.font = `600 ${H * 0.14}px "Helvetica Neue", Arial, sans-serif`;
      g.fillText(B.en.split('').join(String.fromCharCode(8202)), W / 2, H * 0.8);
      g.strokeStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = H * 0.035; g.strokeRect(H * 0.02, H * 0.02, W - H * 0.04, H - H * 0.04);
    }, 256), BRANDS.indexOf(B));
  }
  // 星环旅行's shop's upright: space as on its strip (a soft grey-blue, stars), and in from its top corner the
  // station's wheel, so near that only a corner of it shows, turning slowly (its rim in two greys, its portholes,
  // the inner ring, the spokes to the hub beyond the edge); its name small at the foot; in its colours as its strip
  function starBlade(geom, w, h) {
    const B = BRANDS.find((b) => b.key === 'star-ring'), Rn = makeRandom(4401);
    const Z = 512, wheel = document.createElement('canvas'); wheel.width = wheel.height = Z;
    const g = wheel.getContext('2d'), c = Z / 2, R0 = Z * 0.46;
    const ring = (r, wid, col) => { g.strokeStyle = col; g.lineWidth = wid; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); };
    g.strokeStyle = '#7a8594'; g.lineWidth = Z * 0.012;
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * R0 * 0.14, c + Math.sin(a) * R0 * 0.14); g.lineTo(c + Math.cos(a) * R0 * 0.94, c + Math.sin(a) * R0 * 0.94); g.stroke(); }
    ring(R0, Z * 0.075, '#a3acb8'); ring(R0 - Z * 0.022, Z * 0.022, '#8a94a2'); ring(R0 * 0.8, Z * 0.02, '#6c7684');
    g.fillStyle = '#a3acb8'; g.beginPath(); g.arc(c, c, R0 * 0.14, 0, 7); g.fill();
    for (const [rr, n, sz] of [[R0 + Z * 0.016, 120, 0.011], [R0 - Z * 0.016, 120, 0.011], [R0 * 0.8, 90, 0.008]]) for (let k = 0; k < n; k++) {
      if (Rn.chance(0.25)) continue;
      const a = k / n * Math.PI * 2, q = Z * sz;
      g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
      g.fillStyle = Rn.chance(0.8) ? '#d6ecf6' : '#8fe6f5'; g.fillRect(-q * 0.8, -q / 2, q * 1.6, q); g.restore();
    }
    const H = 256, Wd = Math.round(H * w / h), back = document.createElement('canvas'); back.width = Wd; back.height = H;
    const b = back.getContext('2d'), sky = b.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#273752'); sky.addColorStop(1, '#3e5374');
    b.fillStyle = sky; b.fillRect(0, 0, Wd, H);
    for (let k = 0; k < 40; k++) { b.fillStyle = `rgba(225, 238, 255, ${Rn.range(0.4, 0.9)})`; b.beginPath(); b.arc(Rn.range(0, Wd), Rn.range(0, H), Rn.range(0.6, 1.5), 0, 7); b.fill(); }
    const label = document.createElement('canvas'); label.width = Wd; label.height = H;
    const l = label.getContext('2d');
    l.shadowColor = 'rgba(8, 16, 34, 0.85)'; l.shadowBlur = H * 0.06; l.fillStyle = '#ffffff'; l.textBaseline = 'middle'; l.textAlign = 'left';
    l.font = `600 ${H * 0.14}px "PingFang SC", "Noto Sans SC", sans-serif`; l.fillText([...B.name].join(String.fromCharCode(8202)), H * 0.1, H * 0.86, Wd * 0.9);
    const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uWheel: { value: tex(wheel) }, uBack: { value: tex(back) }, uLabel: { value: tex(label) }, uA: { value: w / h },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uWheel, uBack, uLabel; uniform float uTime, uA; uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(uBack, vUv).rgb;
          // (the wheel's hub out past the top right corner, its rim crossing the board; turning slowly)
          vec2 p = vec2(vUv.x * uA, vUv.y) - vec2(uA + 0.12, 1.15);
          float a = -uTime * 0.12, R = 1.05 / 0.46;
          vec2 q = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a)) / R + 0.5;
          if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) { vec4 wv = texture2D(uWheel, vec2(q.x, 1.0 - q.y)); c = mix(c, wv.rgb, wv.a); }
          vec4 lb = texture2D(uLabel, vUv); c = mix(c, lb.rgb, lb.a);
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 0.67);   // (a third less saturated, as its strip)
          c = uHue * c * 1.1;
          c = c * cos(adj.x) + cross(k, c) * sin(adj.x) + k * dot(k, c) * (1.0 - cos(adj.x));
          c = max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 星环旅行's long strip, going by: a view of space drawn once as a long round (a soft grey-blue, stars far and
  // near, the edge of the Earth and the lower part of the station's wheel as its case has them, a shuttle with its
  // trail) scrolling smoothly by and round, all along it; its name, its English and its line (再见，暗淡蓝点)
  // written over it at the left, still; in the brand's colours (广告橱窗) as its cases are. seed: its own numbers
  function starTicker(geom, w, h, seed) {
    const B = BRANDS.find((b) => b.key === 'star-ring'), Rn = makeRandom(Math.floor(seed * 1e6) + 77);
    const H = 256, La = 9, Wl = Math.round(H * La), LW = 2.1;                 // (the round La heights long; the panel LW)
    const pano = document.createElement('canvas'); pano.width = Wl; pano.height = H;
    const g = pano.getContext('2d');
    // space: a soft, greyed blue, a little lighter toward its foot
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#273752'); sky.addColorStop(1, '#3e5374');
    g.fillStyle = sky; g.fillRect(0, 0, Wl, H);
    const wrap = (x, draw) => { for (const dx of [-Wl, 0, Wl]) { g.save(); g.translate(x + dx, 0); draw(); g.restore(); } };
    // stars, far and near
    for (let k = 0; k < La * 60; k++) {
      const x = Rn.range(0, Wl), y = Rn.range(0, H), r = Rn.chance(0.08) ? Rn.range(1.6, 2.4) : Rn.range(0.6, 1.2);
      g.fillStyle = Rn.chance(0.2) ? `rgba(255, 230, 190, ${Rn.range(0.5, 0.9)})` : `rgba(225, 238, 255, ${Rn.range(0.5, 0.95)})`;
      wrap(x, () => { g.beginPath(); g.arc(0, y, r, 0, 7); g.fill(); });
    }
    // the Earth, as in 星环旅行's case: only its edge, rising from the foot; its day side up and to the left, its
    // night to the right with its cities lit, lands near its top, its air glowing round it
    wrap(H * 2.1, () => {
      const er = H * 2.3, ey = H * 0.42 + er;                               // (its top at 0.42 of the height)
      for (const [k, a] of [[1.12, 0.06], [1.08, 0.1], [1.05, 0.16], [1.025, 0.26]]) {
        g.fillStyle = `rgba(110, 215, 255, ${a})`; g.beginPath(); g.arc(0, ey, er * k, 0, 7); g.fill();
      }
      const body = g.createLinearGradient(-er * 0.5, 0, er * 0.5, 0); body.addColorStop(0, '#5a8fd8'); body.addColorStop(0.55, '#3b6cb8'); body.addColorStop(1, '#1d3a72');
      g.fillStyle = body; g.beginPath(); g.arc(0, ey, er, 0, 7); g.fill();
      g.save(); g.beginPath(); g.arc(0, ey, er, 0, 7); g.clip();
      g.fillStyle = '#7fb0ea';
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + Rn.range(-0.5, 0.35), rr = er * Rn.range(0.86, 0.97), sz = H * Rn.range(0.08, 0.2);
        g.beginPath(); g.ellipse(Math.cos(a) * rr, ey + Math.sin(a) * rr, sz * 1.5, sz * 0.45, a + Math.PI / 2, 0, 7); g.fill();
      }
      g.fillStyle = '#ffd98f';
      for (let k = 0; k < 60; k++) {
        const a = -Math.PI / 2 + Rn.range(0.12, 0.7), rr = er * Rn.range(0.86, 0.995);
        g.fillRect(Math.cos(a) * rr, ey + Math.sin(a) * rr, 2, 2);
      }
      g.restore();
    });
    // the station's wheel, as in its case: so near that only the lower part of its rim shows, coming down from
    // above; the rim in two greys, its portholes pale in two rows (a few cyan: all of it in the one cool range), the
    // inner ring, the spokes going up
    wrap(H * 6.3, () => {
      const R0 = H * 2.2, cy = -R0 + H * 0.62;                               // (its rim's foot at 0.62 of the height)
      const ring = (r, wid, col) => { g.strokeStyle = col; g.lineWidth = wid; g.beginPath(); g.arc(0, cy, r, 0, 7); g.stroke(); };
      g.strokeStyle = '#7a8594'; g.lineWidth = H * 0.025;
      for (let k = 0; k < 12; k++) { const a = Math.PI / 2 + (k / 12 - 0.5) * 1.2; g.beginPath(); g.moveTo(Math.cos(a) * R0 * 0.2, cy + Math.sin(a) * R0 * 0.2); g.lineTo(Math.cos(a) * (R0 - H * 0.12), cy + Math.sin(a) * (R0 - H * 0.12)); g.stroke(); }
      ring(R0, H * 0.17, '#a3acb8');
      ring(R0 - H * 0.05, H * 0.05, '#8a94a2');
      ring(R0 - H * 0.2, H * 0.045, '#6c7684');
      for (const [rr, n, sz] of [[R0 + H * 0.035, 160, 0.03], [R0 - H * 0.035, 160, 0.03], [R0 - H * 0.2, 120, 0.02]]) {
        for (let k = 0; k < n; k++) {
          if (Rn.chance(0.25)) continue;
          const a = Math.PI / 2 + (k / n - 0.5) * 1.6, q = H * sz;
          g.save(); g.translate(Math.cos(a) * rr, cy + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
          g.fillStyle = Rn.chance(0.8) ? '#d6ecf6' : '#8fe6f5'; g.fillRect(-q * 0.8, -q / 2, q * 1.6, q);
          g.restore();
        }
      }
    });
    // a shuttle on its way to the station, its trail behind (to the right: it goes the way the view goes)
    wrap(H * 8.2, () => {
      const y = H * 0.78, tr = g.createLinearGradient(0, 0, H * 0.9, 0); tr.addColorStop(0, 'rgba(140, 225, 255, 0.85)'); tr.addColorStop(1, 'rgba(140, 225, 255, 0)');
      g.fillStyle = tr; g.beginPath(); g.moveTo(H * 0.08, y - H * 0.018); g.lineTo(H * 0.9, y - H * 0.004); g.lineTo(H * 0.9, y + H * 0.004); g.lineTo(H * 0.08, y + H * 0.018); g.fill();
      g.fillStyle = '#eef3f8'; g.beginPath(); g.moveTo(-H * 0.1, y); g.lineTo(H * 0.05, y - H * 0.04); g.lineTo(H * 0.09, y); g.lineTo(H * 0.05, y + H * 0.04); g.closePath(); g.fill();
    });
    // its words at its left, over the view
    const PW = Math.round(H * LW), panel = document.createElement('canvas'); panel.width = PW; panel.height = H;
    const q = panel.getContext('2d');
    q.shadowColor = 'rgba(8, 16, 34, 0.85)'; q.shadowBlur = H * 0.1;
    q.fillStyle = '#ffffff'; q.textBaseline = 'middle'; q.textAlign = 'left';
    q.font = `700 ${H * 0.3}px "PingFang SC", "Noto Sans SC", sans-serif`; q.fillText(B.name, H * 0.22, H * 0.42, PW - H * 0.3);
    q.fillStyle = '#bfefff'; q.font = `600 ${H * 0.11}px "Helvetica Neue", Arial, sans-serif`; q.fillText(B.en.split('').join(String.fromCharCode(8202)), H * 0.24, H * 0.66, PW - H * 0.3);
    q.fillStyle = '#d6e4f5'; q.font = `500 ${H * 0.095}px "PingFang SC", "Noto Sans SC", sans-serif`; q.fillText(B.tagline, H * 0.24, H * 0.84, PW - H * 0.3);
    const tex = (cv, rep) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = rep ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.anisotropy = 4; return t; };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uPano: { value: tex(pano, true) }, uPanel: { value: tex(panel, false) }, uA: { value: w / h }, uLa: { value: La }, uLW: { value: LW }, uSpeed: { value: 0.32 },
        uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: BRANDS.indexOf(B) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uPano, uPanel; uniform float uTime, uA, uLa, uLW, uSpeed; uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          float X = vUv.x * uA;                                    // (along it, in its heights)
          vec3 c = texture2D(uPano, vec2(fract((X + uTime * uSpeed) / uLa), vUv.y)).rgb;
          if (X < uLW) { vec4 p = texture2D(uPanel, vec2(X / uLW, vUv.y)); c = mix(c, p.rgb, p.a); }   // (the words over it)
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 0.67);   // (all of it a third less saturated)
          c = uHue * c * 1.1;
          c = c * cos(adj.x) + cross(k, c) * sin(adj.x) + k * dot(k, c) * (1.0 - cos(adj.x));
          c = max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // The metro's own signs, on fine LED dots (as the city's other electronic signs, rainWindow, umbrellaLED): dark,
  // light words on them, the line's colour for its badge and its line, everything measured and set at its own
  // width (never drawn out). kind: 'way' (the badge, the line and the station, an arrow: the way to it) or 'map'
  // (the line and its stops, this one marked, pulsing, a light running along the line the way it goes). Its words
  // at their size, a little smaller where they would not fit
  const STOPS = [['希洛新城', 'HILO NEW TOWN'], ['美术馆', 'ART MUSEUM'], ['星港南', 'STAR PORT SOUTH'], ['星港北', 'STAR PORT NORTH'], ['星环航站', 'STAR RING AIRPORT']];
  const HERE = 2;
  // 春晴便利店's sign, over its shop and along its machines' heads: white, its name in a deep green, 24H on a tag of
  // spring green at the end, a fine line along its top, three lines along its foot (spring green, sun yellow, sky)
  function springSign(geom, w, h) {
    return canvasPlane(geom, w / h, false, (g, W, H) => {
      const GREEN = '#5fbf72', SUN = '#ffcf4d', SKY = '#63bde3', INK = '#23463a';
      g.fillStyle = '#f6f8f6'; g.fillRect(0, 0, W, H);
      g.fillStyle = GREEN; g.fillRect(0, H * 0.06, W, Math.max(1, H * 0.025));
      [GREEN, SUN, SKY].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, H * (0.8 + i * 0.065), W, H * 0.05); });
      const tag = H * 0.42, pad = H * 0.22, tw = tag * 1.6;
      g.fillStyle = GREEN; g.beginPath(); g.roundRect(W - pad - tw, H * 0.43 - tag / 2, tw, tag, tag * 0.25); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${tag * 0.62}px "PingFang SC", "Noto Sans SC", sans-serif`;
      g.fillText('24H', W - pad - tw / 2, H * 0.43 + tag * 0.04);
      g.fillStyle = INK; g.font = `700 ${H * 0.44}px "PingFang SC", "Noto Sans SC", sans-serif`;
      const room = W - pad * 3 - tw;
      g.fillText('春晴便利店', pad + room / 2, H * 0.45, room);
    }, 256);
  }
  // 春晴便利店's ad: rain, then the sky clearing (a round of 16 s). First the rain in square pixels, in the city's
  // colours (cyan on the night's blue, as uHue turns them): short streaks falling, a brighter pixel at the foot of
  // each; it thins and fades, the ground going white, and the sign's three lines (spring green, sun yellow, sky) open
  // out from the lower left corner into a rainbow; behind, grey, what it sells in outline (Noto Emoji's glyphs) all
  // over; its name dark and 24H by it (only once it has cleared); a while; then the dark and the rain again
  function springAd(geom, w, h) {
    const W = 1024, H = Math.round(W * h / w), font = (wt, px) => `${wt} ${px}px "PingFang SC", "Noto Sans SC", sans-serif`;
    const canvas = (draw) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      draw(cv.getContext('2d'));
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const cs = H * 0.2, nx = W * 0.64, ny = H * 0.45, tag = cs * 0.8, tw = tag * 1.7;
    const name = canvas((g) => {                         // its name, white (a mask: coloured in the shader)
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(800, cs);
      g.fillText('春晴便利店', nx, ny, W * 0.6);
    });
    const tagT = canvas((g) => {                         // 24H, on its tag of spring green
      g.fillStyle = '#5fbf72'; g.beginPath(); g.roundRect(nx - tw / 2, ny + cs * 0.85, tw, tag, tag * 0.25); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(800, tag * 0.62);
      g.fillText('24H', nx, ny + cs * 0.85 + tag * 0.54);
    });
    const goods = canvas((g) => {                        // what it sells, in outline, in rows offset by half
      const step = H * 0.2, size = step * 0.62;
      for (let r = 0, k = 0; r * step < H + step; r++) {
        for (let c = 0; c * step < W + step; c++, k++) {
          drawIcon(g, `noto/${SPRING_GOODS[(k * 7 + r * 3) % SPRING_GOODS.length]}`, c * step + (r % 2 ? step / 2 : 0), r * step + step / 2, size, '#ffffff');
        }
      }
    });
    const m = new THREE.Mesh(geom, new THREE.ShaderMaterial({
      uniforms: { uName: { value: name }, uTag: { value: tagT }, uGoods: { value: goods }, uTime: shared.uTime, uAspect: { value: w / h },
        uC0: { value: new THREE.Color('#5fbf72') }, uC1: { value: new THREE.Color('#ffcf4d') }, uC2: { value: new THREE.Color('#63bde3') },
        uInk: { value: new THREE.Color('#1d3b30') }, uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uSlot: { value: OTHER_CASES.find((o) => o.key === 'spring-mart').slot } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uName, uTag, uGoods; uniform float uTime, uAspect; uniform vec3 uC0, uC1, uC2, uInk; uniform mat3 uHue;
        uniform vec3 uCaseAdj[24]; uniform int uSlot; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 q = vec2(vUv.x * uAspect, vUv.y);
          float t = mod(uTime, 16.0);
          float clear = smoothstep(4.5, 7.0, t) * (1.0 - smoothstep(14.0, 15.6, t));   // (the dark giving way to white, and back)
          // the rain in pixels: in each column now and then a streak of a few falling, its foot the brightest
          float rows = 40.0;
          vec2 grid = vec2(floor(rows * uAspect), rows), cell = floor(vUv * grid), f = fract(vUv * grid);
          float px = step(0.1, f.x) * step(f.x, 0.9) * step(0.1, f.y) * step(f.y, 0.9), r = rows - 1.0 - cell.y, lit = 0.0;
          for (int k = 0; k < 2; k++) {
            vec2 id = vec2(cell.x, float(k));
            float hk = hash(id), len = floor(mix(3.0, 6.0, hash(id + 5.3))), span = rows + len + mix(6.0, 30.0, hash(id + 2.1));
            float foot = mod(uTime * mix(9.0, 16.0, hash(id + 8.7)) + hk * span, span);
            float back = foot - r;
            if (back >= 0.0 && back < len) lit = max(lit, mix(1.0, 0.25, back / len));
          }
          vec3 rain = uHue * mix(vec3(0.01, 0.03, 0.05), vec3(0.35, 0.95, 1.15), lit * px);
          float nm = texture2D(uName, vUv).a;
          // the clear: white, the goods faint, the rainbow swept round from the ground up, its name in its ink, 24H
          vec3 day = vec3(0.95, 0.96, 0.95);
          day = mix(day, vec3(0.62, 0.65, 0.66), texture2D(uGoods, vUv).a * 0.85);
          float d = length(q), a = atan(q.y, q.x) / 1.5708;
          float open = smoothstep(6.0, 9.0, t) * (1.0 - smoothstep(14.0, 15.4, t));
          float R = 0.95, bw = 0.075;
          vec3 band = d > R ? uC0 : d > R - bw ? uC1 : uC2;
          day = mix(day, band, step(R - 2.0 * bw, d) * step(d, R + bw) * step(a, open * 1.02));
          day = mix(day, uInk, nm);
          vec4 tg = texture2D(uTag, vUv);
          day = mix(day, tg.rgb, tg.a * smoothstep(8.0, 9.0, t));
          vec3 col = mix(rain, day * 0.8, clear);                                   // (the white not so bright that the glow over it washes its name out)
          // (turned as its brand's colours are, tuning.json caseColors)
          vec3 k = vec3(0.57735), adj = uCaseAdj[uSlot];
          col = col * cos(adj.x) + cross(k, col) * sin(adj.x) + k * dot(k, col) * (1.0 - cos(adj.x));
          col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    m.layers.set(LAYER.GLOW);
    return m;
  }
  function metroBoard(geom, w, h, kind, { down = false } = {}) {
    const INK = '#e6f4fb', SOFT = '#7d9db0', BG = '#03101a', LINE = METRO.color, PAST = '#2c4556', DARK = '#03101a';
    let run = null;                                   // (the map's line: where the light runs, in the canvas)
    const font = (wt, px) => `${wt} ${px}px "PingFang SC", "Noto Sans SC", sans-serif`;
    const fit = (g, text, wt, px, room) => { g.font = font(wt, px); const tw = g.measureText(text).width; if (tw > room) g.font = font(wt, px * room / tw); };
    const badge = (g, x, y, b) => {                   // the line's badge: a disc of its colour, its number
      g.fillStyle = LINE; g.beginPath(); g.arc(x + b / 2, y + b / 2, b / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(800, b * 0.72);
      g.fillText(METRO.line, x + b / 2, y + b * 0.54);
    };
    const draw = (g, W, H) => {
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      if (kind === 'way') {
        const band = H * 0.06, pad = H * 0.17, b = H * 0.6, cy = (H - band) / 2;
        g.fillStyle = LINE; g.fillRect(0, H - band, W, band);                     // the line's colour along its foot
        badge(g, pad, cy - b / 2, b);
        // the arrow, in its light alone, at the other end: up the way on, or (down: the face seen coming out) down
        const ax = W - pad - b;
        g.save(); g.translate(ax + b / 2, cy); if (down) g.scale(1, -1);
        g.fillStyle = INK; g.beginPath();
        const t = -b * 0.46, u = b * 0.42;
        g.moveTo(0, t); g.lineTo(u, t + u); g.lineTo(u * 0.36, t + u); g.lineTo(u * 0.36, b * 0.46);
        g.lineTo(-u * 0.36, b * 0.46); g.lineTo(-u * 0.36, t + u); g.lineTo(-u, t + u); g.closePath(); g.fill();
        g.restore();
        // its words between, left-aligned after the badge, the two lines centred on the board
        const x0 = pad + b + H * 0.16, room = ax - H * 0.16 - x0;
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = INK;
        fit(g, `${METRO.line}号线 · 星港南`, 700, H * 0.3, room); g.fillText(`${METRO.line}号线 · 星港南`, x0, cy + H * 0.04);
        g.fillStyle = SOFT; fit(g, METRO.en, 600, H * 0.12, room); g.fillText(METRO.en, x0, cy + H * 0.24);
        return;
      }
      // the map: a header (the badge, the line; the way it runs), the line across, its stops, this one marked
      const pad = H * 0.12, hb = H * 0.2, top = pad;
      badge(g, pad, top, hb);
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = INK;
      g.font = font(700, hb * 0.6); g.fillText(`${METRO.line}号线`, pad + hb * 1.3, top + hb * 0.52);
      const lw = g.measureText(`${METRO.line}号线`).width;
      g.fillStyle = SOFT; g.font = font(600, hb * 0.42); g.fillText(`METRO LINE ${METRO.line}`, pad + hb * 1.3 + lw + hb * 0.4, top + hb * 0.55);
      g.textAlign = 'right'; g.fillStyle = INK; g.font = font(600, hb * 0.48);
      g.fillText(`开往 ${STOPS[STOPS.length - 1][0]}  →`, W - pad, top + hb * 0.52);
      const ly = H * 0.56, x0 = pad + H * 0.25, x1 = W - pad - H * 0.25, n = STOPS.length, at = (i) => x0 + (x1 - x0) * i / (n - 1);
      g.lineCap = 'round'; g.lineWidth = H * 0.05;
      g.strokeStyle = PAST; g.beginPath(); g.moveTo(x0, ly); g.lineTo(at(HERE), ly); g.stroke();      // behind
      g.strokeStyle = LINE; g.beginPath(); g.moveTo(at(HERE), ly); g.lineTo(x1, ly); g.stroke();        // ahead
      const gap = (x1 - x0) / (n - 1);
      run = [at(HERE) / W, x1 / W, 1 - ly / H, H * 0.065 / H];
      STOPS.forEach((st, i) => {
        const x = at(i), here = i === HERE, r = here ? H * 0.065 : st ? H * 0.04 : H * 0.028;
        g.fillStyle = here ? INK : DARK; g.strokeStyle = i < HERE ? PAST : LINE; g.lineWidth = H * 0.018;
        g.beginPath(); g.arc(x, ly, r, 0, Math.PI * 2); g.fill(); g.stroke();
        if (!st) return;
        g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = i < HERE ? SOFT : INK;
        fit(g, st[0], here ? 800 : 600, H * (here ? 0.13 : 0.1), gap * 1.9); g.fillText(st[0], x, ly + H * 0.22);
        g.fillStyle = SOFT; fit(g, st[1], 600, H * 0.065, gap * 1.9); g.fillText(st[1], x, ly + H * 0.31);
        if (here) {                                                                 // 本站: a tag of ink over it
          g.font = font(700, H * 0.075); const tw = g.measureText('本站 YOU ARE HERE').width + H * 0.08;
          g.fillStyle = INK; g.beginPath(); g.roundRect(x - tw / 2, ly - H * 0.2, tw, H * 0.1, H * 0.03); g.fill();
          g.fillStyle = DARK; g.textBaseline = 'middle'; g.fillText('本站 YOU ARE HERE', x, ly - H * 0.148);
        }
      });
    };
    const Hc = 512, Wc = Math.round(Hc * w / h), cv = document.createElement('canvas');
    cv.width = Wc; cv.height = Hc;
    draw(cv.getContext('2d'), Wc, Hc);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(geom, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uTime: shared.uTime, uDots: { value: new THREE.Vector2(w, h).multiplyScalar(Math.max(110, h * 70) / h).floor() },
        uRun: { value: new THREE.Vector4(...(run || [0, 0, -1, 0])) }, uAspect: { value: w / h } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uTime, uAspect; uniform vec2 uDots; uniform vec4 uRun;
        varying vec2 vUv;
        void main() {
          vec2 cell = (floor(vUv * uDots) + 0.5) / uDots, f = fract(vUv * uDots) - 0.5;
          float dotM = smoothstep(0.5, 0.3, length(f));
          dotM = mix(dotM, 0.55, clamp(max(fwidth(vUv.x * uDots.x), fwidth(vUv.y * uDots.y)) * 1.6 - 0.4, 0.0, 1.0));
          vec3 col = textureLod(uMap, cell, 0.0).rgb * 1.35;
          if (uRun.z > 0.0) {
            // a light running along the line ahead, from here to its end, over and over; this stop pulsing
            vec2 q = vec2(cell.x * uAspect, cell.y), here = vec2(uRun.x * uAspect, uRun.z);
            float head = mix(uRun.x, uRun.y, fract(uTime * 0.22)) * uAspect;
            float onLine = smoothstep(uRun.w * 0.6, 0.0, abs(q.y - uRun.z)) * step(here.x, q.x) * step(q.x, uRun.y * uAspect);
            float dh = (head - q.x) / 0.05;
            col += vec3(0.6, 1.4, 1.6) * onLine * exp(-dh * dh) * step(q.x, head + 0.08);
            col += vec3(0.5, 0.9, 1.0) * smoothstep(uRun.w * 1.6, uRun.w * 0.8, length(q - here)) * (0.5 + 0.5 * sin(uTime * 3.0));
          }
          gl_FragColor = vec4(col * dotM + vec3(0.002, 0.006, 0.01) * (1.0 - dotM), 1.0);
        }`,
    }));
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // 浮岛咖啡's signs, on a screen of glass as its menu is, kind: 'name' (its cup, the coffee in it as the menu's,
  // then its name, its English under in the milk's paler light, at their own width, never drawn out), 'column'
  // (three of the menu's cups one over another: the upright by its door), 'row' (its cup and name, then all the
  // menu's cups, one size, evenly apart, over and over, going by: a strip that once scrolled words). back: where
  // the board behind it goes (props, or the station's ip), the same as the wall its menus hang on (CAFE_WALL); with
  // none, the glass smoked instead
  const CAFE_WALL = 0.2;
  function cafeSign(geom, w, h, kind = 'name', back = null) {
    const B = BRANDS.find((b) => b.key === 'float-cafe'), density = kind === 'column' ? 44 : THREE.MathUtils.clamp(34 / h, 9, 40);
    if (back) {
      const n = new THREE.Vector3().fromBufferAttribute(geom.attributes.normal, 0);
      back(geom.clone().translate(-n.x * 0.012, -n.y * 0.012, -n.z * 0.012), CAFE_WALL);
    }
    const font = (wt, px) => `${wt} ${px}px "PingFang SC", "Noto Sans SC", sans-serif`;
    // its cup and name, from x0 (left), Hc high; returns how wide (measure only, without g drawing)
    const named = (g, x0, Hc, draw = true) => {
      const nh = Hc * 0.42, eh = Hc * 0.16, ic = Hc * 0.86, gap = Hc * 0.12;
      g.font = font(600, nh); const tw = g.measureText(B.name).width;
      g.font = font(600, eh); const ew = g.measureText(B.en).width;
      const gw = ic * 0.7 + gap + Math.max(tw, ew);
      if (!draw) return gw;
      coffeeCup(g, x0 + ic * 0.33, Hc * 0.5, ic, [[140, 0.5]]);
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = font(600, nh); g.fillText(B.name, x0 + ic * 0.7 + gap, Hc * 0.4);
      g.fillStyle = 'rgb(200,200,200)'; g.font = font(600, eh); g.fillText(B.en, x0 + ic * 0.7 + gap + (tw - ew) / 2, Hc * 0.76);
      return gw;
    };
    // (a row's round: its name and margins, and six slots of a cup and a bit, in pixels)
    let loop = 0;
    if (kind === 'row') {
      const Hc = Math.round(h * density) * 4, g = document.createElement('canvas').getContext('2d');
      loop = Math.round((named(g, 0, Hc, false) + Hc * 0.6 + 6 * Hc * 0.95) / 4);
    }
    return ledPicture(geom, w, h, (g, Wc, Hc) => {
      if (kind === 'column') {
        const cs = Math.min(Wc * 0.95, Hc / 3.1);
        [0, 3, 5].forEach((k, i) => coffeeCup(g, Wc / 2 + cs * 0.04, Hc / 2 + (i - 1) * Hc / 3.15, cs, COFFEES[k]));
        return;
      }
      if (kind === 'row') {
        // (one round, drawn once and shown over and over as it goes by (ledPicture loop): the name with a margin
        // either side, then the six cups, one size, each in a slot of the same width)
        const pad = Hc * 0.3, block = named(g, 0, Hc, false) + 2 * pad, step = (Wc - block) / 6, cs = Math.min(Hc * 0.8, step * 1.15);
        named(g, pad, Hc);
        COFFEES.forEach((L, i) => coffeeCup(g, block + step * (i + 0.5), Hc * 0.5, cs, L));
        return;
      }
      named(g, (Wc - named(g, 0, Hc, false)) / 2, Hc);
    }, { density, screen: true, glass: true, smoked: !back, scroll: kind === 'row' ? Math.max(8, Math.round(density * h * 0.5)) : 0, loop });
  }
  // a cup of coffee for the menu at (cx, cy), size across: Google's cup (material/coffee) its edge, the inside of
  // its body filled from the foot with layers [grey, part of its height]
  function coffeeCup(g, cx, cy, size, layers) {
    const name = 'material/coffee';
    if (!icons?.[name]?.length) return;
    drawIcon(g, name, cx, cy, size, 'rgb(60,60,60)');
    const outer = icons[name].reduce((a, b) => { const ba = b.getPoints(4), aa = a.getPoints(4), area = (p) => Math.abs(THREE.ShapeUtils.area(p)); return area(ba) > area(aa) ? b : a; });
    const k = size / 512, bx = 235.7, by = 224;           // (where its body's middle is, in the icon's 512)
    g.save();
    g.translate(cx - 256 * k, cy - 256 * k); g.scale(k, k);
    g.save(); g.translate(bx, by); g.scale(0.84, 0.86); g.translate(-bx, -by);
    g.beginPath(); outer.getPoints(8).forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath();
    g.restore();
    g.clip(); g.beginPath(); g.rect(0, 0, 368, 512); g.clip();                  // (not its handle)
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    let y = 360.5; const H = 274;
    for (const [v, f] of layers) { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y - f * H, 512, f * H); y -= f * H; }
    g.restore();
  }
  // the ice cream of 白云乡's ad (its cone, three scoops, the face on the top one, a cherry) for an LED panel:
  // white, its parts parted by dark lines; a border of round dots, a step dimmer (the screens' cyan), unless not
  function drawGelatoLED(g, W, H, border = true) {
    const u = Math.min(W, H / 2.1);
    g.fillStyle = '#808080';
    const step = u * 0.09, r = u * 0.028;
    if (border) {
      for (let x = step / 2 + u * 0.03; x < W - u * 0.03; x += step) for (const y of [u * 0.05, H - u * 0.05]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      for (let y = step / 2 + u * 0.08; y < H - u * 0.08; y += step) for (const x of [u * 0.05, W - u * 0.05]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }
    // (as wide as the panel lets it be; in a tall one its cone drawn out longer, the whole in the middle)
    const cx = W / 2, S = Math.min(W * 1.75, H * 0.6), ch = S * 0.48 * THREE.MathUtils.clamp(H / W / 3.2, 1, 1.7), cw = S * 0.19;
    const base = H / 2 + (ch + S * 0.78) / 2, ctop = base - ch;
    // the cone, its waffle drawn dark into it
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, base); g.lineTo(cx + cw, ctop); g.lineTo(cx - cw, ctop); g.closePath(); g.fill();
    g.save(); g.clip(); g.strokeStyle = '#000'; g.lineWidth = S * 0.018;
    for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(cx + k * S * 0.08 - S, ctop - S * 0.5); g.lineTo(cx + k * S * 0.08 + S, ctop + S * 1.5); g.stroke(); g.beginPath(); g.moveTo(cx + k * S * 0.08 + S, ctop - S * 0.5); g.lineTo(cx + k * S * 0.08 - S, ctop + S * 1.5); g.stroke(); }
    g.restore();
    // the scoops, bottom to top, each with a drip round its foot and a dark line under it
    let sy = ctop;
    [[S * 0.21, 0.85], [S * 0.19, 0.95], [S * 0.17, 1]].forEach(([rr, tone], i) => {
      const cy = sy - rr * 0.22;
      const path = () => {
        g.beginPath(); g.arc(cx, cy, rr, Math.PI, 0);
        for (let k = 0; k <= 12; k++) { const t = k / 12; g.lineTo(cx + rr - t * 2 * rr, cy + rr * 0.16 + rr * 0.14 * Math.abs(Math.sin(t * Math.PI * 3))); }
        g.closePath();
      };
      g.strokeStyle = '#000'; g.lineWidth = S * 0.024; path(); g.stroke();
      g.fillStyle = `rgb(${Math.round(255 * tone)},${Math.round(255 * tone)},${Math.round(255 * tone)})`; path(); g.fill();
      if (i === 2) {
        g.fillStyle = '#000';
        for (const e of [-1, 1]) { g.beginPath(); g.arc(cx + e * rr * 0.36, cy - rr * 0.12, rr * 0.1, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.moveTo(cx - rr * 0.1, cy - rr * 0.02); g.lineTo(cx + rr * 0.1, cy - rr * 0.02); g.lineTo(cx, cy + rr * 0.08); g.closePath(); g.fill();
        g.fillStyle = '#888';
        for (const e of [-1, 1]) { g.beginPath(); g.ellipse(cx + e * rr * 0.58, cy + rr * 0.08, rr * 0.14, rr * 0.09, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = S * 0.03;
        g.beginPath(); g.arc(cx + rr * 0.2, cy - rr * 1.05, rr * 0.17, 0, Math.PI * 2); g.stroke(); g.fill();
      }
      sy = cy - rr * 0.75;
    });
  }

  // A picture in 白云乡's case as dots of light alone on its night (w x h, the geometry placed; NX dots across),
  // nothing between them: drawn grey on black (draw(ctx, width, height)), white where it is, a blush of its pink
  // where grey; how it comes in the round (P): reveal 'rise', lit row by row from its foot, a brighter line going
  // up (from at); 'chars', its characters one after another (band: [where the first begins, how wide they are all
  // together, as shares of its width; how many]), each flashing as it comes; 'none', there; bob: up and down that
  // many dots (phase); hop: hopping that many dots, over and over (phase its moment); gone dot by dot at the round's
  // end; turned with the brand's colours (brand)
  function dotPicture(geom, w, h, NX, draw, { P = 6.4, brand = -1, reveal = 'none', at = 0, band = [0, 1, 1], bob = 0, hop = 0, phase = 0, blush = true } = {}) {   // (blush false: all white)
    const NY = Math.max(1, Math.round(NX * h / w)), cv = document.createElement('canvas');
    cv.width = NX * 4; cv.height = NY * 4;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    draw(g, cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    const col = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uN: { value: new THREE.Vector2(NX, NY) }, uTime: shared.uTime, uP: { value: P },
        uMode: { value: { rise: 1, chars: 2 }[reveal] || 0 }, uAt: { value: at }, uBand: { value: new THREE.Vector3(...band) }, uBob: { value: bob }, uHop: { value: hop }, uPhase: { value: phase },
        uWhite: { value: col('#ffffff', 1.5) }, uPink: { value: blush ? col('#ff9cbf', 1.2) : col('#ffffff', 1.5) }, uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: brand } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uMap; uniform vec2 uN; uniform float uTime, uP, uAt, uBob, uHop, uPhase; uniform int uMode; uniform vec3 uBand, uWhite, uPink;
        uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex; varying vec2 vUv;
        void main() {
          vec2 led = vUv * uN, c = floor(led);
          float sh = uBob > 0.0 ? floor(sin(uTime * 1.6 + uPhase) * uBob + 0.5) : 0.0;          // (bobbing a whole dot)
          if (uHop > 0.0) { float u = fract((uTime - uPhase) / 0.55); sh = floor(uHop * 4.0 * u * (1.0 - u) + 0.5); }   // (or hopping)
          float v = texture2D(uMap, (vec2(c.x, c.y - sh) + 0.5) / uN).r;
          if (v < 0.12) discard;
          float t = mod(uTime, uP), flash = 0.0;
          if (uMode == 1) {                                  // (lit from its foot up over a second and a bit)
            float front = (t - uAt - 0.2) / 1.2 * (uN.y + 3.0);
            if (c.y > front) discard;
            flash = 1.0 - smoothstep(0.0, 3.0, front - c.y);
          } else if (uMode == 2) {                           // (a character after another)
            float i = clamp(floor(((c.x + 0.5) / uN.x - uBand.x) / uBand.y * uBand.z), 0.0, uBand.z - 1.0), lt = t - uAt - i * 0.11;
            if (lt < 0.0) discard;
            flash = 1.0 - smoothstep(0.0, 0.35, lt);
          }
          float away = smoothstep(uP - 0.6, uP - 0.15, t), hash = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5);
          if (hash < away) discard;                          // (and out again, dot by dot in no order, at the round's end)
          float aa = 1.0 - smoothstep(0.25, 0.6, max(fwidth(led.x), fwidth(led.y)));
          if (aa > 0.5 && length(fract(led) - 0.5) > 0.44) discard;
          float shimmer = 0.9 + 0.1 * sin(uTime * 2.0 - (c.x + c.y) * 0.3);
          vec3 cc = mix(uPink, uWhite, smoothstep(0.6, 0.92, v)) * shimmer;
          cc = mix(cc, uWhite * 1.4, flash);
          vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
          cc = uHue * cc;
          cc = cc * cos(adj.x) + cross(k, cc) * sin(adj.x) + k * dot(k, cc) * (1.0 - cos(adj.x));
          cc = max(mix(vec3(dot(cc, vec3(0.299, 0.587, 0.114))), cc, adj.y), 0.0) * adj.z;
          gl_FragColor = vec4(cc, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geom, mat);
    m.layers.set(LAYER.GLOW);
    return m;
  }
  // A plane with a picture drawn on a canvas (draw(ctx, width, height)): aspect its width over its height; the
  // geometry already placed; transparent where nothing is drawn, if asked; H the canvas's height in pixels
  function canvasPlane(geom, aspect, transparent, draw, H = 256) {
    const cv = document.createElement('canvas'), Wd = Math.max(16, Math.round(H * aspect));
    cv.width = Wd; cv.height = H;
    const g = cv.getContext('2d');
    draw(g, Wd, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent, depthWrite: !transparent }));
    m.layers.set(LAYER.GLOW);
    m.userData.redraw = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, Wd, H); draw(g, Wd, H); tex.needsUpdate = true; };   // (drawn again: a font changed)
    return m;
  }
  // The temples of a book of the week's case (and of its board in the shop), in four layers going back: each
  // { yb: its ground's height, col: its colour, mist: its ground's colour at its foot, polys: its roofs, towers and
  // trees as outlines }, in heights of the case (1 its height, x across from -wN/2 to wN/2, y up); the second
  // row also cut out over the display in the shop. Far behind
  // little pagodas and halls, then nearer; the great pagoda of Yongning in the third; in front, pines and a gate
  // and the temple's wall (the book's name goes on it). Kept low under the sky to the right (the poem's there).
  function templeLayers(wN) {
    const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    // a roof: its eaves rw out either side of cx at y, turned up at their tips; rh to its ridge
    const roof = (cx, y, rw, rh) => [[cx - rw, y + rh * 0.2], [cx - rw * 0.8, y], [cx + rw * 0.8, y], [cx + rw, y + rh * 0.2],
      [cx + rw * 0.55, y + rh * 0.72], [cx + rw * 0.6, y + rh], [cx - rw * 0.6, y + rh], [cx - rw * 0.55, y + rh * 0.72]];
    const oval = (cx, cy, rx, ry, n = 9) => Array.from({ length: n }, (_, k) => [cx + Math.cos(k / n * Math.PI * 2) * rx, cy + Math.sin(k / n * Math.PI * 2) * ry]);
    const hall = (cx, yb, wd, ht, tiers = 1) => {
      const out = [rect(cx - wd * 0.45, cx + wd * 0.45, yb, yb + ht * 0.08)];
      if (tiers === 1) out.push(rect(cx - wd * 0.34, cx + wd * 0.34, yb, yb + ht * 0.5), roof(cx, yb + ht * 0.5, wd * 0.5, ht * 0.5));
      else out.push(rect(cx - wd * 0.34, cx + wd * 0.34, yb, yb + ht * 0.4), roof(cx, yb + ht * 0.4, wd * 0.5, ht * 0.26),
        rect(cx - wd * 0.2, cx + wd * 0.2, yb + ht * 0.6, yb + ht * 0.74), roof(cx, yb + ht * 0.72, wd * 0.34, ht * 0.28));
      return out;
    };
    const pagoda = (cx, yb, H) => {
      const out = [rect(cx - 0.3 * H, cx + 0.3 * H, yb, yb + 0.035 * H), rect(cx - 0.23 * H, cx + 0.23 * H, yb, yb + 0.065 * H)];
      let y = yb + 0.065 * H;
      for (let k = 0; k < 9; k++) {
        const bw = (0.13 - k * 0.009) * H, sh = 0.06 * H;
        out.push(rect(cx - bw, cx + bw, y, y + sh + 0.002), roof(cx, y + sh, bw + 0.05 * H, 0.03 * H));
        y += sh + 0.013 * H;
      }
      out.push(rect(cx - 0.007 * H, cx + 0.007 * H, y, y + 0.2 * H));
      for (let k = 0; k < 5; k++) { const yy = y + 0.04 * H + k * 0.028 * H, r = (0.03 - k * 0.003) * H; out.push(rect(cx - r, cx + r, yy, yy + 0.007 * H)); }
      return out;
    };
    const tree = (cx, yb, r) => [rect(cx - r * 0.1, cx + r * 0.1, yb, yb + r * 1.1), oval(cx, yb + r * 1.5, r, r * 0.85)];
    // a pine as in a painting: its trunk leaning, its needles in flat clouds
    const pine = (cx, yb, H) => [[[cx - H * 0.035, yb], [cx + H * 0.035, yb], [cx + H * 0.06, yb + H * 0.9], [cx + H * 0.035, yb + H * 0.9]],
      oval(cx - H * 0.08, yb + H * 0.5, H * 0.22, H * 0.06), oval(cx + H * 0.14, yb + H * 0.7, H * 0.2, H * 0.055), oval(cx + H * 0.02, yb + H * 0.9, H * 0.16, H * 0.06)];
    const wall = (x0, x1, yb, ht) => [rect(x0, x1, yb, yb + ht), [[x0 - 0.015, yb + ht], [x1 + 0.015, yb + ht], [x1 - 0.005, yb + ht + 0.028], [x0 + 0.005, yb + ht + 0.028]]];
    const at = (f) => f * wN;
    return [
      { yb: 0.5, col: [0.5, 0.8, 0.98], mist: [0.76, 0.95, 1.06], polys: [
        ...pagoda(at(-0.4), 0.5, 0.2), ...hall(at(-0.31), 0.5, 0.1, 0.07, 2), ...pagoda(at(-0.21), 0.5, 0.27), ...tree(at(-0.14), 0.5, 0.03),
        ...hall(at(-0.08), 0.5, 0.12, 0.06), ...pagoda(at(0.04), 0.5, 0.15), ...hall(at(0.13), 0.5, 0.09, 0.05), ...tree(at(0.21), 0.5, 0.025),
        ...tree(at(0.27), 0.5, 0.02), ...hall(at(0.37), 0.5, 0.08, 0.04), ...tree(at(0.45), 0.5, 0.02)] },
      { yb: 0.36, col: [0.34, 0.65, 0.92], mist: [0.68, 0.9, 1.03], polys: [
        ...hall(at(-0.43), 0.36, 0.18, 0.11, 2), ...pagoda(at(-0.3), 0.36, 0.3), ...tree(at(-0.235), 0.36, 0.045), ...hall(at(-0.02), 0.36, 0.15, 0.09),
        ...pagoda(at(0.09), 0.36, 0.24), ...tree(at(0.18), 0.36, 0.04), ...hall(at(0.27), 0.36, 0.12, 0.07), ...tree(at(0.36), 0.36, 0.035),
        ...hall(at(0.44), 0.36, 0.1, 0.06)] },
      { yb: 0.22, col: [0.22, 0.47, 0.76], mist: [0.56, 0.8, 0.97], polys: [
        ...pine(at(-0.46), 0.22, 0.22), ...hall(at(-0.33), 0.22, 0.22, 0.13, 2), ...pagoda(at(-0.14), 0.22, 0.72), ...hall(at(0.04), 0.22, 0.17, 0.1),
        ...tree(at(0.15), 0.22, 0.06), ...hall(at(0.3), 0.22, 0.2, 0.12, 2), ...tree(at(0.42), 0.22, 0.05)] },
      { yb: 0.07, col: [0.11, 0.24, 0.43], mist: [0.11, 0.24, 0.43], polys: [
        ...pine(at(-0.44), 0.07, 0.32), ...pine(at(-0.34), 0.07, 0.2), ...tree(at(-0.26), 0.07, 0.06),
        ...hall(0, 0.07, 0.2, 0.2, 2), ...wall(0.1, wN / 2 + 0.02, 0.07, 0.13)] },
    ];
  }
  // a poem down a canvas in columns read from the right (B.poem: its lines), the poet small after it
  function poemColumns(g, W, H, B) {
    const cs = H * 0.12;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#24345f'; g.font = `600 ${cs}px "Songti SC", "Noto Serif SC", "Kaiti SC", serif`;
    B.poem.forEach((line, c) => [...line].forEach((ch, i) => g.fillText(ch, W - cs * (0.7 + c * 1.3), cs * (0.6 + i * 1.08))));
    g.fillStyle = '#46608f'; g.font = `500 ${cs * 0.48}px "Songti SC", "Noto Serif SC", serif`;
    const foot = cs * (0.6 + (B.poem[0].length - 1) * 1.08);
    [...B.poet].forEach((ch, i, a) => g.fillText(ch, W - cs * (0.4 + B.poem.length * 1.3), foot - cs * 0.55 * (a.length - 1 - i)));
  }
  // an icon (main.js loadIcons) drawn on a canvas, its 512 square size high, centred at (cx, cy), in fill (edged
  // dark edge thick, if given)
  function drawIcon(g, name, cx, cy, size, fill, edge = 0) {
    if (!icons?.[name]?.length) return;
    const k = size / 512;
    g.save(); g.translate(cx - 256 * k, cy - 256 * k); g.scale(k, k);
    g.fillStyle = fill; g.beginPath();
    for (const sh of icons[name]) {
      const { shape, holes } = sh.extractPoints(8);
      for (const ring of [shape, ...holes]) ring.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    }
    if (edge) { g.strokeStyle = '#000'; g.lineWidth = edge / k; g.lineJoin = 'round'; g.stroke(); }
    g.fill('evenodd'); g.restore();
  }
  // an icon (main.js loadIcons) as a flat shape facing +z, size high, centred; null if it did not load
  function iconShape(name, size) {
    if (!icons?.[name]?.length) return null;
    const g = new THREE.ShapeGeometry(icons[name], 6).scale(size / 512, -size / 512, 1), ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];   // (facing out again)
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    return g.translate(-c.x, -c.y, 0);
  }
  // a tropical plant, its foot at (x, F, z), in a pot (or planted, pot: false, F then the soil's top), size times
  // its usual size: 'monstera' (great split leaves on long stems), 'palm' (fronds arching out of a clump), 'bird'
  // (paddle leaves upright, a flower or two), 'tree' (a palm tree: a ringed trunk, its crown of long fronds bowing
  // over), 'banana' (long leaves rising from a thick stem), 'elephant' (great heart-shaped leaves held out on long
  // stalks), 'fern' (low, its fronds arching out); into ip, lit as the shop is
  function tropicalPlant(ip, x, z, F, kind, R, { pot = true, size: S = 1 } = {}) {
    const LA = 0.45, LEAF = new THREE.Color('#3f7f46').toArray(), DEEP = new THREE.Color('#2f6b3c').toArray();
    const LEAVES = ['#3f7f46', '#2f6b3c', '#4f9a52', '#2b5e48'].map((c) => new THREE.Color(c).toArray());
    let y0 = F;
    if (pot) {
      const tint = R.pick([TINT.terracotta, TINT.white, TINT.stone]);
      ip(new THREE.CylinderGeometry(0.38, 0.3, 0.5, 10).translate(x, F + 0.25, z), 0.8, tint);
      ip(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 10).translate(x, F + 0.49, z), 0.3, TINT.soil);
      y0 = F + 0.5;
    }
    // a frond len long, out along a from p, rising at up (radians; less than 0 bows down), width wd
    const frond = (px, py, pz, a, up, len, wd, tint) => {
      ip(new THREE.SphereGeometry(1, 6, 4).scale(wd, 0.02, len / 2).translate(0, 0, len / 2).rotateX(-up).rotateY(-a + Math.PI / 2).translate(px, py, pz), LA, tint);
      return [px + Math.cos(a) * Math.cos(up) * len, py + Math.sin(up) * len, pz + Math.sin(a) * Math.cos(up) * len];
    };
    if (kind === 'tree') {
      const th = R.range(2.2, 2.8) * S, lean = R.range(0, 6.3), lx = Math.cos(lean) * 0.25 * S, lz = Math.sin(lean) * 0.25 * S;
      for (let k = 0; k < 7; k++) {                                            // its trunk, ring on ring
        const f0 = k / 7, f1 = (k + 1) / 7, r = 0.09 * S * (1 - f0 * 0.3);
        ip(new THREE.CylinderGeometry(r * 0.85, r, th / 7 - 0.02, 7).translate(x + lx * (f0 + f1) / 2, y0 + th * (f0 + f1) / 2, z + lz * (f0 + f1) / 2), 0.55, TINT.wood);
      }
      const n = 10;
      for (let k = 0; k < n; k++) {                                            // its crown: up, then bowing over
        const a = (k / n) * Math.PI * 2 + R.range(-0.2, 0.2), tint = R.pick(LEAVES);
        const [ex, ey, ez] = frond(x + lx, y0 + th, z + lz, a, R.range(0.3, 0.7), 0.7 * S, 0.13 * S, tint);
        frond(ex, ey, ez, a, R.range(-0.6, -0.25), 0.75 * S, 0.12 * S, tint);
      }
    } else if (kind === 'fern') {
      for (let k = 0; k < 11; k++) {                                           // fronds arching out, low
        const a = (k / 11) * Math.PI * 2 + R.range(-0.25, 0.25), tint = R.pick(LEAVES);
        const [ex, ey, ez] = frond(x, y0, z, a, R.range(0.6, 1.0), 0.22 * S, 0.06 * S, tint);
        frond(ex, ey, ez, a, R.range(-0.5, -0.1), 0.3 * S, 0.055 * S, tint);
      }
    } else if (kind === 'banana') {
      const sh = R.range(1.0, 1.3) * S;
      ip(new THREE.CylinderGeometry(0.08 * S, 0.12 * S, sh, 8).translate(x, y0 + sh / 2, z), 0.5, new THREE.Color('#6b8f4e').toArray());
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + R.range(-0.3, 0.3), tint = R.pick([new THREE.Color('#5f9e4a').toArray(), LEAF]);
        const [ex, ey, ez] = frond(x, y0 + sh * R.range(0.85, 1), z, a, R.range(0.7, 1.1), 0.55 * S, 0.17 * S, tint);
        frond(ex, ey, ez, a, R.range(0.0, 0.35), 0.7 * S, 0.2 * S, tint);
      }
    } else if (kind === 'elephant') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + R.range(-0.3, 0.3), h = R.range(0.7, 1.3) * S, out = R.range(0.3, 0.5) * S;
        const lx = x + Math.cos(a) * out, lz = z + Math.sin(a) * out;
        ip(new THREE.CylinderGeometry(0.018 * S, 0.026 * S, Math.hypot(h, out), 5).rotateZ(-Math.cos(a) * Math.atan2(out, h)).rotateX(Math.sin(a) * Math.atan2(out, h)).translate((x + lx) / 2, y0 + h / 2, (z + lz) / 2), 0.4, DEEP);
        // the leaf hung from its stalk's end, pointing down and out
        const leaf = new THREE.CircleGeometry(0.34 * S, 8).scale(0.85, 1.3, 1).translate(0, -0.3 * S, 0);
        ip(leaf.rotateX(-0.45).rotateY(-a + Math.PI / 2).translate(lx, y0 + h, lz), LA, R.pick(LEAVES));
      }
    } else {
      const n = kind === 'palm' ? 8 : kind === 'bird' ? 6 : 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + R.range(-0.3, 0.3), tint = R.chance(0.5) ? LEAF : DEEP;
        if (kind === 'monstera') {
          const h = R.range(0.7, 1.5) * S, out = R.range(0.25, 0.55) * S;
          const lx = x + Math.cos(a) * out, lz = z + Math.sin(a) * out;
          ip(new THREE.CylinderGeometry(0.015, 0.02, h, 4).rotateZ(-Math.cos(a) * 0.25).rotateX(Math.sin(a) * 0.25).translate((x + lx) / 2, y0 + h / 2, (z + lz) / 2), 0.4, DEEP);
          const leaf = new THREE.CircleGeometry(R.range(0.28, 0.4) * S, 7).scale(1, 1.25, 1);
          ip(leaf.rotateX(-1.0).rotateY(-a + Math.PI / 2).translate(lx, y0 + h, lz), LA, tint);
        } else if (kind === 'palm') {
          const h = R.range(0.9, 1.6) * S, len = R.range(0.8, 1.2) * S;
          ip(new THREE.CylinderGeometry(0.02, 0.03, h, 4).translate(x + Math.cos(a) * 0.08, y0 + h / 2, z + Math.sin(a) * 0.08), 0.4, DEEP);
          ip(new THREE.SphereGeometry(1, 6, 4).scale(0.12 * S, 0.02, len / 2).translate(0, 0, len / 2).rotateX(0.55).rotateY(-a + Math.PI / 2).translate(x, y0 + h, z), LA, tint);
        } else {
          const h = R.range(0.6, 1.1) * S;
          ip(new THREE.CylinderGeometry(0.015, 0.02, h, 4).translate(x + Math.cos(a) * 0.1, y0 + h / 2, z + Math.sin(a) * 0.1), 0.4, DEEP);
          ip(new THREE.SphereGeometry(1, 6, 4).scale(0.16 * S, 0.42 * S, 0.03).rotateZ(R.range(-0.25, 0.25)).rotateY(-a).translate(x + Math.cos(a) * 0.14, y0 + h + 0.4 * S, z + Math.sin(a) * 0.14), LA, tint);
          if (k % 3 === 0) ip(new THREE.ConeGeometry(0.06 * S, 0.32 * S, 4).rotateZ(Math.PI / 2 + 0.3).translate(x + Math.cos(a) * 0.16, y0 + h + 0.05, z + Math.sin(a) * 0.16), 0.75, new THREE.Color('#ff7b54').toArray());
        }
      }
    }
    if (pot) colliders.push({ x, z, r: 0.5, y0: F - 1, y1: F + 5 });
  }

  // the colours the brands' cases are coloured from
  const CASE_COLORS = ['#2ec4b6', '#3a86ff', '#8a7dff', '#ff6fb5', '#3ddc97', '#ff5a5f', '#4cc9f0', '#c77dff', '#06d6a0',
    '#f7b538', '#e9e4d8', '#5a7bff', '#ff8fab', '#80ed99', '#1d6fa5', '#b5179e', '#f28482', '#a3c4f3'];
  // A brand's ad as a shallow lit case (the museum's cases were the model): a frame of dark metal, a light along
  // its sill, its back in four bands of the brand's colour (deeper and turned a little going up), its product
  // set out in it (ads/scenes.js: the hero, and where there is room the smaller thing beside it), what drifts in
  // its air; no words. Placed as a screen would be: its
  // face w x h centred at (x, y, z), facing face. Its own random numbers (from seed), so nothing else moves.
  // (each case's brand marked on its lights while it is made, and where it is kept)
  const caseSpots = [];
  const shopSpots = [];   // the shops on the street: { brand, kind, s, za, zb, face, depth }
  function brandCase(w, h, x, y, z, face, ad, seed, sceneKey = null) {
    const n = { z: [0, 1], x: [1, 0], '-z': [0, -1], '-x': [-1, 0] }[face];
    if (!mutedNow) caseSpots.push({ brand: ADS[ad].brand, x, y, z, nx: n[0], nz: n[1], w, h });
    caseOf = BRANDS.findIndex((b) => b.key === ADS[ad].brand);
    try { return makeCase(w, h, x, y, z, face, ad, seed, sceneKey); } finally { caseOf = -1; }
  }
  function makeCase(w, h, x, y, z, face, ad, seed, sceneKey) {
    // (喵星杂货's cases each their own, by their shape, on an LED screen: its kitten's great face on a large wide one and
    // on the tallest; small faces in tiles on a tall one, and six by three on a small wide one. Its shelves of blind
    // boxes are in the station, by the café)
    const meowScene = () => (h / w > 1.9 ? 'meow-led' : h / w > 1.2 ? 'meow-tiles' : w > 15 ? 'meow-led' : 'meow-tiles63');
    const brand = ADS[ad].brand, scene = SCENES[sceneKey || (brand === 'meow-store' ? meowScene() : brand)], R = makeRandom(Math.floor(seed * 1e6) + 11);
    const turn = { z: 0, x: Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[face];
    const at = (g) => g.rotateY(turn).translate(x, y - h / 2, z);
    const m = Math.min(w, h), d = scene.depth ?? THREE.MathUtils.clamp(m * 0.16, 0.25, 2.0), rim = scene.rim ?? THREE.MathUtils.clamp(m * 0.035, 0.08, 0.45);
    const SLATE = new THREE.Color('#3d4b5a').toArray(), PALE = [0.9, 1.25, 1.3];
    for (const g of [box(-w / 2 - rim, w / 2 + rim, -rim, 0, 0, d), box(-w / 2 - rim, w / 2 + rim, h, h + rim, 0, d),
      box(-w / 2 - rim, -w / 2, 0, h, 0, d), box(w / 2, w / 2 + rim, 0, h, 0, d)]) props(at(g), 0.3, SLATE);
    glow(at(box(-w / 2, w / 2, -Math.min(rim * 0.3, 0.06), 0, d - Math.min(rim * 0.4, 0.08), d)), PALE);
    // its colours (two from a wide palette, so that neighbours differ), its back in one of several ways, a little
    // off the wall: bands from one colour to the other, one flat colour, a horizon, a great disc behind what it
    // shows, or night with stars; and how what it shows is made: cut from coloured paper, low-poly and lit as the
    // museum's dioramas, or dark against the light
    const lit = (hex, b) => { const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b, 1e-3); return [c.r * b / m, c.g * b / m, c.b * b / m]; };
    const i1 = R.int(0, CASE_COLORS.length - 1), i2 = (i1 + R.int(3, CASE_COLORS.length - 3)) % CASE_COLORS.length;
    const c1 = CASE_COLORS[i1], c2 = CASE_COLORS[i2];
    // a cup of coffee floating on a cloud, on a screen of square pixels (scene.pixel, 浮岛咖啡's): the night in three
    // bands of blue behind; the cloud and the cup lit one pixel after another from the foot up, each one flashing white
    // as it comes; the cup then floating, up and down a whole pixel, steam going up out of it; the name lit from the
    // left, in pixels a third the size; then all of it gone, pixel by pixel; a round of 9 s
    // 夕光烘焙's (scene.dawn): its breads, Noto Emoji's glyphs in one ink, on its pale yellow-green, the sun going
    // down (dawnStage: which by its shape)
    if (scene.dawn) {
      const m = dawnPanel(w, h, x, y, z, face, BRANDS.find((bb) => bb.key === brand), null);
      m.translateZ(0.065);
      caseLabels.push(m);
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // 千秋影院's (scene.cinema): its night's scenes on film, or by a projector's beam (cinemaLED: the one, then the
    // other, about the city; over 浮岛咖啡's scrolling strip, its film in the pale of the city's own tones)
    if (scene.cinema) {
      const m = cinemaLED(w, h, x, y, z, face, scene.cinema === 'bright' ? { mode: 'film', palette: 'bright' } : scene.cinema === true ? {} : { mode: scene.cinema });
      m.translateZ(0.065);
      caseLabels.push(m);
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // 长夏乐馆's (scene.waves): a river of sound in LED dots (concertWaves: which by its shape)
    if (scene.waves) {
      const m = concertWaves(w, h, x, y, z, face);
      m.translateZ(0.065);
      caseLabels.push(m);
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // 萤伞's (scene.umbrellaLED): umbrellas drifting up as jellyfish (umbrellaLED)
    if (scene.umbrellaLED) {
      const m = umbrellaLED(w, h, x, y, z, face, BRANDS.find((bb) => bb.key === brand), {});
      m.translateZ(0.065);
      caseLabels.push(m);
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // 时雨餐厅's (scene.rainwin): a fogged window in the rain, the room behind it (rainWindow: which by its shape)
    if (scene.rainwin) {
      const m = rainWindow(w, h, x, y, z, face, BRANDS.find((bb) => bb.key === brand));
      m.translateZ(0.065);
      caseLabels.push(m);
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    if (scene.pixel) {
      caseLabels.push(pixelCafe(at(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.06)), w, h, R, BRANDS.find((bb) => bb.key === brand)));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // rows going by (a scene with strips): a band of colour each, a thin ledge between; in each its things in a
    // row, the top one going left, the next right, and so on, rushing one place along each turn and slowing to a
    // stop (toon.js glowMaterial, slide), cut from paper
    // a bouquet made of dots (scene.bouquet, 流萤花园's other): flowers each of rings of dots round a yellow heart,
    // lighting from the heart out ring by ring, each in its turn, a while open, then going out and coming again;
    // their stems gathered below, petals of dots drifting down, fireflies; the name under it all
    if (scene.bouquet) {
      const b = BRANDS.find((bb) => bb.key === brand), th = Math.min(h * 0.16, w * 0.13), tw = th * 3.3;
      caseLabels.push(floristBouquet(at(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.06)), w, h, b, th * 1.6));
      caseLabels.push(inBrandColours(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(0, th * 0.75, d * 0.6)), tw / th, true, (g, W, H) => {
        g.shadowColor = 'rgba(8, 20, 40, 0.9)'; g.shadowBlur = H * 0.12;
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.56}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText([...b.name].join(String.fromCharCode(8202)), W / 2, H * 0.38, W * 0.98);
        g.fillStyle = '#c8ff7a'; g.font = `600 ${H * 0.17}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText(b.en.split('').join(String.fromCharCode(8202)), W / 2, H * 0.84, W * 0.9);
      }, 512), BRANDS.indexOf(b)));
      return;
    }
    // 喵星杂货's on an LED screen (scene.ledcat: its kitten's great face; scene.tiles: small faces in tiles filling
    // it, its name in the four in the middle): meowLED
    if (scene.ledcat || scene.tiles) {
      caseLabels.push(meowLED(at(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.06)), w, h, seed, BRANDS.find((bb) => bb.key === brand),
        { layout: scene.tiles ? 'tiles' : 'face', fine: scene.tiles ? 66 : 44, cols: scene.cols || 0, rows: scene.rows || 0 }));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // shelves of blind boxes (scene.shelf, 喵星杂货's): a cream ground with faint polka dots; across the top its name
    // and its mark; below, shelves of boxes in soft colours, each with two cat's ears and a paw on its front; one box
    // after another its animal pops up out of it (Noto's faces: a different one each, on a white disc), a while, and
    // is gone again; a round of 9 s (toon.js glowMaterial, pop)
    if (scene.shelf) {
      const P = 9, top = y + h / 2 > 0 ? y + h / 2 : 1e4, Y = new THREE.Vector3(0, 1, 0), tall = h > w * 1.2;   // (under the ground no top: its pops kept within it)
      // (its colours as they were turned in 广告橱窗, made its own: so it keeps them whatever is set there for the
      // brand's other cases; the turning as toon.js caseAdjust does it)
      const own = (c, deg = -180, sat = 0.75, light = 1.01) => {
        const a = THREE.MathUtils.degToRad(deg), k = new THREE.Vector3(1, 1, 1).normalize(), v = new THREE.Vector3(...c);
        const r = v.clone().multiplyScalar(Math.cos(a)).add(k.clone().cross(v).multiplyScalar(Math.sin(a))).add(k.clone().multiplyScalar(k.dot(v) * (1 - Math.cos(a))));
        const l = r.x * 0.299 + r.y * 0.587 + r.z * 0.114;
        return [r.x, r.y, r.z].map((q) => Math.max(0, l + (q - l) * sat) * light);
      };
      const col = (hex, k = 0.95) => own(new THREE.Color(hex).multiplyScalar(k).toArray());
      const brandOf = caseOf;
      caseOf = -1;                                                         // (and not turned again by the brand's)
      const atP = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(Y, turn).add(new THREE.Vector3(x, y - h / 2, z));
      const pop = (g, hex, [px, py, pz], start, kind, amp, k) => popping(at(g), col(hex, k), [...atP(px, py, pz).toArray(), start], [kind, P, amp, top]);
      const plain = (pts, zz) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))).translate(0, 0, zz);
      const rounded = (x0, y0, bw, bh, r, zz) => {
        const sh = new THREE.Shape(); sh.moveTo(x0 + r, y0); sh.lineTo(x0 + bw - r, y0); sh.quadraticCurveTo(x0 + bw, y0, x0 + bw, y0 + r);
        sh.lineTo(x0 + bw, y0 + bh - r); sh.quadraticCurveTo(x0 + bw, y0 + bh, x0 + bw - r, y0 + bh); sh.lineTo(x0 + r, y0 + bh);
        sh.quadraticCurveTo(x0, y0 + bh, x0, y0 + bh - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
        return new THREE.ShapeGeometry(sh, 4).translate(0, 0, zz);
      };
      const INK = '#4a3420', BOXES = ['#ffb3c7', '#a8dcff', '#c9b6ff', '#b8f0c2', '#ffd6a5'];
      const ANIMALS = ['cat', 'rabbit', 'fox', 'bear', 'panda', 'frog', 'penguin', 'hamster', 'dog', 'tiger', 'koala', 'mouse', 'pig'];
      shown(at(box(-w / 2, w / 2, 0, h, 0.03, 0.06)), col('#fff1c9'));
      const m = Math.min(w, h), dotStep = m * 0.09;
      for (let yy = dotStep / 2; yy < h; yy += dotStep) for (let xx = -w / 2 + dotStep / 2 + ((yy / dotStep) % 2 < 1 ? 0 : dotStep / 2); xx < w / 2; xx += dotStep) {
        shown(at(new THREE.CircleGeometry(m * 0.012, 8).translate(xx, yy, 0.062)), col('#ffe08f'));
      }
      // its name and mark across the top (or, in a tall case, the top)
      const b = BRANDS.find((bb) => bb.key === brand), hh = Math.min(h * (tall ? 0.14 : 0.22), w * 0.2);
      shown(at(box(-w / 2, w / 2, h - hh, h, 0.063, 0.066)), col('#ffd166'));
      // (the mark, its name and the line under it together in the middle)
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(Math.min(w * 0.9, hh * 6), hh * 0.8).translate(0, h - hh / 2, d * 0.6)), Math.min(w * 0.9, hh * 6) / (hh * 0.8), true, (g, W, H) => {
        const t1 = { maxW: W - H * 1.3 }, t2 = { dots: 9, weight: 700, maxW: W - H * 1.3 }, sub = `${b.en}  ·  ${b.tagline}`;
        const tw = Math.max(dotText(null, b.name, 0, 0, H * 0.5, INK, t1), H * 0.02 + dotText(null, sub, 0, 0, H * 0.17, INK, t2));
        const x0 = Math.max(0, (W - (H * 1.15 + tw)) / 2);
        g.save(); g.translate(x0 + H * 0.55, H * 0.5); g.scale(H * 0.36, H * 0.36); g.strokeStyle = g.fillStyle = INK; g.lineCap = g.lineJoin = 'round'; b.logo(g); g.restore();
        dotText(g, b.name, x0 + H * 1.15, H * 0.4, H * 0.5, INK, t1);
        dotText(g, sub, x0 + H * 1.17, H * 0.82, H * 0.17, INK, t2);
      }, 512));
      // the shelves: rows of boxes, each with its animal to come
      const rows = tall ? Math.max(3, Math.round((h - hh) / (w * 0.32))) : 2, rowH = (h - hh - m * 0.06) / rows;
      const bs = Math.min(rowH * 0.5, w * 0.16), cols = Math.max(2, Math.floor((w * 0.92) / (bs * 1.55))), step = (w * 0.92) / cols;
      // (each box its moment and its animal, shuffled: the moments spread evenly over the round, no two together)
      const N = rows * cols, order = Array.from({ length: N }, (_, i) => i), kinds = Array.from({ length: N }, (_, i) => ANIMALS[i % ANIMALS.length]);
      for (const list of [order, kinds]) for (let i = N - 1; i > 0; i--) { const j = R.int(0, i); [list[i], list[j]] = [list[j], list[i]]; }
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const sy = m * 0.04 + r * rowH;                                         // (this shelf's plank)
        shown(at(box(-w / 2 + w * 0.03, w / 2 - w * 0.03, sy, sy + m * 0.018, 0.07, 0.09)), col('#d9a868', 0.9));
        for (let c = 0; c < cols; c++, n++) {
          const bx = -w * 0.46 + step * (c + 0.5), by = sy + m * 0.018, hex = BOXES[(c + r * 2) % BOXES.length];
          shown(at(rounded(bx - bs / 2, by, bs, bs * 0.82, bs * 0.08, 0.1)), col(hex));
          for (const e of [-1, 1]) shown(at(plain([[bx + e * bs * 0.42, by + bs * 0.8], [bx + e * bs * 0.1, by + bs * 0.8], [bx + e * bs * 0.3, by + bs * 1.02]], 0.1)), col(hex));
          const paw = iconShape('noto/paws', bs * 0.42);
          if (paw) shown(at(paw.translate(bx, by + bs * 0.4, 0.102)), col('#ffffff', 1));
          // its animal: up out of it on a white disc, at its own moment in the round
          const start = order[n] / N * (P - 2.2), animal = kinds[n], ay = by + bs * 1.2, piv = [bx, by + bs * 0.8, 0.13];
          pop(new THREE.CircleGeometry(bs * 0.5, 28).translate(bx, ay, 0.128), '#ffffff', piv, start, 1, 1.6, 1);
          pop(new THREE.RingGeometry(bs * 0.47, bs * 0.5, 28).translate(bx, ay, 0.129), hex, piv, start, 1, 1.6, 1);
          const head = iconShape(`noto/${animal}`, bs * 0.78);
          if (head) pop(head.translate(bx, ay, 0.131), INK, piv, start, 1, 1.6, 1);
          // a little star bursting as it comes
          pop(new THREE.CircleGeometry(bs * 0.06, 5).translate(bx + bs * 0.55, ay + bs * 0.45, 0.132), '#ffd166', [bx + bs * 0.55, ay + bs * 0.45, 0.132], start + 0.1, 1, 0.5, 1.2);
        }
      }
      if (y - h / 2 < 2.5 && y > 0) {                                     // (not down in the station)
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      caseOf = brandOf;
      return;
    }
    // a field of flowers made of dots (scene.bloom, 流萤花园's): its whole width a field of dots, where a flower is
    // the dots grown large in its colour; a gust crossing it from the left opens them one patch after another, they
    // stay open swaying, then close again the same way; fireflies drifting over; the name in the middle, where the
    // flowers leave room for it
    if (scene.bloom) {
      const b = BRANDS.find((bb) => bb.key === brand), th = Math.min(h * 0.3, w * 0.13), tw = th * 3.3;
      caseLabels.push(floristField(at(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.06)), w, h, R, b, tw * 1.1, th * 1.35));
      caseLabels.push(inBrandColours(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(0, h / 2, d * 0.6)), tw / th, true, (g, W, H) => {
        g.shadowColor = 'rgba(8, 20, 40, 0.9)'; g.shadowBlur = H * 0.12;
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.56}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText([...b.name].join(String.fromCharCode(8202)), W / 2, H * 0.38, W * 0.98);
        g.fillStyle = '#c8ff7a'; g.font = `600 ${H * 0.17}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText(b.en.split('').join(String.fromCharCode(8202)), W / 2, H * 0.84, W * 0.9);
      }, 512), BRANDS.indexOf(b)));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // a book of the week (scene.storm, 无风之日): a tropical storm over the Atlantic at night, its arms of cloud
    // wheeling slowly round a calm eye; under it the sea in layers, whitecaps on it; a research ship carrying a
    // computing cluster (rows of small lights on its decks, some blinking), a swarm of drones rising from it in a
    // stream that winds up into a ring round the eye, the ring turning faster than the storm, threads of light
    // between its drones; the book's name, its author and the shop's mark along the foot, pale on the dark sea
    if (scene.storm) {
      const B = scene.storm, m = Math.min(w, h), tall = h > w;
      const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k).toArray();
      const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      const paint = (g, f) => { const c = g.attributes.color, p = g.attributes.position; for (let i = 0; c && i < c.count; i++) c.setXYZ(i, ...f(i, p)); };
      const plain = (pts, zz) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))).translate(0, 0, zz);
      const blinking = (g, rgb, phase) => bins.glow.add(g, { color: rgb, aBlink: phase, aKey: ownKey() });
      const Y = new THREE.Vector3(0, 1, 0), atP = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(Y, turn).add(new THREE.Vector3(x, y - h / 2, z));
      // (turning in the case's own plane about E, nothing of it outside the case: toon.js glowMaterial, spin)
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, turn), axis = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, turn);
      const p0 = new THREE.Vector3(-w / 2, 0, 0).applyAxisAngle(Y, turn).add(new THREE.Vector3(x, 0, z));
      const turning = (g, rgb, E, speed) => { const c = atP(E[0], E[1], 0); spinning(at(g), rgb, [c.x, c.y, c.z, speed], [axis.x, axis.y, axis.z, 0], [p0.x, p0.z, dir.x, dir.z], [w, y - h / 2, y + h / 2, 0]); };
      // the night, stormy: dark above, a grey-blue toward the sea
      const sea = h * (tall ? 0.27 : 0.24);
      {
        const N = 8, TOP = col('#081224'), LOW = col('#2e3d5a');
        const sky = shown(at(new THREE.PlaneGeometry(w, h, 1, N).translate(0, h / 2, 0.06)), TOP);
        paint(sky, (i) => mix(TOP, LOW, Math.pow(Math.floor(i / 2) / N, 1.4)));
      }
      // the storm: its arms, spirals widening outward from the eye, in three greys, wheeling slowly; the eye wall pale;
      // in the eye the calm, dark, a few stars
      const E = tall ? [0, h * 0.64] : [w * 0.12, h * 0.6], re = m * 0.085, Rmax = Math.hypot(w, h) * 0.75;
      const ARMS = 5, b = 0.24, GREYS = [col('#3b4c6b'), col('#4f6283'), col('#6a7d9c')];
      for (let a = 0; a < ARMS; a++) {
        const a0 = (a / ARMS) * Math.PI * 2 + R.range(-0.2, 0.2), tmax = Math.log(Rmax / (re * 1.25)) / b, outer = [], inner = [];
        for (let i = 0; i <= 48; i++) {
          const t = (i / 48) * tmax, r = re * 1.25 * Math.exp(b * t), wid = 0.35 + 0.25 * Math.sin(i / 48 * Math.PI);
          const ang = a0 + t;
          outer.push([E[0] + Math.cos(ang) * r, E[1] + Math.sin(ang) * r]);
          inner.push([E[0] + Math.cos(ang) * r * (1 - wid * 0.55), E[1] + Math.sin(ang) * r * (1 - wid * 0.55)]);
        }
        turning(plain([...outer, ...inner.reverse()], 0.066 + (a % 3) * 0.002), GREYS[a % 3], E, 0.035);
      }
      turning(new THREE.RingGeometry(re * 0.95, re * 1.35, 40).translate(E[0], E[1], 0.071), col('#a9bbd6', 0.95), E, 0.035);
      shown(at(new THREE.CircleGeometry(re * 0.97, 40).translate(E[0], E[1], 0.0725)), col('#0a1730'));
      for (let k = 0; k < 9; k++) {
        const a = R.range(0, Math.PI * 2), r = re * 0.75 * Math.sqrt(R.next());
        shown(at(new THREE.CircleGeometry(m * 0.003, 6).translate(E[0] + Math.cos(a) * r, E[1] + Math.sin(a) * r, 0.073)), col('#e2ecff', 1.2));
      }
      // the swarm: a ring of drones round the eye wall, turning faster than the storm, threads of light between them
      const ring = re * 1.75, ND = tall ? 36 : 44;
      for (let k = 0; k < ND; k++) {
        const a = (k / ND) * Math.PI * 2, r = ring * (1 + 0.06 * Math.sin(k * 2.7)), px = E[0] + Math.cos(a) * r, py = E[1] + Math.sin(a) * r;
        turning(new THREE.CircleGeometry(m * 0.0045, 6).translate(px, py, 0.076), col('#9ff4ff', 1.6), E, 0.18);
        const a2 = ((k + 1) / ND) * Math.PI * 2, r2 = ring * (1 + 0.06 * Math.sin((k + 1) * 2.7)), qx = E[0] + Math.cos(a2) * r2, qy = E[1] + Math.sin(a2) * r2;
        const len = Math.hypot(qx - px, qy - py);
        turning(new THREE.PlaneGeometry(len, m * 0.0012).rotateZ(Math.atan2(qy - py, qx - px)).translate((px + qx) / 2, (py + qy) / 2, 0.075), col('#5fe3f2', 0.8), E, 0.18);
      }
      // the sea: three layers of swell, darker toward us, whitecaps on them
      const SEA = [['#1d2c48', 1.0], ['#16233b', 0.82], ['#0e182b', 0.6]];
      SEA.forEach(([hex, f], n) => {
        const top = sea * f, pts = [[w / 2, 0], [-w / 2, 0]], ph = R.range(0, 6), M = Math.max(30, Math.round(w / m * 30));
        for (let i = 0; i <= M; i++) { const xx = -w / 2 + (i / M) * w; pts.push([xx, top + m * 0.012 * Math.sin(xx / m * 22 + ph) + m * 0.008 * Math.sin(xx / m * 51 + ph * 2)]); }
        shown(at(plain(pts, 0.1 + n * 0.01)), col(hex));
        for (let k = 0; k < Math.round(w / m * 9); k++) {
          const cx = R.range(-w / 2, w / 2), cy = top + m * 0.012 * Math.sin(cx / m * 22 + ph) + m * 0.008 * Math.sin(cx / m * 51 + ph * 2) - m * 0.004, cw = m * R.range(0.015, 0.035);
          shown(at(plain([[cx - cw, cy], [cx + cw, cy], [cx + cw * 0.3, cy + m * 0.006]], 0.1 + n * 0.01 + 0.001)), col('#b9cbe4', 0.8 - n * 0.15));
        }
      });
      // the ship, on the second swell: a long white hull, decks stepping up, its cluster's lights in rows
      const sx = tall ? -w * 0.16 : -w * 0.22, wl = sea * 0.8, L = m * (tall ? 0.5 : 0.42), HH = L * 0.11, zs = 0.115;
      const WHITE = col('#dfe8f3', 0.85);
      shown(at(plain([[sx - L / 2, wl + HH], [sx + L / 2 + L * 0.06, wl + HH], [sx + L / 2, wl - HH * 0.15], [sx - L / 2 + L * 0.04, wl - HH * 0.15]], zs)), WHITE);
      shown(at(plain([[sx - L * 0.42, wl + HH], [sx + L * 0.3, wl + HH], [sx + L * 0.26, wl + HH * 1.9], [sx - L * 0.38, wl + HH * 1.9]], zs + 0.001)), col('#c9d6e6', 0.85));
      shown(at(plain([[sx - L * 0.3, wl + HH * 1.9], [sx + L * 0.12, wl + HH * 1.9], [sx + L * 0.09, wl + HH * 2.6], [sx - L * 0.27, wl + HH * 2.6]], zs + 0.002)), col('#b7c6da', 0.85));
      for (const [y0, y1, x0, x1] of [[wl + HH * 1.15, wl + HH * 1.75, sx - L * 0.38, sx + L * 0.25], [wl + HH * 2.0, wl + HH * 2.45, sx - L * 0.25, sx + L * 0.07]]) {
        for (let yy = y0; yy < y1; yy += HH * 0.22) for (let xx = x0; xx < x1; xx += L * 0.022) {
          const g = new THREE.PlaneGeometry(L * 0.012, HH * 0.12).translate(xx, yy, zs + 0.004), c = col(R.chance(0.2) ? '#ffd27a' : '#7ff0ff', 1.4);
          if (R.chance(0.15)) blinking(at(g), c, R.next()); else shown(at(g), c);
        }
      }
      // the stream of drones, rising from its deck and winding up into the ring
      const from = [sx + L * 0.05, wl + HH * 2.7];
      for (let k = 0; k < (tall ? 90 : 110); k++) {
        const t = Math.pow(R.next(), 0.85), ang = Math.atan2(from[1] - E[1], from[0] - E[0]) + t * 1.2;
        const r = ring + (Math.hypot(from[0] - E[0], from[1] - E[1]) - ring) * (1 - t);
        const jx = R.range(-1, 1) * m * 0.02 * (1 - t * 0.5), jy = R.range(-1, 1) * m * 0.02 * (1 - t * 0.5);
        const px = E[0] + Math.cos(ang) * r + jx, py = E[1] + Math.sin(ang) * r + jy;
        shown(at(new THREE.CircleGeometry(m * 0.0035 * R.range(0.7, 1.2), 6).translate(px, py, 0.08)), col('#bdf6ff', R.range(1.0, 1.6)));
      }
      // the book's name and the shop's mark along the foot, pale on the sea
      const th = h * (tall ? 0.1 : w / h > 3 ? 0.2 : 0.13), tw = Math.min(w * 0.5, th * 3.6);
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(-w / 2 + m * 0.06 + tw / 2, th * 0.5 + m * 0.04, d * 0.6)), tw / th, true, (g, W, H) => {
        g.fillStyle = '#e6eefc'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.font = `700 ${H * 0.5}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(`《${B.title}》`, 0, H * 0.36, W * 0.98);
        g.fillStyle = '#b9c9e2'; g.font = `500 ${H * 0.2}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(`${B.author} 著`, W * 0.035, H * 0.84, W * 0.9);
      }, 512));
      const lr = th * 0.36, nw2 = th * 2.0, nh2 = th * 0.46, mx = w / 2 - m * 0.06 - nw2 - lr * 1.4, my = th * 0.36 + m * 0.04;
      const leaf = iconShape('monstera-leaf', lr * 1.8);
      if (leaf) shown(at(leaf.translate(mx, my, d * 0.55)), col('#e6eefc', 0.9));
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(nw2, nh2).translate(mx + lr * 1.35 + nw2 / 2, my, d * 0.55)), nw2 / nh2, true, (g, W, H) => {
        g.fillStyle = '#e6eefc'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.62}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText(B.shop, 0, H * 0.54, W);
      }, 512));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // a book of the week (scene.letters, 往昔之信): a white desert at night in layers of dunes, cut from paper; in the
    // sky the main sun (a bright star, its glow in steps) and the hidden one (a white dwarf, small and hard, near
    // it); a comet near them, its tail of fine dust streaming away from the sun across much of the sky; stars; the
    // book's name and its author in ink on the sand to the left, the shop's mark to the right
    if (scene.letters) {
      const B = scene.letters, strip = w / h > 3.2;
      const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k).toArray();
      const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      const paint = (g, f) => { const c = g.attributes.color, p = g.attributes.position; for (let i = 0; c && i < c.count; i++) c.setXYZ(i, ...f(i, p)); };
      const plain = (pts, zz) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))).translate(0, 0, zz);
      // the night: deep at the top, a little paler down to the dunes
      const TOP = col('#040817'), LOW = col('#1d2c52'), skyAt = (yy) => mix(TOP, LOW, Math.pow(THREE.MathUtils.clamp(1 - yy / h, 0, 1), 1.3));
      {
        const N = 8, sky = shown(at(new THREE.PlaneGeometry(w, h, 1, N).translate(0, h / 2, 0.06)), TOP);
        paint(sky, (i) => skyAt(h * (1 - Math.floor(i / 2) / N)));
      }
      for (let k = 0; k < Math.round(w / h * 34); k++) {
        const sx = R.range(-w / 2, w / 2), sy = R.range(h * 0.35, h * 0.99);
        shown(at(new THREE.OctahedronGeometry(h * R.range(0.003, 0.008), 0).translate(sx, sy, 0.065)), col('#dce9ff', R.range(0.5, 1.3)));
      }
      // the two suns: the main one's glow in steps, from wide and faint to the bright star; its halo; the hidden one
      const sun = [w * (strip ? 0.2 : 0.14), h * (strip ? 0.6 : 0.58)], r0 = h * (strip ? 0.05 : 0.045);
      [[4.6, 0.1], [3.3, 0.19], [2.2, 0.32]].forEach(([k, t], n) => shown(at(new THREE.CircleGeometry(r0 * k, 40).translate(sun[0], sun[1], 0.07 + n * 0.002)), mix(skyAt(sun[1]), col('#9fd0ff'), t)));
      shown(at(new THREE.CircleGeometry(r0, 32).translate(sun[0], sun[1], 0.082)), col('#ffffff', 1.6));
      const ha = -0.55, hid = [sun[0] + Math.cos(ha) * r0 * 2.97, sun[1] + Math.sin(ha) * r0 * 2.97];
      shown(at(new THREE.CircleGeometry(r0 * 0.55, 20).translate(hid[0], hid[1], 0.083)), col('#9fd0ff', 0.7));
      shown(at(new THREE.CircleGeometry(r0 * 0.3, 20).translate(hid[0], hid[1], 0.084)), col('#ffffff', 2.0));
      // the comet: its head between the sun and the sky's far corner, its tail away from the sun to that corner
      const end = [-w / 2 + h * 0.04, h * 0.97], head = mix(sun, end, strip ? 0.12 : 0.2), along = [end[0] - head[0], end[1] - head[1]];
      const L = Math.hypot(...along), u = [along[0] / L, along[1] / L], nrm = [-u[1], u[0]];
      // (its tail of fine dust, grain by grain, out of its head and one with it: thick and bright at the head,
      // spreading and thinning and fading into the sky toward its end, curving a little; a narrow bright streak of
      // finer grains along its middle)
      const grains = (n, w0, w1, bend, bright, fade, rr, zz, spread = 0.45) => {
        for (let k = 0; k < n; k++) {
          const t = Math.pow(R.next(), 1.35), half = w0 + (w1 - w0) * Math.pow(t, 0.8);
          const g1 = (R.next() + R.next() + R.next() - 1.5) / spread;           // (round its middle, fewer out to its edges)
          const off = g1 * half * 0.85 + bend * t * t * L, px = head[0] + u[0] * t * L + nrm[0] * off, py = head[1] + u[1] * t * L + nrm[1] * off;
          if (px < -w / 2 + h * 0.01 || py > h * 0.995) continue;
          const c = mix(bright, skyAt(py), Math.min(1, Math.pow(t, fade) + R.range(-0.08, 0.08)));
          shown(at(new THREE.CircleGeometry(h * rr * R.range(0.6, 1.3) * (1 - 0.4 * t), 6).translate(px, py, zz + R.next() * 0.002)), c);
        }
      };
      const many = Math.round(w / h * (strip ? 480 : 600));
      grains(many, h * 0.01, h * (strip ? 0.26 : 0.24), 0.07, col('#8fc2f0', 1.0), 0.6, 0.0045, 0.09);           // the dust
      grains(Math.round(many * 0.45), h * 0.004, h * 0.03, 0.0, col('#e2f3ff', 1.4), 0.8, 0.003, 0.093, 0.6);  // the bright streak
      // its head: grains crowded round a bright core
      for (let k = 0; k < 60; k++) {
        const a = R.range(0, Math.PI * 2), rr = h * 0.03 * Math.sqrt(R.next());
        shown(at(new THREE.CircleGeometry(h * 0.004 * R.range(0.7, 1.3), 6).translate(head[0] + Math.cos(a) * rr * 1.3, head[1] + Math.sin(a) * rr, 0.094)), col('#cfe9ff', 1.1));
      }
      shown(at(new THREE.CircleGeometry(h * 0.011, 16).translate(head[0], head[1], 0.096)), col('#ffffff', 1.8));
      // the dunes, three layers going pale toward us, each its crest in long waves
      const DUNES = [[0.34, '#b4c6e2', 0.75], [0.25, '#d6e2f2', 0.86], [0.15, '#f2f6fb', 0.95]];
      const crests = [];                                       // (each dune's crest, for the scan to light: see below)
      DUNES.forEach(([top, hex, k], n) => {
        const pts = [[w / 2, 0], [-w / 2, 0]], ph = R.range(0, 6), ph2 = R.range(0, 6), M = Math.max(24, Math.round(w / h * 14));
        for (let i = 0; i <= M; i++) {
          const xx = -w / 2 + (i / M) * w, q = xx / h;
          pts.push([xx, h * (top + 0.035 * Math.sin(q * 1.6 + ph) + 0.02 * Math.sin(q * 3.7 + ph2))]);
        }
        crests.push([pts.slice(2), 0.1 + n * 0.012 + 0.003]);
        const g = shown(at(plain(pts, 0.1 + n * 0.012)), col(hex, k));
        paint(g, (i, pp) => mix(col(hex, k * 0.82), col(hex, k), THREE.MathUtils.clamp((pp.getY(i) - (y - h / 2)) / (h * top), 0, 1)));
      });
      // shown as a hologram is: fine lines across all of it, and every few seconds a band of light sweeping down,
      // each dune's crest catching it as it passes; now and then a faint flicker (in the brand's colours, as the rest)
      {
        const P = 6.5, index = BRANDS.findIndex((bb) => bb.key === brand);
        const BAND = /* glsl */ `
          uniform float uTime, uP; uniform mat3 uHue; uniform vec3 uCaseAdj[24]; uniform int uIndex;
          // where the band is (0 the foot, 1 the top): down from above the top to below the foot in the round's first
          // half, then gone till the next
          float bandAt() { float t = mod(uTime, uP); return 1.08 - t / (uP * 0.5) * 1.2; }
          vec3 tinted(vec3 c) {
            vec3 k = vec3(0.57735), adj = uCaseAdj[uIndex];
            c = uHue * c;
            c = c * cos(adj.x) + cross(k, c) * sin(adj.x) + k * dot(k, c) * (1.0 - cos(adj.x));
            return max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, adj.y), 0.0) * adj.z;
          }`;
        const uniforms = { uTime: shared.uTime, uP: { value: P }, uHue: shared.uHue, uCaseAdj: shared.uCaseAdj, uIndex: { value: index } };
        // the crests: a thin ribbon along each, lit only where the band is
        const pos = [], ys = [], idx = [], th0 = h * 0.008;
        for (const [pts, zz] of crests) {
          const base = pos.length / 3;
          pts.forEach(([px, py]) => { pos.push(px, py - th0, zz, px, py + th0 * 0.4, zz); ys.push(py / h, py / h); });
          for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const cg = new THREE.BufferGeometry();
        cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        cg.setAttribute('aY', new THREE.Float32BufferAttribute(ys, 1));
        cg.setIndex(idx);
        const crest = new THREE.Mesh(at(cg), new THREE.ShaderMaterial({
          uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: 'attribute float aY; varying float vY; void main() { vY = aY; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `${BAND}
            varying float vY;
            void main() {
              float d = vY - bandAt(), g = exp(-d * d / 0.0012) + (d > 0.0 ? exp(-d / 0.05) * 0.25 : 0.0);
              if (g < 0.01) discard;
              gl_FragColor = vec4(tinted(vec3(0.25, 0.95, 1.2)) * g * 1.4, 1.0);
            }`,
        }));
        crest.layers.set(LAYER.GLOW);
        caseLabels.push(crest);
        // over all of it: the lines, the band, the flicker
        const veil = new THREE.Mesh(at(new THREE.PlaneGeometry(w, h).translate(0, h / 2, d * 0.66)), new THREE.ShaderMaterial({
          uniforms: { ...uniforms, uLines: { value: Math.round(h * 70) } }, transparent: true, depthWrite: false,
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `${BAND}
            uniform float uLines; varying vec2 vUv;
            void main() {
              // the fine lines, fading out where they would be finer than a pixel (else they shimmer)
              float q = vUv.y * uLines, fw = fwidth(q), line = (1.0 - smoothstep(0.25, 0.45, abs(fract(q) - 0.5))) * (1.0 - smoothstep(0.3, 0.7, fw));
              float d = vUv.y - bandAt(), band = exp(-d * d / 0.0008) + (d > 0.0 ? exp(-d / 0.06) * 0.18 : 0.0);
              float n = fract(sin(floor(uTime * 14.0) * 91.7) * 4375.5), flick = n > 0.985 ? 0.22 : 0.0;
              vec3 light = tinted(vec3(0.4, 0.95, 1.15));             // (the screens' cyan: seen on the white sand too)
              float a = clamp(line * 0.22 + flick + band * 0.55, 0.0, 0.9);
              gl_FragColor = vec4(light * band / max(a, 1e-3) * 0.55, a);
            }`,
        }));
        veil.layers.set(LAYER.GLOW);
        caseLabels.push(veil);
      }
      // the book's name on the sand, left, in ink; what it is under it
      const th = h * (strip ? 0.22 : 0.15), tw = Math.min(w * 0.42, th * 6.6);
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(-w / 2 + h * 0.08 + tw / 2, th * 0.5 + h * 0.05, d * 0.6)), tw / th, true, (g, W, H) => {
        g.fillStyle = '#16233f'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.font = `700 ${H * 0.52}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(`《${B.title}》`, 0, H * 0.36, W * 0.98);
        g.fillStyle = '#3a4d73'; g.font = `500 ${H * 0.2}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(`${B.author} 著`, W * 0.035, H * 0.84, W * 0.9);
      }, 512));
      // the shop's mark (the monstera leaf) and its name, right, in the same ink
      // (on a long strip, just after the name, where it is seen: its far end is often behind something)
      const sk = strip ? 1.35 : 1, lr = h * 0.06 * sk, nw2 = h * 0.36 * sk, nh2 = h * 0.085 * sk;
      const mx = strip ? -w / 2 + h * 0.08 + th * 3.6 + lr : w / 2 - h * 0.08 - nw2 - lr * 1.4, my = (strip ? th * 0.42 : h * 0.07) + h * 0.05;
      const leaf = iconShape('monstera-leaf', lr * 1.8);
      if (leaf) shown(at(leaf.translate(mx, my, d * 0.55)), col('#16233f'));
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(nw2, nh2).translate(mx + lr * 1.35 + nw2 / 2, my, d * 0.55)), nw2 / nh2, true, (g, W, H) => {
        g.fillStyle = '#16233f'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.62}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText(B.shop, 0, H * 0.54, W);
      }, 512));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // a book of the week (scene.temples): temples in layers going back into the mist of a blue dusk, cut from
    // paper (templeLayers), rain across it, a poem down the sky to the right, the book's name on the temple wall
    // in front, the shop's mark in the corner
    if (scene.temples) {
      const B = scene.temples, wN = w / h, tz = [0.12, 0.2, 0.3, 0.42];
      // (its colours given as on a canvas, made the light that shows as them; a little toward cyan, as the screen
      // turns the deep blues toward violet)
      const C = (c) => new THREE.Color(...c.map((v) => Math.min(1, v / 1.15))).convertSRGBToLinear().toArray();
      // the sky: lilac, deeper going up (each row of the plane its own colour)
      {
        const N = 8, top = C([0.32, 0.72, 1.0]), low = C([0.76, 0.96, 1.08]);
        const sky = shown(at(new THREE.PlaneGeometry(w, h, 1, N).translate(0, h / 2, 0.06)), top), col = sky.attributes.color;
        for (let j = 0; col && j <= N; j++) {
          const k = Math.pow(j / N, 1.4);
          for (let i = 0; i < 2; i++) col.setXYZ(j * 2 + i, ...top.map((c, n) => c + (low[n] - c) * k));
        }
      }
      // the temples, layer by layer: each its ground going pale into the mist at its foot, its roofs on it
      templeLayers(wN).forEach((L, n) => {
        const z = d * tz[n], N = 6, lc = C(L.col), lm = C(L.mist);
        const body = shown(at(new THREE.PlaneGeometry(w, h * L.yb, 1, N).translate(0, h * L.yb / 2, z)), lc), col = body.attributes.color;
        for (let j = 0; col && j <= N; j++) {
          const k = Math.pow(j / N, 1.6);
          for (let i = 0; i < 2; i++) col.setXYZ(j * 2 + i, ...lc.map((c, m) => c + (lm[m] - c) * k));
        }
        const shapes = L.polys.map((p) => new THREE.Shape(p.map(([px, py]) => new THREE.Vector2(px * h, py * h))));
        shown(at(new THREE.ShapeGeometry(shapes, 2).translate(0, 0, z + 0.002)), lc);
      });
      // rain going by, fine
      for (let k = 0; k < Math.round(wN * 26); k++) {
        const len = h * R.range(0.04, 0.09), rx = R.range(-w / 2, w / 2), ry = R.range(h * 0.06, h * 0.96);
        shown(at(new THREE.PlaneGeometry(h * 0.0035, len).rotateZ(0.18).translate(rx, ry, d * 0.5)), C([0.92, 0.98, 1.15]));
      }
      // the shop's mark (a monstera leaf, in the poem's ink) and its name, top left
      const lr = h * 0.075, lx = -w / 2 + h * 0.13, ly = h - h * 0.13;
      const leaf = iconShape('monstera-leaf', lr * 1.8);
      if (leaf) shown(at(leaf.translate(lx, ly, d * 0.55)), C([0.14, 0.26, 0.46]));
      const nw2 = h * 0.42, nh2 = h * 0.1;
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(nw2, nh2).translate(lx + lr * 1.35 + nw2 / 2, ly, d * 0.55)), nw2 / nh2, true, (g, W, H) => {
        g.fillStyle = '#24345f'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.62}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText(B.shop, 0, H * 0.54, W);
      }, 512));
      // the poem, in two columns down the sky (read from the right), the poet under them
      const pw = h * 0.26, ph = h * 0.48;
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(pw, ph).translate(w / 2 - h * 0.08 - pw / 2, h * 0.95 - ph / 2, d * 0.6)), pw / ph, true, (g, W, H) => poemColumns(g, W, H, B), 768));
      // the book's name on the temple wall in front, its author under
      const tw = Math.min(w * 0.42, h * 0.95), th = h * 0.15;
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(w / 2 - h * 0.06 - tw / 2, h * 0.1, d * 0.6)), tw / th, true, (g, W, H) => {
        g.fillStyle = '#eef4ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `700 ${H * 0.5}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(`《${B.title}》`, W / 2, H * 0.36, W * 0.98);
        g.fillStyle = '#b9cbea'; g.font = `500 ${H * 0.2}px "Songti SC", "Noto Serif SC", serif`;
        g.fillText(B.author, W / 2, H * 0.82, W * 0.9);
      }, 512));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // the moon set over a river (scene.moon, 流波月's: 春江花月夜, 落月摇情满江树): night going violet at its foot,
    // stars, the trees along the far bank, a tea in the Chinese way before it all with the moon laid on its cream,
    // light shaking on the water (no words: its name is over its door)
    if (scene.moon) {
      const P = 20, top = y + h / 2, Y = new THREE.Vector3(0, 1, 0);
      const u = Math.min(h, w * 1.75);   // (what its things are sized by: its height, or on a narrow one (a pylon's) what its width allows)
      const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k).toArray();
      const atP = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(Y, turn).add(new THREE.Vector3(x, y - h / 2, z));
      const pop = (g, rgb, [px, py, pz], start, kind, amp) => popping(at(g), rgb, [...atP(px, py, pz).toArray(), start], [kind, P, amp, top]);
      const shape = (pts, zz) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py)))).translate(0, 0, zz);
      // the sky, deep blue going violet toward the river
      {
        const N = 8, hi = col('#0b0d2e'), lo = col('#3b2a5e');
        const sky = shown(at(new THREE.PlaneGeometry(w, h, 1, N).translate(0, h / 2, 0.06)), hi), c = sky.attributes.color;
        for (let j = 0; c && j <= N; j++) for (let i = 0; i < 2; i++) c.setXYZ(j * 2 + i, ...hi.map((v, n) => v + (lo[n] - v) * Math.pow(j / N, 1.5)));
      }
      for (let k = 0; k < Math.round(w / h * 30); k++) shown(at(new THREE.OctahedronGeometry(u * R.range(0.004, 0.009), 0).translate(R.range(-w / 2, w / 2), R.range(h * 0.45, h * 0.98), 0.065)), col('#fff3d6', R.range(0.8, 1.4)));
      // the far bank, its trees
      const bank = h * 0.3, edge = bank * 0.9;                                // (edge: where the river meets the far bank)
      shown(at(new THREE.PlaneGeometry(w, bank + h * 0.04).translate(0, (bank + h * 0.04) / 2, 0.09)), col('#120f2a'));
      const trees = [];
      for (let xx = -w / 2 + u * 0.04; xx < w / 2; xx += u * R.range(0.06, 0.11)) {                      // its trees, crowded
        const r = u * R.range(0.035, 0.075), sy = R.range(0.9, 1.3), cy = bank + h * 0.04 + r * 0.6;
        trees.push([xx, r, sy, cy]);
        shown(at(new THREE.CircleGeometry(r, 9).scale(1, sy, 1).translate(xx, cy, 0.09)), col(R.pick(['#120f2a', '#17123a', '#0f0c24'])));
      }
      // a tea in the Chinese way before it all, and the moon caught in it: the cup rises out of the river (nothing of
      // it below the case), the crescent moon drifts slowly down from the sky (nothing of it above) onto its cream, at the
      // picture's golden section, right and up; the cup sinks again at the round's end and the moon is gone with it.
      // The cup: short, the tea soft, not bright, its cap of cream, the moon caught in it as a light. Under it the
      // river, its light shaking.
      // (on a narrow one the cup in the middle)
      const narrow = u < h, gx = narrow ? 0 : w * 0.118, gy = h * 0.618, cw0 = u * 0.13, cw1 = u * 0.16, cH = u * 0.46, cb = gy - u * 0.135 - cH, ez = d * 0.45, cx = gx;   // (the crescent standing up out of its cream, against the sky)
      const CREAM = col('#f5ead8', 0.95), foot = y - h / 2;
      // the river, the colour of its line along the trees there, deeper toward us; the trees and their bank in it,
      // faint and flattened, upside down; a few slow ripples across it
      {
        const N = 6, far = col('#5a4f86'), near = col('#3a3368');
        const river = shown(at(new THREE.PlaneGeometry(w, edge, 1, N).translate(0, edge / 2, 0.095)), far), c = river.attributes.color;
        for (let j = 0; c && j <= N; j++) for (let i = 0; i < 2; i++) c.setXYZ(j * 2 + i, ...far.map((v, n) => v + (near[n] - v) * Math.pow(j / N, 1.3)));
      }
      const mirrored = (yy) => edge - (yy - edge) * 0.55;
      shown(at(new THREE.PlaneGeometry(w, (bank + h * 0.04 - edge) * 0.55).translate(0, edge - (bank + h * 0.04 - edge) * 0.275, 0.0955)), col('#332c5e'));
      for (const [xx, r, sy, cy] of trees) {
        const g = new THREE.CircleGeometry(r, 9).scale(1, sy * 0.55, 1).translate(xx, mirrored(cy), 0.0955);
        shown(at(g), col('#332c5e'));
      }
      for (let k = 0; k < 7; k++) {
        const yy = edge * R.range(0.12, 0.85), ww = w * R.range(0.08, 0.22), rx = R.range(-w / 2 + ww / 2, w / 2 - ww / 2);
        pop(new THREE.PlaneGeometry(ww, h * 0.004).translate(rx, yy, 0.097), col('#7a70a8', 0.9), [rx, yy, 0.097], k * 1.3, 3, h * 0.004);
      }
      for (let k = 0; k < 8; k++) {                     // (the cup's light in the water: not on a narrow one, its numbers still drawn)
        const yy = Math.min(cb, bank) * (0.8 - k * 0.1) + h * 0.01, ww = cw1 * (1.6 - k * 0.12) * R.range(0.7, 1.1), ox = R.range(-cw1 * 0.2, cw1 * 0.2);
        if (!narrow) pop(new THREE.PlaneGeometry(ww, h * 0.01).translate(cx + ox, yy, 0.1), col('#ffe6a8', 0.9 - k * 0.07), [cx, yy, 0.1], k * 0.7, 3, h * 0.006);
      }
      const P2 = 12, rise = cb + cH + h * 0.05;   // (its round; how far the cup comes up)
      const cup = (g, rgb) => popping(at(g), rgb, [...atP(cx, cb, ez).toArray(), 0], [5, P2, rise, -foot]);
      cup(shape([[cx - cw0 - u * 0.012, cb - u * 0.012], [cx + cw0 + u * 0.012, cb - u * 0.012], [cx + cw1 + u * 0.012, cb + cH], [cx - cw1 - u * 0.012, cb + cH]], ez), col('#f5e6c8', 0.95));
      cup(shape([[cx - cw0, cb], [cx + cw0, cb], [cx + cw1 * 0.97, cb + cH * 0.78], [cx - cw1 * 0.97, cb + cH * 0.78]], ez + 0.002), col('#b5a28e', 0.85));
      cup(shape([[cx - cw1 * 0.97, cb + cH * 0.78], [cx + cw1 * 0.97, cb + cH * 0.78], [cx + cw1, cb + cH], [cx - cw1, cb + cH]], ez + 0.002), CREAM);
      cup(new THREE.CircleGeometry(cw1 * 1.02, 24, 0, Math.PI).scale(1, 0.35, 1).translate(cx, cb + cH, ez + 0.003), CREAM);
      cup(new THREE.CircleGeometry(u * 0.045, 20).translate(cx - cw1 * 0.45, cb + cH * 0.45, ez + 0.004), col('#fff1cc', 1.2));   // the moon in its cup
      // the crescent: large, the cream's own colour, turned the other way (mirrored, faces kept toward the street)
      const crescent = iconShape('material/bedtime', u * 0.26);
      if (crescent) {
        crescent.scale(-1, 1, 1);
        const ix = crescent.index.array;
        for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
        crescent.rotateZ(-0.35).translate(gx, gy, ez + 0.006);
        popping(at(crescent), CREAM, [...atP(gx, gy - u * 0.12, ez + 0.006).toArray(), 0.4], [6, P2, h * 0.75, top]);
      }
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // an ice cream's opening (scene.pop, 白云乡's), as an anime's would open: a deep violet night (dark, as the screens
    // round it are; its whites and pinks glowing on it), its ice cream as on the LED signs over its shop, in dots of
    // light, lit from its foot up, its clouds and its name in dots too (dotPicture), cups hopping to the beat, pink
    // flowers (flat,
    // Noto's blossom) popping in all over and spinning fast, slowing, gone; clouds bobbing, the name popping in
    // letter by letter, in a round hand (caseFonts.round); cut out as stickers, white round the edge; a round of
    // 6.4 s (toon.js glowMaterial, pop)
    if (scene.pop) {
      const P = 6.4, wide = w / h >= 1.2, col = (hex, k = 0.92) => new THREE.Color(hex).multiplyScalar(k).toArray();
      // the ground: the night, one deep violet
      shown(at(box(-w / 2, w / 2, 0, h, 0.03, 0.06)), col('#352862', 1));
      const tower = h / w > 2.5, S = wide ? Math.min(h * 0.7, w * 0.42) : Math.min(h * 0.55, w * (tower ? 1.15 : 0.8));   // (tower: a pylon's; its ice cream as wide as it allows)
      // the name's size; the cone and the name kept together, the two in the middle of the case: side by side in a
      // wide one (the cups under the name), the name over the cone in an upright one
      const b = BRANDS.find((bb) => bb.key === brand), tw = wide ? Math.min(w * 0.44, h * 1.0) : w * 0.88, th = tw * 0.36;
      const coneW = S * 0.46, gapW = h * 0.14, left = -(coneW + gapW + tw) / 2;
      const hx = wide ? left + coneW / 2 : 0, nx = wide ? left + coneW + gapW + tw / 2 : 0;
      const ct = wide ? h * 0.06 : tower ? (h - S * 1.2 - h * 0.04 - th) / 2 : Math.max(h * 0.06, (h - S * 1.2 - h * 0.04 - th) * 0.45);
      // (the ice cream's dots: its height, and where its middle is; and where the name's middle is)
      // (on a small upright one, the ice cream, the gap and the name together some way short of its height)
      const small = !wide && h < 4, gapN = h * 0.1, nameH = th * 0.77, fit = small ? Math.min(1, (h * 0.84 - gapN - nameH) / (S * 1.62 * 0.76)) : 1;
      const ph = S * 1.62 * fit, pw = ph * 0.42, dot = pw / 56, iceH = ph * 0.76;
      const foot = small ? (h - iceH - gapN - nameH) / 2 : 0;
      const iceC = wide ? h / 2 : small ? foot + iceH / 2 : ct + ph / 2;
      // clouds, bobbing, in dots (white)
      for (const [cx, cy, r, phs] of (wide ? [[-w * 0.44, h * 0.15, h * 0.08, 0], [w * 0.05, h * 0.86, h * 0.07, 1.3], [w * 0.4, h * 0.42, h * 0.06, 2.1]]
        : tower ? [[-w * 0.24, h * 0.08, w * 0.11, 0], [w * 0.26, h * 0.9, w * 0.1, 1.7], [-w * 0.22, h * 0.8, w * 0.08, 0.9]]
        : [[-w * 0.3, h * 0.12, w * 0.1, 0], [w * 0.32, h * 0.62, w * 0.08, 1.7]])) {
        const cwd = r * 3.6, chd = r * 2.4, parts = [[0, 0, 1], [-r * 0.9, -r * 0.25, 0.7], [r * 0.9, -r * 0.2, 0.75], [r * 0.35, r * 0.45, 0.65]];
        caseLabels.push(dotPicture(at(new THREE.PlaneGeometry(cwd, chd).translate(cx, cy + r * 0.05, 0.07)), cwd, chd, Math.round(cwd / dot), (g, W, H) => {
          g.fillStyle = '#ffffff';
          for (const [dx, dy, k] of parts) { g.beginPath(); g.arc(W / 2 + dx / cwd * W, H / 2 - (dy - r * 0.05) / chd * H, r * k / cwd * W, 0, 7); g.fill(); }
        }, { P, brand: BRANDS.indexOf(b), bob: 1, phase: phs, blush: false }));
      }
      // the ice cream: as on the LED signs over its shop (drawGelatoLED), in dots of light on the night, lit row by
      // row from its foot as the round begins (gelatoDots)
      caseLabels.push(dotPicture(at(new THREE.PlaneGeometry(pw, ph).translate(hx, iceC, 0.11)), pw, ph, 56, (g, W, H) => drawGelatoLED(g, W, H, false),
        { P, brand: BRANDS.indexOf(b), reveal: 'rise' }));
      // the cups, hopping to the beat
      // (white, in dots as the ice cream is, their parts parted by dark lines: the cup, its band, the scoop, a cherry)
      if (wide) {
        const cs = h * 0.26, by = h * 0.06, hopD = Math.max(1, Math.round(h * 0.06 / dot));
        const cw = cs * 0.9, chh = cs * 1.2 + hopD * dot, NXc = Math.round(cw / dot);
        [[nx - tw * 0.22, 0], [nx + tw * 0.22, 0.275]].forEach(([cx, start]) => {
          caseLabels.push(dotPicture(at(new THREE.PlaneGeometry(cw, chh).translate(cx, by + chh / 2, 0.12)), cw, chh, NXc, (g, W, H) => {
            const k = W / cw, X0 = W / 2, Y0 = H, L = (yy) => Y0 - yy * k;   // (from the cup's foot up, in metres)
            const poly = (pts) => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(X0 + px * k, L(py)) : g.moveTo(X0 + px * k, L(py)))); g.closePath(); };
            const ring = (px, py, r) => { g.beginPath(); g.arc(X0 + px * k, L(py), r * k, 0, 7); };
            g.fillStyle = '#ffffff'; g.strokeStyle = '#000000'; g.lineWidth = 2 * W / NXc;              // (dark lines two dots wide)
            ring(0, cs * 0.66, cs * 0.36); g.fill();                                                    // the scoop
            poly([[-cs * 0.4, cs * 0.6], [cs * 0.4, cs * 0.6], [cs * 0.26, 0], [-cs * 0.26, 0]]); g.fill(); g.stroke();   // the cup over it
            g.beginPath(); g.moveTo(X0 - cs * 0.4 * k, L(cs * 0.36)); g.lineTo(X0 + cs * 0.4 * k, L(cs * 0.36)); g.stroke();   // its band
            ring(cs * 0.1, cs * 1.04, cs * 0.12); g.fill(); g.stroke();                                // the cherry
          }, { P, brand: BRANDS.indexOf(b), hop: hopD, phase: start, blush: false }));
        });
      }
      // (the numbers the hearts, stars and sparkles once drew, still drawn: its flowers have their own)
      for (let k = 0; k < (wide ? 14 : 9) * 5; k++) R.next();
      // the name, popping in
      const ny = wide ? h * 0.66 : small ? foot + iceH + gapN + nameH / 2 : Math.min(h - th / 2 - h * 0.04, ct + S * 1.2 + h * 0.04 + th / 2);
      // pink flowers (the colour of its lowest scoop; flat, Noto's blossom) popping in all over it, each its own size,
      // moment and way round, spinning fast and slowing to a stop, gone; none over the cone, the cups or the name
      // (emojiStage, spin)
      {
        const RF = makeRandom(Math.floor(seed * 1e6) + 2024), flowers = [], cs = h * 0.26;
        const keep = [[hx - S * 0.4, hx + S * 0.4, iceC - iceH * 0.55, iceC + iceH * 0.55], [nx - tw / 2, nx + tw / 2, ny - th / 2, ny + th / 2]];
        if (wide) keep.push([nx - tw * 0.22 - cs * 0.5, nx + tw * 0.22 + cs * 0.5, 0, h * 0.06 + cs * 1.15]);
        for (let tries = 0; flowers.length < (wide ? 22 : 18) && tries < 600; tries++) {
          const fs = m * RF.range(0.07, 0.15), px = RF.range(-w / 2 + fs * 0.5, w / 2 - fs * 0.5), py = RF.range(fs * 0.5, h - fs * 0.5);
          if (keep.some(([x0, x1, y0, y1]) => px + fs * 0.45 > x0 && px - fs * 0.45 < x1 && py + fs * 0.45 > y0 && py - fs * 0.45 < y1)) continue;
          if (flowers.some((f) => Math.hypot(f.x - px, f.y + f.s / 2 - py) < (f.s + fs) * 0.42)) continue;
          const hold = RF.range(0.5, 1.4), t0 = RF.range(0, P - hold - 0.9);
          flowers.push({ pic: solidGlyph('blossom', '#ff9cbf', 1), x: px, y: py - fs / 2, s: fs, kind: 9, t0, amp: hold + 0.5, per: RF.range(0.9, 1.6) * (RF.next() < 0.5 ? -1 : 1) });
        }
        const fm = emojiStage(flowers, { P, clip: [-w / 2, w / 2, 0, h], brand: BRANDS.indexOf(b) });
        fm.rotation.y = turn; fm.position.set(x, y - h / 2, z); fm.translateZ(0.13);
        caseLabels.push(fm);
      }
      // (its name in dots, a character after another, in its round hand; its English under it as it was)
      caseLabels.push(popName(at(new THREE.PlaneGeometry(tw, th).translate(nx, ny, d * 0.9)), b.name, b.en, tw / th, P, 1.1, caseFonts.round, false));
      {
        const n = [...b.name].length, nh = th * 0.6, cellN = 0.8 * 1.08 * nh / tw, x0N = (1 - n * cellN) / 2;
        caseLabels.push(dotPicture(at(new THREE.PlaneGeometry(tw, nh).translate(nx, ny + th * 0.12, d * 0.9)), tw, nh, Math.round(tw / (dot * 0.8)), (g, W, H) => {
          g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `400 ${H * 0.8}px ${caseFonts.round}`;
          [...b.name].forEach((ch, i) => g.fillText(ch, (x0N + (i + 0.5) * cellN) * W, H * 0.52));
        }, { P, brand: BRANDS.indexOf(b), reveal: 'chars', at: 1.1, band: [x0N, n * cellN, n], blush: false }));
      }
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // the tide, seen from above (scene.tide): a coastal town at night on the left, its beach, the sea coming in over
    // the sand and going out again (toon.js glowMaterial, tide); as the water rises the town's lights come on one
    // by one, and sparks in the shallows, and go out as it falls; a breakwater with its turbines across the bay;
    // the brand's mark and name in the sea, bottom right
    if (scene.tide) {
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const p0 = new THREE.Vector3(-w / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(x, 0, z));
      const clip = [p0.x, p0.z, dir.x, dir.z], clip2 = [w, y - h / 2, y + h / 2, 0];
      const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k).toArray();
      const curve = (yy) => h * (0.035 * Math.sin((yy / h) * 7 + 1) + 0.02 * Math.sin((yy / h) * 13));
      const xl = -w * 0.16, xh = -w * 0.08, xlow = w * 0.16, amp = xlow - xh, far = w / 2 + amp + 0.1;
      // a band from a wavy left edge (x0 + the shore's curve) to x1, as a flat shape at depth zz
      const band = (x0, x1, zz, wob = 1) => {
        const pts = [];
        for (let k = 0; k <= 24; k++) { const yy = (k / 24) * h; pts.push(new THREE.Vector2(x0 + curve(yy) * wob, yy)); }
        pts.push(new THREE.Vector2(x1, h), new THREE.Vector2(x1, 0));
        return new THREE.ShapeGeometry(new THREE.Shape(pts.reverse())).translate(0, 0, zz);
      };
      // the land, its blocks between streets
      shown(at(box(-w / 2, w / 2, 0, h, 0.03, 0.06)), col('#1e4745'));
      const bs = h * 0.07, gap = h * 0.018;
      for (let by = gap; by < h - bs * 0.5; by += bs + gap) {
        for (let bx = -w / 2 + gap; bx < xl - bs * 0.6; bx += bs + gap) {
          if (bx + bs > xl + curve(by) * 0.8 - gap) continue;
          shown(at(box(bx, bx + bs, by, Math.min(by + bs, h - gap), 0.062, 0.063)), col(R.pick(['#163634', '#1a3c3b', '#133230'])));
        }
      }
      // the beach: dry sand, then the sand the tide wets
      shown(at(band(xl, w / 2, 0.064, 0.8)), col('#cdbb94', 0.85));
      shown(at(band(xh, w / 2, 0.066)), col('#9e977f', 0.85));
      // the sea, layer on layer out to the deep, a line of foam at its edge: each a little behind the one before
      for (const [dx, hex, k, zz, lag] of [[-w * 0.012, '#eafcff', 1.1, 0.068, -0.12], [0, '#5fd6c8', 0.9, 0.069, 0], [w * 0.1, '#2a9bb5', 0.85, 0.07, 0.15], [w * 0.24, '#14557e', 0.9, 0.071, 0.3]]) {
        tidal(at(band(xlow + dx, far, zz)), col(hex, k), [0, 0, amp, lag], clip, clip2);
      }
      // sparks in the shallows, carried with them, lit as the water rises
      const A = (w * h) / (m * m);                                             // (its area, as so many squares of its short side)
      for (let k = 0; k < Math.round(A * 40); k++) {
        const sx = R.range(xlow + w * 0.02, w * 0.42), sy = R.range(h * 0.04, h * 0.96);
        tidal(at(new THREE.CircleGeometry(m * R.range(0.006, 0.012), 6).translate(sx + curve(sy) * 0.6, sy, 0.075)), col('#bffcff', 1.7), [1, R.range(0.45, 0.95), amp, 0.05], clip, clip2);
      }
      // the breakwater across the bay, its turbines lit while the tide runs
      const wy = h * 0.72, wx1 = w * 0.3;
      shown(at(box(xl + curve(wy) * 0.8, wx1, wy - h * 0.014, wy + h * 0.014, 0.08, 0.082)), col('#b9c2c8', 0.8));
      for (let k = 0; k < 4; k++) {
        const tx = xh + (k + 0.5) * (wx1 - xh) / 4;
        shown(at(box(tx - h * 0.025, tx + h * 0.025, wy - h * 0.025, wy + h * 0.025, 0.083, 0.084)), col('#5d6b75'));
        tidal(at(new THREE.CircleGeometry(h * 0.012, 8).translate(tx, wy, 0.086)), col('#3cffc8', 1.5), [1, 0.1 + k * 0.08, 0, 0], clip, clip2);
      }
      // the town's lights: along its streets and in its windows, warm and mint, each with its own mark
      for (let k = 0; k < Math.round(A * 70); k++) {
        const ly = R.range(h * 0.03, h * 0.97), lx = R.range(-w / 2 + h * 0.02, xl + curve(ly) * 0.8 - h * 0.03);
        tidal(at(new THREE.CircleGeometry(m * R.range(0.005, 0.01), 6).translate(lx, ly, 0.07)), R.chance(0.7) ? col('#ffd27a', 1.6) : col('#3cffc8', 1.4), [1, R.range(0.15, 0.9), 0, 0], clip, clip2);
      }
      // the brand's mark (game-icons' high tide) and its name, in the sea at the bottom right
      const b = BRANDS.find((bb) => bb.key === brand), lh = m * 0.13, tw = m * 0.42, th = m * 0.13;
      const mx = w / 2 - m * 0.06 - tw - lh * 0.6, my = m * 0.1;
      const mark = iconShape('high-tide', lh);
      if (mark) shown(at(mark.translate(mx, my, d * 0.6)), col('#3cffc8', 1.3));
      caseLabels.push(canvasPlane(at(new THREE.PlaneGeometry(tw, th).translate(w / 2 - m * 0.06 - tw / 2, my, d * 0.6)), tw / th, true, (g, W, H) => {
        g.fillStyle = '#eafcff'; g.textBaseline = 'middle';
        g.font = `600 ${H * 0.5}px "PingFang SC", "Noto Sans SC", sans-serif`;
        g.fillText(b.name, 0, H * 0.34, W);
        g.fillStyle = '#9ff5e0'; g.font = `500 ${H * 0.2}px "PingFang SC", sans-serif`;
        g.fillText(b.en.split('').join(String.fromCharCode(8202)), 0, H * 0.82, W);
      }, 512));
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    // the Star Ring: night-blue space, stars, the edge of the Earth below, and the station so near that only a
    // great part of its wheel shows, turning slowly, as the station turns in 2001 while the waltz plays
    if (scene.space) {
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const axis = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const p0 = new THREE.Vector3(-w / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(x, 0, z));
      const clip = [p0.x, p0.z, dir.x, dir.z], clip2 = [w, y - h / 2, y + h / 2, 0];
      shown(at(box(-w / 2, w / 2, 0, h, 0.03, 0.06)), [0.02, 0.05, 0.16]);
      for (let k = 0; k < Math.round(w * h / (m * m) * 30); k++) {
        const r = m * R.range(0.004, 0.009);
        shown(at(new THREE.OctahedronGeometry(r, 0).translate(R.range(-w / 2, w / 2), R.range(0, h), 0.07)), R.chance(0.2) ? [1.4, 1.2, 0.9] : [1.4, 1.5, 1.7]);
      }
      // the Earth's edge, low in a corner, its air lit
      // (a flat disc that takes the light as a globe would: each point's normal the sphere's there, so it falls into
      // the same two tones as the station, its day side up and to the left, its night to the right with cities lit)
      const er = h * 1.1, ex = -w / 2 + h * 0.35, ey = -er + h * 0.3, still = [0, 0, 0, 0], up = [0, 1, 0, 0];
      // (its sun further to the side than the station's, so that its night begins where it shows: its normals
      // turned so that the shader's light falls on them as this one would)
      const lit3 = [...clip2.slice(0, 3), 1], toLight = new THREE.Vector3(-0.92, 0.32, 0.2).normalize();
      const turnN = new THREE.Quaternion().setFromUnitVectors(toLight, new THREE.Vector3(-0.7, 0.7, 0.12).normalize()), nv = new THREE.Vector3();
      const globe = (g, cx, cy) => {                                            // sphere normals on a flat shape
        const p = g.attributes.position, nn = g.attributes.normal;
        for (let i = 0; i < p.count; i++) {
          const dx = (p.getX(i) + cx - ex) / er, dy = (p.getY(i) + cy - ey) / er, r2 = Math.min(dx * dx + dy * dy, 0.995);
          nv.set(dx, dy, Math.sqrt(1 - r2)).applyQuaternion(turnN);
          nn.setXYZ(i, nv.x, nv.y, nv.z);
        }
        return g.translate(cx, cy, 0);
      };
      spinning(at(globe(new THREE.RingGeometry(0.0001, er, 72, 18), ex, ey).translate(0, 0, 0.075)), [0.16, 0.38, 0.88], still, up, clip, lit3);
      // its lands near the top of it, where it shows
      for (let k = 0; k < 9; k++) {
        const a = Math.PI / 2 + R.range(-0.75, 0.6), rr = er * R.range(0.8, 0.96), sz = h * R.range(0.035, 0.09);
        const pts = [];
        for (let j = 0; j < 8; j++) { const t = (j / 8) * Math.PI * 2; pts.push(new THREE.Vector2(Math.cos(t) * sz * R.range(0.6, 1.2) * 1.4, Math.sin(t) * sz * R.range(0.5, 1.0) * 0.6)); }
        const land = new THREE.ShapeGeometry(new THREE.Shape(pts));
        spinning(at(globe(land, ex + Math.cos(a) * rr, ey + Math.sin(a) * rr).translate(0, 0, 0.079)), [0.34, 0.62, 1.05], still, up, clip, lit3);
      }
      // its cities, on the night side
      for (let k = 0; k < 70; k++) {
        const a = Math.PI / 2 + R.range(-0.8, 0.1), rr = er * R.range(0.8, 0.99);
        const dx = Math.cos(a) * rr / er, dy = Math.sin(a) * rr / er, nz = Math.sqrt(Math.max(1 - dx * dx - dy * dy, 0));
        if (dx * toLight.x + dy * toLight.y + nz * toLight.z > -0.05) continue;
        spinning(at(new THREE.OctahedronGeometry(h * R.range(0.004, 0.008), 0).translate(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, 0.083)), [1.7, 1.35, 0.6], still, up, clip, clip2);
      }
      // its air: a soft glow round it, fading out into space, stronger on its day side (a ring whose colour runs
      // from the glow at the Earth's edge to the space behind, vertex by vertex)
      {
        const segs = 120, rings = 6, halo = spinning(at(new THREE.RingGeometry(er * 0.995, er * 1.13, segs, rings).translate(ex, ey, 0.074)), [0, 0, 0], still, up, clip, clip2);
        const col = halo.attributes.color, space = [0.02, 0.05, 0.16];
        for (let j = 0; col && j <= rings; j++) for (let i = 0; i <= segs; i++) {        // (none: drawn for its numbers only)
          const th = (i / segs) * Math.PI * 2, out = Math.pow(j / rings, 0.6);
          const day = THREE.MathUtils.clamp(Math.cos(th) * toLight.x + Math.sin(th) * toLight.y, -1, 1) * 0.5 + 0.5;
          const glowK = (1 - out) * (0.45 + 0.75 * day);
          col.setXYZ(j * (segs + 1) + i, space[0] + (0.42 - space[0]) * glowK, space[1] + (0.95 - space[1]) * glowK, space[2] + (1.6 - space[2]) * glowK);
        }
      }
      // the station: its wheel's rim, windows lit along it, spokes to its hub (beyond the case)
      // (in an upright case its wheel off to the right, smaller, its rim sweeping down the case's right third)
      const tall = w < h, R0 = h * (tall ? 1.0 : 1.35), cxl = tall ? h * 1.05 : w / 2 - h * 0.05, cyl = h * (tall ? 0.45 : 1.25), zc = d * 0.5, hs = tall ? h * 0.65 : h;   // hs: how big its parts are
      const cw = new THREE.Vector3(cxl, cyl, zc).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(x, y - h / 2, z));
      const spin = [cw.x, cw.y, cw.z, 0.045], ax = [axis.x, axis.y, axis.z, R.range(0, 6.3)];
      // (its structure lit from up and to the left, in two tones; its windows lit from within)
      const shaded = [...clip2.slice(0, 3), 1];
      const part = (g, rgb, shade = true) => spinning(at(g.translate(cxl, cyl, zc)), rgb, spin, ax, clip, shade ? shaded : clip2);
      part(new THREE.TorusGeometry(R0, hs * 0.075, 10, 160), [0.62, 0.66, 0.72]);
      part(new THREE.TorusGeometry(R0 - hs * 0.12, hs * 0.02, 6, 160), [0.4, 0.44, 0.5]);
      // its portholes, mostly warm yellow, in two rows along the rim's face and one along the inner ring
      for (const [rr, zz, n, skip] of [[R0 + hs * 0.022, hs * 0.068, 200, 0.2], [R0 - hs * 0.025, hs * 0.07, 200, 0.35], [R0 - hs * 0.12, hs * 0.022, 140, 0.5]]) {
        for (let k = 0; k < n; k++) {
          if (R.chance(skip)) continue;
          const a = (k / n) * Math.PI * 2, sz = hs * (rr < R0 - hs * 0.1 ? 0.012 : 0.017);
          part(new THREE.BoxGeometry(sz * 1.6, sz, sz).rotateZ(a + Math.PI / 2).translate(Math.cos(a) * rr, Math.sin(a) * rr, zz), R.chance(0.88) ? [1.8, 1.4, 0.55] : [0.7, 1.4, 1.7], false);
        }
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        part(new THREE.CylinderGeometry(hs * 0.02, hs * 0.02, R0, 8).rotateZ(Math.PI / 2).translate(R0 / 2, 0, 0).rotateZ(a), [0.5, 0.54, 0.6]);
      }
      part(new THREE.CylinderGeometry(hs * 0.2, hs * 0.2, hs * 0.08, 24).rotateX(Math.PI / 2), [0.7, 0.74, 0.8]);
      // its name, one character after another, a while in the middle, then gone
      const b = BRANDS.find((bb) => bb.key === brand), tw = Math.min(w * (tall ? 0.7 : 0.55), h * 1.3), th = tw * 0.32;
      const when = R.range(0, 12);
      if (scene.named !== false) caseLabels.push(revealName(at(new THREE.PlaneGeometry(tw, th).translate(tall ? -w * 0.12 : 0, h * (tall ? 0.7 : 0.5), d * 0.95)), b.name, b.en, tw / th, when));
      return;
    }
    if (scene.strips) {
      const n = scene.oneRow ? 1 : (scene.iconRows || scene.strips).length, bandH = h / n, ground = lit('#f7c548', 0.95), INK = [0.06, 0.05, 0.1];
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const p0 = new THREE.Vector3(-w / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(x, 0, z));
      shown(at(box(-w / 2, w / 2, 0, h, 0.03, 0.06)), ground);
      // (its rows as icons, if they were loaded: each one's shapes, the 512 square of its file made 1 high, y up)
      const iconRow = (name) => (P) => {
        const g = new THREE.ShapeGeometry(icons[name], 6).scale(1 / 512, -1 / 512, 1), ix = g.index.array;
        for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];   // (facing out again)
        g.index.needsUpdate = true;
        P.solid(g);
      };
      const kinds = icons && scene.iconRows?.every((name) => icons[name]?.length) ? scene.iconRows.map(iconRow) : scene.strips;
      // (one row: each of its things in turn along it)
      const rows = scene.oneRow ? [kinds] : kinds.map((row) => [row]);
      rows.forEach((row, i) => {
        const yb = h - (i + 1) * bandH;
        const S = bandH * (scene.single ? 0.7 : 0.78), count = scene.single ? 1 : Math.max(2, Math.round(w / (S * 1.3))), step = w / count;
        // the middle row: the brand's name held still in its middle, over the places there (the cakes pass
        // behind it, and stop either side of it)
        if (i === (scene.oneRow ? 0 : 1) && scene.named !== false) {
          const lw = (count % 2 ? 3 : 2) * step * 0.94, lh = bandH * 0.8, b = BRANDS.find((bb) => bb.key === brand);
          caseLabels.push(nameplate(at(new THREE.PlaneGeometry(lw, lh).translate(0, yb + bandH / 2, Math.max(d * 0.85, 0.11))), b.name, b.en, lw / lh));
        }
        // each turn (6.4 s) a row sets off, three places along in two seconds, and rests
        const way = [p0.x, p0.z, dir.x, dir.z], along = (uc) => [w, uc, scene.single ? 0 : (i % 2 ? 1 : -1) * step * 3, 6.4];
        // the cake once, to find its middle: each one set with its middle on the row's
        const all = row.map((thing) => {
          const parts = [];
          thing({ solid: (g) => parts.push([g, INK]), cut: (g) => parts.push([g, ground]), light: (g, rgb) => parts.push([g, rgb]) });
          const bb = new THREE.Box3();
          for (const [g] of parts) { g.computeBoundingBox(); bb.union(g.boundingBox); }
          return [parts, (bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2];
        });
        for (let k = 0; k < (scene.single ? 1 : count * 2); k++) {
          const uc = scene.single ? w / 2 : -w + (k + 0.5) * step, [parts, mx, my] = all[k % all.length];
          for (const [g, rgb] of parts) {
            sliding(at(g.clone().translate(-mx, -my, 0).scale(S, S, 1).translate(-w / 2 + uc, yb + bandH / 2, Math.max(d * 0.5, 0.08))), rgb, way, along(uc));
          }
        }
        for (const [parts] of all) for (const [g] of parts) g.dispose();
      });
      if (y - h / 2 < 2.5) {
        const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
        g.computeBoundingBox();
        boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
        g.dispose();
      }
      return;
    }
    const back = R.pick(['bands', 'bands', 'flat', 'split', 'split', 'disc', 'disc', 'night']);
    const make = back === 'night' ? 'paper' : R.pick(['paper', 'paper', 'lowpoly', 'lowpoly', 'shadow']);
    const backBox = (y0b, y1b, rgb) => shown(at(box(-w / 2, w / 2, y0b, y1b, 0.03, 0.06)), rgb);
    if (back === 'bands') {
      const a = new THREE.Color(...lit(c1, 1)), b = new THREE.Color(...lit(c2, 0.85));
      for (let i = 0; i < 4; i++) backBox(h * i / 4, h * (i + 1) / 4, a.clone().lerp(b, i / 3).toArray());
    } else if (back === 'split') {
      const k = R.range(0.28, 0.42);
      backBox(0, h * k, lit(c2, 0.8));
      backBox(h * k, h, lit(c1, 0.95));
    } else if (back === 'night') {
      backBox(0, h, [0.04, 0.06, 0.13]);
      for (let k = 0; k < 14; k++) shown(at(new THREE.OctahedronGeometry(m * 0.008, 0).translate(R.range(-w / 2, w / 2), R.range(h * 0.2, h), 0.08)), [1.5, 1.5, 1.6]);
    } else backBox(0, h, lit(c1, 0.95));
    const discAt = back === 'disc';
    // what stands in it: the unit frame of ads/scenes.js made S high (and squeezed through, a relief) at (cx, cy)
    const thing = (role, cx, cy, S) => {
      const sz = Math.min(S, d * 0.7), fit = (g) => at(g.scale(S, S, sz).translate(cx, cy, d * 0.5));
      if (discAt) shown(at(new THREE.CircleGeometry(S * 0.55, 10).translate(cx, cy + S * 0.5, 0.065)), lit(c2, 1.0));
      let part = 0;
      role({
        solid: (g, hex, al = 0.85) => {
          part++;
          if (make === 'lowpoly') {
            const f = fit(g.index ? g.toNonIndexed() : g);
            f.computeVertexNormals();
            caseIn.add(f, { aAlbedo: al, aTint: new THREE.Color(hex).toArray() });
          } else if (make === 'shadow') shown(fit(g), [0.05, 0.05, 0.09]);
          else shown(fit(g), lit(hex, 0.82 - (part % 3) * 0.07));
        },
        light: (g, rgb) => shown(fit(g), rgb),
      });
    };
    const ledge = (yy) => props(at(box(-w / 2, w / 2, yy - m * 0.025, yy, 0.06, d * 0.92)), 0.3, SLATE);
    const y0 = m * 0.05, A = w / h;
    ledge(y0);
    if (A >= 1.6) {                                                             // a banner: the hero on the left, the small things beside it
      const S = h * 0.78, hx = -w / 2 + S * 0.62, s2 = h * 0.5;
      thing(scene.hero, hx, y0, S);
      for (let cx = hx + S * 0.62 + s2 * 0.6; cx < w / 2 - s2 * 0.55; cx += s2 * 1.4) thing(scene.small, cx, y0, s2);
    } else if (A <= 0.8) {                                                      // a tall strip: the hero, small things on shelves below
      const S = w * 0.8, hy = h - S * 1.1, s2 = w * 0.55;
      if (hy - s2 * 1.3 > y0 - 1e-3) {
        thing(scene.hero, 0, hy, S);
        for (let yy = hy - s2 * 1.3; yy > y0 - 1e-3; yy -= s2 * 1.3) { ledge(yy); thing(scene.small, 0, yy, s2); }
      } else {                                                                  // (no room for them: the hero raised on a shelf of its own)
        const yh = Math.max(y0, (h - S) * 0.45);
        if (yh > y0 + 0.01) ledge(yh);
        thing(scene.hero, 0, yh, S);
      }
    } else {                                                                    // a poster: the hero in the middle, small things either side
      const S = m * 0.66, s2 = m * 0.34;
      thing(scene.hero, 0, y0, S);
      if (w > S + s2 * 2.3) for (const e of [-1, 1]) thing(scene.small, e * (S * 0.5 + s2 * 0.75), y0, s2);
    }
    // what drifts in its air
    const air = AIR[scene.air];
    if (air) {
      const n = THREE.MathUtils.clamp(Math.round(Math.max(A, 1 / A) * (air.few ? 3 : 6)), 4, 28);
      for (let k = 0; k < n; k++) {
        const r = air.size * m * R.range(0.7, 1.3), px = R.range(-w / 2 + r * 2, w / 2 - r * 2), py = R.range(h * 0.3, h * 0.95), pz = R.range(0.15, 0.6) * d;
        const g = air.shape === 'wisp' ? new THREE.SphereGeometry(r, 8, 5).scale(0.4, 3, 0.4)
          : air.shape === 'streak' ? new THREE.BoxGeometry(r * 0.15, r * 3, r * 0.15)
          : air.shape === 'ring' ? new THREE.TorusGeometry(r, r * 0.18, 4, 12)
          : air.shape === 'star' ? new THREE.OctahedronGeometry(r, 0) : new THREE.IcosahedronGeometry(r, 0);
        const c = at(g.translate(px, py, pz)), mid = new THREE.Vector3();
        c.computeBoundingBox(); c.boundingBox.getCenter(mid);
        drifting(c, air.rgb, mid.toArray(), R.next());
      }
    }
    // low enough to walk into: in the way
    if (y - h / 2 < 2.5) {
      const g = at(box(-w / 2 - rim, w / 2 + rim, 0, 0.1, 0, d));
      g.computeBoundingBox();
      boxCollider(g.boundingBox.min.x, g.boundingBox.max.x, g.boundingBox.min.z, g.boundingBox.max.z);
      g.dispose();
    }
  }

  // A flower bed on the pavement, side s, across from a0 to a1 (from the street's middle), along from za to zb,
  // the ground at F: stone, soil, drifts of one flower each with leaves between, motes over it, two little garden
  // lamps standing among the flowers, small lights along its edges. Whoever stood there stands elsewhere.
  function flowerBed(s, a0, a1, za, zb, F, Q) {
    const X = (a) => s * a, DIM = [0.25, 0.5, 0.55], PALE = [0.9, 1.25, 1.3];
    props(box(X(a0), X(a1), F, F + 0.45, za, zb), 0.72, TINT.stone);
    props(box(X(a0 + 0.08), X(a1 - 0.08), F + 0.44, F + 0.455, za + 0.08, zb - 0.08), 0.16, TINT.soil);   // the soil
    glow(box(X(a0) - 0.01, X(a0) + 0.01, F + 0.36, F + 0.4, za, zb), DIM);
    boxCollider(X(a0), X(a1), za, zb);
    let kind = Q.pick(['bedRound', 'bedCupped', 'bedStar', 'bedSpike']), until = za;
    for (let z = za + 0.22; z < zb - 0.15; z += 0.3) {
      if (z > until) { kind = Q.pick(['bedRound', 'bedCupped', 'bedStar', 'bedSpike', 'leaves']); until = z + Q.range(0.8, 1.8); }
      for (let a = a0 + 0.28; a < a1 - 0.2; a += 0.32) {
        const k = Q.chance(0.2) ? 'leaves' : kind;
        streetGoods.put(k, X(a + Q.range(-0.06, 0.06)), F + 0.45, z + Q.range(-0.06, 0.06), { rot: Q.range(0, 6.3), scale: Q.range(0.85, 1.2), tone: Q.range(0.8, 1.05) });
      }
    }
    for (let i = 0; i < (zb - za) * 2; i++) streetGoods.put('mote', X(Q.range(a0, a1)), F + Q.range(0.6, 1.4), Q.range(za, zb));
    for (const k of [1 / 3, 2 / 3]) {
      const z = za + (zb - za) * k, a = (a0 + a1) / 2;
      props(box(X(a) - 0.03, X(a) + 0.03, F + 0.45, F + 1.25, z - 0.03, z + 0.03), 0.4);
      glow(box(X(a) - 0.07, X(a) + 0.07, F + 1.18, F + 1.3, z - 0.07, z + 0.07), PALE);
      emitters.push({ x: X(a), y: F + 1.2, z, nx: 0, ny: -1, nz: 0, power: 1.0, reach: 3.2, tint: 0.1 });
    }
    for (const [a, f] of [[a0 - 0.05, 1], [a1 + 0.05, -1]]) emitters.push({ x: X(a), y: F + 0.3, z: (za + zb) / 2, nx: s * f * 0.86, ny: 0.51, nz: 0, power: 0.9, reach: 4.5, tint: 0.15 });
    const [x0, x1] = sorted(X(a0), X(a1));
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      if (p.x > x0 - 0.6 && p.x < x1 + 0.6 && p.z > za - 0.6 && p.z < zb + 0.6 && Math.abs(p.y - F) < 1) people.splice(i, 1);
    }
  }

  // A glass rain shelter on the pavement, side s, its glass back at ab (toward the road), its roof out to af, along
  // from za to zb: a thin roof with lit edges on posts along its back, the glass back with the line's map and an ad
  // (inner) inside and an ad on the street side (outer), a bench with places to charge, two posts with sockets;
  // holo: its hologram over it (only the one by the bookshop).
  function rainShelter(s, ab, af, za, zb, F, Q, { holo = false, inner, outer, outerScene = null, outerWideScene = outerScene }) {
    const X = (a) => s * a, top = 2.9, mid = (za + zb) / 2;
    const toStreet = s < 0 ? 'x' : '-x', fromStreet = s < 0 ? '-x' : 'x';
    const DIM = [0.25, 0.5, 0.55], PALE = [0.9, 1.25, 1.3];
    props(box(X(ab - 0.2), X(af), top - 0.08, top, za, zb), 0.9);
    for (const a of [ab - 0.2, af]) glow(box(X(a) - 0.02, X(a) + 0.02, top - 0.09, top + 0.01, za, zb), CYAN);
    glow(box(X(ab + 0.6), X(af - 0.6), top - 0.11, top - 0.08, za + 0.4, zb - 0.4), SOFT);
    for (const z of [za + 0.2, mid, zb - 0.2]) props(box(X(ab) - 0.05, X(ab) + 0.05, F, top - 0.08, z - 0.05, z + 0.05), 0.85);
    glow(box(X(ab) - 0.015, X(ab) + 0.015, F + 0.25, F + 0.28, za + 0.25, zb - 0.25), DIM);
    glow(box(X(ab) - 0.015, X(ab) + 0.015, top - 0.35, top - 0.32, za + 0.25, zb - 0.25), DIM);
    wall(X(ab - 0.15), X(ab + 0.15), za, zb, -1, top);
    // inside: the city's board (the time, the weather, the next train: see infoBoard) where the metro's sign
    // was, and the ad on its outside again, upright (inner: what was shown there, its number still drawn)
    Q.next();
    infoBoards.push(panel(3.4, 1.3, X(ab + 0.06), F + 1.85, mid - 1.6, fromStreet));
    adPanel(1.5, 2.0, X(ab + 0.06), F + 1.4, mid + 1.9, fromStreet, outer, Q.next(), outerScene);
    adPanel(4.6, 2.1, X(ab - 0.06), F + 1.45, mid, toStreet, outer, Q.next(), outerWideScene);
    emitters.push({ x: X(ab - 0.5), y: F + 1.5, z: mid, nx: -s, ny: 0, nz: 0, power: 0.6, reach: 12, tint: 0.6 });
    emitters.push({ x: X(ab + 0.5), y: F + 1.8, z: mid, nx: s, ny: 0, nz: 0, power: 0.5, reach: 8, tint: 0.5 });
    props(box(X(ab + 0.1), X(ab + 0.55), F + 0.44, F + 0.5, za + 0.6, mid + 0.6), 0.85);
    for (const z of [za + 0.8, mid + 0.4]) props(box(X(ab + 0.12), X(ab + 0.5), F, F + 0.44, z - 0.04, z + 0.04), 0.4);
    for (let z = za + 1.2; z < mid + 0.4; z += 1.1) glow(box(X(ab + 0.2), X(ab + 0.42), F + 0.5, F + 0.51, z - 0.12, z + 0.12), PALE);
    boxCollider(X(ab), X(ab + 0.6), za + 0.6, mid + 0.6);
    for (const z of [za + 0.35, zb - 0.35]) {
      props(box(X(af - 0.35) - 0.09, X(af - 0.35) + 0.09, F, F + 1.1, z - 0.09, z + 0.09), 0.6);
      for (const y of [0.75, 0.9]) glow(new THREE.TorusGeometry(0.025, 0.006, 4, 12).rotateY(Math.PI / 2).translate(X(af - 0.35) - s * 0.095, F + y, z), CYAN);
      glow(box(X(af - 0.35) - 0.1, X(af - 0.35) + 0.1, F + 1.1, F + 1.12, z - 0.1, z + 0.1), CYAN);
      colliders.push({ x: X(af - 0.35), z, r: 0.2 });
    }
    covers.push({ ...xzBox(X(ab - 0.2), X(af), za, zb), y: top - 0.08 });
    lamps.push({ x: X((ab + af) / 2), y: top - 0.2, z: mid, power: 0.4 });
    for (const [a, z] of [[ab + 0.35, za + 2.0], [af - 1.0, mid + 1.2]]) people.push({ x: X(a), y: F, z, rot: Q.range(0, 6.3), umbrella: false });
  }

  // The tower next door stands on a low plinth, three steps up from the pavement.
  function plinth(s, zB, zA, front) {
    const X = (a) => s * a, P = PLINTH, z0 = zB + 0.5, z1 = zA - 0.5;
    const DIM = [0.25, 0.5, 0.55];
    props(box(X(FACADE), X(front + 1), 0, P - 0.02, z0, z1), 0.72);
    raised.push(box(X(FACADE), X(front + 0.4), P - 0.02, P, z0, z1));
    lifts.push({ ...xzBox(X(FACADE), X(front), z0, z1), y: P });
    floorAt(X(FACADE), X(front + 1), z0, z1, () => P);
    const a0 = FACADE - 0.81, tr = 0.27;
    for (let i = 0; i < 3; i++) {
      const top = CURB + ((i + 1) * (P - CURB)) / 3;
      props(box(X(a0 + i * tr), X(FACADE), 0, top, z0, z1), 0.72);
      glow(box(X(a0 + i * tr) - 0.02, X(a0 + i * tr) + 0.02, top - 0.03, top, z0 + 0.3, z1 - 0.3), DIM);
    }
    floorAt(X(a0), X(FACADE), z0, z1, (x) => CURB + THREE.MathUtils.clamp((Math.abs(x) - a0) / (FACADE - a0), 0, 1) * (P - CURB));
    for (const zz of [z0, z1]) wall(X(a0), X(front + 1), zz - 0.25, zz + 0.25, -1, P - 0.4);
  }

  // 深蓝计算's sculpture, on the pavement below its plinth's steps: a hologram of cubes over a round foot, turning
  // slowly. A great cube of them, 6 on a side, holds a while, then bursts upward and its cubes fly as a flock (each
  // steering a little toward its neighbours' heading, toward the flock's middle, away from any too near), drawn up
  // round the foot's axis to a point that rises, wanders up and down and sinks again, each at a height of its own
  // in the flock, so that aloft it stands tall; then they fly home and build the cube again from its foot up; a
  // round of 24 s. The flight worked out once as it is built (its own numbers), every cube's place frame by frame
  // in a texture; the shader moves them. The brighter the faster
  function antSculpture() {
    const plot = plots.find((p) => p.site === 'plinth');
    if (!plot) return;
    const s = plot.s, X = (a) => s * a, a = 10.5;
    const clear = (z) => colliders.every((c) => (c.r !== undefined ? Math.hypot(c.x - X(a), c.z - z) > c.r + 1.7
      : X(a) + 1.4 < c.x0 || X(a) - 1.4 > c.x1 || z + 1.4 < c.z0 || z - 1.4 > c.z1));
    const zw = (plot.zB + plot.zA) / 2;
    const z = [0, 2, -2, 4, -4, 6, -6, 8, -8].map((dd) => zw + dd).find(clear);
    if (z === undefined) return;
    const Nn = 6, C = Nn * Nn * Nn, cell = 0.3, P = 24, FPS = 10, F = P * FPS;
    const home = [];
    for (let zz = 0; zz < Nn; zz++) for (let y = 0; y < Nn; y++) for (let x = 0; x < Nn; x++) home.push([(x - 2.5) * cell, (y - 2.5) * cell, (zz - 2.5) * cell]);
    // (the round: held, 0–3 s; flying, 3–17 s; home, 17–21 s (each cube in turn from the foot up); held)
    const Rb = makeRandom(9091);
    const pos = home.map((p) => [...p]), vel = home.map((p) => {                 // (bursting upward)
      const l = Math.hypot(...p) || 1;
      return [p[0] / l * Rb.range(0.5, 1.0) + Rb.range(-0.3, 0.3), Rb.range(1.1, 1.8) + p[1] * 0.4, p[2] / l * Rb.range(0.5, 1.0) + Rb.range(-0.3, 0.3)];
    });
    const lane = home.map(() => Rb.range(-1, 1));                              // (each one's own height in the flock)
    const data = new Float32Array(C * F * 4), dt = 1 / FPS / 2;
    const lerp = (q, r, t) => q.map((v, i) => v + (r[i] - v) * t), ease = (t) => t * t * (3 - 2 * t);
    for (let f = 0; f < F; f++) {
      const t = f / FPS;
      if (t >= 3 && t < 21) for (let sub = 0; sub < 2; sub++) {
        const tt = t + sub * dt;
        // the point it is drawn to: round the axis, close in; up, wandering up and down, and down again
        const rise = ease(THREE.MathUtils.clamp((tt - 3) / 4.5, 0, 1)), fall = ease(THREE.MathUtils.clamp((tt - 13.5) / 3.5, 0, 1));
        const aim = [Math.cos(tt * 0.9) * 0.45, 0.3 + 2.1 * rise - 1.8 * fall + 0.45 * Math.sin(tt * 0.75) * rise * (1 - fall), Math.sin(tt * 0.9) * 0.45];
        const tall = 1.8 * rise * (1 - fall);                                   // (how far apart, up and down, aloft)
        for (let i = 0; i < C; i++) {
          const p = pos[i], v = vel[i], acc = [0, 0, 0];
          let n = 0; const al = [0, 0, 0], co = [0, 0, 0];
          for (let j = 0; j < C; j++) {
            if (j === i) continue;
            const q = pos[j], dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 0.64) {
              n++; for (let k = 0; k < 3; k++) { al[k] += vel[j][k]; co[k] += q[k]; }
              if (d2 < 0.2) { const kk = 1.2 / (d2 + 0.02); acc[0] -= dx * kk; acc[1] -= dy * kk; acc[2] -= dz * kk; }
            }
          }
          if (n) for (let k = 0; k < 3; k++) acc[k] += (al[k] / n - v[k]) * 0.9 + (co[k] / n - p[k]) * (k === 1 ? 0.06 : 0.2);
          acc[0] += (aim[0] - p[0]) * 0.9; acc[2] += (aim[2] - p[2]) * 0.9;
          acc[1] += (aim[1] + lane[i] * tall - p[1]) * 0.35;
          if (p[1] < -1.2) acc[1] += (-1.2 - p[1]) * 6;                // (kept off the pavement)
          for (let k = 0; k < 3; k++) v[k] += acc[k] * dt;
          const sp = Math.hypot(...v), want = THREE.MathUtils.clamp(sp, 0.7, 1.8);
          for (let k = 0; k < 3; k++) { v[k] *= want / (sp || 1); p[k] += v[k] * dt; }
        }
      }
      for (let i = 0; i < C; i++) {
        let q = pos[i];
        if (t < 3 || t >= 21) q = home[i];
        else if (t >= 17) {
          const turn = 17 + (Math.floor(i / Nn) % Nn) * 0.25, u = THREE.MathUtils.clamp((t - turn) / 2.2, 0, 1);   // (by layers, from the foot up)
          q = lerp(pos[i], home[i], ease(u));
        }
        data.set([q[0], q[1], q[2], 1], (f * C + i) * 4);
      }
    }
    const tex = new THREE.DataTexture(data, C, F, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), null, C);
    mesh.material = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uSim: { value: tex }, uC: { value: C }, uF: { value: F }, uP: { value: P }, uCell: { value: cell } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform sampler2D uSim; uniform float uTime, uC, uF, uP, uCell; varying vec3 vCol; varying vec3 vP;
        vec3 at(float f) { return texture2D(uSim, vec2((float(gl_InstanceID) + 0.5) / uC, (mod(f, uF) + 0.5) / uF)).xyz; }
        void main() {
          float fr = mod(uTime, uP) / uP * uF, f0 = floor(fr);
          vec3 a = at(f0), b = at(f0 + 1.0), c = mix(a, b, fr - f0);
          float speed = length(b - a) * 10.0;                         // (metres a second)
          float k = clamp(speed / 1.6, 0.0, 1.0);
          vCol = mix(vec3(0.09, 0.3, 0.38), vec3(0.45, 0.68, 0.8), k);
          vP = position;
          float size = uCell * mix(0.86, 0.6, k);
          vec3 p = c + position * size;
          float r = uTime * 0.12; p = vec3(p.x * cos(r) + p.z * sin(r), p.y, -p.x * sin(r) + p.z * cos(r));   // (turning slowly)
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vCol; varying vec3 vP;
        void main() {
          // (each cube's edges brighter than its faces, as a hologram's)
          vec3 q = abs(vP) * 2.0; float e = max(max(min(q.x, q.y), min(q.y, q.z)), min(q.x, q.z));
          gl_FragColor = vec4(vCol * (0.18 + 0.9 * smoothstep(0.8, 0.96, e)), 1.0);
        }`,
    });
    mesh.position.set(X(a), CURB + 0.36 + 0.55 + 2.5 * cell + 0.3, z);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER.GLOW);
    caseLabels.push(mesh);
    // its foot: a low round plinth, a ring of light round its top
    props(new THREE.CylinderGeometry(1.1, 1.2, 0.35, 32).translate(X(a), CURB + 0.175, z), 0.75, TINT.stone);
    glow(new THREE.TorusGeometry(1.05, 0.025, 4, 64).rotateX(Math.PI / 2).translate(X(a), CURB + 0.36, z), CYAN);
    glow(new THREE.CircleGeometry(0.75, 32).rotateX(-Math.PI / 2).translate(X(a), CURB + 0.36, z), [0.12, 0.35, 0.4]);
    colliders.push({ x: X(a), z, r: 1.3 });
    for (let i = people.length - 1; i >= 0; i--) if (Math.hypot(people[i].x - X(a), people[i].z - z) < 1.6) people.splice(i, 1);   // (no one standing in it)
    emitters.push({ x: X(a), y: CURB + 2.2, z, nx: 0, ny: 1, nz: 0, power: 0.5, reach: 10, tint: 0.6 });
  }
  // 潮汐能源's lawn, before its office, made less dark: a band of light set in it all round its edge, a little in;
  // light thrown on it from its corners and its middle
  function lawnLights(s, a, z, w, d) {
    const X = (q) => s * q, top = G + 0.22, i = 0.3, t = 0.12, LIGHT = [1.4, 1.5, 1.5];
    const a0 = a - w / 2 + i, a1 = a + w / 2 - i, c0 = z - d / 2 + i, c1 = z + d / 2 - i;
    for (const [x0, x1, z0, z1] of [[a0, a1, c0, c0 + t], [a0, a1, c1 - t, c1], [a0, a0 + t, c0, c1], [a1 - t, a1, c0, c1]]) {
      glow(box(...sorted(X(x0), X(x1)), top, top + 0.012, z0, z1), LIGHT);
    }
    for (const [la, lz] of [[a - w / 2, z - d / 2], [a + w / 2, z + d / 2], [a - w / 2, z + d / 2], [a + w / 2, z - d / 2], [a, z]]) {
      emitters.push({ x: X(la), y: G + 0.6, z: lz, nx: 0, ny: 1, nz: 0, power: 0.75, reach: 12, tint: 0.4 });
    }
  }
  // A tree like another, the other side of a line (z = mirror): the same height, spread, lights and rings; its
  // planter too, if it stood in one (the ground's own numbers untouched)
  function mirrorTree(t, mirror, planter = false) {
    const z = 2 * mirror - t.z;
    trees.push({ ...t, z });
    colliders.push({ x: t.x, z, r: planter ? 1.25 : 0.35 });
    if (planter) props(new THREE.CylinderGeometry(1.15, 1.2, 0.5, 20).translate(t.x, t.y - 0.25, z), 0.88);
  }
  // 潮汐能源's door: the ringed tree in its planter to its left (as one faces it) and another like it to its right
  function officeTrees() {
    const plot = plots.find((p) => p.s === -1 && p.zB < -80 && p.zA > -80);
    if (!plot) return;
    const zc = (plot.zB + plot.zA) / 2, near = trees.filter((t) => Math.abs(t.x) > plot.front - 8 && Math.abs(t.x) < plot.front && t.z > zc && t.z < zc + 9 && t.y > CURB + 0.4);
    if (!near.length) return;
    const t = near.reduce((q, r) => (Math.abs(r.z - zc) < Math.abs(q.z - zc) ? r : q));
    mirrorTree(t, zc, true);
  }
  // a narrow garden between two towers
  function pocket(s, z0, z1) {
    const X = (a) => s * a, zc = (z0 + z1) / 2;
    tree(X(FACADE + R.range(3, 6)), CURB, zc + R.range(-1, 1), R.range(0.8, 1.1));
    if (R.chance(0.6)) tree(X(FACADE + R.range(10, 16)), CURB, zc + R.range(-1, 1), R.range(0.8, 1.1));
    if (z1 - z0 > 6) bench(X(FACADE + R.range(6, 9)), zc + (z1 - z0) / 4, 1.6);
    glow(box(X(FACADE + 1), X(FACADE + 22), CURB, CURB + 0.02, zc - 0.04, zc + 0.04), SOFT); // a line of light along the path
    if (R.chance(0.5)) person(X(FACADE + R.range(2, 10)), zc + R.range(-1, 1));
    // closed at the back by a low glass building, so the alley is a garden, not a way through
    const [x0, x1] = sorted(X(FACADE + 23), X(FACADE + 60));
    glass(prism(outline('rect', x0, x1, z0 - 1, z1 + 1), 0, RP.range(14, 36)), newWinRP(), RP.next());
    boxCollider(x0, x1, z0 - 1, z1 + 1);
    emitters.push({ x: X(FACADE + 22.5), y: 2.6, z: zc, nx: -s, ny: 0, nz: 0, power: 0.5, reach: 9, tint: 0.25 });
  }

  // ---------------------------------------------------------------- the two street fronts

  const segments = []; // stretches of street front between the side streets, from +z down
  {
    const edges = [GEN.zMax, ...CROSSINGS.flatMap((c) => [c + CROSS_HALF, c - CROSS_HALF]), GEN.zMin];
    for (let i = 0; i < edges.length; i += 2) segments.push([edges[i], edges[i + 1]]);
  }
  for (const s of [-1, 1]) {
    for (const [zTop, zBot] of segments) {
      let z = zTop;
      while (z - zBot > 14) {
        let w = R.range(24, 52);
        if (z - w - zBot < 20) w = z - zBot;
        plot(s, z - w, z);
        z -= w;
        if (z - zBot > 20 && R.chance(0.4)) {
          const gap = R.range(5, 11);
          pocket(s, z - gap, z);
          z -= gap;
        }
      }
    }
  }

  // the towers behind, rising over the front ones and fading into the clouds
  for (const s of [-1, 1]) {
    for (let z = GEN.zMax; z > GEN.zMin; z -= R.range(45, 80)) {
      if (nearCrossing(z, 14)) continue;
      const a = R.range(95, 200), w = R.range(26, 52), d = R.range(26, 52), h = R.range(140, 440);
      const [x0, x1] = sorted(s * a, s * (a + d)), [x2, x3] = sorted(s * (a + 4), s * (a + d - 4));
      const win = newWin(), seed = R.next();
      glass(prism(outline(R.pick(['rect', 'rounded', 'round', 'chamfer']), x0, x1, z - w, z, 8), 0, h * 0.62), win, seed);
      const kind = RM.pick(MODERN);
      const upper = () => glass(prism(outline(R.pick(['rect', 'rounded', 'round']), x2, x3, z - w + 4, z - 4, 6), h * 0.62, h),
        kind === 'diagrid' ? [win[0], win[1], win[2], 4] : win, seed);
      if (kind && kind !== 'diagrid') {
        muted(upper);
        modernTop(s, kind, a, d, z - w, z, h * 0.62, h, win, seed);
        moderns.push({ kind, x: s * (a + d / 2), z: z - w / 2, y0: h * 0.62, h });
      } else upper();
      if (R.chance(0.35)) glow(box(s * (a - 0.1), s * (a + 0.2), h * 0.62 - 0.5, h * 0.62, z - w + 6, z - 6), R.chance(0.5) ? CYAN : WHITE);
    }
  }

  // ---------------------------------------------------------------- over the street

  // glass bridges between towers facing each other, a few with a running line of text
  const plotAt = (s, z, y) => plots.find((p) => p.s === s && p.zB + 3 < z - 12 && z < p.zA - 3 && p.top > y + 12);
  for (let i = 0, made = 0; i < 80 && made < 10; i++) {
    const z = R.range(GEN.zMin + 100, GEN.zMax - 60);
    // (the first over the street from the start, at -78: lower, 0.8 of the height it was drawn at, a little over the
    // whale's way (40 m); its sign 长夏乐馆's river of sound, in the city's tones, concertWaves)
    const first = z > -90 && z < -70, y = R.range(24, 130) * (first ? 0.8 : 1);
    if (nearCrossing(z, 8)) continue;
    const L = plotAt(-1, z, y), Rt = plotAt(1, z, y);
    if (!L || !Rt) continue;
    // none from the terrace's tower: one would cross right in front of the mascot's tall screen
    const blocks = SITES.some((t) => t.kind === 'terrace' && L.zB < t.z && t.z < L.zA);
    // some are open gardens instead of glass tubes (their tube and sign drawn for their numbers only)
    const garden = RM.chance(0.45);
    const bridge = () => {
    const hh = R.range(4.5, 7), dz = R.range(7, 11);
    const tube = () => glass(prism(outline(R.chance(0.4) ? 'rounded' : 'rect', -L.front - 1, Rt.front + 1, z - dz, z, 2.5), y, y + hh, { bottom: true }), [1.6, hh - 0.4, 0.6, 0], R.next());
    if (garden) muted(tube);
    else tube();
    glow(box(-L.front, Rt.front, y - 0.1, y, z - 0.05, z + 0.05), R.chance(0.5) ? CYAN : WHITE);
    if (!blocks) bridges.push({ z0: z - dz, z1: z, y0: y, y1: y + hh, L, Rt });
    if (R.chance(0.45)) {
      const sign = () => {
        const w = R.range(14, 20), sh = Math.min(hh * 0.7, w / 5);
        if (first) {                    // (as long as the bridge, in its middle up and down, its name going by; its numbers still drawn)
          R.range(-3, 3); R.int(0, HORIZONTAL.length - 1); R.next();
          const len = L.front + Rt.front - 1.5, bh = hh * 0.55;
          caseLabels.push(concertWaves(len, bh, (Rt.front - L.front) / 2, y + hh / 2, z + 0.4, 'z', { palette: 'tone', scroll: true, clear: true }));
        }
        else screen(panel(w, sh, R.range(-3, 3), y + hh / 2, z + 0.4, 'z'), PROG.TICKER, w, sh, atlasRect('h', R.int(0, HORIZONTAL.length - 1)));
        emitters.push({ x: 0, y: y + hh / 2, z: z + 0.8, nx: 0, ny: 0, nz: 1, power: 1.0, reach: 36, tint: 0.6 });
      };
      if (garden) muted(sign);
      else sign();
    }
    if (garden && !blocks) gardenBridge(-L.front - 1, Rt.front + 1, z - dz, z, y);
    };
    if (blocks) muted(bridge);
    else bridge();
    made++;
  }

  // the single-tier towers left to finish: cut above what hangs on them (screens, a cantilever, bridges)
  for (const p of plots) {
    if (!p.info.finish) continue;
    const onIt = bridges.filter((b) => b.L === p || b.Rt === p).map((b) => b.y1);
    const floorH = 4;
    p.info.finish(Math.max(p.hung + 4, ...onIt.map((y) => y + 4), LOBBY + floorH * 4, p.top * 0.38));
  }

  // ---------------------------------------------------------------- holographic signs along the street

  // (换乘's, toward the station, higher and further out over the pavement, clear of 霜满天's signs)
  // (萤伞's, at 42 on the right, gone: its name is its shop's alone now)
  for (const [side, z, text, out, up] of [[1, -32, '换乘 TRANSFER →', 8.3, 5.6], [-1, -132, '↑ 往 星环航站'],
    [1, -176, '长夏乐馆 CONCERT HALL'], [-1, -246, '浮岛咖啡 CAFÉ'], [1, -312, '9号线 LINE 9'], [-1, -398, '欢迎来到星港'],
    [1, -468, '夕光烘焙 BAKERY']]) {
    holoSigns.push({ x: side * (out ?? 10.2 + (Math.abs(z) % 7) * 0.18), y: CURB + (up ?? 2.8 + (Math.abs(z) % 5) * 0.12), z, set: 'h2', text: S2[text] });
  }

  // ---------------------------------------------------------------- the side streets

  // Each side street is lined on both sides by towers from the back of the corner plots out to the towers
  // behind, with pavements, lamps and trees. One can walk into it as far as a canal that crosses it (glass
  // railings, water, lit copings); beyond, the street goes on into the rain.
  for (const c of CROSSINGS) {
    for (const s of [-1, 1]) {
      const X = (a) => s * a;
      for (const sz of [-1, 1]) {
        const edge = c + sz * CROSS_HALF;
        const corner = plots.find((p) => p.s === s && Math.abs((sz > 0 ? p.zB : p.zA) - edge) < 0.5);
        const atMuseum = c === MUSEUM.c && s === MUSEUM.s;
        // (the row's towers as they go up, and 光合书店's case if one falls to the row: drawn when the row is done,
        // on its first tower (the nearest the main street, where it is seen from there) if that one's face is free)
        const row = [];
        let book = null;
        for (let a = corner ? corner.back : 45; a < 95; ) {
          const w = Math.min(RX.range(16, 30), 95 - a);
          if (w < 8) break;
          const quiet = atMuseum && a + w > MUSEUM.wings;
          const build = () => {
          const zf = edge + sz * RX.range(0, 2), depth = RX.range(22, 34), h = RX.range(30, 170);
          const [z0, z1] = sorted(zf, zf + sz * depth), [x0, x1] = sorted(X(a), X(a + w));
          const win = [RX.range(1.4, 2.1), RX.range(3.6, 4.2), RX.range(0.2, 0.55), RX.pick([0, 0, 2, 3, 4])], seed = RX.next();
          const kind = h > 70 ? RM.pick(MODERN) : null, cut = kind && kind !== 'diagrid' ? RX.range(24, Math.max(26, h * 0.5)) : h;
          glass(prism(outline(RX.chance(0.3) ? 'rounded' : 'rect', x0, x1, z0, z1, 4), 0, cut), win, seed);
          if (cut < h) {
            modernTop(s, kind, a, w, z0, z1, cut, h, win, seed);
            moderns.push({ kind, x: X(a + w / 2), z: (z0 + z1) / 2, y0: cut, h });
          }
          boxCollider(x0, x1, z0, z1);
          emitters.push({ x: X(a + w / 2), y: 2.6, z: zf - sz * 0.6, nx: 0, ny: 0, nz: -sz, power: 0.65, reach: 11, tint: 0.25 });
          const here = { a, w, zf, cut, ad: false, quiet };
          row.push(here);
          // a brand's ad on some of the faces toward the side street
          const adHere = RX.chance(0.45);
          if (!adHere && cut > 24 && RA.chance(0.5)) {                        // (more of them: with their own numbers)
            const aw = Math.min(w - 3, RA.range(7, 13)), ah = RA.chance(0.5) ? aw / RA.range(1.8, 3) : aw * RA.range(1.2, 1.9);
            const ay = RA.range(6, Math.max(7, cut - ah - 3));
            if (ay + ah < cut - 2 && aw > 4) {
              const ac = X(a + w / 2), zz = zf - sz * 0.32;
              const ad = RA.pick(BRAND_ADS), seed = RA.next();
              if (ad === AD['brand-photon-books'] && !book) book = { aw, ah, ay, seed, at: here };   // (see below)
              else if (ad !== AD['brand-firefly-garden']) {                   // (流萤花园's: on the main street, brandAds)
                props(box(ac - aw / 2 - 0.3, ac + aw / 2 + 0.3, ay - 0.3, ay + ah + 0.3, zf - sz * 0.3, zf), 0.45);
                adPanel(aw, ah, ac, ay + ah / 2, zz, sz > 0 ? '-z' : 'z', ad, seed, ad === AD['brand-photon-books'] ? 'wufeng' : null);
                emitters.push({ x: ac, y: ay + ah / 2, z: zz - sz * 0.4, nx: 0, ny: 0, nz: -sz, power: 1.0, reach: 30, tint: 0.5 });
                here.ad = true;
              }
            }
          }
          if (adHere && cut > 20) {
            const aw = Math.min(w - 3, RX.range(8, 16)), ah = RX.chance(0.5) ? aw / RX.range(2, 3.5) : aw * RX.range(1.3, 2.2);
            const ay = RX.range(7, Math.max(8, cut - ah - 3));
            if (ay + ah < cut - 2) {
              const ac = X(a + w / 2), zz = zf - sz * 0.32;
              const ad = RX.pick(BRAND_ADS), seed = RX.next();
              if (ad === AD['brand-photon-books'] && !book) book = { aw, ah, ay, seed, at: here };   // (see below)
              else if (ad !== AD['brand-firefly-garden']) {                   // (流萤花园's: on the main street, brandAds)
                props(box(ac - aw / 2 - 0.3, ac + aw / 2 + 0.3, ay - 0.3, ay + ah + 0.3, zf - sz * 0.3, zf), 0.45);
                adPanel(aw, ah, ac, ay + ah / 2, zz, sz > 0 ? '-z' : 'z', ad, seed, ad === AD['brand-photon-books'] ? 'wufeng' : null);
                emitters.push({ x: ac, y: ay + ah / 2, z: zz - sz * 0.4, nx: 0, ny: 0, nz: -sz, power: 1.0, reach: 30, tint: 0.5 });
                here.ad = true;
              }
            }
          }
          };
          // where the museum's wings stand (MUSEUM.wings on), drawn for its numbers only
          if (quiet) muted(build);
          else build();
          a += w;
        }
        // 光合书店's case (无风之日), at the same height: on the row's first tower if its face is free and it fits there
        if (book && !book.at.quiet) {
          const first = row.find((t) => !t.quiet), { aw, ah, ay } = book;
          const t = first && first !== book.at && !first.ad && aw <= first.w - 3 && ay + ah < first.cut - 2 ? first : book.at;
          const ac = X(t.a + t.w / 2), zz = t.zf - sz * 0.32;
          props(box(ac - aw / 2 - 0.3, ac + aw / 2 + 0.3, ay - 0.3, ay + ah + 0.3, t.zf - sz * 0.3, t.zf), 0.45);
          adPanel(aw, ah, ac, ay + ah / 2, zz, sz > 0 ? '-z' : 'z', AD['brand-photon-books'], book.seed, 'wufeng');
          emitters.push({ x: ac, y: ay + ah / 2, z: zz - sz * 0.4, nx: 0, ny: 0, nz: -sz, power: 1.0, reach: 30, tint: 0.5 });
        }
        // the pavement, lamps and trees along it (at the museum, only as far as its steps)
        sideWalks.push(box(X(FACADE), X(atMuseum ? MUSEUM.steps : 97), 0, CURB, edge - sz * 4, edge + sz * 4));
        for (let a = 22 + (sz > 0 ? 0 : 13); a < 94; a += 26) {
          if (atMuseum && a > MUSEUM.steps - 8) { if (Math.abs(a + 13 - CANAL - 3) > 6) muted(() => tree(X(a + 13), CURB, c + sz * 8.7, RX.range(0.9, 1.15), RX)); continue; }
          const pz = c + sz * 7.6, hz = c + sz * 5.4, px = X(a);
          props(new THREE.CylinderGeometry(0.07, 0.11, LAMP_HEAD_Y + 0.3, 8).translate(px, CURB + (LAMP_HEAD_Y + 0.3) / 2, pz), 0.7);
          props(box(px - 0.05, px + 0.05, LAMP_HEAD_Y + 0.2, LAMP_HEAD_Y + 0.28, ...sorted(pz, hz - sz * 0.5)), 0.7);
          props(box(px - 0.12, px + 0.12, LAMP_HEAD_Y - 0.02, LAMP_HEAD_Y + 0.12, hz - 0.8, hz + 0.8), 0.7);
          glow(box(px - 0.09, px + 0.09, LAMP_HEAD_Y - 0.05, LAMP_HEAD_Y - 0.02, hz - 0.75, hz + 0.75), [3, 3.2, 3.2]);
          lamps.push({ x: px, y: LAMP_HEAD_Y - 0.2, z: hz });
          colliders.push({ x: px, z: pz, r: 0.2 });
          bins.beams.add(new THREE.CylinderGeometry(0.4, 5.8, LAMP_HEAD_Y - 0.2, 20, 1, true).translate(px, (LAMP_HEAD_Y - 0.2) / 2, hz), {});
          if (Math.abs(a + 13 - CANAL - 3) > 6) {
            if (atMuseum && a + 13 > MUSEUM.steps - 4) muted(() => tree(X(a + 13), CURB, c + sz * 8.7, RX.range(0.9, 1.15), RX));
            else tree(X(a + 13), CURB, c + sz * 8.7, RX.range(0.9, 1.15), RX);
          }
        }
      }
      const isMuseum = c === MUSEUM.c && s === MUSEUM.s;
      // the canal: water between lit copings, a glass railing on either side; no way across
      // (where the museum is, the street goes on down into its sunken plaza instead)
      if (!isMuseum) {
      const [w0, w1] = sorted(X(CANAL + 0.4), X(CANAL + 5.6));
      bins.pools.push(new THREE.PlaneGeometry(w1 - w0, 2 * CROSS_HALF + 4).rotateX(-Math.PI / 2).translate((w0 + w1) / 2, 0.06, c));
      for (const a of [CANAL, CANAL + 5.6]) {
        const [c0, c1] = sorted(X(a - 0.4), X(a + 0.4)), [r0, r1] = sorted(X(a - 0.02), X(a + 0.02));
        props(box(c0, c1, 0, 0.5, c - CROSS_HALF - 2, c + CROSS_HALF + 2), 0.82);
        glow(box(c0, c1, 0.42, 0.46, c - CROSS_HALF - 2, c + CROSS_HALF + 2), CYAN);
        glow(box(r0, r1, 0.5, 1.55, c - CROSS_HALF - 2, c + CROSS_HALF + 2), [0.25, 0.5, 0.55]);
        glow(box(r0 - 0.02, r1 + 0.02, 1.53, 1.57, c - CROSS_HALF - 2, c + CROSS_HALF + 2), CYAN);
      }
      boxCollider(X(CANAL - 0.6), X(CANAL + 6), c - CROSS_HALF - 2, c + CROSS_HALF + 2);
      }

      // and closing the view down it, a tower across its end, facing back toward the main street, a great
      // brand ad on its face (at the museum, drawn for its numbers only: the museum stands there)
      const terminus = () => {
      const ta = 97, td = RX.range(26, 36), th = RX.range(110, 220), tw = RX.range(26, 32);
      const [t0, t1] = sorted(X(ta), X(ta + td));
      const twin = [RX.range(1.4, 2.1), RX.range(3.6, 4.2), RX.range(0.3, 0.6), RX.pick([0, 3, 4])], tseed = RX.next();
      const tkind = RM.pick(MODERN), tcut = tkind && tkind !== 'diagrid' ? th * RX.range(0.45, 0.6) : th;
      glass(prism(outline(RX.chance(0.5) ? 'rounded' : 'rect', t0, t1, c - tw, c + tw, 6), 0, tcut), twin, tseed);
      if (tcut < th) modernTop(s, tkind, ta, td, c - tw, c + tw, tcut, th, twin, tseed);
      const aw = RX.range(16, 24), ah = aw * RX.range(0.45, 0.7), ay = RX.range(10, 18);
      props(box(X(ta - 0.3), X(ta), ay - 0.4, ay + ah + 0.4, c - aw / 2 - 0.4, c + aw / 2 + 0.4), 0.45);
      adPanel(aw, ah, X(ta - 0.33), ay + ah / 2, c, s < 0 ? 'x' : '-x', RX.pick(BRAND_ADS), RX.next());
      emitters.push({ x: X(ta - 0.6), y: ay + ah / 2, z: c, nx: -s, ny: 0, nz: 0, power: 1.2, reach: 45, tint: 0.5 });
      if (!isMuseum) sideWalks.push(box(X(95), X(ta + 1), 0, CURB, c - CROSS_HALF - 4, c + CROSS_HALF + 4));
      };
      if (isMuseum) { muted(terminus); museum(c, s); } else terminus();
    }
  }

  // ---------------------------------------------------------------- street lamps and trees

  for (const s of [-1, 1]) {
    for (let z = GEN.zMax - (s > 0 ? 16 : 0); z > GEN.zMin; z -= 32) {
      if (!nearCrossing(z, 3)) {
        const px = s * 7.6, hx = s * 5.6;
        props(new THREE.CylinderGeometry(0.07, 0.11, LAMP_HEAD_Y + 0.3, 8).translate(px, CURB + (LAMP_HEAD_Y + 0.3) / 2, z), 0.7);
        props(box(px, hx - s * 0.5, LAMP_HEAD_Y + 0.2, LAMP_HEAD_Y + 0.28, z - 0.05, z + 0.05), 0.7);
        props(box(hx - 0.8, hx + 0.8, LAMP_HEAD_Y - 0.02, LAMP_HEAD_Y + 0.12, z - 0.12, z + 0.12), 0.7);
        glow(box(hx - 0.75, hx + 0.75, LAMP_HEAD_Y - 0.05, LAMP_HEAD_Y - 0.02, z - 0.09, z + 0.09), [3, 3.2, 3.2]);
        lamps.push({ x: hx, y: LAMP_HEAD_Y - 0.2, z });
        colliders.push({ x: px, z, r: 0.2 });
        bins.beams.add(new THREE.CylinderGeometry(0.4, 5.8, LAMP_HEAD_Y - 0.2, 20, 1, true).translate(hx, (LAMP_HEAD_Y - 0.2) / 2, z), {});
      }
      // a street tree halfway to the next lamp (the one by 深蓝计算's sculpture a little along, toward -z, ringed, a
      // flower bed beyond it and its twin beyond that)
      if (!nearCrossing(z - 16, 4)) {
        const ants = s === -1 && z - 16 === -40, tz = ants ? -41.8 : z - 16;
        tree(s * 8.7, CURB, tz, R.range(0.95, 1.2), R, ants);
        if (ants) {                                            // (and its twin, ringed too, the far side of the bed)
          flowerBed(s, 7.95, 9.45, -46.4, -43.6, CURB, makeRandom(4747));
          mirrorTree(trees[trees.length - 1], -45.0);
        }
      }
    }
  }

  // ---------------------------------------------------------------- the ground

  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, GEN.zMax - GEN.zMin).rotateX(-Math.PI / 2).translate(0, 0, (GEN.zMax + GEN.zMin) / 2),
    groundMaterial(reflection, 0, CROSSINGS),
  );
  const walks = [...sideWalks];
  for (const s of [-1, 1]) {
    for (const [zTop, zBot] of segments) walks.push(box(s * ROAD, s * (FACADE + 80), 0, CURB, zBot, zTop));
  }
  const pavement = new THREE.Mesh(mergeGeometries([...walks, ...raised]), groundMaterial(reflection, 1, CROSSINGS));
  const grounds = [ground, pavement];
  if (bins.pools.length) grounds.push(new THREE.Mesh(mergeGeometries(bins.pools), groundMaterial(reflection, 2, CROSSINGS)));
  if (sunken.length) grounds.push(new THREE.Mesh(mergeGeometries(sunken), groundMaterial(reflection, 3, CROSSINGS)));
  for (const m of grounds) { m.layers.set(LAYER.GROUND); m.frustumCulled = false; group.add(m); }

  streetShops();                 // (before the city's meshes are made of what has been added)
  streetFurniture();
  stalls();
  const cityMeshes = {
    // (the still ones in lots 100 m long along the street, so that what is behind the viewer or out of view is not
    // drawn; those that move in their shaders, whole)
    glass: bins.glass.meshes(glassMaterial(), LAYER.SOLID, 100),
    props: bins.props.meshes(propsMaterial(), LAYER.SOLID, 100),
    glow: bins.glow.meshes(glowMaterial(), LAYER.GLOW, 100),
    ...(bins.drift.parts.length ? { drift: bins.drift.mesh(glowMaterial({ drift: true }), LAYER.GLOW) } : {}),
    ...(bins.orbit.parts.length ? { orbit: Object.assign(bins.orbit.mesh(glowMaterial({ orbit: true }), LAYER.GLOW), { frustumCulled: false }) } : {}),
    ...(bins.slide.parts.length ? { slide: bins.slide.mesh(glowMaterial({ slide: true }), LAYER.GLOW) } : {}),
    ...(bins.spin.parts.length ? { spin: Object.assign(bins.spin.mesh(glowMaterial({ spin: true }), LAYER.GLOW), { frustumCulled: false }) } : {}),
    ...(bins.tide.parts.length ? { tide: Object.assign(bins.tide.mesh(glowMaterial({ tide: true }), LAYER.GLOW), { frustumCulled: false }) } : {}),
    ...(bins.pop.parts.length ? { pop: Object.assign(bins.pop.mesh(glowMaterial({ pop: true }), LAYER.GLOW), { frustumCulled: false }) } : {}),
    screens: bins.screens.meshes(screenMaterial(atlas.texture, ads, N_AD), LAYER.GLOW, 100),
    beams: bins.beams.mesh(beamMaterial(), LAYER.AIR),
  };
  for (const m of Object.values(cityMeshes).flat()) group.add(m);
  const insideMeshes = [
    inside.props.mesh(propsMaterial({ indoor: true }), LAYER.INSIDE),
    inside.glow.mesh(glowMaterial(), LAYER.INSIDE),
    inside.screens.mesh(screenMaterial(atlas.texture, ads, N_AD), LAYER.INSIDE),
    ...goods.meshes(LAYER.INSIDE, { chunk: 100 }),
  ];
  for (const m of insideMeshes) group.add(m);
  // the museum's insides (lit as rooms), drawn from near enough to see into it
  const museumMeshes = museumSpot ? [museumIn.props.mesh(propsMaterial({ indoor: true, lift: 1.5 }), LAYER.GLOW)] : [];
  for (const m of museumMeshes) group.add(m);
  // (a shop lit brighter than the station: lift)
  // the trees on the pavement before the bookshop: rings of light round them, like those on the terrace across
  if (bookAt) for (const t of trees) if (t.x * bookAt.s > 7 && t.x * bookAt.s < 11 && t.z > bookAt.zB - 4 && t.z < bookAt.zA + 4) t.bands = true;
  const bookMeshes = bookAt ? [bookIn.props.mesh(propsMaterial({ indoor: true, lift: 1.9 }), LAYER.INSIDE), ...bookIn.goods.meshes(LAYER.INSIDE, { lift: 1.9, chunk: 100 })] : [];
  for (const m of bookMeshes) group.add(m);
  // (what stands along the street, the beds and stalls' herbs: in lots 100 m long, each drawn only from within 230 m)
  const streetLots = streetGoods.meshes(LAYER.GLOW, { indoor: false, chunk: 100 });
  for (const m of streetLots) group.add(m);
  // the shops along the street (lit as rooms; one lot, drawn from anywhere along the first stretch)
  // (each stretch's shops' insides, drawn from near it: the first stretch's round z -50, as it always was)
  // (in lots 100 m long, each drawn from within 230 m, and in the wet street's mirror (refl) from within 80 m)
  const shopInteriors = [...shopIns].flatMap(([, b]) => {
    const lots = new Map();
    for (const m of [...b.props.meshes(propsMaterial({ indoor: true, lift: 1.6 }), LAYER.GLOW, 100), ...b.goods.meshes(LAYER.GLOW, { lift: 1.6, chunk: 100 })]) {
      group.add(m);
      if (!lots.has(m.userData.z)) lots.set(m.userData.z, []);
      lots.get(m.userData.z).push(m);
    }
    return [...lots].map(([z, meshes]) => ({ x: 0, z, reach: 230, refl: 80, meshes }));
  });
  if (caseIn.parts.length) group.add(caseIn.mesh(propsMaterial({ indoor: true, lift: 1.5 }), LAYER.GLOW));
  for (const m of caseLabels) group.add(m);
  // the shelters' boards, one canvas for them all, drawn again as the time goes on (main.js: infoBoard.update)
  const infoBoard = makeInfoBoard(infoBoards);
  if (infoBoard.mesh) { infoBoard.mesh.layers.set(LAYER.GLOW); group.add(infoBoard.mesh); }
  group.add(doorGroup);

  // (长夏乐馆: the tower on the right at -176, where its hologram is; its music is heard round it, main.js)
  const hall = plots.find((p) => p.s === 1 && p.zB < -176 && -176 < p.zA);
  return { group, lamps, emitters, colliders, sights, trees, people, cats, bridges, plots, floors, covers, lifts, ads, moderns, holoSigns, doors, cases: caseSpots, shops: shopSpots, infoBoard,
    concert: { x: hall ? hall.front + 4 : 14, z: -176 }, concertBeat,
    // a case's font changed: its words drawn again in it
    setCaseFont(key, css) { caseFonts[key] = css; for (const m of refonts[key] || []) m.userData.redraw(); }, station: { ...station, meshes: insideMeshes, people: insidePeople }, meshes: cityMeshes, museum: museumSpot,
    // the insides drawn only from near enough: { x, z, reach, meshes } (refl: in the wet street's mirror, if not as far)
    interiors: [{ ...station, reach: 140, meshes: insideMeshes }, ...(bookAt ? [{ ...bookAt, reach: 110, meshes: bookMeshes }] : []),
      ...shopInteriors, ...streetLots.map((m) => ({ x: 0, z: m.userData.z, reach: 230, refl: 60, meshes: [m] })),
      ...(museumSpot ? [{ ...museumSpot.centre, reach: 170, meshes: museumMeshes }] : [])] };
}
