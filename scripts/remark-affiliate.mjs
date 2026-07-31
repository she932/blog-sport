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
import { DATA_DIR, readJson, loadProducts, buildAffiliateUrl, escapeHtml } from './lib.mjs';

const TAG = process.env.AMAZON_AFFILIATE_TAG || 'muscuguide-21';
const DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.fr';

/** Nombre maximum d'encadrés produits par article. */
const MAX_BOXES = 2;

const { products } = loadProducts();

// Cache PA-API (optionnel) : généré par scripts/paapi-enrich.mjs. Absent
// tant que l'intégration n'est pas activée -> aucune incidence.
let PAAPI_CACHE = { items: {}, updatedAt: null };
try {
  const c = readJson(path.join(DATA_DIR, 'products.cache.json'));
  PAAPI_CACHE = { items: c.items || {}, updatedAt: c.updatedAt || null };
} catch {
  /* pas de cache : normal avant activation PA-API */
}
const cacheDate = PAAPI_CACHE.updatedAt
  ? new Date(PAAPI_CACHE.updatedAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  : null;

/**
 * Fusionne les données live PA-API (par ASIN) dans le produit, sous des
 * clés préfixées `_` pour ne jamais écraser les valeurs manuelles.
 * Précédence au rendu : valeur manuelle > donnée PA-API > rien.
 */
function withLiveData(p) {
  if (!p) return p;
  const asin = p.asin ? String(p.asin).trim().toUpperCase() : '';
  const live = asin ? PAAPI_CACHE.items[asin] : null;
  if (!live) return p;
  return {
    ...p,
    _image: live.image,
    _price: live.priceFormatted, // prix live horodaté
    _priceAsOf: cacheDate,
    _prime: live.prime,
  };
}

const byId = new Map(products.map((p) => [p.id, withLiveData(p)]));

const resolve = (id) =>
  byId.get(id) || { id, name: id.replace(/-/g, ' '), keyword: id.replace(/-/g, ' ') };

/** Formate un nombre d'avis : 1234 -> "1 234", 12500 -> "12 500". */
function formatReviews(n) {
  const v = Number(n);
  if (!v || v < 0) return '';
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Bloc note/avis (chantier n°2). Rendu uniquement si `rating` est un nombre
 * valide entre 0 et 5. Les étoiles pleines sont clippées via --pct en CSS.
 */
function ratingHtml(p) {
  const r = Number(p.rating);
  if (!r || r <= 0 || r > 5) return '';
  const pct = Math.round((r / 5) * 100);
  const num = r.toFixed(1).replace('.', ',');
  const reviews = formatReviews(p.reviews);
  const reviewsHtml = reviews
    ? `<span class="aff-reviews">${reviews}&nbsp;avis</span>`
    : '';
  return (
    `<span class="aff-rating">` +
    `<span class="aff-stars" style="--pct:${pct}%" role="img" aria-label="Note ${num} sur 5">` +
    `<span class="aff-stars-fill">★★★★★</span>★★★★★</span>` +
    `<span class="aff-rating-num">${num}</span>` +
    reviewsHtml +
    `</span>`
  );
}

/**
 * Encadré produit affilié.
 *
 * Champs OBLIGATOIRES : id, name (+ url calculée).
 * Champs OPTIONNELS (chantier n°2) — n'apparaissent que s'ils sont
 * renseignés dans data/products.json, sinon l'encadré reste identique
 * à sa version minimale (aucune régression) :
 *   - image           : URL/chemin d'une image produit
 *   - rating (0-5)     : note moyenne, affichée en étoiles
 *   - reviews          : nombre d'avis
 *   - badge            : remplace le libellé « Notre recommandation »
 *   - priceIndication  : mention de prix INDICATIVE, non-live (voir PRODUCTS.md)
 *
 * Champs LIVE PA-API (préfixe `_`, injectés par withLiveData au build,
 * seulement si le cache existe) — priorité aux valeurs manuelles :
 *   - _image  : image produit Amazon
 *   - _price  : prix live formaté (+ _priceAsOf : date « à jour du »)
 *   - _prime  : éligibilité Prime
 */
function boxHtml(id) {
  const p = resolve(id);
  const url = buildAffiliateUrl(p, TAG, DOMAIN);
  const descText = p.blurb || p.summary; // blurb = ligne courte ; sinon résumé
  const desc = descText ? `<p class="aff-desc">${escapeHtml(String(descText))}</p>` : '';

  // Précédence : valeur manuelle > donnée live PA-API > rien.
  const image = p.image || p._image;
  const media = image
    ? `<div class="aff-media"><img src="${escapeHtml(String(image))}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async"></div>`
    : '';
  const label = p.badge ? escapeHtml(String(p.badge)) : 'Notre recommandation';
  const rating = ratingHtml(p);

  // Prix : le prix live PA-API (horodaté, conforme) prime sur la mention
  // indicative manuelle. Sinon, repli sur priceIndication.
  let price = '';
  if (p._price) {
    const asOf = p._priceAsOf
      ? `<span class="aff-price-asof"> · au ${escapeHtml(String(p._priceAsOf))}</span>`
      : '';
    price = `<span class="aff-price">${escapeHtml(String(p._price))}${asOf}</span>`;
  } else if (p.priceIndication) {
    price = `<span class="aff-price">${escapeHtml(String(p.priceIndication))}</span>`;
  }
  const prime = p._prime
    ? `<span class="aff-prime" aria-label="Éligible Prime">Prime</span>`
    : '';
  const cls = image ? ' affiliate-box--media' : '';

  return (
    `<div class="affiliate-box${cls}">` +
    media +
    `<div class="aff-info">` +
    `<span class="aff-label">${label}</span>` +
    `<span class="aff-name">${escapeHtml(p.name)}</span>` +
    rating +
    desc +
    `</div>` +
    `<div class="aff-cta">` +
    price +
    prime +
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

// ============================================================
//  Fiche produit premium — [[FICHE:id]]
//  Rendu complet et orienté confiance : note MuscuGuide mise en avant,
//  avantages/inconvénients, fiche technique, FAQ repliable, produits liés,
//  CTA Amazon net mais non agressif. HTML pur (aucun JS : accordéon natif
//  <details>) pour un score Lighthouse optimal.
// ============================================================
const svg = (p) =>
  `<svg class="pf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON_CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
const ICON_X = svg('<path d="M18 6 6 18M6 6l12 12"/>');
const ICON_AWARD = svg('<circle cx="12" cy="8" r="6"/><path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1"/>');
const ICON_SHIELD = svg('<path d="M12 2 4 5v6c0 5 3.4 8 8 11 4.6-3 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>');
const ICON_UP = svg('<path d="M7 10v11"/><path d="M18 21H7V10l5-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 1Z"/>');
const ICON_DOWN = svg('<path d="M17 14V3"/><path d="M6 3h11v11l-5 8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2l2-8a2 2 0 0 1 2-1Z"/>');

const commaNum = (n) => String(n).replace('.', ',');

function pfStars(value) {
  const r = Number(value);
  if (!r || r <= 0 || r > 5) return '';
  const pct = Math.round((r / 5) * 100);
  return `<span class="pf-stars" style="--pct:${pct}%" aria-hidden="true"><span class="pf-stars-fill">★★★★★</span>★★★★★</span>`;
}

function pfPrice(p) {
  if (p._price) {
    const asOf = p._priceAsOf
      ? `<span class="pf-price-asof"> · au ${escapeHtml(String(p._priceAsOf))}</span>`
      : '';
    return `<span class="pf-price">${escapeHtml(String(p._price))}${asOf}</span>`;
  }
  return p.priceIndication
    ? `<span class="pf-price">${escapeHtml(String(p.priceIndication))}</span>`
    : '';
}

function pfList(items, kind) {
  if (!Array.isArray(items) || !items.length) return '';
  const icon = kind === 'pro' ? ICON_CHECK : ICON_X;
  const lis = items
    .map((t) => `<li>${icon}<span>${escapeHtml(String(t))}</span></li>`)
    .join('');
  return `<ul class="pf-list pf-list--${kind}">${lis}</ul>`;
}

function pfSpecs(specs) {
  if (!Array.isArray(specs) || !specs.length) return '';
  const rows = specs
    .filter((s) => s && s.label != null && s.value != null)
    .map(
      (s) =>
        `<div class="pf-spec"><dt>${escapeHtml(String(s.label))}</dt><dd>${escapeHtml(String(s.value))}</dd></div>`
    )
    .join('');
  return rows
    ? `<div class="pf-block"><h4 class="pf-h">Fiche technique</h4><dl class="pf-specs">${rows}</dl></div>`
    : '';
}

function pfFaq(faq) {
  if (!Array.isArray(faq) || !faq.length) return '';
  const items = faq
    .filter((f) => f && f.question != null && f.answer != null)
    .map(
      (f) =>
        `<details class="pf-faq-item"><summary>${escapeHtml(String(f.question))}<span class="pf-faq-plus" aria-hidden="true"></span></summary><p>${escapeHtml(String(f.answer))}</p></details>`
    )
    .join('');
  return items
    ? `<div class="pf-block"><h4 class="pf-h">Questions fréquentes</h4>${items}</div>`
    : '';
}

function pfRelated(related) {
  if (!Array.isArray(related) || !related.length) return '';
  const cards = related
    .map((rid) => {
      const rp = byId.get(rid);
      if (!rp) return '';
      const url = buildAffiliateUrl(rp, TAG, DOMAIN);
      const img = rp.image || rp._image;
      const media = img
        ? `<span class="pf-rel-media"><img src="${escapeHtml(String(img))}" alt="${escapeHtml(rp.name)}" loading="lazy" decoding="async"></span>`
        : '';
      const note =
        Number(rp.mgScore) > 0
          ? `<span class="pf-rel-note">${ICON_SHIELD}${commaNum(rp.mgScore)}/5</span>`
          : '';
      return (
        `<a class="pf-rel-card" href="${url}" target="_blank" rel="nofollow sponsored noopener">` +
        media +
        `<span class="pf-rel-info"><span class="pf-rel-name">${escapeHtml(rp.name)}</span>${note}</span>` +
        `<span class="pf-rel-go" aria-hidden="true">→</span>` +
        `</a>`
      );
    })
    .join('');
  return cards
    ? `<div class="pf-block"><h4 class="pf-h">Produits liés</h4><div class="pf-rel">${cards}</div></div>`
    : '';
}

function ficheHtml(id) {
  const p = resolve(id);
  const url = buildAffiliateUrl(p, TAG, DOMAIN);
  const image = p.image || p._image;

  const media = image
    ? `<div class="pf-media"><img src="${escapeHtml(String(image))}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" width="220" height="220"></div>`
    : '';
  const badge = p.badge
    ? `<span class="pf-badge">${ICON_AWARD}${escapeHtml(String(p.badge))}</span>`
    : '';
  const verdict = p.verdict
    ? `<p class="pf-verdict">${escapeHtml(String(p.verdict))}</p>`
    : '';
  const summary = p.summary
    ? `<p class="pf-summary">${escapeHtml(String(p.summary))}</p>`
    : '';

  // Note MuscuGuide (mise en avant) ; repli sur la note clients si absente.
  const mg = Number(p.mgScore) || Number(p.rating);
  const mgHtml =
    mg > 0 && mg <= 5
      ? `<div class="pf-mg"><div class="pf-mg-ring" style="--pct:${Math.round(
          (mg / 5) * 100
        )}"><div class="pf-mg-inner"><span class="pf-mg-num">${commaNum(
          mg.toFixed(1)
        )}</span><span class="pf-mg-max">/5</span></div></div><div class="pf-mg-meta"><span class="pf-mg-label">${ICON_SHIELD}Note MuscuGuide</span>${pfStars(
          mg
        )}</div></div>`
      : '';
  const community =
    Number(p.rating) > 0 && p.reviews
      ? `<div class="pf-community">${pfStars(p.rating)}<span class="pf-community-num">${commaNum(
          p.rating
        )}</span><span class="pf-community-reviews">${formatReviews(
          p.reviews
        )} avis clients</span></div>`
      : '';
  const prime = p._prime ? `<span class="aff-prime" aria-label="Éligible Prime">Prime</span>` : '';

  const prosCons =
    (Array.isArray(p.pros) && p.pros.length) ||
    (Array.isArray(p.cons) && p.cons.length)
      ? `<div class="pf-proscons">` +
        `<div class="pf-col pf-col--pro"><h4 class="pf-h">${ICON_UP}Avantages</h4>${pfList(
          p.pros,
          'pro'
        )}</div>` +
        `<div class="pf-col pf-col--con"><h4 class="pf-h">${ICON_DOWN}Inconvénients</h4>${pfList(
          p.cons,
          'con'
        )}</div>` +
        `</div>`
      : '';

  return (
    `<section class="pfiche">` +
    `<div class="pf-top">` +
    media +
    `<div class="pf-head">` +
    badge +
    `<h3 class="pf-name">${escapeHtml(p.name)}</h3>` +
    verdict +
    `<div class="pf-scores">${mgHtml}${community}</div>` +
    summary +
    `<div class="pf-cta">` +
    `<div class="pf-cta-price">${pfPrice(p)}${prime}</div>` +
    `<a class="pf-btn" href="${url}" target="_blank" rel="nofollow sponsored noopener">` +
    `<span>Voir le prix sur Amazon</span><span class="pf-btn-arrow" aria-hidden="true">→</span></a>` +
    `<span class="pf-note">Prix &amp; disponibilité sur Amazon · lien partenaire</span>` +
    `</div>` +
    `</div>` +
    `</div>` +
    prosCons +
    pfSpecs(p.specs) +
    pfFaq(p.faq) +
    pfRelated(p.related) +
    `</section>`
  );
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
    if (kind === 'FICHE') {
      // Fiche produit complète : non soumise au plafond des encadrés.
      html = ficheHtml(m[2]);
    } else if (kind === 'BOX') {
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
      (child.children[0].value.startsWith('<div class="affiliate-box"') ||
        child.children[0].value.startsWith('<section class="pfiche"'))
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
