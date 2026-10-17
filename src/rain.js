// The rain: tens of thousands of falling streaks in a box that travels with the viewer down the street,
// and small splashes where they land. Each drop works out, where it is, how much light falls on it (the
// moon unless a building shades it, the lamp cones, the screens, the holograms) and takes the matching tone:
// almost invisible in the dark, cyan in a little light, bright white (bright enough to bloom) where the light
// is strong. Looking toward the moon the drops light up the most, as rain does against the light.

import * as THREE from 'three';
import { shared, DEFINES, COMMON } from './toon.js';
import { FACADE, CURB, ROAD, LAYER } from './city.js';

export const RAIN_LEVELS = [
  { name: '小雨', count: 40000, splash: 1500 },
  { name: '中雨', count: 80000, splash: 3500 },
  { name: '暴雨', count: 180000, splash: 7000 },
];
const MAX = RAIN_LEVELS[RAIN_LEVELS.length - 1];
const BOX = { x: FACADE + 24, y: 60, zBack: 30, zFront: 110 }; // the volume of rain round the viewer, plazas and all

const rainUniforms = {
  uPx: { value: 0.001 },                         // metres per pixel at one metre away
  uWind: { value: new THREE.Vector3(0, 0, 0) },  // m/s sideways; none: the rain falls straight down
  uFall: { value: 10.5 },                        // m/s
  uRainLit: { value: new THREE.Color(1.7, 1.85, 1.85) },
  uRainMid: { value: new THREE.Color('#5fbcd0') },
  uRainDeep: { value: new THREE.Color('#2a5c70') },
  uRainBright: { value: 1.25 },                  // the lit and cyan drops together
  uRainAlpha: { value: new THREE.Vector3(0.06, 0.24, 0.9) },  // how opaque: dark, cyan, lit drops
  uRainAt: { value: new THREE.Vector2(0.38, 0.74) },          // light needed to turn cyan, to turn white
  uRainLen: { value: 1 },                        // streak length
  uRainReach: { value: 95 },                     // how far off rain is drawn (m)
  // the roofs over open ground nearest the viewer (no rain beneath: x0, x1, z0, z1; and the underside's
  // height), and raised ground the splashes land on (its rect, its height); see main.js
  uCover: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCoverY: { value: new Float32Array(6) },
  uLift: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLiftY: { value: new Float32Array(6) },
};

function quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

function seeds(n, rnd) {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return new THREE.InstancedBufferAttribute(a, 4);
}

// the tone of a drop, from the light on it, in the vertex stage; also how opaque
const DROP_TONE = /* glsl */ `
  uniform vec4 uCover[6], uLift[6], uHoles[2]; uniform float uCoverY[6], uLiftY[6];
  bool inRect(vec3 p, vec4 r) { return p.x > r.x && p.x < r.y && p.z > r.z && p.z < r.w; }
  // under a roof, or under the ground (the metro station; only a sunken plaza, uHoles, open to the sky): no rain
  float sheltered(vec3 p) {
    for (int i = 0; i < 6; i++) if (inRect(p, uCover[i]) && p.y < uCoverY[i]) return 1.0;
    if (p.y < -0.5 && !inRect(p, uHoles[0]) && !inRect(p, uHoles[1])) return 1.0;
    return 0.0;
  }
  uniform vec3 uRainLit, uRainMid, uRainDeep, uRainAlpha;
  uniform vec2 uRainAt; uniform float uRainBright;
  vec4 dropTone(vec3 p, float phase) {
    vec2 loc = localLight(p, vec3(0.0), 0.0);
    float key = uKey * shadowAt(p) * phase;
    float L = key + loc.x * 1.15;
    vec3 lit = mix(uRainLit, uRainLit * max(uHue * vec3(0.55, 0.95, 1.0), 0.0), clamp(loc.y / max(loc.x + key, 1e-3), 0.0, 1.0) * 0.6) * uRainBright;
    vec4 dark = vec4(uRainDeep, uRainAlpha.x), mid = vec4(uRainMid * uRainBright, uRainAlpha.y), hot = vec4(lit, uRainAlpha.z);
    if (uThree > 0.5) {
      float b1 = smoothstep(uRainAt.x - 0.04, uRainAt.x + 0.04, L), b2 = smoothstep(uRainAt.y - 0.06, uRainAt.y + 0.06, L);
      return mix(mix(dark, mid, b1), hot, b2);
    }
    float m = (uRainAt.x + uRainAt.y) * 0.5;
    return mix(dark, hot, smoothstep(m - 0.05, m + 0.05, L));
  }
`;

