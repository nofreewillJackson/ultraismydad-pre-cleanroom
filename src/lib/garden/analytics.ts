/**
 * Graph analytics for the garden — the "structure emerges from simple rules" layer.
 *
 * All of this runs at build time (deterministic, zero runtime cost) and is handed to the
 * GardenGraph canvas, which only renders + animates:
 *   - communities      → label propagation (a local rule → emergent global clusters)
 *   - cluster labels    → most-common tag, else the strongest member's title
 *   - latent links      → unlinked pairs that "want to connect" (Adamic-Adar + shared tags)
 *   - co-tag edges      → a second lens: same notes wired by shared tags instead of links
 *   - orphans / hubs     → the chaos that needs attention, and the load-bearing nodes
 */

export type AnalyticsNote = { slug: string; title: string; links: string[]; tags: string[] };

export type GraphNode = {
  slug: string;
  title: string;
  degree: number;
  community: number; // -1 for orphans (no links)
  color: string;
  orphan: boolean;
  hub: boolean;
  tags: string[];
};
export type GraphEdge = { source: string; target: string; weight: number };
export type Cluster = { id: number; label: string; color: string; size: number };
export type Suggestion = { a: string; b: string; aTitle: string; bTitle: string; score: number; shared: string[] };

export type GraphAnalytics = {
  nodes: GraphNode[];
  linkEdges: GraphEdge[];
  tagEdges: GraphEdge[];
  clusters: Cluster[];
  suggestions: Suggestion[];
  stats: { notes: number; links: number; clusters: number; orphans: number };
};

// Categorical cluster colors via the golden angle — distinct hues that read on both themes.
function communityColor(i: number): string {
  if (i < 0) return "var(--dim)"; // orphans
  const hue = Math.round((i * 137.508) % 360);
  return `hsl(${hue} 60% 58%)`;
}

// Small deterministic PRNG so community detection is reproducible across builds.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Louvain community detection: each node greedily joins the neighbor community that most
 * improves modularity (a local rule), then communities are aggregated and the process
 * repeats. Robust where label propagation collapses into one giant community. Returns a
 * community id per node index.
 */
function louvain(n: number, edgeList: { a: number; b: number; w: number }[]): number[] {
  const rng = mulberry32(0x9e3779b9);
  const finalComm = Array.from({ length: n }, (_, i) => i);
  let members: number[][] = Array.from({ length: n }, (_, i) => [i]);
  let edges: [number, number, number][] = edgeList.map((e) => [e.a, e.b, e.w]);
  let count = n;

  for (let level = 0; level < 12; level++) {
    const adj: Map<number, number>[] = Array.from({ length: count }, () => new Map());
    let m2 = 0;
    for (const [a, b, w] of edges) {
      adj[a].set(b, (adj[a].get(b) || 0) + w);
      if (a !== b) adj[b].set(a, (adj[b].get(a) || 0) + w);
      m2 += 2 * w; // sum of weighted degrees
    }
    if (m2 === 0) break;
    const k = adj.map((m, i) => {
      let s = 0;
      for (const [j, w] of m) s += j === i ? 2 * w : w;
      return s;
    });

    const comm = Array.from({ length: count }, (_, i) => i);
    const sigTot = k.slice();
    const order = [...Array(count).keys()];
    let improved = false;
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const i of order) {
        const ci = comm[i];
        const ki = k[i];
        const wTo = new Map<number, number>();
        for (const [j, w] of adj[i]) if (j !== i) wTo.set(comm[j], (wTo.get(comm[j]) || 0) + w);
        sigTot[ci] -= ki;
        let bestC = ci;
        let bestGain = (wTo.get(ci) || 0) - (sigTot[ci] * ki) / m2;
        for (const [c, wic] of wTo) {
          const gain = wic - (sigTot[c] * ki) / m2;
          if (gain > bestGain) {
            bestGain = gain;
            bestC = c;
          }
        }
        comm[i] = bestC;
        sigTot[bestC] += ki;
        if (bestC !== ci) (moved = true), (improved = true);
      }
    }

    // Relabel 0..cc-1 and fold into the original-node mapping.
    const remap = new Map<number, number>();
    let cc = 0;
    for (let i = 0; i < count; i++) {
      if (!remap.has(comm[i])) remap.set(comm[i], cc++);
      comm[i] = remap.get(comm[i])!;
    }
    const newMembers: number[][] = Array.from({ length: cc }, () => []);
    for (let i = 0; i < count; i++) {
      for (const orig of members[i]) finalComm[orig] = comm[i];
      newMembers[comm[i]].push(...members[i]);
    }
    members = newMembers;
    if (!improved || cc === count) break;

    // Aggregate communities into super-nodes for the next level.
    const aggW = new Map<string, number>();
    for (const [a, b, w] of edges) {
      const ca = comm[a];
      const cb = comm[b];
      const key = ca <= cb ? `${ca}_${cb}` : `${cb}_${ca}`;
      aggW.set(key, (aggW.get(key) || 0) + w);
    }
    edges = [...aggW.entries()].map(([key, w]) => {
      const [a, b] = key.split("_").map(Number);
      return [a, b, w] as [number, number, number];
    });
    count = cc;
  }
  return finalComm;
}

