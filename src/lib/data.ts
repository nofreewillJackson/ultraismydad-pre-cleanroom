import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, orderBy, query, where } from "firebase/firestore/lite";
import { firebaseConfig } from "./firebaseConfig";
import { currentDay, dateValue, dayNum, slugify } from "./format";
import mainProjectDefaults from "./main-project-defaults.json";
import seriesDefaults from "./series-defaults.json";
import technologyDefaults from "./technology-defaults.json";

export type ProjectFile = {
  name?: string;
  type?: "paste" | "link" | string;
  content?: string;
  url?: string;
  visibility?: "public" | "private" | "gated" | string;
};

export type Project = {
  id: string;
  name: string;
  desc?: string;
  longDesc?: string;
  type?: "project" | "video" | "research" | string;
  status?: string;
  date?: string;
  stack?: string[];
  stackRefs?: string[];
  tags?: string[];
  slug: string;
  sortOrder?: number;
  link?: string;
  repo?: string;
  media?: string;
  embedHeight?: number;
  screenshots?: string[];
  files?: ProjectFile[];
  visibility?: string;
  artifactHtml?: string;
  snapshotHtml?: string;
  createdAt?: string;
  updatedAt?: string;
  parentProjectId?: string;
  mainProjectId?: string;
  seriesId?: string;
  videoId?: string;
  bundleId?: string;
  youtubeId?: string;
  tiktokUrl?: string;
  tiktokId?: string;
  videoFormat?: "short" | "long" | string;
  guidebookStatus?: "pending" | "ready" | string;
};

export type JournalEntry = {
  id: string;
  day?: number;
  title: string;
  body?: string;
  date?: string;
  slug: string;
  tags?: string[];
  author?: "ai" | "human" | string;
  visibility?: string;
  projectRefs?: string[];
};

export type VideoIndexItem = {
  id: string;
  format?: "short" | "long" | string;
  show?: string | null;
  title: string;
  desc?: string;
  shippedAt?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  youtubeId?: string | null;
  tiktokUrl?: string | null;
  tiktokId?: string | null;
};

export type SiteEntry = {
  id: string;
  kind: "project" | "video" | "research";
  title: string;
  desc?: string;
  date?: string;
  updatedAt?: string;
  day?: number | null;
  status?: string;
  stack?: string[];
  stackRefs?: string[];
  tags?: string[];
  route: string;
  mainProjectId: string;
  seriesId?: string;
  embedType?: "h" | "v" | "d";
  embedUrl?: string;
  thumbnailUrl?: string;
  thumbnailMode?: "static";
  guidebookStatus?: "pending" | "ready" | string;
  videoId?: string;
  youtubeId?: string | null;
  project?: Project;
  video?: VideoIndexItem;
  long?: string;
};

export type MainProject = {
  id: string;
  name: string;
  desc: string;
  meta: string;
  site?: string;
  siteUrl?: string;
  repo?: string;
  repoUrl?: string;
  demo?: string;
  demoUrl?: string;
  logoImg?: string;
  logoUrl?: string;
  heroImg?: string;
  heroUrl?: string;
  wordmark?: string;
  markKey?: string;
  markText?: string;
  visibility?: string;
  sortOrder?: number;
  count: number;
};

export type SeriesRecord = {
  id: string;
  mainProjectId: string;
  name: string;
  desc: string;
  meta: string;
  kind?: string;
  aliases?: string[];
  visibility?: string;
  sortOrder?: number;
  count: number;
};

export type TechnologyRecord = {
  id: string;
  name: string;
  category: string;
  aliases?: string[];
  visibility?: string;
  sortOrder?: number;
  count: number;
};

const fallbackBackup = "/Users/ralphxu/Documents/Projects/artlu-tracker-mcp/backups/tracker-backup-20260519-015522.json";
const defaultServiceAccount = path.join(os.homedir(), "Documents", "keys", "artlu-tracker-sa.json");

let projectCache: Project[] | null = null;
let journalCache: JournalEntry[] | null = null;
let mainProjectCache: Omit<MainProject, "count">[] | null = null;
let seriesCache: Omit<SeriesRecord, "count">[] | null = null;
let technologyCache: Omit<TechnologyRecord, "count">[] | null = null;

const technologyCategoryLabels: Record<string, string> = {
  frontend: "front-end",
  backend: "back-end",
  data: "data",
  infra: "infra",
  media: "ai + media",
  agents: "agents",
  other: "other",
};

const technologyCategoryOrder = ["frontend", "backend", "data", "infra", "media", "agents", "other"];

