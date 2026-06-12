/**
 * The garden's dedicated markdown renderer.
 *
 * This is intentionally separate from the site's global markdown pipeline (which the
 * research channel renders through). We stand up our own Astro `createMarkdownProcessor`
 * so the garden gets Obsidian-grade rendering — GFM, Shiki code highlighting, math, and the
 * custom plugins in ./plugins.ts — without touching astro.config.mjs or the research page.
 */
import { createMarkdownProcessor, type MarkdownProcessor } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import {
  obsidianWikilinks,
  obsidianHighlight,
  obsidianTags,
  obsidianCallouts,
  obsidianBlockIds,
  obsidianMermaid,
  type LinkResolver,
} from "./plugins";

export type { LinkResolver };

export type GardenRenderer = {
  /** Render one note's body to HTML, returning the resolved outbound wikilink slugs. */
  render(body: string): Promise<{ code: string; links: string[] }>;
};

/**
 * Strip Obsidian `%%comments%%` (inline and block) before parsing, while leaving anything
 * inside fenced code blocks untouched. Done on raw text because block comments can span
 * paragraph boundaries.
 */
export function stripComments(src: string): string {
  const out: string[] = [];
  let inFence = false;
  let inBlockComment = false;
  for (let line of src.split("\n")) {
    if (/^\s*(```+|~~~+)/.test(line) && !inBlockComment) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*%%\s*$/.test(line)) {
      inBlockComment = !inBlockComment;
      continue;
    }
    if (inBlockComment) continue;
    line = line.replace(/%%[^\n]*?%%/g, "");
    out.push(line);
  }
  return out.join("\n");
}

export async function createGardenRenderer(opts: {
  resolve: LinkResolver;
  onTag?: (tag: string) => void;
}): Promise<GardenRenderer> {
  // Mutable sink swapped per render; renders run sequentially in the loader, so this is safe.
  let sink = new Set<string>();

  const processor: MarkdownProcessor = await createMarkdownProcessor({
    gfm: true,
    smartypants: true,
    // Dual themes emit `--shiki-light`/`--shiki-dark` CSS vars; global.css switches on
    // [data-theme] so highlighted code re-themes with the site toggle.
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      wrap: true,
    },
    // No-option plugins are attachers `() => transformer` and are passed UNCALLED; the
    // parameterized ones are `(opts) => () => transformer`, so calling them yields the attacher.
    remarkPlugins: [
      obsidianMermaid,
      remarkMath,
      remarkBreaks,
      obsidianBlockIds,
      obsidianCallouts,
      obsidianWikilinks({ resolve: opts.resolve, sink: () => sink }),
      obsidianHighlight,
      obsidianTags({ onTag: opts.onTag }),
    ],
    rehypePlugins: [rehypeKatex],
  });

  return {
    async render(body: string) {
      sink = new Set<string>();
      const { code } = await processor.render(stripComments(body));
      return { code, links: [...sink] };
    },
  };
}
