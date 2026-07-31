// ============================================================
//  Validation du catalogue produits (multi-fichiers).
//  Usage : npm run products:check
//
//  Charge data/products.json + data/products/*.json via loadProducts(),
//  puis vérifie :
//   - doublons d'id (dernière définition gagnante),
//   - champs requis manquants (name / keyword),
//   - couverture ASIN.
//  Lecture seule. Code de sortie non nul si doublons ou champs manquants
//  (pratique pour un futur contrôle, mais jamais appelé au build).
// ============================================================
import path from 'node:path';
import { loadProducts, isValidAsin } from './lib.mjs';

const { products, duplicates, invalid, files } = loadProducts();

const rel = (f) => path.relative(process.cwd(), f);

console.log('\n  Catalogue produits — validation');
console.log('  ' + '─'.repeat(56));
console.log('  Fichiers chargés :');
for (const f of files) console.log('    • ' + rel(f));
console.log(`  Produits (uniques) : ${products.length}`);

const withAsin = products.filter((p) => isValidAsin(p.asin)).length;
const invalidAsin = products.filter(
  (p) => p.asin && String(p.asin).trim() && !isValidAsin(p.asin)
).length;
console.log(
  `  ASIN valides : ${withAsin}/${products.length}` +
    (invalidAsin ? `  (⚠️  ${invalidAsin} ASIN mal formé)` : '')
);

let problems = 0;
if (duplicates.length) {
  problems += duplicates.length;
  console.log('\n  ⚠️  Doublons d\'id (la dernière définition écrase les précédentes) :');
  for (const d of duplicates) console.log(`    • ${d.id}  (dans ${rel(d.file)})`);
}
if (invalid.length) {
  problems += invalid.length;
  console.log('\n  ❌ Champs requis manquants :');
  for (const i of invalid) console.log(`    • ${i.id}  — ${i.reason}  (${rel(i.file)})`);
}
if (invalidAsin) {
  console.log('\n  ⚠️  ASIN mal formés (10 caractères alphanumériques attendus) :');
  for (const p of products) {
    if (p.asin && String(p.asin).trim() && !isValidAsin(p.asin)) {
      console.log(`    • ${p.id} : "${p.asin}"`);
    }
  }
}

if (!problems && !invalidAsin) {
  console.log('\n  ✅ Catalogue sain : aucun doublon, aucun champ requis manquant.');
}
console.log('');

process.exitCode = problems > 0 ? 1 : 0;
