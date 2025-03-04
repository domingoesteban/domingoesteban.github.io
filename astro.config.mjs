// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";

import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  // output: 'server',
  output: 'static',
  site: 'https://domingoesteban.com',
  base: "/",  // Always "/" for root domain
  integrations: [mdx(), sitemap(), tailwind(), icon()],
});