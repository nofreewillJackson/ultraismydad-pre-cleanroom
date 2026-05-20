# artlu.ai — Astro rebuild UI handoff

This folder is the UI handoff for rebuilding **artlu.ai** as a static **Astro** site.

**The HTML files are the source of truth.** Each `.html` file in this folder is a
complete, self-contained, runnable mockup — open any of them directly in a browser.
They encode the exact layout, design tokens, responsive behavior, and interaction
logic. This document is the *map*: which file maps to which route, how the shared
design system works, and what behavior to preserve. When this doc and a file
disagree, the file wins.

There are **no screenshots** in this handoff by design — the HTML + CSS is exact,
and the responsive behavior lives in real `@media` queries you can read directly.

> **`INTERACTIONS.md`** (in this folder) is the detailed companion: a per-page
> checklist of every micro-interaction — hover states, transitions, scroll
> triggers, tooltips, toggles, default/empty states — with exact class names,
> durations, and thresholds. §5 below is the summary; `INTERACTIONS.md` is the
> acceptance checklist. Read it before rebuilding any page.

---

## 1. Goal

artlu.ai is a build-in-public "100 days / 100 features" tracker. It currently runs
as a client-rendered single-page React app (`src/` in the repo) — hard for search
engines to read and awkward to extend. The rebuild target:

- **Static Astro site**, SEO-first — every page server-rendered to HTML at build time.
- **One shared design system** across every page (see §3).
- **Two themes** (dark / light) switchable at runtime, persisted in `localStorage`.
- Same content model as today: projects → series → entries, plus journal entries
  and video bundles (see §7).

---

## 2. Route → file map

| Route | Purpose | Mockup file | Notes |
|---|---|---|---|
| `/` | Home — **stack view** (default) | `astro-stack-view.html` | Node-graph of the whole project. Pan/zoom canvas. |
| `/map` | Home — map view | `astro-map-view.html` | Same data as a vertical timeline canvas. |
| `/list` | Home — list view | `astro-list-view.html` | Plain compact list. The mobile-friendly view. |
| `/log` | Journal feed | `astro-log-view.html` | Substack-style list of journal entries. |
| `/log/[slug]` | Single journal entry | `astro-journal-entry-view.html` | Permalink for one entry; e.g. `/log/day-52-...`. |
| `/research` | Research feed | `astro-research-view.html` | Experiments; horizontal card strip. |
| `/project/[slug]` | Project detail | `astro-project-view.html` | Tabs: info / live demo / files. |
| `/video/[id]` | Video detail | `astro-video-view.html` **or** `astro-video-long-view.html` | One route — branch on bundle `format` (see §6). |
| `/admin` | Admin dashboard | `astro-admin-view.html` | Auth-gated. Manage projects, series, entries. |
| `/admin/settings` | Admin settings | `astro-admin-settings.html` | Auth-gated. Connections & automated processes. |

Notes on home: list / map / stack are three **view modes of the same homepage data**.
The stack view is the default landing page. The three share an identical header and
the `list / map / stack` nav pill switches between them. Keep all three crawlable as
distinct static routes.

`list` / `map` / `stack` link to each other via `location.href='astro-X-view.html'`
in the mockups — in Astro these become normal `<a href>` route links. Sub-pages
(project / journal entry / video) link "back" to `astro-list-view.html` — in Astro,
back to the appropriate index route.

---

## 3. Design system

Every mockup carries an **identical** token block in its `<head>`. Extract it once
into a shared layer (a global stylesheet or an Astro layout component) — do not
duplicate it per page.

### Themes

Themes are driven by a `data-theme` attribute on `<html>`:

```css
html[data-theme="dark"]  { --bg:#08090a; --surface:#0e0f11; ... }
html[data-theme="light"] { --bg:#e9eaec; --surface:#ffffff; ... }
```

Every color in every page is a `var(--token)` — **nothing is hardcoded** outside
those two blocks. Copy the full token list verbatim from any mockup (they all match;
`astro-log-view.html` is a clean reference). The canvas pages (`map` / `stack`) add a
few extra tokens (`--port`, `--wire`, `--grid-line`, `--timeline`, etc.) — keep those
scoped to those pages or add them to the shared set.

Core tokens: `--bg --surface --surface-2 --border --border-strong --border-hover
--text --text-bright --text-sub --dim --dimmer --green --green-bg --green-border
--blue --amber --amber-bg --node-shadow --font --mono`.

### Fonts

- **Dark theme** → `--font` is `IBM Plex Mono` (the whole UI is monospace).
- **Light theme** → `--font` is `Inter` (a Shopify-Polaris-style light look).
- `--mono` is always `IBM Plex Mono` (used for meta text, eyebrows, chips even in
  light theme).

