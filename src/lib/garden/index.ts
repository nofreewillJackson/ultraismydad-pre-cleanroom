/**
 * Garden data layer: loads the `garden` collection, renders each note with the dedicated
 * Obsidian renderer, then derives the link graph, backlinks ("linked mentions"), the tag
 * index, and resolves `![[note]]` transclusions. Cached so the index and detail pages
 * share one build.
 */
import { getCollection } from "astro:content";
import { slugify, escapeHtml } from "../format";
import { createGardenRenderer, type LinkResolver } from "./render";
import { buildAnalytics, type GraphAnalytics } from "./analytics";

export type { GraphAnalytics } from "./analytics";

export type GardenNote = {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  aliases: string[];
  html: string;
  links: string[]; // outbound, resolved slugs
  backlinks: string[]; // inbound slugs
};

export type GardenData = {
  notes: GardenNote[];
  bySlug: Map<string, GardenNote>;
  tags: { tag: string; count: number }[];
  graph: GraphAnalytics;
};

let cache: Promise<GardenData> | null = null;
export function getGardenData(): Promise<GardenData> {
  if (!cache) cache = build();
  return cache;
}

async function build(): Promise<GardenData> {
  const includeDrafts = Boolean((import.meta as any).env?.DEV);
  const entries = (await getCollection("garden")).filter(
    (e: any) => includeDrafts || !e.data.draft,
  );

  // Stable slug + display metadata per note.
  const metas = entries.map((entry: any) => {
    const base = entry.id.replace(/\.md$/, "").split("/").pop() || entry.id;
    const slug = slugify(entry.data.slug || base);
    return {
      entry,
      base,
      slug,
      title: entry.data.title || base,
      aliases: (entry.data.aliases || []) as string[],
    };
  });

  // Resolve a wikilink target name → slug by filename, title, slug, or alias (case-insensitive).
  const nameMap = new Map<string, { slug: string; title: string }>();
  for (const m of metas) {
    const add = (name?: string) => {
      const key = (name || "").trim().toLowerCase();
      if (key && !nameMap.has(key)) nameMap.set(key, { slug: m.slug, title: m.title });
    };
    add(m.base);
    add(m.title);
    add(m.slug);
    m.aliases.forEach(add);
  }
  const resolve: LinkResolver = (name) => {
    const hit = nameMap.get(name.trim().toLowerCase());
    if (hit) return { slug: hit.slug, title: hit.title, exists: true };
    return { slug: slugify(name), title: name, exists: false };
  };

  const renderer = await createGardenRenderer({ resolve });

  const notes: GardenNote[] = [];
  for (const m of metas) {
    const { code, links } = await renderer.render(m.entry.body || "");
    notes.push({
      id: m.entry.id,
      slug: m.slug,
      title: m.title,
      description: m.entry.data.description || "",
      date: m.entry.data.date || "",
      tags: (m.entry.data.tags || []).map((t: string) => t.toLowerCase()),
      aliases: m.aliases,
      html: code,
      links: [...new Set(links)].filter((s) => s !== m.slug),
      backlinks: [],
    });
  }

  const bySlug = new Map(notes.map((n) => [n.slug, n]));

  // Backlinks.
  for (const n of notes) {
    for (const target of n.links) {
      const t = bySlug.get(target);
      if (t && !t.backlinks.includes(n.slug)) t.backlinks.push(n.slug);
    }
  }

  // Transclusion: substitute embed placeholders with the target's rendered HTML. Read from a
  // frozen copy of the unresolved HTML so substitution order and recursion stay deterministic.
  const original = new Map(notes.map((n) => [n.slug, n.html]));
  const getNote = (slug: string) => {
    const n = bySlug.get(slug);
    return n ? { slug: n.slug, title: n.title, html: original.get(slug) || "" } : null;
  };
  for (const n of notes) {
    n.html = resolveEmbeds(original.get(n.slug) || "", getNote, 0);
  }

  // Tag index (from frontmatter).
  const tagCount = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const tags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  // Graph analytics — communities, latent links, lenses (see ./analytics.ts).
  const graph = buildAnalytics(notes.map((n) => ({ slug: n.slug, title: n.title, links: n.links, tags: n.tags })));

  notes.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));

  return { notes, bySlug, tags, graph };
}

