#!/usr/bin/env node
// ============================================================
//  Validation métier du catalogue (règles MuscuGuide V2).
//  Complète products:check (doublons, ASIN, champs) par les contrôles
//  de cohérence : références liées, badges/statuts officiels, plages de
//  score, un seul « Choix MuscuGuide » manuel par catégorie, rang.
//
//  Usage : npm run catalog:validate
//  Sort en erreur (code 1) si au moins une ERREUR est détectée.
// ============================================================
import { loadProducts, isValidAsin, isDraftStatus } from './lib.mjs';
import { BADGE, statusClass, PUBLISH_THRESHOLD } from './catalog-rules.mjs';

const OFFICIAL_BADGES = new Set([
  BADGE.choice,
  BADGE.value,
  BADGE.premium,
  BADGE.expert,
  'Rapport qualité-prix',
  'Idéal débutant',
  'Idéal Home Gym',
  'Performance',
  'Petit budget',
]);

const { products, drafts, duplicates } = loadProducts({ includeDrafts: true });
const ids = new Set(products.map((p) => p.id));
const errors = [];
const warns = [];

// Doublons d'id (déjà repérés par loadProducts).
for (const d of duplicates) errors.push(`id dupliqué « ${d.id} » (${rel(d.file)})`);

for (const p of products) {
  const where = `« ${p.id} »`;
  // Champs requis.
  if (!p.name) errors.push(`${where} : name manquant`);
  if (!p.keyword) errors.push(`${where} : keyword manquant`);
  // ASIN : vide OK, sinon doit être valide.
  if (p.asin && !isValidAsin(p.asin)) errors.push(`${where} : ASIN invalide « ${p.asin} »`);
  // Références liées.
  for (const r of p.related || [])
    if (!ids.has(r)) warns.push(`${where} : produit lié inconnu « ${r} »`);
  // Score interne 0–100.
  if (p.scoreInternal != null && (p.scoreInternal < 0 || p.scoreInternal > 100))
    errors.push(`${where} : scoreInternal hors [0,100] (${p.scoreInternal})`);
  // Note d'affichage 0–5.
  if (p.mgScore != null && (p.mgScore < 0 || p.mgScore > 5))
    errors.push(`${where} : mgScore hors [0,5] (${p.mgScore})`);
  // Note Amazon 0–5.
  if (p.rating != null && (p.rating < 0 || p.rating > 5))
    errors.push(`${where} : rating hors [0,5] (${p.rating})`);
  // Rang entier positif.
  if (p.rank != null && (!Number.isInteger(p.rank) || p.rank < 1))
    warns.push(`${where} : rank devrait être un entier ≥ 1 (${p.rank})`);
  // Badge officiel (avertissement seulement).
  if (p.badge && !OFFICIAL_BADGES.has(p.badge))
    warns.push(`${where} : badge non officiel « ${p.badge} »`);
  // Statut reconnu.
  if (p.status && statusClass(p.status) === 'unknown')
    warns.push(`${where} : statut non reconnu « ${p.status} »`);
  // Produit marqué publiable mais sans ASIN -> lien de recherche (info).
  if (!isDraftStatus(p.status) && !isValidAsin(p.asin))
    warns.push(`${where} : visible sans ASIN → lien de recherche (conforme, à compléter)`);
}

// Un seul « Choix MuscuGuide » manuel par catégorie.
const choiceByCat = new Map();
for (const p of [...products, ...drafts])
  if (p.badge === BADGE.choice) {
    const c = p.category || '(sans catégorie)';
    choiceByCat.set(c, (choiceByCat.get(c) || 0) + 1);
  }
for (const [c, n] of choiceByCat)
  if (n > 1) warns.push(`catégorie « ${c} » : ${n} badges « ${BADGE.choice} » (un seul recommandé)`);

// --- Rapport -----------------------------------------------------------
function rel(f) {
  return String(f).replace(process.cwd() + '/', '');
}
console.log('\n  Validation métier du catalogue (règles V2)');
console.log('  ' + '─'.repeat(52));
console.log(`  Produits publiés : ${products.length}  ·  brouillons : ${drafts.length}`);
console.log(`  Seuil de publication : ${PUBLISH_THRESHOLD}/100`);
console.log(`  Erreurs : ${errors.length}  ·  Avertissements : ${warns.length}`);
if (errors.length) {
  console.log('\n  🚨 Erreurs :');
  errors.slice(0, 40).forEach((e) => console.log('    • ' + e));
}
if (warns.length) {
  console.log('\n  ⚠️  Avertissements :');
  warns.slice(0, 40).forEach((w) => console.log('    • ' + w));
}
console.log(errors.length ? '\n  ❌ Catalogue à corriger.\n' : '\n  ✅ Catalogue conforme aux règles V2.\n');
process.exit(errors.length ? 1 : 0);
