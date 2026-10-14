// Extra whole-body skills on top of rig.ts: walk and run driven by gait phase (for scroll-driven
// locomotion), walking a loop, carrying with turns, a two-footed jump over a low obstacle, sitting on a block,
// drilling at a table, a one-foot balance that keeps the whole-body CoM over the stance foot, and a wave.
// Same conventions as the rig: meters, y up, faces +x, its left is -z, ground y = 0.
// Forked from prototype-styles/humanoid-extra.ts.
import { solve, base, tweak, keyed, pchip, skillSpec, hermite, BOX_REST, BOX_SIZE, type Spec, type Frame, type Vec3, type JointName } from './rig';
import { clamp, lerp, smooth, mod } from './math';

type V = number[];
const { sin, cos, PI, min } = Math;
const add = (a: V, b: V): V => a.map((v, i) => v + b[i]);
const mix = (a: V, b: V, w: number): V => a.map((v, i) => v + (b[i] - v) * w);

// Props are oriented boxes: center and three half-extent vectors.
export type PropKind = 'block' | 'table' | 'leg' | 'plank' | 'tool' | 'hole' | 'obstacle';
export interface Prop { kind: PropKind; c: Vec3; ax: [Vec3, Vec3, Vec3]; alpha?: number }
const boxProp = (kind: PropKind, c: V, size: V, alpha?: number): Prop =>
  ({ kind, c: c as Vec3, ax: [[size[0] / 2, 0, 0], [0, size[1] / 2, 0], [0, 0, size[2] / 2]], alpha });

export function mixSpec(a: Spec, b: Spec, w: number): Spec {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const out = { ...a } as Spec;
  for (const k of Object.keys(b) as (keyof Spec)[]) out[k] = a[k] ? mix(a[k]!, b[k]!, w) : b[k]!;
  return out;
}

// Non-periodic monotone cubic through keys, flat at both ends.
function track(keys: [number, Spec][]) {
  const ts = keys.map(k => k[0]), fields = Object.keys(keys[0][1]) as (keyof Spec)[];
  const at = (vs: number[], t: number) => {
    const n = ts.length;
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (ts[i + 1] < t) i++;
    const d = (k: number) => (vs[k + 1] - vs[k]) / (ts[k + 1] - ts[k]);
    const tan = (k: number) => {
      if (k === 0 || k === n - 1) return 0;
      const d0 = d(k - 1), d1 = d(k), h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k];
      return d0 * d1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
    };
    const h = ts[i + 1] - ts[i];
    return hermite(vs[i], vs[i + 1], tan(i) * h, tan(i + 1) * h, (t - ts[i]) / h);
  };
  return (t: number) => {
    const out = {} as Spec;
    for (const f of fields) out[f] = keys[0][1][f]!.map((_, i) => at(keys.map(k => k[1][f]![i]), t));
    return out;
  };
}
const curve = (keys: [number, number][]) => { const f = track(keys.map(([t, v]) => [t, { p: [v] } as unknown as Spec])); return (t: number) => f(t).p[0]; };

// Whole-body center of mass from segment masses (kg) lumped at segment midpoints.
const MASS: [JointName, JointName, number][] = [
  ['pelvis', 'pelvis', 10], ['pelvis', 'chest', 6], ['chest', 'neck', 16], ['head', 'head', 5],
  ['lShoulder', 'lElbow', 2.2], ['lElbow', 'lHand', 1.6], ['rShoulder', 'rElbow', 2.2], ['rElbow', 'rHand', 1.6],
  ['lHip', 'lKnee', 7], ['lKnee', 'lAnkle', 3.5], ['lAnkle', 'lToe', 1.1], ['rHip', 'rKnee', 7], ['rKnee', 'rAnkle', 3.5], ['rAnkle', 'rToe', 1.1],
];
export function com(f: Frame): Vec3 {
  let m = 0, c = [0, 0, 0];
  for (const [a, b, w] of MASS) { c = add(c, mix(f.joints[a], f.joints[b], 0.5).map(v => v * w)); m += w; }
  return c.map(v => v / m) as Vec3;
}
// Ground point under the middle of a foot spec [x, z, lift, pitch, yaw].
const footCenter = (ft: V) => [ft[0] + 0.045 * cos(ft[4]), ft[1] - 0.045 * sin(ft[4])];

