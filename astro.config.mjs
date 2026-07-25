// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkAffiliate from './scripts/remark-affiliate.mjs';

// ------------------------------------------------------------------
// Configuration du site.
//
// GitHub Pages sert le site depuis https://<user>.github.io/<repo>.
// Si vous branchez un domaine personnalisé plus tard, remplacez
// `site` par https://votredomaine.com et mettez `base` à '/'.
// ------------------------------------------------------------------
export default defineConfig({
  site: 'https://she932.github.io',
  base: '/blog-sport',
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
