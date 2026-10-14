// The story of the page, derived from its sections (PAGE in src/data/page.ts). Nine hero tiles learn nine skills; the
// tile of the first section's skill grows into that section, the robot shows one skill per section and moves between
// sections with the scroll. From the order alone: the side alternates, a box picked up is carried to the next section
// and put down there, and the walks in between vary.
import { HR } from './camera';
import { TASK, LIFT, type TaskName } from './tasks';
import { PAGE, type Entry } from '@/data/page';

export type Side = 'L' | 'R';
// How the robot moves through the band between two sections: walk or run with the scroll speed; carry the box
// (whenever it leaves a section holding it); jump over a low obstacle; push: a shove mid-way, caught with a step.
export type Transition = 'carry' | NonNullable<Entry['arrive']>;

export type Section = Entry & {
  side: Side; // half of the page the robot stands in; the text takes the other half
  caption: string;
  heading: number;
  start?: number; // clock on page load (first section only, where the hero tile starts)
  // Before its own loop, play another task's clip [from, to] and step into this task over `mix` seconds.
  // keepBox leaves the box on the floor where the clip put it down.
  intro?: { task: TaskName; from: number; to: number; mix: number; keepBox?: boolean };
  // Section clock where the robot leaves for the next / previous section (null: keep looping).
  // Times below the intro length rewind the intro, so the robot arrives back in the state it came in.
  exit: { next: number | null; prev: number | null };
  rewind?: number; // seconds of clip the robot may play backwards to reach an exit
  still: number; // pose shown with reduced motion
};

// Whether a task has the box in its hands at clock t.
const holds = (task: TaskName, t: number) => (TASK[task].scene(t).spec.box?.[4] ?? 0) > 0.5;
const hasBox = (task: TaskName) => !!TASK[task].scene(0).spec.box;
// Whether section i can take a box carried in: it has room to put it down, or carries it and can pass it on.
const take = (i: number): boolean => i < PAGE.length && (!!TASK[PAGE[i].robot].room || (holds(PAGE[i].robot, 0) && (i === PAGE.length - 1 || take(i + 1))));

const holding: boolean[] = []; // whether the robot leaves section i with the box
export const SECTIONS: Section[] = PAGE.map((p, i) => {
  const t = TASK[p.robot], last = i === PAGE.length - 1;
  // A robot that walks in holding the box puts it down first; one whose task needs the box picks it up first.
  const came = i > 0 && holding[i - 1], starts = holds(p.robot, 0);
  const intro: Section['intro'] = came && !starts ? { task: 'lift', from: LIFT.down[0], to: LIFT.down[1], mix: 0.8, keepBox: !hasBox(p.robot) }
    : !came && starts ? { task: 'lift', from: LIFT.up[0], to: LIFT.up[1], mix: 0.8 } : undefined;
  const I = intro ? intro.to - intro.from + intro.mix : 0;
  // A task that would leave holding the box does so only if the next section can take it. Otherwise it leaves from
  // its loop start with the box down, or, if its task always holds the box, by undoing the pick-up.
  const L = t.leave ?? 0, wants = holds(p.robot, L);
  holding[i] = !last && wants && take(i + 1);
  const leave = !wants || holding[i] ? I + L : starts ? 0 : I;
  if (!last && !holding[i] && starts && came) console.warn(`robot: "${p.id}" (${p.robot}) cannot hand on the box it was given`);
  return {
    ...p, side: i % 2 ? 'L' : 'R', caption: p.caption ?? t.caption, heading: p.heading ?? t.heading, start: t.start, intro,
    exit: { next: last ? null : leave, prev: i > 0 ? 0 : null }, rewind: t.rewind, still: I + t.still,
  };
});

// One per gap between sections: carry when the robot leaves holding the box, else the section's `arrive` or the
// next one of VARIETY.
const VARIETY: Transition[] = ['walk', 'jump', 'push'];
let n = 0;
export const TRANSITIONS: Transition[] = SECTIONS.slice(1).map((s, i) => (holding[i] ? 'carry' : s.arrive ?? VARIETY[n++ % VARIETY.length]));

// Hero tiles on the 3x3 grid (tile i sits at row floor(i / 3), column i % 3), one per skill. t0 delays its learning
// curve (s). The tile of the first section's skill is the one picked, so the page can start with any skill.
const TILES: { task: TaskName; yaw: number; t0: number }[] = [
  { task: 'lift', yaw: -0.45, t0: 0 }, { task: 'sit', yaw: 1.6, t0: 1.6 }, { task: 'walk', yaw: 0, t0: 0.6 },
  { task: 'drill', yaw: -0.32, t0: 2.4 }, { task: 'poise', yaw: 0.5, t0: 1.0 }, { task: 'jump', yaw: HR, t0: 2.9 },
  { task: 'wave', yaw: 0.82, t0: 2.0 }, { task: 'push', yaw: 0.25, t0: 0.3 }, { task: 'carry', yaw: 0.4, t0: 1.3 },
];
export const HERO = {
  selected: TILES.findIndex(t => t.task === SECTIONS[0].robot),
  tiles: TILES,
};

export const sideOf = (id: string) => SECTIONS.find(s => s.id === id)!.side;