const publicStackTechnologyAliases: Record<string, string | string[] | null> = {
  "ai-image-generation": "kie-ai",
  chatgpt: "codex",
  cron: ["github-actions", "upstash"],
  "css-variables": "css",
  "lucide-react": "react",
  "motion-react": "react",
  oauth: null,
  "react-router": "react",
};

const projectThumbnailOverrides: Record<string, string> = {
  adsmetri: "/images/project-thumbnails/adsmetri-performance-overview.png",
  "ai-brain-response-video-comparison-with-tribe-v2": "/images/project-thumbnails/tribe-v2-roi-chart.png",
  "ai-hallucination-experiment-context-gate": "/images/project-thumbnails/context-gate-style-library.png",
  "meta-ads-performance-intelligence-dashboard-adsmetri": "/images/project-thumbnails/adsmetri-roas-campaigns.png",
  "payment-engine-rewrite-calendar-ui-light-theme-track-v2": "/images/project-thumbnails/track-v2-calendar.png",
};

const publicStackRemovalsByProject: Record<string, string[]> = {
  "artlu-ai-rebuild-mockup": ["spoolcast"],
};

const technologyDisplayNames: Record<string, string> = {
  "firebase-realtime-db": "Firebase RealtimeDB",
};

const mainProjectMarks: Record<string, { key: string; text: string }> = {
  artlu: { key: "artlu", text: "$_" },
  research: { key: "research", text: "🧠" },
  pipelinecpc: { key: "pipeline", text: "P" },
};

const mainProjectWordmarks: Record<string, string> = {
  pipelinecpc: '<span class="brand-bolt">⚡</span> Pipeline<span>CPC</span>',
};

function mainProjectFallback(id: string) {
  return (mainProjectDefaults as any[]).find((row) => row.id === id) || {};
}

const seriesAliases: Record<string, string> = {
  "news-anime-bot": "aninews",
  "faux7": "aninews",
  "spoolcast-core": "videos",
};

function normalizeTimestamp(value: any) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return undefined;
}

