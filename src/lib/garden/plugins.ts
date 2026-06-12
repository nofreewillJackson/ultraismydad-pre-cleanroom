/**
 * Obsidian-flavored markdown — custom remark plugins.
 *
 * These run inside the garden's own isolated processor (src/lib/garden/render.ts) and are
 * deliberately NOT applied to the site's global markdown pipeline. Each export is a unified
 * *attacher* (`(options?) => transformer`) so it can be dropped straight into `remarkPlugins`.
 *
 * Covered here: [[wikilinks]] / ![[embeds]], > [!callouts], ==highlight==, #tags,
 * trailing ^block-ids, and ```mermaid``` interception. Math is handled by remark-math +
 * rehype-katex; GFM + Shiki code highlighting come from the Astro processor itself.
 */
import { visit, SKIP } from "unist-util-visit";
import { slugify, escapeHtml } from "../format";

// mdast/hast nodes are intentionally loose here.
type AnyNode = any;

export type LinkResolver = (name: string) => { slug: string; title: string; exists: boolean };

/** Parents whose text content must never be transformed (links, code, math, definitions). */
const SKIP_PARENTS = new Set([
  "link",
  "linkReference",
  "code",
  "inlineCode",
  "math",
  "inlineMath",
  "definition",
]);

const MEDIA_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;
const AV_RE = /\.(mp4|webm|ogg|mov|m4v)$/i;

/**
 * Walk every `text` node and replace regex matches with generated nodes.
 * `build` returns the replacement nodes for a match, or `null` to leave it untouched.
 */
function replaceText(
  tree: AnyNode,
  regex: RegExp,
  build: (m: RegExpExecArray, ctx: { parent: AnyNode }) => AnyNode[] | null,
) {
  visit(tree, "text", (node: AnyNode, index: number | undefined, parent: AnyNode) => {
    if (!parent || index === undefined || SKIP_PARENTS.has(parent.type)) return;
    const value: string = node.value;
    regex.lastIndex = 0;
    if (!regex.test(value)) return;
    regex.lastIndex = 0;

    const out: AnyNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value))) {
      const built = build(m, { parent });
      if (m.index === regex.lastIndex) regex.lastIndex++;
      if (!built) continue; // leave this match in place; it stays in the next text slice
      if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
      out.push(...built);
      last = m.index + m[0].length;
    }
    if (!out.length) return;
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    parent.children.splice(index, 1, ...out);
    return [SKIP, index + out.length];
  });
}

