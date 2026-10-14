# domingoesteban.com

Personal website, built with [Astro](https://astro.build) as a static site and deployed to GitHub Pages on every push
to `main` (`.github/workflows/astro.yml`).

Requires Node.js 22.12 or newer and Bun 1.4.2:

```sh
bun install --frozen-lockfile
bun run dev      # http://localhost:4321
bun run check    # type and content check
bun run build    # the site in dist/
```

## Editing content

| To change | Edit |
| --- | --- |
| Name, role, company, location, tagline, social links | `src/data/profile.ts` |
| About text | `src/content/about.md` |
| Jobs (Experience) and research areas | one Markdown file each in `src/content/experience/` and `src/content/research/` (`order:` sets the position) |
| Notes | `src/content/notes/` (the section is hidden until there are real notes) |
| Which sections the page has, their order, nav labels, robot skill per section | `PAGE` in `src/data/page.ts` |
| A section's heading and layout | `src/components/home/sections/<Id>.astro` |

The fields each Markdown file needs are in `src/content.config.ts`; a missing or misspelled one is reported with the
file name.

To add a section, write `src/components/home/sections/Talks.astro`:

```astro
---
import Section from '../Section.astro';
---
<Section id="talks" heading="Talks and *teaching*.">
  <p>Text here.</p>
</Section>
```

and add `{ id: 'talks', label: 'Talks', robot: 'jump' }` to `PAGE` where it goes. `robot` is the skill the robot shows
beside it: lift, poise, drill, sit, wave, walk, carry, jump or push. The nav, numbering and the robot's walks follow.
The words between stars in the heading are shown in blue: mark the key idea, usually one word.

## Structure

- `src/pages/index.astro` the home page, and `404.astro` the page for missing addresses
- `src/components/home/` its parts: nav, hero, sections, footer, the robot canvas
- `src/lib/robot/` the animated robot (see its README)
- `src/content/`, `src/data/` the content
- `src/assets/old-site/` the robot head drawings of the previous site, kept for reuse
- `src/pages/prototype/`, `src/components/prototype-styles/` design prototypes, served only by the dev server
- `scripts/shots.mjs`, `scripts/compare.py` screenshot checks of the home page
- `scripts/og.mjs` the link preview image `public/og.png`, captured from the hero (usage at its top)

## License

The source is public so you can see how the site is built. It is available under the
[PolyForm Strict License 1.0.0](LICENSE): you may read it, run it and learn from it for noncommercial purposes, but not
publish copies or changed versions of the site, its design, the robot animation, its text or images.
