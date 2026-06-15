#!/usr/bin/env node
// Static reachability tracer for the Astro app.
// Roots = every file under src/pages/ (Astro file-based routing).
// Follows static + dynamic imports across .astro/.ts/.tsx/.js/.jsx, which
// off-the-shelf tools (madge, dependency-cruiser) cannot do for .astro.
//
//   node scripts/trace-reachability.mjs                    # this repo (defaults below)
//   node scripts/trace-reachability.mjs --graph            # also writes graph.dot
//
// PORTABLE — copy this file into any JS/TS project and point it at that project:
//   node trace-reachability.mjs --src app --roots app/server.ts,app/cli.ts
//   node trace-reachability.mjs --src . --ext .ts,.tsx --roots src/index.ts
//
// Options:
//   --src <dir>     folder to scan          (default: "src")
//   --roots <list>  comma-separated entry files/dirs to start from
//                   (default: auto-detect — src/pages, else src/index.* / main.*)
//   --ext <list>    comma-separated file extensions to follow
//   --graph         also write graph.dot   (render: dot -Tsvg graph.dot -o graph.svg)
//
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};

const SRC = path.resolve(opt("--src", "src"));
const EXTS = opt("--ext", ".astro,.ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte").split(",");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// Resolve an import specifier to a real file on disk (relative imports only).
function resolve(fromFile, spec) {
  if (!spec.startsWith(".")) return null; // bare module / alias / URL — skip
  const base = path.resolve(path.dirname(fromFile), spec);
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTS) {
    const idx = path.join(base, "index" + ext);
    if (existsSync(idx)) return idx;
  }
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file) {
  const code = readFileSync(file, "utf8");
  const out = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    const target = resolve(file, spec);
    if (target) out.push(target);
  }
  return out;
}

const allFiles = walk(SRC).filter((f) => EXTS.includes(path.extname(f)));

// Entry points = where execution begins. Override with --roots; otherwise guess
// using common conventions (Astro/Next file routing, then an index/main file).
function detectRoots() {
  const explicit = opt("--roots", null);
  if (explicit) {
    return explicit.split(",").flatMap((r) => {
      const abs = path.resolve(r);
      if (!existsSync(abs)) return [];
      return statSync(abs).isDirectory()
        ? allFiles.filter((f) => f.startsWith(abs + path.sep))
        : [abs];
    });
  }
  const pagesDir = path.join(SRC, "pages"); // Astro / Next.js pages router
  if (existsSync(pagesDir)) return allFiles.filter((f) => f.startsWith(pagesDir + path.sep));
  const indexish = ["index", "main", "app", "server", "cli"].flatMap((n) =>
    EXTS.map((e) => path.join(SRC, n + e)),
  );
  return indexish.filter(existsSync);
}

const roots = detectRoots();
if (roots.length === 0) {
  console.error(`No entry points found under ${SRC}. Pass --roots <file-or-dir,...>`);
  process.exit(1);
}

const reachable = new Set();
const edges = []; // [fromRel, toRel] among reachable files, for the graph
const queue = [...roots];
while (queue.length) {
  const f = queue.shift();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const dep of importsOf(f)) if (!reachable.has(dep)) queue.push(dep);
}
// Collect edges only after the reachable set is known.
for (const f of reachable)
  for (const dep of importsOf(f))
    if (reachable.has(dep)) edges.push([path.relative(SRC, f), path.relative(SRC, dep)]);

const rel = (f) => path.relative(SRC, f);
const dead = allFiles.filter((f) => !reachable.has(f)).map(rel).sort();

console.log(`Entry points (roots): ${roots.length}`);
console.log(`Reachable from roots: ${reachable.size}/${allFiles.length}\n`);
console.log(`DEAD (never imported by any route): ${dead.length}`);
for (const f of dead) console.log("  " + f);

if (process.argv.includes("--graph")) {
  // Group nodes into graphviz clusters by their top-level src/ folder
  // (pages, layouts, components, lib) so the diagram reads as layers.
  const groupOf = (f) => f.split("/")[0];
  const byGroup = new Map();
  for (const f of reachable) {
    const g = groupOf(rel(f));
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(rel(f));
  }
  const lines = [
    "digraph deps {",
    "  rankdir=LR;",
    '  node [shape=box, style="rounded,filled", fillcolor="#f5f5f5", fontname="Helvetica", fontsize=10];',
    '  edge [color="#999999"];',
  ];
  for (const [g, files] of byGroup) {
    lines.push(`  subgraph "cluster_${g}" {`, `    label="${g}"; color="#cccccc";`);
    for (const f of files.sort()) lines.push(`    "${f}";`);
    lines.push("  }");
  }
  for (const [from, to] of edges) lines.push(`  "${from}" -> "${to}";`);
  lines.push("}");
  writeFileSync("graph.dot", lines.join("\n") + "\n");
  console.log("\nWrote graph.dot — render with: dot -Tsvg graph.dot -o graph.svg");
}
