// ============================================================
//  Couche catalogue typée (TypeScript + Zod) pour les pages Astro.
//
//  - Schéma Zod = contrat de données validé au build.
//  - Types TS inférés du schéma (source unique de forme).
//  - Fonctions de lecture qui réutilisent le MOTEUR DE RÈGLES unique
//    (scripts/catalog-rules.mjs) : notation, vedette, badges, classement.
//    Aucune règle n'est dupliquée ici.
//
//  Consommé uniquement au build (pages Astro / SSG). Multi-pays via le
//  paramètre `country` (défaut = marketplace actif).
// ============================================================
import { z } from 'zod';
// Règles métier officielles (source unique de vérité) — fonctions PURES,
// sûres au bundling Vite (aucun accès disque).
import {
  PUBLISH_THRESHOLD,
  displayScore,
  verdictFromScore,
  isPublishable,
  rankProducts,
  selectFeatured,
  assignBadges,
} from '../../scripts/catalog-rules.mjs';
import { isDraftStatus } from '../../scripts/lib.mjs';
// Configuration marketplaces (pays actif).
import marketplaces from '../../data/marketplaces.json';

// Données catalogue chargées via Vite (import.meta.glob) : robuste au build,
// contrairement à un fs Node dont les chemins ne survivent pas au bundling.
// Ordre : data/products.json puis data/products/*.json (fichiers « _ » ignorés).
const _modules = import.meta.glob(['../../data/products.json', '../../data/products/*.json'], {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function rawProducts(): unknown[] {
  const out: unknown[] = [];
  for (const key of Object.keys(_modules).sort()) {
    const base = key.split('/').pop() || '';
    if (base.startsWith('_')) continue; // fichiers modèles/exemples ignorés
    const data = _modules[key];
    const list = Array.isArray(data)
      ? data
      : ((data as { products?: unknown[] })?.products ?? []);
    for (const p of list) out.push(p);
  }
  return out;
}

// --- Schéma & types ----------------------------------------------------
export const specSchema = z.object({ label: z.string(), value: z.string() });
export const faqSchema = z.object({ question: z.string(), answer: z.string() });

/** Contrat officiel d'un produit du catalogue MuscuGuide. */
export const productSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    keyword: z.string().min(1),
    brand: z.string().optional(),
    category: z.string().optional(),
    badge: z.string().optional(),
    asin: z.string().optional(),
    amazonUrl: z.string().optional(),
    asinByCountry: z.record(z.string(), z.string()).optional(),
    image: z.string().optional(),
    rank: z.number().optional(),
    scoreInternal: z.number().min(0).max(100).optional(),
    mgScore: z.number().min(0).max(5).optional(),
    rating: z.number().min(0).max(5).optional(),
    reviews: z.number().int().min(0).optional(),
    verdict: z.string().optional(),
    summary: z.string().optional(),
    blurb: z.string().optional(),
    pros: z.array(z.string()).optional(),
    cons: z.array(z.string()).optional(),
    specs: z.array(specSchema).optional(),
    faq: z.array(faqSchema).optional(),
    related: z.array(z.string()).optional(),
    audience: z.string().optional(),
    updated: z.string().optional(),
    status: z.string().optional(),
    priceValue: z.number().optional(),
  })
  // Champs additionnels tolérés (ex. données live PA-API préfixées `_`).
  .loose();

export type Product = z.infer<typeof productSchema>;
export type Spec = z.infer<typeof specSchema>;
export type Faq = z.infer<typeof faqSchema>;

export interface CatalogOptions {
  /** Pays / marketplace (défaut : marketplace actif de data/marketplaces.json). */
  country?: string;
  /** Inclure les brouillons (audit). Par défaut, seuls les produits publiés. */
  includeDrafts?: boolean;
}

// --- Lecture (build-time) ----------------------------------------------
let _cachePublished: Product[] | null = null;
let _cacheAll: Product[] | null = null;

/** Pays actif : env AMAZON_COUNTRY, sinon `active` de marketplaces.json. */
export function activeCountry(): string {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  return (
    env?.AMAZON_COUNTRY ||
    (marketplaces as { active?: string }).active ||
    'FR'
  );
}

/**
 * Charge, valide et dédoublonne l'ensemble du catalogue (produits publiés
 * par défaut). Déduplication par `id` (dernière définition gagnante, comme
 * loadProducts). Entrées invalides ignorées et signalées au build.
 */
export function getCatalog(opts: CatalogOptions = {}): Product[] {
  if (opts.includeDrafts && _cacheAll) return _cacheAll;
  if (!opts.includeDrafts && _cachePublished) return _cachePublished;

  const byId = new Map<string, Product>();
  for (const item of rawProducts()) {
    if (!item || typeof item !== 'object' || !(item as { id?: string }).id) continue;
    const parsed = productSchema.safeParse(item);
    if (!parsed.success) {
      const id = (item as { id?: string }).id ?? '?';
      console.warn(`[catalog] produit ignoré (${id}) : ${parsed.error.issues[0]?.message}`);
      continue;
    }
    byId.set(parsed.data.id, parsed.data); // dernière définition gagnante
  }
  const all = [...byId.values()];
  _cacheAll = all;
  const published = all.filter((p) => !isDraftStatus(p.status));
  _cachePublished = published;
  return opts.includeDrafts ? all : published;
}

/** Liste des catégories présentes (slugs), triées. */
export function getCategories(opts: CatalogOptions = {}): string[] {
  const set = new Set<string>();
  for (const p of getCatalog(opts)) if (p.category) set.add(p.category);
  return [...set].sort();
}

/** Produits d'une catégorie, classés selon les règles (publiables d'abord). */
export function getProductsByCategory(category: string, opts: CatalogOptions = {}): Product[] {
  const country = opts.country ?? activeCountry();
  const list = getCatalog(opts).filter((p) => p.category === category);
  return rankProducts(list, { country }) as Product[];
}

/** Produit vedette d'une catégorie (1er publiable après classement), ou null. */
export function getFeatured(category: string, opts: CatalogOptions = {}): Product | null {
  const country = opts.country ?? activeCountry();
  const list = getCatalog(opts).filter((p) => p.category === category);
  return (selectFeatured(list, { country }) as Product | null) ?? null;
}

/** Map id -> badge appliqué (auto + override) pour une catégorie. */
export function getBadges(category: string, opts: CatalogOptions = {}): Map<string, string> {
  const country = opts.country ?? activeCountry();
  const list = getCatalog(opts).filter((p) => p.category === category);
  return assignBadges(list, { country }) as Map<string, string>;
}

/** Un produit est-il publiable pour le pays donné ? (règle officielle) */
export function productIsPublishable(product: Product, opts: CatalogOptions = {}): boolean {
  const country = opts.country ?? activeCountry();
  return Boolean(isPublishable(product, { country }));
}

/** Note d'affichage /5 d'un produit (à partir du score interne /100). */
export function scoreOutOfFive(product: Product): number | undefined {
  if (typeof product.scoreInternal === 'number') return displayScore(product.scoreInternal);
  return product.mgScore;
}

/** Mot de verdict à partir du score interne /100. */
export function scoreVerdict(product: Product): string | undefined {
  if (typeof product.scoreInternal === 'number') return verdictFromScore(product.scoreInternal);
  return product.verdict;
}

export { PUBLISH_THRESHOLD };
