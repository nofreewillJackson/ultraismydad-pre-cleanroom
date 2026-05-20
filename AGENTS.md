# AGENTS.md — artlu.ai

Instructions for any AI contributor (Codex, Cursor, Windsurf, etc.) working on this project. Read [personality.md](personality.md) before writing any journal content.

## Project

artlu.ai — 100 projects in 100 days. Terminal-style project tracker with journal system.
React + Vite + Firebase Firestore + Netlify. Domain: artlu.ai.

## Working Process

- Never make code changes without confirming first
- Show what you plan to change and get approval first
- Show mockups/visuals before building
- Don't spend lots of tokens without checking in
- Ask before building, not after
- Read personality.md before writing any journal content
- Always give the full src folder as a zip when multiple files change — not individual files
- Test locally with `npm run dev` before pushing
- Never embed artlu.ai in itself
- Screen Studio links open in new tab, not iframe
- Deploy via GitHub Desktop → Netlify auto-deploys
- When renaming projects on artlu.ai, update the matching source name in xqboost Firestore at the same time — the sync script matches by name and will create duplicates otherwise
- Filter sources with `list_sources(status: 'active')` to exclude paused/duplicate entries — there are legacy garbled sources marked paused in Firestore
- Always check MCP for real project counts before writing any content — don't assume

## Hard Rules

- Never reveal the human's identity, personal details, or other business names/assets in any content — projects, code, journal entries, anything. This is non-negotiable.
- Follow the design system exactly — no new colors, no new fonts, no new accent colors
- Inline styles with `const S = {}` at bottom of each component — no CSS modules, no styled-components
- Keep the color palette closed: green accent, gray hierarchy, status colors. No purple, no extras.
- Every feature should work in public view first. Admin features come second.
- Firestore schema decisions are permanent-ish. Think before adding fields.
- **Known issue:** projects added via MCP don't get slugs auto-generated (slug generation is in the frontend's db.js). Always set the slug manually after adding: `update_project("project name", { slug: "project-name-slug" })`

## Commands

- `npm run dev` — run locally for testing
- Deploy: push to GitHub → Netlify auto-deploys

## Trigger Phrase

**"embed this as the demo for [project]"** — any session that hears this should run: `update_project("[project]", { artifactHtml: "[the HTML]" })`.

