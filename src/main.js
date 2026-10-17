// 夜雨城: a walk down a rainy street of a future city at night, in cyan-blue and white, drawn in three
// flat tones (or two). Sets up the renderer and the passes each frame needs: the moon's shadow map, the
// mirror image for the wet street, then the scene, ink lines, bloom and a last grade.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { shared, N_LAMP, N_BB, N_PT } from './toon.js';
import { buildAtlas, fontFamily } from './atlas.js';
import { buildCity, LAYER } from './city.js';
import { buildRain, RAIN_LEVELS } from './rain.js';
import { buildHolograms, loadWhales } from './holograms.js';
import { loadHoloCat, buildHoloCat } from './holoCat.js';
import { createMuseum } from './museum.js';
import { buildSky } from './sky.js';
import { buildTraffic } from './traffic.js';
import { buildTrees } from './trees.js';
import { buildPeople } from './people.js';
import { Walker } from './walker.js';
import { Soundscape } from './audio.js';
import { FinishPass } from './post.js';
import { loadTuning, applyTuning } from './tuning.js';

// ?nomusic: 长夏乐馆's music never started (to see what it costs)
const NO_MUSIC = new URLSearchParams(location.search).has('nomusic');
const tuning = await loadTuning();

const ui = {
  intro: document.getElementById('intro'),
  status: document.getElementById('status'),
  hint: document.getElementById('hint'),
  mode: document.getElementById('mode'),
  tone: document.getElementById('tone'),
  rain: document.getElementById('rain'),
  sound: document.getElementById('sound'),
  pace: document.getElementById('pace'),
  music: document.getElementById('music'),
  concert: document.getElementById('concert'),
};
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
const say = async (msg) => { ui.status.textContent = msg; await nextFrame(); };

// ---------------------------------------------------------------- renderer

const W = () => Math.max(1, innerWidth), H = () => Math.max(1, innerHeight);
const PR = Math.min(devicePixelRatio, 1.25);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(PR);
renderer.setSize(W(), H());
renderer.toneMapping = THREE.NoToneMapping; // the tones are shown exactly as chosen
renderer.setClearColor(shared.uFog.value);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, W() / H(), 0.1, 2600);
for (const l of [LAYER.SOLID, LAYER.GLOW, LAYER.AIR, LAYER.GROUND, LAYER.INSIDE]) camera.layers.enable(l);

// ---------------------------------------------------------------- the moon's shadow map

// One square map, an orthographic view along the moonlight over the stretch of street just ahead of the
// viewer, drawn again only when that stretch moves on (every 20 m), so the edges never crawl.
const SHADOW = 4096;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW, SHADOW, { format: THREE.RedFormat });
shadowRT.depthTexture = new THREE.DepthTexture(SHADOW, SHADOW, THREE.UnsignedIntType);
shadowRT.depthTexture.minFilter = shadowRT.depthTexture.magFilter = THREE.NearestFilter;
const shadowCam = new THREE.OrthographicCamera(-70, 70, 430, -90, 1, 1600);
shadowCam.layers.set(LAYER.SOLID);
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
shared.uShadowMap.value = shadowRT.depthTexture;
shared.uShadowTexel.value.set(1 / SHADOW, 1 / SHADOW);
let shadowAt = null;
function updateShadow() {
  const z = Math.round((camera.position.z - 110) / 20) * 20;
  if (z === shadowAt) return;
  shadowAt = z;
  const target = new THREE.Vector3(0, 0, z);
  shadowCam.position.copy(target).addScaledVector(shared.uKeyDir.value, 800);
  shadowCam.lookAt(target);
  shadowCam.updateMatrixWorld();
  shared.uShadowMatrix.value.copy(BIAS).multiply(shadowCam.projectionMatrix).multiply(shadowCam.matrixWorldInverse);
  scene.overrideMaterial = depthOnly;
  renderer.setRenderTarget(shadowRT);
  renderer.clear();
  renderer.render(scene, shadowCam);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
}

// ---------------------------------------------------------------- the mirror for the wet street

const reflRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera();
reflCam.layers.set(LAYER.SOLID);
reflCam.layers.enable(LAYER.GLOW);
const reflection = { texture: reflRT.texture, matrix: new THREE.Matrix4() };
const tmp = { f: new THREE.Vector3(), u: new THREE.Vector3(), t: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4() };
// (a sunken plaza's floor has a mirror of its own, at its height, drawn only when one is near it: so that its wet
// floor shines as soon as it comes into view, and the street's mirror stays on the street)
const lowRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
const lowReflection = { texture: lowRT.texture, matrix: new THREE.Matrix4(), near: null };
function mirror(h, target, refl) {
  // the camera mirrored in the plane y = h, looking up at the city from beneath it
  Object.assign(reflCam, { fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far });
  reflCam.updateProjectionMatrix();
  tmp.f.set(0, 0, -1).applyQuaternion(camera.quaternion);
  tmp.u.set(0, 1, 0).applyQuaternion(camera.quaternion);
  reflCam.position.set(camera.position.x, 2 * h - camera.position.y, camera.position.z);
  reflCam.up.set(tmp.u.x, -tmp.u.y, tmp.u.z);
  tmp.t.copy(camera.position).add(tmp.f);
  reflCam.lookAt(tmp.t.x, 2 * h - tmp.t.y, tmp.t.z);
  reflCam.updateMatrixWorld();
  // nothing below the plane drawn in it (a sunken plaza's walls and steps would stand in its way): its near
  // plane tilted onto it (an oblique frustum, as three.js's Reflector does it)
  if (camera.position.y > h + 0.02) {
    tmp.plane.set(tmp.up, -h).applyMatrix4(reflCam.matrixWorldInverse);
    const e = reflCam.projectionMatrix.elements, cp = tmp.clip.set(tmp.plane.normal.x, tmp.plane.normal.y, tmp.plane.normal.z, tmp.plane.constant);
    tmp.q.set((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    cp.multiplyScalar(2 / cp.dot(tmp.q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1; e[14] = cp.w;
  }
  refl.matrix.copy(BIAS).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, reflCam);
  renderer.setRenderTarget(null);
}
function renderReflection() {
  shared.uReflY.value = 0;
  mirror(0, reflRT, reflection);
  const n = lowReflection.near;
  if (n && Math.hypot(camera.position.x - n.x, camera.position.z - n.z) < n.r) mirror(n.h, lowRT, lowReflection);
}

// ---------------------------------------------------------------- the world

await say('写下招牌上的字…');
const atlas = await buildAtlas(tuning.fonts);
await say('立起玻璃高楼…');
// the icons some brands' cases are cut from (ads/scenes.js ICONS): the white of each, as shapes
async function loadIcons() {
  const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js');
  const { ICONS } = await import('./ads/scenes.js');
  const loader = new SVGLoader(), out = {};
  // (game-icons: white on black in a 512 square; Google's Material Symbols, 'material/…': dark on nothing in a
  // 960 square from y = -960, made over into the same 512 square; Noto Emoji's animals, 'noto/…': white, in the 512
  // square already)
  const remap = (shape, f) => {
    const { shape: pts, holes } = shape.extractPoints(12);
    const out2 = new THREE.Shape(pts.map(f));
    out2.holes = holes.map((h) => new THREE.Path(h.map(f)));
    return out2;
  };
  await Promise.all(ICONS.map(async (name) => {
    try {
      const material = name.startsWith('material/'), noto = name.startsWith('noto/');
      const svg = await loader.loadAsync(`assets/icons/${material || noto ? name : `game-icons/${name}`}.svg`);
      if (noto) out[name] = svg.paths.flatMap((p) => SVGLoader.createShapes(p));   // (already white in the 512 square)
      else if (material) {
        const f = (p) => new THREE.Vector2(p.x * 512 / 960, (p.y + 960) * 512 / 960);
        out[name] = svg.paths.flatMap((p) => SVGLoader.createShapes(p)).map((sh) => remap(sh, f));
      } else out[name] = svg.paths.filter((p) => p.color.getHex() === 0xffffff).flatMap((p) => SVGLoader.createShapes(p));
    } catch (e) { console.warn(`icon ${name} did not load`, e); }
  }));
  return out;
}
const icons = tuning.screens.icons !== false ? await loadIcons() : null;
const ROUND_WORDS = '白云乡流波月';
// (白云乡's and 流波月's names, on their signs and 白云乡's case, in a round hand)
// 喵星杂货's sculpture, its cat sitting up (made in Blender: blender/build_cat_statue.py); if it won't load, the city
// makes one of simple shapes
const statueCat = await new GLTFLoader().loadAsync('assets/cat_statue.glb')
  .then((g) => g.scene.getObjectByProperty('isMesh', true).geometry, (e) => { console.warn('cat sculpture not loaded', e); return null; });
const city = buildCity({ atlas, reflection, cases: tuning.screens.cases !== false, icons, statues: { cat: statueCat },
  caseFonts: { round: await fontFamily(tuning.fonts.shopRound || '站酷快乐体', ROUND_WORDS) } });
scene.add(city.group);
await say('种树，摆上长椅…');
const trees = buildTrees(city.trees, PR);
scene.add(trees.group);
const people = buildPeople(city.people);
scene.add(people.group);
const stationPeople = buildPeople(city.station.people, { walkers: 0, layer: LAYER.INSIDE });
scene.add(stationPeople.group);
await say('点亮全息投影…');
const holos = buildHolograms(atlas, city.holoSigns, await loadWhales());
scene.add(holos.group);
const museum = createMuseum(scene, city.museum);   // its heavy things come and go with distance
// the sunken plaza's floor (the ground's kind 3): its own mirror, at its own height (renderReflection)
city.group.traverse((m) => {
  const u = m.material?.uniforms;
  if (!u?.uKind || u.uKind.value !== 3) return;
  const h = city.museum?.floor ?? -5;
  u.uRefl = { value: lowRT.texture };
  u.uReflMatrix = { value: lowReflection.matrix };
  u.uReflY = { value: h };
  m.geometry.computeBoundingSphere();
  const c = m.geometry.boundingSphere;
  lowReflection.near = { x: c.center.x, z: c.center.z, r: c.radius + 120, h };
});
// the cat's hologram standing in the street, where the idol stood (a try: if its model won't load, the city goes
// on without it). (The idol, src/idol.js, waits for her dances.)
let holoCat = null;
try {
  holoCat = buildHoloCat(await loadHoloCat('assets/cat.glb'), { x: 0, y: 0.02, z: -95, scale: 18 });
  scene.add(holoCat.group);
  holos.lights.push(holoCat.light);
} catch (e) { console.warn('cat not loaded', e); }
const sky = buildSky();
scene.add(sky);
const traffic = buildTraffic();
scene.add(traffic.group);
await say('下起雨来…');
const rain = buildRain();
scene.add(rain.group);

// ---------------------------------------------------------------- choosing the lights near the viewer

// The shaders take the nearest lamps and emitters only; these are chosen each frame, those ahead of the
// viewer first (one ahead is seen, together with its pool of light, much further off than one behind).
const fwd = new THREE.Vector3();
// (each light fading in as it is chosen and out as it is dropped, over half a second or so, so that the rain far
// off does not light up all at once; a few places kept free for those on their way out. When the camera has
// jumped (a cut), straight to where they should be.)
const lit = { lamps: new Map(), em: new Map(), at: new THREE.Vector3(Infinity, 0, 0) };
function fading(map, ranked, n, k, snap) {
  const want = new Set(ranked.slice(0, n - 4));
  for (const o of want) if (!map.has(o)) map.set(o, snap ? 1 : 0);
  for (const [o, w] of map) {
    const to = want.has(o) ? 1 : 0, nw = snap ? to : w + (to - w) * k;
    if (!to && nw < 0.01) map.delete(o); else map.set(o, nw);
  }
  return [...map].sort((x, y) => y[1] - x[1]).slice(0, n);
}
function pickLights(dt) {
  camera.getWorldDirection(fwd);
  const p = camera.position;
  const snap = p.distanceTo(lit.at) > 8, k = 1 - Math.exp(-dt * 5);
  lit.at.copy(p);
  const score = (o, reach) => {
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
    const ahead = (dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-3);
    return (d / Math.sqrt(reach)) * (ahead > -0.2 ? 1 : 1.8);
  };
  const lamps = fading(lit.lamps, city.lamps.map((l) => [score(l, 20), l]).sort((a, b) => a[0] - b[0]).map((q) => q[1]), N_LAMP, k, snap);
  for (let i = 0; i < N_LAMP; i++) {
    const [l, w] = lamps[i] ?? [null, 0];
    shared.uLamp.value[i].set(l ? l.x : 0, l ? l.y : 0, l ? l.z : 0, l ? (l.power ?? 1.5) * w : 0);
  }
  const em = fading(lit.em, city.emitters.map((e) => [score(e, e.reach), e]).sort((a, b) => a[0] - b[0]).map((q) => q[1]), N_BB, k, snap);
  for (let i = 0; i < N_BB; i++) {
    const [e, w] = em[i] ?? [null, 0];
    shared.uBb.value[i].set(e ? e.x : 0, e ? e.y : 0, e ? e.z : 0, e ? e.power * w : 0);
    shared.uBbN.value[i].set(e ? e.nx : 0, e ? e.ny : 0, e ? e.nz : 1, e ? e.reach : 1);
    shared.uBbTint.value[i] = e ? e.tint : 0;
  }
  for (let i = 0; i < N_PT; i++) {
    const h = holos.lights[i];
    shared.uPt.value[i].set(h ? h.x : 0, h ? h.y : 0, h ? h.z : 0, h ? h.power : 0);
    shared.uPtR.value[i] = h ? h.reach : 1;
  }
}

// ---------------------------------------------------------------- post

const rt = new THREE.WebGLRenderTarget(W() * PR, H() * PR, { type: THREE.HalfFloatType, samples: 4 });
rt.depthTexture = new THREE.DepthTexture(W() * PR, H() * PR);
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.42, 0.45, 1.0);
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
// (indoors its faintest, widest spill cut off, so that the surfaces round a light keep their flat tones: the glow
// stays close about the lights themselves; uFloor: how faint is too faint, set each frame, see the loop)
{
  const m = bloom.compositeMaterial;
  m.uniforms.uFloor = { value: 0 };
  m.fragmentShader = 'uniform float uFloor;\n' + m.fragmentShader.replace(/\}\s*$/,
    '  gl_FragColor.rgb *= smoothstep(uFloor, uFloor * 2.0, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)));\n}');
  m.needsUpdate = true;
}
composer.addPass(bloom);
// the bloom's glow not added over the frame by its own last pass, but in the finish, with the ink lines, the
// vignette and the grain, all in one pass (post.js); outline: the finish's lines, for the tuning
{
  const quad = bloom.fsQuad, draw = quad.render.bind(quad);
  quad.render = (r) => { if (quad.material !== bloom.blendMaterial) draw(r); };
}
const finish = new FinishPass(camera), outline = finish;
finish.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
composer.addPass(finish);

function resize() {
  camera.aspect = W() / H();
  camera.updateProjectionMatrix();
  renderer.setSize(W(), H());
  composer.setSize(W(), H());
  reflRT.setSize(Math.round(W() * PR / 2), Math.round(H() * PR / 2));
  lowRT.setSize(Math.round(W() * PR / 2), Math.round(H() * PR / 2));
  rain.resize(camera, H() * PR);
  finish.uniforms.uAspect.value = W() / H();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- the tunable look (tuning.json)

const tuned = { rain, bloom, outline, finish, sky, renderer, ads: city.ads, holos };

// the rain's roofs and raised ground (see rain.js): the raised ground is few and set once; the roofs nearest
// the viewer are chosen each frame
city.lifts.slice(0, 6).forEach((l, i) => {
  rain.uniforms.uLift.value[i].set(l.x0, l.x1, l.z0, l.z1);
  rain.uniforms.uLiftY.value[i] = l.y;
});
function pickCovers() {
  const p = camera.position;
  const near = [...city.covers].sort((a, b) => Math.abs((a.z0 + a.z1) / 2 - p.z) - Math.abs((b.z0 + b.z1) / 2 - p.z));
  for (let i = 0; i < 6; i++) {
    const c = near[i];
    rain.uniforms.uCover.value[i].set(c ? c.x0 : 0, c ? c.x1 : 0, c ? c.z0 : 0, c ? c.z1 : 0);
    rain.uniforms.uCoverY.value[i] = c ? c.y : 0;
  }
}
applyTuning(tuning, tuned);
// ---------------------------------------------------------------- the viewer, and the controls

const sound = new Soundscape();
const walker = new Walker(camera, renderer.domElement, {
  colliders: city.colliders,
  floors: city.floors,
  sights: city.sights,
  onStep: (run) => sound.step(run),
  onModeChange: (mode) => { ui.mode.textContent = mode === 'auto' ? '漫步中 · 空格 自由行走' : '自由行走 · 空格 继续漫步'; },
});
walker.onModeChange('auto');

// the look: three tones or two (T, the chip); and, not offered anywhere, colour (three tones, the city's cyan with
// accents of other colours): C twice quickly, and again to leave it (back to the tones it was in)
const TONES = [{ key: 'three', name: '三分光影' }, { key: 'two', name: '二分光影' }, { key: 'color', name: '彩色' }];
const choice = { tone: 'three', plain: 'three', rain: 1 };
try { Object.assign(choice, JSON.parse(localStorage.getItem('night-rain-city.choice') || '{}')); } catch { /* storage unavailable */ }
if ('three' in choice) { choice.tone ??= choice.three ? 'three' : 'two'; delete choice.three; }   // as it was kept before
if (!TONES.some((t) => t.key === choice.tone)) choice.tone = 'three';
if (choice.plain !== 'two') choice.plain = 'three';
const keep = () => { try { localStorage.setItem('night-rain-city.choice', JSON.stringify(choice)); } catch { /* storage unavailable */ } };
function applyChoice() {
  shared.uThree.value = choice.tone === 'two' ? 0 : 1;
  shared.uColorMode.value = choice.tone === 'color' ? 1 : 0;
  applyTuning(tuning, tuned);   // its palette, or the city's own
  ui.tone.textContent = TONES.find((t) => t.key === choice.tone).name;
  rain.setLevel(choice.rain);
  sound.setRain(choice.rain);
  ui.rain.textContent = RAIN_LEVELS[choice.rain].name;
  ui.sound.style.opacity = sound.muted ? 0.4 : '';
}
applyChoice();
// the sliders: how fast one walks (a walk's speed to half again a run's), how loud the music; kept with the rest
for (const [el, key, set] of [[ui.pace, 'pace', (v) => { walker.pace = v; }], [ui.music, 'music', (v) => sound.setMusicVolume(v)]]) {
  choice[key] = Number.isFinite(choice[key]) ? THREE.MathUtils.clamp(choice[key], 0, 1) : 0.5;
  el.value = choice[key];
  set(choice[key]);
  el.addEventListener('input', () => { choice[key] = +el.value; set(choice[key]); keep(); });
  el.addEventListener('change', () => el.blur());               // (the keys back to walking)
  el.addEventListener('keydown', (e) => e.stopPropagation());
}
const toggleTone = () => {
  choice.tone = choice.plain = choice.tone === 'three' ? 'two' : 'three';   // (from colour: three tones)
  keep();
  applyChoice();
};
let lastC = -1;
const secretColour = (e) => {
  if (e.timeStamp - lastC > 400) { lastC = e.timeStamp; return; }
  lastC = -1;
  choice.tone = choice.tone === 'color' ? choice.plain : 'color';
  keep();
  applyChoice();
};
const cycleRain = () => { choice.rain = (choice.rain + 1) % RAIN_LEVELS.length; keep(); applyChoice(); };
const toggleSound = () => { sound.toggle(); applyChoice(); };
// 长夏乐馆's music: which piece (kept in this browser, if it can be)
{
  let track = 'galaxy';                 // (银河列车, unless another was chosen)
  try { track = localStorage.getItem('night-rain-city-track') || 'galaxy'; } catch { /* storage unavailable */ }
  if (!['galaxy', 'summer', 'isle', 'fields'].includes(track)) track = 'galaxy';   // (雨夜, once, is gone)
  const pick = (t) => {
    track = t;
    sound.setTrack(t);
    for (const b of ui.concert.querySelectorAll('button')) b.classList.toggle('on', b.dataset.track === t);
    try { localStorage.setItem('night-rain-city-track', t); } catch { /* storage unavailable */ }
  };
  for (const b of ui.concert.querySelectorAll('button')) b.addEventListener('click', (e) => { e.stopPropagation(); pick(b.dataset.track); b.blur(); });
  ui.concert.addEventListener('pointerdown', (e) => e.stopPropagation());
  pick(track);
}
ui.tone.addEventListener('click', toggleTone);
ui.rain.addEventListener('click', cycleRain);
ui.sound.addEventListener('click', toggleSound);
addEventListener('keydown', (e) => {
  if (e.repeat || e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyT') toggleTone();
  if (e.code === 'KeyC') secretColour(e);
  if (e.code === 'KeyR') cycleRain();
  if (e.code === 'KeyM') toggleSound();
});

// ---------------------------------------------------------------- the loop

// what is drawn only from near enough: the metro station, the bookshop, the shops' insides, the trees, what stands
// along the street, each lot within its reach; and in the wet street's mirror, if less far (refl), within that
const lots = [...city.interiors, ...trees.lots];
function showLots(refl) {
  for (const r of lots) {
    const near = Math.hypot(camera.position.x - r.x, camera.position.z - r.z) < (refl ? r.refl ?? r.reach : r.reach);
    for (const m of r.meshes) m.visible = near;
  }
}

const whaleSight = { x: 0, y: 0, z: 0, r: 70, weight: 1.6 };
let time = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  shared.uTime.value = time;

  const w = holos.whale.position;
  Object.assign(whaleSight, { x: w.x, y: w.y, z: w.z });
  const whaleShown = holos.lights[0].power > 0.5;
  walker.update(dt, whaleShown ? [whaleSight] : []);
  holos.update(time, dt, camera.position);
  holoCat?.update(time, dt);
  city.infoBoard.update(time, RAIN_LEVELS[choice.rain]?.name);
  museum.update(camera.position);
  {                                     // 长夏乐馆's music: softly all over the city, full within 20 m of it
    const c = city.concert, d = Math.hypot(camera.position.x - c.x, camera.position.z - c.z);
    const near = 1 - THREE.MathUtils.smoothstep(d, 20, 60);
    if (!NO_MUSIC) sound.setMusic(0.2 + 0.8 * near);
    ui.concert.classList.toggle('show', near > 0.3);   // (its music to choose, near it)
    city.concertBeat.value += (sound.musicLoudness() - city.concertBeat.value) * (1 - Math.exp(-dt * 10));   // (its lights swell with it)
  }
  traffic.update(time, camera.position.z);
  people.update(time, camera.position.z);
  trees.update(time, camera.position.z);
  pickCovers();
  // indoors (under a room's ceiling, or down in the station) the bloom's faint spill is cut off, so the room's
  // things keep their flat tones; out in the rain it stays, a haze about the lights; and the rain's sound fades
  {
    // (down below the street is indoors, the metro station, but for a sunken plaza, open to the sky: uHoles)
    const p = camera.position, open = shared.uHoles.value.some((h) => p.x > h.x && p.x < h.y && p.z > h.z && p.z < h.w);
    const room = (p.y < -1 && !open) || city.covers.some((c) => c.room && p.y < c.y && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1);
    sound.setIndoors(room);
    const u = bloom.compositeMaterial.uniforms.uFloor;
    u.value += ((room ? tuning.post.bloomFloor ?? 0.1 : 0) - u.value) * (1 - Math.exp(-dt * 4));
  }
  // the automatic doors: open as one comes near, closed (and in the way) otherwise
  for (const d of city.doors) {
    const near = Math.hypot(camera.position.x - d.x, camera.position.z - d.z) < 3.4;
    d.open += ((near ? 1 : 0) - d.open) * (1 - Math.exp(-dt * 5));
    const e = d.open * d.open * (3 - 2 * d.open);
    for (const l of d.leaves) l.mesh.position.z = l.z + l.dir * e * l.travel;
    d.collider.y1 = d.open > 0.7 ? -100 : d.top;
  }
  sky.position.copy(camera.position);

  updateShadow();
  pickLights(dt);
  showLots(true);
  renderReflection();
  showLots(false);
  finish.uniforms.uTime.value = time;
  composer.render(dt);
  requestAnimationFrame(frame);
}

await say('');
requestAnimationFrame(frame);
ui.intro.classList.add('ready');
ui.intro.addEventListener('click', () => {
  ui.intro.classList.add('gone');
  sound.start();
  ui.hint.classList.add('show');
  setTimeout(() => ui.hint.classList.remove('show'), 12000);
}, { once: true });

// for poking at from the console
window.__city = { holoCat, museum, layout: city, camera, walker, shared, scene, renderer, composer, bloom, outline, finish, rt, reflRT, shadowRT, tuning, renderReflection, showLots, people, trees, apply: () => applyTuning(tuning, tuned) };
