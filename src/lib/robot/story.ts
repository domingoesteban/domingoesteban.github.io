// The story of the page, as data. Nine hero tiles learn nine skills; the selected one grows into the first
// section, shows one skill per section and moves between sections with the transitions below.
// Clock times are seconds into the task loop (see tasks.ts and the specs in skills.ts / rig.ts).
import { HR } from './camera';
import type { TaskName } from './tasks';

export type Side = 'L' | 'R';

export type Section = {
  id: string; // matches the <section id> on the page, in page order
  side: Side; // half of the page the robot stands in; the text takes the other half
  task: TaskName;
  caption: string; // shown under the robot while it does the task
  heading: number; // yaw the robot faces while working (rad, + turns left)
  start?: number; // clock on page load (first section only, where the hero tile starts)
  // Before its own loop, play another task's clip [from, to] and step into this task over `mix` seconds.
  // keepBox leaves the lift box on the floor where the clip put it down.
  intro?: { task: TaskName; from: number; to: number; mix: number; keepBox?: boolean };
  // Section clock where the robot leaves for the next / previous section (null: keep looping).
  // Times below the intro length rewind the intro, so the robot arrives back in the state it came in.
  exit: { next: number | null; prev: number | null };
  still: number; // pose shown with reduced motion
  pulses: number[]; // section clock times that send a pulse through the policy net
};

export const SECTIONS: Section[] = [
  { id: 'research', side: 'R', task: 'lift', caption: 'pick up', heading: -0.45, start: 1.2, exit: { next: 3.75, prev: null }, still: 3.75, pulses: [2.4, 3.1, 7.2] },
  {
    id: 'about', side: 'L', task: 'poise', caption: 'balance', heading: 0.25,
    intro: { task: 'lift', from: 5.7, to: 8.2, mix: 0.8, keepBox: true }, // put down the box carried from Research
    exit: { next: 3.3, prev: 0 }, still: 6.5, pulses: [1.1, 1.5, 5.9, 8.9, 11.9],
  },
  { id: 'experience', side: 'R', task: 'drill', caption: 'drill', heading: 2.0, exit: { next: 0, prev: 0 }, still: 5.4, pulses: [1.2, 3.2, 3.5, 5.2, 5.5, 8.1] },
  { id: 'notes', side: 'L', task: 'sit', caption: 'sit to stand', heading: 1.7, exit: { next: 0, prev: 0 }, still: 4.3, pulses: [3.1, 5.6] },
  { id: 'contact', side: 'R', task: 'wave', caption: 'hello', heading: 0.55, exit: { next: null, prev: 0 }, still: 2.2, pulses: [1.3, 1.95, 2.6, 3.3] },
];

// How the robot moves through the band after section k (one entry per gap between sections):
// walk: walk or run with the scroll speed; carry: walk holding the box (exit the section before while holding it);
// jump: jump over a low obstacle in the middle; push: a shove in the back mid-way, caught with a longer step.
export type Transition = 'walk' | 'carry' | 'jump' | 'push';
export const TRANSITIONS: Transition[] = ['carry', 'walk', 'jump', 'push'];

// Hero tiles on the 3x3 grid (tile i sits at row floor(i / 3), column i % 3). t0 delays its learning curve (s).
// The selected tile becomes the follower, so it runs the first section's task facing its heading.
export const HERO = {
  selected: 0,
  caption: 'nine skills, trained in parallel',
  tiles: [
    { task: 'lift', yaw: SECTIONS[0].heading, t0: 0 }, { task: 'sit', yaw: 1.6, t0: 1.6 }, { task: 'walk', yaw: 0, t0: 0.6 },
    { task: 'drill', yaw: -0.32, t0: 2.4 }, { task: 'poise', yaw: 0.5, t0: 1.0 }, { task: 'jump', yaw: HR, t0: 2.9 },
    { task: 'wave', yaw: 0.82, t0: 2.0 }, { task: 'push', yaw: 0.25, t0: 0.3 }, { task: 'carry', yaw: 0.4, t0: 1.3 },
  ] as { task: TaskName; yaw: number; t0: number }[],
};

export const sideOf = (id: string) => SECTIONS.find(s => s.id === id)!.side;