// Shifts the pelvis (and a lifted foot with it) until the CoM projects onto the target ground point.
function overSupport(s: Spec, target: (s: Spec) => number[], carry: 'lf' | 'rf' | null) {
  for (let i = 0; i < 4; i++) {
    const c = com(solve(s)), [tx, tz] = target(s), dx = tx - c[0], dz = tz - c[2];
    s = tweak(s, { p: [s.p[0] + dx, s.p[1], s.p[2] + dz] });
    if (carry) { const ft = s[carry], k = smooth(0, 0.04, ft[2]); s = tweak(s, { [carry]: [ft[0] + dx * k, ft[1] + dz * k, ft[2], ft[3], ft[4]] }); }
  }
  return s;
}

// Gait as a function of phase (cycles, one cycle is two steps). Moving the root d meters means advancing the
// phase by d / stride, which keeps the stance foot planted. run blends walk (double support) into a run with
// two flight phases per cycle; carry holds a box at the chest.
export const strideFor = (speed: number, run: number) => lerp(clamp(0.4 + 0.55 * speed, 0.4, 1.25), clamp(0.9 + 0.32 * speed, 1.2, 2.0), run);
export const dutyFor = (run: number) => lerp(0.62, 0.36, run);
export interface GaitOpts { stride: number; run?: number; carry?: boolean; lift?: number }
const PITCH_T = [0, 0.16, 0.68, 1, 1.42, 1.82], WALK_P = [-0.25, 0, 0, 0.62, 0.12, -0.22], RUN_P = [0.1, 0, 0, 0.7, 0.35, 0.02];
export function gaitSpec(phase: number, { stride: S, run: r = 0, carry = false, lift = 1 }: GaitOpts): Spec {
  const B = dutyFor(r), s = base(), ph = mod(phase, 1);
  const leg = (p: number, side: number) => {
    const u = mod(p, 1), q = (u - B) / (1 - B);
    const x = u < B ? S * (B / 2 - u) : hermite(-S * B / 2, S * B / 2, -S * (1 - B), -S * (1 - B), q);
    const h = lerp(carry ? 0.06 : 0.075, 0.19, r) * lift;
    const up = u < B ? 0 : h * sin(PI * q ** lerp(1, 0.72, r)) ** 2;
    const w = u < B ? u / B : 1 + q, pitch = lerp(pchip(PITCH_T, WALK_P, 2, w), pchip(PITCH_T, RUN_P, 2, w), r) * (carry ? 0.8 : 1) * min(1, 0.4 + S);
    return [x, side * lerp(0.105, 0.085, r), up, pitch, -side * 0.05];
  };
  const c = cos(2 * PI * ph), w = sin(2 * PI * ph), c2 = cos(4 * PI * ph), cr2 = cos(4 * PI * (ph - B / 2));
  s.lf = leg(ph, -1);
  s.rf = leg(ph + 0.5, 1);
  s.p = [lerp(0.01 * c2, 0.05, r), lerp(0.838 - 0.012 * c2, 0.8 - 0.026 * cr2, r), lerp(-0.026, -0.01, r) * w];
  s.pr = [lerp(-0.08, -0.12, r) * c, lerp(0.07, 0.17, r), lerp(0.035, 0.02, r) * w];
  s.cr = [lerp(carry ? 0.09 : 0.14, carry ? 0.06 : 0.22, r) * c, carry ? lerp(-0.08, -0.04, r) : lerp(0.02, 0.05, r), -0.045 * w];
  s.hd = [-0.06 * c, carry ? 0.12 : lerp(0.03, -0.05, r), 0.01 * w];
  const k = cos(2 * PI * ph - 0.25);
  const arm = (k: number) => mix([0.05 + 0.15 * k, -0.47 + 0.05 * k * k, 0], [0.1 + 0.2 * k, -0.26 + 0.05 * k * k, 0], r);
  s.lh = add(arm(-k), [0, 0, lerp(-0.06, -0.03, r)]);
  s.rh = add(arm(k), [0, 0, lerp(0.06, 0.03, r)]);
  if (carry) s.box = [0, 0, 0, 0, 1, 1];
  return s;
}
export function standSpec(t: number, carry = false): Spec {
  const s = skillSpec('stand', t);
  if (carry) { s.box = [0, 0, 0, 0, 1, 1]; s.hd = [s.hd[0] * 0.4, 0.12, s.hd[2]]; s.cr = [s.cr[0] * 0.5, -0.08, s.cr[2]]; }
  return s;
}

