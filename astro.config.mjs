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
});
