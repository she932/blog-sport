// ============================================================
//  Validation (et correction) du catalogue produits multi-fichiers.
//  Usage :
//    npm run products:check       (rapport seul, lecture seule)
//    npm run products:fix         (corrige automatiquement ce qui peut l'être)
//
//  Vérifie : fichiers chargés, doublons d'id, champs requis (name/keyword),
//  et état des ASIN. Auto-correction (--fix) : extrait l'ASIN d'une URL
//  Amazon collée, retire les espaces, met en majuscules, et réécrit le
//  fichier source concerné. Ne touche jamais un ASIN déjà valide.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR,
  readJson,
  writeJson,
  loadProducts,
  isValidAsin,
  normalizeAsin,
} from './lib.mjs';

const FIX = process.argv.includes('--fix');
const rel = (f) => path.relative(process.cwd(), f);

// Sources dans le même ordre que loadProducts().
function sourceFiles() {
  const files = [];
  const base = path.join(DATA_DIR, 'products.json');
  if (fs.existsSync(base)) files.push(base);
  const dir = path.join(DATA_DIR, 'products');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.json') && !f.startsWith('_')) files.push(path.join(dir, f));
    }
  }
  return files;
}

// ---- Auto-correction des ASIN (--fix) ----
const corrections = [];
if (FIX) {
  for (const file of sourceFiles()) {
    const data = readJson(file);
    const list = Array.isArray(data) ? data : data.products || [];
    let changed = false;
    for (const p of list) {
      if (!p || !p.id || !p.asin) continue;
      const raw = String(p.asin).trim();
      if (isValidAsin(raw) && raw === raw.toUpperCase()) continue; // déjà bon
      const norm = normalizeAsin(raw);
      if (norm && norm !== raw) {
        corrections.push({ id: p.id, from: raw, to: norm, file });
        p.asin = norm;
        changed = true;
      }
    }
    if (changed) writeJson(file, data);
  }
}

// ---- Rapport ----
const { products, drafts, duplicates, invalid, files } = loadProducts({
  includeDrafts: true,
});

console.log('\n  Catalogue produits — ' + (FIX ? 'correction' : 'validation'));
console.log('  ' + '─'.repeat(56));
console.log('  Fichiers chargés :');
for (const f of files) console.log('    • ' + rel(f));
console.log(`  Produits (uniques) : ${products.length}`);
if (drafts.length)
  console.log(`  Dont brouillons (exclus du site) : ${drafts.length}`);

const valid = products.filter((p) => isValidAsin(p.asin));
// ASIN non stricts mais récupérables (URL, espaces) — corrigeables.
const fixable = products.filter(
  (p) => p.asin && !isValidAsin(p.asin) && normalizeAsin(p.asin)
);
const broken = products.filter(
  (p) => p.asin && String(p.asin).trim() && !normalizeAsin(p.asin)
);
console.log(`  ASIN valides : ${valid.length}/${products.length}`);

if (corrections.length) {
  console.log('\n  🔧 Corrigés automatiquement :');
  for (const c of corrections)
    console.log(`    • ${c.id} : "${c.from}" -> ${c.to}  (${rel(c.file)})`);
}
if (fixable.length) {
  console.log('\n  ⚠️  ASIN corrigeables (lance `npm run products:fix`) :');
  for (const p of fixable) console.log(`    • ${p.id} : "${p.asin}" -> ${normalizeAsin(p.asin)}`);
}
if (broken.length) {
  console.log('\n  ❌ ASIN illisibles (à corriger à la main) :');
  for (const p of broken) console.log(`    • ${p.id} : "${p.asin}"`);
}
// ---- Validation de la structure enrichie ----
const ids = new Set(products.map((p) => p.id));
const structIssues = [];
const dangling = [];
const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
for (const p of products) {
  if (p.rating != null && (typeof p.rating !== 'number' || p.rating < 0 || p.rating > 5))
    structIssues.push(`${p.id} : 'rating' doit être un nombre entre 0 et 5`);
  if (p.reviews != null && (typeof p.reviews !== 'number' || p.reviews < 0))
    structIssues.push(`${p.id} : 'reviews' doit être un entier positif`);
  if (p.pros != null && !isStrArray(p.pros))
    structIssues.push(`${p.id} : 'pros' doit être une liste de textes`);
  if (p.cons != null && !isStrArray(p.cons))
    structIssues.push(`${p.id} : 'cons' doit être une liste de textes`);
  if (p.specs != null) {
    if (!Array.isArray(p.specs) || !p.specs.every((s) => s && s.label != null && s.value != null))
      structIssues.push(`${p.id} : 'specs' doit être une liste de { label, value }`);
  }
  if (p.faq != null) {
    if (!Array.isArray(p.faq) || !p.faq.every((f) => f && f.question != null && f.answer != null))
      structIssues.push(`${p.id} : 'faq' doit être une liste de { question, answer }`);
  }
  if (p.related != null) {
    if (!isStrArray(p.related))
      structIssues.push(`${p.id} : 'related' doit être une liste d'identifiants`);
    else
      for (const r of p.related)
        if (!ids.has(r)) dangling.push(`${p.id} → produit lié introuvable : "${r}"`);
  }
}
if (structIssues.length) {
  console.log('\n  ❌ Structure invalide :');
  for (const s of structIssues) console.log(`    • ${s}`);
}
if (dangling.length) {
  console.log('\n  ⚠️  Produits liés non résolus (référence à corriger) :');
  for (const d of dangling) console.log(`    • ${d}`);
}
if (duplicates.length) {
  console.log('\n  ⚠️  Doublons d\'id (dernière définition gardée) :');
  for (const d of duplicates) console.log(`    • ${d.id}  (${rel(d.file)})`);
}
if (invalid.length) {
  console.log('\n  ❌ Champs requis manquants :');
  for (const i of invalid) console.log(`    • ${i.id} — ${i.reason}  (${rel(i.file)})`);
}

const clean =
  !fixable.length &&
  !broken.length &&
  !duplicates.length &&
  !invalid.length &&
  !structIssues.length &&
  !dangling.length;
if (clean) console.log('\n  ✅ Catalogue sain.' + (corrections.length ? ' Corrections appliquées.' : ''));
console.log('');

process.exitCode = clean ? 0 : 1;
