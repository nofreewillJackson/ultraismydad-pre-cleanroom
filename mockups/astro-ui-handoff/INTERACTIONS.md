# artlu.ai — interaction details

Companion to `HANDOFF.md`. The `.html` files are the source of truth; this is the
checklist of **micro-interactions** the Astro rebuild must reproduce — hover states,
transitions, scroll triggers, tooltips, toggles, defaults, empty states. These are
easy to silently drop in a rebuild; treat each bullet as an acceptance criterion.

Class names, px values, durations, and thresholds below are quoted from the source.

---

## A. Shared across all pages

**Blinking brand cursor**
- `.cursor-bl` — 10×26px green block after the `artlu.ai` wordmark.
  `animation:blink 1s step-end infinite`; `@keyframes blink { 50% { opacity:0 } }`
  — a hard on/off blink (no fade, because `step-end`).

**Theme**
- `<html data-theme="dark">` default. An inline `<script>` in `<head>` runs before
  paint: reads `localStorage['artlu-theme']` and applies it — prevents a flash.
- `toggleTheme()` (the `◐` button) flips `data-theme` dark↔light and writes
  `localStorage['artlu-theme']`. The swap is instant — every color is a CSS variable,
  no color-property transition.
- Light theme switches `--font` to Inter; dark uses IBM Plex Mono. On the canvas
  pages, light theme also sets the grid line/dot tokens to `transparent` (no grid).

**Sticky header**
- `.topbar` — `position:sticky; top:0; z-index:40; height:72px`, base
  `border-bottom:1px solid transparent`, `transition:background .16s, border-color
  .16s, box-shadow .16s`.
- Content pages (list/log/research/project/journal/video): a scroll handler toggles
  class `.stuck` when `window.scrollY > 6`. `.stuck` → `background:var(--surface)`,
  `border-bottom-color:var(--border)`, `box-shadow:var(--node-shadow)`. The handler
  runs once on load. Listener is `{passive:true}`.
- Canvas pages (map/stack): `.stuck` is toggled inside `apply()` from the pan offset
  — map uses `pan.y < 8`, stack uses `pan.y < 12`.
- **Exception:** `astro-admin-settings.html` has a static `border-bottom` and **no**
  `.stuck` behavior at all.

**Nav pills (`.seg`)**
- The active view's button has class `.on` → `background:var(--green-bg);
  color:var(--green)`. Inactive buttons are `var(--dim)`, navigate via
  `location.href`. (In Astro these become `<a href>` route links.)

**Activity heatmap (`.pstrip` / `.pcell`)**
- 20 cells, 9×9px, `border-radius:2px`. Non-zero levels get `background:var(--green)`
  with `opacity = 0.3 + lv*0.17` (intensity ramp); zero cells stay `var(--border)`.
- Hover: `outline:1.5px solid var(--text-sub); outline-offset:1px` **and** an
  `::after` tooltip from `data-tip` ("week of <date> · N shipped"), positioned
  `top:17px; left:50%; translateX(-50%)` (below, centered), `surface-2` bg,
  `border-strong`, `border-radius:5px`, `box-shadow`, `z-index:60`,
  `pointer-events:none`.
- **Exceptions:** on `astro-research-view.html` and `astro-video-view.html` the
  heatmap is decorative — no `:hover` rule, no `data-tip`, no tooltip.

---

## B. Per-page

### astro-list-view.html

- Major-projects strip `.proj-strip` — `overflow-x:auto`, `scroll-behavior:smooth`,
  scrollbar fully hidden (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`).
- `.pmod` cards — `transition:border-color .14s, transform .14s, box-shadow .14s`.
  Hover: `border-color:var(--border-hover)` **and** `transform:translateY(-2px)`
  (lift). Active (`.pmod.active`): green ring
  `box-shadow:0 0 0 2px var(--green-border), var(--node-shadow)`.
- Click a project card → toggles `projFilter` (clicking the active card clears it),
  re-renders the filter bar + feed, syncs the active ring, then
  `scrollIntoView({behavior:'smooth'})` to the timeline heading. Clicks on `<a>`
  inside a card are ignored.
- Strip scroll buttons — `.strip-btn.l` is hidden until not at the left edge (gains
  `.show`); `.strip-btn.r` gains `.off` (hidden) at the right edge. Hover: text
  `var(--dim)` → `var(--text-bright)` (`transition:color .12s`). Click →
  `scrollBy({left:±340, behavior:'smooth'})`.
