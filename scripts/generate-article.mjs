#!/usr/bin/env node
// ============================================================
//  Génère un article de ~2500 mots optimisé SEO via l'API Claude,
//  y injecte les liens affiliés Amazon, et l'écrit dans
//  src/content/blog/ au format Markdown + frontmatter.
//
//  Variables d'environnement requises :
//    ANTHROPIC_API_KEY      (obligatoire)
//    AMAZON_AFFILIATE_TAG   (recommandé, défaut: muscuguide-21)
//    AMAZON_DOMAIN          (défaut: amazon.fr)
//    ANTHROPIC_MODEL        (défaut: claude-sonnet-5)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  ROOT,
  BLOG_DIR,
  DATA_DIR,
  readJson,
  slugify,
  existingBaseSlugs,
  yamlString,
  countWords,
} from './lib.mjs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const TAG = process.env.AMAZON_AFFILIATE_TAG || 'muscuguide-21';
const DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.fr';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

if (!API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY manquante. Ajoutez-la à vos secrets/environnement.');
  process.exit(1);
}

// --- 1. Choix du sujet ----------------------------------------
const { topics } = readJson(path.join(DATA_DIR, 'topics.json'));
const { products } = readJson(path.join(DATA_DIR, 'products.json'));
const done = existingBaseSlugs();

const topic = topics.find((t) => !done.has(t.slug));
if (!topic) {
  console.error(
    '⚠️  Plus aucun sujet disponible dans data/topics.json.\n' +
      '    Lancez `npm run generate:topics` pour en générer de nouveaux, puis relancez.'
  );
  process.exit(2);
}

console.log(`📝  Sujet sélectionné : ${topic.title} (${topic.type})`);

// Produits proposés à Claude : ceux liés au sujet en priorité + le reste.
const linked = (topic.products || [])
  .map((id) => products.find((p) => p.id === id))
  .filter(Boolean);
const others = products.filter((p) => !(topic.products || []).includes(p.id));
const productPool = [...linked, ...others];

const productList = productPool
  .map((p) => `- id: ${p.id} | ${p.name} — ${p.blurb} (catégorie: ${p.category})`)
  .join('\n');

// --- 2. Prompt ------------------------------------------------
const typeLabel = {
  comparatif: 'un comparatif d\'achat détaillé',
  guide: 'un guide complet et approfondi',
  conseil: 'un article de conseils pratique et informatif',
}[topic.type] || 'un guide complet';

const systemPrompt = `Tu es un rédacteur web SEO expert et passionné de fitness et de musculation. Tu écris en français, dans un style clair, engageant, précis et fiable, à destination d'un large public francophone. Tu maîtrises parfaitement l'optimisation pour le référencement naturel (structure Hn, intention de recherche, mots-clés sémantiques, maillage, extraits enrichis).`;

const userPrompt = `Rédige ${typeLabel} d'environ 2500 mots (minimum 2200) sur le sujet suivant :

TITRE INDICATIF : "${topic.title}"
MOT-CLÉ PRINCIPAL À CIBLER : "${topic.keyword}"
TYPE D'ARTICLE : ${topic.type}
ANNÉE EN COURS : ${new Date().getFullYear()}

CONTRAINTES SEO ET RÉDACTIONNELLES :
- Longueur : environ 2500 mots (impérativement > 2200 mots).
- Année : n'invente JAMAIS de millésime. Si tu mentionnes une année (dans le titre ou le corps), utilise UNIQUEMENT l'année en cours indiquée ci-dessus (${new Date().getFullYear()}).
- Structure Markdown claire : une accroche d'introduction (sans titre), puis des sections en "## " et des sous-sections en "### ". N'utilise PAS de titre de niveau 1 (#) : le titre H1 est géré à part.
- Intègre naturellement le mot-clé principal et des variantes sémantiques dans les titres et le corps.
- Style concret : chiffres, critères de choix, cas d'usage, erreurs à éviter, conseils actionnables.
- Si c'est un comparatif : inclus AU MOINS un tableau comparatif Markdown (critères en lignes ou en colonnes) et des critères de sélection.
- Ton honnête et utile, jamais racoleur. Pas de fausses promesses.
- Rédige pour des lecteurs français (vocabulaire, unités métriques, €).

LIENS AFFILIÉS AMAZON — TRÈS IMPORTANT :
Tu disposes de la liste de produits ci-dessous. Insère leurs liens UNIQUEMENT via ces marqueurs (ne mets jamais d'URL en dur) :
- Bloc encadré "call-to-action" : place \`[[BOX:id]]\` seul sur sa propre ligne, aux endroits pertinents (1 à 2 fois MAXIMUM dans l'article, jamais plus de 2, jamais deux à la suite).
- Lien texte intégré : \`[[LINK:id|texte du lien]]\` à l'intérieur d'une phrase (3 à 6 fois).
Utilise seulement des id présents dans la liste. Répartis les liens naturellement, là où ils apportent de la valeur au lecteur.

PRODUITS DISPONIBLES (id | nom — description) :
${productList}

Retourne le résultat en appelant l'outil submit_article avec :
- title : un titre H1 optimisé et accrocheur (55-65 caractères si possible), incluant le mot-clé.
- description : une méta-description SEO de 150-158 caractères, incitative, incluant le mot-clé.
- keyword : le mot-clé principal.
- tags : 4 à 6 tags pertinents (mots simples ou expressions courtes, en minuscules).
- faq : 3 à 5 questions/réponses fréquentes (réponses de 2-4 phrases) pertinentes pour le sujet et utiles au SEO (extraits enrichis).
- content_markdown : le corps complet de l'article en Markdown (avec les marqueurs de liens affiliés), SANS le titre H1, SANS section FAQ (la FAQ est fournie séparément dans le champ faq).`;