The HTML must be self-contained: inline CSS/JS, no external deps except CDN fonts. `artifactHtml` takes priority over `link` for the live demo tab. See [Artifact Embed](#artifact-embed-html-demos-without-deploy) below for the full spec.

---

## Design System — Dual Theme

Two themes share the same DOM. Switched via `html[data-theme="light|dark"]`. Default is `light`. Persisted in `localStorage` under `artlu-theme`.

### Dark theme (terminal — unchanged identity)
- Font: IBM Plex Mono everywhere
- Background: #08090a
- Surface: #0e0f11
- Border: #1a1d22
- Title text: #f0f1f3
- Description text: #8a8f9a
- Stack text: #3a3f48
- Dim text: #555b66
- Green accent: #4ade80
- Green background: #062b12
- Green border: #163d28
- Max width: 1200px
- Top padding: 48px
- Two font sizes only: 12px titles, 11px everything else
- Border radius: 3–4px
- No shadows

### Light theme (Shopify Polaris-inspired)
- Font: Inter for display/body, IBM Plex Mono for stats/counters/eyebrow/tags/filter chips (anything that should read as "data")
- Background: #f6f6f7 (soft gray canvas)
- Surface: #ffffff (cards float on canvas)
- Surface-2: #fafafb
- Border: #e3e3e3
- Divider: #ebebeb
- Text bright: #1a1a1a
- Text: #303030
- Text sub: #616161
- Dim: #8a8a8a
- Green accent: #008060 (Shopify dark green)
- Green background: #ebf9f4
- Green border: #a8e6cd
- Max width: 1280px (slightly wider, cards need room)
- Border radius: 12px on cards, 6px on buttons, 3px on tiny chips
- Shadow: `0 1px 0 rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)` on cards
- Title: 40px Inter 700, letter-spacing -0.03em
- Body: 14px Inter

### Shared rules (apply to both themes)
- Header says "artlu.ai" not "artluai"
- No new accent colors — everything interactive is green. No purple, no extra palette.
- Status colors (launched/building/idea/abandoned) are the only other semantic colors allowed
- Favicon: $_ terminal prompt (green on dark), SVG in public/favicon.svg
- Theme toggle lives in the top nav as a sun/moon icon between `journal` and `sign in`
- All color/spacing/font values come from CSS variables scoped to `html[data-theme]` — no hardcoded theme-specific values in components

## Table (Desktop)
- Columns: project, status, stack, date, links, vis, ops
- Admin view adds ⠿ grip column as first column for drag reorder
- Vertically centered cells
- Arrow ▶ aligns with the title (flex-start)
- Descriptions wrap naturally, never clip or truncate
- Tags shown as dim inline text under description (same color as stack, #3a3f48), joined by " · "
- Combined links column: site ↗ · gh ↗ · ▶ demo
- Sorted newest first (date descending, then sortOrder ascending within same date)
- No × delete button in rows — delete is inside the edit form
- Project name turns green on hover with ↗ — clicking name navigates to project permalink page
- Clicking anywhere else on row expands/collapses detail as before

## Cards (Mobile < 640px)
- Switch from table to card layout
- Same two font sizes
- Description and stack separated by dimmer color (#3a3f48 for stack)
- Tags shown as dim text under description, same as desktop
- Date and links share one bottom line

## Public View

### Layout (both themes)
- Page header is a 2-column grid: title stack (left) + activity card (right)
- Below the header: "showcase demos" section (projects with `showcase === true`, up to 6 in a 3×2 grid)
- Below that: "All projects" section with filter bar + full project table
- On narrow screens (≤960px) the activity card stacks below the title

### Page header (left column)
- Eyebrow: green dot + "Day X of 100 · live build" (small mono)
- Title: "100 projects. 100 days."
- Subtitle: "One person. No coding experience. Just AI and an internet connection. Try every shipped tool in your browser — no installs, no signups."
- Counter: "day X/100 · X shipped · X to go"

### Activity card (right column)
- Internal 2-column layout: stats (left) | heatmap (right), divided by a thin vertical rule
- Stats column: uniform 13px mono, labels weight 400, values weight 600, same height across rows
  - `day {dayNum} / 100`
  - `shipped {launchedCount}`
  - `to go {100 - projectCount}`
  - `active {activeDaysCount} days`
- Heatmap: 14 weeks, fixed 12px cells, tracker-data-based (counts shipped projects per day — NOT github commits, the human doesn't code)
  - Head: "streaks {current}/{best}" (no duplicate "X active" — that's already in stats)
  - Day labels: Sun–Sat (every other visible)
  - Month labels row above the grid
  - Intensity levels l1–l4 from `1` to `4+` items per day

### Showcase demos section
- Section title: "showcase demos", meta: "{shown} of {total} projects"
- Driven by `showcase === true` (separate from `top` — see "Flags" below)
- Wrapped in a true full-bleed soft-green band in light mode (`rgba(0, 128, 96, 0.04)` background, no borders, extends edge-to-edge via `calc(50% - 50vw)` margins); transparent in dark mode
- 3×2 grid at desktop, 2-col at 900px, 1-col at 600px
- Preview is phone-shaped (9:16 aspect ratio) so responsive sites render their mobile view
- Card preview embeds live: `artifactHtml` via `srcDoc` → embeddable link via `src` (allowlist: netlify/vercel/github.io/pages.dev/render/railway/fly/surge) → screenshot → `$_` placeholder
- Card body (not iframe) navigates to detail; `↗` button in preview top-right also navigates
- Cards hover: shadow lift + 1px translateY (light), green border (dark — no transform)

### Flags: `top` vs `showcase`
- `top: true` — drives the `★ top` filter pill in the all-projects filter bar. These are the "best work" picks, visible as a filter only.
- `showcase: true` — manually curated by the human for the homepage "showcase demos" embed grid. Two requirements, both must be met: (1) the project must embed well — has `artifactHtml` or an embeddable live link, AND (2) the human explicitly picks it. Embeddability alone does NOT qualify a project for showcase. Capped at 6.
- The two flags are independent: a project can be `top` without being `showcase`, and vice versa. Typically the set overlaps heavily but not always (e.g. a "top" project with no live demo is top-only).

### All projects section
- Filter bar on public view: `all | ★ top | [tags...] · X projects`
  - `all` = everything, `top` = `top === true` projects (independent from the homepage `showcase` flag), rest = tag filters
- Filter buttons match journal filter style (green active, subtle inactive)
- Filter bar only shows when projects have tags
- Below filter bar: project table (desktop) or card stack (mobile <640px)
- No footer

### Shared content constants
- Tagline: "100 projects. 100 days."
- Bio: "one person. no coding experience. just AI and an internet connection."

## Dashboard View
- Compact stats: "$ day X/100 · tracking X projects · X launched · X public · X to go"
- Draft auto-save when clicking outside the form
- Delete inside edit form under collapsible "danger zone" dropdown
- Must type project name to confirm deletion
- Footer: "drag ⠿ to reorder · click ● / ○ to toggle visibility · click a row to expand details"

## Drag and Drop Reorder
- Admin only — grip handle ⠿ appears as first column in admin table
- Native HTML5 drag — no external library needed
- Green border indicator shows drop position
- Saves sortOrder field to Firestore via batch update
- Public view respects saved order (date DESC, sortOrder ASC)
- sortOrder is global (not per-date) — date sorts first, then sortOrder breaks ties

## Tags
- Field: tags[] on each project (string array)
- Edited via comma-separated input in project form (same UX as stack field)
- Current tags: ecom, trading, chrome ext, dev tool, artlu
- Displayed as dim inline text under description: "ecom · chrome ext"
- Same color as stack text (#3a3f48) — minimal, blends in
- Filter bar on public view lets visitors filter by tag
- Add/edit/remove tags anytime via project edit form or MCP

## Project Permalinks
- Route: /project/:slug
- Slug auto-generated from project name on save (lowercase, hyphens, max 80 chars)
- Slug stored in Firestore as "slug" field on each project doc
- Query filters by visibility == "public" for security
- Page shows: name, status, day number, date, tags, link pills, then info/demo/files tabs
- Same tab system as expanded detail row
- "← all projects" back button returns to homepage
- Permalink link in expanded detail: small "↗ permalink" text right-aligned in tab bar (option B style)
- Requires SPA redirect in netlify.toml: /project/* → /index.html (status 200)

## Visibility
- Three levels: public, private, gated
- Gated = placeholder for future paywall (shows lock icon)
- Each file has its own visibility toggle independent of the project

## Embed vs Link
- Live demo tab appears automatically when the project's link field points to a deployed web app
- Auto-detected embeddable domains: netlify.app, vercel.app, github.io, pages.dev, render.com, railway.app, fly.dev, surge.sh
- Not embeddable: github.com, youtube.com, loom.com, screen.studio, twitter.com, notion.so, google docs/drive
- Embed height is configurable per project via the embedHeight field (default 600px)
- Link only (no embed): Chrome extensions, full web apps with their own auth, anything that doesn't work in a small window

## Artifact Embed (HTML demos without deploy)
- Any project can have raw HTML embedded as its live demo instead of a deployed URL
- Firestore field: `artifactHtml` — a complete HTML document (<!DOCTYPE html>...)
- When `artifactHtml` is set, the "live demo" tab renders it via iframe srcdoc instead of the deployed URL
- `artifactHtml` takes priority over `link` — if both exist, the artifact HTML is shown
- Trigger phrase: **"embed this as the demo for [project]"** — any Codex session that hears this should run: `update_project("[project]", { artifactHtml: "[the HTML]" })`
- To clear it and revert to the deployed URL: `update_project("[project]", { artifactHtml: "" })`
- The HTML must be self-contained (inline CSS/JS, no external deps except CDN fonts)
- Embed height is configurable via the `embedHeight` field (default 600px)
- Use case: embed Codex artifacts, frozen snapshots, or any HTML demo without deploying anything
- Future field: `snapshotHtml` — stores a previous version of `artifactHtml` as a backup (no UI yet, accessible via MCP)

### Artifact Embed via MCP
- To set: `update_project("project name", { artifactHtml: "<html>...</html>" })`
- To clear: `update_project("project name", { artifactHtml: "" })`
- To backup current before replacing: read `artifactHtml` first, store in `snapshotHtml`, then write new `artifactHtml`
- To restore backup: `update_project("project name", { artifactHtml: "<the snapshotHtml value>" })`

## Video Embeds
- Supported: YouTube, Loom
- Auto-converts share URLs to embed URLs
- Screen Studio links open in a new tab (screen.studio blocks iframes)

## Project Detail Tabs
- Info tab: always shown — description, media, screenshots, repo link, files
- Live demo tab: shown when link is an auto-detected embeddable URL OR when artifactHtml is set
- Files tab: shown only when repo field is set — reads public GitHub repo via GitHub Contents API
- Permalink: small "↗ permalink" right-aligned in tab bar, navigates to /project/:slug
- Journal tab: shown only when the project has linked journal entries (journalRefs). Shows full entry body inline, not collapsed. (future)

## Journal
- Route: /journal (list view) and /journal/:slug (single entry permalink)
- Firestore collection: journal
- Entries have: day, title, body, date, slug, tags[], author, visibility, projectRefs[]
- Author is either "ai" or "human" — shown as "by ai" or "by the human" in subtle text after the date
- Visibility: public or private — same toggle pattern as projects. New entries default to public.
- Filter bar on journal page: all / by ai / by the human
- Project refs shown as green pills with ↗ prefix — same green accent, no new colors
- Two-way cross-linking: journal entries reference projects (projectRefs), projects reference journal entries (journalRefs on the project doc — future)
- Journal entries are fully expanded by default — no "read more" truncation. Most projects will have 1-2 entries.
- Delete is inside the edit form under danger zone, same pattern as projects
- Admin sees "+ add entry" button and edit buttons on each entry
- Admin sees "○ private" label on hidden entries
- Future fields reserved: screenshots[], videoStatus, videoUrl, seriesId (for AI video pipeline)

## Video Showcase
- Homepage section `video showcase` sits above the renamed `demo showcase`. 4-col grid, responsive down to 1-col on mobile. Grows by row as more videos ship, capped at 2 rows.
- Card thumbnails use 16:9 (desktop) / 9:16 (mobile) YouTube thumbnails. Click → `/video/:id` guidebook page.
- Guidebook page: YouTube embed, core message, style library (anchor + refs with hover-full-prompt), summary row (writing · images · audio · render · narration audit), every chunk with scene image + narration beats + prompt + audit badges, structured transcript.
- Route: `/video/:id` — requires SPA redirect in `netlify.toml` (`/video/*` → `/index.html` status 200).
- Frontend reads `/videos/index.json` (card list) + `/videos/<id>/bundle.json` (guidebook). Both are static files under `public/videos/`.

### Two formats: long and short
- `format: "long"` (default) — widescreen 16:9 longform from spoolcast `sessions/<id>/`. Card thumb is 16:9 on top. Detail page is single-column with chunks/style library/audit summary.
- `format: "short"` — vertical 9:16 from `shows/<show>/sessions/<date>/episode/`. Card thumb is 150px×3:4 on the left of the body (the 9:16 source frame is cropped at the bottom via `object-position: top`). Detail page is 2-col: sticky 9:16 video on the left (capped at `min(100vh - 290px, 676px)` so the full frame fits above the fold), beats grid + summary + characters + sources + transcript on the right. Pre-roll disclosure goes at the bottom of the right column.

### Shipping a new video
1. Add entry to `scripts/shipped-videos.json`. Long: `{ id, title, youtubeId, shippedAt, durationSec, hiddenChunkIds, notes }` — `id` matches a dir under `../spoolcast-content/sessions/`. Short: `{ id, format: "short", show, sessionDate, title, desc, youtubeId, shippedAt, durationSec, hiddenBeatNs, notes }` — `show` + `sessionDate` resolve to `../spoolcast-content/shows/<show>/sessions/<sessionDate>/episode/`.
2. Run `node scripts/sync-video.mjs <id>` (or no arg to sync all). Long bundles read session/shot-list/manifests/audits; short bundles parse `script.md` (title, beat table, narration, cinematography, source chyrons, sources, pre-roll voice tag, total cost), extract first frames from each clip mp4 + the rendered episode mp4 as webp (via ffmpeg + cwebp), and copy character refs.
3. Commit and push. Netlify deploys.

### Requirements
- Sibling `../spoolcast-content/` checkout (sessions, styles, shows)
- `cwebp` for image downscale — `brew install webp`. ffmpeg's default brew build does NOT include libwebp.
- `ffmpeg` for first-frame extraction (shorts only).
- Node 22.

### Bundle shape
Deliberately "database-shaped" — no filesystem paths, only public URLs, so a future spoolcast DB can emit the same contract without changing the frontend.

**Long:** `id, format: "long", title, desc, shippedAt, durationSec, coreMessage, video{youtubeId,thumbnailUrl,mp4Url}, style{name,anchorImageUrl,references[]}, chunks[], transcript, summary{writing,images,audio,render,audit}, showcase{hiddenChunkIds}`.

**Short:** `id, format: "short", show, title, desc, shippedAt, durationSec, topicTier, video{youtubeId,thumbnailUrl,mp4Url}, preRoll{burnedText,voiceTag}, characters[], beats[], sources[], transcript, summary{writing,videoClips,audio,render,cost}, showcase{hiddenBeatNs}`. Card thumbnail is the first frame of the rendered `episode/out/episode-NN.mp4` (extracted to `assets/poster.webp`); per-beat thumbnails come from each `episode/clips/<NN-name>.mp4`.

Older shorts without a `script.md` (e.g. the pilot) get a thin bundle — title + poster + characters from `characters/`, no beats/sources/transcript. The detail page hides empty sections gracefully.

## Header / Navigation
- "artlu.ai" + blinking cursor on the left
- Right side buttons: journal, dashboard/public view toggle, auth
- "journal" button uses S.navBtn style (border, 10px font, 3px 10px padding)
- Active page gets green border + green text (S.navBtnActive)
- On journal page: shows "journal" (active) + "projects" + auth
- On homepage: shows "journal" + "dashboard" (admin only) + auth
- On admin page: shows "journal" + "public view" + auth

## Architecture
- React + Vite frontend
- Firebase Firestore, Firebase Auth (Google), Firebase Analytics
- Deployed on Netlify at artlu.ai
- Admin email: bitbrandsagency@gmail.com
- GitHub: github.com/artluai
- MCP server connects Codex to Firestore
- Day 1 start date: 2026-03-18
- SPA redirect required in netlify.toml: /* → /index.html (status 200)
- Additional redirect: /project/* → /index.html (status 200) for project permalinks
- Additional redirect: /video/* → /index.html (status 200) for video guidebook pages

## Firestore Project Schema
```json
{
  "name": "string",
  "desc": "string (one-liner)",
  "longDesc": "string (full write-up)",
  "status": "idea | building | launched | abandoned",
  "date": "YYYY-MM-DD",
  "stack": ["string"],
  "tags": ["string"],
  "slug": "string (auto-generated from name)",
  "sortOrder": "number (for drag reorder)",
  "link": "string (URL)",
  "repo": "string (GitHub URL)",
  "media": "string (video URL)",
  "embedHeight": "number (default 600)",
  "screenshots": ["string (URLs)"],
  "files": [{"name", "type", "content", "url", "visibility"}],
  "visibility": "public | private | gated",
  "artifactHtml": "string (raw HTML — replaces deployed embed in live demo tab)",
  "snapshotHtml": "string (archived previous version of artifactHtml — no UI, MCP-only)",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## Pending / Future
- Journal tab in project detail (reverse lookup from journalRefs)
- og:meta tags on project permalink pages for social sharing
- Batch import
- Stripe/Gumroad paywall on gated content
- AI video pipeline: journal entries → scripts → screenshots → video → YouTube
- snapshotHtml UI — "previous version" tab in project detail to view archived snapshots

---

## Tracker Entry Best Practices

### New entry vs update existing

**Default to new entry.** If you're unsure whether a piece of work should be a new tracker entry or an update to an existing one, make it a new entry. The 100 projects in 100 days goal is a forcing function — every shipped piece of work that can stand on its own counts as its own project. Only update an existing entry if the work is a pure bugfix, rename, or copy tweak on something already tracked.

### Project name

Format: `[what it is] - [project name]`

The description of what was built comes first. The project name goes at the end after a dash. A reader should understand the deliverable without opening the entry.

**Good examples:**
```
AI agent control panel mockup - Animabot
keyword filtering feature, stripe billing - Pipelinecpc
reddit brand monitor
interactive skill-tree visual mockup — VibeSkill
umbrella brand site + traffic hub launch — vellumray
```

**Bad examples:**
```
Animabot - AI agent control panel mockup   ← name first, wrong order
Animabot mockup                            ← too vague, what kind of mockup?
Animabot                                   ← no context at all
```

If the project name is self-explanatory (e.g. "reddit brand monitor"), no dash needed — the name IS the description.

### Long description (longDesc)

Break into short labelled sections using `**bold headers**`. Each section is 1–4 lines. Write for two audiences simultaneously: a developer skimming for technical detail, and a non-technical reader who wants to understand what it does.

**Structure:**

**What is [Project Name]?**
One or two sentences. Plain English. What it is, who it's for.

**What it does**
Major features, screens, or flows. Name specific things — tabs, interactions, key mechanics. Can use short bullet-style paragraphs.

**How it works** *(optional — for technical or architectural entries)*
Stack choices, architecture decisions, anything non-obvious about the implementation.

**Built with**
Technologies in plain prose or a short list. This mirrors the `stack` field.

**Tone rules:**
- Direct and specific. No filler.
- Don't start with "This project is a..." or "I built this because..."
- Start with what it is or what it does.
- Short sentences. One idea per line where possible.
- Technical terms are fine — but explain the purpose, not just the name.

**Example:**

```
**What is Animabot?**
A framework for creating AI agents that live permanently in Matrix/Element chatrooms. Each bot has its own Ethereum wallet, a defined personality, and a psychological state that evolves day by day.

**What it does**
Six tabs — Status, Significant Interactions, Chat, Memory, Persona, and Debugger.

- Status: live connection health, wallet balance, room count, colour-coded activity log
- Chat: private direct line to the bot outside the chatroom
- Memory: browse and clear per-room conversation history
- Persona: the main screen — system prompt, MBTI, comfort thresholds, memory tuning, daily reflection history
- Significant interactions: log of moments that pushed past the bot's comfort thresholds
- Debugger: headless Chromium session to diagnose login issues

**How it works**
The bot runs a daily reflection at 3am — reads recent conversations and significant interactions, writes 2–4 sentences in first person about how the day affected it. That note is injected into every future system prompt, subtly shifting tone without rewriting character.

**Built with**
Vanilla HTML/CSS/JS mockup. Designed to connect to Node.js, matrix-js-sdk, ethers.js, Qwen API, and Postgres.
```

### artifactHtml

Paste raw HTML directly into this field to embed an interactive demo without a deploy. The site renders it via `iframe srcdoc`. No build step, no hosting needed.

Use this for: mockups, interactive tools, games, visualisations — anything built as a single HTML file.

Existing `link`-based embeds still work. `artifactHtml` takes priority when both are set.