// Jump: counter-movement, two-footed take-off, tucked flight over a low obstacle, absorbed landing. u in [0, 1]
// is the jump progress; the root moves forward by JUMP.length, and the obstacle sits at JUMP.obstacle.x.
export const JUMP = { length: 0.84, obstacle: { x: 0.42, depth: 0.2, height: 0.2, width: 0.36 } };
const J0 = tweak(base(), { lf: [0, -0.11, 0, 0, 0.04], rf: [0, 0.11, 0, 0, -0.04] });
const jLoad = tweak(J0, { p: [-0.1, 0.62, 0], pr: [0, 0.78, 0], cr: [0, 0.22, 0], hd: [0, -0.3, 0], lh: [-0.3, -0.36, -0.08], rh: [-0.3, -0.36, 0.08] });
const jPush = tweak(J0, {
  p: [0.14, 0.9, 0], pr: [0, 0.38, 0], cr: [0, 0.04, 0], hd: [0, 0.05, 0],
  lf: [0, -0.11, 0, 0.95, 0.04], rf: [0, 0.11, 0, 0.95, -0.04], lh: [0.36, -0.12, -0.1], rh: [0.36, -0.12, 0.1],
});
const jTuck = tweak(jPush, {
  p: [0.42, 1.08, 0], pr: [0, 0.42, 0], cr: [0, 0.12, 0], hd: [0, -0.05, 0],
  lf: [0.36, -0.11, 0.48, -0.05, 0.04], rf: [0.36, 0.11, 0.48, -0.05, -0.04], lh: [0.34, -0.2, -0.12], rh: [0.34, -0.2, 0.12],
});
const jReach = tweak(jTuck, {
  p: [0.68, 0.94, 0], pr: [0, 0.3, 0], cr: [0, 0.08, 0],
  lf: [0.84, -0.11, 0.1, -0.2, 0.04], rf: [0.84, 0.11, 0.1, -0.2, -0.04], lh: [0.3, -0.28, -0.16], rh: [0.3, -0.28, 0.16],
});
const jLand = tweak(jReach, { p: [0.78, 0.78, 0], pr: [0, 0.45, 0], lf: [0.84, -0.11, 0, 0, 0.04], rf: [0.84, 0.11, 0, 0, -0.04] });
const jAbsorb = tweak(jLand, { p: [0.76, 0.6, 0], pr: [0, 0.75, 0], cr: [0, 0.2, 0], hd: [0, -0.25, 0], lh: [0.32, -0.32, -0.14], rh: [0.32, -0.32, 0.14] });
const jEnd = tweak(J0, { p: [0.84, 0.845, 0], lf: jLand.lf, rf: jLand.rf });
const jumpTrack = track([[0, J0], [0.17, jLoad], [0.31, jPush], [0.46, jTuck], [0.6, jReach], [0.68, jLand], [0.82, jAbsorb], [1, jEnd]]);
export const jumpSpec = (u: number) => jumpTrack(clamp(u));
export const jumpObstacle = (x0 = 0, alpha?: number) =>
  boxProp('obstacle', [x0 + JUMP.obstacle.x, JUMP.obstacle.height / 2, 0], [JUMP.obstacle.depth, JUMP.obstacle.height, JUMP.obstacle.width], alpha);

