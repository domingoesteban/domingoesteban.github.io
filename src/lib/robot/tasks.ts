// Tasks: every skill the robot can show, as a scene (spec + props in the task frame) per clock time.
import { pose, solve, skillSpec, BOX_SIZE, type Frame, type Spec, type Vec3 } from './rig';
import { drillScene, mixSpec, moveScene, place, poiseSpec, sitBlock, sitSpec, waveSpec, MOVE_DURATION, DRILL_DURATION, POISE_DURATION, SIT_DURATION, WAVE_DURATION, type Prop } from './skills';
import { clamp, mod, smooth } from './math';

const { min, hypot, sin, atan2, PI } = Math;

export type Scene = { spec: Spec; props: Prop[]; world?: Prop[]; root?: number[] };
export type TaskName = 'lift' | 'poise' | 'drill' | 'sit' | 'wave' | 'walk' | 'carry' | 'jump' | 'push';

// D: loop duration (s). risk: clock times where a robot that is still learning may fall (hero tiles).
export const TASK: Record<TaskName, { D: number; scene: (t: number) => Scene; risk: number[] }> = {
  lift: { D: 9, scene: t => ({ spec: skillSpec('lift', t), props: [] }), risk: [3.1] },
  poise: { D: POISE_DURATION, scene: t => ({ spec: poiseSpec(t), props: [] }), risk: [2.7, 5.7] },
  drill: { D: DRILL_DURATION, scene: t => drillScene(t), risk: [3.5] },
  sit: { D: SIT_DURATION, scene: t => ({ spec: sitSpec(t), props: [sitBlock()] }), risk: [3.2, 5.8] },
  wave: { D: WAVE_DURATION, scene: t => ({ spec: waveSpec(t), props: [] }), risk: [1.6] },
  walk: { D: MOVE_DURATION.walkturn, scene: t => moveScene('walkturn', t), risk: [1.3, 3.9] },
  carry: { D: MOVE_DURATION.carryturn, scene: t => moveScene('carryturn', t), risk: [2.7, 6.3] },
  jump: { D: MOVE_DURATION.jump, scene: t => moveScene('jump', t), risk: [1.6, 4.9] },
  push: { D: 8, scene: t => ({ spec: skillSpec('push', t), props: [] }), risk: [1.4, 5.4] },
};

// Solved and placed frame of a task at clock t, with an optional perturbation (wobble, pointer nudge).
export const live = (name: TaskName, t: number, perturb?: Vec3) => {
  if (name === 'push') return { frame: pose('push', t, { perturb }), props: [] as Prop[] };
  const sc = TASK[name].scene(mod(t, TASK[name].D)), f = solve(sc.spec, perturb), r = sc.root ?? [0, 0, 0];
  const out = place(f, sc.props, r[2], r[0], r[1]);
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
// A box that is not held is drawn as a prop.
export const crate = (b: number[]): Prop => ({ kind: 'block', c: [b[0], b[1], b[2]] as Vec3, ax: [[BOX_SIZE[0] / 2, 0, 0], [0, BOX_SIZE[1] / 2, 0], [0, 0, BOX_SIZE[2] / 2]], alpha: 1, crate: true } as Prop);
