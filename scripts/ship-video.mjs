#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.resolve(ROOT, "..", "spoolcast-content");
const SHIPMENTS = path.join(__dirname, "video-shipments.json");
const SHIPPED = path.join(__dirname, "shipped-videos.json");
const SYNC_SCRIPT = path.join(__dirname, "sync-video.mjs");
const PUBLIC_VIDEOS = path.join(ROOT, "public", "videos");
const DEFAULT_SERVICE_ACCOUNT = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");

function usage() {
  console.log(`usage: node scripts/ship-video.mjs <videoId> [options]

Build a guidebook package from ../spoolcast-content, then update exactly one
Firestore tracker entry as guidebookStatus=ready.

options:
  --dry-run          validate and print the plan without writing files or Firestore
  --no-sync          skip scripts/sync-video.mjs (useful after package files already exist)
  --no-firestore     skip Firestore update and dirty marker
  --trigger-build    POST NETLIFY_BUILD_HOOK_URL after Firestore update
  --help             show this help
`);
}

function parseArgs(argv) {
  const flags = new Set();
  let videoId = "";
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg);
    else if (!videoId) videoId = arg;
  }
  return {
    videoId,
    dryRun: flags.has("--dry-run"),
    noSync: flags.has("--no-sync"),
    noFirestore: flags.has("--no-firestore"),
    triggerBuild: flags.has("--trigger-build"),
    help: flags.has("--help"),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function assertExists(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function parseTiktokId(url) {
  if (!url) return "";
  const match = String(url).match(/\/video\/(\d{6,})/);
  return match?.[1] || "";
}

function youtubeUrl(youtubeId) {
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "";
}

function makeProjectSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, inner]) => inner !== undefined),
  );
}

function seriesIdFor(shipment) {
  if (shipment.seriesId) return shipment.seriesId;
  if (shipment.format === "short") return "aninews";
  if (shipment.videoId.includes("dev-log")) return "spoolcast-dev-log";
  return "videos";
}

function defaultStackFor(shipment) {
  if (Array.isArray(shipment.stack) && shipment.stack.length) return shipment.stack;
  if (shipment.format === "short") return ["spoolcast", "Seedance 2.0 Fast", "Google Cloud TTS", "ffmpeg"];
  return ["spoolcast", "Remotion", "Google Cloud TTS", "AI image generation", "YouTube"];
}

function shippedManifestRow(shipment) {
  const base = {
    id: shipment.videoId,
    title: shipment.title,
    desc: shipment.desc || "",
    youtubeId: shipment.youtubeId,
    shippedAt: shipment.shippedAt,
    durationSec: shipment.durationSec,
    notes: shipment.notes || "",
  };

  if (shipment.format === "short") {
    return cleanObject({
      ...base,
      format: "short",
      show: shipment.show,
      sessionDate: shipment.sessionDate,
      tiktokUrl: shipment.tiktokUrl || undefined,
      hiddenBeatNs: shipment.hiddenBeatNs || [],
    });
  }

  return cleanObject({
    ...base,
    hiddenChunkIds: shipment.hiddenChunkIds || [],
  });
}