// Sit down on a block behind the robot and stand up, hinging at the hips so the CoM stays over the feet. The block is
// the lift box where the lift puts it down, seen from behind: a robot can put the box down, turn around and sit on it.
export const BLOCK = { x: -BOX_REST[0], size: BOX_SIZE };
const sFeet = { lf: [0.04, -0.12, 0, 0, 0.08], rf: [0.04, 0.12, 0, 0, -0.08] };
const sStand = tweak(base(), { ...sFeet, hd: [0, 0.04, 0] });
const sLook = tweak(sStand, { hd: [0.5, -0.1, 0], cr: [0.12, 0.02, 0] });
const sHinge = tweak(sStand, { p: [-0.12, 0.7, 0], pr: [0, 0.62, 0], cr: [0, 0.12, 0], hd: [0, -0.4, 0], lh: [0.34, -0.3, -0.06], rh: [0.34, -0.3, 0.06] });
const sTouch = tweak(sHinge, { p: [-0.26, 0.53, 0], pr: [0, 0.5, 0], hd: [0, -0.3, 0], lh: [0.36, -0.26, -0.06], rh: [0.36, -0.26, 0.06] });
const sSit = tweak(sTouch, { p: [-0.29, 0.52, 0], pr: [0, 0.02, 0], cr: [0, 0.06, 0], hd: [0, 0.06, 0], lh: [0.26, -0.4, -0.02], rh: [0.26, -0.4, 0.02] });
const sRest = tweak(sSit, { pr: [0, -0.04, 0], cr: [0.06, 0.02, 0], hd: [-0.2, 0.1, 0] });
const sLean = tweak(sTouch, { p: [-0.24, 0.53, 0], pr: [0, 0.88, 0], hd: [0, -0.25, 0], lh: [0.46, -0.16, -0.06], rh: [0.46, -0.16, 0.06] });
const sRise = tweak(sHinge, { p: [-0.1, 0.72, 0], pr: [0, 0.5, 0], hd: [0, -0.15, 0] });
export const SIT_DURATION = 8;
const sitKeys = keyed(SIT_DURATION, [[0, sStand], [0.5, sStand], [1.0, sLook], [1.6, sStand], [2.4, sHinge], [3.1, sTouch], [3.7, sSit], [4.3, sRest], [5.0, sSit], [5.5, sLean], [6.2, sRise], [7.0, sStand]]);
export const sitSpec = (t: number) => sitKeys(mod(t, SIT_DURATION));
export const sitBlock = (alpha?: number) => boxProp('block', [BLOCK.x, BLOCK.size[1] / 2, 0], BLOCK.size, alpha);

