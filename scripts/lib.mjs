// Fonctions utilitaires partagées par les scripts de génération.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
export const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
export const DATA_DIR = path.join(ROOT, 'data');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Charge le catalogue produits depuis PLUSIEURS sources, fusionnées :
 *   1. data/products.json            (base historique)
 *   2. data/products/<categorie>.json (un fichier par lot/catégorie)
 *
 * Chaque fichier peut être soit un tableau de produits, soit un objet
 * { "products": [...] }. Les fichiers dont le nom commence par « _ »
 * (ex. _TEMPLATE.json) sont ignorés. Déduplication par `id` : en cas de
 * doublon, la dernière définition l'emporte (et le doublon est signalé).
 *
 * => Ajouter des produits = déposer un fichier JSON dans data/products/,
 *    sans toucher au code.
 *
 * Le champ `status` pilote la publication : un produit « brouillon » /
 * « draft » est EXCLU du site (non rendu, non proposé), mais reste dans le
 * catalogue. Par défaut, `products` ne contient que les produits publiés ;
 * passez { includeDrafts: true } pour tout obtenir (audit, rapports).
 *
 * Retourne { products, drafts, duplicates, files, invalid }.
 */
export function isDraftStatus(status) {
  return (
    typeof status === 'string' &&
    /^(draft|brouillon|inactif|masqu|hidden|archiv)/i.test(status.trim())
  );
}

export function loadProducts({ includeDrafts = false } = {}) {
  const sources = [];
  const base = path.join(DATA_DIR, 'products.json');
  if (fs.existsSync(base)) sources.push(base);

  const dir = path.join(DATA_DIR, 'products');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.json') && !f.startsWith('_')) sources.push(path.join(dir, f));
    }
  }

  const byId = new Map();
  const duplicates = [];
  const invalid = [];
  for (const file of sources) {
    let data;
    try {
      data = readJson(file);
    } catch (e) {
      throw new Error(`Catalogue produits : JSON invalide dans ${file} — ${e.message}`);
    }
    const list = Array.isArray(data) ? data : data.products || [];
    for (const p of list) {
      if (!p || typeof p !== 'object' || !p.id) continue; // ignore commentaires/entrées vides
      if (!p.name || !p.keyword) {
        invalid.push({ id: p.id, file, reason: 'champ requis manquant (name/keyword)' });
      }
      if (byId.has(p.id)) duplicates.push({ id: p.id, file });
      byId.set(p.id, p); // dernière définition gagnante
    }
  }
  const all = [...byId.values()];
  const drafts = all.filter((p) => isDraftStatus(p.status));
  const published = all.filter((p) => !isDraftStatus(p.status));
  return {
    products: includeDrafts ? all : published,
    drafts,
    duplicates,
    invalid,
    files: sources,
  };
}

/** Slugifie une chaîne (accents retirés, minuscules, tirets). */
export function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

/** Liste les slugs de base (sans préfixe date) des articles déjà publiés. */
export function existingBaseSlugs() {
  if (!fs.existsSync(BLOG_DIR)) return new Set();
  const slugs = new Set();
  for (const f of fs.readdirSync(BLOG_DIR)) {
    if (!f.endsWith('.md')) continue;
    // format : YYYY-MM-DD-slug.md -> on retire la date
    const base = f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    slugs.add(base);
  }
  return slugs;
}

/**
 * Valide un ASIN Amazon : exactement 10 caractères alphanumériques
 * (le plus souvent « B0… »). Sert de garde-fou : un ASIN mal saisi
 * (trop court, avec espaces, collé depuis une URL) est rejeté plutôt
 * que de produire un lien /dp/ cassé.
 */
export function isValidAsin(asin) {
  return typeof asin === 'string' && /^[A-Z0-9]{10}$/i.test(asin.trim());
}

/**
 * Normalise un ASIN saisi de façon tolérante : extrait le code à 10
 * caractères d'une URL Amazon collée (…/dp/ASIN, …/gp/product/ASIN),
 * retire les espaces et met en majuscules. Renvoie '' si rien
 * d'exploitable (l'appelant peut alors signaler l'erreur).
 *
 * Exemples :
 *   "https://www.amazon.fr/dp/B08N5WRWNW/ref=x" -> "B08N5WRWNW"
 *   " b08n5wrwnw "                              -> "B08N5WRWNW"
 *   "/dp/B08N5WRWNW"                            -> "B08N5WRWNW"
 *   "pas un asin"                               -> ""
 */
export function normalizeAsin(input) {
  if (!input) return '';
  const s = String(input).trim();
  const m = s.match(/(?:\/dp\/|\/gp\/product\/)([A-Za-z0-9]{10})(?:[/?]|$)/);
  if (m) return m[1].toUpperCase();
  const bare = s.replace(/\s+/g, '');
  if (/^[A-Za-z0-9]{10}$/.test(bare)) return bare.toUpperCase();
  return '';
}

