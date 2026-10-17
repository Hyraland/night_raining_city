// The look: every lit surface (and every drop of rain) is drawn in a few flat tones instead of smooth
// shading. Three tones by default: deep navy where no light reaches, cyan where a little does, and white
// where it is strong; or two (cyan-blue shade and white). The light that decides this is summed from the
// moon (with crisp cast shadows), the street lamps' cones, the screens and shop windows, and the holograms.
// All materials here share one set of uniforms, so a change (the palette, two or three tones) is everywhere.

import * as THREE from 'three';

export const N_LAMP = 24, N_BB = 24, N_PT = 4;

const vec4s = (n) => Array.from({ length: n }, () => new THREE.Vector4());
const col = (hex) => new THREE.Color(hex);

// The colour mode: the colours of things (linear RGB; the shaders scale each to its brightest channel, so how
// light a thing is still comes from its albedo). OWN: the part takes its instance's own colour (iTint);
// LAMP: the colour of lamplight, as set in the tuning (color.lamp), a room's floor and walls under it.
const lin = (hex) => new THREE.Color(hex).toArray();
export const TINT = {
  OWN: [-1, -1, -1], LAMP: [-2, -2, -2], white: [1, 1, 1],
  leaf: lin('#4f8a4c'), grass: lin('#3f7f46'), soil: lin('#5a4434'), bark: lin('#5e4636'),
  wood: lin('#9c8068'), darkWood: lin('#6b5444'), stone: lin('#a8a196'), terracotta: lin('#b0603e'), zinc: lin('#8f9aa3'),
  fabric: lin('#6f86a8'), rug: lin('#8a5446'), leather: lin('#9a6a48'), kraft: lin('#a2754a'),
  bread: lin('#d6a467'), crust: lin('#a8662f'), glass: lin('#d4e6ea'), skin: lin('#c9a184'), denim: lin('#3a4760'),
};
// and the colours that things of one kind are told apart by
export const PALETTES = Object.fromEntries(Object.entries({
  flower: ['#ff5f8a', '#ffd166', '#ffffff', '#c77dff', '#ff7b54', '#f72585', '#fff3b0', '#ff99c8', '#e63946', '#9bb7ff'],
  product: ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#ffffff', '#8ecae6', '#ff006e', '#3a86ff', '#fb5607', '#80b918'],
  book: ['#7a2e2e', '#2e4a7a', '#3f6b4a', '#c9a227', '#e8e2d0', '#5a3e6b', '#b5542e', '#2a2f3a', '#d8c3a5', '#6b8f9a', '#a33b5a'],
  cloth: ['#1f2533', '#8a6a4a', '#55595f', '#14161a', '#8c2f39', '#4b5a3a', '#d8cfc0', '#2f4a6b', '#6b4f7a', '#b07a3a'],
  umbrella: ['#e63946', '#264653', '#f4a261', '#2a9d8f', '#ffffff', '#8338ec', '#ffbe0b', '#1d3557', '#ff70a6', '#1b998b'],
  car: ['#d9dde2', '#1a1c20', '#8a9099', '#a41f2a', '#2b4c7e', '#f2f2f0', '#3b4a3f', '#c08a3a'],
  sweet: ['#ffb3c6', '#ffe5a0', '#b9f3d0', '#c9b6ff', '#ffd6a5', '#fff4e6', '#a0e7ff', '#ff8fab', '#8d5a3b'],
  plush: ['#ffffff', '#ffd166', '#ffb3c6', '#a0e7ff', '#c9b6ff', '#b9f3d0', '#f4a261', '#fff4e6'],
  tea: ['#d9b38c', '#c48a5a', '#f2e0c8', '#b9f3d0', '#ffb3c6', '#e8c07a', '#9c6644'],
}).map(([k, list]) => [k, list.map(lin)]));
// a colour from a palette for the n-th thing (the same every time, not drawn from any of the layout's sequences)
export const pickOf = (list, n) => list[Math.floor(((Math.sin(n * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1 * list.length)];

export const PALETTE = {
  deep: '#0b2130', mid: '#2a7c93', lit: '#e8f5f5', litTint: '#a4e7ef', shade2: '#1a4a61',
  fog: '#103547', haze: '#5fa6b8',
  scrDark: '#061a25', scrMid: '#1fc3d8',
};

export const shared = {
  uTime: { value: 0 },
  uKeyDir: { value: new THREE.Vector3(-0.3, 0.42, -0.86).normalize() }, // toward the moon
  uKey: { value: 0.75 },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector2(1 / 4096, 1 / 4096) },
  uLamp: { value: vec4s(N_LAMP) },            // xyz head, w strength (0: unused)
  uLampCone: { value: new THREE.Vector2(0.42, 0.78) }, // cos of the cone's outer and inner edge
  uLampRange: { value: 21 },
  uBb: { value: vec4s(N_BB) },                // screens and shop windows: xyz centre, w strength
  uBbN: { value: vec4s(N_BB) },               // xyz facing, w reach
  uBbTint: { value: new Float32Array(N_BB) }, // 0 white light .. 1 cyan
  uPt: { value: vec4s(N_PT) },                // holograms: xyz, w strength
  uPtR: { value: new Float32Array(N_PT) },    // reach
  uDeep: { value: col(PALETTE.deep) }, uMid: { value: col(PALETTE.mid) },
  uLit: { value: col(PALETTE.lit) }, uLitTint: { value: col(PALETTE.litTint) }, uShade2: { value: col(PALETTE.shade2) },
  uE1: { value: 0.17 }, uE2: { value: 0.45 }, uE: { value: 0.3 }, uSoft: { value: 0.012 },
  uThree: { value: 1 },
  uFog: { value: col(PALETTE.fog) }, uHaze: { value: col(PALETTE.haze) }, uFogDensity: { value: 0.0042 },
  uScrDark: { value: col(PALETTE.scrDark) }, uScrMid: { value: col(PALETTE.scrMid) }, uScrHot: { value: 2.3 },
  // the ads drawn as posters (flat bands of colour, dark shapes, warm white light: as the museum's cases) or as
  // the LED screens they were; in their own colours outside the colour mode too; how bright a poster's ground
  uAdPoster: { value: 1 }, uAdOwn: { value: 1 }, uAdBright: { value: 0.9 },
  // each brand's case's colours turned (by its place in ads/brands.js): its hue (radians), saturation, lightness
  uCaseAdj: { value: Array.from({ length: 24 }, () => new THREE.Vector3(0, 1, 1)) },
  uStreetLift: { value: 0.5 },  // how far the darkest tone is lifted toward the shade colour at street level
  uGlassRefl: { value: 1 }, uRoomBright: { value: 1 },
  uWet: { value: 1 }, uReflLo: { value: 0.3 }, uReflHi: { value: 0.8 },
  // the master hue and saturation, as a colour matrix: the colours in the uniforms are turned on the CPU
  // (see applyTuning); the ones written into the shaders go through this
  uHue: { value: new THREE.Matrix3() },
  // a hole in the ground (x0, x1, z0, z1): over the metro station, so one looks down into it
  uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
  // and more, over the museum's sunken plaza
  uHoles: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
  uHoleFloor: { value: [200, 200] },
  uHoleRing: { value: new THREE.Vector3(0, 0, -1) },  // the ground cut away round a circle (x, z, radius): the museum's round hall, open from below the street to its roof
  uReflY: { value: 0 },
  uSunkLines: { value: new THREE.Vector2(0, -1) },  // a sunken plaza's two lines of light: its middle (z), and how far either side                          // the height the street's mirror is at (the street, or a sunken plaza one is in)             // the floor's height down each of uHoles (above 100: steps, no one level)
  // indoors (the metro station), light everywhere besides the lamps: how bright a room is
  uIndoor: { value: 0.34 },
  // colour mode (1 on): the city in its own colours, under a night that leans blue (applyTuning swaps in its
  // palette). uLampColor: lamplight and lit rooms (brightest channel 1); uNeon: the colours of the signs and
  // light strips that are neither white nor cyan; uLightMix: of the cyan light strips, the share that stays
  // cyan and the share in a neon colour (the rest go warm white)
  uColorMode: { value: 0 },
  uLampColor: { value: new THREE.Vector3(1, 0.82, 0.62) },
  uNeon: { value: [new THREE.Vector3(1, 0.62, 0.3), new THREE.Vector3(1, 0.25, 0.32), new THREE.Vector3(0.6, 0.48, 1), new THREE.Vector3(0.42, 1, 0.62)] },
  uLightMix: { value: new THREE.Vector2(0.3, 0.2) },
  // shopfronts cut into the towers' glass: up to 16 boxes (x0, x1, z0, z1), below 3.9 m (see city.js streetShops)
  uCuts: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCutN: { value: 0 },
};

export const DEFINES = { N_LAMP, N_BB, N_PT };

// Declarations and helpers every shader here starts with (vertex or fragment).
export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uKeyDir; uniform float uKey;
uniform sampler2D uShadowMap; uniform mat4 uShadowMatrix; uniform vec2 uShadowTexel;
uniform vec4 uLamp[N_LAMP]; uniform vec2 uLampCone; uniform float uLampRange;
uniform vec4 uBb[N_BB]; uniform vec4 uBbN[N_BB]; uniform float uBbTint[N_BB];
uniform vec4 uPt[N_PT]; uniform float uPtR[N_PT];
uniform vec3 uDeep, uMid, uLit, uLitTint, uShade2;
uniform float uE1, uE2, uE, uSoft, uThree, uStreetLift;
uniform vec3 uFog, uHaze; uniform float uFogDensity;
uniform mat3 uHue;
uniform float uIndoor;
uniform float uColorMode; uniform vec3 uLampColor; uniform vec3 uNeon[4]; uniform vec2 uLightMix;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Colour mode: a material's own colour with its brightest channel at 1, so its albedo still says how light it
// is; none given (0, 0, 0): white.
vec3 tintOf(vec3 t) { float m = max(t.r, max(t.g, t.b)); return m > 0.0 ? t / m : vec3(1.0); }
vec3 neon(float k) { return k < 0.25 ? uNeon[0] : k < 0.5 ? uNeon[1] : k < 0.75 ? uNeon[2] : uNeon[3]; }
// Colour mode: a light as the city would have it. The whites go warm; of the cyans, by k (a random number of
// the light's own, 0..1), some stay cyan, some take a neon colour, the rest go warm white.
vec3 cityLight(vec3 c, float k) {
  float hi = max(max(c.r, c.g), c.b), lo = min(min(c.r, c.g), c.b);
  float sat = hi > 1e-4 ? 1.0 - lo / hi : 0.0;
  vec3 warm = uLampColor * hi;
  if (sat < 0.45) return mix(c, warm, 0.75);
  if (k < uLightMix.x) return c;
  if (k < uLightMix.x + uLightMix.y) return neon((k - uLightMix.x) / uLightMix.y) * hi;
  return warm;
}

// 1 where the moon reaches wp, 0 in a cast shadow (four taps, for a clean edge)
float shadowAt(vec3 wp) {
  vec4 c = uShadowMatrix * vec4(wp, 1.0);
  vec3 p = c.xyz / c.w;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - 0.00012;
  float s = 0.0;
  s += step(z, texture2D(uShadowMap, p.xy + vec2(-0.5, -0.5) * uShadowTexel).r);
  s += step(z, texture2D(uShadowMap, p.xy + vec2(0.5, -0.5) * uShadowTexel).r);
  s += step(z, texture2D(uShadowMap, p.xy + vec2(-0.5, 0.5) * uShadowTexel).r);
  s += step(z, texture2D(uShadowMap, p.xy + vec2(0.5, 0.5) * uShadowTexel).r);
  return s * 0.25;
}

float keyLight(vec3 P, vec3 N) {
  float nl = max(dot(N, uKeyDir), 0.0);
  return nl > 0.0 ? uKey * nl * shadowAt(P + N * 0.2) : 0.0;
}

// Light from the lamps, screens and holograms arriving at P: x the total, y the part of it that is cyan.
// surf 1: a surface facing N; 0: a raindrop, lit from any side.
vec2 localLight(vec3 P, vec3 N, float surf) {
  float sum = 0.0, cyan = 0.0;
  for (int i = 0; i < N_LAMP; i++) {
    vec4 L = uLamp[i];
    if (L.w <= 0.0) continue;
    vec3 v = L.xyz - P; float d = length(v); vec3 l = v / max(d, 1e-3);
    float fall = clamp(1.0 - d / uLampRange, 0.0, 1.0);
    float c = L.w * smoothstep(uLampCone.x, uLampCone.y, l.y) * fall * fall * mix(1.0, max(dot(N, l), 0.0), surf);
    sum += c;
  }
  for (int i = 0; i < N_BB; i++) {
    vec4 B = uBb[i];
    if (B.w <= 0.0) continue;
    vec3 v = P - B.xyz; float d = length(v); vec3 dir = v / max(d, 1e-3);
    float fall = clamp(1.0 - d / uBbN[i].w, 0.0, 1.0);
    float c = B.w * sqrt(max(dot(dir, uBbN[i].xyz), 0.0)) * fall * fall * mix(1.0, max(dot(N, -dir), 0.0), surf);
    sum += c; cyan += c * uBbTint[i];
  }
  for (int i = 0; i < N_PT; i++) {
    vec4 H = uPt[i];
    if (H.w <= 0.0) continue;
    vec3 v = H.xyz - P; float d = length(v);
    float fall = clamp(1.0 - d / uPtR[i], 0.0, 1.0);
    float c = H.w * fall * fall * mix(1.0, max(dot(N, v / max(d, 1e-3)), 0.0), surf);
    sum += c; cyan += c;
  }
  return vec2(sum, cyan);
}

// the flat tone for a given amount of light (soft: how gradual the edges between tones are) at height y.
// In three tones the darkest one is lifted toward the cyan-blue shade down at street level, where the
// lobbies, shop windows and lamps keep the air bright, and sinks to deep navy higher up.
vec3 toneOf(float L, float tint, float soft, float y) {
  vec3 lit = mix(uLit, uLitTint, clamp(tint, 0.0, 1.0));
  if (uThree > 0.5) {
    vec3 deep = mix(mix(uDeep, uShade2, uStreetLift), uDeep, smoothstep(5.0, 30.0, y));
    float b1 = smoothstep(uE1 - soft, uE1 + soft, L), b2 = smoothstep(uE2 - soft, uE2 + soft, L);
    return mix(mix(deep, uMid, b1), lit, b2);
  }
  return mix(uShade2, lit, smoothstep(uE - soft, uE + soft, L));
}

// distance haze in the rain; toward the moon it glows, and the low clouds swallow the tops of the towers
float fogAmount(vec3 P) {
  float d = length(P - cameraPosition);
  return max(1.0 - exp(-d * uFogDensity), smoothstep(230.0, 390.0, P.y) * 0.92);
}
vec3 fogColor(vec3 P) {
  vec3 dir = normalize(P - cameraPosition);
  return mix(uFog, uHaze, pow(max(dot(dir, uKeyDir), 0.0), 5.0));
}
vec3 fogged(vec3 c, vec3 P) { return mix(c, fogColor(P), fogAmount(P)); }
`;

// the usual vertex stage: world position and normal, instancing allowed
const VERT_WORLD = /* glsl */ `
  vec4 wp = vec4(position, 1.0);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  vec3 nrm = mat3(instanceMatrix) * normal;
#else
  vec3 nrm = normal;
#endif
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  gl_Position = projectionMatrix * viewMatrix * wp;
`;

const make = (params) => new THREE.ShaderMaterial({ defines: { ...DEFINES }, ...params });
const toneSoft = 'max(uSoft, fwidth(Lt) * 0.8)';

// Towers, podiums, kiosks and bridges: glass curtain walls. Behind each pane is a room, drawn by tracing
// the view ray into a box (ceiling with its light panels, back wall with furniture against it, floor and
// side walls), lit or dark; in front of it the glass reflects the sky, the moon's glint and the screens
// across the street, more so the more glancing the look. The frame (mullions, floor edges) takes the light
// like any solid surface. The first 5.2 m of every building (above aBase, where its ground floor is) is a lit lobby.
// aU: distance along the wall; aWin: module width, floor height, share of lit rooms, style (0 clear glass,
// 1 with deep floor bands, 2 slender, 3 a pale frame with big panes, 4 a diagrid); aSeed per building.
export function glassMaterial() {
  return make({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec4 aWin; attribute float aSeed; attribute float aU; attribute float aBase; attribute vec2 aBright;
      varying vec3 vWorld, vNormal; varying vec4 vWin; varying float vSeed, vU, vBase; varying vec2 vBright;
      void main() { vWin = aWin; vSeed = aSeed; vU = aU; vBase = aBase; vBright = aBright; ${VERT_WORLD} }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld, vNormal; varying vec4 vWin; varying float vSeed, vU, vBase; varying vec2 vBright;
      uniform float uGlassRefl, uRoomBright;
      const float LOBBY = 5.2;

      // the room behind the glass, seen along the view ray V
      vec3 room(vec3 N, vec3 V, float lobby, float fh, float yy, float roomW, float allOn, out float aaRoom) {
        vec3 Tu = vec3(N.z, 0.0, -N.x);
        vec3 rd = vec3(dot(V, Tu), V.y, max(dot(V, -N), 1e-3)) / vec3(roomW, fh, lobby > 0.5 ? 10.0 : 6.5);
        rd.xy = sign(rd.xy + 1e-9) * max(abs(rd.xy), vec2(1e-5));
        vec2 rc = vec2(vU / roomW, yy / fh);
        vec3 ro = vec3(fract(rc), 0.0);
        vec3 tt = (step(0.0, rd) - ro) / rd;
        float t = min(min(tt.x, tt.y), tt.z);
        vec3 h = ro + rd * t;
        vec2 rid = floor(rc);
        float hs = hash12(rid + vSeed * 31.7 + N.xz * 7.0);
        float on = lobby > 0.5 || allOn > 0.5 ? 1.0 : step(1.0 - vWin.z, hs);
        vec2 fw = fwidth(rc);
        aaRoom = 1.0 - smoothstep(0.15, 0.45, max(fw.x, fw.y));
        // the room's colours: in the city's tones, or (colour mode) as they are, under warm light or cool
        vec3 wall = uMid * 0.9, wall2 = uLitTint * 0.75, furnC = uDeep * 1.4, ceil = uMid * 1.1;
        vec3 strip = uHue * vec3(1.0, 1.04, 1.04), floorC = uMid * 0.75, sideC = uMid * 0.95;
        if (uColorMode > 0.5) {
          vec3 lightC = hash11(hs * 29.3) < 0.65 ? uLampColor : vec3(0.9, 0.95, 1.0);
          wall = lightC * mix(0.42, 0.6, hash11(hs * 5.1));
          wall2 = wall * 1.25; furnC = vec3(0.11, 0.09, 0.08); ceil = wall * 1.05;
          strip = lightC * 1.15; floorC = wall * 0.55; sideC = wall * 0.9;
        }
        vec3 c;
        if (t == tt.z) {                       // back wall, a counter or sofa along it, now and then a plant
          c = mix(wall, wall2, step(0.75, hash11(hs * 13.0)));
          float furn = step(h.y, 0.28) * step(0.12, fract(h.x * 2.0 + hs * 5.0));
          float plant = step(length((h.xy - vec2(0.2 + 0.6 * hash11(hs * 7.0), 0.35)) * vec2(1.0, 0.8)), 0.13) * step(0.5, hash11(hs * 3.0));
          c = mix(c, furnC, max(furn, plant) * 0.85);
        } else if (t == tt.y) {
          if (rd.y > 0.0) c = mix(ceil, strip * (lobby > 0.5 ? 1.2 : 1.0), step(lobby > 0.5 ? 0.5 : 0.8, fract(h.x * 2.0))); // ceiling and its light strips
          else c = floorC;                     // floor
        } else {
          c = sideC;                           // side walls
        }
        if (on < 0.5) c = mix(uDeep * 0.85, uDeep * 1.6, step(0.5, rd.y) * float(t == tt.y));
        return c;
      }

      uniform vec4 uCuts[16]; uniform float uCutN;
      void main() {
        // a shopfront opened in the glass: nothing of the glass there (the shop is built behind it)
        if (vWorld.y < 3.9) {
          for (int i = 0; i < 16; i++) {
            if (float(i) >= uCutN) break;
            vec4 k = uCuts[i];
            if (vWorld.x > k.x && vWorld.x < k.y && vWorld.z > k.z && vWorld.z < k.w) discard;
          }
        }
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vWorld - cameraPosition);
        vec2 loc = localLight(vWorld, N, 1.0);
        float tint = loc.y / max(loc.x, 1e-3);
        float key = keyLight(vWorld, N);

        if (abs(N.y) > 0.5) {                  // roofs and the undersides of overhangs: plain
          float Lt = 0.8 * (key + loc.x);
          vec3 c = toneOf(Lt, tint, ${toneSoft}, vWorld.y);
          gl_FragColor = vec4(fogged(c, vWorld), 1.0);
          return;
        }

        float style = vWin.w, modW = vWin.x;
        float yb = vWorld.y - vBase;                         // height above the building's ground floor
        float lobby = step(yb, LOBBY);
        float fh = mix(vWin.y, LOBBY, lobby);
        float yy = lobby > 0.5 ? yb : yb - LOBBY;
        vec2 cell = vec2(vU / (modW * (lobby > 0.5 ? 1.5 : 1.0)), yy / fh);
        vec2 f = fract(cell), fw = fwidth(cell);
        float aa = 1.0 - smoothstep(0.2, 0.5, max(fw.x, fw.y));

        // the frame: mullions at the module lines, a band at each floor
        // the frame kept slim: big panes, thin mullions and floor edges
        float mullW = (style > 2.5 ? 0.11 : style > 1.5 ? 0.03 : 0.022) * (lobby > 0.5 ? 0.6 : 1.0);
        float bandH = lobby > 0.5 ? 0.03 : style < 0.5 ? 0.045 : style < 1.5 ? 0.13 : style < 2.5 ? 0.035 : 0.1;
        float mull = 1.0 - smoothstep(mullW, mullW + fw.x * 1.5, min(f.x, 1.0 - f.x));
        float band = 1.0 - smoothstep(bandH, bandH + fw.y * 1.5, f.y);
        float solid = mix(clamp(2.0 * mullW + bandH, 0.0, 1.0), max(mull, band), aa);
        if (style > 3.5 && style < 4.5) {
          // a diagrid: the structure as a lattice of diagonals across the glass, a thin band at each floor
          float span = modW * 4.0;
          vec2 dg = vec2((vU + yb * 0.75) / span, (vU - yb * 0.75) / span);
          vec2 dfw = fwidth(dg);
          float diag = max(1.0 - smoothstep(0.03, 0.03 + dfw.x * 1.5, min(fract(dg.x), 1.0 - fract(dg.x))),
                     1.0 - smoothstep(0.03, 0.03 + dfw.y * 1.5, min(fract(dg.y), 1.0 - fract(dg.y))));
          float thinBand = 1.0 - smoothstep(0.03, 0.03 + fw.y * 1.5, f.y);
          solid = mix(0.12, max(diag, thinBand * 0.8), aa);
        }
        // The newer facades (5-7, the towers behind the start: see city.js glass()), no grid of windows, and
        // open floors behind them: lit in long stretches rather than room by room.
        bool newer = style > 4.5 && lobby < 0.5;
        float frit = 0.0;                                    // opaque panels and fins in a pale finish
        if (newer) {
          float fl = floor(cell.y), u = vU / modW;
          if (style < 5.5) {
            // staggered panels: each floor's of one width or two, shifted floor by floor, some opaque; slim
            // joints only where panels meet
            float w = 1.0 + floor(hash11(fl * 3.7 + vSeed * 13.0) * 2.0);
            float pu = (u + hash11(fl * 7.13 + vSeed * 31.0) * 3.0) / w, pid = floor(pu), pf = fract(pu);
            float joint = 1.0 - smoothstep(0.025, 0.025 + fwidth(pu) * 1.5, min(pf, 1.0 - pf));
            float thin = 1.0 - smoothstep(0.03, 0.03 + fw.y * 1.5, f.y);
            frit = step(0.86, hash12(vec2(pid, fl) + vSeed * 17.0)) * aa;
            solid = max(mix(0.12, max(joint, thin), aa), frit);
          } else if (style < 6.5) {
            // slender vertical fins, swelling and thinning in slow waves up the tower and round it
            float k = u * 2.0, wv = 0.05 + 0.16 * (0.5 + 0.5 * sin(yb * 0.045 + u * 0.35 + vSeed * 6.28));
            float fin = 1.0 - smoothstep(wv * 0.5, wv * 0.5 + fwidth(k) * 1.5, abs(fract(k) - 0.5));
            solid = mix(wv, fin, aa);
            frit = solid;
          } else {
            // ribbons: bands of glass between white spandrels that swell and recede round the tower, like
            // balconies in waves; no mullions to be seen
            float th = 0.11 + 0.06 * sin(u * 0.55 + fl * 0.9 + vSeed * 6.28);
            float sp = 1.0 - smoothstep(th, th + fw.y * 1.5, f.y);
            solid = mix(th, sp, aa);
            frit = solid;
          }
        }
        float Lt = (style > 2.5 ? 0.9 : 0.75) * (key + loc.x);
        vec3 frame = toneOf(Lt, tint, ${toneSoft}, vWorld.y);
        if (newer) frame = mix(frame, toneOf(Lt * 1.15 + 0.04, tint, ${toneSoft}, vWorld.y), frit);

        // inside
        float aaRoom;
        float boosted = step(yb, vBright.y);                 // some floors brighter, every room lit
        vec3 inside = room(N, V, lobby, fh, yy, modW * (lobby > 0.5 ? 3.0 : newer ? 7.0 : 2.0), boosted, aaRoom);
        vec3 avgRoom = lobby > 0.5 ? uLitTint : mix(uDeep, uColorMode > 0.5 ? uLampColor * 0.45 : uMid * 1.1, vWin.z);
        inside = mix(avgRoom, inside, aaRoom) * uRoomBright * mix(1.0, vBright.x, boosted);

        // on the glass: sky, the haze toward the moon, the moon itself, the screens across the street
        vec3 R = reflect(V, N);
        float r = 0.03 + 0.12 * smoothstep(-0.05, 0.6, R.y) + 0.45 * pow(max(dot(R, uKeyDir), 0.0), 8.0) + 0.15 * key;
        float spec = 0.0, specTint = 0.0;
        for (int i = 0; i < N_BB; i++) {
          vec4 B = uBb[i];
          if (B.w <= 0.0) continue;
          vec3 v = B.xyz - vWorld; float d = length(v); vec3 l = v / max(d, 1e-3);
          float facing = max(dot(-l, uBbN[i].xyz), 0.0);
          float sharp = clamp(30.0 * d / uBbN[i].w, 6.0, 400.0);
          float sp = B.w * facing * pow(max(dot(R, l), 0.0), sharp) * step(d, uBbN[i].w * 4.0);
          spec += sp; specTint += sp * uBbTint[i];
        }
        float moon = smoothstep(0.9975, 0.999, dot(R, uKeyDir)) * shadowAt(vWorld + N * 0.3);
        vec3 refl = toneOf(r + spec * 1.4, (specTint + tint * 0.3) / max(spec + 0.3, 1e-3), 0.02, vWorld.y + 40.0);
        refl = mix(refl, uHue * vec3(2.2, 2.4, 2.4), max(moon, smoothstep(1.2, 1.6, spec)));
        float F = 0.1 + 0.9 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 3.0);
        float k = clamp(smoothstep(0.32, 0.52, F) * (lobby > 0.5 ? 0.55 : 1.0) * uGlassRefl, 0.0, 1.0);
        vec3 glass = mix(inside, refl, k);

        vec3 c = mix(glass, frame, solid);
        gl_FragColor = vec4(fogged(c, vWorld), 1.0);
      }`,
  });
}

