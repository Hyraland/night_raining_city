// The mascot's ad for trips to the Star Ring (星环, a huge ring-shaped space station where people live), an
// 18-second loop drawn on a screen, after the two Midjourney stills in reference/ (cat1: flying over the curve
// of the Earth; cat2: waving before the ring):
//   0–4 s     on a rooftop in the rainy city at night, the little electronic cat looks up at the Star Ring, a
//             thin bright ellipse in the sky, waves, crouches and launches itself upward
//   4–6.5 s   climbing: irregular points of light, smeared into streaks by the speed, rush down past it
//   6.5–18 s  in orbit: the Earth's curve rises from below (clouds, city lights, the bright line of its air); the
//             cat flies across, a trail of light behind it, as the Star Ring comes in from far off and grows;
//             it arrives, turns round with a little pop and waves, and the words come up.
// The cat: a dark body drawn with glowing cyan lines, a wide face, big shining eyes, a smile, a small space
// suit and a glass helmet. Lines that glow cyan go into gNeon, a fourth tone on top of the
// screens' dark / cyan / white (see screens.js).
//
// GLSL, spliced into the screen shader after its helpers (sdSeg, sdEll, sdTri, fillOf, lineAt, textBand).

import * as THREE from 'three';

// the cat's proportions, and a time to hold its ads at (uAdTime >= 0: every ad frozen at that second)
export const mascotUniforms = {
  uCat0: { value: new THREE.Vector4(0.27, 0.19, 0.115, 0.066) },
  uCat1: { value: new THREE.Vector4(0.012, 0.038, 1, 0.37) },
  uCat2: { value: new THREE.Vector4(1, 1, 1, 1) },
  uAdTime: { value: -1 },
};

