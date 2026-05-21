# Stack view — mobile

Companion doc to `HANDOFF.md`. **Source of truth: `astro-stack-mobile-view.html`** — read the file. This doc is the brief.

---

## What it is

On desktop the stack view is a pannable ComfyUI-style canvas (`astro-stack-view.html`). That canvas does not work on a phone — the rebuild **hides the desktop canvas at `<= 720px`** and serves a purpose-built mobile view instead. `astro-stack-mobile-view.html` is that mobile view.

It is **not** a fallback to the list view. It is its own first-class screen — a tech-stack-first take on the same data: every tech in the build → every project using it → every feature, demo, and showcase under that project.

## Route + responsive behavior

- Lives at the **same `/stack` route** as the desktop canvas.
- Below `720px`, render the mobile view; above, render the desktop canvas.
- The mobile header has **`list / stack / ◐` only** — the `map` nav button is hidden on mobile (matches the existing `mobile-hide-map` pattern in `Header.astro`). Brand → `/list`.

## Data model — canonical sources

All data is real and lives in the tracker / repo. The mockup hard-codes a snapshot; the rebuild should pull from the live sources:

- **Techs** — `technologies` Firestore collection (id, name, category, aliases, sortOrder, visibility). The five categories drive the spectrum order: `frontend → api → data → infra → media`.
- **Projects** — `mainProjects` collection (id, name, desc, meta).
- **Features** — `projects` collection entries (the tracker calls every shipped thing a "project"; this view renders them as features under their parent `mainProject`). `kind: 'update' | 'series'`, `techs: [techId]`, `project: mainProjectId`, `date`, `sd` (sortable ISO).
- **Episodes** — entries with `series: <seriesId>` belong under that series. `yt` is the YouTube id used for the thumbnail and to pick a route (`orient: 'v'` → `astro-video-view.html` short, `orient: 'h'` → `astro-video-long-view.html` long).
- **Demos** — entries that are interactive showcases. Two shapes: `srcdoc` (inline HTML strings — `$/conv calc`, `rule-gate`, etc.) and `url` (real live URLs — `vsmockup-d.pages.dev`, `costintel-automator-demo.pages.dev`, `artluai.github.io/context-gate-ai-hallucination/`, `artluaiv2-mockup.pages.dev`).

The tile-meta computation (`metaForTech`) returns `{ projects, entries, lastProj, lastDate }` per tech — wire this to a Firestore aggregate or compute client-side on the entries list.

## UX — three levels, all in one route

### Level 1: home grid

- **Hero text** (top-left of the grid, spans 2 cols of row 1):
  - Title: `projects` (plain bold, no glyph).
  - Desc (mono, two lines via `<br>`):
    1. `Tap on a tech tile to view individual projects.`
    2. `Also check out List View.` — "List View" is a green underlined link to `astro-list-view.html`.
- The hero is **plain floating text** — no card, no border, no background. Anchored to the **top** of its grid cell (`align-self: start`).
- Above the grid sits a thin axis line: `▲ FRONT-END ─── BACK-END ▼` — full width, green + dimmer mono.
- Below the axis: **one continuous 4-col grid** of all 28 techs sorted FE → BE. Tiles flow without row breaks. The transition between categories is signaled by **(a) the dot color** flipping (green / blue / amber / text-sub / text-sub) and **(b) a thin uppercase mono label row** (`api`, `data`, `infra`, `media`) before the first tile of each new category. The first category (`front-end`) has no label — the axis line above covers it.
- Each tile: **96px tall uniform**, rounded, bordered `--surface` card. Top row = squared category dot + tech name. Bottom = mono meta on three lines — `N projects` / most-recent-project name / most-recent date. Empty techs (no features yet) render at `opacity: 0.5` with `no updates yet`.
- **Spacing rule when the hero needs more than one row's worth of height:** the grid uses `align-items: end`. Tiles in row 1 (React + Astro) keep their 96px height and sit at the **bottom** of the row; any extra height accumulates *above* the tiles (between them and the axis line / hero text), **not** below (between row 1 and row 2). The hero text itself has `align-self: start` so it stays top-anchored. The visual rhythm between tile rows stays uniform.

### Level 2: tech panel

