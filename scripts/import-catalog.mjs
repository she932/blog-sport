#!/usr/bin/env node
// ============================================================
//  Importe le catalogue produits depuis la base officielle MuscuGuide
//  (fichier .xlsx, onglet « Import Claude ») ou un export .csv, et génère
//  les fichiers de catégorie data/products/<categorie>.json.
//
//  Applique les RÈGLES MÉTIER officielles (scripts/catalog-rules.mjs) :
//  score /100 -> /5, verdict par paliers, seuil de publication, statuts.
//
//  Usage :
//    npm run import:catalog                          # data/import/*.xlsx|csv
//    node scripts/import-catalog.mjs --file=x.xlsx   # fichier précis
//    node scripts/import-catalog.mjs --sheet="Import Claude"
//    node scripts/import-catalog.mjs --dry           # aperçu, sans écrire
//    node scripts/import-catalog.mjs --out=chemin    # dossier de sortie
//
//  Feed reconnu (en-têtes FR ou EN, ordre libre, casse/accents ignorés) :
//    Catégorie/category, Badge, Nom/name, Marque/brand, ASIN/asin,
//    URL Amazon/amazonUrl, Image, Score MuscuGuide/score, Verdict,
//    Description/summary, Points forts/pros, Points faibles/cons,
//    Profil/profile, Statut/status, Rang/rank, Note Amazon, Nombre d'avis.
//  Cellules « 0 » ou vides = champ absent. Multi-valeurs séparées par « | ».
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, slugify, normalizeAsin, isValidAsin } from './lib.mjs';
import { parseScore, verdictFromScore } from './catalog-rules.mjs';
import { readXlsxSheet } from './lib-xlsx.mjs';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const DRY = args.includes('--dry');
const SHEET = getArg('sheet', 'Import Claude');
const OUT_DIR = path.resolve(getArg('out', path.join(DATA_DIR, 'products')));
// Filtre de statut optionnel : n'importe que les lignes dont le statut
// commence par cette valeur (ex. --status=Validé). Vide = toutes les lignes.
const STATUS_FILTER = getArg('status', '');
const deaccent = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Fichier : --file, sinon 1er .xlsx/.csv dans data/import/.
function defaultFile() {
  const dir = path.join(DATA_DIR, 'import');
  if (!fs.existsSync(dir)) return path.join(dir, 'catalogue.csv');
  const cand = fs
    .readdirSync(dir)
    .filter((f) => /\.(xlsx|csv)$/i.test(f) && !f.startsWith('~'))
    .sort((a, b) => Number(b.endsWith('.xlsx')) - Number(a.endsWith('.xlsx'))); // xlsx prioritaire
  return path.join(dir, cand[0] || 'catalogue.csv');
}
const FILE = path.resolve(getArg('file', defaultFile()));