// Drill at a table: grip the parked drill, turn it bit-down over a plank, press into its two holes with both hands,
// park it. The holes are always there, so it reads as drilling or as driving screws.
export const TABLE = { x: 0.5, top: 0.74, size: [0.44, 0.04, 0.9] as Vec3 };
export const DRILL_DURATION = 10;
const PLANK_Y = TABLE.top + 0.03, HOLES = [[0.45, 0.04], [0.45, -0.1]], PARK = [0.42, TABLE.top + 0.185, 0.3];
const dPx = curve([[0, PARK[0]], [1.4, PARK[0]], [2.2, 0.44], [3.0, HOLES[0][0]], [6.4, HOLES[1][0]], [7.3, 0.44], [8.0, PARK[0]]]);
const dPz = curve([[0, PARK[2]], [1.4, PARK[2]], [2.3, 0.12], [2.9, HOLES[0][1]], [4.2, HOLES[0][1]], [4.8, HOLES[1][1]], [6.4, HOLES[1][1]], [7.2, 0.15], [8.0, PARK[2]]]);
const dAng = curve([[0, 0], [1.5, 0], [2.5, PI / 2], [6.6, PI / 2], [7.6, 0]]);
const dLift = curve([[0, 0], [1.4, 0], [2.0, 0.14], [2.8, 0.035], [3.1, 0.03], [3.9, -0.03], [4.2, 0.04], [4.8, 0.04], [5.1, 0.03], [5.9, -0.03], [6.3, 0.05], [7.2, 0.12], [8.0, 0]]);
const dGripR = curve([[0, 0], [0.5, 0], [1.25, 1], [8.1, 1], [8.8, 0]]);
const dGripL = curve([[0, 0], [2.4, 0], [3.0, 1], [6.1, 1], [6.7, 0]]);
const dBuzz = (t: number) => smooth(3.15, 3.35, t) * (1 - smooth(3.75, 3.9, t)) + smooth(5.15, 5.35, t) * (1 - smooth(5.75, 5.9, t));
const dIdle = tweak(base(), { lf: [0, -0.12, 0, 0, 0.06], rf: [0.02, 0.12, 0, 0, -0.08], hd: [0, 0.3, 0] });
const dWork = tweak(dIdle, { p: [-0.05, 0.83, 0.02], pr: [0, 0.26, 0], cr: [0, 0.14, 0], hd: [0, 0.42, 0] });
const dBody = keyed(DRILL_DURATION, [[0, dIdle], [0.6, dIdle], [1.4, tweak(dIdle, { pr: [0, 0.14, 0], hd: [0, 0.4, 0] })], [2.6, dWork], [6.3, dWork], [7.6, tweak(dIdle, { pr: [0, 0.14, 0] })], [8.8, dIdle]]);
export function drillScene(t: number): { spec: Spec; props: Prop[]; buzz: number } {
  t = mod(t, DRILL_DURATION);
  const a = dAng(t), buzz = dBuzz(t), jit = buzz * 0.004 * sin(t * 170);
  const bitLen = 0.11, y = lerp(PARK[1], PLANK_Y + bitLen, smooth(0, PI / 2, a)) + dLift(t);
  // Drill frame: axis f (toward the bit), up u, side l; P is the chuck.
  const f = [cos(a), -sin(a), 0], u = [sin(a), cos(a), 0], l = [0, 0, 1];
  const P = [dPx(t) + jit, y, dPz(t)];
  const at = (df: number, du: number, dl = 0) => P.map((v, i) => v + f[i] * df + u[i] * du + l[i] * dl);
  const tool = (c: V, sf: number, su: number, sl: number): Prop =>
    ({ kind: 'tool', c: c as Vec3, ax: [f.map(v => v * sf) as Vec3, u.map(v => v * su) as Vec3, l.map(v => v * sl) as Vec3] });
  const grip = at(-0.15, -0.09), top = at(-0.16, 0.05);
  const s = dBody(t), wr = dGripR(t), wl = dGripL(t);
  s.rw = [...grip, wr];
  s.lw = [...top, wl];
  s.rh = mix(s.rh, [0.12, -0.42, 0.06], wr);
  s.lh = mix(s.lh, [0.1, -0.44, -0.06], wl);
  if (buzz > 0) { s.cr = add(s.cr, [0, 0.006 * buzz * sin(t * 140), 0]); s.p = add(s.p, [0, -0.012 * buzz, 0]); }
  const props: Prop[] = [
    boxProp('table', [TABLE.x, TABLE.top - TABLE.size[1] / 2, 0], TABLE.size),
    ...[-1, 1].flatMap(i => [-1, 1].map(j => boxProp('leg', [TABLE.x + i * 0.18, (TABLE.top - 0.04) / 2, j * 0.4], [0.035, TABLE.top - 0.04, 0.035]))),
    boxProp('plank', [HOLES[0][0], TABLE.top + 0.015, -0.03], [0.16, 0.03, 0.56]),
    ...HOLES.map(([x, z]) => boxProp('hole', [x, PLANK_Y + 0.001, z], [0.018, 0.002, 0.018])),
    tool(at(-0.12, 0), 0.085, 0.035, 0.03),
    tool(at(-0.02, 0), 0.03, 0.022, 0.022),
    tool(at(-0.18, -0.09), 0.022, 0.06, 0.022),
    tool(at(-0.17, -0.165), 0.055, 0.02, 0.035),
    tool(at(bitLen / 2 - 0.0, 0), bitLen / 2, 0.004, 0.004),
  ];
  return { spec: s, props, buzz };
}