- Edge gradient fades `.strip-fade.l/.r` — 54px wide, `transition:opacity .18s`;
  faded out when scrolled within 10px of that edge. `syncArrows()` runs on scroll,
  resize, load.
- Filter chips `.fchip` — `transition:all .12s`; hover `border-color:var(--border-hover)`;
  active `.on` → green bg/text/border. Type chips set the filter; project chips
  toggle (click active = clear).
- Default state: `typeFilter='all'` (the `everything` chip is `.on`), `projFilter=null`.
- Timeline rows `.r` — `cursor:pointer`, `transition:background .1s`, hover
  `background:var(--surface-2)`. Clicking a row toggles `.item.open` — open rows
  keep the `surface-2` background; the `.caret` (▶) rotates 90°
  (`transition:transform .14s`); `.detail` switches `display:none`→`block` (no
  height animation).
- **Lazy embeds:** when a row first opens, `iframe[data-src]` gets its `src` set from
  `data-src`. Project-card demo iframes get `src` from `data-pdemo` on render; they
  are `pointer-events:none`, `tabindex="-1"`, `transform:scale(0.5)`.
- Placeholder links inside the detail (`href="#"`) `preventDefault()`.
- Empty state: no matches → `<div class="empty">no entries match this filter.</div>`.
- Responsive `@media (max-width:720px)`: body 14→13px; header collapses (auto height,
  wraps, `.identity` + `.progress` hidden, brand 29→22px); strip buttons
  `display:none` (touch-scroll only); `.pmod` 322→286px; date spine tightens
  (`.tl::before`/`.day-pill` left 66→40px, `.day-rows` margin-left 106→60px);
  `.r-stack` (tech column) hidden; detail embeds go full width.
- This is the **only content page with a responsive `@media` block** — see §C.

### astro-log-view.html

- Entries are **static** — no expand/collapse, every body fully visible (substack
  reading column, `max-width:660px`). Each `.entry` has a bottom border (last one
  none).
- Filter chips `all / by the ai / by the human` — `.fchip` hover + `.on` styling as
  list view. Default `filter='all'`. Clicking a chip re-renders (no toggle-off).
- `.fcount` shows "N entry"/"N entries" (singular at 1).
- `.ref` reference chips — `href="#"` no-ops; hover `border-color:var(--green)`.
  `.tag` chips are non-interactive.
- Empty state (filter "by the human" with no matches) → fixed copy:
  `no entries by the human yet — every entry so far is written by the AI.`
- **No `@media` block** — header does not collapse on mobile.

### astro-research-view.html

- Card strip `.r-strip` — `overflow-x:auto`, smooth, scrollbar hidden. Edge fades
  `.strip-fade.l/.r` (56px, `transition:opacity .18s`) shown when scrolled past 8px.
  **No scroll-arrow buttons** (unlike list view).
