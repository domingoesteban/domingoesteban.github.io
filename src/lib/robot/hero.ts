// Hero: a 3x3 grid of tiles, each learning its own skill. Early attempts are faint, wobble and sometimes fall,
// then converge. On scroll the grid collapses into the selected tile, which becomes the follower.
import { blend, type Camera, type Vec3 } from './rig';
import { place, type Prop } from './skills';
import { TASK, LIE, live, facing } from './tasks';
import { HERO } from './story';
import { F, secProps } from './follower';
import { FOL_PITCH, FOL_TARGET, FOV, YAW, P, grow, layout, lerpRect, makeView, type Rect } from './camera';
import { drawFigure, drawProps, faded, polyline } from './draw';
import { caption, ring } from './overlay';
import { pal, col } from './palette';
import { addv, lerp, rnd, smooth, stepSpring, TAU } from './math';

const { min, max, sin, cos, exp, log, floor } = Math;
type G = CanvasRenderingContext2D;

const GRID = 1.95, TILE = 1.75; // tile spacing and size (m)
const LEARN = 14; // seconds from a tile's t0 until it has converged
const SEL = HERO.selected;

// Points the hero camera has to frame: the outer tile corners on the ground and heads above the outer tiles.
export const heroPts: Vec3[] = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) heroPts.push([sx * (GRID + TILE * 0.36), 0, sz * (GRID + TILE * 0.36)], [sx * GRID, 1.7, sz * GRID]);

// p is the learning progress (0.2 at first, 1 converged); sp is the pointer nudge spring; sx, sy the screen pelvis.
export const envs = HERO.tiles.map((tile, i) => ({
  ...tile, i, gx: (floor(i / 3) - 1) * GRID, gz: ((i % 3) - 1) * GRID,
  clock: rnd() * TASK[tile.task].D, rate: 0.82 + rnd() * 0.34, ph: rnd() * TAU,
  fallT: -1, from: LIE, fallTo: LIE, flash: 0, p: 0, frame: LIE, props: [] as Prop[], sx: 0, sy: 0,
  sp: { x: 0, z: 0, vx: 0, vz: 0 },
}));
type Env = typeof envs[number];

export const stepEnv = (e: Env, dt: number, c: number, time: number) => {
  e.flash = max(0, e.flash - dt * 1.1);
  e.p = layout.reduced ? 1 : max(e.p, lerp(0.2, 1, smooth(e.t0, e.t0 + LEARN, time)));
  if (c > 0.02) e.p = min(1, e.p + dt * 0.6);
  stepSpring(e.sp, dt);
  // Falling: blend into lying down, then restart the task with a flash of the tile.
  if (e.fallT >= 0) {
    e.fallT += dt;
    const w = min(1, e.fallT / 0.85);
    e.frame = blend(e.from, e.fallTo, w * w);
    if (e.fallT > 1.6) { e.fallT = -1; e.clock = 0.05; e.flash = 1; }
    return;
  }
  const D = TASK[e.task].D, prev = e.clock, q = 1 - e.p;
  e.clock += dt * lerp(e.rate, 1, e.p);
  const wob: Vec3 = [0.13 * q * sin(time * 1.9 + e.ph) + e.sp.x, 0, 0.15 * q * sin(time * 2.6 + 2 * e.ph) + e.sp.z];
  const l = live(e.task, e.clock, wob);
  e.frame = l.frame; e.props = l.props;
  const risk = 0.75 * q ** 1.5;
  for (const t of TASK[e.task].risk) {
    if (prev < t && e.clock >= t && rnd() < risk) {
      e.fallT = 0; e.from = e.frame;
      const yaw = facing(e.frame), pel = e.frame.joints.pelvis;
      e.fallTo = place(LIE, [], yaw, pel[0] + 0.3 * cos(yaw), pel[2] - 0.3 * sin(yaw)).frame;
    }
  }
  if (e.clock >= D) e.clock -= D;
};

// Steps every tile except the selected one, which is driven by the follower.
export const stepHero = (dt: number, c: number, time: number) => { for (const e of envs) if (e.i !== SEL) stepEnv(e, dt, c, time); };

