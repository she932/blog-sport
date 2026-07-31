// ============================================================
//  Rapport de couverture ASIN.
//  Usage : npm run report:asins
//
//  Pour chaque produit de data/products.json :
//   - nombre de liens réellement générés dans les articles publiés
//     (marqueurs [[BOX:id]] et [[LINK:id]]) ;
//   - état de l'ASIN : valide / manquant / invalide ;
//   - type de lien qui sera produit au build : « fiche produit » ou
//     « recherche » (repli).
//
//  Aucun effet de bord : lecture seule. Sert à prioriser la saisie
//  des ASIN (remplir d'abord les produits les plus utilisés).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, BLOG_DIR, readJson, isValidAsin } from './lib.mjs';

const { products } = readJson(path.join(DATA_DIR, 'products.json'));

// Compte les occurrences [[BOX:id]] / [[LINK:id]] dans les articles.
const usage = new Map();
const re = /\[\[(?:BOX|LINK):([a-z0-9-]+)/gi;
if (fs.existsSync(BLOG_DIR)) {
  for (const f of fs.readdirSync(BLOG_DIR)) {
    if (!f.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8');
    let m;
    while ((m = re.exec(txt)) !== null) {
      const id = m[1];
      usage.set(id, (usage.get(id) || 0) + 1);
    }
  }
}

const rows = products
  .map((p) => {
    const asin = p.asin ? String(p.asin).trim() : '';
    let status;
    if (!asin) status = 'MANQUANT';
    else if (isValidAsin(asin)) status = 'valide';
    else status = 'INVALIDE';
    return {
      id: p.id,
      keyword: p.keyword || p.name || '',
      asin,
      status,
      links: usage.get(p.id) || 0,
      linkType: status === 'valide' ? 'fiche produit' : 'recherche (repli)',
    };
  })
  .sort((a, b) => b.links - a.links);

const withAsin = rows.filter((r) => r.status === 'valide').length;
const invalid = rows.filter((r) => r.status === 'INVALIDE').length;
const totalLinks = rows.reduce((s, r) => s + r.links, 0);
const productLinks = rows
  .filter((r) => r.status === 'valide')
  .reduce((s, r) => s + r.links, 0);

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\n  Couverture ASIN — MuscuGuide');
console.log('  ' + '─'.repeat(72));
console.log(
  '  ' +
    pad('produit', 22) +
    pad('liens', 7) +
    pad('ASIN', 14) +
    pad('état', 11) +
    'type de lien'
);
console.log('  ' + '─'.repeat(72));
for (const r of rows) {
  const flag = r.status === 'valide' ? '✅' : r.status === 'INVALIDE' ? '⚠️ ' : '❌';
  console.log(
    '  ' +
      pad(r.id, 22) +
      padL(r.links, 4) +
      '   ' +
      pad(r.asin || '—', 14) +
      pad(flag + ' ' + r.status, 11) +
      r.linkType
  );
}
console.log('  ' + '─'.repeat(72));
console.log(
  `  Produits avec ASIN valide : ${withAsin}/${rows.length}` +
    (invalid ? `  (⚠️  ${invalid} ASIN invalide à corriger)` : '')
);
const pct = totalLinks ? Math.round((productLinks / totalLinks) * 100) : 0;
console.log(
  `  Liens « fiche produit » : ${productLinks}/${totalLinks} (${pct}%) — le reste bascule en recherche.`
);
console.log(
  '  Astuce : remplis en priorité les produits du haut (les plus utilisés).\n'
);

// Code de sortie non nul si des produits utilisés n'ont pas d'ASIN,
// pratique pour un futur contrôle CI (mais jamais appelé au build).
const usedWithoutAsin = rows.filter((r) => r.links > 0 && r.status !== 'valide');
process.exitCode = usedWithoutAsin.length > 0 ? 1 : 0;
