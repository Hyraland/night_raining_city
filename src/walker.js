// First-person walk down the street. By default one strolls on one's own down the middle of the road,
// glancing up at the big screens and the whale as they come; drag to look around, WASD / arrow keys to
// walk freely (W to walk, W twice quickly to run), Space to hand control back to the stroll.

import * as THREE from 'three';
import { ROAD, CURB, WALK, CROSSINGS, CROSS_HALF } from './city.js';

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const EYE = 1.65;
const GAIT = {
  walk: { speed: 1.6, stride: 0.8, bob: 0.022, sway: 0.014 },
  run: { speed: 4.2, stride: 1.3, bob: 0.045, sway: 0.008 },
  stroll: 1.35,
};
const FOV = 64;
const LOOK_UP = 0.1; // the stroll's resting gaze, a little upward: the towers are the thing here

const streetAt = (x, z) => (Math.abs(x) > ROAD && !CROSSINGS.some((c) => Math.abs(z - c) < CROSS_HALF) ? CURB : 0);
const STEP_UP = 0.6; // the highest one steps up in one go (a stair is many small steps)

export class Walker {
  constructor(camera, dom, { colliders, floors = [], sights, onStep, onModeChange }) {
    this.camera = camera;
    this.colliders = colliders;
    this.floors = floors;     // terraces, stairs, decks: { x0, x1, z0, z1, at(x, z) }
    this.feet = CURB;
    this.sights = sights;     // big screens: { x, y, z, r }, plus moving ones given each frame
    this.onStep = onStep;
    this.onModeChange = onModeChange;
    this.mode = 'auto';
    this.pos = new THREE.Vector3(-2.2, 0, 30);
    this.dir = -1;            // the stroll's way along the street
    this.yaw = 0;
    this.pitch = LOOK_UP;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lastDrag = -10;
    this.eyeY = EYE;
    this.vel = new THREE.Vector2();
    this.speedNow = 0;
    this.runAmt = 0;
    this.pace = 0.5;          // the pace slider (0..1): walking from a walk's speed to half again a run's
    this.gaitSpeed = GAIT.walk.speed;   // (how fast the gait is, eased: walking, running, striding out)
    this.running = false;     // forward pressed twice in quick succession
    this.forwardUp = -10;     // when forward was last let go
    this.phase = 0;
    this.keys = new Set();
    this.time = 0;
    this.focus = null;

    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener('pointerup', (e) => { dragging = false; dom.releasePointerCapture(e.pointerId); });
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      const k = 0.0032;
      if (this.mode === 'auto') {
        this.lookYaw -= dx * k;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - dy * k, -1.1, 1.3);
        this.lastDrag = this.time;
      } else {
        this.yaw -= dx * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.2, 1.4);
      }
    });
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); this.setMode(this.mode === 'auto' ? 'free' : 'auto'); return; }
      const move = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (move.includes(e.code)) { e.preventDefault(); this.keys.add(e.code); if (this.mode === 'auto') this.setMode('free'); }
      // forward pressed again soon after letting it go: run, until it is let go
      if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) {
        this.running = this.time - this.forwardUp < 0.3;
      }
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !this.keys.has('KeyW') && !this.keys.has('ArrowUp')) {
        this.forwardUp = this.time;
        this.running = false;
      }
    });
    addEventListener('blur', () => { this.keys.clear(); this.running = false; });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      this.yaw += this.lookYaw;
      this.pitch += this.lookPitch;
      this.lookYaw = this.lookPitch = 0;
    } else {
      this.dir = Math.cos(this.yaw) > 0 ? -1 : 1; // carry on the way one is facing
      this.lookYaw = angleDiff(this.yaw, this.dir < 0 ? 0 : Math.PI);
      this.lookPitch = this.pitch - LOOK_UP;
      this.yaw -= this.lookYaw;
      this.pitch = LOOK_UP;
      this.lastDrag = this.time;
    }
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  // Something worth a look as the stroll goes by: a big screen or the whale, close and ahead or to the
  // side. Held for a while once chosen, so the gaze doesn't flit.
  pickFocus(heading, extra) {
    const f = this.focus;
    if (f && this.time < f.until) return f;
    let best = null;
    for (const g of [...this.sights, ...extra]) {
      const dx = g.x - this.pos.x, dz = g.z - this.pos.z, d = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dx, -dz), rel = angleDiff(yaw, heading);
      if (d > g.r * 1.6 || d < 6 || Math.abs(rel) > 1.6) continue;
      const w = (1 - d / (g.r * 1.6)) * smooth(1.6, 0.6, Math.abs(rel)) * (g.weight ?? 1);
      if (!best || w > best.w) best = { g, w };
    }
    this.focus = best ? { g: best.g, w: Math.min(0.7, best.w * 1.4), until: this.time + 9 } : { g: null, until: this.time + 4 };
    return this.focus;
  }

  // out of anything one has walked into: round things (trees, columns, planters) and buildings, benches,
  // pools (boxes), pushed out the shortest way
  // The ground underfoot: the street or pavement, or the highest terrace, stair or deck here that is no more
  // than a step above where one stands (so under a deck one stays below it).
  // Below the street (the metro station) the street's own level doesn't count where a floor replaces it.
  groundAt(x, z) {
    let best = -Infinity, below = false;
    for (const f of this.floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.replace) below = true;
      const fh = f.at(x, z);
      if (fh > best && fh <= this.feet + STEP_UP) best = fh;
    }
    if (below && best > -Infinity) return best;
    return Math.max(streetAt(x, z), best);
  }

  collide() {
    const p = this.pos, body = 0.3;
    for (const c of this.colliders) {
      // some only stop one at certain heights: a terrace's edge from below, a railing up on a deck
      if ((c.y0 !== undefined && this.feet < c.y0) || (c.y1 !== undefined && this.feet > c.y1)) continue;
      if (c.r !== undefined) {
        const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + body, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * rr;
          p.z = c.z + (dz / d) * rr;
        }
      } else if (p.x > c.x0 - body && p.x < c.x1 + body && p.z > c.z0 - body && p.z < c.z1 + body) {
        const out = [[c.x0 - body - p.x, 0], [c.x1 + body - p.x, 0], [0, c.z0 - body - p.z], [0, c.z1 + body - p.z]];
        out.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += out[0][0];
        p.z += out[0][1];
      }
    }
  }

  update(dt, extraSights = []) {
    this.time += dt;
    const prev = this.pos.clone();
    const ease = (rate) => 1 - Math.exp(-dt * rate);
    const running = this.running;
    this.runAmt += ((running ? 1 : 0) - this.runAmt) * ease(4);

    if (this.mode === 'auto') {
      this.speedNow += (GAIT.stroll - this.speedNow) * ease(1.2);
      this.pos.z += this.dir * this.speedNow * dt;
      // a gentle drift across the road; at either end of the street, turn back
      const laneX = -2.2 + Math.sin(this.pos.z * 0.006) * 2.6;
      this.pos.x += (laneX - this.pos.x) * ease(0.3);
      if (this.pos.z < WALK.zMin + 20) this.dir = 1;
      if (this.pos.z > WALK.zMax - 20) this.dir = -1;
      const heading = this.dir < 0 ? 0 : Math.PI;
      let targetYaw = heading, targetPitch = LOOK_UP;
      const f = this.pickFocus(heading, extraSights);
      if (f.g) {
        const g = f.g, dx = g.x - this.pos.x, dz = g.z - this.pos.z, d = Math.max(Math.hypot(dx, dz), 4);
        targetYaw += angleDiff(Math.atan2(-dx, -dz), heading) * f.w;
        targetPitch += (Math.min(0.5, Math.atan2(g.y - this.eyeY, d)) - targetPitch) * f.w;
      }
      this.yaw += angleDiff(targetYaw, this.yaw) * Math.min(1, dt * 0.5);
      this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 0.4);
      if (this.time - this.lastDrag > 4) {
        const k = Math.min(1, dt * 0.5);
        this.lookYaw -= angleDiff(this.lookYaw, 0) * k;
        this.lookPitch -= this.lookPitch * k;
      }
    } else {
      const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
      const r = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
      this.yaw += turn * dt * 1.4;
      const want = new THREE.Vector2();
      if (f || r) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        want.set(fx * f - fz * r, fz * f + fx * r).normalize();
        // (the pace: a walk's speed to half again a run's; running, half again that, never slower than a run)
        const walk = THREE.MathUtils.lerp(GAIT.walk.speed, GAIT.run.speed * 1.5, this.pace), run = Math.max(GAIT.run.speed, walk * 1.5);
        const top = THREE.MathUtils.lerp(walk, run, this.runAmt) * (f < 0 || (r && !f) ? 0.7 : 1);
        this.gaitTo = top;
        want.multiplyScalar(top);
      }
      this.vel.lerp(want, ease(want.lengthSq() > this.vel.lengthSq() ? 4 : 6));
      if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.y * dt;
      this.collide();
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -150, 150);   // (the colliders bound the side streets; the museum's galleries reach 143)
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, WALK.zMin, WALK.zMax);
    }

    this.feet = this.groundAt(this.pos.x, this.pos.z);
    this.eyeY += (this.feet + EYE - this.eyeY) * Math.min(1, dt * 8);

    // the gait: a footfall every stride, the head lowest as each foot lands
    const travelled = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    if (this.mode !== 'auto') this.speedNow = travelled / Math.max(dt, 1e-4);
    // (the gait by how fast one means to go: a walk at a walk's speed, a run at a run's, longer strides past it)
    this.gaitSpeed += ((this.mode === 'auto' ? GAIT.walk.speed : this.gaitTo ?? GAIT.walk.speed) - this.gaitSpeed) * ease(4);
    const gait = THREE.MathUtils.clamp((this.gaitSpeed - GAIT.walk.speed) / (GAIT.run.speed - GAIT.walk.speed), 0, 1);
    const stride = THREE.MathUtils.lerp(GAIT.walk.stride, GAIT.run.stride, gait) * Math.max(1, this.gaitSpeed / GAIT.run.speed);
    const before = this.phase;
    this.phase += travelled / stride;
    if (Math.floor(this.phase) !== Math.floor(before)) this.onStep?.(gait);
    const moving = smooth(0.1, 0.8, this.speedNow);
    const ph = this.phase * Math.PI;
    const walkBob = -Math.cos(2 * ph);
    const runBob = 2 * Math.pow(Math.abs(Math.sin(ph)), 0.7) - 1;
    const bob = THREE.MathUtils.lerp(GAIT.walk.bob * walkBob, GAIT.run.bob * runBob, gait) * moving;
    const sway = Math.sin(ph) * THREE.MathUtils.lerp(GAIT.walk.sway, GAIT.run.sway, gait) * moving;

    const cam = this.camera;
    const ry = this.yaw + this.lookYaw;
    cam.position.set(this.pos.x + Math.cos(ry) * sway, this.eyeY + bob, this.pos.z - Math.sin(ry) * sway);
    cam.rotation.set(this.pitch + this.lookPitch - 0.035 * gait * moving, ry, sway * 0.35, 'YXZ');
    const fov = FOV + 4 * gait * moving;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