// One-foot balance: shift the CoM over the left foot, lift the right leg, hold with small corrections, extend the
// free leg back while pitching the torso, and come back down. The pelvis is solved so the CoM stays over the foot.
export const POISE_DURATION = 11;
const pStand = tweak(base(), { lf: [0, -0.11, 0, 0, 0.06], rf: [0, 0.11, 0, 0, -0.06] });
const pShift = tweak(pStand, { pr: [0, 0.03, 0.06], cr: [0, 0.02, -0.08], hd: [0, 0.06, -0.04] });
const pHeel = tweak(pShift, { rf: [0, 0.11, 0, 0.45, -0.06] });
const pKnee = tweak(pShift, { rf: [0.04, 0.12, 0.3, 0.35, -0.05], lh: [0.04, -0.3, -0.3], rh: [0.04, -0.3, 0.3], hd: [0, 0.12, -0.02] });
const pHold = tweak(pKnee, { rf: [0.06, 0.12, 0.34, 0.4, -0.05], lh: [0.02, -0.22, -0.4], rh: [0.02, -0.22, 0.4] });
const pBack = tweak(pHold, { pr: [0, 0.48, 0.04], cr: [0, 0.05, -0.04], hd: [0, -0.3, 0], rf: [-0.5, 0.13, 0.36, 1.1, -0.05], lh: [0.24, -0.16, -0.4], rh: [0.24, -0.16, 0.4] });
const pDown = tweak(pKnee, { rf: [0.02, 0.11, 0.06, 0.15, -0.06], lh: [0.03, -0.42, -0.14], rh: [0.03, -0.42, 0.14] });
const poiseKeys = keyed(POISE_DURATION, [[0, pStand], [0.6, pStand], [1.5, pShift], [2.0, pHeel], [2.6, pKnee], [3.4, pHold], [4.6, pHold], [5.6, pBack], [6.8, pBack], [7.8, pHold], [8.6, pDown], [9.2, tweak(pShift, {})], [10.2, pStand]]);
const poiseLoad = curve([[0, 0], [0.6, 0], [1.6, 1], [9.0, 1], [10.1, 0], [POISE_DURATION, 0]]);
export function poiseSpec(t: number): Spec {
  t = mod(t, POISE_DURATION);
  let s = poiseKeys(t);
  const w = (k: number, ph = 0) => sin((2 * PI * k * t) / POISE_DURATION + ph), load = poiseLoad(t), held = smooth(2.4, 3.2, t) * (1 - smooth(8.4, 9.0, t));
  // Small corrections while on one foot: the arms and chest counter the CoM drifting inside the foot.
  s = tweak(s, {
    cr: add(s.cr, [0, 0.012 * w(13, 1) * held, 0.03 * w(9) * held]),
    lh: add(s.lh, [0, 0.04 * w(9, 1) * held, 0]), rh: add(s.rh, [0, -0.04 * w(9, 1) * held, 0]),
  });
  const drift = [0.008 * w(7, 2) * held, 0.006 * w(11) * held];
  return overSupport(s, sp => {
    const L = footCenter(sp.lf), R = footCenter(sp.rf), mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
    return [lerp(mid[0], L[0], load) + drift[0], lerp(mid[1], L[1], load) + drift[1]];
  }, load > 0.98 ? 'rf' : null);
}

