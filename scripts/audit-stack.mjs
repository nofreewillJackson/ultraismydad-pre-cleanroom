#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BACKUP = "/Users/ralphxu/Documents/Projects/artlu-tracker-mcp/backups/tracker-backup-20260519-015522.json";
const DEFAULT_TECH = path.join(ROOT, "src", "lib", "technology-defaults.json");
const OUT_JSON = path.join(ROOT, "docs", "stack-audit.json");
const OUT_MD = path.join(ROOT, "docs", "stack-audit.md");
const DEFAULT_SERVICE_ACCOUNT = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");

const categoryOrder = ["frontend", "backend", "data", "infra", "media", "agents", "other"];
const weakTextAliases = new Set(["js", "css", "html", "node", "firebase", "openai", "claude", "gemini"]);

function usage() {
  console.log(`usage: node scripts/audit-stack.mjs [--write] [--firestore] [--backup=/path/to/backup.json]

Audits tracker entry stack strings against canonical technology defaults.

Default source is the MCP backup file. Use --firestore to read live projects with Firebase Admin.
No Firestore writes are performed.
`);
}

function parseArgs(argv) {
  const backupArg = argv.find((arg) => arg.startsWith("--backup="));
  return {
    help: argv.includes("--help"),
    write: argv.includes("--write"),
    firestore: argv.includes("--firestore"),
    includePrivate: argv.includes("--include-private"),
    backup: backupArg ? backupArg.slice("--backup=".length) : DEFAULT_BACKUP,
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function textNorm(value) {
  return ` ${String(value || "").toLowerCase().replace(/[^a-z0-9.+#/-]+/g, " ").replace(/\s+/g, " ")} `;
}

function sortIds(ids, techById) {
  return [...new Set(ids)].sort((a, b) => {
    const ta = techById.get(a);
    const tb = techById.get(b);
    const ca = categoryOrder.indexOf(ta?.category || "");
    const cb = categoryOrder.indexOf(tb?.category || "");
    const byCat = (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb);
    if (byCat) return byCat;
    return (ta?.sortOrder ?? 0) - (tb?.sortOrder ?? 0) || (ta?.name || a).localeCompare(tb?.name || b);
  });
}

function buildAliasIndex(technologies) {
  const exact = new Map();
  const textAliases = [];
  for (const tech of technologies) {
    const aliases = [tech.id, tech.name, ...(tech.aliases || [])].filter(Boolean);
    for (const alias of aliases) {
      const key = norm(alias);
      exact.set(key, tech.id);
      exact.set(slugify(key), tech.id);
      if (key.length >= 3 && !weakTextAliases.has(key)) {
        textAliases.push({ id: tech.id, alias: key });
      }
    }
  }
  return { exact, textAliases };
}

function directIds(project, exact) {
  const ids = [];
  for (const ref of project.stackRefs || []) {
    const key = norm(ref);
    const id = exact.get(key) || exact.get(slugify(key));
    if (id) ids.push(id);
  }
  for (const item of project.stack || []) {
    const key = norm(item);
    const id = exact.get(key) || exact.get(slugify(key));
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function inferredIds(project, textAliases) {
  const hay = textNorm([
    project.name,
    project.desc,
    project.longDesc,
    project.link,
    project.repo,
    ...(project.tags || []),
  ].join(" "));
  const ids = new Set();
  for (const { id, alias } of textAliases) {
    const pattern = ` ${alias} `;
    if (hay.includes(pattern)) ids.add(id);
  }
  return [...ids];
}

function unmatchedStack(project, exact) {
  return (project.stack || []).filter((item) => {
    const key = norm(item);
    return !exact.has(key) && !exact.has(slugify(key));
  });
}

async function loadBackupProjects(filePath) {
  const backup = JSON.parse(await readFile(filePath, "utf8"));
  return backup.collections?.projects || [];
}

function serviceAccountPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_SERVICE_ACCOUNT;
}

function ensureFirebase() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath(), "utf8"));
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: "artluai-tracker",
  });
}