function sortShipments(rows) {
  return rows.sort((a, b) => {
    const byDate = String(b.shippedAt || "").localeCompare(String(a.shippedAt || ""));
    if (byDate) return byDate;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

async function upsertShippedManifest(shipment, { dryRun }) {
  const rows = await readJson(SHIPPED);
  const nextRow = shippedManifestRow(shipment);
  const index = rows.findIndex((row) => row.id === shipment.videoId);
  const nextRows = [...rows];

  if (index >= 0) nextRows[index] = cleanObject({ ...rows[index], ...nextRow });
  else nextRows.unshift(nextRow);

  sortShipments(nextRows);

  if (!dryRun) await writeJson(SHIPPED, nextRows);

  return { action: index >= 0 ? "updated" : "inserted", row: nextRow };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      ...options,
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function runSyncVideo(videoId, { dryRun, noSync }) {
  if (dryRun) {
    console.log(`[dry-run] would run: node scripts/sync-video.mjs ${videoId}`);
    return;
  }
  if (noSync) {
    console.log("skip sync-video: --no-sync");
    return;
  }
  await runCommand(process.execPath, [SYNC_SCRIPT, videoId]);
}

async function verifyBundle(videoId) {
  const bundlePath = path.join(PUBLIC_VIDEOS, videoId, "bundle.json");
  const indexPath = path.join(PUBLIC_VIDEOS, "index.json");
  await assertExists(bundlePath, "guidebook bundle");
  const indexRows = await readJson(indexPath);
  if (!indexRows.some((row) => row.id === videoId)) {
    throw new Error(`public/videos/index.json does not include ${videoId}`);
  }
  return JSON.parse(await readFile(bundlePath, "utf8"));
}

function serviceAccountPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_SERVICE_ACCOUNT;
}

function ensureFirebase() {
  if (getApps().length) return getApps()[0];
  const filePath = serviceAccountPath();
  const serviceAccount = JSON.parse(readFileSync(filePath, "utf8"));
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: "artluai-tracker",
  });
}

async function markSiteDirty(db, shipment, changedFields) {
  const now = Timestamp.now();
  const change = {
    agent: process.env.ARTLU_AGENT_NAME || process.env.MCP_AGENT_NAME || process.env.USER || "unknown",
    client: "ship-video",
    operation: "video.ship",
    targetType: "video",
    targetId: shipment.trackerDocId || shipment.videoId,
    targetName: shipment.title,
    changedFields,
    note: `Built guidebook package for ${shipment.videoId}.`,
    at: now,
  };

  const stateRef = db.collection("siteMeta").doc("publishState");
  await stateRef.set(
    {
      dirty: true,
      lastContentChangeAt: now,
      lastChangedBy: change,
      pendingChanges: FieldValue.increment(1),
      updatedAt: now,
    },
    { merge: true },
  );
  await stateRef.collection("changes").add(change);
}

function trackerUpdateFields(shipment) {
  const format = shipment.format === "short" ? "short" : "long";
  return cleanObject({
    type: "video",
    mainProjectId: "spoolcast",
    parentProjectId: "spoolcast",
    seriesId: seriesIdFor(shipment),
    videoId: shipment.videoId,
    youtubeId: shipment.youtubeId,
    tiktokUrl: shipment.tiktokUrl || "",
    tiktokId: parseTiktokId(shipment.tiktokUrl),
    videoFormat: format,
    guidebookStatus: "ready",
    media: youtubeUrl(shipment.youtubeId),
    date: shipment.shippedAt,
    status: "launched",
    updatedAt: Timestamp.now(),
  });
}

function trackerCreateFields(shipment) {
  const now = Timestamp.now();
  return cleanObject({
    name: shipment.title,
    slug: makeProjectSlug(shipment.title),
    desc: shipment.desc || "",
    longDesc: "",
    link: "",
    repo: "",
    stack: defaultStackFor(shipment),
    tags: shipment.format === "short" ? ["spoolcast", "aninews"] : ["spoolcast"],
    screenshots: [],
    files: [],
    visibility: "public",
    createdAt: now,
    ...trackerUpdateFields(shipment),
  });
}

async function updateFirestore(shipment, { dryRun, noFirestore }) {
  const update = trackerUpdateFields(shipment);
  const changedFields = Object.keys(update).filter((key) => key !== "updatedAt");

  if (dryRun) {
    console.log("[dry-run] would update Firestore:");
    console.log(JSON.stringify({
      trackerDocId: shipment.trackerDocId || null,
      collection: "projects",
      fields: changedFields,
      update: Object.fromEntries(Object.entries(update).filter(([key]) => key !== "updatedAt")),
    }, null, 2));
    return;
  }

  if (noFirestore) {
    console.log("skip Firestore: --no-firestore");
    return;
  }

  ensureFirebase();
  const db = getFirestore();
  let docRef;
  let created = false;

  if (shipment.trackerDocId) {
    docRef = db.collection("projects").doc(shipment.trackerDocId);
    const snap = await docRef.get();
    if (snap.exists) await docRef.update(update);
    else {
      await docRef.set(trackerCreateFields(shipment));
      created = true;
    }
  } else {
    docRef = await db.collection("projects").add(trackerCreateFields(shipment));
    shipment.trackerDocId = docRef.id;
    created = true;
  }

  await markSiteDirty(db, shipment, changedFields);
  console.log(`${created ? "created" : "updated"} Firestore tracker entry: ${docRef.id}`);
}

async function maybeTriggerBuild({ dryRun, triggerBuild }) {
  if (!triggerBuild) return;
  const url = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!url) throw new Error("NETLIFY_BUILD_HOOK_URL is required with --trigger-build");
  if (dryRun) {
    console.log("[dry-run] would trigger Netlify build hook");
    return;
  }
  const response = await fetch(url, { method: "POST" });
  const body = await response.text();
  if (!response.ok) throw new Error(`Netlify build hook failed: ${response.status} ${body}`);
  console.log(`triggered Netlify build hook: ${response.status}`);
}

function validateShipment(shipment) {
  const required = ["videoId", "format", "title", "youtubeId", "shippedAt", "durationSec"];
  const missing = required.filter((key) => shipment[key] === undefined || shipment[key] === null || shipment[key] === "");
  if (missing.length) throw new Error(`shipment is missing required field(s): ${missing.join(", ")}`);
  if (!["short", "long"].includes(shipment.format)) throw new Error(`format must be "short" or "long": ${shipment.format}`);
  if (shipment.format === "short") {
    const shortMissing = ["show", "sessionDate"].filter((key) => !shipment[key]);
    if (shortMissing.length) throw new Error(`short shipment is missing required field(s): ${shortMissing.join(", ")}`);
  }
}

async function validateSourcePaths(shipment) {
  if (shipment.format === "short") {
    await assertExists(path.join(CONTENT, "shows", shipment.show, "sessions", shipment.sessionDate, "episode"), "short episode directory");
    return;
  }
  await assertExists(path.join(CONTENT, "sessions", shipment.videoId), "long session directory");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.videoId) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  await assertExists(SHIPMENTS, "video shipment manifest");
  await assertExists(SHIPPED, "shipped videos manifest");
  await assertExists(SYNC_SCRIPT, "sync-video script");

  const shipments = await readJson(SHIPMENTS);
  const shipment = shipments.find((row) => row.videoId === args.videoId);
  if (!shipment) throw new Error(`No shipment found for videoId "${args.videoId}" in ${SHIPMENTS}`);

  validateShipment(shipment);
  await validateSourcePaths(shipment);

  console.log(`ship-video: ${shipment.videoId}`);
  console.log(`format=${shipment.format} trackerDocId=${shipment.trackerDocId || "(create new)"}`);

  const manifest = await upsertShippedManifest(shipment, args);
  console.log(`${args.dryRun ? "[dry-run] would " : ""}${manifest.action} scripts/shipped-videos.json row`);

  await runSyncVideo(shipment.videoId, args);

  if (!args.dryRun) {
    const bundle = await verifyBundle(shipment.videoId);
    console.log(`verified guidebook bundle: ${bundle.id} (${bundle.format || "long"})`);
  }

  await updateFirestore(shipment, args);
  await maybeTriggerBuild(args);

  console.log(`done: ${shipment.videoId}`);
}

main().catch((error) => {
  console.error(`ship-video failed: ${error.message}`);
  process.exit(1);
});
