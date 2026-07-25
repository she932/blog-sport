import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../consts.ts';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime()
  );

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: `${base}/blog/${post.id}`,
    })),
    customData: `<language>fr-fr</language>`,
  });
}
