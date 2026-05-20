import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { adminEmail, firebaseConfig } from "../lib/firebaseConfig";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const state = {
  projects: [] as any[],
  mainProjects: [] as any[],
  series: [] as any[],
  technologies: [] as any[],
  current: null as any | null,
  currentIsNew: false,
  currentTech: null as any | null,
  selectedTechIds: new Set<string>(),
};

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T | null;

function slugify(value = "") {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

function parseCsv(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function norm(value = "") {
  return String(value).trim().toLowerCase();
}

function timestampValue(value: any) {
  if (!value) return 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}

function dateSortValue(project: any) {
  return Date.parse(`${project.date || ""}T00:00:00`) || timestampValue(project.createdAt) || timestampValue(project.updatedAt);
}

function projectKind(project: any) {
  return project.type === "video" || project.videoId || project.youtubeId ? "video" : "build";
}

function projectMainId(project: any) {
  return project.mainProjectId || project.parentProjectId || "";
}

function seriesName(id?: string) {
  return state.series.find((item) => item.id === id)?.name || id || "";
}

function mainProjectName(id?: string) {
  return state.mainProjects.find((item) => item.id === id)?.name || id || "unassigned";
}

function sortedProjects() {
  return [...state.projects].sort((a, b) => dateSortValue(b) - dateSortValue(a) || String(a.name || "").localeCompare(String(b.name || "")));
}

function aliasMap() {
  const map = new Map<string, string>();
  for (const tech of state.technologies) {
    const keys = [tech.id, tech.name, ...(tech.aliases || [])];
    for (const key of keys) {
      const raw = norm(key);
      if (!raw) continue;
      map.set(raw, tech.id);
      map.set(slugify(raw), tech.id);
    }
  }
  return map;
}

function resolveStackRefs(project: any) {
  const aliases = aliasMap();
  const ids = new Set<string>();
  for (const ref of project.stackRefs || []) {
    const key = norm(ref);
    const id = aliases.get(key) || aliases.get(slugify(key));
    if (id) ids.add(id);
  }
  for (const raw of project.stack || []) {
    const key = norm(raw);
    const id = aliases.get(key) || aliases.get(slugify(key));
    if (id) ids.add(id);
    else if (key && aliases.has("other")) ids.add("other");
  }
  return [...ids];
}

function techById(id: string) {
  return state.technologies.find((tech) => tech.id === id);
}

function sortedTechnologies() {
  const categoryOrder = ["frontend", "backend", "data", "infra", "media", "agents", "other"];
  return [...state.technologies].sort((a, b) => {
    const byCat = categoryOrder.indexOf(a.category || "other") - categoryOrder.indexOf(b.category || "other");
    if (byCat) return byCat;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
}

function techRefCount(id: string) {
  return state.projects.filter((project) => resolveStackRefs(project).includes(id)).length;
}

async function markDirty(operation: string, targetType: string, targetId: string, targetName: string, changedFields: string[]) {
  const change = {
    agent: "admin",
    client: "admin-ui",
    operation,
    targetType,
    targetId,
    targetName,
    changedFields,
    at: serverTimestamp(),
  };
  await setDoc(doc(db, "siteMeta", "publishState"), {
    dirty: true,
    pendingChanges: increment(1),
    lastContentChangeAt: serverTimestamp(),
    lastChangedBy: change,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, "siteMeta", "publishState", "changes"), change);
}

function setStatus(text: string) {
  const el = $("#adminStatus");
  if (el) el.textContent = text;
}

function setAuthedChrome(isAuthed: boolean) {
  document.querySelectorAll("[data-admin-authed-only]").forEach((el) => {
    if (isAuthed) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "true");
  });
}

function authErrorMessage(error: any) {
  const code = error?.code ? String(error.code).replace(/^auth\//, "") : "unknown error";
  if (code === "popup-blocked") return "sign-in failed: popup blocked. allow popups and try again.";
  if (code === "popup-closed-by-user") return "sign-in cancelled: popup was closed.";
  if (code === "unauthorized-domain") return "sign-in failed: this local URL is not authorized in Firebase.";
  if (code === "cancelled-popup-request") return "sign-in cancelled: another popup request interrupted it.";
  return `sign-in failed: ${code}`;
}

async function startSignIn() {
  setStatus("opening google sign-in...");
  try {
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    setStatus(authErrorMessage(error));
  }
}

function syncDashboardStats() {
  const publicCount = state.projects.filter((project) => project.visibility === "public").length;
  const launched = state.projects.filter((project) => project.status === "launched").length;
  const stats = $("#dashboardStats");
  if (stats) {
    stats.innerHTML = `<b>${state.mainProjects.length}</b> main projects · <b>${state.series.length}</b> series · <b>${state.projects.length}</b> entries · <b>${launched}</b> launched · <b>${publicCount}</b> public`;
  }
}

function ensureMainProjects() {
  const byId = new Map(state.mainProjects.map((main) => [main.id, main]));
  for (const project of state.projects) {
    const id = projectMainId(project);
    if (id && !byId.has(id)) {
      byId.set(id, { id, name: id, sortOrder: 900, visibility: "public" });
    }
  }
  state.mainProjects = [...byId.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

function renderProjectSelects(selectedMain = "") {
  const main = $("#f-main") as HTMLSelectElement | null;
  if (!main) return;
  const options = ['<option value="">— pick a project —</option>']
    .concat(state.mainProjects.map((item) => `<option value="${esc(item.id)}">${esc(item.name || item.id)}</option>`));
  main.innerHTML = options.join("");
  main.value = selectedMain;
  refreshSeriesSelect();
}

function refreshSeriesSelect(selectedSeries = "") {
  const main = ($("#f-main") as HTMLSelectElement | null)?.value || "";
  const series = $("#f-series") as HTMLSelectElement | null;
  if (!series) return;
  if (!main) {
    series.innerHTML = '<option value="">— pick a project first —</option>';
    series.disabled = true;
    return;
  }
  const rows = state.series.filter((item) => item.mainProjectId === main || item.parentProjectId === main);
  series.disabled = false;
  series.innerHTML = [`<option value="">— none, directly under ${esc(mainProjectName(main))} —</option>`]
    .concat(rows.map((item) => `<option value="${esc(item.id)}">${esc(item.name || item.id)}${item.kind ? ` (${esc(item.kind)})` : ""}</option>`))
    .join("");
  series.value = selectedSeries;
}

function renderProjectTree() {
  const panel = $("#projPanel");
  if (!panel) return;
  if (!state.mainProjects.length) {
    panel.innerHTML = '<div class="empty">no main projects loaded.</div>';
    return;
  }
  panel.innerHTML = state.mainProjects.map((main) => {
    const entries = state.projects.filter((project) => projectMainId(project) === main.id);
    const subs = state.series.filter((item) => item.mainProjectId === main.id || item.parentProjectId === main.id);
    return `<div class="proj-item">
      <div class="proj-row">
        <span class="pr-caret">▶</span>
        <span class="pr-glyph">◆</span>
        <span class="pr-name">${esc(main.name || main.id)}</span>
        <span class="pr-count">${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${subs.length} series</span>
        <span class="pr-spacer"></span>
        <button class="pr-act" type="button" data-new-under="${esc(main.id)}">+ entry</button>
      </div>
      <div class="proj-children">
        ${subs.map((item) => {
          const count = state.projects.filter((project) => project.seriesId === item.id).length;
          return `<div class="ser-row">
            <span class="ser-glyph">◆</span>
            <span class="ser-name">${esc(item.name || item.id)}</span>
            <span class="ser-kind">${esc(item.kind || "series")}</span>
            <span class="ser-count">${count} entr${count === 1 ? "y" : "ies"}</span>
          </div>`;
        }).join("")}
        <div class="add-ser" data-new-series="${esc(main.id)}">+ new series under ${esc(main.name || main.id)}</div>
      </div>
    </div>`;
  }).join("");
}

function renderTimeline() {
  const feed = $("#adminFeed");
  if (!feed) return;
  const rows = sortedProjects();
  if (!rows.length) {
    feed.innerHTML = '<div class="empty">no entries loaded.</div>';
    return;
  }
  const groups = new Map<string, any[]>();
  for (const project of rows) {
    const date = project.date || "undated";
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)?.push(project);
  }
  feed.innerHTML = `<div class="tl">${[...groups.entries()].map(([date, projects]) => `
    <section class="day-group">
      <div class="day-pill-row"><span class="day-pill">${esc(date)}</span></div>
      <div class="day-rows">${projects.map((project) => {
        const mainId = projectMainId(project);
        const seriesId = project.seriesId || "";
        const kind = projectKind(project);
        return `<article class="item" data-id="${esc(project.id)}">
          <div class="r">
            <span class="grip">⠿</span>
            <span class="caret">▶</span>
            <span class="dot ${kind === "video" ? "video" : "build"}"></span>
            <div class="r-col">
              <span class="r-title">${esc(project.name || "untitled")}</span>
              <span class="r-sub">${esc(project.desc || "")}</span>
            </div>
            <div class="r-path"><b>${esc(mainProjectName(mainId))}</b>${seriesId ? ` <span class="sx">› ${esc(seriesName(seriesId))}</span>` : ""}</div>
            <div class="r-status"><span class="status ${esc(project.status || "idea")}">${esc(project.status || "idea")}</span></div>
            <div class="r-vis"><button class="vis-btn ${project.visibility === "public" ? "vis-public" : "vis-private"}" type="button" data-vis="${esc(project.id)}">${project.visibility === "public" ? "●" : "○"}</button></div>
            <div class="r-edit"><button class="edit-btn" type="button" data-edit="${esc(project.id)}">edit</button></div>
          </div>
          <div class="detail">
            <div class="d-long">${esc(project.longDesc || project.desc || "no description yet.")}</div>
            <div class="d-meta">
              <span>project: ${esc(mainProjectName(mainId))}${seriesId ? ` › ${esc(seriesName(seriesId))}` : ""}</span>
              <span>stack: ${esc((project.stack || []).join(", ") || "none")}</span>
              <span>visibility: ${esc(project.visibility || "private")}</span>
              ${project.link ? `<a href="${esc(project.link)}" target="_blank" rel="noreferrer">↗ live</a>` : ""}
            </div>
          </div>
        </article>`;
      }).join("")}</div>
    </section>`).join("")}</div>`;
}

function renderProjects() {
  ensureMainProjects();
  syncDashboardStats();
  renderProjectSelects(($("#f-main") as HTMLSelectElement | null)?.value || "");
  renderProjectTree();
  renderTimeline();
}

function renderStackPicker() {
  const selected = $("#selectedTech");
  const options = $("#techOptions");
  if (!selected || !options) return;
  const search = norm(($("#techSearch") as HTMLInputElement | null)?.value || "");
  const selectedIds = [...state.selectedTechIds];
  selected.innerHTML = selectedIds.length
    ? selectedIds.map((id) => {
        const tech = techById(id);
        return `<button class="tech-chip on" type="button" data-remove-tech="${esc(id)}">${esc(tech?.name || id)} ×</button>`;
      }).join("")
    : '<span class="admin-row-meta">no canonical stack tags selected</span>';
  const pool = sortedTechnologies()
    .filter((tech) => tech.visibility !== "private")
    .filter((tech) => {
      if (!search) return true;
      return [tech.id, tech.name, ...(tech.aliases || [])].join(" ").toLowerCase().includes(search);
    })
    .slice(0, 40);
  options.innerHTML = pool.map((tech) => `
    <button class="tech-chip ${state.selectedTechIds.has(tech.id) ? "on" : ""}" type="button" data-toggle-tech="${esc(tech.id)}">
      ${esc(tech.name || tech.id)}
      <span>${esc(tech.category || "other")}</span>
    </button>
  `).join("") || '<div class="empty">no matching stack tags.</div>';
}

function openForm(project: any, isNew = false) {
  state.current = project;
  state.currentIsNew = isNew;
  const mainId = projectMainId(project);
  ($("#modalTitle") as HTMLElement | null)!.textContent = isNew ? "$ add entry" : "$ edit entry";
  renderProjectSelects(mainId);
  refreshSeriesSelect(project.seriesId || "");
  ($("#f-name") as HTMLInputElement).value = project.name || "";
  ($("#f-desc") as HTMLTextAreaElement).value = project.desc || "";
  ($("#f-long") as HTMLTextAreaElement).value = project.longDesc || "";
  ($("#f-date") as HTMLInputElement).value = project.date || new Date().toISOString().slice(0, 10);
  ($("#f-status") as HTMLSelectElement).value = project.status || "launched";
  ($("#f-vis") as HTMLSelectElement).value = project.visibility || "private";
  ($("#f-tags") as HTMLInputElement).value = (project.tags || []).join(", ");
  ($("#f-stack") as HTMLInputElement).value = (project.stack || []).join(", ");
  state.selectedTechIds = new Set(resolveStackRefs(project));
  renderStackPicker();
  ($("#f-link") as HTMLInputElement).value = project.link || "";
  ($("#f-repo") as HTMLInputElement).value = project.repo || "";
  ($("#f-media") as HTMLInputElement).value = project.media || "";
  ($("#f-artifact") as HTMLTextAreaElement).value = project.artifactHtml || "";
  $("#entryOverlay")?.classList.add("open");
  setStatus(isNew ? "adding new entry" : `editing ${project.name || "entry"}`);
}

function closeForm() {
  $("#entryOverlay")?.classList.remove("open");
}

function newEntry(mainProjectId = "") {
  openForm({
    id: "",
    name: "",
    desc: "",
    longDesc: "",
    status: "launched",
    visibility: "private",
    date: new Date().toISOString().slice(0, 10),
    mainProjectId,
    stack: [],
    stackRefs: [],
    tags: [],
  }, true);
}

async function loadMetadata() {
  setStatus("loading project lines...");
  const [mainSnap, seriesSnap] = await Promise.all([
    getDocs(collection(db, "mainProjects")),
    getDocs(collection(db, "series")),
  ]);
  state.mainProjects = mainSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => item.visibility !== "private")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
  state.series = seriesSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => item.visibility !== "private")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
  renderProjects();
  setStatus("project lines loaded");
}

async function loadProjects() {
  setStatus("loading entries...");
  const snap = await getDocs(collection(db, "projects"));
  state.projects = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderProjects();
  renderTechList();
  setStatus(`${state.projects.length} entries loaded`);
}

async function loadTechnologies() {
  setStatus("loading stack tags...");
  const snap = await getDocs(collection(db, "technologies"));
  state.technologies = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderTechList();
  renderStackPicker();
  setStatus(`${state.technologies.length} stack tags loaded`);
}

async function saveCurrent() {
  if (!state.current) return;
  const name = ($("#f-name") as HTMLInputElement).value.trim();
  if (!name) {
    setStatus("name is required");
    return;
  }
  const stackRefs = [...state.selectedTechIds];
  const update: any = {
    name,
    slug: slugify(name),
    desc: ($("#f-desc") as HTMLTextAreaElement).value.trim(),
    longDesc: ($("#f-long") as HTMLTextAreaElement).value.trim(),
    date: ($("#f-date") as HTMLInputElement).value,
    status: ($("#f-status") as HTMLSelectElement).value,
    visibility: ($("#f-vis") as HTMLSelectElement).value,
    tags: parseCsv(($("#f-tags") as HTMLInputElement).value),
    stack: stackRefs.length
      ? stackRefs.map((id) => techById(id)?.name || id)
      : parseCsv(($("#f-stack") as HTMLInputElement).value),
    stackRefs,
    link: ($("#f-link") as HTMLInputElement).value.trim(),
    repo: ($("#f-repo") as HTMLInputElement).value.trim(),
    media: ($("#f-media") as HTMLInputElement).value.trim(),
    artifactHtml: ($("#f-artifact") as HTMLTextAreaElement).value,
    mainProjectId: ($("#f-main") as HTMLSelectElement).value,
    seriesId: ($("#f-series") as HTMLSelectElement).value,
    updatedAt: serverTimestamp(),
  };
  setStatus("saving entry...");
  if (state.currentIsNew) {
    update.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "projects"), update);
    state.current = { id: ref.id, ...update };
    state.currentIsNew = false;
    state.projects.unshift(state.current);
    await markDirty("project.create", "project", ref.id, name, Object.keys(update).filter((key) => key !== "updatedAt"));
  } else {
    await updateDoc(doc(db, "projects", state.current.id), update);
    await markDirty("project.update", "project", state.current.id, name, Object.keys(update).filter((key) => key !== "updatedAt"));
    Object.assign(state.current, update);
  }
  renderProjects();
  renderTechList();
  closeForm();
  setStatus("saved");
}

async function toggleVisibility(id: string) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  const next = project.visibility === "public" ? "private" : "public";
  project.visibility = next;
  renderProjects();
  await updateDoc(doc(db, "projects", id), { visibility: next, updatedAt: serverTimestamp() });
  await markDirty("project.update", "project", id, project.name || id, ["visibility"]);
  setStatus(`${project.name || "entry"} is now ${next}`);
}

