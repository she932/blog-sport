// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkAffiliate from './scripts/remark-affiliate.mjs';

// ------------------------------------------------------------------
// Configuration du site.
//
// Le site est servi à la racine du domaine personnalisé muscuguide.fr
// (fichier public/CNAME + configuration DNS / GitHub Pages).
// ------------------------------------------------------------------
export default defineConfig({
  site: 'https://muscuguide.fr',
  base: '/',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkAffiliate],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
