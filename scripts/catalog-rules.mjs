// ============================================================
//  RÈGLES MÉTIER OFFICIELLES — MuscuGuide V2
//  Spécification validée : notation, vedette, badges, classement.
//  Source unique de vérité, utilisée par l'importeur ET le rendu.
//  Modifier une règle ici la propage partout (au prochain build).
// ============================================================
import { resolveAsin, isValidAsin, isDraftStatus } from './lib.mjs';

// --- A. NOTATION -------------------------------------------------------
/** Score interne (monnaie de référence) sur 100. */
export const SCORE_MAX = 100;
/** Seuil de publication : en dessous, un produit n'est jamais mis en avant. */
export const PUBLISH_THRESHOLD = 70;

/** Paliers de verdict sur le score interne /100 (spécification validée). */
export const VERDICT_TIERS = [
  { min: 90, word: 'Excellent' },
  { min: 80, word: 'Très bon' },
  { min: 70, word: 'Bon' },
  { min: 60, word: 'Correct' },
  { min: 50, word: 'Moyen' },
  { min: 0, word: 'Déconseillé' },
];

/** Convertit le score interne /100 en note d'affichage /5 (arrondi 0,1). */
export function displayScore(internal) {
  const n = Number(internal);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round((n / 20) * 10) / 10;
}

/** Mot de verdict à partir du score interne /100. */
export function verdictFromScore(internal) {
  const n = Number(internal);
  if (!Number.isFinite(n)) return '';
  return (VERDICT_TIERS.find((t) => n >= t.min) || VERDICT_TIERS.at(-1)).word;
}

/**
 * Interprète une note saisie de façon tolérante :
 *  - valeur > 5  -> échelle /100 (score interne direct)
 *  - valeur ≤ 5  -> échelle /5   (score interne = note × 20)
 * Renvoie { internal /100, display /5 } ou {} si vide/0.
 */
export function parseScore(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return {};
  const internal = n > 5 ? n : n * 20;
  return { internal: Math.round(internal), display: displayScore(internal) };
}

// --- B. ÉLIGIBILITÉ & VEDETTE ------------------------------------------
/**
 * Un produit est *publiable* (affichable / éligible vedette) si :
 *   statut non masqué  ET  ASIN valide (pour le pays)  ET
 *   score interne ≥ seuil (si le score est renseigné).
 * Les produits sans score renseigné (catalogue historique) ne sont pas
 * bloqués par le seuil — seul l'ASIN et le statut comptent alors.
 */
export function isPublishable(product, { country } = {}) {
  if (!product || isDraftStatus(product.status)) return false;
  if (!isValidAsin(resolveAsin(product, country))) return false;
  const internal = Number(product.scoreInternal);
  if (Number.isFinite(internal) && internal < PUBLISH_THRESHOLD) return false;
  return true;
}

/** Score interne effectif d'un produit (0 si absent), pour le tri. */
const scoreOf = (p) =>
  Number.isFinite(Number(p.scoreInternal))
    ? Number(p.scoreInternal)
    : Number.isFinite(Number(p.mgScore))
      ? Number(p.mgScore) * 20
      : 0;

/**
 * Comparateur de classement (spécification validée) :
 *   1. rang manuel croissant (override éditorial)
 *   2. score interne décroissant
 *   3. note Amazon ↓  →  nb d'avis ↓  →  prix ↑  →  nom A→Z
 */
export function compareProducts(a, b) {
  const ra = Number.isFinite(Number(a.rank)) ? Number(a.rank) : Infinity;
  const rb = Number.isFinite(Number(b.rank)) ? Number(b.rank) : Infinity;
  if (ra !== rb) return ra - rb;
  if (scoreOf(b) !== scoreOf(a)) return scoreOf(b) - scoreOf(a);
  const rat = (Number(b.rating) || 0) - (Number(a.rating) || 0);
  if (rat) return rat;
  const rev = (Number(b.reviews) || 0) - (Number(a.reviews) || 0);
  if (rev) return rev;
  const pa = Number(a.priceValue) || Infinity;
  const pb = Number(b.priceValue) || Infinity;
  if (pa !== pb) return pa - pb;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
}

/** Liste triée des produits *publiables* d'une catégorie (pour un pays). */
export function rankProducts(list, { country } = {}) {
  return list.filter((p) => isPublishable(p, { country })).sort(compareProducts);
}

/** Produit vedette d'une catégorie : le 1er publiable après classement. */
export function selectFeatured(list, { country } = {}) {
  return rankProducts(list, { country })[0] || null;
}

// --- C. BADGES ---------------------------------------------------------
export const BADGE = {
  choice: 'Choix MuscuGuide',
  value: 'Meilleur rapport qualité/prix',
  premium: 'Premium',
  expert: 'Choix des experts',
};

/**
 * Attribue les badges principaux d'une catégorie (spécification validée) :
 *   - override manuel prioritaire (badge déjà renseigné = conservé) ;
 *   - sinon, automatique : la vedette reçoit « Choix MuscuGuide »
 *     (un seul par catégorie), le meilleur rapport score/prix reçoit
 *     « Meilleur rapport qualité/prix ».
 * Renvoie une Map id -> badge. N'écrit rien : décision au rendu.
 */
export function assignBadges(list, { country } = {}) {
  const ranked = rankProducts(list, { country });
  const badges = new Map();
  const manualChoice = list.some((p) => p.badge === BADGE.choice);

  // Vedette -> Choix MuscuGuide (si aucun override manuel ne l'a déjà posé).
  if (ranked[0] && !manualChoice) badges.set(ranked[0].id, BADGE.choice);

  // Meilleur rapport qualité/prix parmi les éligibles avec un prix connu.
  const withPrice = ranked.filter((p) => Number(p.priceValue) > 0 && scoreOf(p) > 0);
  if (withPrice.length) {
    const best = withPrice
      .slice()
      .sort((a, b) => scoreOf(b) / b.priceValue - scoreOf(a) / a.priceValue)[0];
    if (best && best.id !== ranked[0]?.id && !badges.has(best.id))
      badges.set(best.id, BADGE.value);
  }

  // Override manuel : le badge saisi gagne toujours.
  for (const p of list) if (p.badge) badges.set(p.id, p.badge);
  return badges;
}

// --- D. STATUTS (vocabulaire officiel -> état) -------------------------
/** Classe un statut brut en état de cycle de vie. */
export function statusClass(raw) {
  if (!raw) return 'empty';
  const s = String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (/^(valid|a integr|integr|publi|en ligne|live|actif|ok)/.test(s)) return 'published';
  if (/(a remplacer|indisponible|archiv|retir|obsolet)/.test(s)) return 'retired';
  if (/(recherch|verifier|brouillon|draft|en attente|inactif|masqu|hidden)/.test(s))
    return 'draft';
  return 'unknown';
}