- `.r-card` — `transition:border-color .14s, transform .14s, box-shadow .14s,
  flex-basis .22s` (note: `flex-basis` is animated). Hover: `transform:translateY(-2px)`
  only — **no border change** (differs from list view's `.pmod`).
- Click a card → `selectCard(i)`: clicked card gets `.active` (green ring); all
  others get `.min` (`display:none` — they disappear, not dim); the strip gets
  `.solo` (`justify-content:center` — the surviving card centers); the reading panel
  `#readWrap` gets `.show` (`display:block`).
- `← all experiments` back button → `browse()`: removes `.active`/`.min`/`.solo`/
  `.show` — all cards reappear, panel hides. Hover: `color:var(--text-bright)`,
  `border-color:var(--border-hover)`.
- Card embeds: demo iframes get `src` from `data-demosrc`; artifact iframes get
  `srcdoc` from an inline HTML string — both on render. `.rc-visual iframe` is
  `pointer-events:none` (the whole card takes the click).
- Reading panel uses a markdown-lite renderer (`**Heading**` lines → `<h4>`, etc.).
- Default state: nothing selected, all cards visible, panel hidden, strip not `solo`.
- **No `@media` block**.

### astro-map-view.html  (pan/zoom canvas)

- **Pan:** `mousedown` on the viewport background (not on a `.node`) → `panning`,
  viewport `cursor:grab`→`grabbing`, `.world` gets `.busy`. `mousemove` updates
  `pan` and re-applies `transform: translate(pan) scale(scale)` on `.world`
  (`transform-origin:0 0`). Pan is **unbounded**. `.world.busy iframe {
  pointer-events:none }` — disables YouTube iframes mid-drag.
- **Zoom:** `wheel` (`preventDefault`) → zoom-to-cursor; the point under the cursor
  stays fixed. Sensitivity `scale - deltaY*0.0013`. Scale clamp **0.3–1.5**.
- **Node drag:** only from the node header (`[data-handle]` on `.nhead`).
  `e.stopPropagation()` prevents panning. Drag delta divided by `scale` so it tracks
  the cursor 1:1. `.node.dragging` → `z-index:25` + heavy shadow
  `0 16px 42px rgba(0,0,0,0.8)`. Group nodes (`.sub`/`.proj`) have no `data-handle`
  — not draggable; their header cursor is `pointer`.
- **fit-to-width:** `resetView()` computes
  `scale = clamp((vp.clientWidth-48)/(right+40), 0.4, 0.92)` and `pan={x:18,y:14}`.
  Runs on `init()` and `window.load`.
- **Node click** (mouseup, only if not dragged — `|dx|+|dy| > 5` counts as a drag):
  a feature with `type==='video'` → `location.href='astro-video-view.html'`;
  otherwise `openPanel(id)`.
- **Detail panel** `.panel` — fixed `width:466px`, hidden at `translateX(102%)`,
  open at `translateX(0)`, `transition:transform .22s cubic-bezier(.2,.7,.2,1)`.
  Selected node gets `.sel` → 2px `--border-hover` outline ring. Panel body scrolls;
  `scrollTop` reset to 0 on open. In-panel "chain" pills re-route the panel to
  another node. `.pill:hover` → green border. Close via `.p-x` (×).
- **SVG wires** — cubic-Bézier paths from each node's right edge to the next's left
  edge; fully redrawn on every pan/zoom/drag/reposition. `.port` peg elements are
  `display:none` (kept only as wire anchors).
- **Followers** (subgroup/project nodes) — `transition:top .12s ease-out, opacity
  .15s`; they vertically re-center on whichever member features are on-screen, and
  fade to `opacity:0` when none are visible.
- `.node:hover` → `border-color:var(--border-hover)` (border only — **no** node
  dimming on this page).
- Zoom controls (bottom-right): `−`/`+` step `±0.14` about the viewport center;
  `fit` → `resetView()`.
- Date spine `.timeline` + per-date `.tick` pill labels; four `.col-head` column
  headers; a `.world-intro` text block re-aligned to the first tick.
- Default on load: fit scale, `pan={x:18,y:14}`, nothing selected, panel closed,
  header **not** stuck (`pan.y=14`, threshold `<8`).
- **No `@media` block** — see §C for the mobile-fallback requirement.

### astro-stack-view.html  (pan/zoom canvas)

- Pan / zoom as map view, with differences: zoom clamp **0.28–1.5**; sticky-header
  threshold `pan.y < 12`; `resetView()` uses
  `clamp((vp.clientWidth-52)/(right+34), 0.4, 0.92)`, `pan={x:24,y:18}`.
- **Node drag** — only from `[data-handle]` (`.nhead`/`.rhead`); drag is also
  aborted if it starts inside `.rrows` (the rolodex scroll region). Drag movement
  only applies *after* the 5px move threshold. **No** `.dragging` style (no z-index
  bump, no shadow) — differs from map.
- **Lineage focus (click)** — clicking a node → `relatedSet(id)` does a BFS over the
  wire graph for the whole connected lineage; `applyFocus()` adds `.dimmed`
  (`opacity:0.16`, `transition:opacity .16s`) to every node *not* in that set; the
  clicked node gets `.sel`. Connector wires restyle: in-lineage wires →
  `--wire-on` (green), `stroke-width:2.4`; out-of-lineage wires → `opacity:0.12`.
- **Lineage focus (hover)** — hovering a `.node.rolodex` dims everything outside
  that rolodex's lineage. The whole rolodex module is one hover zone — moving the
  mouse between video cards inside it does not re-trigger/flash the focus.
  `mouseleave` clears it. Hover focus applies **only** to rolodex nodes; hover takes
  precedence over a clicked selection (`cur = hover || active`).
- **Rolodex modules** — `.node.rolodex` (492px) contains a horizontal-scroll
  `.rstrip` of video/demo cards. A `wheel` listener turns vertical wheel into
  horizontal scroll and `stopPropagation` so it doesn't zoom the canvas. Hovering one
  `.rseries` row dims the *other* rows in that rolodex to `opacity:0.3`
  (`transition:opacity .15s`, CSS-only). `.vcard:hover` → `border-color`. Demo cards
  show a live `srcdoc` mini-app preview (`pointer-events:none`).
- **Rolodex click routing** — `[data-demo]` → `openPanel('d_'+id)`; `[data-vid]`
  starting `__all__` → opens the rolodex panel; other `[data-vid]` →
  `location.href='astro-video-view.html'`. These stop propagation so they don't
  trigger the node-level click.
- Detail panel `.panel` — `width:438px`, `transition:transform .24s
  cubic-bezier(.2,.7,.2,1)`. `closePanel()` also clears the lineage focus.
- Axes: a tech "front-end ▲ / back-end ▼" spectrum spine with per-category band
  chips, and a plain "newest ▲ / older ▼" date spine (no per-date pills). A
  `.world-intro` block aligned to the front-end axis cap.
- Default on load: fit scale, `pan={x:24,y:18}`, nothing focused, no dimming, panel
  closed, header not stuck.
- **No `@media` block** — see §C.

### astro-project-view.html

- Back link `.back` — green, `opacity:0.85`; hover `opacity:1` + underline.
- Link pills `.pill` — `transition:border-color .12s`; `a.pill:hover` →
  `border-color:var(--green)`. The `▶ demo` pill is a `.pill.static` span
  (`cursor:default`, no hover). Real pills open `target="_blank"`.
- **Tab bar** `info / live demo / files` — default active tab is **`live demo`**
  (markup ships `.on` on it). `.tab.on` → green text + 2px green bottom border (the
  underline); the tab's `.dot` (5px green circle) switches `display:none`→
  `inline-block`. Tab hover: `color`→`var(--text-sub)` (`transition:color .15s`).
  Click (delegated) swaps `.on` on the tab and shows the matching `.panel`
  (`display:none`→`block`).
- Tabs that don't apply are omitted (no repo → no `files` tab; no embeddable
  link/artifact → no `live demo`, and `info` becomes the default). See
  `src/components/ProjectPage.jsx`.
