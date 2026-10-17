// The words and logos on the signs and ads, drawn once into one texture (2048 x 6784), white on black; the
// shaders colour them. Each rect is cut to what is in it, so its proportions are its content's.
//   0–1024     sixteen vertical strips: the blade signs, the big single characters
//   1024–2048  sixteen horizontal strips: shop signs, the floating street signs, the ring of text
//   2048–4096  the brands of ads/brands.js: their logos, names across and down, and taglines
//   4096–5376  twenty more horizontal strips (SIGNS2): the station's and the holographic signs' words
//   5376–6784  a second band of brands (the 13th to the 20th): logos, names across, taglines, names down
// Three fonts, chosen in the tuning (fonts): for the signs, the brands, and the metro.

import * as THREE from 'three';
import { BRANDS, METRO } from './ads/brands.js';

export const VERTICAL = [
  '书店', '花店', '咖啡', '烘焙坊', '茶室', '画廊', '音乐厅', '图书馆',
  '雨', '夜', '光', '城', '游泳馆', '花园', '剧场', '市集',
];
export const HORIZONTAL = [
  '希洛 HILO', 'OPEN', '书店 BOOKS', '花店 FLOWERS', '咖啡 CAFÉ', '公园 → PARK', '画廊 GALLERY', '烘焙 BAKERY',
  '光 · 影', '星港 → 2.4KM', '图书馆 LIBRARY', '去星环 · STAR RING', '自然博物馆 MUSEUM', 'NEO 新城', '今晚 · 露天电影', '← 地铁 METRO',
];
// more signs: the station's, the holographic signs', the machines' titles (rects.h2)
export const SIGNS2 = [
  '闸机 GATES ↑', '出口 EXIT ↑', '9号线 LINE 9', '星港南 STAR PORT SOUTH', '春晴便利店 24H', '抽卡 · 盲盒', '浮岛咖啡 CAFÉ', '夕光烘焙 BAKERY',
  '长夏乐馆 CONCERT HALL', '换乘 TRANSFER →', '↑ 往 星环航站', '列车即将到站', '欢迎来到星港', '萤伞', '自动售货 VENDING', '扭蛋 GACHA',
  // the bookshop across from the station, and the rain shelter before it
  '光合书店 BOOKS', '雨亭 · 避雨 · 充电', '今夜有雨 · 记得带伞', '← 地铁 9号线 METRO',
  // the way to the metro, seen from either side of its sign
  '← 地铁 METRO', '地铁 METRO →',
  // the offices' names over their doors, in white light (潮汐能源's by the great cat, 深蓝计算's on its plinth)
  '潮汐能源 TIDE ENERGY', '深蓝计算 DEEP BLUE COMPUTING',
];
export const S2 = Object.fromEntries(SIGNS2.map((t, i) => [t, i]));

// The fonts one may choose (tuning.fonts): a label, the CSS family, and whether it comes from
// Google Fonts (index.html loads those; they are fetched for the characters used before drawing).
export const FONTS = {
  '苹方': { css: '"PingFang SC"' },
  '思源黑体': { css: '"Noto Sans SC"', web: true },
  '思源宋体': { css: '"Noto Serif SC"', web: true },
  '冬青黑体': { css: '"Hiragino Sans GB"' },
  '宋体': { css: '"Songti SC"' },
  '楷体': { css: '"Kaiti SC"' },
  '站酷庆科黄油体': { css: '"ZCOOL QingKe HuangYou"', web: true },
  '站酷快乐体': { css: '"ZCOOL KuaiLe"', web: true },
  '站酷小薇': { css: '"ZCOOL XiaoWei"', web: true },
  '马善政毛笔': { css: '"Ma Shan Zheng"', web: true },
};
const fallback = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const family = (label) => `${(FONTS[label] || FONTS['苹方']).css}, ${fallback}`;
// a font chosen by its label, ready to draw text (a web font fetched first for those characters)
export async function fontFamily(label, text) {
  if (FONTS[label]?.web) await document.fonts.load(`600 80px ${FONTS[label].css}`, text).catch(() => {});
  return family(label);
}

// the line under the mascot's ads for trips to the Star Ring
export const STAR_RING = 11;
// the single-character strips, for the giant glyph screens
export const SINGLE = [8, 9, 10, 11];

const S = 2048, SH = 6784 + 384;   // (the last 384: the second set of signs past its first twenty)

