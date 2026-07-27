// ------------------------------------------------------------------
//  Utilitaires de construction des liens affiliés Amazon.
//  Le tag est lu depuis la variable d'environnement AMAZON_AFFILIATE_TAG
//  au moment du build (exposée via import.meta.env).
// ------------------------------------------------------------------

const env = (typeof process !== 'undefined' ? process.env : {}) as Record<
  string,
  string | undefined
>;

const TAG =
  env.AMAZON_AFFILIATE_TAG ||
  import.meta.env.AMAZON_AFFILIATE_TAG ||
  import.meta.env.PUBLIC_AMAZON_AFFILIATE_TAG ||
  'muscuguide-21';

const DOMAIN =
  env.AMAZON_DOMAIN || import.meta.env.AMAZON_DOMAIN || 'amazon.fr';

/** Lien vers une fiche produit précise à partir de son ASIN. */
export function amazonProductUrl(asin: string): string {
  return `https://www.${DOMAIN}/dp/${asin}?tag=${TAG}&linkCode=ogi&th=1&psc=1`;
}

/** Lien vers une recherche Amazon (fallback quand on n'a pas d'ASIN). */
export function amazonSearchUrl(keyword: string): string {
  const q = encodeURIComponent(keyword);
  return `https://www.${DOMAIN}/s?k=${q}&tag=${TAG}`;
}

export const AMAZON_TAG = TAG;
export const AMAZON_DOMAIN = DOMAIN;

/** Mention légale obligatoire du programme Partenaires Amazon. */
export const AFFILIATE_DISCLOSURE =
  "En tant que Partenaire Amazon, MuscuGuide réalise un bénéfice sur les achats remplissant les conditions requises. Les prix et la disponibilité sont donnés à titre indicatif et peuvent varier.";
