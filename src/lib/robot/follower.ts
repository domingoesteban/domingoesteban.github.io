// Scroll-driven locomotion. The page position g is k at section k and k + s inside the transition band after it.
// A damped follower chases g; the robot walks (or runs, if the reader scrolls fast) between sections, plays the
// transition of each band (story.ts) and runs the task clock of the section it is parked at.
import { blend, BOX_REST, type Frame, type Spec } from './rig';
import { gaitSpec, standSpec, strideFor, dutyFor, jumpSpec, JUMP, jumpObstacle, mixSpec, place, sitTurnSpec, BLOCK, type Prop } from './skills';
import { TASK, LIE, stepMix, withBox, crate, loose, solveScene, type Scene } from './tasks';
import { SECTIONS, TRANSITIONS } from './story';
import { HR, HL, P, folView, layout, type Rect } from './camera';
import { drawFigure, drawProps, polyline } from './draw';
import { arrow, caption, drawNet, groundLine, ring, stepNet } from './overlay';
import { pal, col } from './palette';
import { addv, clamp, follow, lerp, mod, smooth, stepSpring, toLocal, wrapA, type Spring } from './math';

const { min, max, abs, sin, cos, floor, sign, PI } = Math;
const N = SECTIONS.length, LAST = N - 1;

// Section x positions (m) along the walk, the scroll range [A, B] (px) of each band and the page's max scroll (end).
// app.ts fills it on resize.
export const track = { X: SECTIONS.map(() => 0), A: TRANSITIONS.map(() => 0), B: TRANSITIONS.map(() => 0), xLeft: 0, end: 0 };

// Section clocks: [0, I) plays the intro, then the task loops with length L.
const I = SECTIONS.map(s => (s.intro ? s.intro.to - s.intro.from + s.intro.mix + (s.intro.turn ?? 0) : 0));
const L = SECTIONS.map(s => TASK[s.robot].D);
export const clocks = SECTIONS.map(s => s.start ?? 0);

// A box carried to a task that sits is its seat: the clip puts it down facing back (root yaw PI, so BOX_REST lands on
// BLOCK), a stepping turn brings the robot round and it steps back to the box to sit. The box stays where it was put down.
const SEAT = [crate([BLOCK.x, BOX_REST[1], 0])], BACK = 0.8; // seconds of the turn spent stepping back
const seatScene = (k: number, t: number): Scene => {
  const intro = SECTIONS[k].intro!, own = TASK[SECTIONS[k].robot].scene, clip = intro.to - intro.from, m = clip + intro.mix;
  if (t >= I[k]) return { ...own(t - I[k]), props: [], world: SEAT };
  const turn = intro.turn! - BACK, u = clamp((t - m) / turn), stand = sitTurnSpec();
  let spec = t < clip ? TASK[intro.task].scene(intro.from + t).spec
    : t < m ? stepMix(TASK[intro.task].scene(intro.to).spec, stand, (t - clip) / intro.mix)
    : t < m + turn ? mixSpec(stand, gaitSpec(2 * u, { stride: 0.16, lift: 0.7 }), sin(PI * u) ** 0.5)
    : stepMix(stand, own(0).spec, (t - m - turn) / BACK);
  const down = !spec.box || loose(spec.box);
  if (down) { spec = { ...spec }; delete spec.box; }
  return { spec, props: [], world: down ? SEAT : [], root: [0, 0, PI * (1 - smooth(0, 1, u))] };
};

export const secScene = (k: number, t: number): Scene => {
  const { robot, intro } = SECTIONS[k], own = TASK[robot].scene;
  if (!intro) return own(t);
  if (intro.turn) return seatScene(k, t);
  const clip = intro.to - intro.from, box = (s: Spec) => (intro.keepBox ? withBox(s) : s);
  if (t < clip) return TASK[intro.task].scene(intro.from + t);
  if (t < I[k]) return { spec: box(stepMix(TASK[intro.task].scene(intro.to).spec, own(0).spec, (t - clip) / intro.mix)), props: [] };
  const sc = own(t - I[k]);
  return { ...sc, spec: box(sc.spec) };
};
// Tasks that move around (walk, carry, jump) take the robot away from its spot at the section and back; root gives
// that offset [x, z, yaw] from where the loop starts, and the section's props: those that move with the robot, the
// world ones, and a box that was put down (where the robot stood, so it stays) drawn as a crate. All in the section
// frame, before turning it to the heading.
const R0 = SECTIONS.map(s => TASK[s.robot].scene(0).root ?? [0, 0, 0]);
const atSection = (k: number, sc: Scene) => {
  const [x0, z0, a0] = R0[k], [x, z, a] = sc.root ?? R0[k], d = toLocal(x - x0, z - z0, a0), w = toLocal(-x0, -z0, a0);
  const props = [...place(LIE, sc.props, a - a0, d[0], d[2]).props, ...place(LIE, sc.world ?? [], -a0, w[0], w[2]).props];
  return { root: [d[0], d[2], a - a0], props: loose(sc.spec.box) ? [...props, crate(sc.spec.box)] : props };
};
// Props of a section at its current clock, turned to the section heading like the robot working there.
export const secProps = (k: number) => place(LIE, atSection(k, secScene(k, clocks[k])).props, SECTIONS[k].heading, 0, 0).props;
const norm = (k: number, t: number) => (I[k] > 0 && t < I[k] ? max(0, t) : I[k] + mod(t - I[k], L[k]));