function normalizeProject(id: string, data: any): Project {
  const name = data.name || "untitled project";
  return {
    ...data,
    id,
    name,
    slug: data.slug || slugify(name),
    stack: Array.isArray(data.stack) ? data.stack.filter(Boolean) : [],
    stackRefs: Array.isArray(data.stackRefs) ? data.stackRefs.filter(Boolean) : [],
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    screenshots: Array.isArray(data.screenshots) ? data.screenshots.filter(Boolean) : [],
    files: Array.isArray(data.files) ? data.files : [],
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

function projectPublicKey(project: Pick<Project, "id" | "name" | "slug">) {
  return slugify(project.slug || project.name || project.id || "");
}

function projectThumbnailOverride(project: Project) {
  return projectThumbnailOverrides[projectPublicKey(project)] || "";
}

function publicProjectStack(project: Project) {
  const removals = new Set(publicStackRemovalsByProject[projectPublicKey(project)] || []);
  if (!removals.size) return { stack: project.stack || [], stackRefs: project.stackRefs || [] };
  const keep = (value?: string) => {
    const key = String(value || "").trim().toLowerCase();
    return key && !removals.has(key) && !removals.has(slugify(key));
  };
  return {
    stack: (project.stack || []).filter(keep),
    stackRefs: (project.stackRefs || []).filter(keep),
  };
}

function normalizeMainProject(id: string, data: any): Omit<MainProject, "count"> {
  const normalizedId = data.id || id;
  const fallback = mainProjectFallback(String(normalizedId));
  const site = data.site || data.siteUrl || fallback.site || fallback.siteUrl || "";
  const repo = data.repo || data.repoUrl || fallback.repo || fallback.repoUrl || "";
  const demo = data.demo || data.demoUrl || fallback.demo || fallback.demoUrl || "";
  const logoImg = data.logoImg || data.logoUrl || fallback.logoImg || fallback.logoUrl || "";
  const heroImg = data.heroImg || data.heroUrl || data.backgroundImg || data.thumbnailUrl || fallback.heroImg || fallback.heroUrl || "";
  const fallbackMark = mainProjectMarks[String(normalizedId).toLowerCase()] || { key: "default", text: String(data.name || normalizedId).slice(0, 2).toLowerCase() };
  const fallbackWordmark = mainProjectWordmarks[String(normalizedId).toLowerCase()] || "";
  return {
    id: normalizedId,
    name: data.name || fallback.name || normalizedId,
    desc: data.desc || data.description || fallback.desc || fallback.description || "",
    meta: data.meta || fallback.meta || "",
    site,
    siteUrl: site,
    repo,
    repoUrl: repo,
    demo,
    demoUrl: demo,
    logoImg,
    logoUrl: logoImg,
    heroImg,
    heroUrl: heroImg,
    wordmark: data.wordmark || fallback.wordmark || fallbackWordmark,
    markKey: data.markKey || data.mark || fallback.markKey || fallback.mark || fallbackMark.key,
    markText: data.markText || fallback.markText || fallbackMark.text,
    visibility: data.visibility || fallback.visibility || "public",
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : (typeof fallback.sortOrder === "number" ? fallback.sortOrder : 0),
  };
}

export function normalizeSeriesId(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return seriesAliases[raw] || raw;
}

function labelSeries(value?: string) {
  if (!value) return "series";
  return value
    .replace(/^series[-_]/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSeries(id: string, data: any): Omit<SeriesRecord, "count"> {
  const seriesId = normalizeSeriesId(data.id || id);
  return {
    id: seriesId,
    mainProjectId: data.mainProjectId || data.parentProjectId || "",
    name: data.name || labelSeries(seriesId),
    desc: data.desc || data.description || `Grouped entries in the ${labelSeries(seriesId)} line.`,
    meta: data.meta || data.kind || "series",
    kind: data.kind || "series",
    aliases: Array.isArray(data.aliases) ? data.aliases.filter(Boolean) : [],
    visibility: data.visibility || "public",
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
  };
}

function normalizeTechnology(id: string, data: any): Omit<TechnologyRecord, "count"> {
  const techId = String(data.id || id || "").trim();
  return {
    id: techId,
    name: technologyDisplayNames[techId] || data.name || techId,
    category: data.category || "media",
    aliases: Array.isArray(data.aliases) ? data.aliases.filter(Boolean) : [],
    visibility: data.visibility || "public",
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
  };
}

function mergeTechnologyDefaults(rows: Omit<TechnologyRecord, "count">[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const fallback of technologyDefaults as any[]) {
    const tech = normalizeTechnology(fallback.id, fallback);
    if (!byId.has(tech.id) && tech.visibility !== "private") byId.set(tech.id, tech);
  }
  return [...byId.values()];
}

function normalizeJournal(id: string, data: any): JournalEntry {
  const title = data.title || "untitled entry";
  return {
    ...data,
    id,
    title,
    slug: data.slug || slugify(`day-${data.day || ""}-${title}`),
    tags: Array.isArray(data.tags) ? data.tags.map(refLabel).filter(Boolean) : [],
    projectRefs: Array.isArray(data.projectRefs) ? data.projectRefs.map(refLabel).filter(Boolean) : [],
  };
}

function refLabel(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.slug || value.name || value.title || value.id || "";
}

async function loadFallback() {
  const raw = await fs.readFile(fallbackBackup, "utf8");
  const backup = JSON.parse(raw);
  const projects = (backup.collections?.projects || []).map((item: any) => normalizeProject(item.id, item));
  const journal = (backup.collections?.journal || []).map((item: any) => normalizeJournal(item.id, item));
  return { projects, journal };
}

async function getClientDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

async function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline);

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (encoded) return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));

  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultServiceAccount;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function getAdminDb() {
  const serviceAccount = await loadServiceAccount();
  if (!serviceAccount) return null;
  const [{ cert, getApps: getAdminApps, initializeApp: initializeAdminApp }, { getFirestore: getAdminFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
  ]);
  const appName = "artlu-build";
  const app = getAdminApps().find((item) => item.name === appName) || initializeAdminApp({
    credential: cert(serviceAccount),
    projectId: "artluai-tracker",
  }, appName);
  return getAdminFirestore(app);
}

export async function getPublicProjects() {
  if (projectCache) return projectCache;
  try {
    const db = await getClientDb();
    const snap = await getDocs(query(collection(db, "projects"), where("visibility", "==", "public"), orderBy("createdAt", "desc")));
    projectCache = snap.docs.map((doc) => normalizeProject(doc.id, doc.data()));
  } catch (error) {
    console.warn("[data] Firestore public projects failed; using local backup", error);
    const fallback = await loadFallback();
    projectCache = fallback.projects.filter((project) => project.visibility === "public");
  }
  return [...projectCache].sort(projectSort);
}

export async function getPublicJournalEntries() {
  if (journalCache) return journalCache;
  try {
    const db = await getClientDb();
    const snap = await getDocs(query(collection(db, "journal"), where("visibility", "==", "public"), orderBy("createdAt", "desc")));
    journalCache = snap.docs.map((doc) => normalizeJournal(doc.id, doc.data()));
  } catch (error) {
    console.warn("[data] Firestore public journal failed; using local backup", error);
    const fallback = await loadFallback();
    journalCache = fallback.journal.filter((entry) => entry.visibility !== "private");
  }
  journalCache = withUniqueJournalSlugs(journalCache);
  return [...journalCache].sort((a, b) => dateValue(b.date) - dateValue(a.date));
}

async function getMainProjectRecords() {
  if (mainProjectCache) return mainProjectCache;
  try {
    const adminDb = await getAdminDb();
    if (adminDb) {
      const snap = await adminDb.collection("mainProjects").get();
      const rows = snap.docs
        .map((doc: any) => normalizeMainProject(doc.id, doc.data()))
        .filter((main: any) => main.visibility !== "private");
      if (rows.length) {
        mainProjectCache = rows;
        return [...mainProjectCache].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      }
    }
  } catch (error) {
    console.warn("[data] Firestore admin mainProjects failed; trying public read", error);
  }
  try {
    const db = await getClientDb();
    const snap = await getDocs(collection(db, "mainProjects"));
    const rows = snap.docs
      .map((doc) => normalizeMainProject(doc.id, doc.data()))
      .filter((main) => main.visibility !== "private");
    mainProjectCache = rows.length ? rows : mainProjectDefaults.map((row: any) => normalizeMainProject(row.id, row));
  } catch (error) {
    console.warn("[data] Firestore mainProjects failed; using local defaults", error);
    mainProjectCache = mainProjectDefaults.map((row: any) => normalizeMainProject(row.id, row));
  }
  return [...mainProjectCache].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

async function getSeriesRecords() {
  if (seriesCache) return seriesCache;
  try {
    const adminDb = await getAdminDb();
    if (adminDb) {
      const snap = await adminDb.collection("series").get();
      const rows = snap.docs
        .map((doc: any) => normalizeSeries(doc.id, doc.data()))
        .filter((series: any) => series.visibility !== "private");
      if (rows.length) {
        seriesCache = rows;
        return [...seriesCache].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      }
    }
  } catch (error) {
    console.warn("[data] Firestore admin series failed; trying public read", error);
  }
  try {
    const db = await getClientDb();
    const snap = await getDocs(collection(db, "series"));
    const rows = snap.docs
      .map((doc) => normalizeSeries(doc.id, doc.data()))
      .filter((series) => series.visibility !== "private");
    seriesCache = rows.length ? rows : seriesDefaults.map((row: any) => normalizeSeries(row.id, row));
  } catch (error) {
    console.warn("[data] Firestore series failed; using local defaults", error);
    seriesCache = seriesDefaults.map((row: any) => normalizeSeries(row.id, row));
  }
  return [...seriesCache].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

async function getTechnologyRecords() {
  if (technologyCache) return technologyCache;
  try {
    const adminDb = await getAdminDb();
    if (adminDb) {
      const snap = await adminDb.collection("technologies").get();
      const rows = snap.docs
        .map((doc: any) => normalizeTechnology(doc.id, doc.data()))
        .filter((tech: any) => tech.visibility !== "private");
      technologyCache = rows.length ? mergeTechnologyDefaults(rows) : technologyDefaults.map((row: any) => normalizeTechnology(row.id, row));
      return sortTechnologyRecords(technologyCache);
    }
  } catch (error) {
    console.warn("[data] Firestore admin technologies failed; trying public read", error);
  }
  try {
    const db = await getClientDb();
    const snap = await getDocs(collection(db, "technologies"));
    const rows = snap.docs
      .map((doc) => normalizeTechnology(doc.id, doc.data()))
      .filter((tech) => tech.visibility !== "private");
    technologyCache = rows.length ? mergeTechnologyDefaults(rows) : technologyDefaults.map((row: any) => normalizeTechnology(row.id, row));
  } catch (error) {
    console.warn("[data] Firestore technologies failed; using local defaults", error);
    technologyCache = technologyDefaults.map((row: any) => normalizeTechnology(row.id, row));
  }
  return sortTechnologyRecords(technologyCache);
}

function sortTechnologyRecords<T extends Pick<TechnologyRecord, "category" | "sortOrder" | "name">>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const catA = technologyCategoryOrder.indexOf(a.category);
    const catB = technologyCategoryOrder.indexOf(b.category);
    const byCat = (catA === -1 ? 999 : catA) - (catB === -1 ? 999 : catB);
    if (byCat) return byCat;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  });
}