function renderTechList() {
  const list = $("#techList");
  if (!list) return;
  const filter = norm(($("#techFilter") as HTMLInputElement | null)?.value || "");
  const rows = sortedTechnologies().filter((tech) => {
    if (!filter) return true;
    return [tech.id, tech.name, tech.category, ...(tech.aliases || [])].join(" ").toLowerCase().includes(filter);
  });
  list.innerHTML = rows.map((tech) => {
    const count = techRefCount(tech.id);
    return `<div class="admin-row ${state.currentTech?.id === tech.id ? "active" : ""}">
      <span class="vis-btn ${tech.visibility !== "private" ? "vis-public" : ""}">■</span>
      <div style="flex:1;min-width:0">
        <div class="admin-row-title">${esc(tech.name || tech.id)}</div>
        <div class="admin-row-meta">${esc(tech.id)} · ${esc(tech.category || "other")} · ${count} refs · ${esc(tech.visibility || "public")}</div>
      </div>
      <button class="mini-btn" type="button" data-edit-tech="${esc(tech.id)}">edit</button>
    </div>`;
  }).join("") || '<div class="empty">no stack tags.</div>';
}

function fillTechForm(tech: any) {
  state.currentTech = tech;
  ($("#t-id") as HTMLInputElement).value = tech.id || "";
  ($("#t-name") as HTMLInputElement).value = tech.name || "";
  ($("#t-category") as HTMLSelectElement).value = tech.category || "other";
  ($("#t-aliases") as HTMLTextAreaElement).value = (tech.aliases || []).join(", ");
  ($("#t-sort") as HTMLInputElement).value = String(tech.sortOrder ?? 0);
  ($("#t-vis") as HTMLSelectElement).value = tech.visibility || "public";
  renderTechList();
  setStatus(`editing stack tag ${tech.name || tech.id}`);
}

