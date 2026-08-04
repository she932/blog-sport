# Base produits — import & maintenance

Ce guide explique comment **importer le catalogue de produits** depuis la base
officielle, comment les champs s'affichent automatiquement, et comment
**maintenir la base** dans le temps (mise à jour d'ASIN, multi-pays, statut).

L'architecture est prévue pour **plusieurs milliers de produits** sans
modification de code : on remplit la base, on lance une commande, on build.

## Source officielle

**`data/import/MuscuGuide_Base_Produits.xlsx`**, onglet **« Import Claude »**,
est la **source unique** du catalogue. Workflow (voir l'onglet *Mode d'emploi*
du classeur) : on remplit l'onglet *Produits* (produit, ASIN Amazon.fr, notes
par critère → score /100, éditorial), on passe le statut à **Validé**, et
l'onglet *Import Claude* se met à jour automatiquement pour l'import technique.

> Règle d'or du classeur, respectée par l'import : **ne jamais inventer un
> ASIN, un prix, une note ou un nombre d'avis.**

Un export **CSV** reste accepté (même colonnes) comme format alternatif.

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
npm run import:catalog                        # auto : 1er .xlsx/.csv de data/import/
npm run import:catalog -- --dry               # aperçu, sans rien écrire
npm run import:catalog -- --file=chemin.xlsx  # fichier précis
npm run import:catalog -- --sheet="Import Claude"   # onglet xlsx (défaut)
```

L'importeur lit nativement le **.xlsx** (onglet « Import Claude », sans
dépendance) ou un **.csv**. L'import :
1. lit la base,
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

## 2 bis. Règles métier officielles (MuscuGuide V2)

Encodées dans **`scripts/catalog-rules.mjs`** (source unique de vérité,
appliquée à l'import comme au rendu). Spécification validée :

- **Notation.** Score interne **/100** (issu des critères pondérés du classeur).
  Affichage public **/5** = score ÷ 20 (anneau existant). Les **étoiles**
  affichent la **note clients Amazon** réelle (jamais notre score).
  L'import accepte les deux échelles : une note > 5 est lue en /100, ≤ 5 en /5.
- **Verdict** (paliers /100) : 90+ Excellent · 80–89 Très bon · 70–79 Bon ·
  60–69 Correct · 50–59 Moyen · < 50 Déconseillé.
- **Seuil de publication : 70/100.** En dessous (ou sans ASIN, ou statut non
  validé), le produit reste en base mais **invisible**.
- **Produit vedette** (par catégorie, par pays) : **rang manuel prioritaire**,
  puis meilleur **score**, puis note Amazon → avis → prix → nom. Le 1ᵉʳ éligible
  devient la fiche `[[FICHE]]` ; les suivants, des encadrés.
- **Badges** : automatiques + **override manuel prioritaire**. La vedette reçoit
  **« Choix MuscuGuide »** (un seul par catégorie) ; le meilleur rapport
  score/prix, **« Meilleur rapport qualité/prix »**. Attributs secondaires
  (Idéal débutant, Home Gym…) possibles en plus.
- **Statuts → visibilité** : `À rechercher` / `ASIN à vérifier` → **masqué** ;
  `Validé` / `À intégrer` / `Intégré` → **visible** (si éligible) ;
  `À remplacer` / `Indisponible` → **retiré**. Un statut vide = visible.

### État actuel & mise en ligne

À ce jour, la base compte **24 produits en « À rechercher »** (sans ASIN, sans
score) : importés, ils seraient **tous masqués** — le site n'afficherait donc
rien de nouveau. C'est voulu : on ne publie rien tant qu'un produit n'est pas
**Validé + ASIN + score ≥ 70**.

**Procédure de mise en ligne**, catégorie par catégorie, quand les produits
sont prêts dans le classeur :
1. `npm run import:catalog` (génère les fichiers de catégorie) ;
2. `npm run products:check` puis `npm run build` (aperçu local) ;
3. repointer la fiche vedette de l'article vers l'`id` du produit `rang 1`
   validé (ex. `[[FICHE:mg-whey-001]]`), l'ancien produit de démarrage
   pouvant alors être retiré ;
4. valider visuellement, puis — sur feu vert — déployer.

## 2 ter. Couche données typée (pour les pages)

`src/lib/catalog.ts` expose une API **typée et validée (Zod)** que les pages
Astro consomment, réutilisant le moteur de règles unique — **aucune règle
dupliquée**, aucun accès disque fragile (chargement via `import.meta.glob`) :

| Fonction | Renvoie |
|---|---|
| `getCatalog({ includeDrafts, country })` | tous les produits publiés (validés Zod) |
| `getCategories()` | slugs de catégories présents |
| `getProductsByCategory(cat, { country })` | produits **publiables**, **classés** |
| `getFeatured(cat, { country })` | **produit vedette** de la catégorie (ou `null`) |
| `getBadges(cat, { country })` | map `id → badge` (auto + override) |
| `scoreOutOfFive(p)` / `scoreVerdict(p)` | note /5 et mot de verdict |

Tout est **multi-pays** via `country` (défaut = marketplace actif) et testé
jusqu'à **plusieurs milliers de produits** (classement + vedette + badges de
3 000 produits ≈ 40 ms).

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
| **Source officielle** | `data/import/MuscuGuide_Base_Produits.xlsx` (onglet « Import Claude ») |
| Modèle CSV alternatif | `data/import/catalogue-modele.csv` |
| Script d'import | `scripts/import-catalog.mjs` (`npm run import:catalog`) |
| Lecteur XLSX (sans dépendance) | `scripts/lib-xlsx.mjs` |
| **Règles métier officielles** | `scripts/catalog-rules.mjs` |
| Validation métier | `scripts/catalog-validate.mjs` (`npm run catalog:validate`) |
| **Couche données typée (Astro/TS)** | `src/lib/catalog.ts` (Zod + types + lecture) |
| Vérification TypeScript | `npm run typecheck` (astro check) |
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
