# Mobile stack — category stats + first-category label + final tally

Companion doc to `STACK-MOBILE.md`. **Source of truth: `mockups/astro-stack-mobile-categorystats-mockup.html`** — read the file. Both light and dark are shown side-by-side in that mockup.

This is a **UI-only** update. Do not touch Firestore, data syncing, project grouping, stack resolution, admin, desktop stack, list, map, log, or research behavior.

---

## What changes

Three deltas on the mobile stack home (`<=720px`, `/` route, `MobileStackView.astro`):

1. **Category header stats.** Each category section label now carries a compact, single-line stats trio inline next to the category name.
2. **First category label.** Add the `FE` label above the first frontend tile group, with the same treatment as the other category labels — but positioned in cols 3–4 so its left edge lines up with the first tile, not with the hero text.
3. **Final tally.** A compact total row sits below the last tile group.

Plus one **bug fix** spotted during the design pass:

4. **Media tile-dot color** — was `var(--blue)`, now `var(--text-sub)` to match the media category label color (every other category already has matching label + dot colors).

Everything else — tile CSS, tile text alignment, hero typography, axis row, panel CSS — is untouched.

---

## Counting definitions (canonical — implement exactly)

All counts come from the static tracker snapshot at build time. Compute in the page that prepares `mobileStackData` (likely `src/pages/index.astro`), not client-side.

A category owns a fixed set of `techIds` — every tech whose `category` field is that category. Define them in code or pull from the existing `mobileTechs` array.

For each category `C`:

- **Projects (`C`)** = count of unique `projectId` values across all items (demos + updates + series) whose `techIds` intersect `C`'s tech ids. Deduplicate by `projectId` — a project that uses multiple techs in the same category counts **once**.
- **Updates (`C`)** = count of unique update items (those with `type === 'update'`, i.e. not demos and not episodes and not series headers) whose `techIds` intersect `C`'s tech ids. Deduplicate by item id — a single update that touches multiple techs in the same category counts **once**.
- **Demos (`C`)** = count of unique demo items (`type === 'demo'`) whose `techIds` intersect `C`'s tech ids. Same dedup rule.

For the bottom tally:

- **Total projects** = count of unique `projectId` across all items in `mobileStackData.items` (and `mobileStackData.childrenByProject`, if any items live there but not in `items`).
- **Total updates** = count of unique update items across the whole mobile stack snapshot.
- **Total demos** = count of unique demo items.

Series items and episodes are **not** counted in "updates" or "demos". They are their own kind. If a series happens to be the only thing tying a project to a category, the project still counts under "projects" for that category (because a project with a series uses tech ids).

These five categories drive the spectrum order and must match `technologies.category` exactly: `frontend → api → data → infra → media`. Do not introduce new categories or an `other/unmapped` group.

---

## UX details

### Category label row

- The label remains a single `.mobile-cat-label` element at `grid-column: span 4`, font-family mono, font-size 8.5px, letter-spacing 1.3px, uppercase, padding `3px 2px 0`.
- The category name (`api`, `data`, `infra`, `media`) is rendered first. Then a `<span class="cat-stats">` is appended on the same line.
- The stats span uses `color: inherit` so the whole row is one tone — same color as the section title. No separate label/value colors.
- Numbers inside `<b>` go to `font-weight: 600` to read as data. Separator dots use `color: inherit; opacity: 0.55`.

### Full vs shorthand labels

- **`api`, `data`, `infra`, `media`** use the full words: `projects N · updates N · demos N`. These labels span all 4 columns; there's plenty of room.
- **`FE` (the first frontend label)** uses the shorthand: `proj N · upd N · demo N`. It sits in the narrower 2-col slot next to the hero (cols 3–4), so the full words would wrap.

This is the only case where the shorthand is used. Do not abbreviate the others.

### First-category label — placement

- The first cat-label gets a `.first` modifier class.
- Its `grid-column` is overridden to `3 / -1` (cols 3–4 only) so it sits above the React tile.
- No extra left padding: the `FE` label lines up with the first tile's outer left edge.
- The hero (`.mobile-hero-text`) gets `grid-row: 1 / span 2` so it spans rows 1 and 2. This frees row 1 cols 3–4 for the cat-label while keeping the hero anchored to the top of the grid.

### Hero vertical alignment

- The hero block is **bottom-anchored** to the pill row: `align-self: end`.
- The hero has `min-height: 96px` (= the pill height) so by default the "projects" title's top edge lines up with the React pill's top border.
- The hero's existing `padding-top: 6px` is removed (new padding: `0 4px 4px`) so the title hugs the top of the hero block.
- The grid gets `grid-template-rows: min-content 96px` — row 1 is sized to the cat-label, row 2 is locked at 96px.
- **Why this matters:** when the description text is short, the hero block is exactly 96px tall and the title sits at row-2 top, matching the pill. When the description grows to multiple lines, the hero block grows **upward** into row 1; the title and desc move up; **the pills do not move** because row 2 is locked at 96px. This keeps the layout stable as content varies.
- The `frontend` cat-label is also in row 1 but with `align-items: end` (the grid default), so when row 1 grows because of a long hero desc, the cat-label tracks down with row 1's expansion and never overlaps the pills.

