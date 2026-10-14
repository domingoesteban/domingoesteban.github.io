# Robot

The animated humanoid of the home page (forked from prototype 23 "Curriculum"). Nine hero tiles learn nine
skills; the selected one grows into the first section, does one task per section and moves between sections
with the scroll. Booted by `src/components/home/RobotCanvas.astro`.

## Where to change what

| To change | Edit |
| --- | --- |
| Sections: order, label, which skill each one shows | `PAGE` in `src/data/page.ts` (one line per section) |
| How the robot walks into a section (walk, jump, push) | `arrive` on its `PAGE` line (default: varied) |
| Hero tiles: yaw, learning delay | `story.ts` `TILES` |
| A skill's motion, loop length, fall points, and its caption, heading, reduced-motion pose as a section | `tasks.ts` `TASK`, the specs in `skills.ts` / `rig.ts` |
| Hero learning curve, falls, grid size, collapse | `hero.ts` |
| Walk/run speed, follower damping, jump band, push strength | `follower.ts` `update` |
| Robot look (limbs, shells, helmet, visor, props) | `draw.ts` |
| Which part paints over which at a joint (thigh over shin, elbow pin over the arm) | `draw.ts` `COVERS` |
| How parts are ordered: depth, covers, the box hiding what is behind it | `paint.ts` |
| Policy net (closed loop: its activations follow the robot's motion), ring, ground line, caption, push arrow | `overlay.ts` (`W0`, `W1`, `GAIN`, `stepNet`) |
| Camera angle, framing | `camera.ts` (`YAW`, `FOV`, `FOL_*`), fits in `app.ts` `resize` |
| Colors, caption font | CSS variables in `src/components/home/home.css` (read by `palette.ts`); which props take the object color: `OBJECTS` in `draw.ts` |
| Column gap, band heights, robot size on desktop | `--colgap` in `home.css`, `app.ts` `resize` |

## Adding a section

1. Write `src/components/home/sections/<Id>.astro` with its content inside `<Section id="<id>" heading="...">`
   (id `talks` is `Talks.astro`, `open-source` is `OpenSource.astro`).
2. Add `{ id, label, robot }` to `PAGE` in `src/data/page.ts`, where it goes in the page. `robot` is any of the nine skills:
   lift, poise, drill, sit, wave, walk, carry, jump, push.

The page, the nav and the robot all follow `PAGE`. The rest is derived from the order:
- The side alternates (right, left, ...). The first section's skill is the hero tile that is picked.
- Lift leaves holding the box and carry always holds it. The robot carries it into the next section and puts it
  down there, if that skill has room for it (`room` in `TASK`) or carries it on. Otherwise it leaves without the box.
- A carry section picks the box up when the robot arrives without one.
- The band after a section where the robot leaves holding the box is a carry; the others cycle walk, jump, push.
- Walking back undoes all of it, so the robot always comes back in the state it left.

## Files

- `story.ts` what follows from the sections of `PAGE` (sides, exits, intros, transitions, hero pick)
- `tasks.ts` the nine skills (motion and how each shows as a section) and helpers to mix specs with stepping
- `hero.ts` the 3x3 hero tiles: learning, falls, convergence, grid render
- `follower.ts` scroll-driven locomotion, task clocks, transitions, follower render
- `draw.ts` figure (as parts) and props; `paint.ts` paints the parts in order; `overlay.ts` net, ring, ground line,
  caption, arrow
- `camera.ts` projection, fits and the shared screen `layout`; `palette.ts` CSS colors
- `app.ts` DOM wiring: resize, animation loop, pointer, reduced motion
- `rig.ts`, `skills.ts` the humanoid rig and its skills (forks of `prototype-styles/humanoid*.ts`); `math.ts` helpers

The page root carries `data-ab` (band scroll ranges) and `data-dbg` (follower state) for debugging and screenshots.