function withUniqueJournalSlugs(entries: JournalEntry[]) {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = entry.slug || slugify(`day-${entry.day || ""}-${entry.title}`);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? { ...entry, slug: base } : { ...entry, slug: `${base}-${entry.id.slice(0, 6).toLowerCase()}` };
  });
}

export async function getVideoIndex() {
  const raw = await fs.readFile(path.join(process.cwd(), "public/videos/index.json"), "utf8");
  const rows = JSON.parse(raw) as VideoIndexItem[];
  return Promise.all(rows.map(async (row) => {
    if (row.youtubeId || row.tiktokId || row.tiktokUrl) return row;
    try {
      const bundle = await getVideoBundle(row.id);
      return {
        ...row,
        youtubeId: bundle.video?.youtubeId || null,
        tiktokUrl: bundle.video?.tiktokUrl || null,
        tiktokId: bundle.video?.tiktokId || null,
        thumbnailUrl: row.thumbnailUrl || bundle.video?.thumbnailUrl || null,
      };
    } catch {
      return row;
    }
  }));
}

export async function getVideoBundle(id: string) {
  const raw = await fs.readFile(path.join(process.cwd(), `public/videos/${id}/bundle.json`), "utf8");
  return JSON.parse(raw);
}

export function projectSort(a: Project, b: Project) {
  const byDate = dateValue(b.date) - dateValue(a.date);
  if (byDate !== 0) return byDate;
  const byUpdate = entrySortValue(b.updatedAt, b.date) - entrySortValue(a.updatedAt, a.date);
  if (byUpdate !== 0) return byUpdate;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

function entrySortValue(primary?: string | null, fallback?: string | null) {
  const value = primary || fallback;
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  return dateValue(value);
}

function siteEntrySort(a: SiteEntry, b: SiteEntry) {
  const byDate = dateValue(b.date) - dateValue(a.date);
  if (byDate !== 0) return byDate;
  const byUpdate = entrySortValue(b.updatedAt, b.date) - entrySortValue(a.updatedAt, a.date);
  if (byUpdate !== 0) return byUpdate;
  const orderA = a.project?.sortOrder ?? 0;
  const orderB = b.project?.sortOrder ?? 0;
  if (orderA !== orderB) return orderA - orderB;
  return a.title.localeCompare(b.title);
}

export function inferMainProject(project: Pick<Project, "name" | "stack" | "tags" | "longDesc" | "link">) {
  const hay = [project.name, project.longDesc, project.link, ...(project.stack || []), ...(project.tags || [])].join(" ").toLowerCase();
  const title = (project.name || "").toLowerCase();
  if (hay.includes("chat to video workflow") || hay.includes("session to video")) return "spoolcast";
  if (hay.includes("spoolcast pilot")) return "spoolcast";
  if (
    hay.includes("context gate") ||
    hay.includes("hallucination experiment") ||
    hay.includes("brain-response") ||
    hay.includes("brain response") ||
    hay.includes("tribe v2")
  ) return "research";
  if (title.includes("artlu")) return "artlu";
  if (hay.includes("spoolcast") || hay.includes("aninews") || hay.includes("news-anime") || hay.includes("faux7")) return "spoolcast";
  if (hay.includes("pipelinecpc") || hay.includes("google ads")) return "pipelinecpc";
  if (hay.includes("adsmetri") || hay.includes("meta ads")) return "adsmetri";
  if (hay.includes("vibeskill") || hay.includes("skill-tree")) return "vibeskill";
  if (hay.includes("costintel") || hay.includes("fulfillment")) return "costintel";
  if (
    hay.includes("artlu") ||
    hay.includes("journal system") ||
    hay.includes("terminal file browser") ||
    hay.includes("live demo iframe") ||
    hay.includes("artifact embed")
  ) return "artlu";
  return "other";
}

export function inferSeries(input: { name?: string; id?: string; show?: string | null; format?: string; stack?: string[] }) {
  const hay = [input.name, input.id, input.show, input.format, ...(input.stack || [])].join(" ").toLowerCase();
  if (hay.includes("aninews") || hay.includes("news-anime") || hay.includes("faux7")) return "aninews";
  if (hay.includes("dev-log") || hay.includes("dev log")) return "spoolcast-dev-log";
  if (hay.includes("chat to video workflow") || hay.includes("session to video")) return "videos";
  if (hay.includes("spoolcast")) return "videos";
  return undefined;
}

function parseYoutubeId(value?: string | null) {
  if (!value) return "";
  const raw = String(value).trim();
  const direct = raw.match(/^[a-zA-Z0-9_-]{8,}$/);
  if (direct && !raw.includes("/") && !raw.includes(".")) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || "";
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || "";
      return url.searchParams.get("v") || "";
    }
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
  } catch {
    const match = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{8,})/);
    return match?.[1] || "";
  }
  return "";
}

