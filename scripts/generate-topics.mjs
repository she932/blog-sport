#!/usr/bin/env node
// ============================================================
//  Génère de nouveaux sujets d'articles via Claude et les ajoute
//  à data/topics.json (en évitant les doublons). À lancer quand
//  la file de sujets est épuisée, ou périodiquement.
//
//    node scripts/generate-topics.mjs [nombre]   (défaut: 15)
// ============================================================
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { DATA_DIR, readJson, writeJson, loadProducts, slugify } from './lib.mjs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const COUNT = parseInt(process.argv[2] || '15', 10);

if (!API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY manquante.');
  process.exit(1);
}

const topicsFile = path.join(DATA_DIR, 'topics.json');
const topicsData = readJson(topicsFile);
const { products } = loadProducts();

const existingSlugs = new Set(topicsData.topics.map((t) => t.slug));
const existingTitles = topicsData.topics.map((t) => t.title);
const productIds = products.map((p) => p.id);

const client = new Anthropic({ apiKey: API_KEY });

const tool = {
  name: 'submit_topics',
  description: 'Soumet une liste de nouveaux sujets d\'articles pour le blog.',
  input_schema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            type: { type: 'string', enum: ['comparatif', 'guide', 'conseil'] },
            category: {
              type: 'string',
              enum: ['comparatifs', 'guides', 'conseils', 'materiel'],
            },
            keyword: { type: 'string' },
            products: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'type', 'category', 'keyword', 'products'],
        },
      },
    },
    required: ['topics'],
  },
};

const prompt = `Tu aides à alimenter un blog francophone spécialisé dans le FITNESS et la MUSCULATION, orienté affiliation Amazon.

Propose ${COUNT} NOUVEAUX sujets d'articles à fort potentiel SEO et commercial, variés en type :
- "comparatif" (ex: "Meilleur X : comparatif") -> catégorie "comparatifs"
- "guide" (guide complet/approfondi) -> catégorie "guides"
- "conseil" (article informatif/pratique) -> catégorie "conseils"

Règles :
- Sujets utiles, recherchés par de vrais internautes, avec une intention claire.
- Évite ABSOLUMENT les doublons avec les titres déjà existants ci-dessous.
- Pour chaque sujet, "keyword" = le mot-clé principal réaliste (en minuscules, sans accent superflu).
- Pour "products", liste 1 à 5 id de produits pertinents parmi cette liste UNIQUEMENT : ${productIds.join(', ')}.

TITRES DÉJÀ EXISTANTS (à ne pas reproduire) :
${existingTitles.map((t) => '- ' + t).join('\n')}

Retourne via l'outil submit_topics.`;

console.log(`🤖  Génération de ${COUNT} sujets via ${MODEL}…`);

const message = await client.messages.create({
  model: MODEL,
  max_tokens: 4096,
  tools: [tool],
  tool_choice: { type: 'tool', name: 'submit_topics' },
  messages: [{ role: 'user', content: prompt }],
});

const toolUse = message.content.find((b) => b.type === 'tool_use');
if (!toolUse) {
  console.error('❌  Aucun sujet reçu.');
  process.exit(1);
}

let added = 0;
for (const t of toolUse.input.topics) {
  const slug = slugify(t.title);
  if (existingSlugs.has(slug)) continue;
  const validProducts = (t.products || []).filter((id) => productIds.includes(id));
  topicsData.topics.push({
    slug,
    title: t.title,
    type: t.type,
    category: t.category,
    keyword: t.keyword,
    products: validProducts,
  });
  existingSlugs.add(slug);
  added++;
}

writeJson(topicsFile, topicsData);
console.log(`✅  ${added} nouveaux sujets ajoutés à data/topics.json (total: ${topicsData.topics.length}).`);
