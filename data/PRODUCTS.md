# Base produits — guide de saisie

Ce catalogue alimente les **encadrés produits** et les **liens Amazon** des
articles. Rien d'autre dans le système n'a besoin d'être modifié : dès qu'un
champ est renseigné, le rendu s'adapte automatiquement au prochain build.

## Trois façons d'afficher un produit dans un article

| Marqueur | Rendu |
|---|---|
| `[[LINK:id]]` ou `[[LINK:id\|ancre]]` | Lien affilié inline dans le texte. |
| `[[BOX:id]]` | Encadré compact (image, note, prix, CTA). Max 2 par article. |
| `[[FICHE:id]]` | **Fiche produit premium complète** : note MuscuGuide, verdict, avantages/inconvénients, fiche technique, FAQ repliable, produits liés, CTA. Non plafonnée. |

La **fiche** (`[[FICHE:id]]`) est le **template officiel** pour présenter un
produit : elle affiche automatiquement tous les champs enrichis renseignés
(`mgScore`, `verdict`, `pros`, `cons`, `specs`, `faq`, `related`). Les champs
absents sont simplement omis — aucune case vide.

## Import modulaire — ajouter des produits sans toucher au code

Le catalogue est chargé depuis **plusieurs sources fusionnées** :

1. `data/products.json` — base historique (les 17 produits de départ).
2. `data/products/<categorie>.json` — **un fichier par catégorie/lot**.

**Pour ajouter un lot (3–5 catégories à la fois) :**
1. Copie `data/products/_TEMPLATE.json` vers `data/products/<categorie>.json`
   (ex. `nutrition.json`, `cardio.json`, `structure.json`).
2. Remplis le tableau `products` (id, name, keyword, asin, blurb…).
3. C'est tout : au prochain build, les produits sont pris en compte.
   Aucune ligne de code à modifier.

> Les fichiers dont le nom commence par `_` (comme `_TEMPLATE.json`) sont
> **ignorés**. En cas de doublon d'`id`, la **dernière** définition l'emporte.

**Vérifier un lot avant intégration :**
```bash
npm run products:check     # fichiers chargés, doublons, champs manquants, ASIN
```

Un `id` doit être **unique et stable** (il relie le produit aux articles via
`[[BOX:id]]` / `[[LINK:id]]`). Ne le change jamais une fois publié.

## Schéma d'un produit

## Schéma d'un produit

| Champ | Obligatoire | Exemple | Rôle |
|---|---|---|---|
| `id` | ✅ | `"halteres-reglables"` | Identifiant stable, utilisé dans les articles via `[[BOX:id]]` / `[[LINK:id]]`. **Ne pas changer.** |
| `name` | ✅ | `"Haltères réglables"` | Nom affiché dans l'encadré et comme ancre par défaut. |
| `keyword` | ✅ | `"halteres reglables musculation"` | Mot-clé du lien de recherche (repli quand pas d'ASIN). |
| `asin` | ⬜ | `"B08N5WRWNW"` | ASIN Amazon réel → lien **fiche produit** `/dp/ASIN`. Vide ou invalide → lien de recherche. |
| `category` | ⬜ | `"halteres"` | Regroupement interne. |
| `blurb` | ⬜ | `"Paire à charge ajustable…"` | Courte description sous le nom. |
| `image` | ⬜ | `"/img/produits/halteres.jpg"` | Image produit (chemin local dans `public/` ou URL). Affiche la vignette. |
| `rating` | ⬜ | `4.6` | Note moyenne 0–5 → étoiles. |
| `reviews` | ⬜ | `2413` | Nombre d'avis, affiché à côté des étoiles. |
| `badge` | ⬜ | `"Notre choix"` | Remplace le libellé « Notre recommandation ». |
| `priceIndication` | ⬜ | `"Dès ~120 €"` | Mention de prix **indicative** (voir avertissement ci-dessous). |
| `summary` | ⬜ | `"Isolat pauvre en lactose…"` | Résumé (1–3 phrases). Sert de description si `blurb` absent. |
| `pros` | ⬜ | `["Léger", "Solide"]` | Liste d'avantages (textes). |
| `cons` | ⬜ | `["Prix élevé"]` | Liste d'inconvénients (textes). |
| `specs` | ⬜ | `[{ "label": "Poids", "value": "10 kg" }]` | Fiche technique (ordre conservé). |
| `faq` | ⬜ | `[{ "question": "…", "answer": "…" }]` | Questions/réponses propres au produit. |
| `related` | ⬜ | `["creatine", "shaker"]` | Identifiants d'autres produits liés (doivent exister). |

**Format unique, évolutif.** Toutes les catégories utilisent exactement ces
champs. Références :
- `data/products/_TEMPLATE.json` — modèle à copier.
- `data/products/_EXEMPLE-complet.json` — exemple entièrement rempli.
- `data/products.schema.json` — schéma formel (JSON Schema) qui définit le format.

Les champs enrichis (`summary`, `pros`, `cons`, `specs`, `faq`, `related`) sont
stockés dès maintenant ; leur affichage dans une présentation produit dédiée
(colonnes avantages/inconvénients, tableau specs, FAQ, produits liés) est le
prochain chantier — la donnée est déjà prête à être branchée.

Tous les champs optionnels sont **indépendants** : on peut n'ajouter qu'une image,
ou qu'une note, etc. Ce qui est absent n'apparaît tout simplement pas, et l'encadré
minimal reste identique.

## Comment trouver l'ASIN

Sur la fiche du produit sur **amazon.fr**, l'ASIN est le code à 10 caractères
dans l'URL, juste après `/dp/` :

```
https://www.amazon.fr/dp/B08N5WRWNW/...   →   ASIN = B08N5WRWNW
```

(On le retrouve aussi dans la section « Informations sur le produit » de la page.)

## ⚠️ Prix : ne jamais coder un prix « live » en dur

Le contrat Partenaires Amazon **interdit d'afficher un prix figé** récupéré à la
main : un prix codé en dur devient faux et enfreint les conditions. Deux options
conformes :

1. **`priceIndication`** — une mention *volontairement approximative et non
   contractuelle* que vous contrôlez (ex. `"Dès ~120 €"`, ou une tranche
   `"€€"`). C'est ce que gère l'infrastructure actuelle.
2. **Prix live** — uniquement via l'**API Amazon (PA-API 5.0)**, qui fournit le
   prix horodaté « à jour du … ». C'est le chantier ultérieur qui pourra
   remplir `image`, `rating`, `reviews` et un prix live **automatiquement**.

## Exemple d'un produit entièrement renseigné

```json
{
  "id": "halteres-reglables",
  "name": "Haltères réglables",
  "keyword": "halteres reglables musculation",
  "asin": "B0XXXXXXXX",
  "category": "halteres",
  "blurb": "Paire d'haltères à charge ajustable, idéale pour gagner de la place chez soi.",
  "image": "/img/produits/halteres-reglables.jpg",
  "rating": 4.6,
  "reviews": 2413,
  "badge": "Notre choix",
  "priceIndication": "Dès ~150 €"
}
```

## Suivi

`npm run report:asins` affiche, produit par produit (triés par nombre de liens),
l'état de l'ASIN et des métadonnées enrichies — pratique pour prioriser la saisie.