async function loadFirestoreProjects() {
  ensureFirebase();
  const db = getFirestore();
  const snap = await db.collection("projects").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function projectName(project) {
  return project.name || project.title || project.id || "untitled";
}

function renderMarkdown(result, techById) {
  const unmatched = [...result.unmatchedRaw.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const techCounts = [...result.technologyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const review = result.projects.filter((project) => project.unmatchedStack.length || project.inferredOnly.length);
  return `# Stack Audit

Generated by \`npm run audit:stack -- --write\`.

## Summary

- source: ${result.source}
- public projects scanned: ${result.projectCount}
- canonical technologies in defaults: ${techById.size}
- raw stack labels: ${result.rawStackCount}
- unmatched raw stack labels: ${unmatched.length}
- projects needing review: ${review.length}

## Canonical Technology Counts

${techCounts.map(([id, count]) => `- ${techById.get(id)?.name || id}: ${count}`).join("\n") || "- none"}

## Unmatched Raw Stack Labels

${unmatched.map(([label, count]) => `- \`${label}\`: ${count}`).join("\n") || "- none"}

## Projects Needing Review

${review.map((project) => {
    const direct = project.directIds.map((id) => techById.get(id)?.name || id).join(", ") || "none";
    const inferred = project.inferredOnly.map((id) => techById.get(id)?.name || id).join(", ") || "none";
    const unmatchedList = project.unmatchedStack.map((item) => `\`${item}\``).join(", ") || "none";
    return `### ${project.name}

- id: \`${project.id}\`
- date: ${project.date || "unknown"}
- direct stackRefs: ${direct}
- inferred from title/description: ${inferred}
- unmatched raw stack: ${unmatchedList}
- suggested stackRefs: ${project.suggestedStackRefs.map((id) => `\`${id}\``).join(", ") || "none"}`;
  }).join("\n\n") || "- none"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const technologies = JSON.parse(await readFile(DEFAULT_TECH, "utf8"));
  const techById = new Map(technologies.map((tech) => [tech.id, tech]));
  const aliasIndex = buildAliasIndex(technologies);
  const source = args.firestore ? "firestore" : args.backup;
  const rawProjects = args.firestore ? await loadFirestoreProjects() : await loadBackupProjects(args.backup);
  const projects = rawProjects.filter((project) => args.includePrivate || project.visibility !== "private");
  const rawStack = new Map();
  const unmatchedRaw = new Map();
  const technologyCounts = new Map();

  const auditProjects = projects.map((project) => {
    for (const item of project.stack || []) rawStack.set(item, (rawStack.get(item) || 0) + 1);
    const direct = directIds(project, aliasIndex.exact);
    const inferred = inferredIds(project, aliasIndex.textAliases);
    const inferredOnly = inferred.filter((id) => !direct.includes(id));
    const suggestedStackRefs = sortIds([...direct, ...inferredOnly], techById);
    const unmatched = unmatchedStack(project, aliasIndex.exact);
    for (const item of unmatched) unmatchedRaw.set(item, (unmatchedRaw.get(item) || 0) + 1);
    for (const id of suggestedStackRefs) technologyCounts.set(id, (technologyCounts.get(id) || 0) + 1);
    return {
      id: project.id,
      name: projectName(project),
      date: project.date || "",
      directIds: sortIds(direct, techById),
      inferredOnly: sortIds(inferredOnly, techById),
      unmatchedStack: unmatched,
      suggestedStackRefs,
    };
  });

  const result = {
    source,
    projectCount: projects.length,
    rawStackCount: rawStack.size,
    unmatchedRaw,
    technologyCounts,
    projects: auditProjects,
  };

  const serializable = {
    ...result,
    unmatchedRaw: Object.fromEntries([...unmatchedRaw.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    technologyCounts: Object.fromEntries([...technologyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };

  const unmatchedCount = unmatchedRaw.size;
  const reviewCount = auditProjects.filter((project) => project.unmatchedStack.length || project.inferredOnly.length).length;
  console.log(`scanned ${projects.length} public projects from ${source}`);
  console.log(`${rawStack.size} raw stack labels, ${unmatchedCount} unmatched, ${reviewCount} projects need review`);

  if (args.write) {
    await mkdir(path.dirname(OUT_JSON), { recursive: true });
    await writeFile(OUT_JSON, `${JSON.stringify(serializable, null, 2)}\n`);
    await writeFile(OUT_MD, renderMarkdown(result, techById));
    console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
    console.log(`wrote ${path.relative(ROOT, OUT_MD)}`);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
