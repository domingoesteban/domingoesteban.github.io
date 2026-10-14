// Humanoid rig: a generic legged research humanoid (~1.6 m) with keyframed whole-body skills solved by
// two-bone IK. Meters, y up, faces +x, its left is -z, ground y = 0. Forked from prototype-styles/humanoid.ts.
import { clamp, lerp, smooth, mod } from './math';

export type Vec3 = [number, number, number];
export type JointName = 'pelvis' | 'chest' | 'neck' | 'head' | 'lShoulder' | 'lElbow' | 'lHand' | 'rShoulder' | 'rElbow' | 'rHand' | 'lHip' | 'lKnee' | 'lAnkle' | 'lToe' | 'rHip' | 'rKnee' | 'rAnkle' | 'rToe';
export type Skill = 'stand' | 'walk' | 'getup' | 'carry' | 'lift' | 'push' | 'kick' | 'balance' | 'reach';
export interface Frame {
  joints: Record<JointName, Vec3>;
  box?: { center: Vec3; size: Vec3; yaw: number; alpha?: number };
  ball?: Vec3;
  ballAlpha?: number;
  push?: { at: Vec3; dir: Vec3; strength: number };
  target?: Vec3;
  targetAlpha?: number;
  speed: number;
}
export interface Camera { yaw: number; pitch: number; dist: number; target: Vec3; fov?: number }

export const SKILLS: Skill[] = ['stand', 'walk', 'getup', 'carry', 'lift', 'push', 'kick', 'balance', 'reach'];
export const DURATION: Record<Skill, number> = { stand: 6, walk: 2.2, getup: 12, carry: 2.4, lift: 9, push: 8, kick: 6, balance: 10, reach: 8 };
const SPEED: Partial<Record<Skill, number>> = { walk: 0.8, carry: 0.6 };
export const BALL_RADIUS = 0.11;
export const BOX_SIZE: Vec3 = [0.34, 0.44, 0.36];

const SPINE = 0.28, UPPER = 0.2, NECK = 0.17, SHOULDER = 0.19, HIP = 0.1;
const ARM = [0.28, 0.26], LEG = [0.4, 0.39], ANKLE = 0.07, HEEL = -0.06, TOE = 0.15;
const CARRY_AT = [0.3, -0.14, 0];

type V = number[];
const { sin, cos, sqrt, PI, max, min, abs, exp, atan2, acos } = Math;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => sqrt(dot(a, a));
const norm = (a: V) => mul(a, 1 / (len(a) || 1));
const mix = (a: V, b: V, w: number) => a.map((v, i) => v + (b[i] - v) * w);
export const hermite = (p0: number, p1: number, m0: number, m1: number, u: number) =>
  (2 * u ** 3 - 3 * u * u + 1) * p0 + (u ** 3 - 2 * u * u + u) * m0 + (3 * u * u - 2 * u ** 3) * p1 + (u ** 3 - u * u) * m1;

