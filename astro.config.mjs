// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  // output: 'server',
  output: 'static',
  // Preserve Astro 6 spacing between inline elements after the v7 upgrade.
  compressHTML: true,
  site: 'https://domingoesteban.com',
  base: "/",  // Always "/" for root domain
  integrations: [mdx(), sitemap(), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