// fonts: { signs, brands, metro }, labels of FONTS
export async function buildAtlas(fonts = {}) {
  const F = { signs: family(fonts.signs), brands: family(fonts.brands), metro: family(fonts.metro) };
  // the web fonts in use, fetched for the characters they will draw
  const all = [...VERTICAL, ...HORIZONTAL, ...SIGNS2, METRO.cn, METRO.en, ...BRANDS.flatMap((b) => [b.name, b.en, b.vertical, b.tagline])].join('');
  await Promise.all(Object.values(fonts).filter((l) => FONTS[l]?.web).map((l) =>
    document.fonts.load(`600 80px ${FONTS[l].css}`, all).catch(() => {})));
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = SH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, SH);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const rects = { v: [], h: [], brands: {} };
  const rect = (x, y, w, h) => new THREE.Vector4(x / S, 1 - (y + h) / SH, (x + w) / S, 1 - y / SH);

  VERTICAL.forEach((text, i) => {
    const x = i * 128, chars = [...text];
    const size = Math.min(116, 980 / chars.length);
    ctx.font = `600 ${size}px ${F.signs}`;
    const tall = chars.length * size * 1.04, top = 512 - tall / 2;
    chars.forEach((ch, k) => ctx.fillText(ch, x + 64, top + (k + 0.5) * size * 1.04));
    rects.v.push(rect(x, Math.max(0, top - 14), 128, Math.min(1024, tall + 28))); // just the characters
  });
  HORIZONTAL.forEach((text, j) => {
    const x = (j % 2) * 1024, y = 1024 + Math.floor(j / 2) * 128;
    ctx.font = `600 92px ${F.signs}`;
    const w = ctx.measureText(text).width;
    ctx.save();
    ctx.translate(x + 512, y + 66);
    if (w > 980) ctx.scale(980 / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    const used = Math.min(w, 980) + 48;
    rects.h.push(rect(x + 512 - used / 2, y, used, 128));
  });

  // the brands
  const line = (text, x, y, w, h, px, font = F.brands) => { // one line of text centred in a w x h cell, cut to its width
    ctx.font = `600 ${px}px ${font}`;
    const tw = ctx.measureText(text).width, fit = w - 40;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2 + px * 0.04);
    if (tw > fit) ctx.scale(fit / tw, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    const used = Math.min(tw, fit) + 32;
    return rect(x + w / 2 - used / 2, y, used, h);
  };
  BRANDS.slice(0, 20).forEach((b, k) => {
    const r = {};
    // the first twelve in their band, the rest in the second (B: its top, i: the place in it)
    const second = k >= 12, i = second ? k - 12 : k, B = 5376;
    // logo: a 256 square, drawn in a -1..1 frame with round line ends
    const lx = (i % 8) * 256, ly = second ? B : 2048 + Math.floor(i / 8) * 256;
    ctx.save();
    ctx.translate(lx + 128, ly + 128);
    ctx.scale(104, 104);
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    ctx.lineCap = ctx.lineJoin = 'round';
    b.logo(ctx);
    ctx.restore();
    r.logo = rect(lx + 12, ly + 12, 232, 232);
    // the name across (Chinese and English), and the tagline
    r.name = line(`${b.name} ${b.en}`, (i % 2) * 1024, (second ? B + 256 : 2560) + Math.floor(i / 2) * 128, 1024, 128, 88);
    r.tag = line(b.tagline, (i % 2) * 1024, (second ? B + 768 : 3328) + Math.floor(i / 2) * 64, 1024, 64, 46);
    // the name down, character by character, for tall screens
    const chars = [...b.vertical], vx = i * 128, vy = second ? B + 1024 : 3712, size = Math.min(110, 370 / chars.length);
    ctx.font = `600 ${size}px ${F.brands}`;
    const tall = chars.length * size * 1.04, top = vy + 192 - tall / 2;
    chars.forEach((ch, k) => ctx.fillText(ch, vx + 64, top + (k + 0.5) * size * 1.04));
    r.nameV = rect(vx, top - 10, 128, tall + 20);
    rects.brands[b.key] = r;
  });

  // the metro's signs, in the spare corner beside the second row of logos (x 1024–2048, y 2304–2560)
  {
    ctx.save();
    ctx.translate(1024 + 128, 2304 + 128);
    ctx.scale(104, 104);
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    METRO.badge(ctx);
    ctx.restore();
    ctx.font = `700 150px ${F.metro}`;
    ctx.fillText(METRO.line, 1024 + 128, 2304 + 136);
    rects.metro = {
      badge: rect(1024 + 12, 2304 + 12, 232, 232),
      cn: line(METRO.cn, 1280, 2304, 768, 128, 80, F.metro),
      en: line(METRO.en, 1280, 2432, 768, 128, 64, F.metro),
    };
  }
  // the second set of signs, in the metro's font: twenty in their band (4096 down to the brands' second band at
  // 5376), the rest at the foot, below everything
  rects.h2 = SIGNS2.map((text, j) => line(text, (j % 2) * 1024, j < 20 ? 4096 + Math.floor(j / 2) * 128 : 6784 + Math.floor((j - 20) / 2) * 128, 1024, 128, 92, F.metro));

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, rects };
}