Both load from one Google Fonts `<link>` (already in every file's `<head>`).

### Flash-free theme load

Every file has this in `<head>`, before any body render — keep it:

```html
<script>try{var _t=localStorage.getItem('artlu-theme');
if(_t)document.documentElement.dataset.theme=_t;}catch(e){}</script>
```

### Shared header (`.topbar`)

The public pages (list/map/stack/log/research and the sub-pages) share one header:
big `artlu.ai` brand + blinking cursor, a stacked identity (title + bio), a 2-line
progress block (`day X/100 · N shipped · M to go` + a weekly activity heatmap), and
a two-pill nav group (`list / map / stack / ◐` and `log / research`). The `◐` button
is the theme toggle. The header is `position:sticky` and gets a `.stuck` class +
shadow on scroll. The admin pages use a variant header (ADMIN badge, signed-in user,
settings + sign-out buttons).

---

## 4. Component inventory (suggested Astro components)

These recur across files — factor them into shared components:

- **`Header`** — public variant + admin variant.
- **`ThemeToggle`** — the `◐` button + `toggleTheme()`.
- **`NavGroup`** — the two segmented pills.
- **`ActivityStrip`** — the weekly shipping heatmap (`.pstrip` / `.pcell`).
- **`Canvas`** — the pan/zoom/drag world used by map + stack (SVG wires, nodes,
  date spine). Map and stack share the same port/wire system.
- **`markdown-lite`** — a tiny renderer (`inlineMd` / `renderBody` / `renderMd`)
  used for journal bodies and project descriptions. Handles paragraphs, `**bold**`,
  `*em*`, `[links]()`, inline `` `code` ``, `- ` bullet lists, and `**Section**`
  lines as sub-headings. (The live React app uses `react-markdown`; the mockups use
  this lite version — match whichever the rebuild standardizes on.)

---

## 5. Behavior notes

> Summary only — **`INTERACTIONS.md` has the exhaustive per-page breakdown** (200+
> concrete details). Treat that file's bullets as acceptance criteria.

### Theme toggle
`toggleTheme()` flips `html[data-theme]` between `dark`/`light` and writes
`localStorage['artlu-theme']`. The `<head>` script re-applies it on next load with
no flash. Persisted across every page.

### Navigation
The two nav pills route between the five top-level views. In the mockups this is
`location.href` to sibling files; in Astro use `<a href>`. No client-side router is
required — every page is its own static document.

### Canvas (map + stack views)
ComfyUI-style pannable canvas: drag background to pan, scroll to zoom, drag a node by
its header to move it, click a node to focus/expand. A `.world` element is transformed
with `translate(pan) scale(scale)`; connector wires are SVG bezier paths. Both pages
compute a **fit-to-width scale on load** so all columns are visible with no clipping.
Connector dots/pegs were intentionally removed (they were often inaccurate) — the
`.port` elements still exist in markup for wire-anchor math but are `display:none`.

### Filtering
- **List view** — filter chips by type (`everything / videos & episodes /
  builds & research`) and by project; clicking a major-project card also filters the
  timeline. Active chip = green.
- **Log view** — filter by author (`all / by the ai / by the human`).
- **Research view** — selecting a card minimizes the others and centers the active
  one; a back button restores the strip.

### Tabs (project detail)
`astro-project-view.html` has an `info / live demo / files` tab bar with a green
underline + dot on the active tab. **Default tab** = `live demo` when the project has
an embeddable live URL or an artifact, otherwise `info`. Tabs that don't apply are
omitted (no repo → no `files` tab). See `src/components/ProjectPage.jsx` for the
exact default-tab + tab-presence logic.

### Embeds
- Video pages embed YouTube/TikTok iframes.
- Project `live demo` tab embeds the live URL in an iframe (only for known
  embeddable hosts — see the `isEmbeddable()` allow/deny lists in
  `src/components/ProjectPage.jsx`).
- In the list/research views, demo/video iframes are **lazy-loaded** — `src` is set
  from a `data-src`/`data-pdemo` attribute only when the row is opened or the strip
  is scrolled into view. Preserve this; it keeps initial load light.
- Clicking a **video** node in the map/stack views routes to `/video/[id]`.

### Responsive
- The shared header collapses below **720px**: the identity text and progress block
  are hidden, the nav pills wrap, the brand shrinks. The canonical `@media
  (max-width:720px)` block is in `astro-list-view.html` — every page follows it.
- The **canvas views are not usable on a phone.** The intended behavior (already
  implemented in the bundled build, `../artlu-rebuild.html`): below 720px the
  map/stack routes fall back to the **list view**, which is fully responsive.
- Content pages (log, research, project, journal entry, video) reflow to a single
  column on narrow screens.

---

## 6. Video: short vs long

`/video/[id]` loads a video **bundle** (`public/videos/<id>/bundle.json`) and branches
on `bundle.format`:

- `format: "short"` → vertical 9:16 layout → `astro-video-view.html`.
  2-column: sticky 9:16 video (YouTube + TikTok) on the left; summary, recurring
  characters, beats grid, sources, transcript, pre-roll disclosure on the right.
- `format: "long"` (anything not `"short"`) → 16:9 layout → `astro-video-long-view.html`.
  Single column: 16:9 video, core message, style library, summary panel, chunks
  list (scene image + narration beats + audit badges + collapsible scene prompt),
  collapsible full transcript.

Reference: `src/components/VideoPage.jsx` — the default branch is long-form, the
`ShortPage` function is the short branch. Real bundle shapes live in
`public/videos/*/bundle.json` (e.g. `news-anime-bot-*` are shorts,
`spoolcast-dev-log-*` are long).

---

## 7. Data model & hierarchy

```
main project  →  series / subgroup  →  entry
```

- **Main project** — top-level (spoolcast, PipelineCPC, AdsMetri, VibeSkill,
  CostIntel, artlu.ai). Every entry rolls up to exactly one main project.
- **Series / subgroup** — optional grouping scoped to one project (e.g. *Aninews*,
  *spoolcast dev-log* under spoolcast). Created in the admin view.
- **Entry** — a shipped feature or a video episode. Belongs to a project, optionally
  to a series.

**Project** (Firestore `projects/{id}`): `name, desc, longDesc, stack[], status,
date, link, repo, media, tags[], screenshots[], files[], artifactHtml, embedHeight,
slug, visibility`. Detail rendering: `src/components/ProjectPage.jsx`.

**Journal entry**: `day (1–100), date, author ('ai'|'human'), title, body,
projectRefs[], tags[], visibility, slug`. Rendering: `src/components/JournalEntry.jsx`.

**Video bundle** (`public/videos/<id>/bundle.json`): `id, format, title, shippedAt,
durationSec, coreMessage, video{youtubeId,tiktokId,mp4Url}, style, summary, chunks[]
| beats[], sources[], transcript, …`.

The admin view's "main projects & series" tree (top of `astro-admin-view.html`) and
its entry form (pick main project first → series field then scopes to that project)
encode this hierarchy. New series are created from the admin view.

---

## 8. File visibility rules

A project's `files[]` each carry a `visibility`: `public` | `gated` | `private`.
The rule (see `src/components/ProjectPage.jsx`):

- **public** — shown to everyone, with content.
- **gated** — the file row is visible to everyone, but the content is locked
  ("content locked" — a deliberate teaser).
- **private** — **not rendered for the public at all.** Admin-only.

So the **public project page** (`astro-project-view.html`) shows only public + gated
files, and shows **no `[public]`/`[gated]`/`[private]` markers** — markers are
admin-only. The **admin** edits per-file visibility in the entry-edit modal's "files"
manager (`astro-admin-view.html`) — that's where all three states and the markers
appear. Don't leak private files or visibility markers onto public pages.

Entry-level visibility (`public`/`private`) is separate from file visibility — the
admin timeline has a per-entry public/private toggle ("entry visibility").

---

## 9. State examples — where to see each state

The handoff brief asked for these states. They are demonstrable directly in the
mockups (no separate screenshots needed):

| State | Where | How |
|---|---|---|
| Filters active | `astro-list-view.html` | Click a type/project chip, or a project card. |
| Project expanded | `astro-list-view.html` | Click a timeline row → inline detail expands. |
| Artifact / live-URL demo | `astro-project-view.html` | `live demo` tab — embeds the live URL in an iframe. |
| Files tab | `astro-project-view.html` | `files` tab — expandable repo tree. |
| Gated / private files | `astro-admin-view.html` | Open the entry-edit modal → the files manager. |
| Empty states | `astro-list-view.html` (filter to no matches), `astro-log-view.html` (filter to "by the human") | |
| Long video | `astro-video-long-view.html` | — |
| Short video | `astro-video-view.html` | — |

---

## 10. The bundled build

`../artlu-rebuild.html` (one level up, not in this folder) is a single self-contained
file that stitches the 6 public views together with in-page view switching — it
opens on the stack view and falls back to the list view on mobile. It is built by
`../build-bundle.cjs` from the same source mockups. It exists so the whole mockup can
be embedded in one iframe; it is **not** the Astro architecture — the Astro rebuild
should use real routes (§2), not an iframe shell.

---

## 11. Notes / known representative mocks

A few things in the mockups are **representative UI mocks**, not real data — the
rebuild should wire them to real sources:

- `astro-project-view.html` — the **files-tab repo tree** and the **info-tab file
  rows** are plausible stand-ins; no real repo was fetched. The live React
  `FileBrowser` pulls a real GitHub tree.
- Project **screenshots** are styled placeholder boxes.
- Video **chunk thumbnails** reference repo-relative image paths
  (`/videos/<id>/assets/...`) that only resolve once the `public/videos/` assets are
  deployed.
- Header **progress numbers** and the **activity heatmap** are sampled values — wire
  to the live project count / Firestore.

Everything else (journal bodies, project descriptions, video bundle data) is real,
pulled from the artlu.ai tracker and `public/videos/*/bundle.json`.
