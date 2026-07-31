// ============================================================
//  Client Amazon Product Advertising API 5.0 (PA-API) — autonome.
//
//  - Signature AWS Signature V4 via le module crypto natif (aucune
//    dépendance externe).
//  - Opération GetItems (enrichissement par ASIN).
//  - Lit les identifiants dans l'environnement ; inactif s'ils manquent.
//
//  RIEN n'est appelé tant que les clés ne sont pas configurées :
//  hasCredentials() renvoie false et les scripts appelants ne font rien.
//
//  Marché France : host webservices.amazon.fr, région eu-west-1.
//  PA-API 5.0 NE fournit PAS les notes/avis clients (retirés par Amazon).
// ============================================================
import crypto from 'node:crypto';

const SERVICE = 'ProductAdvertisingAPI';

/** Récupère la configuration depuis l'environnement. */
export function paapiConfig() {
  return {
    accessKey: process.env.AMAZON_PAAPI_ACCESS_KEY || '',
    secretKey: process.env.AMAZON_PAAPI_SECRET_KEY || '',
    partnerTag:
      process.env.AMAZON_PARTNER_TAG ||
      process.env.AMAZON_AFFILIATE_TAG ||
      'muscuguide-21',
    host: process.env.AMAZON_PAAPI_HOST || 'webservices.amazon.fr',
    region: process.env.AMAZON_PAAPI_REGION || 'eu-west-1',
    marketplace: process.env.AMAZON_PAAPI_MARKETPLACE || 'www.amazon.fr',
  };
}

/** Vraies clés présentes ? Sinon toute l'intégration reste inerte. */
export function hasCredentials(cfg = paapiConfig()) {
  return Boolean(cfg.accessKey && cfg.secretKey && cfg.partnerTag);
}

// ---------- Signature AWS V4 ----------
const sha256hex = (data) =>
  crypto.createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key, data) =>
  crypto.createHmac('sha256', key).update(data, 'utf8').digest();

function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/**
 * Construit les en-têtes signés pour un POST PA-API.
 * Exporté pour permettre un test/inspection sans envoyer la requête.
 */
export function signRequest({ cfg, target, path, body, now = new Date() }) {
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: cfg.host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };

  // En-têtes signés : ordre lexicographique.
  const signedHeaderNames = [
    'content-encoding',
    'host',
    'x-amz-date',
    'x-amz-target',
  ];
  const canonicalHeaders =
    signedHeaderNames.map((h) => `${h}:${headers[h]}`).join('\n') + '\n';
  const signedHeaders = signedHeaderNames.join(';');

  const payloadHash = sha256hex(body);
  const canonicalRequest = [
    'POST',
    path,
    '', // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const key = signingKey(cfg.secretKey, dateStamp, cfg.region, SERVICE);
  const signature = crypto
    .createHmac('sha256', key)
    .update(stringToSign, 'utf8')
    .digest('hex');

  headers['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

// Ressources demandées à PA-API pour l'enrichissement des encadrés.
const GETITEMS_RESOURCES = [
  'Images.Primary.Large',
  'ItemInfo.Title',
  'Offers.Listings.Price',
  'Offers.Listings.Availability.Message',
  'Offers.Listings.DeliveryInfo.IsPrimeEligible',
  'Offers.Summaries.LowestPrice',
];

/**
 * Appelle GetItems pour un lot d'ASIN (10 max par requête PA-API).
 * Renvoie la réponse JSON brute. Lève en cas d'erreur réseau/HTTP :
 * l'appelant (paapi-enrich) capture et reste best-effort.
 */
export async function getItems(asins, cfg = paapiConfig()) {
  if (!hasCredentials(cfg)) {
    throw new Error('PA-API : identifiants absents');
  }
  const path = '/paapi5/getitems';
  const target =
    'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
  const payload = {
    ItemIds: asins,
    ItemIdType: 'ASIN',
    PartnerTag: cfg.partnerTag,
    PartnerType: 'Associates',
    Marketplace: cfg.marketplace,
    Resources: GETITEMS_RESOURCES,
  };
  const body = JSON.stringify(payload);
  const headers = signRequest({ cfg, target, path, body });

  const res = await fetch(`https://${cfg.host}${path}`, {
    method: 'POST',
    headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PA-API HTTP ${res.status} : ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

/**
 * Normalise un item PA-API vers la forme minimale stockée en cache.
 * Champs absents -> undefined (le rendu s'adapte).
 */
export function normalizeItem(item) {
  const listing = item?.Offers?.Listings?.[0];
  const summary = item?.Offers?.Summaries?.[0]?.LowestPrice;
  const price = listing?.Price || summary;
  return {
    asin: item?.ASIN,
    title: item?.ItemInfo?.Title?.DisplayValue,
    image: item?.Images?.Primary?.Large?.URL,
    url: item?.DetailPageURL,
    priceAmount: price?.Amount,
    priceFormatted: price?.DisplayAmount,
    prime: Boolean(listing?.DeliveryInfo?.IsPrimeEligible),
    availability: listing?.Availability?.Message,
  };
}

/**
 * Auto-test de la primitive cryptographique de la signature, SANS appeler
 * Amazon :
 *  1. HMAC-SHA256 vérifié contre un vecteur de test universel et
 *     incontestable (« The quick brown fox… »), qui est exactement la
 *     primitive utilisée à chaque étape de SigV4 ;
 *  2. chaîne de dérivation de clé (kDate→kRegion→kService→kSigning)
 *     déterministe et de longueur correcte (32 octets).
 *
 * La conformité de bout en bout avec Amazon est, elle, validée au premier
 * appel réel (le jour de l'activation) — impossible hors ligne.
 */
export function selfTestSignature() {
  const primitive = crypto
    .createHmac('sha256', 'key')
    .update('The quick brown fox jumps over the lazy dog', 'utf8')
    .digest('hex');
  const primitiveOk =
    primitive ===
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8';

  const key = signingKey('secret', '20150830', 'eu-west-1', SERVICE);
  const chainOk = Buffer.isBuffer(key) && key.length === 32;

  return primitiveOk && chainOk;
}
