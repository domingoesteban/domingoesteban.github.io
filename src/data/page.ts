// The sections of the home page, in order. Each one is src/components/home/sections/<Id>.astro (id "talks" is
// Talks.astro) and shows one robot skill. To add a section, write its component and add a line here; to hide one,
// comment its line out. Everything else (nav, numbering, sides, robot walks) follows from this list.
import type { TaskName } from '@/lib/robot/tasks';

export type Entry = {
  id: string; // the <section id> on the page
  label: string; // in the nav and above the heading
  task: TaskName; // the skill: lift, poise, drill, sit, wave, walk, carry, jump or push
  mobile?: boolean; // keep its nav link on small screens
  arrive?: 'walk' | 'jump' | 'push'; // how the robot walks in from the section before (default: varied)
  caption?: string; // overrides the skill's caption under the robot
  heading?: number; // overrides the direction the robot faces (rad, + turns left)
};

export const PAGE: Entry[] = [
  { id: 'research', label: 'Research', task: 'lift', mobile: true },
  { id: 'about', label: 'About', task: 'poise' },
  { id: 'experience', label: 'Experience', task: 'drill' },
  // Back once there are real notes (src/content/notes holds only samples).
  // { id: 'notes', label: 'Notes', task: 'sit', mobile: true },
  { id: 'contact', label: 'Contact', task: 'wave' },
];
