// Tasks: every skill the robot can show, as a scene (spec + props in the task frame) per clock time. Each one can be
// a hero tile and a section of the page (story.ts).
import { pose, pushAt, solve, skillSpec, BOX_SIZE, type Frame, type Spec, type Vec3 } from './rig';
import { drillScene, mixSpec, moveScene, place, poiseSpec, sitBlock, sitSpec, waveSpec, MOVE_DURATION, DRILL_DURATION, POISE_DURATION, SIT_DURATION, WAVE_DURATION, type Prop } from './skills';
import { addv, clamp, mod, smooth } from './math';

const { min, hypot, sin, atan2, PI } = Math;

// root: where a task that moves around has taken the robot [x, z, yaw]; props move with it, world props stay.
// push: the shove of the push skill, drawn as an arrow.
export type Scene = { spec: Spec; props: Prop[]; world?: Prop[]; root?: number[]; push?: { dir: Vec3; strength: number } | null };
export type TaskName = 'lift' | 'poise' | 'drill' | 'sit' | 'wave' | 'walk' | 'carry' | 'jump' | 'push';

// The lift clip: picking the box up [0, 3.75] and putting it down [5.7, 8.2]. Other sections reuse these to put
// down a box carried in, or to pick one up.
export const LIFT = { up: [0, 3.75], down: [5.7, 8.2] };

type Task = {
  D: number; // loop duration (s)
  scene: (t: number) => Scene;
  risk: number[]; // clock times where a robot that is still learning may fall (hero tiles)
  // As a section: caption under the robot, yaw it faces (rad, + turns left), pose with reduced motion, clock
  // where it leaves (default 0, the loop start), seconds it may play backwards to get there (default 1.2), clock on
  // page load when it is the first section.
  caption: string; heading: number; still: number; leave?: number; rewind?: number; start?: number;
  room?: boolean; // a box put down in front of the robot (BOX_REST) is out of its way: no props, path or feet there
};

export const TASK: Record<TaskName, Task> = {
  lift: { D: 9, scene: t => ({ spec: skillSpec('lift', t), props: [] }), risk: [3.1], caption: 'pick and place', heading: -0.45, still: 3.75, leave: LIFT.up[1], rewind: 5, start: 1.2, room: true },
  poise: { D: POISE_DURATION, scene: t => ({ spec: poiseSpec(t), props: [] }), risk: [2.7, 5.7], caption: 'balance', heading: 0.25, still: 3.2, room: true },
  drill: { D: DRILL_DURATION, scene: t => drillScene(t), risk: [3.5], caption: 'drill', heading: 2.0, still: 5.4 },
  sit: { D: SIT_DURATION, scene: t => ({ spec: sitSpec(t), props: [sitBlock()] }), risk: [3.2, 5.8], caption: 'sit to stand', heading: 1.7, still: 4.3, room: true },
  wave: { D: WAVE_DURATION, scene: t => ({ spec: waveSpec(t), props: [] }), risk: [1.6], caption: 'hello', heading: 0.55, still: 2.2, room: true },
  walk: { D: MOVE_DURATION.walkturn, scene: t => moveScene('walkturn', t), risk: [1.3, 3.9], caption: 'walk', heading: 0.3, still: 1.2 },
  carry: { D: MOVE_DURATION.carryturn, scene: t => moveScene('carryturn', t), risk: [2.7, 6.3], caption: 'carry', heading: 0.4, still: 1.2 },
  jump: { D: MOVE_DURATION.jump, scene: t => moveScene('jump', t), risk: [1.6, 4.9], caption: 'jump', heading: 0.3, still: 1.2 },
  push: { D: 8, scene: t => ({ spec: skillSpec('push', t), props: [], push: pushAt(t) }), risk: [1.4, 5.4], caption: 'push recovery', heading: 0.25, still: 1.62, room: true },
};

// Solves a scene's spec, with the shove of a push as the frame's arrow.
export const solveScene = (sc: Scene, perturb?: Vec3) => {
  const f = solve(sc.spec, perturb);
  if (sc.push) f.push = { at: addv(f.joints.chest, sc.push.dir, -0.12) as Vec3, ...sc.push };
  return f;
};

// Solved and placed frame of a task at clock t, with an optional perturbation (wobble, pointer nudge).
export const live = (name: TaskName, t: number, perturb?: Vec3) => {
  const sc = TASK[name].scene(mod(t, TASK[name].D)), r = sc.root ?? [0, 0, 0];
  const out = place(solveScene(sc, perturb), sc.props, r[2], r[0], r[1]);
  return { frame: out.frame, props: [...out.props, ...(sc.world ?? [])] };
};

// Lying on the back: where a fall ends, and the placeholder frame before the first update.
export const LIE = pose('getup', 0.5);
export const facing = (f: Frame) => { const s = f.joints.rHip, l = f.joints.lHip; return atan2(s[0] - l[0], s[2] - l[2]); };

// Two specs mixed with stepping: each foot that has to move is lifted in turn instead of sliding.
export const stepMix = (a: Spec, b: Spec, w: number): Spec => {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const s = mixSpec(a, b, smooth(0, 1, w));
  for (const [k, w0, w1] of [['lf', 0, 0.6], ['rf', 0.4, 1]] as const) {
    const d = hypot(b[k][0] - a[k][0], b[k][1] - a[k][1]);
    if (d < 0.025) continue;
    const u = clamp((w - w0) / (w1 - w0)), e = smooth(0, 1, u), f = a[k].map((v, i) => v + (b[k][i] - v) * e);
    f[2] += min(0.08, 0.5 * d + 0.02) * sin(PI * u);
    s[k] = f;
  }
  return s;
};

// The lift box resting where the lift puts it down (spec.box with hold = 0, grip = 0).
export const BOX_REST = [0.42, 0.17, 0];
export const withBox = (s: Spec): Spec => ({ ...s, box: [BOX_REST[0], BOX_REST[1], BOX_REST[2], 0, 0, 0] });
// A box neither held nor gripped rests on its own: it is drawn as a prop where it lies. While the hands still grip
// it (about to lift it, or just put it down) it stays in the spec, so the arms keep reaching for it.
export const loose = (b?: number[]): b is number[] => !!b && b[4] < 0.02 && b[5] < 0.02;
// A box that is not held is drawn as a prop.
export const crate = (b: number[]): Prop => ({ kind: 'block', c: [b[0], b[1], b[2]] as Vec3, ax: [[BOX_SIZE[0] / 2, 0, 0], [0, BOX_SIZE[1] / 2, 0], [0, 0, BOX_SIZE[2] / 2]], alpha: 1, crate: true } as Prop);