### Final tally

- Sits below the `.mobile-tech-grid`, inside `.mobile-stack-home`.
- Single element `.mobile-final-tally`, centered, mono, font-size 9px, letter-spacing 1.3px, uppercase.
- Hairline border above (`border-top: 1px solid var(--border)`) so it's clearly separated from the last tile row.
- Format: `total · 7 projects · 11 updates · 4 demos`. Numbers inside `<b>` go to `--text-bright`. Separator dots use `--dimmer`.
- Same dim treatment as the axis row at the top of the home — the whole home is bookended by quiet mono labels.

### Media tile-dot color fix

- Existing live code:
  ```css
  .mobile-tile.media .mobile-tdot { background: var(--blue); }
  .mobile-cat-label.infra,
  .mobile-cat-label.media       { color: var(--text-sub); }
  ```
  Media's dot was blue but its label was dim gray — the only category with mismatched label/dot colors.
- Change to:
  ```css
  .mobile-tile.media .mobile-tdot { background: var(--text-sub); }
  ```
- Reads as "media sits at the deepest end of the back-end spectrum, same dim treatment as infra." Category order: green → blue → amber → gray → gray, a clean dim-as-you-go-back-end gradient.

---

## CSS changes (apply to `src/components/MobileStackView.astro`)

All changes go inside the `@media (max-width:720px)` block. Add only the rules below; do not modify existing rules outside this list.

```css
/* delta 1 — give the frontend label a colored title to match the other categories */
.mobile-cat-label.fe { color: var(--green); }

/* delta 2 — modifier for the first cat-label only: cols 3-4, aligned to the first tile edge */
.mobile-cat-label.first { grid-column: 3 / -1; padding-left: 0; }
.mobile-cat-label.first .cat-stats { margin-left: 5px; }

/* delta 3 — the stats span: inherits the section title color so the whole row is one tone */
.mobile-cat-label .cat-stats { color: inherit; font-weight: 400; margin-left: 7px; }
.mobile-cat-label .cat-stats b { color: inherit; font-weight: 600; }
.mobile-cat-label .cat-stats .sep { color: inherit; opacity: 0.55; margin: 0 5px; }

/* delta 4 — lock the first two grid rows: row 1 cat-label only, row 2 pill height */
.mobile-tech-grid { grid-template-rows: min-content 96px; }

/* delta 5 — hero bottom-anchors to the pill row; default min-height matches the pill so
   the title's top aligns with the pill's top edge; long desc grows the hero upward, pills stay put. */
.mobile-hero-text {
  grid-row: 1 / span 2;
  align-self: end;
  min-height: 96px;
  padding: 0 4px 4px;   /* was: 6px 4px 4px — top padding removed so title hugs the block top */
}

/* delta 6 — the final tally at the bottom of the home */
.mobile-final-tally {
  margin-top: 18px;
  padding: 10px 2px 2px;
  border-top: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: var(--dim);
  text-align: center;
  line-height: 1.4;
}
.mobile-final-tally b { color: var(--text-bright); font-weight: 600; }
.mobile-final-tally .sep { color: var(--dimmer); margin: 0 5px; }

/* delta 7 — media tile-dot fix */
.mobile-tile.media .mobile-tdot { background: var(--text-sub); }   /* was: var(--blue) */
```

**Remove** the old `.mobile-hero-text { ... align-self: start; ... padding: 6px 4px 4px; }` so the new rule above takes over cleanly. Do not leave both.

---

## Markup changes

In `MobileStackView.astro`'s `renderHome()` function (the script that builds the home grid):

### Add the frontend label as the FIRST grid item

It must precede the hero block. Add the `first` class.

```js
let html = `<div class="mobile-axis-row">...</div><div class="mobile-tech-grid">`;

// === NEW === frontend (first) cat-label, in cols 3-4 above React
const feStats = statsForCategory("frontend");
html += `<div class="mobile-cat-label fe first">fe<span class="cat-stats">proj <b>${feStats.projects}</b><span class="sep">·</span>upd <b>${feStats.updates}</b><span class="sep">·</span>demo <b>${feStats.demos}</b></span></div>`;

// hero (unchanged markup)
html += `<div class="mobile-hero-text">...</div>`;

// tiles loop — previousCategory starts as "frontend" so the loop does NOT emit a second
// frontend label when it hits the first frontend tile
let previousCategory = "frontend";
for (const tech of mobileData.techs) { ... }
```

The loop already only emits a cat-label when `tech.category !== previousCategory && previousCategory`. Pre-setting `previousCategory = "frontend"` means the first frontend tile (React) won't trigger a duplicate label.

### Existing category labels — append stats

Inside the tiles loop, when emitting the cat-label for `api`, `data`, `infra`, `media`, append a `.cat-stats` span using the full words (not the shorthand):

```js
const stats = statsForCategory(tech.category);
html += `<div class="mobile-cat-label ${catCls(tech.category)}">${catLabel(tech.category)}<span class="cat-stats">projects <b>${stats.projects}</b><span class="sep">·</span>updates <b>${stats.updates}</b><span class="sep">·</span>demos <b>${stats.demos}</b></span></div>`;
```