function lastTextNode(node: AnyNode): AnyNode | null {
  if (node.type === "text") return node;
  if (!node.children?.length) return null;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const found = lastTextNode(node.children[i]);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// [[wikilinks]] and ![[embeds]]
// ---------------------------------------------------------------------------

function fragmentFor(hash: string): string {
  if (!hash) return "";
  return hash.startsWith("^") ? hash.slice(1) : slugify(hash);
}

/** Build the node for an embed (`![[...]]`): image/video → media; note → transclusion placeholder. */
function buildEmbed(inner: string, resolve: LinkResolver): AnyNode | null {
  let [targetPart, alias] = inner.split("|").map((s) => s.trim());
  const hashIdx = targetPart.indexOf("#");
  const name = hashIdx >= 0 ? targetPart.slice(0, hashIdx).trim() : targetPart;
  const hash = hashIdx >= 0 ? targetPart.slice(hashIdx + 1).trim() : "";

  // Media embeds (image / audio-video). Authors place attachments under public/.
  if (MEDIA_RE.test(name) || AV_RE.test(name)) {
    const src = /^https?:\/\//i.test(name) || name.startsWith("/") ? name : `/${name}`;
    if (AV_RE.test(name)) {
      return { type: "html", value: `<video class="gm-embed-media" controls src="${escapeHtml(src)}"></video>` };
    }
    return { type: "image", url: src, alt: alias || name, title: null };
  }

  // Note transclusion — emit a placeholder the loader fills in (src/lib/garden/index.ts).
  const res = resolve(name);
  const label = alias || name || res.title;
  const frag = fragmentFor(hash);
  const href = (res.exists ? `/garden/${res.slug}` : "#") + (frag ? `#${frag}` : "");
  return {
    type: "html",
    value:
      `<div class="gm-embed${res.exists ? "" : " is-unresolved"}" data-embed-slug="${escapeHtml(res.exists ? res.slug : "")}" ` +
      `data-embed-hash="${escapeHtml(hash)}" data-embed-label="${escapeHtml(label)}">` +
      `<a class="gm-wikilink${res.exists ? "" : " is-unresolved"}" href="${escapeHtml(href)}">${escapeHtml(label)}</a></div>`,
  };
}

/** Build the node for a wikilink (`[[...]]`). Records the outbound slug via `sink`. */
function buildWikilink(inner: string, resolve: LinkResolver, sink: () => Set<string>): AnyNode {
  let [targetPart, alias] = inner.split("|").map((s) => s.trim());
  const hashIdx = targetPart.indexOf("#");
  const name = hashIdx >= 0 ? targetPart.slice(0, hashIdx).trim() : targetPart;
  const hash = hashIdx >= 0 ? targetPart.slice(hashIdx + 1).trim() : "";
  const res = name ? resolve(name) : { slug: "", title: "", exists: false };

  if (res.exists) sink().add(res.slug);

  const frag = fragmentFor(hash);
  const display =
    alias || (name ? (hash ? `${name} › ${hash.replace(/^\^/, "")}` : name) : hash.replace(/^\^/, ""));
  const href = name
    ? (res.exists ? `/garden/${res.slug}` : "#") + (frag ? `#${frag}` : "")
    : frag
    ? `#${frag}`
    : "#";

  return {
    type: "link",
    url: href,
    title: null,
    data: { hProperties: { className: ["gm-wikilink", ...(name && !res.exists ? ["is-unresolved"] : [])] } },
    children: [{ type: "text", value: display }],
  };
}

export const obsidianWikilinks =
  (opts: { resolve: LinkResolver; sink: () => Set<string> }) =>
  () =>
  (tree: AnyNode) => {
    // Block-level embeds: a paragraph that is *only* `![[...]]` becomes a block node (so the
    // transclusion isn't wrapped in <p>). Mixed-in embeds fall through to the inline pass.
    visit(tree, "paragraph", (node: AnyNode, index: number | undefined, parent: AnyNode) => {
      if (!parent || index === undefined) return;
      if (node.children.length !== 1 || node.children[0].type !== "text") return;
      const m = node.children[0].value.trim().match(/^!\[\[([^\]\n]+?)\]\]$/);
      if (!m) return;
      const built = buildEmbed(m[1], opts.resolve);
      if (!built) return;
      parent.children.splice(index, 1, built);
      return [SKIP, index + 1];
    });

    // Inline wikilinks + inline embeds.
    replaceText(tree, /(!?)\[\[([^\]\n]+?)\]\]/g, (m) => {
      if (m[1] === "!") {
        const built = buildEmbed(m[2].trim(), opts.resolve);
        return built ? [built] : null;
      }
      return [buildWikilink(m[2].trim(), opts.resolve, opts.sink)];
    });
  };

// ---------------------------------------------------------------------------
// ==highlight==
// ---------------------------------------------------------------------------

export const obsidianHighlight = () => (tree: AnyNode) =>
  replaceText(tree, /==(?=\S)([^=]+?)==/g, (m) => [
    {
      type: "emphasis", // overridden to <mark> below
      data: { hName: "mark", hProperties: { className: ["gm-highlight"] } },
      children: [{ type: "text", value: m[1] }],
    },
  ]);

// ---------------------------------------------------------------------------
// #tags
// ---------------------------------------------------------------------------

export const obsidianTags =
  (opts: { onTag?: (tag: string) => void }) =>
  () =>
  (tree: AnyNode) =>
    replaceText(tree, /(^|[\s(>])#([A-Za-z][\w-]*(?:\/[A-Za-z][\w-]*)*)/g, (m, ctx) => {
      if (ctx.parent && ctx.parent.type === "heading") return null; // never tag-ify heading text
      const lead = m[1];
      const tag = m[2];
      opts.onTag?.(tag.toLowerCase());
      const nodes: AnyNode[] = [];
      if (lead) nodes.push({ type: "text", value: lead });
      nodes.push({
        type: "link",
        url: `/garden?tag=${encodeURIComponent(tag.toLowerCase())}`,
        title: null,
        data: { hProperties: { className: ["gm-tag"], "data-tag": tag.toLowerCase() } },
        children: [{ type: "text", value: `#${tag}` }],
      });
      return nodes;
    });

// ---------------------------------------------------------------------------
// > [!callouts]
// ---------------------------------------------------------------------------

