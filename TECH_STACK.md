# TECH_STACK.md — Physical Targets & Dead Code

> Cleanroom extraction artifact. This document inventories the **physical** facts of the
> legacy repo: framework versions, deployment target, the literal design tokens, and the
> dead code. It is deliberately implementation-specific — it names hex codes and fonts so
> the new UI can be rebuilt *blind* to the old components. It does **not** prescribe an
> architecture for the rebuild.
>
> Everything below is read from the current working tree only (no git history).

---

## 1. Framework & Deployment Targets

### Live build (the only thing that ships)

| Concern | Concrete target | Source |
|---|---|---|
| Site framework | **Astro `^6.3.5`**, `output: "static"` | `package.json`, `astro.config.mjs` |
| Sitemap | `@astrojs/sitemap ^3.7.2` (filters out `/admin`) | `astro.config.mjs:8-10` |
| Language | **TypeScript** + JS, ESM (`"type": "module"`) | `package.json` |
| Operational DB | **Firebase Firestore** (`firebase ^11`, `firebase-admin ^13.10`) | `src/lib/data.ts`, `scripts/sync-firestore-snapshot.mjs` |
| Auth | **Firebase Auth** + Google provider (popup) | `src/scripts/admin.ts:1-19` |
| Analytics | Google gtag (`measurementId` from firebase config), only on host `artlu.ai` | `src/layouts/BaseLayout.astro:45-57` |
| Long-form content | **Astro Content Collections** + **Zod** | `src/content.config.ts` |
| Garden markdown | `@astrojs/markdown-remark` processor (GFM, Shiki dual-theme, KaTeX, custom Obsidian plugins) | `src/lib/garden/render.ts` |
| Math | `katex ^0.17`, `remark-math ^6`, `rehype-katex ^7` | `package.json`, `render.ts` |
| Feeds / endpoints | `rss ^1.2`, plus hand-written `*.ts` endpoints | `src/pages/rss.xml.ts`, `llms.txt.ts`, `robots.txt.ts` |
| Graph viz | `d3-force ^3` on a `<canvas>` (garden link graph) | `package.json`, `src/components/GardenGraph.astro` |
| Hosting / deploy | **Netlify**, static `dist/`, redirects, auto-deploy on git push | `netlify.toml` |
| Fonts | **Google Fonts CDN** — Inter + IBM Plex Mono | `src/layouts/BaseLayout.astro:37-39` |
| Runtime | Node (dev on 24; pipeline docs target 22) | repo docs |

### Build pipeline (Netlify)

`netlify.toml` runs: `sync:data → validate:stack → build:strict`, publishing `dist/`.

- **`sync:data`** — Firebase Admin SDK reads Firestore, filters to public records, writes the git-ignored `src/data/tracker-snapshot.json`.
- **`validate:stack`** — referential integrity gate; **fails the build** if any public project's stack labels/refs don't resolve to a known technology (or use the `other` placeholder).
- **`build:strict`** — `ARTLU_REQUIRE_SNAPSHOT=1 astro build`; errors out if the snapshot is missing rather than hitting live Firestore.
- **Media pipeline** (`scripts/sync-video.mjs`, ffmpeg + cwebp) runs **on demand** when shipping a video; its output under `public/videos/` is committed.

### Deployment surface

- **Fully static.** No server, no runtime DB call on the read path. Visitors get pre-rendered HTML/JSON from a CDN.
- **Redirects** (`netlify.toml`): `/journal → /log`, `/journal/* → /log/*`, `/dashboard → /admin` (all 301).
- **Canonical site:** `https://artlu.ai`. Analytics + gtag only fire on that exact hostname.
- **Routes that exist:** `/`, `/list`, `/map`, `/project/[slug]`, `/video/[id]`, `/log`, `/log/[slug]`, `/research`, `/research/[slug]`, `/garden`, `/garden/[slug]`, `/admin`, `/admin/settings`, `/rss.xml`, `/llms.txt`, `/robots.txt`, `/404`.

### Data reads (build-time fallback chain)

The data layer tries, in order: baked **snapshot JSON** → **Firestore Admin SDK** → **Firestore client SDK (`firestore/lite`)** → a **fixed-path local backup JSON** → bundled **`*-defaults.json`** seeds (`src/lib/data.ts:467-626`).

### Secrets / config currently in the tree

- `src/lib/firebaseConfig.ts` hard-codes the Firebase **web** config (apiKey, projectId `artluai-tracker`, etc.) and the single **admin email allow-list** (`bitbrandsagency@gmail.com`). Web API keys are public by design, but the admin email and project identifiers are baked into client bundles.
- A **fixed absolute fallback path** to a previous author's machine is hard-coded: `/Users/ralphxu/Documents/Projects/artlu-tracker-mcp/backups/...` and `~/Documents/keys/artlu-tracker-sa.json` (`src/lib/data.ts:158-159`). Dead/unportable on any other machine.

