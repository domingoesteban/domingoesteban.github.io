// The sections of the home page, in order. Each one is src/components/home/sections/<Id>.astro (id "talks" is
// Talks.astro) and shows one robot skill. To add a section, write its component and add a line here; to hide one,
// comment its line out. Everything else (nav, numbering, sides, robot walks) follows from this list.
import type { TaskName } from '@/lib/robot/tasks';

export type Entry = {
  id: string; // the <section id> on the page
  label: string; // in the nav and above the heading
  robot: TaskName; // what the robot does beside it: lift, poise, drill, sit, wave, walk, carry, jump or push. Chosen
  // for the animation, not the section's theme; the first one is the robot picked from the hero grid.
  mobile?: boolean; // keep its nav link on small screens
  arrive?: 'walk' | 'jump' | 'push'; // how the robot walks in from the section before (default: varied)
  caption?: string; // overrides the skill's caption under the robot
  heading?: number; // overrides the direction the robot faces (rad, + turns left)
};

export const PAGE: Entry[] = [
  { id: 'about', label: 'About', robot: 'lift' },
  { id: 'experience', label: 'Experience', robot: 'sit' },
  { id: 'research', label: 'Research', robot: 'drill', mobile: true },
  // Back once there are real notes (src/content/notes holds only samples).
  // { id: 'notes', label: 'Notes', robot: 'sit', mobile: true },
  { id: 'contact', label: 'Contact', robot: 'wave' },
];