- Live-demo iframe `.demo-frame` — `src` the live URL, `loading="lazy"`, 600px tall.
- Info-tab file rows — `README.md` shows content in a `.file-pre`; a gated file
  shows a `.vis-locked` "locked" badge (amber) and `.file-locked`
  "content locked — unlock to read" instead of content. **No `[public]` marker** and
  **no private file** on the public page (see `HANDOFF.md` §8).
- Files-tab browser `.fb` — 480px split pane: scrollable tree (left) + viewer
  (right). Folders `.fb-fold` start collapsed; click toggles `.fb-children`
  (`display:none`↔`block`) and swaps the arrow `▸`↔`▾`. `.fb-item:hover` →
  `surface-2` (`transition:background .1s`). Clicking a file sets `.sel`
  (`green-bg`/`green`) — selection is visual only; the viewer keeps its
  `← select a file to view` placeholder (mock).
- Default state: `live demo` tab open, all tree folders collapsed, no file selected.
- Responsive `@media (max-width:720px)`: header collapses; `.demo-frame` 600→440px;
  `.fb` stacks to a column (tree on top, full width); `.tabbar` becomes
  horizontally scrollable; screenshots go full width.

### astro-journal-entry-view.html

- Single static entry — eyebrow (day · date · author with a 7px green dot), large
  `.e-title.page-h1`, body, `.e-foot` refs + tags.
