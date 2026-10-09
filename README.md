# domingoesteban.github.io

Personal website built with Astro.

Requires Node.js 22.12 or newer and Bun 1.4.2. Use Bun with the committed lockfile:

```sh
bun install --frozen-lockfile
bun run dev
```

Before deploying, run `bun run check` and `bun run build`.

The typography plugin's selector parser is overridden to a patched release
for GHSA-rj75-hqrm-r3gf until the plugin updates its dependency.

Based on the upstream project: https://github.com/jramma/sorollaportfolio  
Original author credit: Jose (`jramma`).

Upstream is released under the MIT License.