// --- 3. Appel API (sortie structurée via tool use) ------------
const client = new Anthropic({ apiKey: API_KEY });

const tool = {
  name: 'submit_article',
  description: "Soumet l'article rédigé et ses métadonnées SEO.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      keyword: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      faq: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
      },
      content_markdown: { type: 'string' },
    },
    required: ['title', 'description', 'keyword', 'tags', 'faq', 'content_markdown'],
  },
};

console.log(`🤖  Génération via ${MODEL}…`);

const message = await client.messages.create({
  model: MODEL,
  max_tokens: 8192,
  system: systemPrompt,
  tools: [tool],
  tool_choice: { type: 'tool', name: 'submit_article' },
  messages: [{ role: 'user', content: userPrompt }],
});

const toolUse = message.content.find((b) => b.type === 'tool_use');
if (!toolUse) {
  console.error('❌  Réponse inattendue : aucun appel d\'outil reçu.');
  console.error(JSON.stringify(message, null, 2).slice(0, 2000));
  process.exit(1);
}

const article = toolUse.input;

// --- 4. Post-traitement ---------------------------------------
// Les marqueurs [[BOX:id]] / [[LINK:id]] sont conservés tels quels :
// ils sont transformés en HTML au moment du build (plugin remark),
// ce qui permet de changer de tag Amazon sans régénérer les articles.
const body = article.content_markdown.trim();

const words = countWords(article.content_markdown);
const readingTime = Math.max(1, Math.round(words / 200));
console.log(`✍️   Article rédigé : ~${words} mots, ${readingTime} min de lecture.`);
if (words < 2000) {
  console.warn(`⚠️  Article un peu court (${words} mots).`);
}

const now = new Date();
const dateISO = now.toISOString().slice(0, 10);
const slug = topic.slug || slugify(article.title);
const filename = `${dateISO}-${slug}.md`;

// Frontmatter
const faqYaml =
  (article.faq || [])
    .map(
      (f) =>
        `  - question: ${yamlString(f.question)}\n    answer: ${yamlString(f.answer)}`
    )
    .join('\n') || '';

const tagsYaml = (article.tags || []).map((t) => `  - ${yamlString(t)}`).join('\n');

const frontmatter = [
  '---',
  `title: ${yamlString(article.title)}`,
  `description: ${yamlString(article.description)}`,
  `pubDate: ${dateISO}`,
  `category: ${topic.category}`,
  `keyword: ${yamlString(article.keyword || topic.keyword)}`,
  `author: "La rédaction MuscuGuide"`,
  `readingTime: ${readingTime}`,
  `featured: false`,
  `draft: false`,
  tagsYaml ? `tags:\n${tagsYaml}` : 'tags: []',
  faqYaml ? `faq:\n${faqYaml}` : 'faq: []',
  '---',
  '',
].join('\n');

fs.mkdirSync(BLOG_DIR, { recursive: true });
const outPath = path.join(BLOG_DIR, filename);
fs.writeFileSync(outPath, frontmatter + body + '\n');

console.log(`✅  Article écrit : ${path.relative(ROOT, outPath)}`);
