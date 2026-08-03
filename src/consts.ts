// ------------------------------------------------------------------
//  Configuration éditoriale centrale du blog.
//  Modifiez ces valeurs pour adapter le nom, la thématique, etc.
// ------------------------------------------------------------------

export const SITE = {
  /** Nom du blog affiché dans le header et les métadonnées. */
  title: 'MuscuGuide',
  /** Titre SEO de la page d'accueil (contient déjà la marque). */
  homeTitle: 'MuscuGuide — Guides & comparatifs fitness et musculation',
  /** Accroche / description par défaut (SEO). */
  description:
    "Guides, comparatifs et conseils d'experts pour bien choisir votre matériel de fitness et de musculation. Nouveaux guides publiés chaque jour.",
  /** Baseline affichée sur la page d'accueil. */
  tagline: 'Le meilleur du fitness & de la musculation, décrypté chaque jour.',
  /** Langue du contenu (balise <html lang>). */
  lang: 'fr',
  /** Auteur / éditeur par défaut. */
  author: 'La rédaction MuscuGuide',
  /** Locale Open Graph. */
  locale: 'fr_FR',
} as const;

// Catégories éditoriales du blog. Le champ `slug` sert dans les URLs.
export const CATEGORIES = [
  {
    slug: 'comparatifs',
    name: 'Comparatifs',
    description:
      'Nos comparatifs détaillés pour choisir le meilleur matériel de musculation au meilleur prix.',
  },
  {
    slug: 'guides',
    name: 'Guides complets',
    description:
      "Des guides pas à pas pour progresser, s'équiper et atteindre vos objectifs de forme.",
  },
  {
    slug: 'conseils',
    name: 'Conseils & entraînement',
    description:
      "Articles pratiques : nutrition, programmes, récupération et techniques d'entraînement.",
  },
  {
    slug: 'materiel',
    name: 'Matériel',
    description:
      "Tests et présentations d'équipements : bancs, haltères, machines, accessoires.",
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

/** Nombre d'articles affichés par page de liste. */
export const POSTS_PER_PAGE = 12;
