#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "tracker-snapshot.json");
const DEFAULT_SERVICE_ACCOUNT = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");
const collections = ["projects", "journal", "mainProjects", "series", "technologies"];

function serviceAccountJson() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline);

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_SERVICE_ACCOUNT;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function ensureFirebase() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = serviceAccountJson();
  if (!serviceAccount) {
    throw new Error(
      `Firebase Admin credentials are required. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_B64, GOOGLE_APPLICATION_CREDENTIALS, or place a local key at ${DEFAULT_SERVICE_ACCOUNT}.`,
    );
  }
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: "artluai-tracker",
  });
}

function clean(value) {
  if (value == null) return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  }
  return value;
}

function publicDoc(collectionId, doc) {
  const row = clean({ id: doc.id, ...doc.data() });
  if (collectionId === "projects") return row.visibility === "public" ? row : null;
  if (collectionId === "journal") return row.visibility === "public" ? row : null;
  if (row.visibility === "private") return null;
  return row;
}

async function readAdminCollection(db, collectionId) {
  const snap = await db.collection(collectionId).get();
  return snap.docs
    .map((doc) => publicDoc(collectionId, doc))
    .filter(Boolean);
}

async function main() {
  ensureFirebase();
  const db = getFirestore();
  const mode = "firebase-admin";
  const startedAt = new Date().toISOString();
  const entries = await Promise.all(collections.map(async (collectionId) => {
    const rows = await readAdminCollection(db, collectionId);
    return [collectionId, rows];
  }));
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "firestore",
    mode,
    projectId: "artluai-tracker",
    collections: Object.fromEntries(entries),
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const counts = Object.fromEntries(entries.map(([key, rows]) => [key, rows.length]));
  console.log(`synced tracker snapshot started ${startedAt} using ${mode}`);
  console.log(`wrote ${OUT}`);
  console.log(JSON.stringify(counts));
}

main().catch((error) => {
  console.error("[sync:data] failed to sync Firestore snapshot");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
