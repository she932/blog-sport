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
  // Redirections 301 (statique : page meta-refresh + canonical), toutes en
  // slash final. Regroupe : anciennes URLs datées -> slugs propres,
  // doublons supprimés -> article conservé. Cohérent avec trailingSlash.
  redirects: {
    '/blog/2026-07-09-recuperation-musculaire/':
      '/blog/recuperation-musculaire/',
    '/blog/2026-07-10-programme-prise-de-force/':
      '/blog/programme-prise-de-force/',
    '/blog/2026-07-11-meilleure-montre-sport/':
      '/blog/meilleure-montre-sport/',
    '/blog/2026-07-12-meilleur-rack-squat/':
      '/blog/meilleur-rack-squat/',
    '/blog/2026-07-13-gainer-les-abdos/':
      '/blog/gainer-les-abdos/',
    '/blog/2026-07-14-meilleure-corde-a-sauter/':
      '/blog/meilleure-corde-a-sauter/',
    '/blog/2026-07-15-perte-de-poids-musculation/':
      '/blog/perte-de-poids-musculation/',
    '/blog/2026-07-16-meilleure-kettlebell/':
      '/blog/meilleure-kettlebell/',
    '/blog/2026-07-17-meilleure-barre-de-traction/':
      '/blog/meilleure-barre-de-traction/',
    '/blog/2026-07-18-muscler-le-dos-maison/':
      '/blog/muscler-le-dos-maison/',
    '/blog/2026-07-19-creatine-guide-complet/':
      '/blog/creatine-guide-complet/',
    '/blog/2026-07-20-meilleures-bandes-elastiques/':
      '/blog/meilleures-bandes-elastiques/',
    '/blog/2026-07-21-programme-full-body-maison/':
      '/blog/programme-full-body-maison/',
    '/blog/2026-07-22-meilleure-whey-proteine/':
      '/blog/meilleure-whey-proteine/',
    '/blog/2026-07-23-combien-de-proteines-par-jour/':
      '/blog/combien-de-proteines-par-jour/',
    '/blog/2026-07-24-prise-de-masse-debutant/':
      '/blog/prise-de-masse-debutant/',
    '/blog/2026-07-25-10-equipements-salle-de-sport-maison/':
      '/blog/equipements-salle-de-sport-maison/',
    '/blog/2026-07-25-debuter-la-musculation/':
      '/blog/debuter-la-musculation/',
    '/blog/2026-07-25-meilleur-banc-de-musculation/':
      '/blog/meilleur-banc-de-musculation/',
    '/blog/2026-07-25-meilleur-tapis-course-pliable/':
      '/blog/meilleur-tapis-de-course-pliable/',
    '/blog/2026-07-25-meilleures-halteres-reglables/':
      '/blog/meilleures-halteres-reglables/',
    '/blog/2026-07-25-salle-de-sport-maison-materiel/':
      '/blog/salle-de-sport-maison-materiel/',
    '/blog/2026-07-26-muscler-les-pectoraux-maison/':
      '/blog/muscler-les-pectoraux-maison/',
    '/blog/2026-07-27-muscler-les-jambes-maison/':
      '/blog/muscler-les-jambes-maison/',
    '/blog/2026-07-28-muscler-les-bras-maison/':
      '/blog/muscler-les-bras-maison/',
    '/blog/2026-07-29-meilleur-tapis-de-fitness/':
      '/blog/meilleur-tapis-de-fitness/',
    '/blog/2026-07-30-meilleure-ceinture-de-force/':
      '/blog/meilleure-ceinture-de-force/',
    '/blog/2026-07-31-meilleur-velo-appartement/':
      '/blog/meilleur-velo-appartement/',
    '/blog/2026-08-01-echauffement-avant-musculation/':
      '/blog/echauffement-avant-musculation/',
    '/blog/2026-08-02-etirements-recuperation/':
      '/blog/etirements-recuperation/',
    '/blog/2026-08-02-hiit-maison-bruler-graisse/':
      '/blog/hiit-maison-bruler-graisse/',
    '/blog/2026-08-02-home-gym-petit-budget/':
      '/blog/home-gym-petit-budget/',
    '/blog/2026-08-02-meilleurs-complements-musculation/':
      '/blog/meilleurs-complements-musculation/',
    '/blog/2026-08-02-proteines-vegetales-musculation/':
      '/blog/proteines-vegetales-musculation/',
    '/blog/2026-08-03-proteines-vegetales-musculation/':
      '/blog/proteines-vegetales-musculation/',
    '/blog/2026-08-04-meilleurs-complements-musculation/':
      '/blog/meilleurs-complements-musculation/',
    '/blog/2026-08-05-hiit-maison-bruler-graisse/':
      '/blog/hiit-maison-bruler-graisse/',
    '/blog/2026-08-06-meilleur-tapis-de-course-pliable-comparatif-pour-la-maison/':
      '/blog/meilleur-tapis-de-course-pliable/',
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
