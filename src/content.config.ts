import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const research = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/research" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    tags: z.array(z.string()).default([]),
    demoUrl: z.string().url().optional(),
    repoUrl: z.string().url().optional(),
  }),
});

// The digital garden — Obsidian-flavored notes rendered by the dedicated, isolated
// pipeline in src/lib/garden/. Deliberately NOT routed through Astro's global markdown
// render (which the research channel uses); see src/lib/garden/render.ts.
const garden = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/garden" }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    date: z.string().default(""),
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    slug: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { research, garden };
