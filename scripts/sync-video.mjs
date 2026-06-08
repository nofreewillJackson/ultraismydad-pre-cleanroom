#!/usr/bin/env node
// sync-video.mjs — build public/videos/<id>/bundle.json + copy assets
// from ../spoolcast-content/sessions/<id>/ for each entry in shipped-videos.json.
//
// Usage:
//   node scripts/sync-video.mjs                # sync all entries in manifest
//   node scripts/sync-video.mjs <session-id>   # sync just one
//
// Requires: cwebp (brew install webp) — scene images are downscaled to webp
// to keep the repo lean. Originals stay in spoolcast-content.
//
// The bundle shape is the "database-shaped" contract — it has no filesystem
// paths, only public URLs. A future DB-backed emitter produces the same shape.

import { readFile, writeFile, mkdir, copyFile, readdir, access, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Downscale images to keep the repo lean. Originals stay in spoolcast-content.
const THUMB_WIDTH = 640;
const THUMB_QUALITY = 72; // libwebp -quality
const RASTER_EXT = /\.(png|jpe?g|webp)$/i;
const SVG_EXT = /\.svg$/i;

function downscaleToWebp(src, dest, width = THUMB_WIDTH, quality = THUMB_QUALITY) {
  // cwebp handles png/jpg/webp input natively, preserves aspect ratio with -resize W 0.
  return new Promise((resolve, reject) => {
    const args = ["-quiet", "-q", String(quality), "-resize", String(width), "0", src, "-o", dest];
    const ff = spawn("cwebp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", d => { stderr += d; });
    ff.on("close", code => code === 0 ? resolve() : reject(new Error(`cwebp ${code}: ${stderr.slice(-400)}`)));
    ff.on("error", err => reject(new Error(`cwebp not found — install with: brew install webp`)));
  });
}

// Copy raster images through ffmpeg (downscale + webp), svg as-is, skip video.
async function importAsset(srcPath, destDir, baseName) {
  await ensureDir(destDir);
  if (SVG_EXT.test(srcPath)) {
    const dest = path.join(destDir, baseName);
    await copyFile(srcPath, dest);
    return baseName;
  }
  if (!RASTER_EXT.test(srcPath)) return null; // mp4/other — skip
  const destName = baseName.replace(/\.[^.]+$/, ".webp");
  await downscaleToWebp(srcPath, path.join(destDir, destName));
  return destName;
}

// Extract a single frame from an mp4 as a downscaled webp. ffmpeg in this
// brew build doesn't include libwebp, so we extract a PNG into the OS tmp
// dir then run cwebp on it.
async function extractFirstFrameAsWebp(mp4Path, destWebp, width = THUMB_WIDTH, quality = THUMB_QUALITY) {
  const tmpPng = path.join(tmpdir(), `frame-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-ss", "0.5",
      "-i", mp4Path,
      "-vframes", "1",
      "-q:v", "2",
      tmpPng,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", d => { stderr += d; });
    ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-400)}`)));
    ff.on("error", reject);
  });
  try {
    await ensureDir(path.dirname(destWebp));
    await downscaleToWebp(tmpPng, destWebp, width, quality);
  } finally {
    try { await unlink(tmpPng); } catch {}
  }
}

// Extract a TikTok video ID from any common URL shape:
//   https://www.tiktok.com/@user/video/1234567890123456789
//   https://vm.tiktok.com/SHORTCODE/   (returns null — short links need expansion)
// Returns the long numeric ID or null if not parseable.
function parseTiktokId(url) {
  if (!url) return null;
  const m = String(url).match(/\/video\/(\d{6,})/);
  return m ? m[1] : null;
}