// Rotation from [yaw (+ turns left), pitch (+ leans forward), roll (+ leans right)].
type Mat = number[];
const mm = (a: Mat, b: Mat): Mat => a.map((_, i) => { const r = i - (i % 3), c = i % 3; return a[r] * b[c] + a[r + 1] * b[c + 3] + a[r + 2] * b[c + 6]; });
const ap = (m: Mat, v: V): V => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function rot([y, p, r]: V): Mat {
  const cy = cos(y), sy = sin(y), cp = cos(p), sp = sin(p), cr = cos(r), sr = sin(r);
  return mm(mm([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [cp, sp, 0, -sp, cp, 0, 0, 0, 1]), [1, 0, 0, 0, cr, -sr, 0, sr, cr]);
}

// Periodic monotone cubic (PCHIP): C1, passes through keys, never overshoots a hold.
export function pchip(ts: number[], vs: number[], D: number, t: number) {
  const n = ts.length, T = (k: number) => ts[mod(k, n)] + D * Math.floor(k / n), Y = (k: number) => vs[mod(k, n)];
  let i = -1;
  while (i < n - 1 && T(i + 1) <= t) i++;
  const slope = (k: number) => (Y(k + 1) - Y(k)) / (T(k + 1) - T(k));
  const tan = (k: number) => {
    const d0 = slope(k - 1), d1 = slope(k), h0 = T(k) - T(k - 1), h1 = T(k + 1) - T(k);
    return d0 * d1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  };
  const h = T(i + 1) - T(i);
  return hermite(Y(i), Y(i + 1), tan(i) * h, tan(i + 1) * h, (t - T(i)) / h);
}

// High-level pose: pelvis position and [yaw, pitch, roll] rotations (chest relative to pelvis, head to chest),
// feet [x, z, lift, pitch, yaw] (pitch + lifts the heel), hands as offsets from the shoulder in the chest frame,
// optional world hand targets [x, y, z, weight], box [x, y, z, yaw, hold (follow chest), grip].
export type Spec = Record<'p' | 'pr' | 'cr' | 'hd' | 'lf' | 'rf' | 'lh' | 'rh' | 'lw' | 'rw', V> & { box?: V; ball?: V };

export const base = (): Spec => ({
  p: [0, 0.845, 0], pr: [0, 0.03, 0], cr: [0, 0.02, 0], hd: [0, 0, 0],
  lf: [0, -0.11, 0, 0, 0.06], rf: [0, 0.11, 0, 0, -0.06],
  lh: [0.03, -0.49, -0.04], rh: [0.03, -0.49, 0.04], lw: [0, 0, 0, 0], rw: [0, 0, 0, 0],
});
export const tweak = (s: Spec, o: Partial<Spec>): Spec => ({ ...s, ...o });

function mirror(s: Spec): Spec {
  const r = (v: V) => [-v[0], v[1], -v[2]];
  const f = (v: V) => [v[0], -v[1], v[2], v[3], -v[4]];
  const out: Spec = {
    p: [s.p[0], s.p[1], -s.p[2]], pr: r(s.pr), cr: r(s.cr), hd: r(s.hd), lf: f(s.rf), rf: f(s.lf),
    lh: [s.rh[0], s.rh[1], -s.rh[2]], rh: [s.lh[0], s.lh[1], -s.lh[2]],
    lw: [s.rw[0], s.rw[1], -s.rw[2], s.rw[3]], rw: [s.lw[0], s.lw[1], -s.lw[2], s.lw[3]],
  };
  if (s.box) out.box = [s.box[0], s.box[1], -s.box[2], -s.box[3], s.box[4], s.box[5]];
  return out;
}

export function keyed(D: number, keys: [number, Spec][], mirrored = false) {
  if (mirrored) keys = [...keys, ...keys.map(([t, s]): [number, Spec] => [t + D / 2, mirror(s)])];
  const ts = keys.map(k => k[0]), fields = Object.keys(keys[0][1]) as (keyof Spec)[];
  return (t: number) => {
    const out = {} as Spec;
    for (const f of fields) out[f] = keys[0][1][f]!.map((_, i) => pchip(ts, keys.map(k => k[1][f]![i]), D, t));
    return out;
  };
}

// soft > 0 eases the chain into full extension over the last `soft` meters, so an out-of-reach target does not
// snap the elbow straight and back.
function ik(root: V, target: V, [a, b]: number[], pole: V, floor: number, soft = 0): [V, V] {
  const v = sub(target, root), d0 = len(v), dir = d0 > 1e-6 ? mul(v, 1 / d0) : [0, -1, 0];
  const top = (a + b) * 0.9995, knee = top - soft;
  const d = clamp(soft > 0 && d0 > knee ? top - soft * exp(-(d0 - knee) / soft) : d0, abs(a - b) + 0.02, top);
  const ca = (a * a + d * d - b * b) / (2 * a * d), r = a * sqrt(max(0, 1 - ca * ca)), c = add(root, mul(dir, a * ca));
  let u = sub(pole, mul(dir, dot(pole, dir)));
  if (len(u) < 1e-6) u = cross(dir, [0, 0, 1]);
  u = norm(u);
  const w = cross(dir, u), A = u[1] * r, B = w[1] * r;
  let phi = 0;
  if (c[1] + A < floor) {
    const al = atan2(B, A), k = (floor - c[1]) / (sqrt(A * A + B * B) || 1);
    if (k >= 1) phi = al;
    else { const p1 = mod(al + acos(k) + PI, 2 * PI) - PI, p2 = mod(al - acos(k) + PI, 2 * PI) - PI; phi = abs(p1) < abs(p2) ? p1 : p2; }
  }
  return [add(c, add(mul(u, r * cos(phi)), mul(w, r * sin(phi)))), add(root, mul(dir, d))];
}

// Rigid foot: pivots on the heel when the toes are up and on the toes when the heel is up, so contacts never skate.
function foot([x, z, lift, pitch, yaw]: V) {
  const R = rot([yaw, pitch, 0]), px = lerp(HEEL, TOE, smooth(-0.2, 0.2, pitch));
  const sole = sub(add([x, lift, z], ap(rot([yaw, 0, 0]), [px, 0, 0])), ap(R, [px, 0, 0]));
  return { ankle: add(sole, ap(R, [0, ANKLE, 0])), toe: add(sole, ap(R, [TOE, 0.025, 0])), fwd: ap(R, [1, 0, 0]) };
}

function perturbed(s: Spec, [x, y, z]: Vec3): Spec {
  const m = min(1, 0.25 / (Math.hypot(x, y, z) || 1)), [px, py, pz] = [x * m, y * m, z * m], a = Math.hypot(px, pz);
  return tweak(s, {
    p: add(s.p, [px * 0.3, py * 0.3 - a * 0.15, pz * 0.3]),
    pr: add(s.pr, [0, px * 0.3, pz * 0.3]),
    cr: add(s.cr, [0, px * 1.1, pz * 1.1]),
    hd: add(s.hd, [0, -px * 1.2, -pz * 1.2]),
    lh: add(s.lh, [-px * 0.6, abs(pz) * 0.6, -pz * 0.6 - a * 0.5]),
    rh: add(s.rh, [-px * 0.6, abs(pz) * 0.6, -pz * 0.6 + a * 0.5]),
  });
}

export function solve(s: Spec, perturb?: Vec3): Frame {
  if (perturb) s = perturbed(s, perturb);
  const Lf = foot(s.lf), Rf = foot(s.rf), Rp = rot(s.pr), p = [...s.p];
  const hip = (side: number) => add(p, ap(Rp, [0, 0, side * HIP]));
  const over = (h: V, an: V) => { const Lm = (LEG[0] + LEG[1]) * 0.985, d = Math.hypot(h[0] - an[0], h[2] - an[2]); return h[1] - an[1] - sqrt(max(0, Lm * Lm - d * d)); };
  const k = 0.008, drop = k * Math.log(1 + exp(over(hip(-1), Lf.ankle) / k) + exp(over(hip(1), Rf.ankle) / k));
  p[1] -= min(drop, max(0, p[1] - 0.1));
  const Rc = mm(Rp, rot(s.cr)), chest = add(p, ap(mm(Rp, rot(mul(s.cr, 0.5))), [0, SPINE, 0]));
  const neck = add(chest, ap(Rc, [0, UPPER, 0])), head = add(neck, ap(mm(Rc, rot(s.hd)), [0, NECK, 0]));
  const shoulder = (side: number) => add(neck, ap(Rc, [0, 0, side * SHOULDER]));
  const f: Frame = { joints: {} as Record<JointName, Vec3>, speed: 0 };
  let grip = (_side: number): V | null => null, gw = 0;
  if (s.box) {
    const [bx, by, bz, byaw, hold] = s.box, cf = ap(Rc, [1, 0, 0]);
    const cyaw = atan2(-cf[2], cf[0]), center = mix([bx, by, bz], add(chest, ap(rot([cyaw, 0, 0]), CARRY_AT)), hold), yaw = lerp(byaw, cyaw, hold);
    f.box = { center: center as Vec3, size: [...BOX_SIZE], yaw };
    grip = side => add(center, ap(rot([yaw, 0, 0]), [0, 0.08, side * (BOX_SIZE[2] / 2 + 0.015)]));
    gw = s.box[5];
  }
  if (s.ball) f.ball = s.ball as Vec3;
  const arm = (side: number, local: V, world: V) => {
    const sh = shoulder(side);
    let t = mix(add(sh, ap(Rc, local)), world, world[3]);
    const g = grip(side);
    if (g) t = mix(t, g, gw);
    t[1] = max(t[1], 0.03);
    return [sh, ...ik(sh, t, ARM, ap(Rc, [-0.4, -0.85, side * 0.25]), 0.03, 0.04)];
  };
  const leg = (side: number, F: ReturnType<typeof foot>) => {
    const h = hip(side), [knee, ankle] = ik(h, F.ankle, LEG, add(ap(Rp, [1, 0.5, side * 0.15]), mul(F.fwd, 0.5)), 0.035);
    return [h, knee, ankle, add(ankle, sub(F.toe, F.ankle))];
  };
  const J = f.joints as Record<JointName, V>;
  [J.lShoulder, J.lElbow, J.lHand] = arm(-1, s.lh, s.lw);
  [J.rShoulder, J.rElbow, J.rHand] = arm(1, s.rh, s.rw);
  [J.lHip, J.lKnee, J.lAnkle, J.lToe] = leg(-1, Lf);
  [J.rHip, J.rKnee, J.rAnkle, J.rToe] = leg(1, Rf);
  Object.assign(J, { pelvis: p, chest, neck, head });
  if (f.box && s.box![4] > 0) f.box.center = mix(f.box.center, sub(mul(add(J.lHand, J.rHand), 0.5), [0, 0.08, 0]), gw * smooth(0, 0.15, s.box![4])) as Vec3;
  return f;
}

// Treadmill gait: stance feet slide back at exactly v, swing is a C1 Hermite return with heel-toe roll.
const GAIT = { t: [0, 0.1, 0.42, 0.62, 0.78, 0.93], pitch: [-0.25, 0, 0, 0.62, 0.12, -0.22] };
function gait(t: number, v: number, T: number, carrying: boolean): Spec {
  const ph = t / T, S = v * T, B = 0.62, s = base();
  const leg = (phase: number, side: number) => {
    const u = mod(phase, 1), q = (u - B) / (1 - B);
    const x = u < B ? S * (B / 2 - u) : hermite(-S * B / 2, S * B / 2, -S * (1 - B), -S * (1 - B), q);
    const lift = u < B ? 0 : (carrying ? 0.06 : 0.075) * sin(PI * q) ** 2;
    return [x, side * 0.105, lift, pchip(GAIT.t, GAIT.pitch, 1, u) * (carrying ? 0.8 : 1), -side * 0.05];
  };
  const c = cos(2 * PI * ph), w = sin(2 * PI * ph), c2 = cos(4 * PI * ph);
  s.lf = leg(ph, -1);
  s.rf = leg(ph + 0.5, 1);
  s.p = [0.01 * c2, 0.838 - 0.012 * c2, -0.026 * w];
  s.pr = [-0.08 * c, 0.07, 0.035 * w];
  s.cr = [carrying ? 0.09 * c : 0.14 * c, carrying ? -0.08 : 0.02, -0.045 * w];
  s.hd = [-0.06 * c, carrying ? 0.12 : 0.03, 0.01 * w];
  const swing = (k: number) => [0.05 + 0.15 * k, -0.47 + 0.05 * k * k, 0];
  s.lh = add(swing(-cos(2 * PI * ph - 0.25)), [0, 0, -0.06]);
  s.rh = add(swing(cos(2 * PI * ph - 0.25)), [0, 0, 0.06]);
  if (carrying) s.box = [0, 0, 0, 0, 1, 1];
  return s;
}

function stand(t: number): Spec {
  const w = (2 * PI * t) / DURATION.stand, sw = sin(w), s = base();
  s.p = [0.006 * sin(2 * w), 0.845 + 0.004 * sin(3 * w) - 0.006 * sw * sw, -0.03 * sw];
  s.pr = [0.03 * sin(w + 0.5), 0.03, 0.025 * sw];
  s.cr = [-0.04 * sin(w + 0.5), 0.02 - 0.012 * sin(3 * w), -0.035 * sw];
  s.hd = [0.3 * sin(w + 1.2) ** 3, 0.04 + 0.04 * sin(2 * w), 0.015 * sw];
  s.lh = [0.03 + 0.012 * sin(3 * w + 1), -0.49, -0.04 - 0.008 * sw];
  s.rh = [0.03 + 0.012 * sin(3 * w + 1), -0.49, 0.04 - 0.008 * sw];
  return s;
}

const S0 = base();

// getup: supine, sit up, rock forward into a supported squat, kneel on the right knee, stand, and reverse.
const lie = tweak(S0, {
  p: [-0.45, 0.11, 0], pr: [0, -1.5, 0], cr: [0, 0, 0], hd: [0, 0.05, 0],
  lf: [0.44, -0.13, 0, -1.45, 0.15], rf: [0.44, 0.13, 0, -1.45, -0.15],
  lw: [-0.42, 0.05, -0.28, 1], rw: [-0.42, 0.05, 0.28, 1],
});
const curl = tweak(lie, {
  pr: [0, -1.0, 0], cr: [0, 0.5, 0], hd: [0, 0.35, 0], lf: [0.3, -0.13, 0, -0.9, 0.12], rf: [0.3, 0.13, 0, -0.9, -0.12],
  lh: [0.42, -0.2, -0.02], rh: [0.42, -0.2, 0.02], lw: [-0.3, 0.1, -0.3, 0], rw: [-0.3, 0.1, 0.3, 0],
});
const sit = tweak(curl, {
  pr: [0, -0.35, 0], cr: [0, 0.35, 0], hd: [0, 0.15, 0], lf: [-0.02, -0.13, 0, 0, 0.12], rf: [-0.02, 0.13, 0, 0, -0.12],
  lh: [0.38, -0.3, 0], rh: [0.38, -0.3, 0],
});
const crouch = tweak(sit, {
  p: [-0.14, 0.36, 0], pr: [0, 0.85, 0], cr: [0, 0.35, 0], hd: [0, -0.45, 0],
  lw: [0.3, 0.04, -0.26, 1], rw: [0.3, 0.04, 0.26, 1],
});
const tuck = tweak(crouch, { p: [-0.22, 0.4, 0], pr: [0, 0.6, 0], rf: [-0.42, 0.14, 0.1, 0.6, -0.1], rw: [0.25, 0.1, 0.3, 0.6], lw: [0.25, 0.05, -0.26, 0.8] });
const kneel = tweak(tuck, {
  p: [-0.3, 0.46, 0], pr: [0, 0.12, 0], cr: [0, 0.05, 0], hd: [0, 0.1, 0], rf: [-0.76, 0.13, 0, 1.1, -0.05],
  lw: [0.0, 0.53, -0.15, 1], rw: [0.25, 0.1, 0.3, 0], rh: [0.08, -0.45, 0.08],
});
const rise = tweak(kneel, { p: [-0.14, 0.66, -0.03], pr: [0, 0.45, 0], lw: [0.06, 0.5, -0.16, 0.5], lh: [0.12, -0.45, -0.05] });
const stepUp = tweak(rise, { p: [-0.06, 0.8, -0.05], pr: [0, 0.15, 0], rf: [-0.35, 0.12, 0.1, 0.25, -0.05], lw: [0.06, 0.5, -0.16, 0] });
const upright = tweak(S0, { p: [-0.02, 0.845, -0.005], lf: sit.lf, rf: [-0.02, 0.12, 0, 0, -0.06] });

// lift: squat with a straight back, grip, stand with the box at the chest, turn, put it down, release.
// The box rests where the lift picks it up and puts it down.
export const BOX_REST = [0.36, BOX_SIZE[1] / 2, 0];
const lift0 = tweak(S0, { lf: [0.04, -0.2, 0, 0, 0.28], rf: [0.04, 0.2, 0, 0, -0.28], hd: [0, 0.35, 0], box: [...BOX_REST, 0, 0, 0] });
const squat = tweak(lift0, { p: [-0.08, 0.46, 0], pr: [0, 0.8, 0], cr: [0, 0.15, 0], hd: [0, -0.5, 0], lh: [0.3, -0.38, -0.1], rh: [0.3, -0.38, 0.1] });
const grab = tweak(squat, { box: [...BOX_REST, 0, 0, 1] });
const hold = tweak(lift0, { p: [-0.03, 0.835, 0], hd: [0, 0.1, 0], box: [...BOX_REST, 0, 1, 1] });
const turn = tweak(hold, { pr: [0.12, 0.03, 0], cr: [0.3, 0.02, 0], hd: [0.15, 0.1, 0] });
const release = tweak(squat, { lh: [0.25, -0.3, -0.16], rh: [0.25, -0.3, 0.16] });

// push: a lateral shove at the chest, two recovery steps, settle; the second half mirrors it.
const PUSH_T = 1.1, PUSH_DIR = norm([-0.25, 0, 1]) as Vec3;
const pA = tweak(S0, { p: [0, 0.845, -0.11], lf: [0, -0.24, 0, 0, 0.06], rf: [0, 0.02, 0, 0, -0.06] });
const pHit = tweak(pA, { p: [-0.03, 0.83, -0.02], pr: [0, -0.04, 0.1], cr: [0, -0.06, 0.16], hd: [0, 0.05, -0.2], lh: [0.05, -0.22, -0.32], rh: [0.12, -0.32, 0.3] });
const pStep = tweak(pHit, { p: [-0.04, 0.8, 0.08], pr: [0, 0, 0.05], cr: [0, 0, 0.04], rf: [-0.05, 0.14, 0.09, 0.05, -0.1] });
const pLand = tweak(pStep, { p: [-0.02, 0.8, 0.13], pr: [0, 0.03, -0.04], cr: [0, 0.02, -0.06], hd: [0, 0.05, 0.05], rf: [0, 0.24, 0, 0, -0.06], lh: [0.08, -0.38, -0.12], rh: [0.06, -0.4, 0.14] });
const pFollow = tweak(pLand, { p: [-0.01, 0.82, 0.12], lf: [-0.02, -0.11, 0.07, 0.1, 0.06] });
const pB = tweak(S0, { p: [0, 0.845, 0.11], lf: [0, -0.02, 0, 0, 0.06], rf: pLand.rf });

// kick: the ball rolls in, plant the left foot, wind up, strike with the right, follow through, step back.
const KICK_T = 3.0;
const k0 = tweak(S0, { p: [-0.15, 0.845, 0], lf: [-0.15, -0.11, 0, 0, 0.06], rf: [-0.15, 0.11, 0, 0, -0.06], hd: [0, 0.25, 0] });
const kStep = tweak(k0, { p: [0.0, 0.83, -0.04], lf: [0.08, -0.13, 0.08, 0.1, 0.05], hd: [0, 0.45, 0] });
const kPlant = tweak(kStep, { p: [0.16, 0.82, -0.09], pr: [0, 0.08, -0.04], lf: [0.22, -0.17, 0, 0, 0.05], lh: [0.12, -0.42, -0.18], rh: [-0.1, -0.42, 0.12] });
const kBack = tweak(kPlant, { p: [0.18, 0.81, -0.1], pr: [0, 0.02, -0.06], cr: [0.2, -0.05, 0], rf: [-0.25, 0.07, 0.22, 0.75, -0.02], lh: [0.25, -0.3, -0.3], rh: [-0.22, -0.38, 0.18] });
const kHit = tweak(kBack, { pr: [0, -0.05, -0.06], cr: [-0.15, 0.02, 0], rf: [0.24, 0.07, 0.05, 0.4, -0.02], lh: [-0.05, -0.32, -0.32], rh: [0.2, -0.38, 0.14] });
const kFollow = tweak(kHit, { p: [0.19, 0.82, -0.09], pr: [0, -0.15, -0.05], cr: [-0.25, 0.05, 0], rf: [0.62, 0.06, 0.3, 0.1, -0.02], lh: [-0.15, -0.35, -0.3], rh: [0.3, -0.3, 0.12] });
const kDown = tweak(kFollow, { p: [0.28, 0.835, -0.02], pr: [0, 0.03, 0], cr: [0, 0.02, 0], rf: [0.36, 0.11, 0, 0, -0.06], lh: S0.lh, rh: S0.rh, hd: [0, 0.15, 0] });
const kBack1 = tweak(kDown, { p: [0.08, 0.83, 0.03], rf: [0.1, 0.11, 0.07, 0.1, -0.06] });
const kBack2 = tweak(kBack1, { p: [-0.1, 0.835, 0.0], rf: k0.rf, lf: [0.1, -0.12, 0.07, 0.1, 0.06] });

// balance: shift onto the left leg, arms out, the free leg traces forward, side and back; then the other leg.
const b1 = tweak(S0, { p: [0.01, 0.84, -0.1], pr: [0, 0.03, 0.03], cr: [0, 0.02, -0.03] });
const bArms = { lh: [0.02, -0.2, -0.44], rh: [0.02, -0.2, 0.44] };
const bLift = tweak(b1, { ...bArms, rf: [0.04, 0.12, 0.12, 0.25, -0.04] });
const bKnee = tweak(bLift, { rf: [0.26, 0.12, 0.34, 0.5, -0.04], pr: [0, -0.02, 0.02], hd: [0, 0.1, 0] });
const bSide = tweak(bKnee, { p: [0.0, 0.84, -0.13], pr: [0, 0.03, -0.12], cr: [0, 0.02, 0.1], rf: [0.02, 0.48, 0.2, 0.3, -0.25], lh: [0.02, -0.12, -0.46] });
const bBack = tweak(bSide, { p: [0.05, 0.82, -0.1], pr: [0, 0.4, 0.02], cr: [0, -0.1, -0.02], hd: [0, -0.3, 0], rf: [-0.48, 0.13, 0.3, 0.9, -0.04], lh: [0.2, -0.18, -0.42], rh: [0.2, -0.18, 0.42] });
const bDown = tweak(bLift, { pr: [0, 0.03, 0.02], hd: S0.hd, lh: [0.04, -0.4, -0.2], rh: [0.04, -0.4, 0.2] });

// reach: step forward right into a lunge and reach a low target with the right hand; then mirrored to the left.
const REACH = [0.8, 0.24, 0.36];
const r1 = tweak(S0, { p: [0.0, 0.835, -0.05], hd: [-0.3, 0.35, 0], rw: [...REACH, 0] });
const rLift = tweak(r1, { rf: [0.24, 0.17, 0.08, 0.05, -0.15] });
const rStep = tweak(rLift, { p: [0.18, 0.76, 0.06], pr: [-0.2, 0.25, 0.03], hd: [-0.2, 0.3, 0], rf: [0.5, 0.22, 0, 0, -0.25], rh: [0.2, -0.4, 0.08] });
const rLow = tweak(rStep, { p: [0.24, 0.5, 0.1], pr: [-0.35, 0.8, 0.08], cr: [-0.1, 0.4, 0.05], hd: [-0.1, -0.15, 0], lf: [0, -0.11, 0, 0.6, 0.06], rw: [...REACH, 1], lh: [-0.05, -0.45, -0.1] });
const rTouch = tweak(rLow, { p: [0.25, 0.48, 0.11], cr: [-0.12, 0.45, 0.05] });
const rUp = tweak(rStep, { hd: [0, 0.1, 0] });

const balance = keyed(10, [[0, S0], [0.3, S0], [1.0, b1], [1.5, bLift], [2.3, bKnee], [3.1, bSide], [3.9, bBack], [4.35, bDown], [4.75, b1]], true);
// Small balance corrections, integer harmonics of the loop so it stays seamless.
function wobble(s: Spec, t: number): Spec {
  const w = (k: number, ph = 0) => sin((2 * PI * k * t) / DURATION.balance + ph), arms = 0.03 * w(9, 1);
  return tweak(s, {
    p: add(s.p, [0.005 * w(9, 2), 0, 0.006 * w(7) + 0.004 * w(13, 1)]),
    cr: add(s.cr, [0, 0.01 * w(11, 2), 0.025 * w(11)]),
    lh: add(s.lh, [0, arms, 0]), rh: add(s.rh, [0, -arms, 0]),
  });
}

const SPECS: Record<Skill, (t: number) => Spec> = {
  stand,
  walk: t => gait(t, SPEED.walk!, DURATION.walk / 2, false),
  carry: t => gait(t, SPEED.carry!, DURATION.carry / 2, true),
  getup: keyed(12, [[0, lie], [1, lie], [1.7, curl], [2.5, sit], [3.4, crouch], [3.85, tuck], [4.4, kneel], [5.1, rise], [5.5, stepUp], [6, upright],
    [8, upright], [8.4, stepUp], [8.85, rise], [9.4, kneel], [9.85, tuck], [10.3, crouch], [10.9, sit], [11.35, curl], [11.85, lie]]),
  lift: keyed(9, [[0, lift0], [0.8, lift0], [1.9, squat], [2.4, grab], [3.6, hold], [4.4, turn], [4.9, turn], [5.7, hold], [6.8, grab], [7.2, release], [8.2, lift0]]),
  push: keyed(8, [[0, pA], [PUSH_T, pA], [1.3, pHit], [1.47, pStep], [1.62, pLand], [1.95, pLand], [2.15, pFollow], [2.35, pB]], true),
  kick: keyed(6, [[0, k0], [1.7, k0], [2.0, kStep], [2.3, kPlant], [2.72, kBack], [KICK_T, kHit], [3.24, kFollow], [3.85, kDown], [4.4, kBack1], [4.75, kBack1], [5.15, kBack2], [5.5, k0]]),
  balance: t => wobble(balance(t), t),
  reach: keyed(8, [[0, S0], [0.4, S0], [0.85, r1], [1.1, rLift], [1.4, rStep], [2.05, rLow], [2.45, rTouch], [2.75, rLow], [3.25, rUp], [3.5, rLift], [3.75, r1], [3.98, S0]], true),
};

// Pose spec of a skill at time t, for companion modules that blend or extend skills before solving.
export const skillSpec = (skill: Skill, t: number): Spec => SPECS[skill](mod(t, DURATION[skill]));

// The ball is passed in from the robot's left, stops in front of its right foot, and is passed back out diagonally.
function ballAt(t: number): V {
  const roll = 1 - min(t, 2) / 2, k = t - KICK_T, out = 4.5 * (1 - exp(-max(0, k) / 1.1));
  if (k < 0) return [0.5, BALL_RADIUS, 0.08 - 4.6 * roll * roll];
  return [0.5 + 0.8 * out, BALL_RADIUS + 0.12 * sin(PI * min(k / 0.45, 1)), 0.08 - 0.6 * out];
}

// The shove of the push skill at clock t: its direction and strength, or null between shoves.
export function pushAt(t: number) {
  const D = DURATION.push, tt = mod(t, D), u = tt % (D / 2), strength = smooth(PUSH_T - 0.35, PUSH_T, u) * (1 - smooth(PUSH_T, PUSH_T + 0.18, u));
  const dir: Vec3 = tt >= D / 2 ? [PUSH_DIR[0], 0, -PUSH_DIR[2]] : PUSH_DIR;
  return strength > 0 ? { dir, strength } : null;
}

export function pose(skill: Skill, t: number, opts: { perturb?: Vec3 } = {}): Frame {
  const D = DURATION[skill], tt = mod(t, D), s = SPECS[skill](tt);
  if (skill === 'kick') s.ball = ballAt(tt);
  const f = solve(s, opts.perturb);
  f.speed = SPEED[skill] ?? 0;
  if (skill === 'push') { const p = pushAt(tt); if (p) f.push = { at: sub(f.joints.chest, mul(p.dir, 0.12)) as Vec3, ...p }; }
  if (skill === 'reach') {
    const u = tt % (D / 2);
    f.target = [REACH[0], REACH[1], tt >= D / 2 ? -REACH[2] : REACH[2]];
    f.targetAlpha = smooth(0.1, 0.6, u) * (1 - smooth(3.4, 3.9, u));
  }
  return f;
}

const TREE: [JointName, JointName][] = [
  ['pelvis', 'lHip'], ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['lAnkle', 'lToe'], ['pelvis', 'rHip'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle'], ['rAnkle', 'rToe'],
  ['pelvis', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['neck', 'lShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lHand'],
  ['neck', 'rShoulder'], ['rShoulder', 'rElbow'], ['rElbow', 'rHand'],
];

// Blends bone directions down the tree, so segment lengths stay exact mid-transition.
export function blend(a: Frame, b: Frame, w: number): Frame {
  const A = a.joints, B = b.joints, J = { pelvis: mix(A.pelvis, B.pelvis, w) } as Record<JointName, V>;
  for (const [p, c] of TREE) {
    const da = sub(A[c], A[p]), db = sub(B[c], B[p]), m = mix(da, db, w);
    J[c] = add(J[p], len(m) > 1e-6 ? mul(norm(m), len(da)) : da);
  }
  const lowest = min(0, ...Object.values(J).map(v => v[1]));
  for (const k in J) J[k as JointName] = [J[k as JointName][0], J[k as JointName][1] - lowest, J[k as JointName][2]];
  const f: Frame = { joints: J as Record<JointName, Vec3>, speed: lerp(a.speed, b.speed, w) };
  if (a.box && b.box) f.box = { center: mix(a.box.center, b.box.center, w) as Vec3, size: a.box.size, yaw: lerp(a.box.yaw, b.box.yaw, w), alpha: lerp(a.box.alpha ?? 1, b.box.alpha ?? 1, w) };
  else if (a.box || b.box) f.box = { ...(a.box ?? b.box)!, alpha: ((a.box ?? b.box)!.alpha ?? 1) * (a.box ? 1 - w : w) };
  const prop = (pa: Vec3 | undefined, pb: Vec3 | undefined, aa = 1, ab = 1): [Vec3 | undefined, number] =>
    pa && pb ? [mix(pa, pb, w) as Vec3, lerp(aa, ab, w)] : pa ? [pa, aa * (1 - w)] : [pb, ab * w];
  [f.ball, f.ballAlpha] = prop(a.ball, b.ball, a.ballAlpha, b.ballAlpha);
  [f.target, f.targetAlpha] = prop(a.target, b.target, a.targetAlpha, b.targetAlpha);
  if (!f.ball) delete f.ballAlpha;
  if (!f.target) delete f.targetAlpha;
  const push = a.push ?? b.push;
  if (push) f.push = { ...push, strength: push.strength * (a.push ? 1 - w : w) };
  return f;
}

export function project(p: Vec3, cam: Camera, width: number, height: number): [x: number, y: number, depth: number] {
  const cp = cos(cam.pitch), eye = add(cam.target, mul([cp * cos(cam.yaw), sin(cam.pitch), cp * sin(cam.yaw)], cam.dist));
  const fw = norm(sub(cam.target, eye)), right = norm(cross(fw, [0, 1, 0])), up = cross(right, fw), d = sub(p, eye);
  const z = max(dot(d, fw), 1e-3), focal = height / 2 / Math.tan((cam.fov ?? 0.6) / 2);
  return [width / 2 + (dot(d, right) * focal) / z, height / 2 - (dot(d, up) * focal) / z, z];
}
