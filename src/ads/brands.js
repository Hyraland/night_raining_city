// The city's brands: the text and logos the ads are made of. Change a name, a line or a logo here and every
// ad of that brand changes with it (the screens read them from the atlas, see atlas.js and catalog.js).
//
// Each brand: key (an id), color (its colour in the colour mode), name (Chinese), en (English), vertical (the Chinese name for tall screens, read top
// to bottom), tagline (one short line), logo (a function drawing it in white on a canvas, centred at 0,0 in a
// square from -1 to 1: strokes and fills, the shader turns them into glowing lines).
// At most 20 brands fit the atlas (12 in its first band, 8 in the second).

const TAU = Math.PI * 2;
const ring = (c, x, y, r, w = 0.08) => { c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); };
const ellipse = (c, x, y, rx, ry, rot, w = 0.08) => { c.lineWidth = w; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.stroke(); };
const line = (c, pts, w = 0.08) => {
  c.lineWidth = w; c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
};
const dot = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };

// Others with cases of their own that are not brands of the atlas and the catalog (adding one there would change
// which brand every random ad in the city draws): a key, a slot of their own among the cases' colours (toon.js
// uCaseAdj, past the brands'), a name and a line
export const OTHER_CASES = [{ key: 'spring-mart', slot: 23, name: '春晴便利店', en: '24H' }];

