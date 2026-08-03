#!/usr/bin/env node
// ============================================================
//  Importe un catalogue produits depuis un fichier CSV (export Excel)
//  et génère les fichiers de catégorie data/products/<categorie>.json
//  au format officiel MuscuGuide.
//
//  Usage :
//    npm run import:catalog                       # data/import/catalogue.csv
//    node scripts/import-catalog.mjs --file=x.csv # fichier personnalisé
//    node scripts/import-catalog.mjs --dry        # aperçu, sans écrire
//
//  Le CSV peut être séparé par « ; » (Excel FR) ou « , ». Les cellules
//  multi-valeurs (Points forts / Points faibles) se séparent par « | ».
//  Colonnes reconnues (ordre libre, en-têtes insensibles à la casse/accents) :
//    Catégorie, Badge, Nom, Marque, ASIN, URL Amazon, Image,
//    Score MuscuGuide, Description courte, Points forts, Points faibles,
//    Profil utilisateur, Statut
//  Colonnes optionnelles : id, Mot-clé, Note, Avis, Verdict, Résumé,
//    ASIN UK, ASIN DE, ASIN ES (multi-pays).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, slugify, normalizeAsin, isValidAsin } from './lib.mjs';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const DRY = args.includes('--dry');
const FILE = path.resolve(getArg('file', path.join(DATA_DIR, 'import', 'catalogue.csv')));
const OUT_DIR = path.resolve(getArg('out', path.join(DATA_DIR, 'products')));

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
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Normalise un en-tête : minuscules, sans accents, espaces compactés.
const normHeader = (h) =>
  h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Table de correspondance en-tête -> champ produit.
const HEADER_MAP = {
  id: 'id',
  categorie: 'category',
  badge: 'badge',
  nom: 'name',
  marque: 'brand',
  asin: 'asin',
  'url amazon': 'amazonUrl',
  url: 'amazonUrl',
  image: 'image',
  'score muscuguide': 'mgScore',
  score: 'mgScore',
  'description courte': 'summary',
  description: 'summary',
  resume: 'summary',
  summary: 'summary',
  'points forts': 'pros',
  avantages: 'pros',
  'points faibles': 'cons',
  inconvenients: 'cons',
  'profil utilisateur': 'audience',
  profil: 'audience',
  public: 'audience',
  audience: 'audience',
  statut: 'status',
  status: 'status',
  'mot-cle': 'keyword',
  'mot cle': 'keyword',
  keyword: 'keyword',
  note: 'rating',
  rating: 'rating',
  avis: 'reviews',
  reviews: 'reviews',
  verdict: 'verdict',
  'asin uk': 'asin_UK',
  'asin de': 'asin_DE',
  'asin es': 'asin_ES',
};

const splitMulti = (v) =>
  String(v)
    .split(/\s*\|\s*|\s*\n\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

const toNumber = (v) => {
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

// --- Lecture + mapping --------------------------------------------------
if (!fs.existsSync(FILE)) {
  console.error(`❌  Fichier introuvable : ${FILE}`);
  console.error('    Placez votre export CSV ici, ou passez --file=chemin.csv');
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(FILE, 'utf-8'));
if (rows.length < 2) {
  console.error('❌  CSV vide ou sans ligne de données.');
  process.exit(1);
}

const headers = rows[0].map((h) => HEADER_MAP[normHeader(h)] || null);
const unknown = rows[0].filter((h) => !HEADER_MAP[normHeader(h)]);
if (unknown.length) console.warn(`⚠️  Colonnes ignorées : ${unknown.join(', ')}`);

const warnings = [];
const seenIds = new Set();
const products = [];

for (let r = 1; r < rows.length; r++) {
  const raw = {};
  headers.forEach((field, c) => {
    if (field) raw[field] = (rows[r][c] ?? '').trim();
  });
  if (!raw.name) {
    warnings.push(`ligne ${r + 1} : « Nom » manquant → ignorée`);
    continue;
  }

  const id = slugify(raw.id || raw.name);
  if (seenIds.has(id)) warnings.push(`ligne ${r + 1} : id en double « ${id} » (dernier gagne)`);
  seenIds.add(id);

  // ASIN : colonne ASIN sinon extrait de l'URL Amazon.
  const asin = normalizeAsin(raw.asin) || normalizeAsin(raw.amazonUrl);
  if (raw.asin && !isValidAsin(normalizeAsin(raw.asin)) && !asin)
    warnings.push(`ligne ${r + 1} : ASIN invalide « ${raw.asin} » → lien de recherche`);

  const asinByCountry = {};
  for (const cc of ['UK', 'DE', 'ES']) {
    const a = normalizeAsin(raw[`asin_${cc}`]);
    if (a) asinByCountry[cc] = a;
  }

  const p = {
    id,
    name: raw.name,
    keyword: raw.keyword || raw.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    asin: asin || '',
  };
  if (raw.brand) p.brand = raw.brand;
  if (raw.category) p.category = slugify(raw.category);
  if (raw.badge) p.badge = raw.badge;
  if (raw.amazonUrl && !asin) p.amazonUrl = raw.amazonUrl;
  if (Object.keys(asinByCountry).length) p.asinByCountry = asinByCountry;
  if (raw.image) p.image = raw.image;
  if (raw.mgScore !== undefined && raw.mgScore !== '') p.mgScore = toNumber(raw.mgScore);
  if (raw.rating) p.rating = toNumber(raw.rating);
  if (raw.reviews) p.reviews = Math.round(toNumber(raw.reviews) || 0) || undefined;
  if (raw.verdict) p.verdict = raw.verdict;
  if (raw.summary) p.summary = raw.summary;
  if (raw.pros) p.pros = splitMulti(raw.pros);
  if (raw.cons) p.cons = splitMulti(raw.cons);
  if (raw.audience) p.audience = raw.audience;
  if (raw.status) p.status = raw.status;

  // Nettoie les clés indéfinies.
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];

  products.push({ ...p, _category: p.category || slugify(raw.category || 'divers') });
}

// --- Regroupement par catégorie ----------------------------------------
const byCategory = new Map();
for (const p of products) {
  const cat = p._category;
  delete p._category;
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(p);
}

console.log(`\n  Import catalogue — ${path.relative(process.cwd(), FILE)}`);
console.log('  ' + '─'.repeat(56));
console.log(`  Produits lus       : ${products.length}`);
console.log(`  Catégories         : ${byCategory.size}`);
const withAsin = products.filter((p) => isValidAsin(p.asin)).length;
console.log(`  ASIN valides       : ${withAsin}/${products.length}`);
const drafts = products.filter((p) => /^(draft|brouillon|inactif|masqu|archiv)/i.test(p.status || '')).length;
if (drafts) console.log(`  Brouillons (exclus): ${drafts}`);

if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [cat, list] of [...byCategory].sort()) {
  const file = path.join(OUT_DIR, `${cat}.json`);
  const payload = {
    _comment: `Catégorie « ${cat} » — GÉNÉRÉ par scripts/import-catalog.mjs depuis ${path.basename(FILE)}. Ne pas éditer à la main : modifiez le CSV puis relancez l'import.`,
    _generated: true,
    products: list,
  };
  const rel = path.relative(process.cwd(), file);
  if (DRY) {
    console.log(`  · ${cat.padEnd(24)} ${String(list.length).padStart(3)} produits  → ${rel} (aperçu)`);
  } else {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
    console.log(`  ✅ ${cat.padEnd(24)} ${String(list.length).padStart(3)} produits  → ${rel}`);
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
