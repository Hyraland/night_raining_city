// The adjustable look: the tones and their colours, the moon, the air, the rain, the glass, the wet street,
// the screens, the final grade. tuning.json in the project holds the values everyone sees (without it, the
// defaults below).

import * as THREE from 'three';
import { shared, PALETTE } from './toon.js';
import { mascotUniforms } from './mascot.js';
import { ADS } from './ads/catalog.js';
import { BRANDS, OTHER_CASES } from './ads/brands.js';

export const TUNING_DEFAULTS = {
  hue: { shift: 0, saturation: 1 },  // the whole family of colours turned and (de)saturated together
  tones: { edge1: 0.17, edge2: 0.45, edgeTwo: 0.3, soft: 0.012, streetLift: 0.5 },
  palette: { deep: PALETTE.deep, mid: PALETTE.mid, lit: PALETTE.lit, litTint: PALETTE.litTint, shade2: PALETTE.shade2 },
  moon: { elevation: 24.8, azimuth: 199.2, strength: 0.75 },
  air: { fog: PALETTE.fog, haze: PALETTE.haze, density: 0.0042, zenith: '#040d16' },
  rain: {
    brightness: 1.25, litAlpha: 0.9, midAlpha: 0.24, darkAlpha: 0.06, midAt: 0.38, litAt: 0.74,
    length: 1, speed: 10.5, wind: 0, reach: 95,
    lit: '#e6f2f2', mid: '#5fbcd0', dark: '#2a5c70',
  },
  glass: { reflect: 1, rooms: 1 },
  indoor: { light: 0.34 },             // the metro station's general lighting
  fonts: { signs: '苹方', brands: '苹方', metro: '苹方', shopRound: '站酷快乐体' },   // see atlas.js FONTS; applied on the next load (shopRound, 白云乡's and 流波月's names: their signs at once)
  street: { wet: 1, reflLo: 0.3, reflHi: 0.8 },
  // the LED screens' colours (dark, mid, hot); cases, the brands'
  // ads as shallow lit cases (city.js brandCase); icons, some cases' things cut from game-icons.net's icons;
  // style 'led' or flat 'poster's, own and bright for the posters
  screens: { dark: PALETTE.scrDark, mid: PALETTE.scrMid, hot: 2.3, cases: true, icons: true, style: 'led', own: true, bright: 0.9 },
  cat: {
    faceW: 0.27, faceH: 0.19, eyeGap: 0.115, eyeSize: 0.066, eyeY: 0.012, pupil: 0.038,
    ears: 1, helmet: 0.37, body: 1, mouth: 1, whiskers: 1, line: 1,
  },
  // each brand's case's colours, by its key in ads/brands.js: hue (degrees turned), saturation and lightness
  // (1 = as made)
  caseColors: Object.fromEntries([...BRANDS, ...OTHER_CASES].map((b) => [b.key, { hue: 0, saturation: 1, lightness: 1 }])),
  // each ad's speed (1 = as made), by its key in ads/catalog.js
  ads: Object.fromEntries(ADS.map((a) => [a.key, a.speed])),
  // the colour mode (the third choice beside three and two tones): the city in its own colours under a night
  // that leans blue. Its tones (in place of palette, air.fog/haze, screens.dark, rain.mid/dark), the colour of
  // lamplight and lit rooms, the four neon colours of signs and light strips (amber .. mint), and of the cyan
  // light strips the share that stays cyan and the share in a neon colour (the rest go warm white)
  color: {
    deep: '#0a1525', mid: '#38506c', lit: '#f2ece2', litTint: '#c4d6f5', shade2: '#22324a',
    fog: '#142030', haze: '#4d6680', screenDark: '#05080c', rainMid: '#8aa4c0', rainDark: '#2c3c52',
    lamp: '#ffd6a8', amber: '#ffa65c', coral: '#ff4a5e', violet: '#9d7dff', mint: '#6effa6', cyan: 0.3, neon: 0.2,
  },
  // the holograms: which whale swims over the street ('ours' from blender/build_whale.py, 'sketchfab' the
  // downloaded one made over by blender/convert_reference_whale.py)
  holo: { whale: 'ours' },
  post: { bloom: 0.42, bloomRadius: 0.45, bloomThreshold: 1, bloomFloor: 0.1, outline: 0.75, outlineColor: '#030c14', vignette: 0.55, grain: 0.025 },
};

// the look as tuning.json has it, over the defaults
export async function loadTuning() {
  const t = structuredClone(TUNING_DEFAULTS);
  const mergeIn = (src) => {
    for (const group of Object.keys(t)) if (src?.[group]) Object.assign(t[group], src[group]);
  };
  let fromFile = null;
  try {
    const r = await fetch('tuning.json', { cache: 'no-store' });
    if (r.ok) fromFile = await r.json();
  } catch { /* no file: the defaults */ }
  mergeIn(fromFile);
  return t;
}

// Put the values to work. parts: what else needs telling (the rain's uniforms, the passes, the sky);
// returns true when the moon moved, so its shadows must be drawn again.
// Turning every colour round the grey axis by deg, then scaling its saturation (in linear RGB). Whites and
// greys stay as they are; the cyans and blues move together, keeping their places relative to each other.
export function hueSatMatrix(deg, sat) {
  const a = THREE.MathUtils.degToRad(deg), c = Math.cos(a), s = Math.sin(a) / Math.sqrt(3), k = (1 - c) / 3;
  const rot = new THREE.Matrix3().set(
    c + k, k - s, k + s,
    k + s, c + k, k - s,
    k - s, k + s, c + k,
  );
  const [lr, lg, lb] = [0.2126, 0.7152, 0.0722];
  const satM = new THREE.Matrix3().set(
    lr * (1 - sat) + sat, lg * (1 - sat), lb * (1 - sat),
    lr * (1 - sat), lg * (1 - sat) + sat, lb * (1 - sat),
    lr * (1 - sat), lg * (1 - sat), lb * (1 - sat) + sat,
  );
  return satM.multiply(rot);
}