// --- Parseur CSV tolérant (guillemets, retours ligne, ; ou ,) ----------
function parseCsv(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.slice(0, (text.indexOf('\n') + 1 || text.length + 1) - 1);
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const normHeader = (h) =>
  String(h)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const HEADER_MAP = {
  id: 'id',
  categorie: 'category', category: 'category',
  badge: 'badge',
  nom: 'name', name: 'name', produit: 'name',
  marque: 'brand', brand: 'brand',
  asin: 'asin', 'asin fr': 'asin',
  'url amazon': 'amazonUrl', 'url amazon fr': 'amazonUrl', amazonurl: 'amazonUrl', url: 'amazonUrl',
  affiliateurl: '_ignore', 'lien affilie final': '_ignore', 'tag affilie': '_ignore',
  image: 'image', 'image url / pa-api': 'image',
  'score muscuguide': 'score', 'score muscuguide /100': 'score', score: 'score',
  verdict: 'verdict',
  'description courte': 'summary', description: 'summary', 'resume court': 'summary', resume: 'summary', summary: 'summary',
  'points forts': 'pros', avantages: 'pros', pros: 'pros',
  'points faibles': 'cons', inconvenients: 'cons', cons: 'cons',
  'profil utilisateur': 'audience', 'profil ideal': 'audience', profil: 'audience', profile: 'audience', public: 'audience', audience: 'audience',
  statut: 'status', status: 'status',
  rang: 'rank', rank: 'rank',
  'mot-cle': 'keyword', 'mot cle': 'keyword', keyword: 'keyword',
  'note amazon': 'rating', note: 'rating', rating: 'rating',
  "nombre d'avis": 'reviews', avis: 'reviews', reviews: 'reviews',
};

const splitMulti = (v) =>
  String(v).split(/\s*\|\s*|\s*\n\s*/).map((s) => s.trim()).filter(Boolean);

// Traite « 0 », « - », « n/a », vide comme ABSENT (placeholders du feed).
const blank = (v) => {
  const s = String(v ?? '').trim();
  return s === '' || s === '0' || s === '0.0' || s === '-' || /^n\/?a$/i.test(s) ? '' : s;
};
const toInt = (v) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
};
const toNum = (v) => {
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

// --- Lecture ------------------------------------------------------------
if (!fs.existsSync(FILE)) {
  console.error(`❌  Fichier introuvable : ${FILE}`);
  console.error('    Placez la base dans data/import/ ou passez --file=chemin');
  process.exit(1);
}

let rows;
if (/\.xlsx$/i.test(FILE)) {
  try {
    rows = readXlsxSheet(FILE, SHEET);
  } catch (e) {
    console.error(`❌  Lecture XLSX impossible : ${e.message}`);
    process.exit(1);
  }
} else {
  rows = parseCsv(fs.readFileSync(FILE, 'utf-8'));
}

// Ligne d'en-tête = 1re ligne contenant un en-tête reconnu clé (id/nom/name).
const isHeaderRow = (r) => {
  const set = new Set(r.map((c) => HEADER_MAP[normHeader(c)]));
  return set.has('id') || set.has('name');
};
const hi = rows.findIndex(isHeaderRow);
if (hi < 0) {
  console.error('❌  En-têtes introuvables (aucune colonne id/nom/name reconnue).');
  process.exit(1);
}
const headers = rows[hi].map((h) => HEADER_MAP[normHeader(h)] || null);
const unknown = rows[hi].filter((h) => String(h).trim() && !HEADER_MAP[normHeader(h)]);
if (unknown.length) console.warn(`⚠️  Colonnes ignorées : ${unknown.join(', ')}`);

const warnings = [];
const seenIds = new Set();
const products = [];

for (let r = hi + 1; r < rows.length; r++) {
  if (!rows[r] || !rows[r].some((c) => String(c).trim() !== '')) continue;
  const raw = {};
  headers.forEach((field, c) => {
    if (field && field !== '_ignore') raw[field] = String(rows[r][c] ?? '').trim();
  });
  // Nom vide ou placeholder « 0 » (lignes de gabarit du feed) → ignorée
  // silencieusement (ce ne sont pas des produits).
  const name = blank(raw.name);
  if (!name) continue;
  raw.name = name;
  // Filtre de statut (ex. --status=Validé) : ignore les lignes non conformes.
  if (STATUS_FILTER && !deaccent(raw.status).startsWith(deaccent(STATUS_FILTER))) continue;

  const id = slugify(blank(raw.id) || name);
  if (seenIds.has(id)) warnings.push(`ligne ${r + 1} : id en double « ${id} » (dernier gagne)`);
  seenIds.add(id);

  const asin = normalizeAsin(blank(raw.asin)) || normalizeAsin(blank(raw.amazonUrl));
  const { internal, display } = parseScore(blank(raw.score));

  const p = {
    id,
    name: raw.name,
    keyword: raw.keyword || raw.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    asin: asin || '',
  };
  if (raw.brand) p.brand = raw.brand;
  if (raw.category) p.category = slugify(raw.category);
  if (raw.badge) p.badge = raw.badge;
  const rank = toInt(blank(raw.rank));
  if (rank !== undefined) p.rank = rank;
  if (blank(raw.amazonUrl) && !asin) p.amazonUrl = raw.amazonUrl;
  if (blank(raw.image)) p.image = raw.image;
  if (internal !== undefined) {
    p.scoreInternal = internal; // /100 (interne, classement)
    p.mgScore = display; // /5 (affichage)
  }
  const rating = toNum(blank(raw.rating));
  if (rating !== undefined && rating > 0 && rating <= 5) p.rating = rating;
  const reviews = toInt(blank(raw.reviews));
  if (reviews) p.reviews = reviews;
  p.verdict = raw.verdict || (internal !== undefined ? verdictFromScore(internal) : undefined);
  if (raw.summary) p.summary = raw.summary;
  if (raw.pros) p.pros = splitMulti(raw.pros);
  if (raw.cons) p.cons = splitMulti(raw.cons);
  if (raw.audience) p.audience = raw.audience;
  if (raw.status) p.status = raw.status;

  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  p._category = p.category || slugify(raw.category || 'divers');
  products.push(p);
}

// --- Regroupement par catégorie ----------------------------------------
const byCategory = new Map();
for (const p of products) {
  const cat = p._category;
  delete p._category;
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(p);
}

const isDraft = (p) => /^(a rechercher|a verifier|asin|brouillon|draft|inactif|masqu|a remplacer|indisponible|archiv|retir)/i.test(
  (p.status || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
);

console.log(`\n  Import catalogue — ${path.relative(process.cwd(), FILE)}${/\.xlsx$/i.test(FILE) ? ` (onglet « ${SHEET} »)` : ''}`);
console.log('  ' + '─'.repeat(58));
if (STATUS_FILTER) console.log(`  Filtre statut       : « ${STATUS_FILTER} » uniquement`);
console.log(`  Produits importés   : ${products.length}`);
console.log(`  Catégories          : ${byCategory.size}`);
console.log(`  ASIN valides        : ${products.filter((p) => isValidAsin(p.asin)).length}/${products.length}`);
console.log(`  Avec score          : ${products.filter((p) => p.scoreInternal !== undefined).length}`);
console.log(`  Brouillons (masqués): ${products.filter(isDraft).length}`);

if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [cat, list] of [...byCategory].sort()) {
  let file = path.join(OUT_DIR, `${cat}.json`);
  // Ne JAMAIS écraser un fichier fait main (non « _generated ») : on écrit
  // l'import à côté (<cat>.import.json) pour que les deux coexistent. Les
  // produits importés (ids distincts) fusionnent avec l'existant sans le
  // détruire — les références des articles au produit historique restent
  // valides. Un fichier déjà généré est, lui, remplacé normalement.
  if (fs.existsSync(file)) {
    let handmade = false;
    try {
      handmade = !JSON.parse(fs.readFileSync(file, 'utf8'))._generated;
    } catch {
      /* fichier illisible : on ne l'écrase pas */
      handmade = true;
    }
    if (handmade) {
      file = path.join(OUT_DIR, `${cat}.import.json`);
      warnings.push(
        `catégorie « ${cat} » : fichier fait main conservé → import écrit dans ${path.basename(file)}`
      );
    }
  }
  const payload = {
    _comment: `Catégorie « ${cat} » — GÉNÉRÉ par scripts/import-catalog.mjs depuis ${path.basename(FILE)}. Ne pas éditer à la main : modifier la base puis relancer l'import.`,
    _generated: true,
    products: list,
  };
  const rel = path.relative(process.cwd(), file);
  if (DRY) console.log(`  · ${cat.padEnd(26)} ${String(list.length).padStart(3)}  → ${rel} (aperçu)`);
  else {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
    console.log(`  ✅ ${cat.padEnd(26)} ${String(list.length).padStart(3)}  → ${rel}`);
  }
}

if (warnings.length) {
  console.log(`\n  ⚠️  ${warnings.length} avertissement(s) :`);
  warnings.slice(0, 20).forEach((w) => console.log('     - ' + w));
}
console.log(
  DRY
    ? '\n  Aperçu terminé (aucun fichier écrit). Retirez --dry pour importer.\n'
    : '\n  Import terminé. Lancez `npm run products:check` puis `npm run build`.\n'
);