### Final tally after the grid

After the `</div>` that closes `.mobile-tech-grid`:

```js
html += `</div>`;  // close .mobile-tech-grid
const total = totalStats();
html += `<div class="mobile-final-tally">total<span class="sep">·</span><b>${total.projects}</b> projects<span class="sep">·</span><b>${total.updates}</b> updates<span class="sep">·</span><b>${total.demos}</b> demos</div>`;
```

### Helper functions

`statsForCategory(category)` and `totalStats()` should be computed once per render (or pre-computed in `src/pages/index.astro` and shipped with `mobileStackData` if that's cleaner). A minimal implementation:

```js
function statsForCategory(category) {
  const techIds = new Set(mobileData.techs.filter(t => t.category === category).map(t => t.id));
  const inCat = (item) => item.techIds.some(id => techIds.has(id));

  const projects = new Set();
  const updateIds = new Set();
  const demoIds = new Set();

  for (const item of mobileData.items) {
    if (!inCat(item)) continue;
    if (item.projectId) projects.add(item.projectId);
    if (item.type === "demo") demoIds.add(item.id);
    else if (item.type === "update") updateIds.add(item.id);
    // series and episodes are not counted as updates or demos
  }

  return { projects: projects.size, updates: updateIds.size, demos: demoIds.size };
}

function totalStats() {
  const projects = new Set();
  const updateIds = new Set();
  const demoIds = new Set();
  for (const item of mobileData.items) {
    if (item.projectId) projects.add(item.projectId);
    if (item.type === "demo") demoIds.add(item.id);
    else if (item.type === "update") updateIds.add(item.id);
  }
  return { projects: projects.size, updates: updateIds.size, demos: demoIds.size };
}
```

If `mobileData.items` doesn't include series at the top level but `mobileData.childrenByProject` does, also walk that bucket for the projects count (series ownership of a project still implies the project uses techs in the relevant category).

**Optional optimization:** precompute these in `src/pages/index.astro` and ship them as `mobileStackData.categoryStats` and `mobileStackData.totalStats` so the runtime doesn't recompute on every `renderHome()` call. The mobile-stack home only renders once per page load, so this is not required for performance — but it keeps `MobileStackView.astro` purely presentational, which matches the rest of the static-build philosophy.

---

## Things to NOT do

- Do **not** add dots, glyphs, icons, or any decoration before category names. The labels are plain text with a category color. Nothing else.
- Do **not** put the category stats on a second row. Single line only.
- Do **not** change tile sizing, tile text alignment, the `-webkit-line-clamp: 2` on `.mobile-tname`, or any other tile CSS. The tiles are untouched.
- Do **not** make the topbar / nav two rows. `Header.astro` is not changed.
- Do **not** introduce a card-in-a-card pattern for the stats. They sit inline inside the existing label element.
- Do **not** introduce a new accent color. Stats inherit the section title color. Final tally uses `--dim` / `--text-bright` from the existing palette.
- Do **not** abbreviate `api`, `data`, `infra`, or `media` labels. Only `frontend` uses the shorthand because it sits in the narrow 2-col slot.
- Do **not** add a second `frontend` label inside the tiles loop. Pre-set `previousCategory = "frontend"` so the loop skips it.
- Do **not** count series headers or episodes as "updates". Series and episodes are their own kinds.
- Do **not** reintroduce `other / unmapped` to satisfy any count.

---

## Verification

```bash
npm run validate:stack
npm run build:strict
```

Then visually:

- Open the built site on a mobile viewport (`<= 720px`) or DevTools device-mode.
- First label reads `FE  proj N · upd N · demo N` in green, sitting above the first tile, left edge aligned with that tile's outer left edge.
- The "projects" hero title's top edge sits at the same y as the React tile's top border.
- Drag the desc longer (or imagine a longer desc) — pills do not move; title and desc rise upward into row 1's area; the FE cat-label slides down with row 1 to stay above the pills.
- `api / data / infra / media` labels span the full width with `projects N · updates N · demos N` in their respective colors (blue / amber / dim / dim).
- Media tiles have a **dim gray** dot (not blue) — consistent with the media label color and with the infra category.
- Below the last tile (`WhisperX`), a hairline border, then `TOTAL · X projects · Y updates · Z demos` centered.
- Tapping any tile still opens the same tech panel. Tapping a project pill still toggles expansion. Nothing in the panel changed.

---

## File summary

| File | Change |
|---|---|
| `src/components/MobileStackView.astro` | Add the 7 CSS rules in the delta block. Update `renderHome()` to add the first `frontend` cat-label, append `.cat-stats` to every cat-label, and emit `.mobile-final-tally` after the grid. Add `statsForCategory()` and `totalStats()` helpers (or import precomputed stats from `mobileStackData`). |
| `src/pages/index.astro` | **Optional.** Precompute `categoryStats` and `totalStats` and add to the `mobileStackData` object so `MobileStackView.astro` stays purely presentational. Not required. |

That's the entire scope. No other files. No data migrations. No Firestore writes.
