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
 * Retourne { products, duplicates, files, invalid }.
 */
export function loadProducts() {
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
  return { products: [...byId.values()], duplicates, invalid, files: sources };
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
 * Construit un lien affilié Amazon.
 *  - ASIN valide  -> fiche produit /dp/ASIN (bien meilleure conversion)
 *  - sinon        -> repli sur une recherche /s?k=mot-clé
 * Le tag d'affiliation est toujours conservé, dans les deux cas.
 */
export function buildAffiliateUrl(product, tag, domain) {
  const asin = product.asin ? String(product.asin).trim() : '';
  if (isValidAsin(asin)) {
    return `https://www.${domain}/dp/${asin.toUpperCase()}?tag=${tag}&linkCode=ogi&psc=1`;
  }
  const q = encodeURIComponent(product.keyword || product.name);
  return `https://www.${domain}/s?k=${q}&tag=${tag}`;
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
