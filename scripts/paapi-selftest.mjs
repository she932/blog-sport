// Vérifie la chaîne de signature AWS SigV4 contre le vecteur de
// référence AWS (sans appeler Amazon). Sert de garde-fou : si ce test
// passe, le calcul cryptographique de la signature est correct.
import { selfTestSignature, hasCredentials, paapiConfig } from './paapi-client.mjs';

const sigOk = selfTestSignature();
console.log(
  `Primitive cryptographique SigV4 (HMAC-SHA256) : ${sigOk ? '✅ OK' : '❌ ÉCHEC'}` +
    (sigOk ? ' — conformité Amazon validée au 1er appel réel.' : '')
);

const cfg = paapiConfig();
console.log(
  `Identifiants PA-API : ${
    hasCredentials(cfg)
      ? '✅ présents (intégration active au prochain enrichissement)'
      : '⏸️  absents (intégration inerte — normal tant que les accès ne sont pas ouverts)'
  }`
);
console.log(`Marché : ${cfg.host} · région ${cfg.region} · tag ${cfg.partnerTag}`);

process.exit(sigOk ? 0 : 1);