// Wave: weight on the left, raise the right arm, wave a few times, lower it.
export const WAVE_DURATION = 6;
const wStand = tweak(base(), { lf: [0, -0.12, 0, 0, 0.1], rf: [0.02, 0.12, 0, 0, -0.1], hd: [0, 0.04, 0] });
const wUp = tweak(wStand, { p: [0, 0.84, -0.02], pr: [0, 0.02, 0.03], cr: [0, 0.0, -0.06], hd: [0, -0.04, -0.12], rh: [0.1, 0.24, 0.28] });
const waveKeys = keyed(WAVE_DURATION, [[0, wStand], [0.6, wStand], [1.3, wUp], [3.8, wUp], [4.6, tweak(wStand, { rh: [0.08, -0.36, 0.1] })], [5.2, wStand]]);
export function waveSpec(t: number): Spec {
  t = mod(t, WAVE_DURATION);
  const s = waveKeys(t), env = smooth(1.0, 1.4, t) * (1 - smooth(3.5, 3.9, t)), o = sin(2 * PI * 1.5 * (t - 1.2));
  s.rh = add(s.rh, [0.02 * o * env, 0, 0.1 * o * env]);
  s.hd = add(s.hd, [0, 0, 0.03 * o * env]);
  return s;
}

// Moves a frame and its props: uniform scale, yaw about the origin (+ turns left), then translate.
export function place(f: Frame, props: Prop[], yaw: number, dx: number, dz: number, scale = 1) {
  const c = cos(yaw), si = sin(yaw);
  const R = (p: V): Vec3 => [p[0] * c + p[2] * si, p[1], -p[0] * si + p[2] * c];
  const P = (p: V): Vec3 => { const r = R(p.map(v => v * scale)); return [r[0] + dx, r[1], r[2] + dz]; };
  const joints = {} as Record<JointName, Vec3>;
  for (const k in f.joints) joints[k as JointName] = P(f.joints[k as JointName]);
  const out: Frame = { ...f, joints };
  if (f.box) out.box = { ...f.box, center: P(f.box.center), yaw: f.box.yaw + yaw, size: f.box.size.map(v => v * scale) as Vec3 };
  if (f.ball) out.ball = P(f.ball);
  if (f.target) out.target = P(f.target);
  if (f.push) out.push = { ...f.push, at: P(f.push.at), dir: R(f.push.dir) };
  return { frame: out, props: props.map(p => ({ ...p, c: P(p.c), ax: p.ax.map(a => R(a.map(v => v * scale))) as [Vec3, Vec3, Vec3] })) };
}

// Time-driven loops built on the above, used by the hero tiles and the rig viewer. root is the placement.
export type Move = 'walkturn' | 'run' | 'carryturn' | 'jump' | 'sit' | 'drill' | 'poise' | 'wave';
export const MOVES: Move[] = ['walkturn', 'run', 'carryturn', 'jump', 'sit', 'drill', 'poise', 'wave'];
export const MOVE_DURATION: Record<Move, number> = { walkturn: 0, run: 0, carryturn: 7.2, jump: 6.6, sit: SIT_DURATION, drill: DRILL_DURATION, poise: POISE_DURATION, wave: WAVE_DURATION };
// props move with the root; world props (an obstacle the robot jumps back and forth over) do not.
export interface Scene { spec: Spec; props: Prop[]; root: [x: number, z: number, yaw: number]; world?: Prop[] }

const LOOP_R = 0.42, LOOP_V = 0.5, LOOP_S = strideFor(LOOP_V, 0);
MOVE_DURATION.walkturn = (2 * PI * LOOP_R) / LOOP_V;
MOVE_DURATION.run = 4 * strideFor(3.2, 1) / 3.2;

