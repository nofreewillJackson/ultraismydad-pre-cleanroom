#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "src", "data", "tracker-snapshot.json");
const DEFAULT_TECH = path.join(ROOT, "src", "lib", "technology-defaults.json");

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

function isOther(value) {
  const key = norm(value);
  return key === "other" || key === "other / unmapped" || key === "unmapped";
}

function buildTechnologyIndex(technologies) {
  const ids = new Set();
  const aliases = new Set();
  for (const tech of technologies || []) {
    if (tech.visibility === "private") continue;
    const values = [tech.id, tech.name, ...(tech.aliases || [])].filter(Boolean);
    if (tech.id) ids.add(String(tech.id));
    for (const value of values) {
      aliases.add(norm(value));
      aliases.add(slugify(value));
    }
  }
  return { ids, aliases };
}

const [snapshotRaw, defaultsRaw] = await Promise.all([
  readFile(SNAPSHOT, "utf8"),
  readFile(DEFAULT_TECH, "utf8"),
]);
const snapshot = JSON.parse(snapshotRaw);
const defaults = JSON.parse(defaultsRaw);
const technologies = snapshot.collections?.technologies?.length ? snapshot.collections.technologies : defaults;
const index = buildTechnologyIndex(technologies);
const projects = snapshot.collections?.projects || [];
const errors = [];

for (const project of projects) {
  if (project.visibility !== "public") continue;
  const name = project.name || project.id || "untitled project";

  for (const ref of project.stackRefs || []) {
    if (isOther(ref)) {
      errors.push(`${name}: stackRefs contains forbidden placeholder "${ref}"`);
    } else if (!index.ids.has(ref)) {
      errors.push(`${name}: stackRefs contains unknown technology id "${ref}"`);
    }
  }

  for (const label of project.stack || []) {
    const key = norm(label);
    const slug = slugify(label);
    if (isOther(label)) {
      errors.push(`${name}: stack contains forbidden placeholder "${label}"`);
    } else if (!index.aliases.has(key) && !index.aliases.has(slug)) {
      errors.push(`${name}: stack contains unknown technology label "${label}"`);
    }
  }
}

if (errors.length) {
  console.error(`[validate:stack] ${errors.length} stack metadata issue(s) found:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[validate:stack] ok: ${projects.length} public project records checked`);