---

## 2. Design Tokens

The entire visual system is a **closed set of CSS custom properties** in `src/styles/global.css`, switched by a `data-theme` attribute on `<html>`. There is **no CSS framework** and **no named spacing scale** — spacing, radii, and font sizes are literal `px` values used inline. Both themes are given in full so the new UI can be rebuilt token-for-token.

### Color tokens — Dark theme (default)

`html[data-theme="dark"]` (`global.css:1-14`). Origin note in source: a Dark Reader transform of the light theme.

```
--bg:            #21211d
--surface:       #0f0f0e
--surface-2:     #181816
--border:        #42403a
--border-strong: #514e47
--border-hover:  #5c5b52
--text:          #fff7d4
--text-bright:   #fffff1
--text-sub:      #eddbba
--dim:           #d6c3a4
--dimmer:        #ddcaab
--green:         #6ad39e   --green-bg:  #1a291f   --green-border:  #45654c
--blue:          #7da9d1
--amber:         #ffffae   --amber-bg:  #2a210d   --amber-border:  #876e3d
--pink:          #e58ab0   (token defined but unused)
--port:          #2f2e2a   --wire:      #3b3934   --wire-on:  #6ad39e
--grid-line:     transparent
--timeline:      #3b3934
--node-shadow:   0 8px 26px rgba(0,0,0,0.6)
```

### Color tokens — Light theme

`html[data-theme="light"]` (`global.css:16-28`).

```
--bg:            #e9eaec
--surface:       #ffffff
--surface-2:     #f2f3f5
--border:        #dcdfe2
--border-strong: #b7bcc3
--border-hover:  #9ba0a8
--text:          #34373c
--text-bright:   #15171a
--text-sub:      #50545a
--dim:           #676c74
--dimmer:        #9298a0
--green:         #0a7d5e   --green-bg:  #e6f4ee   --green-border:  #a9ddc9
--blue:          #2563eb
--amber:         #8a6300   --amber-bg:  #f3e9d2   --amber-border:  #d3b16d
--pink:          #be185d
--port:          #d7dce1   --wire:      #c8cdd3   --wire-on:  #0a7d5e
--grid-line:     transparent
--timeline:      #c8cdd3
--node-shadow:   0 1px 2px rgba(22,24,27,0.07), 0 4px 14px rgba(22,24,27,0.06)
```

### Semantic color meaning (carries domain intent)

- **green** = the brand accent / "build" / launched / public / primary action.
- **blue** = "video" entries.
- **amber** = "research" entries, the **garden** nav segment (glyph `❧`), warnings, and "locked/gated".
- **dot colors** in timelines: `.dot` green (build), `.dot.video` blue, `.dot.research` amber (`global.css:498-500`).
- One hard-coded non-token color: PipelineCPC mark uses `#f97316` (orange) on `#0f172a` (`global.css:289,395-399`).

### Typography

```
--font:  'Inter', system-ui, sans-serif
--mono:  'IBM Plex Mono', 'SF Mono', Consolas, monospace
```

- Loaded from Google Fonts: `Inter` weights 400/500/600/700, `IBM Plex Mono` weights 400/500/600/700 (`BaseLayout.astro:39`).
- **Base body:** `font-size: 14px` (desktop), `13px` at `≤720px`; `-webkit-font-smoothing: antialiased`.
- **Type scale in use** (literal px): 8.5, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 17, 21, 23, 24, 26, 29, 30. (`.page-h1` 30px; brand 29px; section headers `.sec-h` 11px uppercase, `letter-spacing:1.8px`; mono labels 10–11px uppercase with `letter-spacing:1–1.4px`.)
- **Mono is used for all "system/terminal" chrome**: nav segments, meta lines, counts, status pills, the day pills, admin chrome.

### Spacing, radii, layout constants (literal — no named tokens)

- **Border-radius scale:** `2, 3, 4, 5, 7, 8, 9, 10, 11, 15, 18px`; pills/chips use `20px` or `999px`.
- **Layout widths:** content `max-width: 1240px` (`.col`), reading width `760px`/`820px` (`.narrow`, `.garden-note`), graph world `2200px`.
- **Topbar:** height `72px` desktop / `54px` mobile; sticky; `z-index:40`.
- **Page padding:** `16px 30px 110px` desktop, `12px 13px 88px` mobile.
- **Mobile breakpoint:** single `@media (max-width:720px)`.
- **Standard card:** `1px solid var(--border-strong)`, radius `9–11px`, `background:var(--surface)`, `box-shadow:var(--node-shadow)`.
- **Status pills:** `.status` (green) default; `.building` amber; `.idea` neutral; `.abandoned` dim (`global.css:509-512`).

