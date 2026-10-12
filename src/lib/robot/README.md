# Robot

The animated humanoid of the home page (forked from prototype 23 "Curriculum"). Nine hero tiles learn nine
skills; the selected one grows into the first section, does one task per section and moves between sections
with the scroll. Booted by `src/components/home/RobotCanvas.astro`.

## Where to change what

| To change | Edit |
| --- | --- |
| Which task a section shows, its caption, heading, side, exit poses, NN pulses | `story.ts` `SECTIONS` |
| What happens between two sections (walk, carry, jump, push) | `story.ts` `TRANSITIONS` (one entry per gap) |
| Hero tiles: task, yaw, learning delay, which tile is selected | `story.ts` `HERO` |
| A task's motion, loop length, fall points | `tasks.ts` `TASK`, the specs in `skills.ts` / `rig.ts` |
| Hero learning curve, falls, grid size, collapse | `hero.ts` |
| Walk/run speed, follower damping, jump band, push strength | `follower.ts` `update` |
| Robot look (limbs, shells, helmet, visor, props) | `draw.ts` |
| Policy net, ring, ground line, caption, push arrow | `overlay.ts` |
| Camera angle, framing | `camera.ts` (`YAW`, `FOV`, `FOL_*`), fits in `app.ts` `resize` |
| Colors, caption font | CSS variables in `src/components/home/home.css` (read by `palette.ts`) |
| Column gap, band heights, robot size on desktop | `--colgap` in `home.css`, `app.ts` `resize` |

## Rules of the story

- `SECTIONS` must be in page order and its ids must match the sections in `HomePage.astro`. Each section's
  side (`data-side`) and number come from here.
- The page has one `.band` per entry in `TRANSITIONS` (a warning is logged otherwise).
- `carry` holds the box during the walk: the section before should exit while holding it (lift at 3.75) and the
  one after should put it down in its `intro`.
- Exit clocks are where the robot leaves a section (`next` / `prev`); a value below the intro length rewinds the
  intro, so walking back undoes it.

## Files

- `story.ts` declarative data: sections, transitions, hero tiles
- `tasks.ts` the task table and helpers to mix specs with stepping
- `hero.ts` the 3x3 hero tiles: learning, falls, convergence, grid render
- `follower.ts` scroll-driven locomotion, task clocks, transitions, follower render
- `draw.ts` figure and props; `overlay.ts` net, ring, ground line, caption, arrow
- `camera.ts` projection, fits and the shared screen `layout`; `palette.ts` CSS colors
- `app.ts` DOM wiring: resize, animation loop, pointer, reduced motion
- `rig.ts`, `skills.ts` the humanoid rig and its skills (forks of `prototype-styles/humanoid*.ts`); `math.ts` helpers

The page root carries `data-ab` (band scroll ranges) and `data-dbg` (follower state) for debugging and screenshots.