// Moves a clock toward an exit state at `rate` times real time, forward through the loop or backward (playing at
// most the section's `rewind` seconds of clip in reverse), whichever arrives sooner. Rewinds an intro.
const steer = (k: number, t: number, T: number | null, dt: number, rate: number) => {
  const i = I[k], l = L[k], back = rate * 0.85;
  if (T === null) return norm(k, t + dt);
  if (T >= i) {
    if (t < i) return t + dt * rate;
    const d = mod(T - t, l), b = l - d;
    if (d < 0.04 || b < 0.04) return T;
    if (b <= (SECTIONS[k].rewind ?? 1.2) && b / back < d / rate) return norm(k, t - min(b, dt * back));
    return norm(k, t + min(d, dt * rate));
  }
  if (t >= i) { const d = mod(i - t, l); return d < 0.04 ? i - 0.001 : norm(k, t + min(d, dt * rate)); }
  return t > T ? max(T, t - dt * back) : min(T, t + dt * back);
};
const LAG = 0.3; // how far (in bands) the robot may trail the scroll

// Follower state.
export const F = {
  g: 0, gv: 0, theta: SECTIONS[0].heading, phase: 0, run: 0, amp: 0, stride: 0.5, wTask: 1, task: 0, dir: 1, v: 0,
  lastX: 0, lastSeg: '', lastS: 0, jumpDir: 0, jw: 0, pz: 0, pv: 0, pushT: -9, pushA: 0, offL: 0, offR: 0, out: 1, late: false,
  ra: 0, raK: 0, // the task's own turn (root yaw) last frame, and its section
  sp: { x: 0, z: 0, vx: 0, vz: 0 } as Spring, snapFrom: null as Frame | null, snapT: 9, frame: LIE,
};
// What render draws: the robot at x (m), props of nearby sections, the caption, and band k at progress s.
export const scene = { frame: LIE, x: 0, props: [] as { props: Prop[]; x: number; a: number; k: number }[], cap: '', capA: 0, k: 0, s: 0 };
// Short blend from the current frame, used when a clock jumps.
const snap = () => { F.snapFrom = F.frame; F.snapT = 0; };

// Band paths in meters: one eased walk, or approach / jump / departure around the obstacle.
type Seg = { s0: number; s1: number; x0: number; x1: number; jump?: boolean };
const JZ = 0.24; // share of a jump band spent in the air
const pathOf = (k: number): Seg[] => {
  const { X } = track, a = X[k], b = X[k + 1];
  if (TRANSITIONS[k] !== 'jump') return [{ s0: 0, s1: 1, x0: a, x1: b }];
  const d = sign(b - a) || 1, m = (a + b) / 2, h = JUMP.length / 2, sA = (1 - JZ) / 2;
  return [{ s0: 0, s1: sA, x0: a, x1: m - d * h }, { s0: sA, s1: sA + JZ, x0: m - d * h, x1: m + d * h, jump: true }, { s0: sA + JZ, s1: 1, x0: m + d * h, x1: b }];
};
const trap = (w: number, a = 0.22) => (w < a ? (w * w) / (2 * a) : w < 1 - a ? w - a / 2 : 1 - a - (1 - w) ** 2 / (2 * a)) / (1 - a);
const segAt = (k: number, s: number) => {
  const segs = pathOf(k), i = segs.findIndex(g => s <= g.s1), g = segs[i < 0 ? segs.length - 1 : i], w = clamp((g.s1 - g.s0) > 0 ? (s - g.s0) / (g.s1 - g.s0) : 0);
  return { g, i, w, x: g.jump ? g.x0 : lerp(g.x0, g.x1, trap(w)) };
};
// Page position from the scroll.
const gStar = () => {
  const { A, B } = track, y = scrollY;
  for (let k = 0; k < N - 1; k++) { if (y < A[k]) return k; if (y < B[k]) return k + (y - A[k]) / (B[k] - A[k]); }
  return LAST;
};