function projectYoutubeId(project: Project) {
  return project.youtubeId || parseYoutubeId(project.media) || parseYoutubeId(project.link);
}

function projectVideoId(project: Project) {
  return project.videoId || project.bundleId || "";
}

function videoSeriesId(video: VideoIndexItem) {
  return inferSeries({ id: video.id, show: video.show, format: video.format, name: video.title });
}

function isProjectVideoEntry(project: Project, matchedVideo?: VideoIndexItem | null) {
  if (matchedVideo) return true;
  const type = (project.type || "").toLowerCase();
  if (type === "video") return true;
  if (projectVideoId(project) || project.youtubeId || project.tiktokUrl || project.tiktokId || project.videoFormat || project.guidebookStatus) return true;
  const seriesId = normalizeSeriesId(project.seriesId || inferSeries({ name: project.name, stack: project.stack }));
  const mainProjectId = project.mainProjectId || project.parentProjectId || inferMainProject(project);
  return mainProjectId === "spoolcast" && Boolean(seriesId) && Boolean(project.media || projectYoutubeId(project));
}

function projectVideoFormat(project: Project, matchedVideo?: VideoIndexItem | null) {
  if (matchedVideo?.format) return matchedVideo.format;
  if (project.videoFormat) return project.videoFormat;
  const seriesId = normalizeSeriesId(project.seriesId || inferSeries({ name: project.name, stack: project.stack }));
  if (seriesId === "aninews") return "short";
  return "long";
}

