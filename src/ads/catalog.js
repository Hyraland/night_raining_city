// The ad catalog: every ad the city's screens can show, as reusable assets. An ad is a template (how it is
// drawn: a shader program in screens.js, vfx.js or mascot.js) with its own settings (its speed, its brand).
// The city places ads by their entry here (see city.js); each one's speed can be changed in tuning.json
// under "ads". To make a new ad: add an entry; for a new brand ad, add the brand in brands.js.

import * as THREE from 'three';
import { PROG } from '../screens.js';
import { BRANDS, METRO } from './brands.js';
import { S2 } from '../atlas.js';

export const N_AD = 40; // room in the shader's tables

export const ADS = [
  // color: its colour in the colour mode (screens drawn from a template each turn a little from it)
  { key: 'glyph-rain', name: '字符雨', tpl: PROG.GLYPHS, speed: 1, color: '#3ee07a' },
  { key: 'pulse-rings', name: '脉冲圆环', tpl: PROG.RINGS, speed: 1, color: '#ff4fa0' },
  { key: 'equalizer', name: '均衡器', tpl: PROG.BARS, speed: 1, color: '#ffb340' },
  { key: 'sign-word', name: '招牌文字', tpl: PROG.TEXT, speed: 1, color: '#ffc98a' },
  { key: 'star-ring-cat', name: '星环小猫（动画）', tpl: PROG.CAT, speed: 1, color: '#33d6ff' },
  { key: 'neon-horizon', name: '网格地平线', tpl: PROG.HORIZON, speed: 1, color: '#c050ff' },
  { key: 'giant-glyph', name: '巨字', tpl: PROG.GLYPH, speed: 1, color: '#ff5a4a' },
  { key: 'oscilloscope', name: '示波器', tpl: PROG.WAVES, speed: 1, color: '#40ffd0' },
  { key: 'ticker', name: '滚动字幕', tpl: PROG.TICKER, speed: 1, color: '#ffd040' },
  { key: 'ribbons', name: '光带', tpl: PROG.RIBBONS, speed: 1, color: '#ff6ad5' },
  { key: 'liquid-blobs', name: '液态光团', tpl: PROG.BLOBS, speed: 1, color: '#5a7bff' },
  { key: 'hex-tunnel', name: '六边形隧道', tpl: PROG.TUNNEL, speed: 0.2, color: '#9b5bff' },
  { key: 'interference', name: '波纹干涉', tpl: PROG.INTERFERENCE, speed: 1, color: '#30d8ff' },
  { key: 'vortex', name: '粒子漩涡', tpl: PROG.VORTEX, speed: 1, color: '#8a7dff' },
  { key: 'cells', name: '发光细胞', tpl: PROG.CELLS, speed: 1, color: '#5cff9d' },
  // the metro: a direction sign (the line's badge, the way in words, arrows), or on a long screen its line map
  { key: 'metro-sign', name: '地铁指示牌（9号线）', tpl: PROG.METRO, speed: 1, metro: true, color: METRO.color },
  // the machines in the station: their fronts, a title from atlas.js SIGNS2 along the top
  { key: 'vending', name: '饮料售货机', tpl: PROG.VENDING, speed: 1, title: '自动售货 VENDING', color: '#ff4040' },
  { key: 'card-draw', name: '抽卡机', tpl: PROG.CARDS, speed: 1, title: '抽卡 · 盲盒', color: '#ff9a2e' },
  { key: 'blind-box', name: '盲盒机', tpl: PROG.BLINDBOX, speed: 1, title: '抽卡 · 盲盒', color: '#ff6fb5' },
  { key: 'gacha', name: '扭蛋机', tpl: PROG.GACHA, speed: 1, title: '扭蛋 GACHA', color: '#ffd23c' },
  // the brand ads: logo, name and line laid out for the screen's shape, the name sweeping in
  ...BRANDS.slice(0, 20).map((b) => ({ key: `brand-${b.key}`, name: `${b.name}（品牌）`, tpl: PROG.BRAND, speed: 1, brand: b.key, color: b.color })),
];

export const AD = Object.fromEntries(ADS.map((a, i) => [a.key, i]));
// the plain ad of a template (what a screen that drew that template shows)
export const adOf = (tpl) => ADS.findIndex((a) => a.tpl === tpl);
export const BRAND_ADS = ADS.map((a, i) => (a.brand ? i : -1)).filter((i) => i >= 0);

// The shader's tables, one entry per ad: its template, its speed, and for brand ads where its logo and texts
// are in the atlas. Speeds are set from the tuning (applyTuning).
export function adUniforms(atlas) {
  const v4 = () => Array.from({ length: N_AD }, () => new THREE.Vector4());
  const u = {
    uAdTpl: { value: new Float32Array(N_AD) },
    uAdSpeed: { value: new Float32Array(N_AD).fill(1) },
    uAdLogo: { value: v4() }, uAdName: { value: v4() }, uAdTag: { value: v4() }, uAdNameV: { value: v4() },
    uAdColor: { value: Array.from({ length: N_AD }, () => new THREE.Vector3(0.2, 0.8, 0.9)) },
  };
  const c = new THREE.Color();
  ADS.forEach((a, i) => {
    u.uAdTpl.value[i] = a.tpl;
    if (a.color) { c.set(a.color); const m = Math.max(c.r, c.g, c.b, 1e-3); u.uAdColor.value[i].set(c.r / m, c.g / m, c.b / m); }
    u.uAdSpeed.value[i] = a.speed;
    const m = a.metro && atlas.rects.metro;
    const r = (a.brand && atlas.rects.brands[a.brand]) || (m && { logo: m.badge, name: m.cn, tag: m.en, nameV: m.cn });
    if (a.title) u.uAdName.value[i].copy(atlas.rects.h2[S2[a.title]]);
    if (r) {
      u.uAdLogo.value[i].copy(r.logo);
      u.uAdName.value[i].copy(r.name);
      u.uAdTag.value[i].copy(r.tag);
      u.uAdNameV.value[i].copy(r.nameV);
    }
  });
  return u;
}