// c is the hero collapse (0 hero grid, 1 follower).
export function update(dt: number, time: number, c: number) {
  const { X, A, B } = track, { reduced, mobile, vh } = layout;

  // Page position with a critically damped follower, a speed cap and a bounded lag.
  const target = c < 1 ? 0 : gStar();
  if (reduced) { F.g = Math.round(target); F.gv = 0; }
  else {
    if (abs(target - F.g) > 1.3) { F.g = target; F.gv = 0; F.task = min(LAST, Math.round(target)); clocks[F.task] = SECTIONS[F.task].exit.next ?? 0; const kk = min(N - 2, floor(target)); F.dir = sign(X[kk + 1] - X[kk]) || 1; snap(); }
    const k0 = min(N - 2, floor(F.g)), s0 = F.g - k0, here = segAt(k0, s0), ahead = segAt(k0, min(1, s0 + 0.01));
    const mPerS = here.g.jump ? 0 : abs(ahead.x - here.x) / 0.01;
    const cap = here.g.jump ? JZ * 1.15 : mPerS > 1e-3 ? 5.2 / mPerS : 50;
    const om = 8.5;
    F.gv += (om * om * (target - F.g) - 2 * om * F.gv) * dt;
    F.gv = clamp(F.gv, -cap, cap);
    // After waiting at a section the robot may trail by more than the lag bound until it has caught up.
    if (abs(target - F.g) < LAG) F.late = false;
    F.g = clamp(F.g + F.gv * dt, F.late ? 0 : max(0, target - LAG), F.late ? LAST : min(LAST, target + LAG));
    // The robot waits at its section until the task reaches the exit pose (the box in hand, say), then walks off,
    // running if the reader is already far ahead. The clock speeds up the further ahead they are (see below).
    const j0 = F.task, T0 = F.g > j0 ? SECTIONS[j0].exit.next : F.g < j0 ? SECTIONS[j0].exit.prev : null;
    if (T0 !== null && abs(clocks[j0] - T0) > 0.05 && abs(F.g - j0) < LAG) { F.g = j0; F.gv = 0; F.late = true; }
  }
  const k = min(N - 2, floor(F.g)), s = F.g - k, seg = segAt(k, s), move = TRANSITIONS[k];
  const parked = s < 0.004 ? k : s > 0.996 ? k + 1 : -1;
  const segKey = `${k}:${seg.i}`;
  let dX = 0;
  if (!seg.g.jump && segKey === F.lastSeg) dX = seg.x - F.lastX;
  F.lastSeg = segKey; F.lastX = seg.x;
  F.v = follow(F.v, dt > 0 ? dX / dt : 0, 10, dt);
  const speed = abs(F.v);
  if (speed > 0.12) F.dir = sign(F.v);

  // Jump zone: the direction is locked when entering, so scrolling back mid-air rewinds the same jump.
  const bandDir = sign(X[k + 1] - X[k]) || 1;
  if (seg.g.jump) { if (!F.jumpDir) F.jumpDir = F.lastS <= seg.g.s0 + 0.02 ? 1 : -1; }
  else F.jumpDir = 0;
  F.jw = follow(F.jw, seg.g.jump ? 1 : 0, 12, dt);
  const travel = (seg.g.jump ? F.jumpDir * bandDir : F.dir) > 0 ? HR : HL;

  // Arrival at a section: pick up its clock where the story left it.
  if (parked >= 0 && parked !== F.task) {
    const from = F.task;
    F.task = parked;
    clocks[parked] = from < parked ? 0 : SECTIONS[parked].exit.next ?? 0;
    if (F.wTask > 0.05) snap();
  }
  const sec = SECTIONS[F.task];
  const thetaT = parked >= 0 && speed < 0.12 && !seg.g.jump ? SECTIONS[parked].heading : travel - F.ra;
  const dTh = reduced ? wrapA(thetaT - F.theta) : clamp(wrapA(thetaT - F.theta), -4.2 * dt, 4.2 * dt);
  F.theta = wrapA(F.theta + dTh);
  const settled = parked >= 0 && speed < 0.15 && abs(wrapA(F.theta - SECTIONS[parked].heading)) < 0.3;
  F.wTask = reduced ? (parked >= 0 ? 1 : 0) : clamp(F.wTask + (settled ? 2.4 : -3.6 - 3 * speed) * dt);

  // Task clock: loops while featured and steers to the exit state when the reader is about to leave, faster the
  // further into the band they have scrolled.
  // It starts `soon` before a band, but at most half way into the section's scroll range: a short one (the last
  // section on a tall screen) still plays its task.
  const j = F.task, y = scrollY, room = (j < LAST ? A[j] : track.end) - (j > 0 ? B[j - 1] : -Infinity);
  const soon = min(mobile ? vh * 0.12 : vh * 0.25, room / 2);
  const fwdSoon = j < LAST && (y > A[j] - soon || F.g > j + 0.001);
  const backSoon = j > 0 && (y < B[j - 1] + soon || F.g < j - 0.001);
  const T = fwdSoon ? sec.exit.next : backSoon ? sec.exit.prev : null;
  if (reduced) clocks[j] = T ?? sec.still;
  else clocks[j] = F.wTask > 0 || parked === j ? steer(j, clocks[j], T, dt, abs(target - j) > 0.01 ? min(9, 4 + 12 * abs(target - j)) : 2.5) : clocks[j];
  if (!reduced && T !== null && F.wTask < 0.98 && abs(clocks[j] - T) > 0.05 && parked !== j) { clocks[j] = T; snap(); }

  // Locomotion: phase advances with distance (and with turning), so stance feet do not skate.
  const run = smooth(1.9, 2.9, speed);
  F.run = follow(F.run, run, 4, dt);
  const S = strideFor(speed, F.run), adv = abs(dX) + 0.22 * abs(dTh);
  F.phase += adv / S;
  F.stride = follow(F.stride, adv > 1e-5 ? (S * abs(dX)) / adv : F.stride, 8, dt);
  F.amp = follow(F.amp, smooth(0.03, 0.3, speed + 0.4 * abs(dTh) / max(dt, 1e-3)), 7, dt);
  const tsc = secScene(j, clocks[j]);
  const holding = (move === 'carry' && s > 0.004 && s < 0.996) || (!!tsc.spec.box && tsc.spec.box[4] > 0.5);
  let loco = mixSpec(standSpec(time, holding), gaitSpec(F.phase, { stride: F.stride, run: F.run, carry: holding }), F.amp);
  if (F.jw > 0.001) loco = mixSpec(loco, jumpSpec(seg.g.jump ? (F.jumpDir > 0 ? seg.w : 1 - seg.w) : 0), F.jw);

  // Push: a shove in the back when crossing the middle of the band, caught with a longer step.
  if (move === 'push' && (F.lastS - 0.5) * (s - 0.5) < 0 && speed > 0.25 && time - F.pushT > 1.5 && !reduced) {
    F.pv += 1.6; F.pushT = time; F.pushA = 1;
  }
  F.lastS = s;
  F.pv += (-30 * F.pz - 6 * F.pv) * dt; F.pz += F.pv * dt;
  F.pushA = max(0, F.pushA - dt * 1.4);
  const B0 = dutyFor(F.run), swing = (u: number) => mod(u, 1) >= B0;
  if (swing(F.phase)) F.offL = follow(F.offL, F.pz * 0.9, 14, dt);
  if (swing(F.phase + 0.5)) F.offR = follow(F.offR, F.pz * 0.9, 14, dt);
  loco = { ...loco, lf: [loco.lf[0] + F.offL, ...loco.lf.slice(1)], rf: [loco.rf[0] + F.offR, ...loco.rf.slice(1)] };

  let spec = stepMix(loco, tsc.spec, F.wTask);
  const boxDown = loose(spec.box);
  if (boxDown) { spec = { ...spec }; delete spec.box; }
  stepSpring(F.sp, dt);
  const hand = toLocal(F.sp.x, F.sp.z, F.theta);
  const [rx, rz, ra] = atSection(j, tsc).root;
  // The robot faces theta plus its task's own turn ra. Walking, or as the task changes, theta takes up any change of
  // ra so the robot does not flip; parked at its section, the task turns it.
  if (parked !== j || F.raK !== j) F.theta = wrapA(F.theta + F.ra - ra);
  F.ra = ra; F.raK = j;
  let frame = place(place(solveScene({ ...tsc, spec, push: tsc.push && { ...tsc.push, strength: tsc.push.strength * F.wTask } }, [hand[0] + F.pz, 0, hand[2]]), [], ra, rx, rz).frame, [], F.theta, 0, 0).frame;
  F.snapT += dt;
  if (F.snapFrom && F.snapT < 0.35) frame = blend(F.snapFrom, frame, smooth(0, 0.35, F.snapT));
  F.frame = frame;
  const ax = seg.g.jump ? (F.jumpDir > 0 ? seg.g.x0 : seg.g.x1) : seg.x;

  // Props of nearby sections (with the box left where it was put down) and the obstacle of a jump band.
  const props: typeof scene.props = [];
  for (let i = 0; i < N; i++) {
    const near = 1 - smooth(0.06, 0.3, abs(F.g - i));
    if (near <= 0.01) continue;
    const list = secProps(i);
    if (list.length) props.push({ props: list, x: X[i], a: near, k: i });
  }
  if (move === 'jump') props.push({ props: place(LIE, [jumpObstacle(-JUMP.obstacle.x)], HR, 0, 0).props, x: (X[k] + X[k + 1]) / 2, a: smooth(0.02, 0.16, s) * (1 - smooth(0.84, 0.98, s)), k: -1 });

  const inBand = parked < 0;
  // Only a push is captioned on the way: walks and jumps read without words.
  const cap = !inBand ? SECTIONS[parked].caption : move === 'push' && time - F.pushT < 2 ? TASK.push.caption : '';
  // The policy reads the robot every frame. Its side flips mid-walk, folding through the head instead of jumping.
  stepNet(frame, { v: F.v, phase: F.phase, amp: F.amp, push: F.pv }, dt);
  const outT = SECTIONS[F.task].side === 'R' && F.wTask > 0.5 ? 1 : ax < track.xLeft / 2 ? -1 : 1;
  F.out = reduced ? outT : follow(F.out, outT, 7, dt);

  Object.assign(scene, { frame, x: ax, props, cap, capA: inBand ? smooth(0.12, 0.3, s) * (1 - smooth(0.7, 0.88, s)) : F.wTask, k, s });
}

