#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_AUDIT = path.join(ROOT, "docs", "stack-audit.json");
const DEFAULT_TECH = path.join(ROOT, "src", "lib", "technology-defaults.json");
const DEFAULT_SERVICE_ACCOUNT = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");

function usage() {
  console.log(`usage: node scripts/migrate-stack-refs.mjs [--apply] [--audit=docs/stack-audit.json]

Dry-run by default. Reads a generated stack audit and writes suggested stackRefs to Firestore only with --apply.
Run audit first:

  npm run audit:stack -- --firestore --write
  npm run migrate:stack-refs
`);
}

function parseArgs(argv) {
  const auditArg = argv.find((arg) => arg.startsWith("--audit="));
  return {
    help: argv.includes("--help"),
    apply: argv.includes("--apply"),
    audit: auditArg ? path.resolve(ROOT, auditArg.slice("--audit=".length)) : DEFAULT_AUDIT,
  };
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

function sameIds(a = [], b = []) {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

async function markSiteDirty(db, changedIds) {
  const now = Timestamp.now();
  const stateRef = db.collection("siteMeta").doc("publishState");
  const change = {
    agent: process.env.ARTLU_AGENT_NAME || process.env.MCP_AGENT_NAME || process.env.USER || "unknown",
    client: "migrate-stack-refs",
    operation: "projects.stackRefs.migrate",
    targetType: "projects",
    targetId: "stackRefs",
    targetName: "project stackRefs",
    changedFields: changedIds,
    note: "Updated project stackRefs from generated stack audit.",
    at: now,
  };
  await stateRef.set({
    dirty: true,
    pendingChanges: FieldValue.increment(1),
    lastContentChangeAt: now,
    lastChangedBy: change,
  }, { merge: true });
  await stateRef.collection("changes").add(change);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const audit = JSON.parse(await readFile(args.audit, "utf8"));
  const technologies = JSON.parse(await readFile(DEFAULT_TECH, "utf8"));
  const techById = new Map(technologies.map((tech) => [tech.id, tech]));
  ensureFirebase();
  const db = getFirestore();
  const candidates = (audit.projects || [])
    .filter((project) => Array.isArray(project.suggestedStackRefs) && project.suggestedStackRefs.length)
    .map((project) => ({
      id: project.id,
      name: project.name,
      stackRefs: [...new Set(project.suggestedStackRefs)].filter(Boolean),
      stack: [...new Set(project.suggestedStackRefs)].map((id) => techById.get(id)?.name || id).filter(Boolean),
    }));

  const updates = [];
  for (const candidate of candidates) {
    const ref = db.collection("projects").doc(candidate.id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`missing Firestore project: ${candidate.id} ${candidate.name}`);
      continue;
    }
    const current = snap.data()?.stackRefs || [];
    const currentStack = snap.data()?.stack || [];
    if (sameIds(current, candidate.stackRefs) && sameIds(currentStack, candidate.stack)) continue;
    updates.push({ ...candidate, ref, current, currentStack });
  }

  if (!args.apply) {
    console.log(`dry run: ${updates.length} projects would receive stackRefs`);
    for (const update of updates) {
      console.log(`- ${update.name} (${update.id})`);
      console.log(`  current: ${update.current.join(", ") || "none"}`);
      console.log(`  next:    ${update.stackRefs.join(", ")}`);
      console.log(`  labels:  ${update.stack.join(", ")}`);
    }
    console.log("\nrun with --apply after reviewing docs/stack-audit.md");
    return;
  }

  if (!updates.length) {
    console.log("no stackRefs updates needed");
    return;
  }

  const batch = db.batch();
  for (const update of updates) {
    batch.set(update.ref, {
      stackRefs: update.stackRefs,
      stack: update.stack,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  await markSiteDirty(db, updates.map((update) => update.id));
  console.log(`updated stackRefs on ${updates.length} projects`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