const CALLOUTS: Record<string, { icon: string; label: string }> = {
  note: { icon: "✎", label: "Note" },
  abstract: { icon: "❑", label: "Abstract" },
  summary: { icon: "❑", label: "Summary" },
  tldr: { icon: "❑", label: "TL;DR" },
  info: { icon: "ⓘ", label: "Info" },
  todo: { icon: "☑", label: "Todo" },
  tip: { icon: "✷", label: "Tip" },
  hint: { icon: "✷", label: "Hint" },
  important: { icon: "✷", label: "Important" },
  success: { icon: "✓", label: "Success" },
  check: { icon: "✓", label: "Check" },
  done: { icon: "✓", label: "Done" },
  question: { icon: "?", label: "Question" },
  help: { icon: "?", label: "Help" },
  faq: { icon: "?", label: "FAQ" },
  warning: { icon: "⚠", label: "Warning" },
  caution: { icon: "⚠", label: "Caution" },
  attention: { icon: "⚠", label: "Attention" },
  failure: { icon: "✕", label: "Failure" },
  fail: { icon: "✕", label: "Fail" },
  missing: { icon: "✕", label: "Missing" },
  danger: { icon: "ϟ", label: "Danger" },
  error: { icon: "ϟ", label: "Error" },
  bug: { icon: "⊘", label: "Bug" },
  example: { icon: "❯", label: "Example" },
  quote: { icon: "❝", label: "Quote" },
  cite: { icon: "❝", label: "Quote" },
};

export const obsidianCallouts = () => (tree: AnyNode) =>
  visit(tree, "blockquote", (node: AnyNode) => {
    if (node.data?.hName) return; // already transformed (our nested content wrapper)
    const first = node.children?.[0];
    if (!first || first.type !== "paragraph" || !first.children?.length) return;
    const lead = first.children[0];
    if (!lead || lead.type !== "text") return;
    // Match only the first line of the marker; body may follow on later lines/paragraphs.
    const m = lead.value.match(/^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)/);
    if (!m) return;

    const type = m[1].toLowerCase();
    const fold = m[2];
    const meta = CALLOUTS[type] || { icon: "‣", label: type.charAt(0).toUpperCase() + type.slice(1) };
    const title = (m[3] || "").trim() || meta.label;

    // Strip the marker line from the first text node, keeping any same-paragraph body.
    lead.value = lead.value.slice(m[0].length).replace(/^\n/, "");
    if (lead.value === "") {
      first.children.shift();
      if (first.children[0]?.type === "break") first.children.shift();
    }
    const body = node.children.slice();
    if (first.children.length === 0) body.shift();

    const titleNode = {
      type: "paragraph",
      data: { hName: "div", hProperties: { className: ["gm-callout-title"] } },
      children: [
        { type: "html", value: `<span class="gm-callout-icon" aria-hidden="true">${meta.icon}</span>` },
        { type: "html", value: `<span class="gm-callout-titletext">${escapeHtml(title)}</span>` },
        ...(fold ? [{ type: "html", value: `<span class="gm-callout-fold" aria-hidden="true">▾</span>` }] : []),
      ],
    };
    const content = {
      type: "blockquote", // overridden to <div> so it doesn't render a nested blockquote
      data: { hName: "div", hProperties: { className: ["gm-callout-content"] } },
      children: body,
    };

    const hProperties: Record<string, unknown> = {
      className: ["gm-callout", `gm-callout-${type}`],
      "data-callout": type,
    };
    if (fold) {
      hProperties["data-collapsible"] = "true";
      if (fold === "-") hProperties["data-collapsed"] = "true";
    }
    node.data = { hName: "div", hProperties };
    node.children = [titleNode, content];
  });

// ---------------------------------------------------------------------------
// Trailing ^block-ids
// ---------------------------------------------------------------------------

export const obsidianBlockIds = () => (tree: AnyNode) =>
  visit(tree, (node: AnyNode) => {
    if (!["paragraph", "heading", "listItem", "blockquote", "tableCell"].includes(node.type)) return;
    if (node.data?.id || node.data?.hProperties?.id) return;
    const last = lastTextNode(node);
    if (!last) return;
    const m = last.value.match(/[ \t]+\^([\w-]+)[ \t]*$/);
    if (!m) return;
    last.value = last.value.slice(0, last.value.length - m[0].length);
    node.data = node.data || {};
    node.data.hProperties = { ...(node.data.hProperties || {}), id: m[1] };
  });

// ---------------------------------------------------------------------------
// ```mermaid``` → client-rendered diagram container
// ---------------------------------------------------------------------------

export const obsidianMermaid = () => (tree: AnyNode) =>
  visit(tree, "code", (node: AnyNode, index: number | undefined, parent: AnyNode) => {
    if (!parent || index === undefined) return;
    if ((node.lang || "").toLowerCase() !== "mermaid") return;
    const src = escapeHtml(node.value || "");
    parent.children.splice(index, 1, {
      type: "html",
      value: `<pre class="mermaid gm-mermaid" data-mermaid-src="${src}">${src}</pre>`,
    });
    return [SKIP, index + 1];
  });