/**
 * Résout l'ASIN d'un produit pour un pays donné, de façon tolérante.
 * Ordre de priorité :
 *   1. asinByCountry[country]  (multi-pays : ASIN spécifique à ce marché)
 *   2. asin                    (ASIN principal du produit)
 *   3. amazonUrl / url         (URL Amazon collée -> ASIN extrait)
 * Renvoie un ASIN à 10 caractères en majuscules, ou '' si rien d'exploitable.
 *
 * => Pour mettre à jour un produit, il suffit de remplacer l'ASIN (ou de
 *    coller une URL Amazon) : le lien /dp/ est recalculé au prochain build.
 */
export function resolveAsin(product, country) {
  if (!product) return '';
  const byCountry =
    country && product.asinByCountry ? product.asinByCountry[country] : '';
  return normalizeAsin(byCountry || product.asin || product.amazonUrl || product.url || '');
}

/**
 * Construit un lien affilié Amazon.
 *  - ASIN valide  -> fiche produit /dp/ASIN (bien meilleure conversion)
 *  - sinon        -> repli sur une recherche /s?k=mot-clé
 * Le tag d'affiliation est toujours conservé, dans les deux cas.
 *
 * `country` (optionnel) sélectionne l'ASIN spécifique au marché via
 * `asinByCountry`, ce qui permet d'ajouter des pays (UK, DE, ES…) sans
 * modifier cette fonction.
 */
export function buildAffiliateUrl(product, tag, domain, country) {
  // Normalisation tolérante : une URL collée ou un ASIN avec espaces
  // produit tout de même un lien fiche produit correct.
  const asin = resolveAsin(product, country);
  if (asin) {
    return `https://www.${domain}/dp/${asin}?tag=${tag}&linkCode=ogi&psc=1`;
  }
  const q = encodeURIComponent(product.keyword || product.name);
  return `https://www.${domain}/s?k=${q}&tag=${tag}`;
}

/**
 * Charge la configuration des marketplaces (pays Amazon) depuis
 * data/marketplaces.json, avec repli/surcharge par l'environnement.
 * Retourne le marché ACTIF prêt à l'emploi : { country, domain, tag,
 * marketplaces }. Ajouter un pays = ajouter une entrée dans le JSON.
 */
export function loadMarketplaces() {
  let cfg = {};
  const file = path.join(DATA_DIR, 'marketplaces.json');
  try {
    cfg = readJson(file);
  } catch {
    /* fichier absent : on retombe sur les valeurs par défaut FR */
  }
  const marketplaces = cfg.marketplaces || {};
  const country = process.env.AMAZON_COUNTRY || cfg.active || 'FR';
  const m = marketplaces[country] || {};
  const domain = process.env.AMAZON_DOMAIN || m.domain || 'amazon.fr';
  const tag = process.env.AMAZON_AFFILIATE_TAG || m.tag || 'muscuguide-21';
  return { country, domain, tag, marketplaces };
}

/** Échappe les guillemets pour une valeur de frontmatter YAML entre quotes. */
export function yamlString(str) {
  return '"' + String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Remplace les marqueurs affiliés dans le markdown généré :
 *   [[BOX:id]]            -> bloc CTA stylé
 *   [[LINK:id]]           -> lien inline (ancre = nom du produit)
 *   [[LINK:id|ancre]]     -> lien inline avec ancre personnalisée
 * Les marqueurs dont l'id est inconnu retombent sur une recherche Amazon.
 */
export function injectAffiliateLinks(markdown, products, tag, domain) {
  const byId = new Map(products.map((p) => [p.id, p]));

  const resolve = (id) =>
    byId.get(id) || { id, name: id.replace(/-/g, ' '), keyword: id.replace(/-/g, ' ') };

  let out = markdown;

  // Blocs CTA
  out = out.replace(/\[\[BOX:([a-z0-9-]+)\]\]/gi, (_m, id) => {
    const p = resolve(id);
    const url = buildAffiliateUrl(p, tag, domain);
    const desc = p.blurb ? `<p class="aff-desc">${escapeHtml(p.blurb)}</p>` : '';
    return (
      `<div class="affiliate-box">` +
      `<div class="aff-info">` +
      `<div class="aff-label">Notre recommandation</div>` +
      `<div class="aff-name">${escapeHtml(p.name)}</div>` +
      desc +
      `</div>` +
      `<div class="aff-cta"><a class="aff-btn" href="${url}" target="_blank" rel="nofollow sponsored noopener">Voir le prix sur Amazon</a></div>` +
      `</div>`
    );
  });

  // Liens inline
  out = out.replace(
    /\[\[LINK:([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi,
    (_m, id, anchor) => {
      const p = resolve(id);
      const url = buildAffiliateUrl(p, tag, domain);
      const text = (anchor || p.name).trim();
      return `<a class="aff-inline" href="${url}" target="_blank" rel="nofollow sponsored noopener">${escapeHtml(text)}</a>`;
    }
  );

  return out;
}

export function countWords(markdown) {
  return markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}
