# Base produits — import & maintenance

Ce guide explique comment **importer un catalogue de produits** depuis un
fichier Excel/CSV, comment les champs s'affichent automatiquement, et comment
**maintenir la base** dans le temps (mise à jour d'ASIN, multi-pays, statut).

L'architecture est prévue pour **plusieurs centaines de produits** sans
modification de code : on remplit un tableur, on lance une commande, on build.

---

## 1. Le fichier d'import (Excel → CSV)

Modèle prêt à remplir : **`data/import/catalogue-modele.csv`**
(ouvre directement dans Excel / Google Sheets / LibreOffice).

Une **ligne = un produit**. Colonnes reconnues (ordre libre, en-têtes
insensibles à la casse et aux accents) :

| Colonne | Obligatoire | Rôle |
|---|---|---|
| **Catégorie** | ✅ | Regroupe les produits ; génère `data/products/<catégorie>.json`. |
| **Badge** | ⬜ | `Choix MuscuGuide`, `Rapport qualité-prix` ou `Premium`. |
| **Nom** | ✅ | Nom affiché (sert aussi d'`id` s'il n'est pas fourni). |
| **Marque** | ⬜ | Affichée sous le nom (ligne discrète). |
| **ASIN** | ⬜ | ASIN Amazon (10 caractères). Vide → lien de recherche. |
| **URL Amazon** | ⬜ | URL complète ; l'ASIN en est **extrait automatiquement** si la colonne ASIN est vide. |
| **Image** | ⬜ | Chemin `/img/produits/...` ou URL. |
| **Score MuscuGuide** | ⬜ | Note /5 (ex. `4,7`). Anneau + verdict sur la fiche. |
| **Description courte** | ⬜ | Résumé (1-3 phrases). |
| **Points forts** | ⬜ | Séparés par `\|` (ex. `Léger\|Solide\|Silencieux`). |
| **Points faibles** | ⬜ | Séparés par `\|`. |
| **Profil utilisateur** | ⬜ | Public cible (ex. `Débutants`, `Tous niveaux`). |
| **Statut** | ⬜ | `publié` (défaut) ou `brouillon` (exclu du site). |

Colonnes **optionnelles** supplémentaires : `id`, `Mot-clé`, `Note`, `Avis`,
`Verdict`, et pour le multi-pays `ASIN UK`, `ASIN DE`, `ASIN ES`.

> **Notes de saisie**
> - Séparateur de cellules : `;` (Excel FR) ou `,` — détecté automatiquement.
> - Décimales : la virgule (`4,7`) est acceptée.
> - Cellules multi-valeurs (points forts/faibles) : séparateur `|`.
> - Encodage : enregistrez en **CSV UTF-8** pour les accents.

---

## 2. Importer

```bash
npm run import:catalog                       # lit data/import/catalogue.csv
npm run import:catalog -- --file=mon.csv     # fichier personnalisé
npm run import:catalog -- --dry              # aperçu, sans rien écrire
```

L'import :
1. lit le CSV,
2. génère **un fichier par catégorie** dans `data/products/<catégorie>.json`
   (marqués `"_generated": true`),
3. affiche un récapitulatif (produits, catégories, ASIN valides, brouillons)
   et d'éventuels avertissements.

Ensuite, toujours :

```bash
npm run products:check     # valide le catalogue (doublons, ASIN, champs)
npm run build              # régénère le site
```

> ⚠️ L'import **écrase** les fichiers de catégorie du même nom. Les fichiers
> `data/products/*.json` faits main (données de démarrage) sont remplacés dès
> qu'une catégorie du même nom est importée — c'est voulu : le CSV devient la
> **source de vérité**.

---

## 3. Affichage automatique

Aucun composant à toucher : chaque champ renseigné apparaît sur la fiche
produit (`[[FICHE:id]]`) et, en version compacte, sur l'encadré (`[[BOX:id]]`) :

- **Badge** → pastille en tête de fiche
- **Marque** → ligne sous le nom
- **Score MuscuGuide** → anneau /5 + mot de verdict
- **Note / Avis** → étoiles + nombre d'avis clients Amazon
- **Description** → résumé
- **Points forts / faibles** → colonnes vertes/rouges
- **Profil utilisateur** → repère « Idéal pour … »
- **CTA** → bouton « Vérifier le prix sur Amazon » (lien affilié)

Un champ absent est simplement **omis** (aucune case vide, aucun impact sur le
design existant).

---

## 4. Mettre à jour un produit = remplacer l'ASIN

Pour pointer un produit vers la bonne fiche Amazon, il suffit de renseigner
son **ASIN** (ou de coller l'**URL Amazon**) dans le tableur, puis de
réimporter et rebuilder. Le lien passe automatiquement de la recherche
(`/s?k=…`) à la fiche produit (`/dp/ASIN`), tag d'affiliation conservé.

- ASIN vide/invalide → lien de **recherche** (fonctionnel, jamais cassé).
- ASIN valide → lien **fiche produit** (meilleure conversion).
- Une URL collée (`https://www.amazon.fr/dp/B0…`) est acceptée telle quelle.

L'`id` d'un produit est **stable** : ne le changez jamais une fois publié
(il relie le produit aux articles via `[[FICHE:id]]` / `[[BOX:id]]`).

---

## 5. Statut (brouillon / publié)

La colonne **Statut** pilote la visibilité :

- `publié` (ou vide) → le produit est actif sur le site.
- `brouillon` (ou `draft`, `masqué`, `archivé`, `inactif`) → le produit reste
  dans la base mais **n'est ni affiché ni proposé**. Pratique pour préparer un
  produit avant sa mise en ligne, ou en retirer un temporairement.

---

## 6. Multi-pays (FR, UK, DE, ES…)

L'architecture est prête pour plusieurs marketplaces, **sans changement de
code**. Configuration : `data/marketplaces.json`.

Pour ajouter un pays (ex. le Royaume-Uni) :
1. dans `data/marketplaces.json`, passez `"UK".enabled` à `true` et renseignez
   son `tag` d'affiliation ;
2. dans le tableur, remplissez la colonne **ASIN UK** des produits concernés
   (elle alimente `asinByCountry`) ;
3. le marché servi est déterminé par `"active"` dans `marketplaces.json`
   (ou la variable d'environnement `AMAZON_COUNTRY`).

Chaque marché a son **domaine** (`amazon.fr`, `amazon.co.uk`…) et son **tag**.
Le bon ASIN et le bon lien sont choisis automatiquement selon le pays actif.

---

## 7. Où vit quoi

| Élément | Fichier |
|---|---|
| Modèle d'import | `data/import/catalogue-modele.csv` |
| Script d'import | `scripts/import-catalog.mjs` (`npm run import:catalog`) |
| Catalogue généré | `data/products/<catégorie>.json` |
| Schéma d'un produit | `data/products.schema.json` |
| Marketplaces (pays) | `data/marketplaces.json` |
| Wording (CTA, badges par défaut…) | `data/brand.json` |
| Couleurs / design | `src/styles/tokens.css` (à ne pas modifier ici) |
| Rendu fiche / encadré | `scripts/remark-affiliate.mjs` |

---

## 8. Cycle de maintenance recommandé

1. Mettre à jour le tableur (nouveaux produits, ASIN, statuts).
2. `npm run import:catalog` (ou `-- --dry` pour vérifier d'abord).
3. `npm run products:check` (corriger les avertissements éventuels).
4. `npm run build` et vérifier le rendu en local.
5. Commiter le CSV **et** les JSON générés (la base reste versionnée).

Rien d'autre n'a besoin d'être touché : ni le design, ni les composants, ni
les workflows.