// Everything else that is solid: poles, frames, awnings, ledges. aAlbedo: how much light it gives back.
// indoor: lit only by its own lamps, never the moon (underground, inside the metro station)
// toned: instanced, each instance's albedo scaled by its own aTone (the goods in the shops, see goods.js).
// lift: indoors, how much more the room's general light is than the station's (a brighter shop).
// In colour mode a surface takes its own colour: aTint (none: white); a part whose aTint is negative takes
// its instance's iTint instead (the colour of a coat, of a packet).
export function propsMaterial({ indoor = false, toned = false, lift = 1 } = {}) {
  return make({
    defines: { ...DEFINES, INDOOR: indoor ? 1 : 0, TONED: toned ? 1 : 0, LIFT: lift.toFixed(3) },
    uniforms: { ...shared },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aAlbedo; attribute vec3 aTint;
#if TONED
      attribute float aTone;
#endif
#ifdef USE_INSTANCING
      attribute vec3 iTint;
#endif
      varying vec3 vWorld, vNormal, vTint; varying float vAlbedo;
      void main() {
        vAlbedo = aAlbedo;
#if TONED
        vAlbedo *= aTone;
#endif
        vTint = aTint;
#ifdef USE_INSTANCING
        if (aTint.r < 0.0 && aTint.r > -1.5) vTint = iTint;
#endif
        if (vTint.r > -1.5) vTint = max(vTint, 0.0);
        ${VERT_WORLD}
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld, vNormal, vTint; varying float vAlbedo;
      void main() {
        vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec2 loc = localLight(vWorld, N, 1.0);
#if INDOOR
        float Lt = vAlbedo * (loc.x + uIndoor * LIFT);
#else
        float Lt = vAlbedo * (keyLight(vWorld, N) + loc.x);
#endif
        vec3 c = toneOf(Lt, loc.y / max(loc.x, 1e-3), ${toneSoft}, vWorld.y);
        if (uColorMode > 0.5) c *= vTint.r < -1.5 ? mix(vec3(1.0), uLampColor, 0.7) : tintOf(vTint);   // LAMP: the light's own colour
        gl_FragColor = vec4(fogged(c, vWorld), 1.0);
      }`,
  });
}

// Things that give light rather than receive it: lamp heads, LED strips, beacon tips. The colour attribute
// may go above 1, which is what the bloom picks up. aBlink > 0: blinks, at that phase.
// In colour mode they light as the city would (cityLight), each by aKey (a random number for each thing, see
// city.js Bin; 0: none given; below 0: always its own colour) and each instance of an instanced one by its own. fixed: in colour mode always
// this neon colour (0-3); -2: any neon colour, white or cyan alike (the rims of the umbrellas).
// aKey below -50: its own colour in colour mode, and outside it the city's tones (cyan where it is coloured and
// dim, white where it is pale or bright: the stalls' bulbs and drink)
// drift: things that drift in water (the jellyfish in the museum's window): aDrift (its middle, a phase) bobs
// each up and down, its bell breathing, what hangs below it swaying the more the further down.
const DRIFT = /* glsl */ `
        float dt = uTime * 0.5 + aDrift.w * 6.2832;
        vec3 d = position - aDrift.xyz;
        float below = max(-d.y, 0.0), pulse = 1.0 + 0.07 * sin(dt * 2.0);
        if (below < 0.4) { d.xz *= pulse; d.y *= 2.0 - pulse; }
        d.x += sin(dt * 1.3 + below * 1.6) * 0.12 * below;
        vec3 pos = aDrift.xyz + d + vec3(0.0, 0.3 * sin(dt * 0.6), 0.0);
`;
// orbit: things that go round an upright axis (the planets of the solar system before the museum): aOrbit (the
// axis's x, z, how fast in radians a second, where it starts).
const ORBIT = /* glsl */ `
        float an = uTime * aOrbit.z + aOrbit.w, ca = cos(an), sa = sin(an);
        vec2 q = position.xz - aOrbit.xy;
        vec3 pos = vec3(aOrbit.x + q.x * ca - q.y * sa, position.y, aOrbit.y + q.x * sa + q.y * ca);
`;
// slide: things carried along a strip and round again (the rows of a case's ad): aSlide (where the strip starts,
// x and z, the way it runs, x and z), aSlide2 (its length L, the thing's middle along it, between -L and L: each
// thing is there twice, L apart, so the row runs on without a gap; how far it moves each turn, signed; how long a
// turn lasts). Each turn, in its first three tenths, it gathers speed smoothly, runs, and slows smoothly to a
// stop; then it rests. Seen only within the strip.
const SLIDE = /* glsl */ `
        float turnK = uTime / aSlide2.w, mv = clamp(fract(turnK) / 0.3, 0.0, 1.0), L = aSlide2.x;
        float eased = mv * mv * mv * (mv * (mv * 6.0 - 15.0) + 10.0);
        float nu = mod(aSlide2.y + aSlide2.z * (floor(turnK) + eased) + L, 2.0 * L) - L;
        vec3 pos = position + vec3(aSlide.z, 0.0, aSlide.w) * (nu - aSlide2.y);
        vU = dot(pos.xz - aSlide.xy, aSlide.zw); vL = L;
`;
// spin: things turning about an axis through a point (the Star Ring's station, in its case): aSpin (the point,
// radians a second), aAxis (the axis, where it starts); seen only within its case: aClip (where the case's face
// starts, x and z, the way it runs), aClip2 (its width, its bottom, its top, and 1 if it is to be shaded: lit in
// its own colour from up and to the left, in shadow a blue a little lighter than the space behind it, two tones).
const SPIN = /* glsl */ `
        float an = uTime * aSpin.w + aAxis.w, ca = cos(an), sa = sin(an);
        vec3 k = aAxis.xyz, v = position - aSpin.xyz;
        vec3 pos = aSpin.xyz + v * ca + cross(k, v) * sa + k * dot(k, v) * (1.0 - ca);
        vU = dot(pos.xz - aClip.xy, aClip.zw); vL = aClip2.x; vY = pos.y; vYB = aClip2.yz;
        vec3 nR = normal * ca + cross(k, normal) * sa + k * dot(k, normal) * (1.0 - ca);
        vec3 toLight = normalize(-vec3(aClip.z, 0.0, aClip.w) * 0.7 + vec3(0.0, 0.7, 0.0) + k * 0.12);
        vShade = aClip2.w > 0.5 ? dot(nR, toLight) : 2.0;
`;
// tide: the sea seen from above coming in and going out (a brand's case, the tide energy's): aTide (light or not,
// the level at which a light comes on, how far it is carried toward the land at high water, its lag); each part
// carried along the case's width by the tide's level (an 18 s cycle), lights coming on as the water rises past
// their mark and twinkling (not there at all while out); clipped to the case as spin is (aClip, aClip2)
const TIDE = /* glsl */ `
        float lvl = 0.5 - 0.5 * cos(6.2832 * uTime / 18.0 - aTide.w);
        vec3 pos = position - vec3(aClip.z, 0.0, aClip.w) * aTide.z * lvl;
        vU = dot(pos.xz - aClip.xy, aClip.zw); vL = aClip2.x; vY = pos.y; vYB = aClip2.yz;
        float ph = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
        vOn = aTide.x > 0.5 ? smoothstep(aTide.y, aTide.y + 0.05, lvl) * (0.75 + 0.25 * sin(uTime * 3.0 + ph)) : 1.0;
`;
// pop: the cute motions of a case like an anime's opening (the ice cream's): aPop (its pivot, when in the round it
// starts), aPop2 (kind, the round's length in seconds, how far or how long, the case's top: nothing shows above it;
// or, given less than 0, minus its foot: nothing shows below it).
// Kinds: 0 hop, over and over, squashing as it lands; 1 pop in with an overshoot, stay amp seconds, shrink away;
// 2 drop in from amp above, bounce, stay, shrink away at the round's end; 3 bob gently up and down; 4 set, sinking
// amp and rising again over the round (a moon); 5 rise from amp below, stay, sink again at the round's end;
// 6 drift down from amp above, slowly (3.2 s), to rest, shrink away at the round's end; 7 expand: all of it
// moving apart about its pivot, from amp of its size, quickly at first and then slower (space itself growing),
// gone for the round's last tenth and so again
const POP_FN = /* glsl */ `
      float backOut(float x) { float c1 = 1.70158, c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }
      float bounceOut(float x) {
        if (x < 1.0 / 2.75) return 7.5625 * x * x;
        if (x < 2.0 / 2.75) { x -= 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
        if (x < 2.5 / 2.75) { x -= 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
        x -= 2.625 / 2.75; return 7.5625 * x * x + 0.984375;
      }`;
const POP = /* glsl */ `
        float P = aPop2.y, k = aPop2.x, amp = aPop2.z, t = mod(uTime, P) - aPop.w;
        vec3 d = position - aPop.xyz, off = vec3(0.0);
        float sy = 1.0, sx = 1.0;
        if (k < 0.5) {
          float u = fract((uTime - aPop.w) / 0.55);
          off.y = amp * 4.0 * u * (1.0 - u);
          float land = 1.0 - smoothstep(0.0, 0.14, min(u, 1.0 - u));
          sy = mix(1.06, 0.8, land); sx = mix(0.97, 1.16, land);
        } else if (k < 1.5) {
          float s = t < 0.0 ? 0.0 : t < 0.35 ? backOut(t / 0.35) : t < 0.35 + amp ? 1.0 : max(0.0, 1.0 - (t - 0.35 - amp) / 0.2);
          sy = s; sx = s;
        } else if (k < 2.5) {
          float s = t < 0.0 ? 0.0 : 1.0 - smoothstep(P - aPop.w - 0.45, P - aPop.w - 0.15, t);
          off.y = t < 0.0 ? 0.0 : amp * (1.0 - bounceOut(clamp(t / 0.6, 0.0, 1.0)));
          float sq = t > 0.25 && t < 0.65 ? sin((t - 0.25) / 0.4 * 3.1416) * 0.14 : 0.0;
          sy = s * (1.0 - sq); sx = s * (1.0 + sq * 0.6);
        } else if (k < 3.5) {
          off.y = amp * sin(uTime * 1.6 + aPop.w * 2.0);
        } else if (k < 4.5) {                             // set: sinks amp down and rises again over the round
          off.y = -amp * (0.5 - 0.5 * cos(6.2832 * (uTime + aPop.w) / P));
        } else if (k < 5.5) {                             // rise: up from amp below, eased, a while, down again at the end
          float up = t < 0.0 ? 0.0 : 1.0 - pow(1.0 - clamp(t / 1.0, 0.0, 1.0), 3.0);
          off.y = -amp * (1.0 - up * (1.0 - smoothstep(P - aPop.w - 0.9, P - aPop.w - 0.15, t)));
        } else if (k > 6.5) {                             // expand: everything moving apart, quickly at first, over and over
          float u = fract((uTime + aPop.w) / P), e = 1.0 - pow(1.0 - min(u / 0.9, 1.0), 3.0);
          float s = u > 0.9 ? 0.0 : mix(amp, 1.0, e);
          sy = s; sx = s;
        } else {                                          // drift down: from amp above, slowly, easing in and out, to rest
          float u = clamp(t / 3.2, 0.0, 1.0), e = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
          float s = t < 0.0 ? 0.0 : 1.0 - smoothstep(P - aPop.w - 0.45, P - aPop.w - 0.15, t);
          off.y = amp * (1.0 - e); sy = s; sx = s;
        }
        vec3 pos = aPop.xyz + vec3(d.x * sx, d.y * sy, d.z * sx) + off;
        vY = pos.y; vTop = aPop2.w;
`;
export function glowMaterial({ fixed = -1, drift = false, orbit = false, slide = false, spin = false, tide = false, pop = false } = {}) {
  const motion = drift ? ['attribute vec4 aDrift;', DRIFT] : orbit ? ['attribute vec4 aOrbit;', ORBIT]
    : slide ? ['attribute vec4 aSlide, aSlide2; varying float vU, vL;', SLIDE]
    : spin ? ['attribute vec4 aSpin, aAxis, aClip, aClip2; varying float vU, vL, vY, vShade; varying vec2 vYB;', SPIN]
    : tide ? ['attribute vec4 aTide, aClip, aClip2; varying float vU, vL, vY, vOn; varying vec2 vYB;', TIDE]
    : pop ? ['attribute vec4 aPop, aPop2; varying float vY, vTop;' + POP_FN, POP] : null;
  return make({
    defines: { ...DEFINES, FIXED: fixed },
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float aBlink; attribute float aKey;
      ${motion ? motion[0] + ' uniform float uTime;' : ''}
      varying vec3 vWorld, vNormal, vColor; varying float vBlink, vKey, vCase, vTone;
      void main() {
        vColor = color;
        vTone = aKey < -50.0 ? 1.0 : 0.0;
        vCase = aKey < -1.5 && aKey > -50.0 ? -aKey - 2.0 : -1.0;
#ifdef USE_INSTANCING_COLOR
        vColor *= instanceColor;
#endif
        vBlink = aBlink;
        vKey = aKey > 0.0 ? aKey : aKey < 0.0 ? -1.0 : 2.0;
#ifdef USE_INSTANCING
        if (vKey >= 0.0) vKey = fract(vKey + fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453));
#endif
        ${motion ? motion[1] + VERT_WORLD.replace('vec4(position, 1.0)', 'vec4(pos, 1.0)') : VERT_WORLD}
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld, vNormal, vColor; varying float vBlink, vKey, vCase, vTone;
      uniform vec3 uCaseAdj[24];
      // a brand's case's colours turned about the grey, then more or less saturated, lighter or darker
      vec3 caseAdjust(vec3 c, vec3 a) {
        vec3 k = vec3(0.57735);
        c = c * cos(a.x) + cross(k, c) * sin(a.x) + k * dot(k, c) * (1.0 - cos(a.x));
        return max(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, a.y), 0.0) * a.z;
      }
      ${slide ? 'varying float vU, vL;' : ''}${spin ? 'varying float vU, vL, vY, vShade; varying vec2 vYB;' : ''}${tide ? 'varying float vU, vL, vY, vOn; varying vec2 vYB;' : ''}${pop ? 'varying float vY, vTop;' : ''}
      void main() {
        ${slide ? 'if (vU < 0.0 || vU > vL) discard;' : ''}${spin || tide ? 'if (vU < 0.0 || vU > vL || vY < vYB.x || vY > vYB.y) discard;' : ''}${pop ? 'if (vTop > 0.0 && vY > vTop || vTop < 0.0 && vY < -vTop) discard;' : ''}
        vec3 c = uHue * vColor;
        ${spin ? 'if (vShade < 0.0) c = uHue * vec3(0.07, 0.15, 0.44);' : ''}${tide ? '\n        if (vOn < 0.04) discard;\n        c *= vOn;' : ''}
        if (vCase > -0.5) c = caseAdjust(c, uCaseAdj[int(vCase + 0.5)]);
        if (vTone > 0.5 && uColorMode < 0.5) {
          float hi = max(max(vColor.r, vColor.g), vColor.b), lo = min(min(vColor.r, vColor.g), vColor.b);
          float t = (hi > 1e-4 ? 1.0 - lo / hi : 0.0) * smoothstep(1.2, 0.4, hi);
          c = uHue * mix(uLitTint * hi, uMid * 2.6 * hi, t);
        }
        if (uColorMode > 0.5) {
          float hi = max(max(c.r, c.g), c.b);
#if FIXED >= 0
          c = uNeon[FIXED] * hi;
#elif FIXED == -2
          c = vKey < 0.6 ? neon(vKey / 0.6) * hi : vKey < 0.8 ? c : uLampColor * hi;
#else
          if (vKey >= 0.0) c = cityLight(c, vKey);
#endif
        }
        if (vBlink > 0.0) c *= step(0.82, fract(uTime * 0.6 + vBlink));
        gl_FragColor = vec4(mix(c, fogColor(vWorld), fogAmount(vWorld) * 0.75), 1.0);
      }`,
  });
}

// Overhead cables: thin dark lines.
export function lineMaterial() {
  return make({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld;
      void main() { gl_FragColor = vec4(fogged(uDeep * 0.55, vWorld), 1.0); }`,
  });
}

// The faint cone of light under each lamp, seen in the wet air (the rain inside it does the rest).
export function beamMaterial() {
  return make({
    uniforms: { ...shared },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vWorld, vNormal; varying float vV;
      void main() { vV = uv.y; ${VERT_WORLD} }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld, vNormal; varying float vV;
      void main() {
        float h = clamp(vV, 0.0, 1.0); // 1 at the lamp, 0 on the ground
        vec3 V = normalize(cameraPosition - vWorld);
        float edge = pow(clamp(abs(dot(normalize(vNormal), V)), 0.0, 1.0), 1.5);
        float a = 0.05 * edge * smoothstep(0.0, 0.25, h) * pow(h, 1.4) * (1.0 - fogAmount(vWorld));
        float band = uThree > 0.5 ? 1.0 + step(0.75, h) * 0.6 : 1.0;
        gl_FragColor = vec4(uHue * vec3(0.85, 1.0, 1.0) * a * band, 1.0);
      }`,
  });
}

// The ground: the paved street, the raised pavements and plazas, and the reflecting pools, all wet, puddles
// here and there with rings spreading in them; the planar reflection (rendered in main.js) is drawn on top
// in the same few tones, stretched downward as on a wet street. kind 0: street, 1: pavement, 2: pool.
export function groundMaterial(reflection, kind, crossings) {
  return make({
    uniforms: {
      ...shared,
      uRefl: { value: reflection.texture },
      uReflMatrix: { value: reflection.matrix },
      uKind: { value: kind },
      uCross: { value: crossings },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld, vNormal;
      void main() { ${VERT_WORLD} }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D uRefl; uniform mat4 uReflMatrix; uniform float uKind, uWet, uReflLo, uReflHi, uReflY; uniform vec2 uSunkLines;
      uniform vec4 uHole, uHoles[2]; uniform vec3 uHoleRing;
      varying vec3 vWorld, vNormal;
      const float ROAD = 7.0;
      uniform float uCross[3];

      float band(float x, float a, float b) { float w = fwidth(x) * 0.8; return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }

      // the street is one paved promenade: long slabs laid in a running bond, two lines of light set flush
      // along it, and at the crossings rings of paving round the hologram projectors.
      // Returns x: joints, y: the light lines.
      // kind: 0 the street, 1 pavements and plazas, 2 water, 3 a sunken plaza's floor (paved as a plaza)
      vec2 paving(vec2 p) {
        if (abs(uKind - 2.0) < 0.5) return vec2(0.0);            // water
        if (uKind > 0.5) {                                       // pavements and plazas: square slabs
          vec2 sl = fract(p / 1.2);
          float lines = uKind > 2.5 ? band(abs(abs(p.y - uSunkLines.x) - uSunkLines.y), 0.0, 0.06) : 0.0;
          return vec2(1.0 - band(sl.x, 0.03, 0.97) * band(sl.y, 0.03, 0.97), lines);
        }
        for (int i = 0; i < 3; i++) {
          vec2 q = vec2(p.x, p.y - uCross[i]);
          if (abs(q.y) < 11.0 && abs(q.x) < 13.0) {
            float r = length(q), a = atan(q.y, q.x) / 6.2832 * max(8.0, floor(r * 1.2));
            float j = 1.0 - band(fract(r / 1.6), 0.03, 0.97) * band(fract(a), 0.02, 0.98);
            float ring = band(abs(r - 3.2), 0.0, 0.05);
            return vec2(j, ring);
          }
        }
        float row = floor(p.x / 1.2);
        vec2 sl = vec2(fract(p.x / 1.2), fract(p.y / 2.4 + 0.5 * mod(row, 2.0)));
        float j = 1.0 - band(sl.x, 0.025, 0.975) * band(sl.y, 0.012, 0.988);
        float lines = band(abs(abs(p.x) - 4.5), 0.0, 0.05);
        return vec2(j, lines);
      }

      void main() {
        vec3 N = vec3(0.0, 1.0, 0.0);
        vec2 p = vWorld.xz;
        bool water = abs(uKind - 2.0) < 0.5;
        if (uKind < 2.5) {
          if (p.x > uHole.x && p.x < uHole.y && p.y > uHole.z && p.y < uHole.w) discard;
          for (int i = 0; i < 2; i++) if (p.x > uHoles[i].x && p.x < uHoles[i].y && p.y > uHoles[i].z && p.y < uHoles[i].w) discard;
          if (length(p - uHoleRing.xy) < uHoleRing.z) discard;
        }
        vec2 pv = paving(p);
        float joint = pv.x;

        // puddles, and rings spreading in them as drops land
        float pud = smoothstep(0.52, 0.62, vnoise(p * 0.22) * 0.65 + vnoise(p * 0.9) * 0.35);
        pud = water ? 1.0 : max(pud, uKind < 0.5 ? smoothstep(ROAD - 1.6, ROAD - 0.3, abs(p.x)) * 0.8 : 0.0); // gutters
        vec2 cellId = floor(p / 0.7), cf = fract(p / 0.7) - 0.5;
        vec2 rnd = hash22(cellId);
        float life = fract(uTime * 1.3 + rnd.x);
        vec2 rc = cf - (rnd - 0.5) * 0.4;
        float rd = length(rc);
        float rr = (rd - life * 0.32) * 28.0;
        float ring = exp(-rr * rr) * (1.0 - life);
        vec2 ripple = rc / max(rd, 1e-3) * ring;

        vec2 loc = localLight(vWorld, N, 1.0);
        float albedo = (uKind < 0.5 ? 0.45 : water ? 0.3 : 0.55) * (1.0 - 0.35 * joint);
        albedo *= mix(1.0, 0.7, pud);
        float Lt = albedo * (keyLight(vWorld, N) + loc.x);
        float tint = loc.y / max(loc.x, 1e-3);
        vec3 c = toneOf(Lt, tint, ${toneSoft}, vWorld.y);

        // the reflection: dimmer straight down, brighter at a glancing look; full in puddles
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.3 + 0.7 * pow(1.0 - max(V.y, 0.0), 4.0);
        float wet = water ? 0.6 + 0.4 * fres : mix(uKind < 0.5 ? 0.45 : 0.3, 1.0, pud) * fres;
        wet *= step(abs(vWorld.y - uReflY), 0.5);                // (the mirror is at another height: none)
        vec4 rp = uReflMatrix * vec4(vWorld, 1.0);
        vec2 ruv = rp.xy / rp.w + ripple * 0.03 + (vnoise(p * 3.0) - 0.5) * 0.004;
        // stretched downward, as lights on a wet street are
        vec3 r = vec3(0.0); float wsum = 0.0;
        for (int i = -3; i <= 3; i++) {
          float k = float(i);
          float w = 1.0 - abs(k) / 4.0;
          r += texture2D(uRefl, ruv + vec2(0.0, k * 0.012 * (1.0 - pud * 0.6))).rgb * w;
          wsum += w;
        }
        r /= wsum;
        float lum = luma(r);
        vec3 rc3;
        if (uThree > 0.5) {
          float l1 = smoothstep(uReflLo, uReflLo + 0.06, lum), l2 = smoothstep(uReflHi, uReflHi + 0.1, lum);
          rc3 = mix(mix(c, uMid * 1.05, l1), mix(vec3(1.7), r * 1.3, 0.35), l2);
        } else {
          rc3 = mix(c, mix(vec3(1.7), r * 1.3, 0.35), smoothstep((uReflLo + uReflHi) * 0.5, (uReflLo + uReflHi) * 0.5 + 0.1, lum));
        }
        c = mix(c, rc3, clamp(wet * uWet, 0.0, 1.0));
        // the rings catch the light
        c += ring * pud * 0.5 * smoothstep(uE1, uE2, Lt + lum) * uLit;
        c = mix(c, uHue * vec3(1.0, 1.15, 1.15), pv.y * (uKind > 2.5 ? 0.35 : 0.9));   // the lines of light in the paving (a sunken plaza's fainter)
        gl_FragColor = vec4(fogged(c, vWorld), 1.0);
      }`,
  });
}
