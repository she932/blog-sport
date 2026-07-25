# 💪 MuscuGuide — Blog d'affiliation fitness & musculation

Blog automatisé qui **publie chaque jour un guide de ~2500 mots optimisé SEO**,
avec **injection automatique de vos liens affiliés Amazon**. Construit avec
[Astro](https://astro.build) (site statique ultra-rapide et SEO-friendly),
rédaction via l'**API Claude (Anthropic)**, déploiement sur **GitHub Pages**.

Chaque jour, un workflow GitHub Actions :

1. choisit le prochain sujet dans la file (`data/topics.json`) — comparatif,
   guide complet ou article de conseils ;
2. demande à Claude de rédiger l'article (~2500 mots, structuré, avec méta-données
   SEO et FAQ) ;
3. y insère vos liens affiliés Amazon ;
4. publie l'article et redéploie le site automatiquement.

---

## 🚀 Mise en route (une seule fois)

### 1. Activer GitHub Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source : `GitHub Actions`**.

> L'URL du site sera `https://<votre-user>.github.io/blog-sport/`.
> Elle est configurée dans `astro.config.mjs` (`site` + `base`). Adaptez-la si
> votre nom d'utilisateur/dépôt diffère, ou pour un domaine personnalisé (voir plus bas).

### 2. Ajouter la clé API Claude (secret)

**Settings → Secrets and variables → Actions → New repository secret**

| Nom | Valeur |
| --- | --- |
| `ANTHROPIC_API_KEY` | Votre clé depuis [console.anthropic.com](https://console.anthropic.com/settings/keys) |

### 3. Ajouter vos variables (non secrètes)

**Settings → Secrets and variables → Actions → onglet _Variables_ → New variable**

| Nom | Exemple | Rôle |
| --- | --- | --- |
| `AMAZON_AFFILIATE_TAG` | `monsite-21` | Votre identifiant Partenaire Amazon |
| `AMAZON_DOMAIN` | `amazon.fr` | Domaine Amazon des liens |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Modèle de rédaction (optionnel) |

> ⚠️ Sans `AMAZON_AFFILIATE_TAG`, les liens utilisent le tag de démonstration
> `votretag-21` : pensez à le renseigner pour percevoir vos commissions.

### 4. C'est tout !

- Le workflow **« Article quotidien »** s'exécute chaque jour à 06:15 UTC.
- Vous pouvez le déclencher manuellement : **Actions → Article quotidien → Run workflow**
  (option `count` pour générer plusieurs articles d'un coup).

---

## 🧩 Comment ça marche

```
data/topics.json      ← file d'attente des sujets (slug, type, mot-clé, produits)
data/products.json    ← catalogue de produits + liens affiliés (ASIN ou recherche)
scripts/
  generate-article.mjs  ← génère 1 article via Claude (sortie structurée)
  generate-topics.mjs   ← recrée des sujets quand la file est vide
  remark-affiliate.mjs  ← transforme [[BOX:id]]/[[LINK:id]] en HTML au build
  lib.mjs               ← utilitaires partagés
src/
  content/blog/         ← les articles publiés (Markdown + frontmatter)
  pages/ layouts/ components/  ← le site Astro
.github/workflows/
  daily-article.yml     ← cron quotidien : génère, commit, build, déploie
  deploy.yml            ← redéploie à chaque push de code
```

### Les liens affiliés

Dans le corps des articles, deux marqueurs sont utilisés :

- `[[BOX:id]]` → un **bloc encadré « Voir le prix sur Amazon »** ;
- `[[LINK:id|texte]]` → un **lien texte** intégré à une phrase.

`id` renvoie à un produit de `data/products.json`. Ces marqueurs sont convertis
en HTML **au moment du build**, avec votre tag Amazon : changer de tag ne
nécessite donc **aucune régénération**, un simple rebuild suffit.

- Si un produit a un **`asin`** renseigné → lien direct vers la fiche produit
  (meilleure conversion).
- Sinon → lien vers une **recherche Amazon** basée sur `keyword` (fonctionne
  toujours, à affiner en ajoutant les ASIN réels).

### Ajouter / modifier des produits et sujets

- **Produits** : éditez `data/products.json` (ajoutez le vrai `asin` pour des
  liens directs).
- **Sujets** : éditez `data/topics.json`, ou laissez le système en générer
  automatiquement quand la file est épuisée (`npm run generate:topics`).

---

## 💻 Développement local

```bash
npm install
cp .env.example .env      # renseignez ANTHROPIC_API_KEY et AMAZON_AFFILIATE_TAG

npm run dev               # aperçu du site sur http://localhost:4321/blog-sport
npm run generate          # génère 1 article (nécessite ANTHROPIC_API_KEY)
npm run generate:topics   # ajoute de nouveaux sujets à la file
npm run build             # build de production dans dist/
npm run preview           # prévisualise le build
```

---

## 🔍 SEO intégré

- Balises `title` / `meta description` optimisées par article
- Open Graph + Twitter Cards
- URL canoniques + `sitemap-index.xml` + `robots.txt`
- Flux **RSS** (`/rss.xml`)
- **Données structurées** JSON-LD : `Article`, `BreadcrumbList`, `FAQPage`
- Rendu **100 % statique** (temps de chargement minimal), HTML sémantique,
  hiérarchie de titres propre, design responsive et thème clair/sombre.

---

## 🌐 Utiliser un domaine personnalisé

1. Dans `astro.config.mjs`, mettez `site: 'https://votredomaine.com'` et
   `base: '/'`.
2. Mettez à jour l'URL du sitemap dans `public/robots.txt`.
3. Ajoutez un fichier `public/CNAME` contenant `votredomaine.com`.
4. Configurez le domaine dans **Settings → Pages**.

---

## ⚖️ Conformité affiliation

Le site affiche la mention légale du Programme Partenaires Amazon (en pied de
page et en tête de chaque article), et tous les liens affiliés portent
l'attribut `rel="nofollow sponsored"` conformément aux recommandations
d'Amazon et de Google. Vérifiez les conditions de votre programme Partenaires
Amazon local avant la mise en ligne.