function newTechnology() {
  fillTechForm({ id: "", name: "", category: "other", aliases: [], visibility: "public", sortOrder: 900 });
  ($("#t-id") as HTMLInputElement | null)?.focus();
}

async function saveTechnology() {
  const id = ($("#t-id") as HTMLInputElement).value.trim();
  if (!id) {
    setStatus("stack tag id is required");
    return;
  }
  const data = {
    name: ($("#t-name") as HTMLInputElement).value.trim() || id,
    category: ($("#t-category") as HTMLSelectElement).value,
    aliases: parseCsv(($("#t-aliases") as HTMLTextAreaElement).value),
    sortOrder: Number(($("#t-sort") as HTMLInputElement).value || 0),
    visibility: ($("#t-vis") as HTMLSelectElement).value,
    updatedAt: serverTimestamp(),
  };
  setStatus("saving stack tag...");
  await setDoc(doc(db, "technologies", id), data, { merge: true });
  await markDirty("technology.upsert", "technology", id, data.name, Object.keys(data).filter((key) => key !== "updatedAt"));
  const existing = state.technologies.find((tech) => tech.id === id);
  if (existing) Object.assign(existing, data);
  else state.technologies.push({ id, ...data });
  fillTechForm({ id, ...data });
  renderStackPicker();
  setStatus(`saved stack tag ${data.name}`);
}

