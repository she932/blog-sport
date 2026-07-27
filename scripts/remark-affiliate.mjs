// ============================================================
//  Plugin remark : transforme les marqueurs affiliés en HTML au build.
//    [[BOX:id]]         -> bloc CTA encadré (encadré produit)
//    [[LINK:id]]        -> lien inline (ancre = nom du produit)
//    [[LINK:id|ancre]]  -> lien inline avec ancre personnalisée
//
//  Le tag et le domaine Amazon sont lus dans process.env au moment
//  du build, si bien qu'il suffit de rebuilder pour changer de tag.
//
//  Plafond : au maximum MAX_BOXES encadrés par article. Les [[BOX]]
//  supplémentaires sont automatiquement rétrogradés en lien texte,
//  ce qui garantit la règle pour les articles existants ET futurs.
// ============================================================
import path from 'node:path';
import { DATA_DIR, readJson, buildAffiliateUrl, escapeHtml } from './lib.mjs';

const TAG = process.env.AMAZON_AFFILIATE_TAG || 'muscuguide-21';
const DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.fr';

/** Nombre maximum d'encadrés produits par article. */
const MAX_BOXES = 2;

const { products } = readJson(path.join(DATA_DIR, 'products.json'));
const byId = new Map(products.map((p) => [p.id, p]));

const resolve = (id) =>
  byId.get(id) || { id, name: id.replace(/-/g, ' '), keyword: id.replace(/-/g, ' ') };

function boxHtml(id) {
  const p = resolve(id);
  const url = buildAffiliateUrl(p, TAG, DOMAIN);
  const desc = p.blurb ? `<p class="aff-desc">${escapeHtml(p.blurb)}</p>` : '';
  return (
    `<div class="affiliate-box">` +
    `<div class="aff-info">` +
    `<span class="aff-label">Notre recommandation</span>` +
    `<span class="aff-name">${escapeHtml(p.name)}</span>` +
    desc +
    `</div>` +
    `<div class="aff-cta">` +
    `<a class="aff-btn" href="${url}" target="_blank" rel="nofollow sponsored noopener">` +
    `<span>Voir le prix sur Amazon</span>` +
    `<span class="aff-btn-arrow" aria-hidden="true">→</span>` +
    `</a>` +
    `<span class="aff-note">Prix &amp; disponibilité sur Amazon</span>` +
    `</div>` +
    `</div>`
  );
}

function linkHtml(id, anchor) {
  const p = resolve(id);
  const url = buildAffiliateUrl(p, TAG, DOMAIN);
  const text = (anchor || p.name).trim();
  return `<a class="aff-inline" href="${url}" target="_blank" rel="nofollow sponsored noopener">${escapeHtml(text)}</a>`;
}

// Tolérant aux fautes de frappe du type de marqueur : seul « BOX » produit
// un bloc CTA, tout autre mot-clé (LINK, mais aussi une variante mal
// orthographiée comme « LINM ») est traité comme un lien inline. Ainsi, un
// marqueur jamais transformé ne peut pas s'afficher en clair sur le site.
const PLACEHOLDER = /\[\[([A-Za-z]+):([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Découpe un texte en nœuds mdast (text / html) selon les marqueurs.
 * `state.boxes` compte les encadrés déjà rendus pour l'article courant :
 * au-delà de MAX_BOXES, un [[BOX]] est rétrogradé en lien inline.
 */
function splitText(value, state) {
  const nodes = [];
  let last = 0;
  let m;
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(value)) !== null) {
    if (m.index > last) {
      nodes.push({ type: 'text', value: value.slice(last, m.index) });
    }
    const kind = m[1].toUpperCase();
    let html;
    if (kind === 'BOX') {
      if (state.boxes < MAX_BOXES) {
        html = boxHtml(m[2]);
        state.boxes += 1;
      } else {
        // Plafond atteint : on rétrograde l'encadré en lien texte.
        html = linkHtml(m[2], m[3]);
      }
    } else {
      html = linkHtml(m[2], m[3]);
    }
    nodes.push({ type: 'html', value: html });
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    nodes.push({ type: 'text', value: value.slice(last) });
  }
  return nodes;
}

function transformChildren(node, state) {
  if (!node.children || node.children.length === 0) return;
  const out = [];
  for (const child of node.children) {
    if (child.type === 'text' && PLACEHOLDER.test(child.value)) {
      out.push(...splitText(child.value, state));
    } else {
      transformChildren(child, state);
      out.push(child);
    }
  }
  node.children = out;
}

/** Sort les blocs CTA de leur paragraphe englobant (<p><div>… -> <div>…). */
function unwrapBoxes(node) {
  if (!node.children || node.children.length === 0) return;
  const out = [];
  for (const child of node.children) {
    if (
      child.type === 'paragraph' &&
      child.children.length === 1 &&
      child.children[0].type === 'html' &&
      child.children[0].value.startsWith('<div class="affiliate-box"')
    ) {
      out.push(child.children[0]);
    } else {
      unwrapBoxes(child);
      out.push(child);
    }
  }
  node.children = out;
}

export default function remarkAffiliate() {
  return (tree) => {
    // Un compteur par fichier : le plafond d'encadrés est réinitialisé
    // pour chaque article.
    const state = { boxes: 0 };
    transformChildren(tree, state);
    unwrapBoxes(tree);
  };
}
