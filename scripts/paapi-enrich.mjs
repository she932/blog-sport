// ============================================================
//  Enrichissement PA-API -> cache de build.
//  Usage :
//    npm run enrich:paapi              (réel, si clés présentes)
//    npm run enrich:paapi -- --dry-run (simulation, sans API)
//
//  Lit les ASIN de data/products.json, interroge PA-API GetItems par
//  lots de 10, et écrit data/products.cache.json (image, prix live,
//  Prime, dispo). Ce cache est ensuite fusionné au build par le plugin
//  remark pour enrichir les encadrés.
//
//  SÉCURITÉ CI : best-effort. Sans clés -> ne fait rien (inerte). En cas
//  d'erreur -> log + sort en code 0 pour NE JAMAIS casser un déploiement
//  (sauf --strict).
// ============================================================
import path from 'node:path';
import { DATA_DIR, writeJson, loadProducts, isValidAsin } from './lib.mjs';
import {
  paapiConfig,
  hasCredentials,
  getItems,
  normalizeItem,
} from './paapi-client.mjs';

const DRY =
  process.argv.includes('--dry-run') || process.env.PAAPI_DRY_RUN === '1';
const STRICT = process.argv.includes('--strict');
const CACHE_FILE = path.join(DATA_DIR, 'products.cache.json');

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

function writeCache(items) {
  writeJson(CACHE_FILE, {
    _comment:
      'Cache généré automatiquement par scripts/paapi-enrich.mjs. NE PAS éditer à la main. Fusionné au build pour enrichir les encadrés (image, prix live, Prime). Ignoré par git.',
    updatedAt: new Date().toISOString(),
    items,
  });
}

// Item simulé (mode --dry-run) : permet de tester toute la chaîne
// enrich -> cache -> build -> rendu sans appeler Amazon.
function mockItem(asin, product) {
  return {
    asin,
    title: product?.name,
    image: process.env.PAAPI_DRY_IMAGE || '/demo-product.svg',
    url: `https://www.amazon.fr/dp/${asin}`,
    priceAmount: 24.99,
    priceFormatted: '24,99 €',
    prime: true,
    availability: 'En stock',
  };
}

async function main() {
  const { products } = loadProducts();
  const withAsin = products.filter((p) => isValidAsin(p.asin));

  const cfg = paapiConfig();
  if (!DRY && !hasCredentials(cfg)) {
    console.log(
      'PA-API : identifiants absents — enrichissement désactivé (inerte).\n' +
        '         Ajoute les secrets GitHub pour activer (voir data/PAAPI.md).'
    );
    return; // n'écrase pas un éventuel cache existant
  }

  if (withAsin.length === 0) {
    console.log(
      'PA-API : aucun produit avec ASIN valide — cache vidé (rien à enrichir).'
    );
    return writeCache({});
  }

  console.log(
    `PA-API : enrichissement de ${withAsin.length} produit(s)` +
      (DRY ? ' (SIMULATION)' : '') +
      ` via ${cfg.host}…`
  );

  const items = {};
  for (const batch of chunk(withAsin.map((p) => p.asin), 10)) {
    try {
      if (DRY) {
        for (const asin of batch) {
          items[asin] = mockItem(
            asin,
            withAsin.find((p) => p.asin === asin)
          );
        }
      } else {
        const resp = await getItems(batch, cfg);
        for (const it of resp?.ItemsResult?.Items || []) {
          const n = normalizeItem(it);
          if (n.asin) items[n.asin] = n;
        }
        if (resp?.Errors) {
          console.warn(
            'PA-API : erreurs partielles —',
            JSON.stringify(resp.Errors).slice(0, 300)
          );
        }
      }
    } catch (e) {
      console.warn('PA-API : lot en échec (ignoré) —', e.message);
      if (STRICT) process.exitCode = 1;
    }
  }

  writeCache(items);
  console.log(
    `PA-API : ${Object.keys(items).length} produit(s) en cache${
      DRY ? ' (simulation)' : ''
    } -> ${path.relative(process.cwd(), CACHE_FILE)}`
  );
}

main().catch((e) => {
  // Ne jamais casser le build à cause de l'enrichissement.
  console.warn('PA-API : échec global (ignoré) —', e.message);
});
