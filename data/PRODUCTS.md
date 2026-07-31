# Base produits (`data/products.json`) — guide de saisie

Ce fichier alimente les **encadrés produits** et les **liens Amazon** des articles.
Rien d'autre dans le système n'a besoin d'être modifié : dès qu'un champ est
renseigné ici, le rendu s'adapte automatiquement au prochain build.

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
