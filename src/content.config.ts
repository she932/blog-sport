import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Collection principale : les articles du blog, écrits en Markdown
// et stockés dans src/content/blog/. Chaque fichier porte un
// frontmatter validé par le schéma ci-dessous.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(['comparatifs', 'guides', 'conseils', 'materiel']),
    tags: z.array(z.string()).default([]),
    author: z.string().default('La rédaction MuscuGuide'),
    // Mot-clé principal ciblé pour le référencement.
    keyword: z.string().optional(),
    // Article mis en avant sur la page d'accueil.
    featured: z.boolean().default(false),
    // Image de couverture (chemin relatif à /public ou URL).
    heroImage: z.string().optional(),
    // Questions/réponses -> génère un bloc FAQ + schema.org FAQPage.
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .default([]),
    // Temps de lecture estimé (minutes), calculé à la génération.
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