export function buildAnalytics(notes: AnalyticsNote[]): GraphAnalytics {
  const slugs = notes.map((n) => n.slug);
  const bySlug = new Map(notes.map((n) => [n.slug, n]));

  // Undirected link adjacency, restricted to in-collection notes.
  const adj = new Map<string, Set<string>>(slugs.map((s) => [s, new Set<string>()]));
  for (const n of notes) {
    for (const t of n.links) {
      if (!bySlug.has(t) || t === n.slug) continue;
      adj.get(n.slug)!.add(t);
      adj.get(t)!.add(n.slug);
    }
  }
  const degree = (s: string) => adj.get(s)!.size;
  const idx = new Map(slugs.map((s, i) => [s, i]));

  // Communities via Louvain over the link graph. Orphans (no links) stay community -1.
  const linked = slugs.filter((s) => degree(s) > 0);
  const idxEdges: { a: number; b: number; w: number }[] = [];
  {
    const seen = new Set<string>();
    for (const s of slugs)
      for (const t of adj.get(s)!) {
        const key = s < t ? `${s}|${t}` : `${t}|${s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        idxEdges.push({ a: idx.get(s)!, b: idx.get(t)!, w: 1 });
      }
  }
  const louvainComm = louvain(slugs.length, idxEdges);

  // Group linked nodes by community; drop singletons to -1, renumber by size desc.
  const groups = new Map<number, string[]>();
  for (const s of linked) {
    const c = louvainComm[idx.get(s)!];
    (groups.get(c) || groups.set(c, []).get(c)!).push(s);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const community = new Map<string, number>();
  const clusters: Cluster[] = [];
  let cid = 0;
  for (const members of ordered) {
    if (members.length < 2) {
      for (const s of members) community.set(s, -1); // lone linked node → treat as loose
      continue;
    }
    const id = cid++;
    for (const s of members) community.set(s, id);
    clusters.push({ id, label: clusterLabel(members, bySlug, degree), color: communityColor(id), size: members.length });
  }

  // Hubs = the heavily-connected tail of the degree distribution (90th percentile, min 5).
  const degList = linked.map((s) => degree(s)).sort((a, b) => a - b);
  const hubThreshold = Math.max(5, degList.length ? degList[Math.floor(degList.length * 0.9)] : 0);
  const nodes: GraphNode[] = notes.map((n) => {
    const comm = community.get(n.slug) ?? -1;
    return {
      slug: n.slug,
      title: n.title,
      degree: degree(n.slug),
      community: comm,
      color: communityColor(comm),
      orphan: degree(n.slug) === 0,
      hub: degree(n.slug) >= hubThreshold,
      tags: n.tags,
    };
  });

  // Link edges (deduped, undirected).
  const linkEdges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const s of slugs)
    for (const t of adj.get(s)!) {
      const key = s < t ? `${s}|${t}` : `${t}|${s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      linkEdges.push({ source: s, target: t, weight: 1 });
    }

  return {
    nodes,
    linkEdges,
    tagEdges: buildTagEdges(notes),
    clusters,
    suggestions: suggestLinks(notes, adj, bySlug),
    stats: {
      notes: notes.length,
      links: linkEdges.length,
      clusters: clusters.length,
      orphans: nodes.filter((n) => n.orphan).length,
    },
  };
}

function clusterLabel(members: string[], bySlug: Map<string, AnalyticsNote>, degree: (s: string) => number): string {
  const tagCount = new Map<string, number>();
  for (const s of members) for (const t of bySlug.get(s)!.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  let bestTag = "";
  let bestN = 1; // require a tag shared by ≥2 members to name a cluster by it
  for (const [t, c] of tagCount) if (c > bestN) ((bestN = c), (bestTag = t));
  if (bestTag) return `#${bestTag}`;
  // Otherwise name it after its strongest (highest-degree) member.
  const strongest = members.slice().sort((a, b) => degree(b) - degree(a))[0];
  const title = bySlug.get(strongest)!.title;
  return title.length > 26 ? title.slice(0, 24) + "…" : title;
}

/** Co-tag lens: connect notes sharing ≥1 tag; skip over-generic tags to avoid a hairball. */
function buildTagEdges(notes: AnalyticsNote[]): GraphEdge[] {
  const byTag = new Map<string, string[]>();
  for (const n of notes) for (const t of n.tags) (byTag.get(t) || byTag.set(t, []).get(t)!).push(n.slug);
  const weight = new Map<string, number>();
  for (const members of byTag.values()) {
    if (members.length < 2 || members.length > 30) continue;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        weight.set(key, (weight.get(key) || 0) + 1);
      }
  }
  return [...weight.entries()].map(([key, w]) => {
    const [source, target] = key.split("|");
    return { source, target, weight: w };
  });
}

/** Latent links: unlinked 2-hop pairs scored by Adamic-Adar + shared tags. */
function suggestLinks(
  notes: AnalyticsNote[],
  adj: Map<string, Set<string>>,
  bySlug: Map<string, AnalyticsNote>,
): Suggestion[] {
  const degree = (s: string) => adj.get(s)!.size;
  const scored = new Map<string, { score: number; commons: string[] }>();

  for (const n of notes) {
    const a = n.slug;
    const aN = adj.get(a)!;
    // candidate 2-hop nodes
    const twoHop = new Set<string>();
    for (const m of aN) for (const o of adj.get(m)!) if (o !== a && !aN.has(o)) twoHop.add(o);
    for (const b of twoHop) {
      if (a >= b) continue; // dedupe ordered pair
      const bN = adj.get(b)!;
      const commons: string[] = [];
      let aa = 0;
      for (const c of aN)
        if (bN.has(c)) {
          commons.push(c);
          aa += 1 / Math.log(1 + degree(c));
        }
      if (aa <= 0) continue;
      const sharedTags = bySlug.get(a)!.tags.filter((t) => bySlug.get(b)!.tags.includes(t));
      scored.set(`${a}|${b}`, { score: aa + 0.4 * sharedTags.length, commons });
    }
  }

  return [...scored.entries()]
    .map(([key, v]) => {
      const [a, b] = key.split("|");
      const shared = v.commons.slice(0, 2).map((c) => bySlug.get(c)!.title);
      const sharedTags = bySlug.get(a)!.tags.filter((t) => bySlug.get(b)!.tags.includes(t));
      return {
        a,
        b,
        aTitle: bySlug.get(a)!.title,
        bTitle: bySlug.get(b)!.title,
        score: Math.round(v.score * 100) / 100,
        shared: [...shared, ...sharedTags.map((t) => `#${t}`)].slice(0, 3),
      };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 16);
}