export function buildRain() {
  const rnd = Math.random;
  const group = new THREE.Group();

  // ---------------------------------------------------------------- the falling streaks
  const g = quad();
  g.setAttribute('aSeed', seeds(MAX.count, rnd));
  g.instanceCount = RAIN_LEVELS[1].count;
  const mat = new THREE.ShaderMaterial({
    defines: { ...DEFINES },
    uniforms: { ...shared, ...rainUniforms },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      ${COMMON}
      ${DROP_TONE}
      attribute vec4 aSeed;
      uniform float uPx, uFall, uRainLen, uRainReach; uniform vec3 uWind;
      varying vec4 vTone; varying vec2 vQ;
      const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${(BOX.zBack + BOX.zFront).toFixed(1)});
      void main() {
        float speed = uFall * (0.85 + 0.3 * aSeed.w);
        float fall = uTime * speed;
        vec3 vel = vec3(uWind.x, -speed, uWind.z);
        // where the drop is: wrapped inside the box, which follows the viewer along the street
        vec3 p;
        p.y = BOX.y - mod(aSeed.y * BOX.y + fall, BOX.y);
        float x0 = cameraPosition.x - BOX.x;                                    // (across, round the viewer too)
        p.x = x0 + mod(aSeed.x * 2.0 * BOX.x + uWind.x * uTime - x0, 2.0 * BOX.x);
        float z0 = cameraPosition.z - ${BOX.zFront.toFixed(1)};
        p.z = z0 + mod(aSeed.z * BOX.z + uWind.z * uTime - z0, BOX.z);
        p.y += max(cameraPosition.y - 20.0, 0.0) + min(cameraPosition.y - 1.7, 0.0);   // (and down into a sunken plaza)

        // a streak along its fall, as long as the eye smears it, turned to face the viewer
        vec3 dir = normalize(vel);
        vec3 toCam = cameraPosition - p;
        float dist = length(toCam);
        vec3 side = normalize(cross(dir, toCam) + vec3(1e-4, 0.0, 0.0));
        // long streaks; seen from below (looking up into the rain) a streak points almost at the eye and
        // would shrink to a dot, so it is drawn longer the more nearly end-on it is seen
        float endOn = abs(dot(dir, toCam / dist));
        float len = speed * 0.075 * uRainLen * (0.7 + 0.6 * fract(aSeed.w * 7.3)) * min(1.0 / sqrt(max(1.0 - endOn * endOn, 1e-4)), 4.0);
        // never thinner than about one and a half pixels: thinner, far streaks break up into moiré
        float width = max(0.007, dist * uPx * 1.5);
        vec3 wp = p - dir * len * (1.0 - position.y) + side * position.x * width;

        float phase = 0.45 + 2.4 * pow(max(dot(-toCam / dist, uKeyDir), 0.0), 6.0);
        vTone = dropTone(p, phase);
        // a far drop is thin and faint, not fat; but one caught in strong light still shines
        vTone.a *= pow(0.007 / width, vTone.a > 0.5 ? 0.35 : 0.7);
        vTone.a *= smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(uRainReach * 0.5, uRainReach, dist));
        vTone.a *= 1.0 - fogAmount(p) * 0.8;
        vTone.a *= 1.0 - sheltered(p);
        vQ = vec2(position.x * 2.0, position.y);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vTone; varying vec2 vQ;
      void main() {
        float a = vTone.a * (1.0 - vQ.x * vQ.x) * smoothstep(0.0, 0.5, vQ.y);
        gl_FragColor = vec4(vTone.rgb, a);
      }`,
  });
  const streaks = new THREE.Mesh(g, mat);
  streaks.frustumCulled = false;
  streaks.layers.set(LAYER.AIR);
  streaks.renderOrder = 2;
  group.add(streaks);

  // ---------------------------------------------------------------- splashes on the ground
  const sg = quad();
  sg.setAttribute('aSeed', seeds(MAX.splash, rnd));
  sg.instanceCount = RAIN_LEVELS[1].splash;
  const smat = new THREE.ShaderMaterial({
    defines: { ...DEFINES },
    uniforms: { ...shared, ...rainUniforms },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      ${COMMON}
      ${DROP_TONE}
      attribute vec4 aSeed;
      uniform float uHoleFloor[2];
      varying vec4 vTone; varying vec2 vQ; varying float vLife;
      void main() {
        float rate = 2.2 + aSeed.w * 1.5;
        float cyc = uTime * rate + aSeed.w * 17.0;
        float life = fract(cyc), n = floor(cyc);
        // each cycle lands somewhere new, near the viewer
        vec2 r = vec2(hash12(aSeed.xy * 91.0 + n), hash12(aSeed.zw * 57.0 + n * 1.3));
        vec3 p;
        p.x = cameraPosition.x + (r.x * 2.0 - 1.0) * ${(FACADE + 12).toFixed(1)};
        p.z = cameraPosition.z - 40.0 + r.y * 48.0;
        p.y = (abs(p.x) > ${ROAD.toFixed(1)} ? ${CURB.toFixed(2)} : 0.0) + 0.02;
        for (int i = 0; i < 6; i++) if (inRect(p, uLift[i])) p.y = max(p.y, uLiftY[i] + 0.02);
        // down in a sunken plaza, on its floor (or none, where its floor is steps: uHoleFloor above 100)
        float gone = 0.0;
        for (int i = 0; i < 2; i++) if (inRect(p, uHoles[i])) { if (uHoleFloor[i] > 100.0) gone = 1.0; else p.y = uHoleFloor[i] + 0.02; }
        float size = mix(0.04, 0.22, sqrt(life)) * (0.6 + aSeed.y * 0.6);
        // a ring spreading flat on the wet ground
        vec3 toCam = cameraPosition - p;
        vec3 wp = p + vec3(position.x * 2.0, 0.0, position.y * 2.0 - 1.0) * size;
        vTone = dropTone(p + vec3(0.0, 0.3, 0.0), 1.0);
        vTone.a *= (1.0 - sheltered(p)) * (1.0 - gone);
        vTone.a *= (1.0 - life) * smoothstep(0.5, 3.0, length(toCam)) * (1.0 - smoothstep(30.0, 45.0, length(toCam)));
        vQ = vec2(position.x * 2.0, position.y * 2.0 - 1.0);
        vLife = life;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vTone; varying vec2 vQ; varying float vLife;
      void main() {
        float r = length(vQ);
        float a = vTone.a * (1.0 - smoothstep(0.0, 0.18, abs(r - 0.8))) * (1.0 - vLife * 0.5);
        gl_FragColor = vec4(vTone.rgb, a * 1.6);
      }`,
  });
  const splashes = new THREE.Mesh(sg, smat);
  splashes.frustumCulled = false;
  splashes.layers.set(LAYER.AIR);
  splashes.renderOrder = 2;
  group.add(splashes);

  return {
    group,
    uniforms: rainUniforms,
    setLevel(i) {
      g.instanceCount = RAIN_LEVELS[i].count;
      sg.instanceCount = RAIN_LEVELS[i].splash;
    },
    // metres per pixel at a distance of one metre, for the streak width
    resize(camera, heightPx) {
      rainUniforms.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / heightPx;
    },
  };
}
