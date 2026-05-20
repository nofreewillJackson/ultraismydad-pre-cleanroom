import { getCollection } from "astro:content";
import { getPublicProjects, getVideoIndex } from "../lib/data";

export async function GET() {
  const [projects, videos, research] = await Promise.all([getPublicProjects(), getVideoIndex(), getCollection("research")]);
  const lines = [
    "# artlu.ai",
    "",
    "artlu.ai is a static archive for the 100 projects in 100 days build: projects, videos, research, and journal entries.",
    "",
    "## Main Pages",
    "- Home stack view: https://artlu.ai/",
    "- List view: https://artlu.ai/list",
    "- Map view: https://artlu.ai/map",
    "- Journal: https://artlu.ai/log",
    "- Research: https://artlu.ai/research",
    "- RSS: https://artlu.ai/rss.xml",
    "",
    "## Research",
    ...research.map((post) => `- ${post.data.title}: https://artlu.ai/research/${post.id.replace(/\\.md$/, "")}`),
    "",
    "## Recent Projects",
    ...projects.slice(0, 30).map((project) => `- ${project.name}: https://artlu.ai/project/${project.slug}`),
    "",
    "## Videos",
    ...videos.slice(0, 30).map((video) => `- ${video.title}: https://artlu.ai/video/${video.id}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
