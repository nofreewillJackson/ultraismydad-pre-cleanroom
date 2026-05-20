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
const DEFAULTS = path.join(ROOT, "src", "lib", "technology-defaults.json");
const DEFAULT_SERVICE_ACCOUNT = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");

function usage() {
  console.log(`usage: node scripts/seed-technologies.mjs [--dry-run]

Upsert canonical stack / technology metadata into Firestore collection technologies.
Tracker entries reference these docs through stackRefs.
`);
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help"),
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

function publicFields(row) {
  return {
    name: row.name || row.id,
    category: row.category || "media",
    aliases: Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [],
    visibility: row.visibility || "public",
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
  };
}

async function markSiteDirty(db, changedIds) {
  const now = Timestamp.now();
  const stateRef = db.collection("siteMeta").doc("publishState");
  const change = {
    agent: process.env.ARTLU_AGENT_NAME || process.env.MCP_AGENT_NAME || process.env.USER || "unknown",
    client: "seed-technologies",
    operation: "technologies.seed",
    targetType: "technologies",
    targetId: "technologies",
    targetName: "technologies",
    changedFields: changedIds,
    note: "Upserted canonical technology / stack metadata.",
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

  const rows = JSON.parse(await readFile(DEFAULTS, "utf8"));
  if (args.dryRun) {
    console.log(`would upsert ${rows.length} technologies docs:`);
    for (const row of rows) console.log(`- ${row.id}: ${row.name} (${row.category})`);
    return;
  }

  ensureFirebase();
  const db = getFirestore();
  const batch = db.batch();
  for (const row of rows) {
    if (!row.id) throw new Error(`technology row missing id: ${JSON.stringify(row)}`);
    const ref = db.collection("technologies").doc(row.id);
    batch.set(ref, {
      ...publicFields(row),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  await markSiteDirty(db, rows.map((row) => row.id));
  console.log(`upserted ${rows.length} technologies docs`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