async function hideTechnology() {
  const id = ($("#t-id") as HTMLInputElement).value.trim();
  if (!id) return;
  const tech = techById(id);
  setStatus("hiding stack tag...");
  await setDoc(doc(db, "technologies", id), { visibility: "private", updatedAt: serverTimestamp() }, { merge: true });
  await markDirty("technology.hide", "technology", id, tech?.name || id, ["visibility"]);
  if (tech) tech.visibility = "private";
  ($("#t-vis") as HTMLSelectElement).value = "private";
  renderTechList();
  renderStackPicker();
  setStatus(`hidden ${tech?.name || id}`);
}

function bind() {
  $("#adminSignIn")?.addEventListener("click", startSignIn);
  $("#adminSignOut")?.addEventListener("click", async () => {
    setStatus("signing out...");
    await signOut(auth);
  });
  $("#saveProject")?.addEventListener("click", saveCurrent);
  $("#cancelProject")?.addEventListener("click", closeForm);
  $("#entryOverlay")?.addEventListener("click", (event) => {
    if (event.target === $("#entryOverlay")) closeForm();
  });
  $("#reloadProjects")?.addEventListener("click", async () => {
    await loadMetadata();
    await loadProjects();
  });
  $("#newEntry")?.addEventListener("click", () => newEntry());
  $("#newProject")?.addEventListener("click", () => newEntry());
  $("#reloadTech")?.addEventListener("click", loadTechnologies);
  $("#newTech")?.addEventListener("click", newTechnology);
  $("#saveTech")?.addEventListener("click", saveTechnology);
  $("#hideTech")?.addEventListener("click", hideTechnology);
  $("#f-main")?.addEventListener("change", () => refreshSeriesSelect());
  $("#techSearch")?.addEventListener("input", renderStackPicker);
  $("#techFilter")?.addEventListener("input", renderTechList);
  $("#selectedTech")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const remove = target.closest("[data-remove-tech]") as HTMLElement | null;
    if (!remove?.dataset.removeTech) return;
    state.selectedTechIds.delete(remove.dataset.removeTech);
    renderStackPicker();
  });
  $("#techOptions")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const toggle = target.closest("[data-toggle-tech]") as HTMLElement | null;
    if (!toggle?.dataset.toggleTech) return;
    if (state.selectedTechIds.has(toggle.dataset.toggleTech)) state.selectedTechIds.delete(toggle.dataset.toggleTech);
    else state.selectedTechIds.add(toggle.dataset.toggleTech);
    renderStackPicker();
  });
  $("#techList")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const edit = target.closest("[data-edit-tech]") as HTMLElement | null;
    if (edit?.dataset.editTech) fillTechForm(techById(edit.dataset.editTech) || { id: edit.dataset.editTech });
  });
  $("#projPanel")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const newUnder = target.closest("[data-new-under]") as HTMLElement | null;
    const newSeries = target.closest("[data-new-series]") as HTMLElement | null;
    if (newUnder?.dataset.newUnder) {
      event.stopPropagation();
      newEntry(newUnder.dataset.newUnder);
      return;
    }
    if (newSeries?.dataset.newSeries) {
      event.stopPropagation();
      setStatus("series creation is still handled from Firestore or seed scripts");
      return;
    }
    const row = target.closest(".proj-row") as HTMLElement | null;
    row?.closest(".proj-item")?.classList.toggle("open");
  });
  $("#adminFeed")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const edit = target.closest("[data-edit]") as HTMLElement | null;
    const vis = target.closest("[data-vis]") as HTMLElement | null;
    if (edit?.dataset.edit) {
      openForm(state.projects.find((project) => project.id === edit.dataset.edit), false);
    }
    if (vis?.dataset.vis) {
      toggleVisibility(vis.dataset.vis);
    }
  });
}

bind();
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setStatus("signed out");
    setAuthedChrome(false);
    $("#adminGate")?.removeAttribute("hidden");
    $("#adminApp")?.setAttribute("hidden", "true");
    $("#settingsApp")?.setAttribute("hidden", "true");
    return;
  }
  if (user.email !== adminEmail) {
    setStatus("signed in, not authorized");
    setAuthedChrome(false);
    await signOut(auth);
    return;
  }
  setAuthedChrome(true);
  $("#adminGate")?.setAttribute("hidden", "true");
  $("#adminApp")?.removeAttribute("hidden");
  $("#settingsApp")?.removeAttribute("hidden");
  setStatus("signed in");
  if ($("#adminApp")) {
    await loadMetadata();
    await loadTechnologies();
    await loadProjects();
  }
});
