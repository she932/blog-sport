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
  // Slash final imposé : URLs canoniques cohérentes (évite les 301
  // « Page avec redirection » signalées par la Search Console sur GitHub Pages).
  trailingSlash: 'always',
  // Redirections des doublons supprimés vers l'article de référence conservé.
  // En sortie statique, Astro génère une page de redirection (meta refresh +
  // canonical) à l'ancienne URL, ce qui consolide le SEO vers l'article gardé.
  // Clés et cibles avec slash final, cohérentes avec trailingSlash: 'always'.
  redirects: {
    '/blog/2026-08-02-hiit-maison-bruler-graisse/':
      '/blog/2026-08-05-hiit-maison-bruler-graisse/',
    '/blog/2026-08-02-proteines-vegetales-musculation/':
      '/blog/2026-08-03-proteines-vegetales-musculation/',
    '/blog/2026-08-02-meilleurs-complements-musculation/':
      '/blog/2026-08-04-meilleurs-complements-musculation/',
  },
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkAffiliate],
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