export const MASCOT_GLSL = /* glsl */ `
uniform vec4 uCat0, uCat1, uCat2;
uniform float uAdTime;
float gNeon;
void paint(inout float v, float val, float cov) { v = mix(v, val, cov); gNeon *= 1.0 - cov; }
void glow(float m) { gNeon = max(gNeon, m); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

float starField(vec2 p, float t, float seed, float density) {
  vec2 g = floor(p * 46.0), f = fract(p * 46.0) - 0.5;
  float h = hash12(g + seed * 17.0);
  float s = step(1.0 - density, h) * (1.0 - smoothstep(0.05, 0.12, length(f - (hash22(g) - 0.5) * 0.6)));
  return s * (0.35 + 0.3 * sin(t * 2.0 + h * 40.0));
}

// --------------------------------------------------------------------- the cat
// Its proportions come from the tuning (tuning.json cat):
//   uCat0: face width, face height, eye spacing, eye size
//   uCat1: eye height, pupil size, ear size, helmet size
//   uCat2: body size, mouth size, whisker length, line thickness
// c: the cat's own coordinates (the helmet is about 0.37 across); pose 0 standing and waving, 1 flying;
// dir: which way it flies (+1 right, -1 left); look: where the pupils turn; crouch: 0..1
void drawCat(inout float v, vec2 c, float t, float pose, float dir, vec2 look, float crouch, float seed) {
  float fw = uCat0.x, fh = uCat0.y, gap = uCat0.z, er = uCat0.w;
  float ey = uCat1.x, pr = uCat1.y, earS = uCat1.z, helR = uCat1.w;
  float bs = uCat2.x, ms = uCat2.y, wl = uCat2.z, lw = uCat2.w;
  c.y = (c.y + 0.45) / (1.0 - 0.12 * crouch) - 0.45;          // crouching squashes it toward its feet
  vec2 ca = vec2(abs(c.x), c.y);
  vec2 hc = vec2(0.0, 0.03);                                  // the middle of the face
  float head = sdEll(c - hc, vec2(fw, fh));
  // ears on top of the head toward its sides, as tall as asked
  vec2 eo = vec2(fw * 0.93, hc.y + fh * 0.28), ei = vec2(fw * 0.33, hc.y + fh * 0.78);
  vec2 em = (eo + ei) * 0.5, et = em + (vec2(fw * 0.84, hc.y + fh * 0.78 + 0.14) - em) * earS;
  float ear = sdTri(ca, eo, ei, et);
  float body, limbs, tail = 1e3;
  vec2 pawA = vec2(0.0);
  if (pose < 0.5) {
    // standing, one arm raised and waving, the tail curling up behind
    body = sdEll(c - vec2(0.0, -0.29), vec2(0.15, 0.14) * bs);
    float w = sin(t * 7.0);
    pawA = vec2(fw + 0.06 + 0.02 * w, 0.02 + 0.035 * w);
    vec2 pawB = vec2(-0.13, -0.33);
    limbs = min(sdSeg(c, vec2(0.1, -0.22), pawA) - 0.045, sdSeg(c, vec2(-0.08, -0.25), pawB) - 0.04);
    limbs = min(limbs, min(length(c - pawA) - 0.056, length(c - pawB) - 0.045));
    limbs = min(limbs, min(sdSeg(c, vec2(-0.07, -0.37), vec2(-0.09, -0.44)) - 0.045, sdSeg(c, vec2(0.07, -0.37), vec2(0.1, -0.44)) - 0.045));
    vec2 prev = vec2(-0.12, -0.36);
    for (int i = 1; i <= 8; i++) {
      float u = float(i) / 8.0;
      vec2 pt = vec2(-0.12 - 0.17 * u, -0.36 + 0.21 * u + 0.06 * sin(u * 3.0 + t * 2.2) * u);
      tail = min(tail, sdSeg(c, prev, pt));
      prev = pt;
    }
  } else {
    // flying: the body trailing, front paws reaching ahead, hind legs and tail streaming back
    body = sdEll(c - vec2(-dir * 0.17, -0.25), vec2(0.17, 0.12) * bs);
    limbs = min(length(c - vec2(dir * 0.13, -0.3)) - 0.05, length(c - vec2(dir * 0.02, -0.33)) - 0.05);
    limbs = min(limbs, sdSeg(c, vec2(-dir * 0.3, -0.28), vec2(-dir * 0.41, -0.31 + 0.02 * sin(t * 5.0))) - 0.045);
    vec2 prev = vec2(-dir * 0.32, -0.2);
    for (int i = 1; i <= 8; i++) {
      float u = float(i) / 8.0;
      vec2 pt = vec2(-dir * (0.32 + 0.2 * u), -0.2 + 0.08 * u + 0.045 * sin(u * 4.0 - t * 4.0) * u);
      tail = min(tail, sdSeg(c, prev, pt));
      prev = pt;
    }
  }
  float shape = min(min(head, ear), min(body, min(limbs, tail - 0.022)));
  paint(v, 0.07, fillOf(shape));
  glow(lineAt(shape, 0.014 * lw));
  vec2 ec3 = (eo + ei + et) / 3.0;                            // inside the ears
  glow(lineAt(sdTri(ca, ec3 + (eo - ec3) * 0.62, ec3 + (ei - ec3) * 0.62, ec3 + (et - ec3) * 0.62), 0.008 * lw));

  // big round eyes with two highlights, blinking now and then
  float bl = fract(t * 0.19 + seed);
  float open = 1.0 - smoothstep(0.0, 0.015, bl) * (1.0 - smoothstep(0.015, 0.045, bl));
  float oy = max(open, 0.08), eyY = hc.y + ey;
  vec2 ec = vec2(ca.x - gap, (c.y - eyY) / oy);
  float eye = length(ec) - er;
  paint(v, 0.36, fillOf(eye));
  glow(lineAt(eye, 0.012 * lw));
  float sx = sign(c.x);
  vec2 pc = vec2(ca.x - gap - look.x * sx, (c.y - eyY - look.y) / oy);
  float shown = step(0.3, open);
  paint(v, 0.05, fillOf(length(pc) - pr) * shown);
  paint(v, 1.0, fillOf(length(pc - vec2(-0.47 * sx, 0.53) * pr) - pr * 0.45) * shown);
  paint(v, 1.0, fillOf(length(pc - vec2(0.42 * sx, -0.44) * pr) - pr * 0.2) * shown);
  // nose, a small smile, whiskers
  vec2 nc = vec2(0.0, hc.y - 0.062);
  glow(fillOf(sdTri(c - nc, vec2(-0.015, 0.007) * ms, vec2(0.015, 0.007) * ms, vec2(0.0, -0.007) * ms)));
  vec2 mc = vec2(0.019 * ms, hc.y - 0.08);
  float mouth = min(abs(length(c - vec2(-mc.x, mc.y)) - 0.019 * ms), abs(length(c - mc) - 0.019 * ms));
  glow(lineAt(mouth, 0.008 * lw) * step(c.y, mc.y) * step(abs(c.x), 0.04 * ms));
  float wx = fw * 0.7, wy = hc.y;
  float whisk = min(min(sdSeg(ca, vec2(wx, wy - 0.04), vec2(wx + 0.16 * wl, wy - 0.01)),
                        sdSeg(ca, vec2(wx, wy - 0.07), vec2(wx + 0.16 * wl, wy - 0.08))),
                    sdSeg(ca, vec2(wx - 0.01, wy - 0.1), vec2(wx + 0.13 * wl, wy - 0.14)));
  glow(lineAt(whisk, 0.007 * lw));

  // the space suit: a collar, and on the standing cat a little chest panel and the pads of the raised paw
  glow(lineAt(length(c - hc) - fh - 0.025, 0.01 * lw) * step(c.y, hc.y - fh * 0.75) * step(abs(c.x), fw * 0.6));
  if (pose < 0.5) {
    glow(lineAt(sdBox(c - vec2(0.0, -0.29), vec2(0.055, 0.038) * bs) - 0.01, 0.008 * lw));
    for (int i = 0; i < 3; i++) paint(v, 1.0, fillOf(length(c - pawA - vec2(-0.025 + 0.025 * float(i), 0.03)) - 0.009));
    paint(v, 1.0, fillOf(length(c - pawA + vec2(0.0, 0.005)) - 0.02));
  }

  // the glass helmet, with a glint
  vec2 hh = hc + vec2(0.0, 0.03);
  float hel = length(c - hh) - helR;
  glow(lineAt(hel, 0.01 * lw) * 0.85);
  float ga = atan(c.y - hh.y, c.x);
  paint(v, 1.0, lineAt(length(c - hh) - helR + 0.04, 0.012 * lw) * step(1.95, ga) * step(ga, 2.6));
}

// --------------------------------------------------------------------- the Star Ring
// a great wheel at C, radius r, flattened to k by the angle it is seen at, tilted, turning; lit windows round
// the rim and along the spokes
void drawRing(inout float v, vec2 p, vec2 C, float r, float k, float tilt, float t) {
  vec2 q = rot(-tilt) * (p - C) / r;
  q.y /= k;
  float rad = length(q), ang = atan(q.y, q.x), spin = t * 0.1;
  float band = abs(rad - 0.86) - 0.1;
  float hub = rad - 0.13;
  float spokes = 1e3;
  for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.7854 + spin;
    spokes = min(spokes, sdSeg(q, vec2(cos(an), sin(an)) * 0.12, vec2(cos(an), sin(an)) * 0.78));
  }
  spokes -= 0.022;
  float st = min(min(band, hub), spokes);
  paint(v, 0.1, fillOf(st));
  glow(lineAt(st, 0.012) * 0.7);
  // windows: rows of dots round the rim, fading to an even glow when too small to tell apart
  vec2 g = vec2((ang - spin) / 6.2832 * 150.0, (rad - 0.76) * 22.0);
  vec2 gf = fract(g) - 0.5;
  float hw = hash12(floor(g) + 3.0);
  float dotm = (1.0 - smoothstep(0.2, 0.32, length(gf * vec2(1.0, 0.7)))) * step(0.42, hw);
  float aa = 1.0 - smoothstep(0.35, 0.8, fwidth(g.x));
  float inBand = fillOf(band + 0.015);
  paint(v, hw > 0.85 ? 1.0 : 0.42, mix(0.3, dotm, aa) * inBand);
  // and along the spokes
  float sw = step(0.5, fract(rad * 30.0 - 0.2)) * fillOf(spokes + 0.01) * step(0.16, rad) * step(rad, 0.76);
  paint(v, 0.45, sw * aa);
}

// --------------------------------------------------------------------- the Earth
// a globe of radius R centred at C, seen from orbit: the bright line of its air, a haze above it, clouds
// and city lights below, all drifting slowly as it turns
void drawEarth(inout float v, vec2 p, vec2 C, float R, float t) {
  vec2 d = p - C;
  float r = length(d), e = r - R;
  float halo = exp(-max(e, 0.0) * 14.0) * step(0.0, e);
  v = max(v, halo * 0.3);
  if (e < 0.0) {
    float ang = atan(d.y, d.x), depth = -e;
    vec2 s = vec2(ang * R * 4.0 + t * 0.04, sqrt(depth) * 5.0);   // squeezed toward the limb, as a sphere is
    float land = vnoise(s * 1.6 + 7.0) * 0.65 + vnoise(s * 4.3) * 0.35;
    float cl = vnoise(s * vec2(2.2, 3.5) + vec2(t * 0.06, 0.0)) * 0.6 + vnoise(s * vec2(6.0, 9.0) - vec2(t * 0.04, 0.0)) * 0.4;
    float clouds = smoothstep(0.56, 0.64, cl + 0.12 * sin(s.x * 2.0 + s.y * 3.0));
    vec2 lg = s * vec2(26.0, 22.0);
    float lights = step(0.58, land) * step(0.78, hash12(floor(lg))) * (1.0 - smoothstep(0.15, 0.32, length(fract(lg) - 0.5)));
    float surf = 0.1 + 0.06 * step(0.55, land);
    surf = mix(surf, 0.34, clouds * 0.85);
    surf = mix(surf, 0.38, (1.0 - smoothstep(0.0, 0.06, depth)) * 0.7);   // the haze along the limb
    paint(v, surf, 1.0);
    paint(v, 1.0, lights * (1.0 - clouds) * smoothstep(0.03, 0.1, depth));
  }
  paint(v, 1.0, lineAt(e, 0.006));
  glow(lineAt(e - 0.012, 0.03) * 0.8);
}

// --------------------------------------------------------------------- the three scenes

void sceneCity(inout float v, vec2 p, float T, float W, bool wide, float seed) {
  v = 0.04 + starField(p, T, seed, 0.04);
  // rain
  float col = floor(p.x * 110.0);
  float rl = step(0.985, hash12(vec2(col, floor(p.y * 5.0 + T * 9.0 + hash11(col) * 10.0))));
  v = max(v, rl * 0.3);
  // the Star Ring high in the sky
  drawRing(v, p, wide ? vec2(W * 0.26, 0.3) : vec2(W * 0.18, 0.34), wide ? 0.13 : 0.1, 0.3, -0.12, T);
  // the skyline, lit windows here and there
  float bx = floor(p.x * 8.0 + 0.5), fx = fract(p.x * 8.0 + 0.5);
  float top = -0.5 + 0.1 + 0.2 * hash11(bx + 5.0 + seed * 7.0);
  float inB = step(p.y, top) * step(0.06, fx) * step(fx, 0.94);
  paint(v, 0.09, inB);
  glow(lineAt(p.y - top, 0.006) * step(0.06, fx) * step(fx, 0.94) * 0.6);
  vec2 wg = p * vec2(70.0, 46.0), wf = fract(wg);
  float wl = step(0.72, hash12(floor(wg) + bx)) * step(0.3, wf.x) * step(wf.x, 0.7) * step(0.3, wf.y) * step(wf.y, 0.75);
  paint(v, hash12(floor(wg) * 1.7) > 0.8 ? 1.0 : 0.42, wl * inB * step(p.y, top - 0.02));

  // the cat's rooftop, in front
  float cs = wide ? 0.42 : W * 0.55;
  float catX = wide ? -W * 0.18 : -W * 0.1, roof = -0.2;
  float rb = sdBox(p - vec2(catX, roof - 0.4), vec2(cs * 0.45, 0.4));
  paint(v, 0.08, fillOf(rb));
  glow(lineAt(rb, 0.006));
  // it looks up at the ring, waves, crouches, and is off
  float jump = max(T - 2.3, 0.0);
  float crouch = smoothstep(1.7, 2.1, T) * (1.0 - smoothstep(2.25, 2.4, T));
  vec2 pos = vec2(catX + jump * jump * 0.15, roof + 0.45 * cs + jump * jump * 1.1);
  if (jump > 0.0) {
    for (int i = 0; i < 10; i++) {                         // the dotted trail it leaves
      float u = float(i) / 10.0 * jump;
      vec2 b = vec2(catX + u * u * 0.15, roof + 0.3 * cs + u * u * 1.1);
      v = max(v, (1.0 - smoothstep(0.004, 0.007, length(p - b))) * 0.45);
    }
  }
  vec2 c = (p - pos) / cs;
  if (jump > 0.0) c = rot(-0.5) * c;
  drawCat(v, c, T, jump > 0.0 ? 1.0 : 0.0, 1.0, vec2(0.01, 0.022), crouch, seed);
}

// Climbing: a field of irregular points of light in loose columns, like a matrix, smeared into streaks by the
// speed and rushing down past the cat; three layers, the nearer ones faster and brighter.
void sceneClimb(inout float v, vec2 p, float T, float W, bool wide, float seed) {
  float k = T - 4.0;
  float off = 0.5 * k + 1.3 * k * k;                         // how far it has climbed, speeding up
  float speed = 0.5 + 2.6 * k;
  v = 0.035;
  for (int L = 0; L < 3; L++) {
    float fl = float(L), near = 1.0 - fl * 0.3;
    float cols = 16.0 + fl * 14.0;
    float col = floor(p.x * cols);
    float cs = hash11(col * 1.37 + fl * 17.0 + seed * 3.0);
    float cellH = 0.06 + 0.16 * hash11(col * 2.1 + fl * 5.0); // irregular spacing, column by column
    float y = p.y + off * near * (0.7 + 0.6 * cs);
    float row = floor(y / cellH);
    float h = hash12(vec2(col, row) + fl * 31.0 + seed);
    if (h < 0.8) continue;                                   // most places empty
    float x = (fract(p.x * cols) - 0.5 - (hash12(vec2(row, col) * 1.3 + 7.0) - 0.5) * 0.6) / cols;
    float along = fract(y / cellH) * cellH - hash12(vec2(col * 3.0, row)) * cellH * 0.25;
    float len = min(speed * near * 0.028 * (0.5 + h), cellH * 0.8);
    float wd = 0.0012 + 0.0012 * near;
    float fx = fwidth(x) * 1.5;
    float line = (1.0 - smoothstep(wd, wd + fx, abs(x))) * step(0.0, along) * step(along, len) * (1.0 - along / max(len, 1e-4));
    float calm = mix(0.35, 1.0, smoothstep(0.12, 0.32, length(p * vec2(0.8, 1.0))));   // quieter round the cat
    glow(line * (0.25 + 0.6 * near) * calm);
    float head = 1.0 - smoothstep(wd * 1.7, wd * 1.7 + fx, length(vec2(x, max(along, 0.0) * 0.6)));
    paint(v, h > 0.95 ? 1.0 : 0.42, head * step(-0.002, along) * calm);
  }
  // the cat climbing through, leaning into it
  float cs = wide ? 0.45 : W * 0.6;
  vec2 pos = vec2(0.04 * sin(k * 2.0), -0.04 + 0.03 * sin(k * 3.0));
  drawCat(v, rot(-0.45) * (p - pos) / cs, T, 1.0, 1.0, vec2(0.012, 0.02), 0.0, seed);
}

void sceneOrbit(inout float v, vec2 p, float T, float W, bool wide, float seed) {
  float k = T - 6.5;
  v = 0.035 + starField(p, T, seed, 0.06);
  // the Earth's curve rising into view from below, left
  float rise = 1.0 - smoothstep(0.0, 2.5, k);
  vec2 ec = wide ? vec2(-W * 0.62, -1.7) : vec2(-W * 0.35, -1.38);
  float R = wide ? 1.72 : 1.2;
  drawEarth(v, p, ec - vec2(0.0, rise * 0.5), R, T);
  // faint orbit lines along it
  float rr = length(p - ec);
  float seg = smoothstep(0.3, 0.8, sin(atan(p.y - ec.y, p.x - ec.x) * 9.0 - T * 0.6));
  glow(lineAt(rr - R - 0.14, 0.004) * seg * 0.5 + lineAt(rr - R - 0.22, 0.003) * (1.0 - seg) * 0.35);

  // the Star Ring coming in from far away
  float near = smoothstep(0.3, 7.5, k);
  vec2 rc = wide ? mix(vec2(W * 0.42, 0.3), vec2(W * 0.27, 0.06), near) : mix(vec2(W * 0.25, 0.38), vec2(W * 0.08, 0.24), near);
  float rsz = wide ? mix(0.04, 0.43, near * near) : mix(0.03, W * 0.48, near * near);
  drawRing(v, p, rc, rsz, 0.82, 0.22, T);

  // the cat: flying across, then arriving, turning round with a pop, and waving
  float cs = wide ? 0.5 : W * 0.62;
  float arrive = smoothstep(5.2, 6.4, k);
  vec2 fly = wide ? vec2(mix(-W * 0.34, -W * 0.22, smoothstep(0.0, 5.6, k)), 0.12 + 0.03 * sin(k * 2.0))
                  : vec2(mix(-W * 0.3, -W * 0.05, smoothstep(0.0, 5.6, k)), -0.12 + 0.025 * sin(k * 2.0));
  float pk = (k - 6.1) * 6.0;
  float pop = 1.0 + 0.12 * exp(-pk * pk);
  bool waving = k > 6.1;
  // its trail: dots streaming behind it, and streaks
  for (int i = 0; i < 16; i++) {
    float u = (float(i) + fract(T * 1.5)) / 16.0;
    vec2 b = fly - vec2(u * (wide ? 0.55 : 0.4) * (1.0 - arrive * 0.7), 0.08 * u * u + 0.02 * sin(u * 9.0 + T * 3.0) - 0.05);
    float dm = (1.0 - smoothstep(0.003, 0.006, length(p - b))) * (1.0 - u);
    v = max(v, dm * 0.45);
  }
  vec2 c = (p - fly) / (cs * pop);
  drawCat(v, c, T, waving ? 0.0 : 1.0, 1.0, waving ? vec2(0.014, 0.004) : vec2(0.016, 0.0), 0.0, seed);

  // the words
  float tf = smoothstep(7.0, 7.8, k);
  float tx = wide ? textBand(p, vec2(W * 0.18, -0.4), 0.11, W * 0.5) : textBand(p, vec2(0.0, -0.44), 0.075, W * 0.9);
  paint(v, 1.0, tx * tf);
}

float catAd(vec2 uv, float t, float seed) {
  float W = vScr.z / vScr.w;
  vec2 p = (uv - 0.5) * vec2(W, 1.0);
  bool wide = W > 1.15;
  float T = uAdTime >= 0.0 ? uAdTime : mod(t, 18.0);
  float v = 0.0;
  if (T < 4.0) sceneCity(v, p, T, W, wide, seed);
  else if (T < 6.5) sceneClimb(v, p, T, W, wide, seed);
  else sceneOrbit(v, p, T, W, wide, seed);
  // a dip to dark between the scenes and at the loop
  float edge = min(min(abs(T - 4.0), abs(T - 6.5)), min(T, 18.0 - T));
  float env = smoothstep(0.0, 0.3, edge);
  gNeon *= env;
  return mix(0.03, v, env);
}
`;