- Tap a tile → panel zooms up from the tile's position (CSS `transform-origin` set to the tap point, `scale(0.18) → 1` over 260ms, eased).
- Compact head, **monochrome (same `--bg`)**, single bottom border:
  - Row 1: `← projects` back button + tech name + small category tag.
  - Row 2 (flush at the panel's left padding, not indented under the title): `N projects · N entries · last update may DD`.
- Below the head: a stack of **project pills** that use this tech. Each pill is a `.pcard` — bordered `--surface` card with a subtle `--surface-2` header band (just the title row), then a body with description + meta + per-project counts of features & demos.
- Tap **anywhere** on a project pill (header or body) to toggle its expansion. The caret rotates.

### Level 3: project expansion (inline)

When a project is expanded, its children pills appear **directly below the project card, full-width, with a connector wire**. No third zoom panel — everything happens on the tech panel.

- **One short vertical wire** from the project pill straight down to the first direct child. `1.4px` wide, `--wire` color, `0.7` opacity (matches the desktop SVG bezier stroke). This is the **only** wire — there are **no inter-sibling wires** within a group.
- **Direct children of project** are full-width, no indent. Order:
  1. **Demos** (`.dcard`) — amber header band + iframe embed + foot. Embeds load real URLs where they exist (`vsmockup-d.pages.dev` etc.) or inline `srcdoc` for the small synthetic demos. Iframe defaults to `9/16` aspect; inline `srcdoc` demos use `4/3` via the `.wide` class.
  2. **Updates** (`.fcard`) — surface-2 header band + description + meta with status pill + tech list.
  3. **Series** (`.fcard.series`) — amber header band, `series` tag. Followed by its episode group.
- **Episodes** under a series:
  - **Slightly indented** (`padding-left: 22px` on `.ep-group`) — that indent IS the visual signal they belong to the series above. **No wire** between series and episode group (we tried; the misalignment looked worse than no wire).
  - No wires between sibling episodes either.
  - Each ep-row has a YouTube thumbnail (`img.youtube.com/vi/{yt}/hqdefault.jpg`, narrow `9:16` crop for vertical shorts via the `.v` class) and links out to the matching video page.
- **Between two consecutive series** under the same project (e.g. Aninews → dev-log under spoolcast), a thin **horizontal rule** (`hr.series-sep`) appears with equal `14px` top + bottom margins. Only visible when the project is expanded (it's inside `.expand-children`, which is `display: none` by default).

## Design system

All tokens come from the same `html[data-theme]` blocks the rest of the design system uses. Specific to this view:

- **Surfaces (dark-theme contrast bumped):** `--bg: #040506`, `--surface: #13161a`, `--surface-2: #1a1e23`. The bg was darkened and the surface lightened so tiles read as visibly raised against the page in dark mode — matching the contrast light mode already had. Light theme surfaces unchanged.
- Borders: `--border`, `--border-strong`, `--border-hover`
- Text: `--text`, `--text-bright`, `--text-sub`, `--dim`, `--dimmer`
- Accents: `--green` / `--green-bg` / `--green-border` (project, status, link), `--blue` (api dots), `--amber` / `--amber-bg` / `--amber-border` (series, demos, data)
- **`--wire`** — the connector color (`#2b3038` dark / `#a8adb5` light). Used for the project→children wire at `1.4px` stroke, `0.7` opacity. Matches the desktop stack-view SVG bezier strokes.
- **`--grid-line` / `--grid-dot`** — new tokens for the ComfyUI-style grid background applied to `.home`. Dark: `#0b0d10` / `#181b20` (faint). Light: `#dee1e3` / `#cdd1d4` (very subtle, just enough to give the bg texture). The pattern is the same one the desktop canvas uses: 1px line grid every 160px + tiny dots every 32px.

Fonts: dark = IBM Plex Mono throughout. Light = Inter for prose + IBM Plex Mono for meta/labels (same as every other view). Theme persisted in `localStorage['artlu-theme']`, flash-free via the `<head>` inline script.

## Behaviors

- **Tap a tile** → zoom into tech panel (CSS `transform-origin` = tile center).
- **Back arrow / Escape** → close tech panel.
- **Tap anywhere on a project pill** → toggle expansion. Caret rotates 180°. Clicks inside `.expand-children` don't bubble up (so tapping an episode opens the video page instead of collapsing the project).
- **Tap an episode row** → opens `astro-video-view.html` (Aninews / shorts) or `astro-video-long-view.html` (dev-log / widescreen). In the rebuild this becomes `/video/[id]`.
- **Tap a demo's `open ↗` link** → opens the live URL in a new tab.
- **Tap the `List View` link in the hero desc** → navigates to `/list`.
- **Theme toggle** (`◐`) → flips `data-theme`, persists in localStorage.
- **Sticky top bar** — gets `.stuck` (bottom border + shadow) once the home scrolls > 6px.

## Notes / pitfalls (things we tried that didn't work — don't re-introduce)

- **Don't fall back the `/stack` route to the list view on mobile.** This view IS the mobile stack view. List view is a separate route.
- **Don't add a full row break between categories.** Tiles flow continuously; the only between-category visual is the thin label row + the dot color change. Anything more makes the spacing feel "broken into chunks."
- **Don't use floating absolute-positioned category supertexts that hover above tiles.** They overlap the previous row tile's bottom and look broken. The thin label row is the right answer.
- **Don't add inter-sibling wires** inside `.expand-children`. The connector visual is intentionally **one wire per parent→children group**, not a chain. Indent + grouping carry the rest.
- **Don't put a wire between a series and its first episode.** We tried both positions (container-centered = misaligned with the indented ep-group; ep-group-centered = misaligned with the series above). Neither read cleanly. The indent alone conveys hierarchy.
- **Don't restore the green `--green-bg` tint on `.pcard-h`.** The current `--surface-2` band is the deliberate "subtle highlight" — light enough to be a card pattern, not a category accent.
- **Don't introduce a new category vocabulary.** The 5 labels (`frontend / api / data / infra / media`) are the same set the admin's `technologies.category` field uses.
- **Don't make a level-3 zoom panel** for project detail. Project content expands inline in the tech panel.

## Notes for the rebuild

- The home tile meta (`N projects · most-recent project · most-recent date`) turns a static tech list into a "what's been shipping with this" summary. Compute from the entries list, not from a stale field on the tech doc.
- The 5 category labels map directly to the canonical `technologies.category` set. Same admin form, same Firestore values.
- Live demo embeds: the URLs in the mockup are real and embed cleanly today. If any of them start refusing `X-Frame-Options`, fall back to a screenshot + "open ↗" link without breaking the layout.
- The mobile short-video page (`astro-video-view.html`) — episodes link out to this — has a `@media (max-width: 720px)` block that collapses its 2-col layout to one column, beats grid 2→1, sources stack. That's already in the file.