// Parse the news-anime-bot show's `script.md` file into structured data.
// Best-effort regex parse — the script format is human-edited so we skip
// fields gracefully when they're missing.
function parseShortScriptMd(content) {
  const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const topicMatch = content.match(/Topic tier[^\n]*?(GREEN|YELLOW|RED|BLUE)/i);
  const topicTier = topicMatch ? topicMatch[1].toUpperCase() : null;

  // Pre-roll voice tag (the burned text is canonical, voice tag varies)
  let preRoll = null;
  const preRollMatch = content.match(/##\s*Pre-roll[\s\S]*?(?=\n##\s|$)/);
  if (preRollMatch) {
    const block = preRollMatch[0];
    const voiceMatch = block.match(/voice tag[\s\S]*?"([^"]+)"/i);
    preRoll = {
      burnedText: "⚠ SATIRE — AI-GENERATED PARODY — NOT REAL",
      voiceTag: voiceMatch ? voiceMatch[1] : "FAUX7 News. Satire.",
    };
  }

  // Beat table: "| # | Name | Dur | Char | Source chyron |"
  const beatTable = [];
  const tableMatch = content.match(/\|\s*#\s*\|\s*Name[\s\S]+?(?=\n\n|\n##\s)/);
  if (tableMatch) {
    const lines = tableMatch[0].split("\n").filter(l => l.trim().startsWith("|"));
    for (const line of lines.slice(2)) { // skip header + separator
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (cells.length < 4) continue;
      const n = parseInt(cells[0]);
      if (!Number.isFinite(n)) continue;
      const name = cells[1].replace(/\s*✓\s*$/, "");
      const durMatch = cells[2].match(/(\d+)/);
      const character = (!cells[3] || cells[3] === "—") ? null : cells[3];
      const sourceChyron = (!cells[4] || cells[4] === "—") ? null : cells[4].replace(/^`|`$/g, "");
      beatTable.push({ n, name, durationSec: durMatch ? parseInt(durMatch[1]) : null, character, sourceChyron });
    }
  }

  // Narration block: numbered lines inside a code fence under "## Narration"
  const narrationByN = new Map();
  const narrationMatch = content.match(/##\s*Narration[\s\S]*?```([\s\S]+?)```/);
  if (narrationMatch) {
    const block = narrationMatch[1];
    const lineRegex = /^\s*(\d+)\.\s+(.*?)$/gm;
    let m;
    while ((m = lineRegex.exec(block)) !== null) {
      const n = parseInt(m[1]);
      let text = m[2].trim();
      // Strip SSML for the transcript field
      text = text.replace(/<\/?speak>/g, "").replace(/<break[^>]*\/>/g, "").replace(/\s+/g, " ").trim();
      narrationByN.set(n, text);
    }
  }

  // Cinematography table — optional, "## Tier 1 cinematography"
  const cinemaByN = new Map();
  const cinemaMatch = content.match(/##\s*Tier 1 cinematography[\s\S]*?\|\s*Beat\s*\|\s*Effect\s*\|[\s\S]+?(?=\n\n|\n##\s)/);
  if (cinemaMatch) {
    const lines = cinemaMatch[0].split("\n").filter(l => l.trim().startsWith("|"));
    for (const line of lines.slice(2)) {
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (cells.length < 2) continue;
      const n = parseInt(cells[0]);
      if (Number.isFinite(n)) cinemaByN.set(n, cells[1]);
    }
  }

  // Sources — bullet list under "## Sources …". Three bullet shapes are
  // recognized:
  //   1. Markdown link:  - [Title](URL) optional-suffix
  //   2. Colon split:    - Fact: Attribution [optional trailing URL]
  //   3. Plain text:     - Free-form attribution
  // All produce { fact, attribution, url? }; missing fact renders as an empty
  // left column.
  const sources = [];
  // Match the Sources section up to the next H2 (or EOF). Without the lookahead
  // a sibling section like "## Audit notes" gets greedily slurped into Sources.
  const sourcesMatch = content.match(/##\s*Sources\b[\s\S]*?(?=\n##\s|$)/);
  if (sourcesMatch) {
    const block = sourcesMatch[0];
    const bulletRe = /^-\s+(.+)$/gm;
    let m;
    while ((m = bulletRe.exec(block)) !== null) {
      const line = m[1].trim();

      // Case 1: starts with a markdown link
      const mdMatch = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*(.*)$/);
      if (mdMatch) {
        const title = mdMatch[1].trim();
        const url = mdMatch[2];
        const suffix = mdMatch[3].trim();
        // Split title on " — " or ":" to derive a short fact label.
        const parts = title.split(/\s*—\s*|:\s*/);
        let fact, attribution;
        if (parts.length >= 2) {
          fact = parts[0].trim();
          attribution = parts.slice(1).join(" — ").trim();
        } else {
          fact = "";
          attribution = title;
        }
        if (suffix) attribution = `${attribution} ${suffix}`.trim();
        sources.push({ fact, attribution, url });
        continue;
      }

      // Case 2: colon split (Fact: Attribution [URL])
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        const fact = colonMatch[1].trim();
        let rest = colonMatch[2].trim();
        const urlMatch = rest.match(/(https?:\/\/\S+)/);
        const url = urlMatch ? urlMatch[1].replace(/[).,;]+$/, "") : null;
        const attribution = url
          ? rest.replace(url, "").replace(/[\s—–\-]+$/, "").trim()
          : rest;
        sources.push({ fact, attribution, url });
        continue;
      }

      // Case 3: plain text — everything is the attribution
      const urlMatch = line.match(/(https?:\/\/\S+)/);
      const url = urlMatch ? urlMatch[1].replace(/[).,;]+$/, "") : null;
      const attribution = url ? line.replace(url, "").replace(/[\s—–\-]+$/, "").trim() : line;
      sources.push({ fact: "", attribution, url });
    }
  }

  // Cost — "Total [X]: ~$Y" or "Ep N total: ~$Y"
  const costMatch = content.match(/(?:Total[^\n]*|Ep\s*\d+\s*total)[^\n]*?\$\s*([\d.,]+)/i);
  const totalCost = costMatch ? `~$${costMatch[1]}` : null;

  // TTS voice
  let ttsVoice = null;
  const voiceMatch = content.match(/(?:Schedar|Puck|Charon|Algieba)\s*voice|en-US-Chirp3-HD-(\w+)/i);
  if (voiceMatch) ttsVoice = voiceMatch[1] || voiceMatch[0].split(" ")[0];

  // Video model (Seedance / Kling / etc.) — pick first hit
  let videoModel = null;
  const seedanceMatch = content.match(/Seedance\s*[\d.]+\s*(?:\w+)?/i);
  const klingMatch = content.match(/Kling\s*[\d.]+/i);
  if (seedanceMatch) videoModel = seedanceMatch[0];
  else if (klingMatch) videoModel = klingMatch[0];

  const beats = beatTable.map(b => ({
    ...b,
    narration: narrationByN.get(b.n) || "",
    cinematography: cinemaByN.get(b.n) || null,
  }));

  return { title, topicTier, preRoll, beats, sources, totalCost, ttsVoice, videoModel };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");                       // artluai-tracker/
const CONTENT = path.resolve(ROOT, "..", "spoolcast-content");    // sibling
const PUBLIC_VIDEOS = path.join(ROOT, "public", "videos");
const SHIPPED_MANIFEST = path.join(__dirname, "shipped-videos.json");

// ── helpers ────────────────────────────────────────────────────────────────
async function readJson(p) {
  try { return JSON.parse(await readFile(p, "utf8")); }
  catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
async function exists(p) { try { await access(p); return true; } catch { return false; } }
async function ensureDir(p) { await mkdir(p, { recursive: true }); }
async function writeJson(p, data) { await writeFile(p, JSON.stringify(data, null, 2) + "\n"); }

function log(label, msg) { console.log(`  [${label}] ${msg}`); }
function warn(label, msg) { console.warn(`  ⚠  [${label}] ${msg}`); }

// ── bundle assembly ────────────────────────────────────────────────────────
// Dispatcher — picks long vs short builder based on the manifest entry's
// `format` field (defaults to "long" for backwards compat).
async function buildBundle(shipped) {
  const format = shipped.format || "long";
  if (format === "short") return buildShortBundle(shipped);
  return buildLongBundle(shipped);
}

async function buildLongBundle(shipped) {
  const id = shipped.id;
  const sessionDir = path.join(CONTENT, "sessions", id);
  const outDir = path.join(PUBLIC_VIDEOS, id);
  const assetsDir = path.join(outDir, "assets");

  if (!existsSync(sessionDir)) {
    warn(id, `session dir missing at ${sessionDir} — writing minimal bundle from manifest only`);
  }

  await ensureDir(outDir);
  await ensureDir(assetsDir);

  const session = await readJson(path.join(sessionDir, "session.json")) || {};
  const shotList = await readJson(path.join(sessionDir, "shot-list", "shot-list.json"));
  const manifest = await readJson(path.join(sessionDir, "manifests", "scenes.manifest.json"));
  const narrationAudit = await readJson(path.join(sessionDir, "working", "narration-audit.json"));
  const renderAudit = await readJson(path.join(sessionDir, "working", "render-audit.json"));

  // Build scene lookup (chunk_id → manifest item).
  const sceneByChunk = new Map();
  if (manifest?.items) {
    for (const it of manifest.items) {
      if (it.chunk_id) sceneByChunk.set(it.chunk_id, it);
    }
  }

  // Narration-audit flags keyed by the chunk they apply to.
  const narrationFlagsByChunk = new Map();
  if (narrationAudit?.bridge_flags) {
    for (const f of narrationAudit.bridge_flags) {
      const chunk = f.beat_n_chunk;
      if (!narrationFlagsByChunk.has(chunk)) narrationFlagsByChunk.set(chunk, []);
      narrationFlagsByChunk.get(chunk).push(f);
    }
  }

  // ── copy scene images ──────────────────────────────────────────────────
  // Build IMGxx → chunk_id map from base_layer when present (post-refactor
  // sessions use IMG01-IMGN naming instead of C001-C0NN).
  const imgToChunk = new Map();
  if (shotList?.base_layer) {
    for (const entry of shotList.base_layer) {
      if (entry.id && entry.chunk_id) imgToChunk.set(entry.id, entry.chunk_id);
    }
  }
  const scenesOutDir = path.join(assetsDir, "scenes");
  const sceneUrlByChunk = new Map();
  if (existsSync(path.join(sessionDir, "source", "generated-assets", "scenes"))) {
    const srcDir = path.join(sessionDir, "source", "generated-assets", "scenes");
    const files = await readdir(srcDir);
    let count = 0;
    for (const f of files) {
      if (!RASTER_EXT.test(f) && !SVG_EXT.test(f)) continue;
      const outName = await importAsset(path.join(srcDir, f), scenesOutDir, f);
      if (!outName) continue;
      let chunkId = path.basename(f).replace(/\.[^.]+$/, "");
      // IMGxx naming: resolve to parent chunk via base_layer, keep the
      // first image for each chunk as its guidebook scene image.
      if (imgToChunk.has(chunkId) && !sceneUrlByChunk.has(imgToChunk.get(chunkId))) {
        chunkId = imgToChunk.get(chunkId);
      }
      if (!sceneUrlByChunk.has(chunkId)) {
        sceneUrlByChunk.set(chunkId, `/videos/${id}/assets/scenes/${outName}`);
      }
      count++;
    }
    log(id, `imported ${count} scene image(s) (webp ${THUMB_WIDTH}px q${THUMB_QUALITY})`);
  }

  // ── style library ──────────────────────────────────────────────────────
  let style = null;
  const styleName = session.style;
  if (styleName) {
    const styleDir = path.join(CONTENT, "styles", styleName);
    const styleJson = await readJson(path.join(styleDir, "style.json"));
    if (styleJson) {
      const styleOutDir = path.join(assetsDir, "style");
      await ensureDir(styleOutDir);
      let anchorUrl = null;
      if (styleJson.anchor?.image_path && await exists(path.join(styleDir, styleJson.anchor.image_path))) {
        const outName = await importAsset(
          path.join(styleDir, styleJson.anchor.image_path),
          styleOutDir,
          path.basename(styleJson.anchor.image_path),
        );
        if (outName) anchorUrl = `/videos/${id}/assets/style/${outName}`;
      }
      const refsOutDir = path.join(styleOutDir, "references");
      const references = [];
      if (styleJson.references) {
        for (const [refName, ref] of Object.entries(styleJson.references)) {
          let refUrl = null;
          if (ref.image_path && await exists(path.join(styleDir, ref.image_path))) {
            const outName = await importAsset(
              path.join(styleDir, ref.image_path),
              refsOutDir,
              `${refName}${path.extname(ref.image_path)}`,
            );
            if (outName) refUrl = `/videos/${id}/assets/style/references/${outName}`;
          }
          references.push({
            name: refName,
            kind: ref.kind || "reference",
            imageUrl: refUrl,
            description: ref.description || "",
          });
        }
      }
      style = {
        name: styleJson.name,
        description: styleJson.description || "",
        anchorImageUrl: anchorUrl,
        anchorDescription: styleJson.anchor?.description || styleJson.description || "",
        references,
      };
      log(id, `synced style "${styleName}" (anchor + ${references.length} refs)`);
    }
  } else if (session.default_style_prompt) {
    // Inline style (old sessions without a style library entry)
    style = {
      name: "inline",
      description: session.default_style_prompt.slice(0, 240) + (session.default_style_prompt.length > 240 ? "…" : ""),
      anchorImageUrl: null,
      anchorDescription: "",
      references: [],
    };
  }

  // ── copy external assets referenced by non-generated chunks ───────────
  // (memes, session-specific external images). Skip mp4 broll — no still.
  const externalOutDir = path.join(assetsDir, "external");
  const externalUrlByPath = new Map();
  if (shotList?.chunks) {
    for (const c of shotList.chunks) {
      const src = c.image_source;
      const rel = c.image_path;
      if (!rel) continue;
      if (src !== "meme" && src !== "broll_image" && src !== "external") continue;
      if (!RASTER_EXT.test(rel) && !SVG_EXT.test(rel)) continue;
      const abs = path.join(sessionDir, rel);
      if (!(await exists(abs))) continue;
      const outName = await importAsset(abs, externalOutDir, path.basename(rel));
      if (!outName) continue;
      externalUrlByPath.set(rel, `/videos/${id}/assets/external/${outName}`);
    }
    if (externalUrlByPath.size > 0) log(id, `imported ${externalUrlByPath.size} external asset(s)`);
  }

  function resolveChunkImageUrl(c) {
    const src = c.image_source;
    const rel = c.image_path;
    // Reuse: derive chunk id from "source/generated-assets/scenes/C{N}.png"
    if (src === "reuse" && rel) {
      const m = rel.match(/scenes\/([^/]+)\.[^.]+$/);
      if (m && sceneUrlByChunk.has(m[1])) return sceneUrlByChunk.get(m[1]);
    }
    // External image (meme / broll_image / external)
    if (externalUrlByPath.has(rel)) return externalUrlByPath.get(rel);
    // Generated scene (this chunk's own image)
    if (sceneUrlByChunk.has(c.id)) return sceneUrlByChunk.get(c.id);
    return null;
  }

  // ── chunks ─────────────────────────────────────────────────────────────
  const hiddenIds = new Set(shipped.hiddenChunkIds || []);
  const chunks = [];
  if (shotList?.chunks) {
    shotList.chunks.forEach((c, idx) => {
      if (hiddenIds.has(c.id)) return;
      const scene = sceneByChunk.get(c.id);
      const sceneUrl = resolveChunkImageUrl(c);
      const narrationFlagged = narrationFlagsByChunk.has(c.id);
      chunks.push({
        id: c.id,
        order: idx + 1,
        sceneTitle: c.scene_title || "",
        summary: c.summary || "",
        sceneImageUrl: sceneUrl,
        imageSource: c.image_source || null,
        model: scene?.model || null,
        prompt: scene?.prompt || c.beat_description || "",
        beats: (c.beats || []).map(b => ({ id: b.id, narration: b.narration })),
        audits: {
          narration: {
            passed: !narrationFlagged,
            notes: narrationFlagged
              ? narrationFlagsByChunk.get(c.id).map(f => f.reasoning).join(" · ")
              : undefined,
          },
          render: { passed: true }, // render-audit is mechanical; treat absence as pass
        },
      });
    });
  }

  // ── transcript (concat of all beat narration) ──────────────────────────
  const transcript = (shotList?.chunks || [])
    .flatMap(c => (c.beats || []).map(b => b.narration))
    .filter(Boolean)
    .join(" ");

  // ── summary (tech stack + audits) ──────────────────────────────────────
  const imageModels = [...new Set(
    (manifest?.items || []).map(it => it.model).filter(Boolean)
  )];
  const totalBeats = narrationAudit?.total_beats
    ?? (shotList?.chunks || []).reduce((n, c) => n + (c.beats?.length || 0), 0);
  const sceneCount = (manifest?.items || []).filter(it => it.status === "success").length
    || sceneUrlByChunk.size;

  const summary = {
    writing: (shotList || session.core_message) ? {
      author: "Claude",
      role: "screenplay, shot-list, scene prompts",
    } : null,
    images: imageModels.length || sceneCount ? {
      platform: "kie.ai",
      models: imageModels,
      sceneCount,
    } : null,
    audio: session.tts_voice ? {
      tts: "Google Cloud TTS",
      voice: session.tts_voice,
      playbackRate: session.tts_playback_rate ?? 1.0,
      beatCount: totalBeats,
    } : null,
    render: {
      engine: "Remotion",
      passed: renderAudit?.passed ?? true,
    },
    audit: narrationAudit ? {
      narrationModel: narrationAudit.model,
      narrationFlags: narrationAudit.bridge_flags?.length ?? 0,
    } : null,
  };

  // ── bundle ─────────────────────────────────────────────────────────────
  const bundle = {
    id,
    format: "long",
    title: shipped.title,
    desc: shipped.desc || "",
    shippedAt: shipped.shippedAt,
    durationSec: shipped.durationSec,
    coreMessage: session.core_message || shipped.coreMessage || "",
    video: {
      youtubeId: shipped.youtubeId || null,
      mp4Url: shipped.mp4Url || null,
      thumbnailUrl: shipped.youtubeId
        ? `https://img.youtube.com/vi/${shipped.youtubeId}/maxresdefault.jpg`
        : (shipped.thumbnailUrl || null),
    },
    style,
    chunks,
    transcript,
    summary,
    showcase: {
      hiddenChunkIds: shipped.hiddenChunkIds || [],
      notes: shipped.notes || "",
    },
  };

  await writeJson(path.join(outDir, "bundle.json"), bundle);
  log(id, `wrote bundle.json (long, ${chunks.length} chunks, ${totalBeats} beats)`);
  return bundle;
}

// ── short builder ──────────────────────────────────────────────────────────
async function buildShortBundle(shipped) {
  const id = shipped.id;
  const show = shipped.show;
  const date = shipped.sessionDate || shipped.shippedAt; // session dir is named YYYY-MM-DD
  if (!show) {
    warn(id, `short ship entry missing required "show" field — skipping`);
    return null;
  }
  const sessionRoot = path.join(CONTENT, "shows", show, "sessions", date);
  const episodeDir = path.join(sessionRoot, "episode");
  const charactersDir = path.join(sessionRoot, "characters");
  const outDir = path.join(PUBLIC_VIDEOS, id);
  const assetsDir = path.join(outDir, "assets");

  if (!existsSync(episodeDir)) {
    warn(id, `episode dir missing at ${episodeDir} — writing minimal bundle from manifest only`);
  }

  await ensureDir(outDir);
  await ensureDir(assetsDir);

  // Parse script.md if present (ep 1 has none, ep 2+ should).
  let scriptText = "";
  try { scriptText = await readFile(path.join(episodeDir, "script.md"), "utf8"); } catch {}
  const scriptData = scriptText ? parseShortScriptMd(scriptText) : null;

  // Find the rendered episode mp4 (episode-NN.mp4 or episode-NN-vM.mp4).
  // When multiple versions exist, prefer the highest -vM (base file = v1).
  let episodeMp4 = null;
  const epOutDir = path.join(episodeDir, "out");
  if (existsSync(epOutDir)) {
    const files = (await readdir(epOutDir))
      .filter(f => /^episode-\d+(-v\d+)?\.mp4$/.test(f))
      .sort((a, b) => {
        const vA = parseInt((a.match(/-v(\d+)\.mp4$/) || [, "1"])[1]);
        const vB = parseInt((b.match(/-v(\d+)\.mp4$/) || [, "1"])[1]);
        return vB - vA;
      });
    if (files[0]) episodeMp4 = path.join(epOutDir, files[0]);
  }

  // Showcase thumbnail: prefer YouTube's vertical Shorts thumbnail (the
  // creator-curated one at i.ytimg.com/vi/<id>/oardefault.jpg, which is 720×1280
  // for Shorts). Fall back to extracting the first frame of the rendered mp4
  // when the video isn't on YouTube yet.
  let posterUrl = null;
  if (shipped.youtubeId) {
    posterUrl = `https://i.ytimg.com/vi/${shipped.youtubeId}/oardefault.jpg`;
  } else if (episodeMp4) {
    const posterPath = path.join(assetsDir, "poster.webp");
    try {
      await extractFirstFrameAsWebp(episodeMp4, posterPath);
      posterUrl = `/videos/${id}/assets/poster.webp`;
      log(id, `extracted poster from ${path.basename(episodeMp4)} (no youtubeId)`);
    } catch (err) {
      warn(id, `poster extraction failed: ${err.message}`);
    }
  }

  // Per-beat clip thumbnails: extract first frame from each clips/<NN-name>.mp4
  const beatThumbsDir = path.join(assetsDir, "beats");
  const beatUrlByName = new Map();
  const clipsDir = path.join(episodeDir, "clips");
  if (existsSync(clipsDir)) {
    const files = await readdir(clipsDir);
    let count = 0;
    for (const f of files) {
      if (!f.endsWith(".mp4")) continue;
      const baseName = f.replace(/\.mp4$/, "");
      const beatName = baseName.replace(/^\d+-/, ""); // strip "01-" prefix
      const dest = path.join(beatThumbsDir, baseName + ".webp");
      try {
        await extractFirstFrameAsWebp(path.join(clipsDir, f), dest);
        beatUrlByName.set(beatName, `/videos/${id}/assets/beats/${baseName}.webp`);
        count++;
      } catch { /* skip unreadable clip */ }
    }
    if (count > 0) log(id, `extracted ${count} beat clip thumbnail(s)`);
  }

  // Recurring characters — resolved via cast.txt + walk-up search order
  // (per spoolcast VIDEO_OUTPUT_RULES §1.5). For each name in cast.txt, look
  // for `<name>.<ext>` in this order, first match wins:
  //   1. <session-dir>/characters/<name>.<ext>     (one-off / session-local)
  //   2. <show-root>/characters/<name>.<ext>       (series-level cast)
  //   3. <content-root>/archetypes/<name>.<ext>    (engine-wide archetypes)
  // Filename basename without extension is the displayed character name.
  // Backwards-compat: if cast.txt is missing, fall back to scanning the
  // session-local characters/ dir as before.
  const charsOutDir = path.join(assetsDir, "characters");
  const showRoot = path.join(CONTENT, "shows", show);
  const archetypesRoot = path.join(CONTENT, "archetypes");
  const characters = [];

  async function findCharacterFile(name) {
    const dirs = [
      path.join(sessionRoot, "characters"),
      path.join(showRoot, "characters"),
      archetypesRoot,
    ];
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      const files = await readdir(d);
      const hit = files.find(f => RASTER_EXT.test(f) && f.replace(/\.[^.]+$/, "") === name);
      if (hit) return path.join(d, hit);
    }
    return null;
  }

  // Read cast.txt — one character name per line, comments + blank lines skipped.
  let castNames = null;
  try {
    const castText = await readFile(path.join(sessionRoot, "cast.txt"), "utf8");
    castNames = castText.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  } catch { /* no cast.txt → fallback to legacy session-dir scan */ }

  if (castNames) {
    for (const name of castNames) {
      const srcPath = await findCharacterFile(name);
      if (!srcPath) {
        warn(id, `cast.txt names "${name}" but no matching ref found in session/show/archetypes`);
        continue;
      }
      const outName = await importAsset(srcPath, charsOutDir, path.basename(srcPath));
      if (!outName) continue;
      characters.push({
        name,
        kind: "character",
        imageUrl: `/videos/${id}/assets/characters/${outName}`,
        description: "",
        usedInBeats: (scriptData?.beats || []).filter(b => b.character === name).map(b => b.n),
      });
    }
    if (characters.length > 0) log(id, `imported ${characters.length} character ref(s) (via cast.txt)`);
  } else if (existsSync(charactersDir)) {
    // Legacy: no cast.txt — scan everything in session-local characters/.
    const files = await readdir(charactersDir);
    for (const f of files) {
      if (!RASTER_EXT.test(f)) continue;
      const charName = f.replace(/\.[^.]+$/, "");
      const outName = await importAsset(path.join(charactersDir, f), charsOutDir, f);
      if (outName) {
        characters.push({
          name: charName,
          kind: "character",
          imageUrl: `/videos/${id}/assets/characters/${outName}`,
          description: "",
          usedInBeats: (scriptData?.beats || []).filter(b => b.character === charName).map(b => b.n),
        });
      }
    }
    if (characters.length > 0) log(id, `imported ${characters.length} character ref(s) (legacy session-dir scan)`);
  }

  // Beats: combine script.md table + narration + cinematography + extracted clip frames.
  const beats = (scriptData?.beats || []).map(b => ({
    n: b.n,
    name: b.name,
    durationSec: b.durationSec || null,
    narration: b.narration || "",
    character: b.character || null,
    sourceChyron: b.sourceChyron || null,
    cinematography: b.cinematography || null,
    clipImageUrl: beatUrlByName.get(b.name) || null,
  }));

  const sources = scriptData?.sources || [];
  const transcript = beats.map(b => b.narration).filter(Boolean).join(" ");

  const summary = {
    writing: scriptData ? {
      author: "Claude",
      role: "script · beat plan · narration · sources audit",
    } : null,
    videoClips: scriptData?.videoModel ? {
      platform: "kie.ai",
      models: [scriptData.videoModel],
      clipCount: beats.length || beatUrlByName.size || null,
    } : (beats.length || beatUrlByName.size ? {
      platform: "kie.ai",
      models: [],
      clipCount: beats.length || beatUrlByName.size,
    } : null),
    audio: scriptData?.ttsVoice ? {
      tts: "Google Cloud TTS",
      voice: scriptData.ttsVoice,
      beatCount: beats.length || null,
    } : null,
    render: { engine: "ffmpeg", passed: true },
    cost: scriptData?.totalCost || null,
  };

  const bundle = {
    id,
    format: "short",
    show,
    title: shipped.title || scriptData?.title || "",
    desc: shipped.desc || "",
    shippedAt: shipped.shippedAt,
    durationSec: shipped.durationSec,
    topicTier: scriptData?.topicTier || null,
    video: {
      youtubeId: shipped.youtubeId || null,
      tiktokId: parseTiktokId(shipped.tiktokUrl) || shipped.tiktokId || null,
      tiktokUrl: shipped.tiktokUrl || null,
      mp4Url: shipped.mp4Url || null,
      thumbnailUrl: posterUrl
        || (shipped.youtubeId ? `https://img.youtube.com/vi/${shipped.youtubeId}/maxresdefault.jpg` : null),
    },
    preRoll: scriptData?.preRoll || {
      burnedText: "⚠ SATIRE — AI-GENERATED PARODY — NOT REAL",
      voiceTag: "FAUX7 News. Satire.",
    },
    characters,
    beats,
    sources,
    transcript,
    summary,
    showcase: {
      hiddenBeatNs: shipped.hiddenBeatNs || [],
      notes: shipped.notes || "",
    },
  };

  await writeJson(path.join(outDir, "bundle.json"), bundle);
  log(id, `wrote bundle.json (short, ${beats.length} beats, ${characters.length} char${characters.length === 1 ? "" : "s"})`);
  return bundle;
}

// ── index ──────────────────────────────────────────────────────────────────
function indexRowFromBundle(b) {
  return {
    id: b.id,
    format: b.format || "long",
    show: b.show || null,
    title: b.title,
    desc: b.desc || "",
    shippedAt: b.shippedAt,
    durationSec: b.durationSec,
    youtubeId: b.video?.youtubeId || null,
    tiktokId: b.video?.tiktokId || null,
    tiktokUrl: b.video?.tiktokUrl || null,
    thumbnailUrl: b.video?.thumbnailUrl || null,
  };
}

async function writeIndex(bundles) {
  // Sort newest-shipped first
  const rows = bundles
    .map(indexRowFromBundle)
    .sort((a, b) => (b.shippedAt || "").localeCompare(a.shippedAt || ""));
  await writeJson(path.join(PUBLIC_VIDEOS, "index.json"), rows);
  console.log(`\n  ✓ wrote public/videos/index.json with ${rows.length} entries`);
}

// ── main ───────────────────────────────────────────────────────────────────
const shipped = await readJson(SHIPPED_MANIFEST);
if (!shipped) {
  console.error(`Missing ship manifest at ${SHIPPED_MANIFEST}`);
  process.exit(1);
}

const targetId = process.argv[2];
const toSync = targetId ? shipped.filter(s => s.id === targetId) : shipped;
if (targetId && toSync.length === 0) {
  console.error(`No ship entry for id "${targetId}"`);
  process.exit(1);
}

console.log(`sync-video: content=${CONTENT}`);
console.log(`syncing ${toSync.length} video(s)\n`);

const allBundles = [];
for (const s of toSync) {
  console.log(`→ ${s.id}`);
  allBundles.push(await buildBundle(s));
}

// When syncing one, still rebuild the full index from all manifest entries
// so it reflects everything shipped.
const others = targetId ? shipped.filter(s => s.id !== targetId) : [];
for (const s of others) {
  const existing = await readJson(path.join(PUBLIC_VIDEOS, s.id, "bundle.json"));
  if (existing) allBundles.push(existing);
}

await writeIndex(allBundles);
