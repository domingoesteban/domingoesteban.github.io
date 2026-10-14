// @ts-check
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The prototype pages are dev-only and never built, but Vite still bundles their scripts and styles into _astro/.
// After the build, remove every asset that no page uses (directly or through another used asset), so they are never
// published.
const dropUnusedAssets = {
  name: 'drop-unused-assets',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const out = fileURLToPath(dir), assets = join(out, '_astro');
      const read = (/** @type {string} */ f) => readFileSync(f, 'utf8');
      const pages = readdirSync(out, { recursive: true }).map(String).filter(f => f.endsWith('.html'));
      let used = pages.map(f => read(join(out, f))).join('\n');
      const names = readdirSync(assets), keep = new Set();
      for (let grew = true; grew;) {
        grew = false;
        for (const n of names) if (!keep.has(n) && used.includes(n)) { keep.add(n); used += read(join(assets, n)); grew = true; }
      }
      const unused = names.filter(n => !keep.has(n));
      for (const n of unused) rmSync(join(assets, n));
      logger.info(`removed ${unused.length} unused assets, kept ${keep.size}`);
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://domingoesteban.com',
  output: 'static',
  // Preserve Astro 6 spacing between inline elements after the v7 upgrade.
  compressHTML: true,
  integrations: [sitemap(), dropUnusedAssets],
  // Pages of the old site, so links to them still land on the home page.
  redirects: { '/about': '/', '/blog': '/' },
});