// Hero grid, collapsing into the selected tile as c goes 0 -> 1 (ce is c eased). sr is the stage rect.
// Returns the rect the pointer can nudge.
export function renderHero(g: G, lg: G, c: number, ce: number, sr: Rect): Rect {
  const { heroFit, folFit, folRect, mobile } = layout;
  if (!heroFit) return sr;
  const sel = envs[SEL], tgt: Vec3 = [sel.gx + FOL_TARGET[0], FOL_TARGET[1], sel.gz + FOL_TARGET[2]];
  const r = lerpRect(sr, folRect, ce);
  const cam: Camera = {
    yaw: YAW, fov: FOV, pitch: lerp(heroFit.cam.pitch, FOL_PITCH, ce), dist: exp(lerp(log(heroFit.cam.dist), log(folFit.cam.dist), ce)),
    target: heroFit.cam.target.map((t, i) => lerp(t, tgt[i], ce)) as Vec3,
  };
  const v = makeView(cam, r, lerp(heroFit.ox, folFit.ox, ce), lerp(heroFit.oy, folFit.oy, ce));

  // Corner marks of the stage and the caption, gone early in the collapse.
  const ha = 1 - smooth(0, 0.4, c);
  if (ha > 0.01) {
    g.strokeStyle = col(pal.line, ha); g.lineWidth = 1;
    const m = 10, { x, y, w, h } = sr;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) polyline(g, [[cx + sx * m, cy], [cx, cy], [cx, cy + sy * m]]);
    caption(g, HERO.caption, sr.x + 16, sr.y + sr.h - 6, ha, 'left');
  }

  const selFrame = place(F.frame, [], 0, 0, 0).frame;
  const order = envs.map(e => ({ e, z: P(v, [e.gx, 0, e.gz])[2] })).sort((a, b) => b.z - a.z);
  const others = 1 - smooth(0.04, 0.5, c);
  for (const { e } of order) {
    const isSel = e.i === SEL, s = TILE / 2;
    const q = [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]].map(([a, b]) => P(v, [e.gx + a, 0, e.gz + b]));
    const ta = isSel ? 1 - smooth(0.55, 0.9, c) : others;
    g.lineWidth = 1; g.strokeStyle = col(pal.line, ta); polyline(g, q);
    // Accent outline: the selected tile while it is picked, the others when they restart after a fall.
    const hi = isSel ? smooth(0.02, 0.22, c) * (1 - smooth(0.6, 0.92, c)) : e.flash * 0.6 * others;
    if (hi > 0.01) { g.strokeStyle = col(pal.accent, hi); polyline(g, q); }
    const fr = isSel ? selFrame : e.frame, props = isSel ? [] : e.props;
    const placed = place(fr, props, e.yaw, e.gx, e.gz);
    const pel = P(v, placed.frame.joints.pelvis);
    e.sx = pel[0]; e.sy = pel[1];
    const alpha = isSel ? 1 : others * (e.fallT >= 0 ? lerp(0.42, 1, e.p) * (1 - smooth(1.0, 1.6, e.fallT)) : lerp(0.42, 1, e.p));
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]), tall = (max(...ys) - min(...ys)) * 2.2;
    const tileR: Rect = { x: min(...xs) - 12, y: min(...ys) - tall, w: max(...xs) - min(...xs) + 24, h: max(...ys) - min(...ys) + tall + 12 };
    const bg = isSel ? secProps(0) : placed.props;
    faded(g, lg, alpha, isSel ? grow(r, 0.3) : tileR, d => {
      if (isSel) drawProps(d, place(LIE, bg, e.yaw, e.gx, e.gz).props, v);
      else drawProps(d, bg, v);
      drawFigure(d, placed.frame, v, isSel ? [] : placed.props);
      if (!isSel && placed.frame.push && placed.frame.push.strength > 0.05) {
        const { at, dir, strength } = placed.frame.push;
        const A2 = P(v, addv(at, dir, -0.7)), B2 = P(v, addv(at, dir, -0.06));
        d.strokeStyle = col(pal.accent, strength); d.lineWidth = 1.2; polyline(d, [A2, B2]);
      }
    });
  }
  ring(g, v, 0.6, 0.8 * smooth(0.6, 1, c) * (mobile ? 0 : 1), sel.gx, sel.gz);
  return r;
}

