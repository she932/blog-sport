// ============================================================
//  Plugin remark : transforme les marqueurs affiliés en HTML au build.
//    [[BOX:id]]         -> bloc CTA encadré
//    [[LINK:id]]        -> lien inline (ancre = nom du produit)
//    [[LINK:id|ancre]]  -> lien inline avec ancre personnalisée
//
//  Le tag et le domaine Amazon sont lus dans process.env au moment
//  du build, si bien qu'il suffit de rebuilder pour changer de tag.
// ============================================================
import path from 'node:path';
import { DATA_DIR, readJson, buildAffiliateUrl, escapeHtml } from './lib.mjs';

const TAG = process.env.AMAZON_AFFILIATE_TAG || 'votretag-21';
const DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.fr';

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
    `<div class="aff-label">Notre recommandation</div>` +
    `<div class="aff-name">${escapeHtml(p.name)}</div>` +
    desc +
    `</div>` +
    `<div class="aff-cta"><a class="aff-btn" href="${url}" target="_blank" rel="nofollow sponsored noopener">Voir le prix sur Amazon</a></div>` +
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

/** Découpe un texte en nœuds mdast (text / html) selon les marqueurs. */
function splitText(value) {
  const nodes = [];
  let last = 0;
  let m;
  PLACEHOLDER.lastIndex = 0;
  while ((m = PLACEHOLDER.exec(value)) !== null) {
    if (m.index > last) {
      nodes.push({ type: 'text', value: value.slice(last, m.index) });
    }
    const kind = m[1].toUpperCase();
    const html = kind === 'BOX' ? boxHtml(m[2]) : linkHtml(m[2], m[3]);
    nodes.push({ type: 'html', value: html });
    last = m.index + m[0].length;
  }
  if (last < value.length) {
    nodes.push({ type: 'text', value: value.slice(last) });
  }
  return nodes;
}

function transformChildren(node) {
  if (!node.children || node.children.length === 0) return;
  const out = [];
  for (const child of node.children) {
    if (child.type === 'text' && PLACEHOLDER.test(child.value)) {
      out.push(...splitText(child.value));
    } else {
      transformChildren(child);
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
    transformChildren(tree);
    unwrapBoxes(tree);
  };
}