// ---------------------------------------------------------------------------
// Transclusion
// ---------------------------------------------------------------------------

type EmbedTarget = { slug: string; title: string; html: string } | null;

const EMBED_RE =
  /<div class="gm-embed[^"]*" data-embed-slug="([^"]*)" data-embed-hash="([^"]*)" data-embed-label="([^"]*)">[\s\S]*?<\/div>/g;

function resolveEmbeds(html: string, getNote: (slug: string) => EmbedTarget, depth: number): string {
  if (depth > 2) return stripPlaceholders(html);
  const resolved = html.replace(EMBED_RE, (_full, slug, hash, label) => {
    const target = slug ? getNote(slug) : null;
    if (!target) {
      return `<div class="gm-embed is-unresolved"><div class="gm-embed-head">${label} <span class="gm-embed-missing">— unresolved embed</span></div></div>`;
    }
    let inner = hash ? sliceSection(target.html, hash) ?? target.html : target.html;
    inner = resolveEmbeds(inner, getNote, depth + 1);
    const hashLabel = hash ? ` <span class="gm-embed-sub">› ${escapeHtml(hash.replace(/^\^/, ""))}</span>` : "";
    return (
      `<figure class="gm-embed gm-embed-note">` +
      `<figcaption class="gm-embed-head"><a href="/garden/${target.slug}">${escapeHtml(target.title)}</a>${hashLabel}</figcaption>` +
      `<div class="gm-embed-body">${inner}</div></figure>`
    );
  });
  // Lift block embeds that landed inside a paragraph out of the invalid <p> wrapper.
  return resolved.replace(/<p>(\s*<figure class="gm-embed[\s\S]*?<\/figure>\s*)<\/p>/g, "$1");
}

function stripPlaceholders(html: string): string {
  return html.replace(EMBED_RE, (_full, _slug, _hash, label) => `<span class="gm-embed-flat">${label}</span>`);
}

/** Extract a heading section (`#Heading`) or a single block (`#^id`) from rendered HTML. */
function sliceSection(html: string, hash: string): string | null {
  if (hash.startsWith("^")) return extractById(html, hash.slice(1));
  const id = slugify(hash);
  const headingRe = new RegExp(`<h([1-6])[^>]*\\bid="${escapeRe(id)}"[^>]*>`, "i");
  const m = headingRe.exec(html);
  if (!m) return extractById(html, id);
  const level = Number(m[1]);
  const start = m.index;
  const nextRe = /<h([1-6])[^>]*>/gi;
  nextRe.lastIndex = start + m[0].length;
  let nm: RegExpExecArray | null;
  let end = html.length;
  while ((nm = nextRe.exec(html))) {
    if (Number(nm[1]) <= level) {
      end = nm.index;
      break;
    }
  }
  return html.slice(start, end);
}

/** Return the outerHTML of the smallest element carrying `id="<id>"`. */
function extractById(html: string, id: string): string | null {
  const idRe = new RegExp(`\\bid="${escapeRe(id)}"`, "i");
  const idm = idRe.exec(html);
  if (!idm) return null;
  const start = html.lastIndexOf("<", idm.index);
  if (start < 0) return null;
  const tagM = /^<([a-zA-Z0-9]+)/.exec(html.slice(start));
  if (!tagM) return null;
  const tag = tagM[1];
  if (/^(img|hr|br|input)$/i.test(tag)) {
    const close = html.indexOf(">", start);
    return close >= 0 ? html.slice(start, close + 1) : null;
  }
  const tokenRe = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
  tokenRe.lastIndex = start;
  let depth = 0;
  let tk: RegExpExecArray | null;
  while ((tk = tokenRe.exec(html))) {
    if (tk[0][1] === "/") {
      depth--;
      if (depth === 0) return html.slice(start, tk.index + tk[0].length);
    } else {
      depth++;
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