// The robot, the props of nearby sections, the ground it walks on and a faint policy. On mobile everything is
// clipped to the dock. Returns the rect the pointer can nudge.
export function renderFollower(g: CanvasRenderingContext2D, dock: DOMRect | null): Rect {
  const { X } = track, { mobile, folRect, ppm } = layout;
  const fo = scene, camX = mobile ? fo.x : 0;
  const vAt = (x: number) => folView((x - camX) * ppm);
  const v = vAt(fo.x);
  const gy = P(v, [0, 0, 0])[1], rx = P(v, [0, 0, 0])[0];
  if (mobile && dock) {
    const d = dock;
    g.save();
    g.beginPath(); g.rect(d.left + 1, d.top + 1, d.width - 2, d.height - 2); g.clip();
    g.strokeStyle = col(pal.line); g.lineWidth = 1;
    polyline(g, [[folRect.x - 20, gy + 0.5], [d.right, gy + 0.5]]);
    for (let i = -12; i <= 12; i++) {
      const x = rx + (floor(camX / 0.5) * 0.5 - camX + i * 0.5) * ppm;
      if (x < folRect.x - 10 || x > d.right) continue;
      polyline(g, [[x, gy + 0.5], [x - 4, gy + 4.5]]);
    }
  } else {
    const xa = P(vAt(X[fo.k]), [0, 0, 0])[0], xb = P(vAt(X[min(LAST, fo.k + 1)]), [0, 0, 0])[0];
    const span = smooth(0.01, 0.14, fo.s) * (1 - smooth(0.86, 0.99, fo.s)), half = folRect.w * 0.3;
    groundLine(g, min(xa, xb) - half, max(xa, xb) + half, gy, span);
    for (let i = 0; i < N; i++) ring(g, vAt(X[i]), 0.6, 0.8 * (1 - smooth(0.02, 0.16, abs(F.g - i))));
  }
  // Tools and the loose crate of the section the robot is parked at are drawn with the figure, otherwise as props.
  const held = abs(F.g - F.task) < 0.004 ? F.task : null;
  for (const pp of fo.props) drawProps(g, pp.props, vAt(pp.x), pp.a, pp.k !== held);
  drawFigure(g, fo.frame, v, fo.props.find(pp => pp.k === held)?.props ?? []);
  if (F.pushA > 0.02) {
    const ch = fo.frame.joints.chest, dir = [cos(F.theta), 0, -sin(F.theta)];
    arrow(g, v, addv(ch, dir, -0.75), addv(ch, dir, -0.14), F.pushA);
  }
  const push = fo.frame.push;
  if (push && push.strength > 0.02) arrow(g, v, addv(push.at, push.dir, -0.63), addv(push.at, push.dir, -0.02), push.strength);
  if (mobile) g.restore();
  else {
    // The net sits on the outer side of the robot, away from the text, and keeps running between sections.
    drawNet(g, fo.frame, v, 0.9, F.out);
    caption(g, fo.cap, rx, gy + 28, fo.capA);
  }
  return { x: rx - folRect.w * 0.3, y: folRect.y, w: folRect.w * 0.6, h: folRect.h };
}