export function applyTuning(t, { rain, bloom, outline, finish, sky, renderer, ads, holos }) {
  const u = shared;
  // in the colour mode the city's own colours, its palette in place of the cyan one, the master hue left out
  const C = u.uColorMode.value > 0.5, pal = C ? t.color : t.palette;
  const M = C ? hueSatMatrix(0, 1) : hueSatMatrix(t.hue.shift, t.hue.saturation);
  u.uHue.value.copy(M);
  // a colour from the settings, turned to the master hue
  const turned = (color, hex) => {
    color.set(hex).applyMatrix3(M);
    color.setRGB(Math.max(color.r, 0), Math.max(color.g, 0), Math.max(color.b, 0));
    return color;
  };
  u.uE1.value = t.tones.edge1;
  u.uE2.value = t.tones.edge2;
  u.uE.value = t.tones.edgeTwo;
  u.uSoft.value = t.tones.soft;
  u.uStreetLift.value = t.tones.streetLift;
  turned(u.uDeep.value, pal.deep);
  turned(u.uMid.value, pal.mid);
  turned(u.uLit.value, pal.lit);
  turned(u.uLitTint.value, pal.litTint);
  turned(u.uShade2.value, pal.shade2);

  const el = THREE.MathUtils.degToRad(t.moon.elevation), az = THREE.MathUtils.degToRad(t.moon.azimuth);
  const before = u.uKeyDir.value.clone();
  u.uKeyDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  u.uKey.value = t.moon.strength;

  turned(u.uFog.value, C ? t.color.fog : t.air.fog);
  turned(u.uHaze.value, C ? t.color.haze : t.air.haze);
  u.uFogDensity.value = t.air.density;
  turned(sky.material.uniforms.uZenith.value, t.air.zenith);
  renderer.setClearColor(u.uFog.value);

  const r = rain.uniforms;
  r.uRainBright.value = t.rain.brightness;
  r.uRainAlpha.value.set(t.rain.darkAlpha, t.rain.midAlpha, t.rain.litAlpha);
  r.uRainAt.value.set(t.rain.midAt, t.rain.litAt);
  r.uRainLen.value = t.rain.length;
  r.uFall.value = t.rain.speed;
  r.uWind.value.set(t.rain.wind, 0, t.rain.wind * 0.4);
  r.uRainReach.value = t.rain.reach;
  // the lit colour is set bright enough to bloom: the chosen colour, scaled up
  turned(r.uRainLit.value, t.rain.lit).multiplyScalar(1.9);
  turned(r.uRainMid.value, C ? t.color.rainMid : t.rain.mid);
  turned(r.uRainDeep.value, C ? t.color.rainDark : t.rain.dark);

  u.uGlassRefl.value = t.glass.reflect;
  u.uIndoor.value = t.indoor.light;
  u.uRoomBright.value = t.glass.rooms;
  u.uWet.value = t.street.wet;
  u.uReflLo.value = t.street.reflLo;
  u.uReflHi.value = t.street.reflHi;
  turned(u.uScrDark.value, C ? t.color.screenDark : t.screens.dark);
  turned(u.uScrMid.value, t.screens.mid);
  u.uScrHot.value = t.screens.hot;
  u.uAdPoster.value = t.screens.style === 'led' ? 0 : 1;
  u.uAdOwn.value = t.screens.own ? 1 : 0;
  u.uAdBright.value = t.screens.bright;
  [...BRANDS.map((b, i) => [b.key, i]), ...OTHER_CASES.map((o) => [o.key, o.slot])].forEach(([key, i]) => {
    const c = t.caseColors[key];
    if (c && u.uCaseAdj.value[i]) u.uCaseAdj.value[i].set(THREE.MathUtils.degToRad(c.hue), c.saturation, c.lightness);
  });

  ADS.forEach((a, i) => { ads.uAdSpeed.value[i] = t.ads[a.key] ?? a.speed; });

  // the colour mode's lamplight and neon colours, brightest channel at 1
  const ac = new THREE.Color();
  const unit = (v, hex) => { ac.set(hex); const m = Math.max(ac.r, ac.g, ac.b, 1e-3); v.set(ac.r / m, ac.g / m, ac.b / m); };
  unit(u.uLampColor.value, t.color.lamp);
  ['amber', 'coral', 'violet', 'mint'].forEach((name, i) => unit(u.uNeon.value[i], t.color[name]));
  u.uLightMix.value.set(t.color.cyan, t.color.neon);
  holos?.setWhale(t.holo.whale);

  const k = t.cat, mu = mascotUniforms;
  mu.uCat0.value.set(k.faceW, k.faceH, k.eyeGap, k.eyeSize);
  mu.uCat1.value.set(k.eyeY, k.pupil, k.ears, k.helmet);
  mu.uCat2.value.set(k.body, k.mouth, k.whiskers, k.line);

  bloom.strength = t.post.bloom;
  bloom.radius = t.post.bloomRadius;
  bloom.threshold = t.post.bloomThreshold;
  outline.uniforms.uStrength.value = t.post.outline;
  turned(outline.uniforms.uColor.value, t.post.outlineColor);
  finish.uniforms.uVignette.value = t.post.vignette;
  finish.uniforms.uGrain.value = t.post.grain;

  return before.distanceToSquared(u.uKeyDir.value) > 1e-10;
}
