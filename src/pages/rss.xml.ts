import RSS from "rss";
import { getCollection } from "astro:content";

export async function GET() {
  const feed = new RSS({
    title: "artlu.ai research",
    description: "AI research writeups and experiments from artlu.ai.",
    feed_url: "https://artlu.ai/rss.xml",
    site_url: "https://artlu.ai",
    language: "en",
  });
  const posts = await getCollection("research");
  posts.sort((a, b) => b.data.date.localeCompare(a.data.date));
  for (const post of posts) {
    const slug = post.id.replace(/\.md$/, "");
    feed.item({
      title: post.data.title,
      description: post.data.description,
      url: `https://artlu.ai/research/${slug}`,
      date: post.data.date,
    });
  }
  return new Response(feed.xml({ indent: true }), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
