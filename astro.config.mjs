// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://domingoesteban.com',
  output: 'static',
  // Preserve Astro 6 spacing between inline elements after the v7 upgrade.
  compressHTML: true,
  integrations: [sitemap()],
  // Pages of the old site, so links to them still land on the home page.
  redirects: { '/about': '/', '/blog': '/' },
});