### Theme behavior

- Persisted in `localStorage` under key **`artlu-theme`**.
- Default when unset: **mobile (`≤720px`) → light, desktop → dark** (`BaseLayout.astro:27-36`).
- Toggled by a global `window.toggleTheme()` flipping `data-theme` (`BaseLayout.astro:69-74`).
- Favicon: `/favicon.svg`.

---

## 3. The Graveyard (dead code & dead config)

The repo contains **two generations of the app**. Only the Astro generation is built. The following are present but **unreachable / unused**.

### Dead generation: the old React + Vite SPA

These files are not wired into the Astro build and cannot run:

| File(s) | Why dead |
|---|---|
| root `index.html`, `src/main.jsx`, `src/App.jsx` | Vite SPA entry (`ReactDOM.createRoot` + `BrowserRouter`). Not Astro's entry. |
| `src/components/*.jsx` — `Header.jsx`, `Dashboard.jsx`, `ProjectTable.jsx`, `ProjectPage.jsx`, `ProjectDetail.jsx`, `ProjectForm.jsx`, `VideoPage.jsx`, `VideoCard.jsx`, `VideoShowcase.jsx`, `JournalView.jsx`, `JournalEntry.jsx`, `JournalForm.jsx`, `PublicView.jsx`, `FeaturedCard.jsx`, `FeaturedGrid.jsx`, `FileBrowser.jsx`, `EmbedFrame.jsx`, `Links.jsx`, `ActivityCard.jsx` | React components. Astro config declares **no `@astrojs/react`** integration (not in `package.json`/lockfile), and there are **zero `client:*` directives** in `src/`. Astro cannot render or hydrate them. |
| `src/lib/db.js`, `src/lib/auth.jsx`, `src/lib/theme.jsx`, `src/lib/firebase.js` | SPA-era data/auth/theme modules, superseded by `src/lib/data.ts`, `src/scripts/admin.ts`, the inline theme script, and `firebaseConfig.ts`. |
| `src/index.css` | SPA stylesheet; live theme is `src/styles/global.css`. |
| `vite.config.js` | Vite SPA build config; the real build is `astro.config.mjs`. |

**Unused dependencies** that linger only because of the dead SPA: `react`, `react-dom`, `react-router-dom`, `react-markdown`, `remark-gfm`, `@vitejs/plugin-react`, `@types/react`, `vite`. (Note: the *garden* renderer uses `remark-math`/`remark-breaks`/`rehype-katex` directly, so those are **live**; `react-markdown`/`remark-gfm` are the dead pair.)

### Dead data paths & unportable config

- **Hard-coded foreign absolute paths** in `src/lib/data.ts:158-159` (`/Users/ralphxu/...` backup + `~/Documents/keys/...` service account). Only meaningful on one specific machine; dead everywhere else.
- The **client-SDK live-read fallbacks** in `data.ts` are effectively dead in production: the Netlify build sets `ARTLU_REQUIRE_SNAPSHOT`, so the snapshot path always wins and the Firestore/back-up/defaults branches never execute during a real build.

### Stale / placeholder UI in the admin

- `src/pages/admin/settings.astro` is almost entirely **non-functional placeholders**: every "config / connect / new job" button is `disabled` with "coming soon"; the connection rows are static labels; the "general" toggles/inputs are not wired to persistence (only a cosmetic switch toggle in script).
- Admin "create series" is a **dead button**: it just sets a status message saying series creation still happens via Firestore/seed scripts (`src/scripts/admin.ts:621-625`).
- The `siteMeta/publishState` "dirty flag" + `changes` change-journal is written on every admin edit but is **informational only** — nothing consumes it to trigger a publish (publishing is still a manual git push). (`src/scripts/admin.ts:136-155`.)

### Duplication worth noting (not dead, but redundant)

- **`slugify` is implemented three times** with slightly different rules: `src/lib/format.ts:3`, `src/scripts/admin.ts:34`, and `scripts/validate-stack-metadata.mjs:11` (the validator additionally strips apostrophes). These can silently disagree on edge cases.
- Two markdown renderers coexist: the hand-rolled `renderMarkdownLite` (`format.ts`, used live for project/log bodies) and the full garden processor (`src/lib/garden/`). The React-era `react-markdown` is the third, dead one.

### Unused token

- `--pink` is defined in both themes but referenced nowhere (`global.css:9` even annotates it "token unused").

---

*Companion documents: `DOMAIN_PRIMER.md` (the business rules and fallbacks) and `BEHAVIOR_INVENTORY.md` (observable capabilities).*
