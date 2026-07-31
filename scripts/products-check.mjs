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
const { products, duplicates, invalid, files } = loadProducts();

console.log('\n  Catalogue produits — ' + (FIX ? 'correction' : 'validation'));
console.log('  ' + '─'.repeat(56));
console.log('  Fichiers chargés :');
for (const f of files) console.log('    • ' + rel(f));
console.log(`  Produits (uniques) : ${products.length}`);

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
if (duplicates.length) {
  console.log('\n  ⚠️  Doublons d\'id (dernière définition gardée) :');
  for (const d of duplicates) console.log(`    • ${d.id}  (${rel(d.file)})`);
}
if (invalid.length) {
  console.log('\n  ❌ Champs requis manquants :');
  for (const i of invalid) console.log(`    • ${i.id} — ${i.reason}  (${rel(i.file)})`);
}

const clean = !fixable.length && !broken.length && !duplicates.length && !invalid.length;
if (clean) console.log('\n  ✅ Catalogue sain.' + (corrections.length ? ' Corrections appliquées.' : ''));
console.log('');

process.exitCode = clean ? 0 : 1;