export const BRANDS = [
  {
    key: 'star-ring', color: '#33d6ff', name: '星环旅行', en: 'STAR RING', vertical: '星环旅行', tagline: '再见，暗淡蓝点',
    logo(c) {           // the ring, a planet behind it, and two small cat ears on top: the mascot's own brand
      ellipse(c, 0, 0.1, 0.85, 0.3, -0.18, 0.09);
      dot(c, 0, 0.05, 0.28);
      line(c, [[-0.2, -0.22], [-0.12, -0.42], [-0.02, -0.25]], 0.08);
      line(c, [[0.02, -0.25], [0.12, -0.42], [0.2, -0.22]], 0.08);
    },
  },
  {
    key: 'float-cafe', color: '#ff9d5c', name: '浮岛咖啡', en: 'FLOAT CAFÉ', vertical: '浮岛咖啡', tagline: '那座岛将会醒来',
    logo(c) {           // a cup, steam rising
      line(c, [[-0.5, -0.05], [-0.42, 0.5], [0.32, 0.5], [0.4, -0.05], [-0.5, -0.05]], 0.09);
      c.lineWidth = 0.08; c.beginPath(); c.arc(0.5, 0.18, 0.17, -1.4, 1.4); c.stroke();
      for (const x of [-0.2, 0.05]) line(c, [[x, -0.25], [x + 0.08, -0.4], [x, -0.55], [x + 0.08, -0.7]], 0.06);
      line(c, [[-0.6, 0.65], [0.55, 0.65]], 0.06);
    },
  },
  {
    key: 'photon-books', color: '#ffd36b', name: '光合书店', en: 'PHOTON BOOKS', vertical: '光合书店', tagline: '生命会找到路',
    logo(c) {           // an open book, a sun rising out of it
      line(c, [[0, 0.55], [-0.7, 0.4], [-0.7, -0.05], [0, 0.1], [0.7, -0.05], [0.7, 0.4], [0, 0.55], [0, 0.1]], 0.08);
      c.lineWidth = 0.07; c.beginPath(); c.arc(0, -0.05, 0.25, Math.PI, TAU); c.stroke();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i + 0.5) * Math.PI / 5;
        line(c, [[Math.cos(a) * 0.36, -0.05 + Math.sin(a) * 0.36], [Math.cos(a) * 0.52, -0.05 + Math.sin(a) * 0.52]], 0.06);
      }
    },
  },
  {
    key: 'deep-blue', color: '#2f7dff', name: '深蓝泳池', en: 'DEEP BLUE POOL', vertical: '深蓝泳池', tagline: 'Daisy,Daisy,我们在夜空下游泳',
    logo(c) {           // waves in a circle
      ring(c, 0, 0, 0.75, 0.08);
      for (const y of [-0.25, 0.05, 0.35]) {
        c.lineWidth = 0.07; c.beginPath();
        for (let x = -0.55; x <= 0.55; x += 0.02) {
          const yy = y + Math.sin(x * 9) * 0.07;
          x === -0.55 ? c.moveTo(x, yy) : c.lineTo(x, yy);
        }
        c.stroke();
      }
    },
  },
  {
    key: 'glow-umbrella', color: '#9cff6b', name: '萤伞', en: 'GLOW UMBRELLA', vertical: '萤伞', tagline: '生物电',
    logo(c) {           // an umbrella with a glowing rim, a few drops
      c.lineWidth = 0.08; c.beginPath(); c.arc(0, 0.05, 0.7, Math.PI, TAU); c.closePath(); c.stroke();
      line(c, [[0, 0.05], [0, 0.6]], 0.07);
      c.lineWidth = 0.07; c.beginPath(); c.arc(-0.12, 0.6, 0.12, 0, Math.PI); c.stroke();
      for (const [x, y] of [[-0.6, -0.65], [0.1, -0.85], [0.6, -0.6]]) line(c, [[x, y], [x, y + 0.18]], 0.06);
    },
  },
  {
    key: 'neo-metro', color: '#33c7e0', name: '希洛地铁', en: 'NEO METRO', vertical: '希洛地铁', tagline: '末班车 01:20',
    logo(c) {           // the metro's mark: two tunnel arches making an M, over a track, in a ring
      ring(c, 0, 0, 0.84, 0.09);
      for (const cx of [-0.25, 0.25]) {
        c.lineWidth = 0.1; c.beginPath();
        c.moveTo(cx - 0.25, 0.36); c.lineTo(cx - 0.25, -0.06); c.arc(cx, -0.06, 0.25, Math.PI, Math.PI * 2); c.lineTo(cx + 0.25, 0.36);
        c.stroke();
      }
      line(c, [[-0.6, 0.5], [0.6, 0.5]], 0.07);
    },
  },
  {
    key: 'firefly-garden', color: '#b6ff5a', name: '流萤花园', en: 'FIREFLY GARDEN', vertical: '流萤花园', tagline: '报春花正在原野开放',
    logo(c) {           // a leaf, fireflies round it
      c.lineWidth = 0.08; c.beginPath();
      c.moveTo(-0.5, 0.55); c.quadraticCurveTo(-0.55, -0.45, 0.5, -0.55); c.quadraticCurveTo(0.45, 0.45, -0.5, 0.55); c.stroke();
      line(c, [[-0.5, 0.55], [0.3, -0.35]], 0.05);
      for (const [x, y, r] of [[0.6, 0.2, 0.06], [0.35, 0.55, 0.05], [-0.65, -0.3, 0.05], [0.75, -0.75, 0.04]]) dot(c, x, y, r);
    },
  },
  {
    key: 'tide-energy', color: '#3cffc8', name: '潮汐能源', en: 'TIDE ENERGY', vertical: '潮汐能源', tagline: '与盖娅共存',
    logo(c) {           // a bolt over a wave
      line(c, [[0.12, -0.75], [-0.25, 0.0], [0.08, 0.0], [-0.12, 0.6]], 0.09);
      c.lineWidth = 0.07; c.beginPath();
      for (let x = -0.75; x <= 0.75; x += 0.02) {
        const y = 0.45 + Math.sin(x * 6) * 0.08;
        x === -0.75 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    },
  },
  {
    key: 'rain-concert', color: '#c86bff', name: '长夏乐馆', en: 'LONG SUMMER HALL', vertical: '长夏乐馆', tagline: '今晚 20:00 · 中心广场露天',
    logo(c) {           // two notes, rain falling past them
      dot(c, -0.32, 0.45, 0.16); dot(c, 0.32, 0.3, 0.16);
      line(c, [[-0.18, 0.45], [-0.18, -0.45], [0.46, -0.6], [0.46, 0.3]], 0.08);
      line(c, [[-0.18, -0.25], [0.46, -0.4]], 0.08);
      for (const [x, y] of [[-0.7, -0.5], [-0.6, 0.1], [0.75, 0.0], [0.65, 0.6]]) line(c, [[x, y], [x - 0.04, y + 0.18]], 0.05);
    },
  },
  {
    key: 'moon-cinema', color: '#ffe08a', name: '千秋影院', en: 'QIANQIU CINEMA', vertical: '千秋影院', tagline: '在夜晚入梦吧',
    logo(c) {           // a crescent moon in a frame of film
      line(c, [[-0.7, -0.55], [0.7, -0.55], [0.7, 0.55], [-0.7, 0.55], [-0.7, -0.55]], 0.08);
      for (let x = -0.55; x <= 0.56; x += 0.22) { dot(c, x, -0.68, 0.05); dot(c, x, 0.68, 0.05); }
      c.lineWidth = 0.08; c.beginPath(); c.arc(0, 0, 0.32, 0.6, TAU - 0.6); c.arc(0.17, 0, 0.26, TAU - 0.9, 0.9, true); c.closePath(); c.stroke();
    },
  },
  {
    key: 'galaxy-link', color: '#7d6bff', name: '银河通讯', en: 'GALAXY LINK', vertical: '银河通讯', tagline: '连接没有界限',
    logo(c) {           // two orbits crossing, a dot on each
      ellipse(c, 0, 0, 0.75, 0.3, 0.5, 0.07);
      ellipse(c, 0, 0, 0.75, 0.3, -0.5, 0.07);
      dot(c, 0, 0, 0.13);
      dot(c, 0.55, 0.37, 0.07); dot(c, -0.55, 0.37, 0.07);
    },
  },
  {
    key: 'dawn-bakery', color: '#c2c393', name: '夕光烘焙', en: 'DUSK BAKERY', vertical: '夕光烘焙', tagline: '柔软！蓬松！美味！',
    logo(c) {           // a loaf, the sun going down behind it
      c.lineWidth = 0.08; c.beginPath(); c.arc(0, 0.05, 0.42, Math.PI, TAU); c.stroke();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i + 0.5) * Math.PI / 5;
        line(c, [[Math.cos(a) * 0.55, 0.05 + Math.sin(a) * 0.55], [Math.cos(a) * 0.72, 0.05 + Math.sin(a) * 0.72]], 0.06);
      }
      c.lineWidth = 0.09; c.beginPath(); c.moveTo(-0.7, 0.55); c.quadraticCurveTo(0, 0.0, 0.7, 0.55); c.closePath(); c.stroke();
      for (const x of [-0.25, 0.0, 0.25]) line(c, [[x - 0.06, 0.32], [x + 0.06, 0.22]], 0.05);
    },
  },
  // the shops along the street (city.js streetShops)
  {
    key: 'cloud-gelato', color: '#ff9ec4', name: '白云乡', en: 'CLOUD GELATO', vertical: '白云乡', tagline: '不甜！',
    logo(c) {           // a cone, a cloud of a scoop on it
      line(c, [[-0.32, -0.05], [0, 0.78], [0.32, -0.05]], 0.08);
      line(c, [[-0.2, 0.2], [0.12, 0.45]], 0.05); line(c, [[0.2, 0.2], [-0.12, 0.45]], 0.05);
      c.lineWidth = 0.08; c.beginPath();
      c.arc(-0.26, -0.18, 0.2, Math.PI * 0.55, Math.PI * 1.6); c.arc(0, -0.38, 0.24, Math.PI * 1.1, Math.PI * 1.95);
      c.arc(0.26, -0.18, 0.2, Math.PI * 1.45, Math.PI * 0.45); c.closePath(); c.stroke();
    },
  },
  {
    key: 'pearl-moon', color: '#e0b07a', name: '流波月', en: 'PEARL MOON TEA', vertical: '流波月', tagline: '月光茶',
    logo(c) {           // a cup, its straw, pearls at the bottom, a crescent moon
      line(c, [[-0.42, -0.35], [-0.3, 0.75], [0.3, 0.75], [0.42, -0.35], [-0.42, -0.35]], 0.08);
      line(c, [[0.08, -0.35], [0.28, -0.85]], 0.08);
      for (const [x, y] of [[-0.15, 0.55], [0.05, 0.6], [0.2, 0.5], [-0.05, 0.42]]) dot(c, x, y, 0.07);
      c.lineWidth = 0.07; c.beginPath(); c.arc(-0.62, -0.62, 0.2, 0.9, 4.5); c.arc(-0.55, -0.68, 0.16, 4.2, 1.2, true); c.closePath(); c.stroke();
    },
  },
  {
    key: 'meow-store', color: '#ffd166', name: '喵星杂货', en: 'MEOW STORE', vertical: '喵星杂货', tagline: '星环小猫官方周边',
    logo(c) {           // the kitten's head, ears up, a little star
      line(c, [[-0.6, 0.0], [-0.52, -0.62], [-0.18, -0.35], [0.18, -0.35], [0.52, -0.62], [0.6, 0.0]], 0.08);
      c.lineWidth = 0.08; c.beginPath(); c.ellipse(0, 0.12, 0.62, 0.45, 0, Math.PI * 1.02, Math.PI * 1.98, true); c.stroke();
      dot(c, -0.22, 0.08, 0.07); dot(c, 0.22, 0.08, 0.07);
      line(c, [[-0.08, 0.3], [0, 0.36], [0.08, 0.3]], 0.05);
      line(c, [[0.72, -0.8], [0.72, -0.5]], 0.05); line(c, [[0.57, -0.65], [0.87, -0.65]], 0.05);
    },
  },
  {
    // (no longer in the city: its shop is 星环旅行's now, its ads other brands' (city.js alive); kept so that the ads drawn stay as they were)
    key: 'lantern-noodles', color: '#ff7b54', name: '灯笼面馆', en: 'LANTERN NOODLES', vertical: '灯笼面馆', tagline: '24h',
    logo(c) {           // a bowl of noodles, chopsticks, steam
      c.lineWidth = 0.08; c.beginPath(); c.arc(0, 0.05, 0.62, 0, Math.PI); c.closePath(); c.stroke();
      for (const y of [-0.05, 0.12]) { c.lineWidth = 0.05; c.beginPath(); for (let x = -0.45; x <= 0.45; x += 0.02) { const yy = y + Math.sin(x * 14) * 0.04; x === -0.45 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.stroke(); }
      line(c, [[0.1, -0.1], [0.7, -0.75]], 0.06); line(c, [[0.25, -0.05], [0.8, -0.6]], 0.06);
      for (const x of [-0.35, -0.12]) line(c, [[x, -0.25], [x + 0.06, -0.42], [x, -0.6], [x + 0.06, -0.75]], 0.05);
    },
  },
  {
    key: 'night-lamp-diner', color: '#7a88c9', name: '时雨餐厅', en: 'SHIGURE DINER', vertical: '时雨餐厅', tagline: '24h',
    logo(c) {           // a bowl, steam going up from it, a drop of rain over it
      c.lineWidth = 0.08; c.beginPath(); c.moveTo(-0.7, 0.05); c.bezierCurveTo(-0.7, 0.75, 0.7, 0.75, 0.7, 0.05); c.closePath(); c.stroke();
      line(c, [[-0.3, 0.68], [0.3, 0.68]], 0.07);
      for (const x of [-0.22, 0.12]) line(c, [[x, -0.12], [x + 0.08, -0.28], [x, -0.44]], 0.06);
      c.beginPath(); c.moveTo(0.48, -0.9); c.bezierCurveTo(0.6, -0.68, 0.66, -0.55, 0.48, -0.45); c.bezierCurveTo(0.3, -0.55, 0.36, -0.68, 0.48, -0.9); c.fill();
    },
  },
  {
    key: 'frost-dessert', color: '#c9a8ff', name: '霜满天', en: 'FROST DESSERTS', vertical: '霜满天', tagline: '穿越千年的甜～',
    logo(c) {           // a slice of cake, a strawberry on top
      line(c, [[-0.65, 0.55], [0.65, 0.55], [0.65, 0.0], [-0.65, -0.25], [-0.65, 0.55]], 0.08);
      line(c, [[-0.65, 0.15], [0.65, 0.3]], 0.05);
      c.lineWidth = 0.07; c.beginPath(); c.arc(0.2, -0.32, 0.17, 0, Math.PI * 2); c.stroke();
      line(c, [[0.2, -0.5], [0.28, -0.62]], 0.05);
    },
  },
];

// The metro's own signs (see atlas.js): its line badge, and the words on its direction signs and line map.
export const METRO = {
  line: '9',
  color: '#33c7e0',   // the line's colour (in the colour mode)
  cn: '地铁 9号线 · 星港南',
  en: 'METRO LINE 9 · STAR PORT SOUTH',
  badge(c) { ring(c, 0, 0, 0.84, 0.12); },  // the number is set in the badge by atlas.js
};
