# Intégration Amazon PA-API 5.0 — runbook d'activation

Toute l'architecture est **en place mais inerte**. Sans clés, rien ne s'exécute
et rien ne change. Le jour où l'accès API est ouvert, l'activation se fait en
**ajoutant des secrets** — aucun code à modifier.

## Ce que PA-API remplit automatiquement

| Donnée | Source | Rendu dans l'encadré |
|---|---|---|
| Image produit | PA-API `Images.Primary.Large` | vignette |
| Prix **live** | PA-API `Offers.Listings.Price` | prix + « au JJ mois AAAA » (horodaté, conforme) |
| Éligibilité **Prime** | PA-API `DeliveryInfo.IsPrimeEligible` | badge « ✓ Prime » |
| Disponibilité, titre | PA-API | (réservé) |

> ⚠️ **PA-API 5.0 ne fournit PAS les notes/avis clients** (Amazon les a retirés).
> Les étoiles restent donc en saisie manuelle (`rating` / `reviews` dans
> `products.json`). Tout le reste s'automatise.

Précédence au rendu : **valeur manuelle > donnée PA-API > rien**. Une image ou un
badge défini à la main dans `products.json` n'est jamais écrasé.

## Prérequis Amazon

1. **Compte Partenaires Amazon** validé, avec le tag `muscuguide-21`.
2. **Éligibilité PA-API** : Amazon exige **au moins 3 ventes qualifiées**
   avant d'ouvrir l'accès à l'API (et un maintien des ventes ensuite). Les
   liens `/dp/` du chantier 1 servent précisément à décrocher ces ventes.
3. Générer les clés dans « Outils → API Product Advertising » :
   `Access Key` + `Secret Key`.

## Activation (le jour J)

Dans **GitHub → Settings → Secrets and variables → Actions** :

**Secrets** (chiffrés) :
| Nom | Valeur |
|---|---|
| `AMAZON_PAAPI_ACCESS_KEY` | votre Access Key PA-API |
| `AMAZON_PAAPI_SECRET_KEY` | votre Secret Key PA-API |

**Variables** (déjà partiellement présentes) :
| Nom | Valeur France |
|---|---|
| `AMAZON_AFFILIATE_TAG` | `muscuguide-21` (déjà utilisé) |
| `AMAZON_PAAPI_HOST` | `webservices.amazon.fr` |
| `AMAZON_PAAPI_REGION` | `eu-west-1` |
| `AMAZON_PAAPI_MARKETPLACE` | `www.amazon.fr` |

C'est tout. Au prochain build (déploiement ou article quotidien), l'étape
« Enrichir via PA-API » détecte les clés, interroge l'API, écrit le cache et les
encadrés s'enrichissent automatiquement. Les valeurs par défaut (host/région/
marketplace France) sont déjà codées : seuls les deux secrets sont
indispensables.

## Fonctionnement interne

```
data/products.json  ──►  scripts/paapi-enrich.mjs  ──►  data/products.cache.json
   (ASIN)                  (GetItems, lots de 10)         (image, prix, Prime)
                                                                │
                                        scripts/remark-affiliate.mjs (au build)
                                        fusionne le cache ► encadrés enrichis
```

- `data/products.cache.json` est **régénéré à chaque build** et **ignoré par git**
  (prix horodatés, jamais figés dans le dépôt → conforme).
- L'étape CI est **best-effort** : une panne PA-API n'échoue jamais le build
  (les encadrés retombent sur les liens de recherche / valeurs manuelles).

## Tester sans accès API

```bash
npm run paapi:selftest        # vérifie la signature SigV4 (vecteur AWS) + état des clés
npm run enrich:paapi -- --dry-run   # simule l'enrichissement (cache factice), sans appeler Amazon
npm run report:asins          # couverture ASIN + enrichissement
```

Le mode `--dry-run` prouve toute la chaîne enrich → cache → build → rendu, hors
ligne. En production, ne jamais utiliser `--dry-run`.

## Fichiers de l'intégration

| Fichier | Rôle |
|---|---|
| `scripts/paapi-client.mjs` | Client PA-API (signature SigV4, GetItems) — sans dépendance |
| `scripts/paapi-enrich.mjs` | Enrichissement → cache (inerte sans clés, best-effort) |
| `scripts/paapi-selftest.mjs` | Vérifie la signature + l'état des clés |
| `scripts/remark-affiliate.mjs` | Fusionne le cache au build (précédence manuelle) |
| `.github/workflows/*.yml` | Étape « Enrichir via PA-API » (inerte sans secrets) |