- Back link `.backlink` — `transition:opacity .12s`; hover `opacity:0.75` (dims —
  note this is the *opposite* of the project page's back link). → `astro-log-view.html`.
- `.ref` chips `href="#"`, hover green border; `.tag` chips non-interactive.
- Prev/next nav — two `.navcell` cards (`.prev`, `.next`),
  `transition:border-color .14s, background .14s`, hover
  `border-color:var(--border-hover)`. `.next` is right-aligned.
- Responsive `@media (max-width:720px)`: header collapses; `.e-title.page-h1`
  30→24px; the prev/next pair stacks vertically and `.next` reverts to left-aligned.

### astro-video-view.html  (short video)

- Layout `.vgrid` — flex: fixed-width video column `.vleft` + flexible `.vright`.
  The video column is **not** sticky in this mock.
- YouTube embed (`?rel=0&modestbranding=1`, `allowfullscreen`) + TikTok embed
  (`allow="encrypted-media; fullscreen"`, `scrolling="no"`), each in a `.vframe`
  (`aspect-ratio:9/16`). Not lazy-loaded.
- Back link `.back` — bordered box; hover `color:var(--text-bright)` +
  `border-color:var(--border-hover)`.
- All sections (summary, beats grid, sources, transcript, pre-roll) are **static and
  always expanded** — no tabs, no collapsibles. Source attribution links open
  `target="_blank"` and underline on hover.
- The activity heatmap here has **no tooltip** (no `data-tip`, no `:hover`).
- Responsive `@media (max-width:720px)`: **only the header is restyled** — the
  two-column `.vgrid` and 2-col beat grid do **not** collapse to one column. Flag for
  the rebuild (see §C).

### astro-video-long-view.html

- Back link `.back` — bordered box; hover `color` + `border-color` brighten. →
  `astro-list-view.html`.
- Main YouTube embed `.vplayer` (`aspect-ratio:16/9`, `allowfullscreen`, full `allow`
  list). Style anchor / reference images use `loading="lazy"`; `.ref-desc` is clamped
  to 5 lines.
- **Per-chunk "scene prompt"** — each chunk has a `.prompt-toggle` button
  (`▸ scene prompt`); click toggles the `.prompt-box` (`display:none`↔`block`) and
  swaps the caret `▸`↔`▾`. Hover: `color:var(--text-bright)`. All start collapsed.
- **"full transcript"** — `.tr-toggle` full-width bordered button toggles `.tr-box`
  (`display:none`↔`block`), caret `▸`↔`▾`. Hover: `border-color:var(--border-hover)`.
  Starts collapsed.
- Chunk audit badges `.badge.pass` (green ✓) / `.badge.fail` (amber !) +
  `.badge.model`. Chunks with no beats render a `.beat-empty` "title card" line.
- Default state: all scene-prompt boxes + the transcript collapsed.
- Responsive `@media (max-width:720px)`: header collapses; `.v-title` 26→21px;
  `.ref-grid` 3-col→1-col; `.anchor-row` stacks; `.chunk` becomes single-column;
  `.sum-row` label column 140→100px.

### astro-admin-view.html

- Default state: both modals closed; every project-tree item and every timeline row
  collapsed; `onScroll()` runs once on load.
- **Projects & series tree** — `.proj-row` (`cursor:pointer`,
  `transition:background .1s`, hover `surface-2`); click toggles `.proj-item.open`,
  which rotates `.pr-caret` 90° (`transition:transform .14s`) and reveals
  `.proj-children` (`display:none`→`block`, instant). The `edit` button and the
  `+ new series under X` row `stopPropagation()` so they don't toggle the row.
  Series rows `.ser-row` hover `surface-2` but are **not** expandable.
- **Timeline rows** — same row hover + `.item.open` caret-rotate + `.detail` reveal
  as the public list view. The `.grip` (⠿) is `cursor:grab` but drag is **not
  implemented** (visual affordance only).
- **Per-entry visibility toggle** — the `●`/`○` `.vis-btn`; click `stopPropagation()`
  (does not toggle the row), flips `entry.vis` public↔private, updates the glyph and
  `vis-public` (green) / `vis-private` (dim) class. The detail's "visibility:" line
  does not live-update (only on full re-render).
- **Edit** button → `openForm(entry)` opens the entry modal in edit mode (title
  "$ edit entry", fields populated).
- **Modals** — `.overlay.open` → `display:flex` (centered). Close via cancel, save
  (save just closes — no persistence in the mock), or a backdrop click (only when
  `e.target` is the overlay itself, not the modal body). No ESC handler. The wide
  entry modal scrolls internally via `.modal-scroll` (`overflow-y:auto`), title and
  button row pinned, `max-height:90vh`.
- **Entry form project→series dependency** — `#f-series` and the `+ new` button
  start **disabled** (`opacity:0.45`, `cursor:not-allowed`). Picking a project in
  `#f-project` enables them and repopulates `#f-series` with only that project's
  series. Step badges "1"/"2" label the two stages.
- **Segmented toggles** (`.toggle`) — clicking a button moves `.on` to it; if its
  `data-v` is `private` or `subgroup` it also gets `.neutral` (a grey "on" state
  instead of green). Used for entry visibility and series kind.
- **Per-file visibility manager** (in the entry modal) — each `.file-mgr-row` has a
  3-button `.fm-vis` control; click moves `.on` and sets `data-fvis`. Active colors:
  public → green, gated → amber, private → grey/bright. `+ add file` prompts for a
  name and inserts a new row defaulting to `private`.
- **New-series modal** — live slug preview: `#s-name` `oninput` and `#s-parent`
  `onchange` call `updateSlug()`; `slugify()` lowercases, trims, collapses
  non-alphanumerics to `-`.
- Inputs: `:focus` → `border-color:var(--green-border)` (no outline).
- **No `@media` block** — fixed `max-width:1240px` layout; narrow viewports overflow.

### astro-admin-settings.html

- **No sticky-on-scroll** — the header has a static border, unlike every other page.
- Default: left-nav `connections` button is `.on`; only the `conn` `.s-section` is
  shown (`display:block`); `proc` and `general` hidden. All four panels are
  JS-populated on load.
- Left-nav `.s-nav` — `position:sticky; top:96px` (170px wide). Buttons: hover →
  `color:var(--text-bright)` + `background:var(--surface-2)`; active `.on` →
  `green-bg`/`green`. Click shows the matching section (instant `display` swap, no
  animation).
- Connection rows `.crow` — hover `background:var(--surface-2)`. Status dot
  `.cstat.on` is green with a `box-shadow:0 0 6px var(--green)` glow;
  `.cstat.idle` is amber, no glow.
- API keys are shown **pre-masked** in the data (e.g. `sk_live_••••4c91`) — there is
  **no reveal/unmask** interaction.
- `+ connect server` / `+ add key` / `+ new job` / `config` / `rotate` / `logs`
  buttons are visual only — **no click handlers wired** in the mock.
- General section toggles — `.switch` (42×23px pill); click toggles the `.off`
  class. The knob `.switch i` (18px circle) has `transition:.14s` (slides
  `left:1.5px`↔`21px`, color grey↔green). Date and `select` controls are native
  inputs.
- **No `@media` block** — fixed `max-width:1100px`; the 170px-nav + content row just
  compresses on narrow screens.

---

## C. Cross-page gotchas (easy to get wrong)

- **Responsive coverage is uneven in the mockups.** Only `astro-list-view.html` has a
  full responsive `@media` block. `astro-project-view.html`,
  `astro-journal-entry-view.html`, `astro-video-long-view.html`, and
  `astro-video-view.html` have `@media` blocks that **only restyle the header** (the
  short-video page doesn't even collapse its two-column grid). `log`, `research`,
  `map`, `stack`, `admin`, and `admin-settings` have **no `@media` block at all**.
  The rebuild should give every page a proper responsive pass — the header-collapse
  pattern in `astro-list-view.html` is the canonical reference.
- **Canvas mobile fallback is not implemented.** `map` and `stack` have no mobile
  handling. The intended behavior (already done in the bundled build
  `../artlu-rebuild.html`): below 720px the map/stack routes fall back to the list
  view. The rebuild must implement this.
- **Hover differs by page:** `.pmod` (list) changes border *and* lifts; `.r-card`
  (research) only lifts. Don't copy one onto the other.
- **Heatmap tooltips** exist on list / log / map / stack / video-long, but **not** on
  research or short-video. Match per page (or, better, standardize — but know the
  source differs).
- **Expand models differ:** list rows expand inline; log entries never collapse;
  research uses select-one / hide-others ("minimize"); project uses tabs; video-long
  uses per-section collapsibles. These are deliberate — don't unify them.
- **Map vs stack are not identical.** Different zoom clamps (0.3 vs 0.28), sticky
  thresholds (`pan.y<8` vs `<12`), panel widths (466 vs 438px) and transitions (.22s
  vs .24s); map bumps z-index + shadow on drag, stack doesn't; map has no node-dim
  focus, stack has full lineage dimming + a rolodex hover zone. Preserve both.
- **`save` buttons in the admin modals don't persist** — they just close. The mock
  has no backend; wire real writes in the rebuild.
- Several admin-settings buttons (`+ connect server`, `rotate`, `logs`, etc.) have
  **no handlers** — they're visual placeholders.