// Back and forth along a line with a stepping turn at each end, holding a box.
const CT = { walk: 2.4, turn: 1.2, len: 1.0 }, CS = 0.62;
function lineWalk(t: number, carry: boolean): Scene {
  const D = MOVE_DURATION.carryturn, half = D / 2, leg = mod(t, half), dir = t % D < half ? 1 : -1;
  const acc = 0.4, vmax = CT.len / (CT.walk - acc);
  const dist = (x: number) => (x < acc ? (vmax * x * x) / (2 * acc) : x > CT.walk - acc ? CT.len - (vmax * (CT.walk - x) ** 2) / (2 * acc) : vmax * (x - acc / 2));
  const turnSteps = 2, stepS = 0.16;
  const legPhase = CT.len / CS + turnSteps;
  const base0 = (dir > 0 ? 0 : 1) * legPhase;
  let spec: Spec, x: number, yaw: number;
  if (leg < CT.walk) {
    const d = dist(leg), v = leg < acc ? (vmax * leg) / acc : leg > CT.walk - acc ? (vmax * (CT.walk - leg)) / acc : vmax;
    spec = mixSpec(standSpec(t, carry), gaitSpec(base0 + d / CS, { stride: CS, carry }), smooth(0.02, 0.25, v));
    x = (-CT.len / 2 + d) * dir;
    yaw = dir > 0 ? 0 : PI;
  } else {
    const k = (leg - CT.walk) / CT.turn, e = smooth(0, 1, k);
    spec = mixSpec(standSpec(t, carry), gaitSpec(base0 + CT.len / CS + turnSteps * k, { stride: stepS, carry, lift: 0.7 }), sin(PI * k) ** 0.5);
    x = (CT.len / 2) * dir;
    yaw = (dir > 0 ? 0 : PI) + PI * e;
  }
  return { spec, props: [], root: [x, 0, yaw] };
}

function jumpLoop(t: number): Scene {
  const D = MOVE_DURATION.jump, half = D / 2, k = mod(t, half), dir = t % D < half ? 1 : -1, L = JUMP.length;
  const x0 = (-dir * L) / 2, yaw0 = dir > 0 ? 0 : PI, props: Prop[] = [], world = [jumpObstacle(-JUMP.obstacle.x)];
  if (k < 0.3) return { spec: standSpec(t), props, world, root: [x0, 0, yaw0] };
  if (k < 2.1) return { spec: jumpSpec((k - 0.3) / 1.8), props, world, root: [x0, 0, yaw0] };
  // Stepping turn on the landing spot.
  const u = (k - 2.1) / (half - 2.1);
  const spec = mixSpec(standSpec(t), gaitSpec(2 * u, { stride: 0.14, lift: 0.7 }), sin(PI * clamp(u / 0.95)) ** 0.5);
  return { spec, props, world, root: [x0 + dir * L, 0, yaw0 + PI * smooth(0.05, 0.9, u)] };
}

export function moveScene(m: Move, t: number): Scene {
  const D = MOVE_DURATION[m];
  if (m === 'walkturn') {
    const a = (mod(t, D) / D) * 2 * PI, dist = LOOP_V * mod(t, D);
    return { spec: gaitSpec(dist / LOOP_S, { stride: LOOP_S }), props: [], root: [LOOP_R * sin(a), -LOOP_R * (1 - cos(a)) + LOOP_R, a] };
  }
  if (m === 'run') return { spec: gaitSpec((t * 3.2) / strideFor(3.2, 1), { stride: strideFor(3.2, 1), run: 1 }), props: [], root: [0, 0, 0] };
  if (m === 'carryturn') return lineWalk(mod(t, D), true);
  if (m === 'jump') return jumpLoop(mod(t, D));
  if (m === 'sit') return { spec: sitSpec(t), props: [sitBlock()], root: [0, 0, 0] };
  if (m === 'drill') { const d = drillScene(t); return { spec: d.spec, props: d.props, root: [0, 0, 0] }; }
  if (m === 'poise') return { spec: poiseSpec(t), props: [], root: [0, 0, 0] };
  return { spec: waveSpec(t), props: [], root: [0, 0, 0] };
}