function projectVideoThumbnail(project: Project, matchedVideo?: VideoIndexItem | null) {
  if (matchedVideo?.thumbnailUrl) return matchedVideo.thumbnailUrl;
  if (project.screenshots?.[0]) return project.screenshots[0];
  const youtubeId = projectYoutubeId(project);
  if (!youtubeId) return "";
  return projectVideoFormat(project, matchedVideo) === "short"
    ? `https://i.ytimg.com/vi/${youtubeId}/oardefault.jpg`
    : `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
}

function findVideoForProject(project: Project, videos: VideoIndexItem[]) {
  const explicitVideoId = projectVideoId(project);
  if (explicitVideoId) {
    const byId = videos.find((video) => video.id === explicitVideoId);
    if (byId) return byId;
  }
  const youtubeId = projectYoutubeId(project);
  if (youtubeId) {
    const byYoutube = videos.find((video) => video.youtubeId && video.youtubeId === youtubeId);
    if (byYoutube) return byYoutube;
  }
  return videos.find((video) => isDuplicateVideoProject(project, video)) || null;
}

const titleStopWords = new Set([
  "a", "an", "and", "as", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "with",
  "ai", "ep", "episode", "dev", "log", "spoolcast", "aninews", "news", "anime",
]);

function meaningfulTitleTokens(value?: string) {
  return slugify(value || "")
    .split("-")
    .filter((token) => token && (!titleStopWords.has(token) || /^\d+$/.test(token)));
}

function titleOverlapScore(a?: string, b?: string) {
  const aTokens = new Set(meaningfulTitleTokens(a));
  const bTokens = new Set(meaningfulTitleTokens(b));
  if (!aTokens.size || !bTokens.size) return 0;
  let shared = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) shared += 1;
  });
  return shared / Math.min(aTokens.size, bTokens.size);
}

function isDuplicateVideoProject(project: Project, video: VideoIndexItem) {
  if (!project.date || !video.shippedAt || project.date !== video.shippedAt) return false;
  const projectKey = slugify(project.name);
  const videoKey = slugify(video.title);
  if (projectKey.length > 16 && videoKey.length > 16 && (projectKey.includes(videoKey) || videoKey.includes(projectKey))) return true;
  const projectSeries = inferSeries({ name: project.name, stack: project.stack });
  const videoSeries = inferSeries({ id: video.id, show: video.show, format: video.format, name: video.title });
  const sameVideoLine = projectSeries && videoSeries && projectSeries === videoSeries;
  const score = titleOverlapScore(project.name, video.title);
  return score >= (sameVideoLine ? 0.58 : 0.72);
}

export async function getMainProjects(projects?: Project[]) {
  const all = projects || await getPublicProjects();
  const counts = new Map<string, number>();
  for (const project of all) {
    const key = project.mainProjectId || project.parentProjectId || inferMainProject(project);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const records = await getMainProjectRecords();
  const byId = new Map(records.map((main) => [main.id, main]));
  for (const fallback of mainProjectDefaults as any[]) {
    if (!byId.has(fallback.id) && (counts.has(fallback.id) || fallback.id === "other")) {
      byId.set(fallback.id, normalizeMainProject(fallback.id, fallback));
    }
  }
  for (const id of counts.keys()) {
    if (!byId.has(id)) {
      byId.set(id, normalizeMainProject(id, {
        id,
        name: id,
        meta: "project line",
        desc: `Public entries grouped under ${id}.`,
        visibility: "public",
        sortOrder: 900,
      }));
    }
  }
  return [...byId.values()]
    .map((main) => ({ ...main, count: counts.get(main.id) || 0 }))
    .filter((main) => main.count > 0 || main.id !== "other")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

export async function getSeries(entries?: Pick<SiteEntry, "seriesId" | "mainProjectId">[]) {
  const all = entries || await getSiteEntries();
  const counts = new Map<string, number>();
  const parentIds = new Map<string, string>();
  for (const entry of all) {
    const key = normalizeSeriesId(entry.seriesId);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (entry.mainProjectId && !parentIds.has(key)) parentIds.set(key, entry.mainProjectId);
  }
  const records = await getSeriesRecords();
  const byId = new Map(records.map((series) => [series.id, series]));
  for (const fallback of seriesDefaults as any[]) {
    const key = normalizeSeriesId(fallback.id);
    if (!byId.has(key) && counts.has(key)) byId.set(key, normalizeSeries(key, fallback));
  }
  for (const id of counts.keys()) {
    if (!byId.has(id)) {
      byId.set(id, normalizeSeries(id, {
        id,
        mainProjectId: parentIds.get(id) || "",
        name: labelSeries(id),
        meta: "series",
        desc: `Grouped entries in the ${labelSeries(id)} line.`,
        visibility: "public",
        sortOrder: 900,
      }));
    }
  }
  return [...byId.values()]
    .map((series) => ({
      ...series,
      mainProjectId: series.mainProjectId || parentIds.get(series.id) || "",
      count: counts.get(series.id) || 0,
    }))
    .filter((series) => series.count > 0)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

function technologyAliasMap(technologies: Pick<TechnologyRecord, "id" | "name" | "aliases">[]) {
  const map = new Map<string, string>();
  for (const tech of technologies) {
    const keys = [tech.id, tech.name, ...(tech.aliases || [])];
    for (const key of keys) {
      const raw = String(key || "").trim().toLowerCase();
      if (!raw) continue;
      map.set(raw, tech.id);
      map.set(slugify(raw), tech.id);
    }
  }
  return map;
}

function publicStackTechnologyIds(id?: string) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return [];
  if (Object.prototype.hasOwnProperty.call(publicStackTechnologyAliases, key)) {
    const value = publicStackTechnologyAliases[key];
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
  return id ? [id] : [];
}

type StackInput = {
  stack?: string[];
  stackRefs?: string[];
};

export function resolveTechnologyIds(
  input: StackInput,
  technologies: Pick<TechnologyRecord, "id" | "name" | "aliases">[],
) {
  const aliases = technologyAliasMap(technologies);
  const ids = new Set<string>();
  for (const ref of input.stackRefs || []) {
    const key = String(ref || "").trim().toLowerCase();
    const id = aliases.get(key) || aliases.get(slugify(key));
    publicStackTechnologyIds(id).forEach((publicId) => ids.add(publicId));
  }
  for (const raw of input.stack || []) {
    const key = String(raw || "").trim().toLowerCase();
    const id = aliases.get(key) || aliases.get(slugify(key));
    const publicIds = publicStackTechnologyIds(id);
    if (publicIds.length) publicIds.forEach((publicId) => ids.add(publicId));
    else if (key && aliases.has("other")) ids.add("other");
  }
  return [...ids];
}

export function technologyCategoryPairs(technologies: Pick<TechnologyRecord, "category">[]) {
  const present = new Set(technologies.map((tech) => tech.category).filter(Boolean));
  return technologyCategoryOrder
    .filter((category) => present.has(category))
    .map((category) => [category, technologyCategoryLabels[category] || category] as [string, string]);
}

export async function getTechnologies(entries?: StackInput[]) {
  const records = await getTechnologyRecords();
  const counts = new Map<string, number>();
  if (entries) {
    for (const entry of entries) {
      for (const id of resolveTechnologyIds(entry, records)) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return sortTechnologyRecords(records)
    .map((tech) => ({ ...tech, count: counts.get(tech.id) || 0 }))
    .filter((tech) => !entries || tech.count > 0);
}

export async function getSiteEntries() {
  const [projects, videos] = await Promise.all([getPublicProjects(), getVideoIndex()]);
  const matchedVideoIds = new Set<string>();
  const projectEntries: SiteEntry[] = projects.map((project) => {
    const matchedVideo = findVideoForProject(project, videos);
    if (matchedVideo) matchedVideoIds.add(matchedVideo.id);
    const isVideo = isProjectVideoEntry(project, matchedVideo);
    const publicStack = publicProjectStack(project);
    const staticThumbnail = projectThumbnailOverride(project);
    const mainProjectId = project.mainProjectId || project.parentProjectId || inferMainProject(project);
    const explicitSeriesId = normalizeSeriesId(project.seriesId);
    const inferredSeriesId = explicitSeriesId || normalizeSeriesId(matchedVideo ? videoSeriesId(matchedVideo) : inferSeries({ name: project.name, stack: project.stack }));
    const seriesId = explicitSeriesId || (mainProjectId === "spoolcast" ? inferredSeriesId : undefined);
    const format = isVideo ? projectVideoFormat(project, matchedVideo) : undefined;
    const youtubeId = isVideo ? projectYoutubeId(project) || matchedVideo?.youtubeId || null : null;
    const videoId = matchedVideo?.id || projectVideoId(project) || undefined;
    const guidebookStatus = matchedVideo ? "ready" : project.guidebookStatus || (videoId ? "pending" : undefined);
    return {
      id: `p_${project.id}`,
      kind: isVideo ? "video" : "project",
      title: project.name,
      desc: project.desc,
      date: project.date,
      updatedAt: project.updatedAt || project.createdAt || project.date,
      day: dayNum(project.date),
      status: project.status || "launched",
      stack: publicStack.stack,
      stackRefs: publicStack.stackRefs,
      tags: project.tags || [],
      route: matchedVideo ? `/video/${matchedVideo.id}` : `/project/${project.slug}`,
      mainProjectId,
      seriesId,
      embedType: isVideo ? (format === "short" ? "v" : "h") : (project.artifactHtml || project.link ? "d" : undefined),
      embedUrl: project.link,
      thumbnailUrl: staticThumbnail || (isVideo ? projectVideoThumbnail(project, matchedVideo) : project.screenshots?.[0]),
      thumbnailMode: staticThumbnail ? "static" : undefined,
      guidebookStatus,
      videoId,
      youtubeId,
      project,
      video: matchedVideo || undefined,
      long: project.longDesc,
    };
  });
  const videoEntries: SiteEntry[] = videos.filter((video) => !matchedVideoIds.has(video.id)).map((video) => ({
    id: `v_${video.id}`,
    kind: "video",
    title: video.title,
    desc: video.desc,
    date: video.shippedAt,
    updatedAt: video.shippedAt,
    day: dayNum(video.shippedAt),
    status: "launched",
    stack: [video.format === "short" ? "short" : "longform", "spoolcast"],
    stackRefs: [],
    tags: [video.show || "spoolcast"].filter(Boolean) as string[],
    route: `/video/${video.id}`,
    mainProjectId: "spoolcast",
    seriesId: normalizeSeriesId(inferSeries({ id: video.id, show: video.show, format: video.format })),
    embedType: video.format === "short" ? "v" : "h",
    thumbnailUrl: video.thumbnailUrl,
    guidebookStatus: "ready",
    videoId: video.id,
    youtubeId: video.youtubeId || null,
    video,
  }));
  return [...projectEntries, ...videoEntries].sort(siteEntrySort);
}

export function getStats(projects: Project[]) {
  const day = currentDay();
  const byDay = new Map<string, number>();
  for (const project of projects) {
    if (!project.date) continue;
    byDay.set(project.date, (byDay.get(project.date) || 0) + 1);
  }
  return {
    day,
    shipped: projects.length,
    toGo: Math.max(0, 100 - projects.length),
    activeDays: byDay.size,
    activity: buildActivity(projects),
  };
}

export function buildActivity(projects: Project[]) {
  const weeks = 20;
  const end = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const first = new Date(endDay.getTime() - (weeks - 1) * 7 * 86400000);
  const cells = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(first.getTime() + i * 7 * 86400000);
    const stop = new Date(start.getTime() + 7 * 86400000);
    const count = projects.filter((project) => {
      if (!project.date) return false;
      const date = new Date(`${project.date}T00:00:00`);
      return date >= start && date < stop;
    }).length;
    cells.push({
      date: start.toISOString().slice(0, 10),
      count,
      level: Math.min(4, count),
      tip: `week of ${start.toLocaleDateString("en-US", { month:"short", day:"numeric" }).toLowerCase()} · ${count} shipped`,
    });
  }
  return cells;
}
