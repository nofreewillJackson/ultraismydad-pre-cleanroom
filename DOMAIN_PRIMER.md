# DOMAIN_PRIMER.md — Business Rules, Fallbacks & Visibility

> Cleanroom extraction artifact. This document captures the **what** — the domain entities,
> the implicit rules, the silent guessing, and the privacy logic that the legacy code
> currently enforces. It is the input to a test-driven rebuild: each rule below should
> become a domain test before any code that satisfies it exists.
>
> It intentionally says nothing about *how* to structure the rebuild. Citations (`file:line`)
> point at where the legacy behavior lives so the rule can be verified, not copied.

---

## 0. The mental model

The system is a **build-in-public tracker**: "100 days, 100 features." A single operator (or
an AI agent) records **work items** and **log entries**. Work items are grouped into
**product lines** and optionally into **series**. Each work item is tagged with
**technologies** drawn from a canonical taxonomy. Videos are a special kind of work item with
their own asset bundles. A separate, self-contained **digital garden** holds interlinked
notes. Only explicitly public records ever reach a reader.

The dominant design tension: the data is **messy and partially-specified** (entries created
fast, fields left blank), so the read layer is full of **inference and fallbacks** that
reconstruct structure from free text. The rebuild's job is to make that inference *explicit
and tested* instead of implicit and load-bearing.

---

## 1. Core Entities & Data Shapes

Field requiredness below means **"required for the entity to behave correctly downstream,"**
not a schema constraint — the legacy store (Firestore) enforces almost nothing, which is
exactly why the fallbacks in §2 exist.

### 1.1 Work Item ("project")

The central entity. Covers builds, experiments, **and** videos. (`src/lib/data.ts:20-54`)

| Field | Required? | Meaning / notes |
|---|---|---|
| `id` | system | Store key. |
| `name` | **effectively required** | Title. Missing → `"untitled project"` (§2.1). |
| `slug` | derived | URL key. Missing → `slugify(name)` (§2.1). |
| `desc` | optional | Short one-liner (card subtitle, meta description). |
| `longDesc` | optional | Body, rendered as light markdown. |
| `type` | optional | `"project" | "video" | "research"` — only loosely used; video-ness is mostly inferred (§3). |
| `status` | optional | Free string; UI knows `launched / building / idea / abandoned`. Default → `"launched"` (§2.5). |
| `date` | optional but central | `YYYY-MM-DD`. Drives day-number, sorting, heatmap, video↔project matching. |
| `stack` | optional | Free-text technology labels. Default `[]`. |
| `stackRefs` | optional | Canonical technology **ids**. Default `[]`. |
| `tags` | optional | Free-text tags. Default `[]`. |
| `sortOrder` | optional | Tie-breaker in sorts; default `0`. |
| `link` | optional | External "site" URL; candidate for live-demo embed (§5 embeddability). |
| `repo` | optional | Source repo URL; enables a "files" tab. |
| `media` | optional | Video/demo URL (YouTube/Loom/screen.studio) or embed source. |
| `embedHeight` | optional | Embed sizing hint. |
| `screenshots` | optional | Image URLs. Default `[]`. First one is a thumbnail fallback. |
| `files` | optional | Attached files (see Work-Item File). Default `[]`. |
| `visibility` | **governs publication** | Only `"public"` is published (§4). |
| `artifactHtml` | optional | Self-contained HTML for a sandboxed live demo. |
| `snapshotHtml` | optional | Frozen HTML snapshot. |
| `createdAt` / `updatedAt` | optional | Timestamps (normalized from Firestore/ISO; §2.7). |
| `parentProjectId` / `mainProjectId` | optional | Product-line membership; else inferred (§3.1). |
| `seriesId` | optional | Series membership; else inferred under spoolcast only (§3.2). |
| `videoId` / `bundleId` | optional | Link to a shipped video bundle. |
| `youtubeId` / `tiktokUrl` / `tiktokId` | optional | Video identity; also parsed out of `media`/`link` (§3.3). |
| `videoFormat` | optional | `"short" | "long"`; else inferred (§3.4). |
| `guidebookStatus` | optional | `"pending" | "ready"`; else derived (§3.5). |

### 1.2 Work-Item File (`ProjectFile`)

Attached to a work item. (`src/lib/data.ts:12-18`)

| Field | Meaning |
|---|---|
| `name` | Display name. |
| `type` | `"paste"` (inline content) or `"link"` (external URL). |
| `content` | Inline text (for `paste`). |
| `url` | External URL (for `link`). |
| `visibility` | `"public" | "private" | "gated"` — controls whether/how it shows (§4.4). |

### 1.3 Log Entry ("journal")

A dated build note. (`src/lib/data.ts:56-69`)

| Field | Required? | Meaning / notes |
|---|---|---|
| `id` | system | Store key. |
| `day` | optional | Day number; usually echoes `date` math but stored too. |
| `title` | **effectively required** | Missing → `"untitled entry"` (§2.2). |
| `body` | optional | Light-markdown body. |
| `date` | optional but central | `YYYY-MM-DD`; drives sort + day display. |
| `slug` | derived | Missing → `slugify("day-{day}-{title}")`, then de-duplicated (§2.2). |
| `tags` | optional | Free-text; coerced via `refLabel` (§2.8). Default `[]`. |
| `author` | optional | `"ai" | "human"`; **default treated as `"ai"`** in the UI filter (§5 log filter). |
| `visibility` | governs publication | Hidden when `"private"` (§4.2). |
| `projectRefs` | optional | References to work items (by id/slug/name); resolved to links (§3.6). Default `[]`. |
| `createdAt` / `updatedAt` | optional | Normalized timestamps. |

### 1.4 Product Line ("mainProject")

Top-level grouping + branding. (`src/lib/data.ts:112-133`; defaults `src/lib/main-project-defaults.json`)

| Field | Meaning |
|---|---|
| `id` | Line key (e.g. `spoolcast`, `research`, `artlu`, `pipelinecpc`, `adsmetri`, `vibeskill`, `costintel`, `other`). |
| `name`, `desc`, `meta` | Display copy. `meta` is a short tagline ("video pipeline"). |
| `site/siteUrl`, `repo/repoUrl`, `demo/demoUrl` | External links (each accepts two field spellings; §2.6). |
| `logoImg/logoUrl`, `heroImg/heroUrl` | Imagery (multiple accepted spellings). |
| `wordmark`, `markKey`, `markText` | Branding glyph/wordmark; falls back to per-id defaults then first-2-letters (§2.6). |
| `visibility` | Hidden when `"private"`; **default `"public"`** (§4.3). |
| `sortOrder` | Order; default `0`. |
| `count` | Derived: number of public entries in the line (§3.7). |

The **seven canonical lines** (with default order): `spoolcast` (10), `research` (20),
`pipelinecpc` (30), `adsmetri` (40), `vibeskill` (50), `costintel` (60), `artlu` (70),
and the catch-all `other` (999).

### 1.5 Series

A sub-grouping inside a product line. (`src/lib/data.ts:135-146`; defaults `src/lib/series-defaults.json`)

| Field | Meaning |
|---|---|
| `id` | Series key; normalized through aliases (§3.2). |
| `mainProjectId` | Owning line (else `parentProjectId`). |
| `name`, `desc`, `meta`, `kind` | Display copy; `kind` e.g. `"video-series"`. Missing name → title-cased id (§2.3). |
| `aliases` | Alternate ids that fold into this one. |
| `visibility` | Hidden when `"private"`; **default `"public"`**. |
| `sortOrder`, `count` | Order + derived public-entry count. |

Default series (all under `spoolcast`): `aninews` (aliases `news-anime-bot`, `faux7`),
`spoolcast-dev-log`, `videos` (alias `spoolcast-core`).

### 1.6 Technology (canonical taxonomy)

The controlled vocabulary for stacks. (`src/lib/data.ts:148-156`; defaults `src/lib/technology-defaults.json`)

| Field | Meaning |
|---|---|
| `id` | Canonical key (what `stackRefs` stores). |
| `name` | Display name (overridable via display-name map, e.g. `firebase-realtime-db → "Firebase RealtimeDB"`). |
| `category` | One of `frontend, backend, data, infra, media, agents, other`; **default `"media"`** (§2.4). |
| `aliases` | Alternate labels that resolve to this id. |
| `visibility` | Hidden when `"private"`; default `"public"`. |
| `sortOrder`, `count` | Order + derived usage count. |

Category **display labels & order**: `frontend→"front-end"`, `backend→"back-end"`, `data`,
`infra`, `media→"ai + media"`, `agents`, `other` (`data.ts:181-191`).

### 1.7 Video bundle / index item

Videos have an out-of-band asset contract (committed JSON), separate from Firestore.
(`src/lib/data.ts:71-83`; files `public/videos/index.json`, `public/videos/<id>/bundle.json`)

| Field (index item) | Meaning |
|---|---|
| `id` | Bundle key = route `/video/<id>`. |
| `format` | `"short" | "long"`. |
| `show` | Series/show label (e.g. `aninews`). |
| `title`, `desc` | Display copy. |
| `shippedAt` | `YYYY-MM-DD` ship date (used to match a project, §3.3). |
| `durationSec` | Length. |
| `thumbnailUrl`, `youtubeId`, `tiktokUrl`, `tiktokId` | Identity/imagery; back-filled from the bundle if absent (`data.ts:656-674`). |

### 1.8 Garden note

A self-contained content entity, file-based, not in Firestore. (`src/lib/garden/index.ts:14-25`; frontmatter schema `src/content.config.ts:20-31`)

| Field | Required? | Meaning |
|---|---|---|
| `title` | **required** (Zod) | Note title. |
| `description` | optional | Default `""`. |
| `date` | optional | Default `""`. |
| `tags` | optional | Default `[]`; lowercased on load. |
| `aliases` | optional | Alternate names for wikilink resolution. |
| `slug` | optional | Else derived from filename (§3.8). |
| `draft` | optional | Default `false`; **`true` excludes the note from the build** (§4.5). |
| `html`, `links`, `backlinks` | derived | Rendered body, resolved outbound links, inbound links. |

---

## 2. Default Values & Normalization (the silent fixups)

These run every time a record is read. They are *silent* — they never error, they just fill
in or rewrite values.

1. **Work item name/slug** (`data.ts:261-276`): `name ||= "untitled project"`; `slug ||= slugify(name)`; `stack`/`stackRefs`/`tags`/`screenshots` are coerced to arrays with falsy values dropped; `files` coerced to array.
2. **Log title/slug** (`data.ts:382-394`): `title ||= "untitled entry"`; `slug ||= slugify("day-{day}-{title}")`. Then **slug de-duplication** (`data.ts:646-654`): first occurrence keeps the base slug; later collisions get `-{first 6 chars of id, lowercased}` appended.
3. **Series label** (`data.ts:338-359`): missing `name` → id with a leading `series-`/`series_` stripped, separators → spaces, title-cased. Missing `desc` → `"Grouped entries in the {label} line."`. Missing `meta` → `kind || "series"`; missing `kind` → `"series"`.
4. **Technology** (`data.ts:361-371`): missing `category` → **`"media"`**; `name` from display-name map → provided name → id.
5. **Status**: site entries default `status` → **`"launched"`** (`data.ts:1038`). Admin *form* default is `"launched"`; admin *timeline* row falls back to `"idea"` when unset (`admin.ts:300`).
6. **Product-line field coalescing** (`data.ts:299-330`): `site` accepts `site` then `siteUrl` then defaults; same dual-spelling pattern for `repo/repoUrl`, `demo/demoUrl`, `logoImg/logoUrl`, `heroImg/heroUrl` (hero also accepts `backgroundImg`/`thumbnailUrl`). Mark falls back to a per-id map (`artlu→"$_"`, `research→"🧠"`, `pipelinecpc→"P"`), else the **first two letters** of the name. `visibility` defaults `"public"`; `sortOrder` defaults `0`.
7. **Timestamp normalization** (`data.ts:253-259`): accepts ISO strings, Firestore `Timestamp` (`toDate()`), or `{seconds}` → ISO string; else `undefined`.
8. **Ref coercion** (`refLabel`, `data.ts:396-400`): a tag/projectRef may be a string or an object; objects collapse to `slug || name || title || id`.

---

## 3. Inference Cascades (the silent guessing)

This is the heart of the domain. When structure is missing, the system **guesses it from
free text**, in a fixed priority order. Each cascade is deterministic and must be reproduced
exactly to keep existing URLs/groupings stable.

### 3.1 Product line for a work item

Resolution order (`data.ts:863-893`, `718-744`):

1. explicit `mainProjectId`, else
2. explicit `parentProjectId`, else
3. **`inferMainProject(...)`** — keyword scan over a lowercased haystack of `name + longDesc + link + stack + tags`, in this **priority order** (first match wins):
   - `"chat to video workflow"` / `"session to video"` / `"spoolcast pilot"` → **spoolcast**
   - `"context gate"` / `"hallucination experiment"` / `"brain-response"` / `"brain response"` / `"tribe v2"` → **research**
   - title contains `"artlu"` → **artlu**
   - `"spoolcast"` / `"aninews"` / `"news-anime"` / `"faux7"` → **spoolcast**
   - `"pipelinecpc"` / `"google ads"` → **pipelinecpc**
   - `"adsmetri"` / `"meta ads"` → **adsmetri**
   - `"vibeskill"` / `"skill-tree"` → **vibeskill**
   - `"costintel"` / `"fulfillment"` → **costintel**
   - `"artlu"` / `"journal system"` / `"terminal file browser"` / `"live demo iframe"` / `"artifact embed"` → **artlu**
   - **fallback → `"other"`** (the catch-all line).

   Note the deliberate ordering subtleties: a chat-to-video item lands in *spoolcast* even though it also matches *research*-ish words; a title containing "artlu" wins early, but other artlu-ish phrases are caught later.

### 3.2 Series for a work item

(`data.ts:746-753`, `1023-1025`, `332-336`)

1. explicit `seriesId` (run through alias normalization), else
2. inferred via **`inferSeries(...)`** keyword scan over `name + id + show + format + stack`:
   - `"aninews"` / `"news-anime"` / `"faux7"` → **aninews**
   - `"dev-log"` / `"dev log"` → **spoolcast-dev-log**
   - `"chat to video workflow"` / `"session to video"` → **videos**
   - `"spoolcast"` → **spoolcast-features**
   - else `undefined`
3. **Key rule:** an *inferred* series is only attached when the resolved product line is **`spoolcast`**. Outside spoolcast, an inferred series is discarded (an explicit `seriesId` is always honored). (`data.ts:1025`)
4. **Series-id aliasing** (`normalizeSeriesId`, `data.ts:247-251,332-336`): `news-anime-bot → aninews`, `faux7 → aninews`, `spoolcast-core → videos`.

### 3.3 Is this work item a video? (and which one)

`isProjectVideoEntry` (`data.ts:787-795`) treats an item as a **video** if **any** hold:
- a shipped video was matched to it (below), or
- `type === "video"`, or
- it has any of `videoId / bundleId / youtubeId / tiktokUrl / tiktokId / videoFormat / guidebookStatus`, or
- it is in line **spoolcast** with a series **and** has `media` or a parseable YouTube id.

**Matching a project to a shipped video** `findVideoForProject` (`data.ts:815-861`), in order:
1. explicit `videoId`/`bundleId` matches a bundle id, else
2. a parsed YouTube id matches a bundle's `youtubeId`, else
3. a **fuzzy duplicate** match: **same `date`/`shippedAt`** AND either (a) one slugified title contains the other (both >16 chars), or (b) a **title-token overlap score** ≥ threshold — `0.58` if both infer the same series, else `0.72`. Token overlap ignores a stop-word list (incl. `ai, ep, episode, dev, log, spoolcast, aninews, news, anime`) but keeps pure-number tokens (`data.ts:829-861`).

**YouTube id parsing** `parseYoutubeId` (`data.ts:755-773`): accepts a bare id, or extracts from `youtube.com/watch?v=`, `/shorts/`, `/embed/`, or `youtu.be/` URLs; checked against `youtubeId`, then `media`, then `link`.

### 3.4 Video format

`projectVideoFormat` (`data.ts:797-803`): matched video's `format` → item's `videoFormat` → if the (normalized) series is **`aninews` then `"short"`** → else **`"long"`**.

### 3.5 Guidebook status

(`data.ts:1029`) matched video → **`"ready"`**; else the item's own `guidebookStatus`; else if it has a `videoId` → **`"pending"`**; else `undefined`.

### 3.6 Resolving a log's project references → links

`createProjectRefResolver` (`src/lib/projectRefs.ts`): builds an index keyed by each project's `id`, `slug`, `name`, and `slugify(name)`. A reference resolves via a **legacy alias table** first (hard-coded old labels → current slugs, e.g. `"xqboost" → "ai-personality-tweet-generator-xqboost"`), then by exact key, then by slugified key. Resolved → link to `/project/<slug>` with the project's real name; unresolved → the raw label as plain text.

### 3.7 Counts & grouping

- **Product-line counts** (`data.ts:863-893`): every public work item is bucketed by its resolved line; lines with `count > 0` are shown (the `other` line is shown only if non-empty). Unknown ids get a synthesized line (`name = id`, `sortOrder 900`).
- **Series counts** (`data.ts:895-932`): site entries bucketed by normalized series id; only series with `count > 0` are shown; a series with no record gets a synthesized one (parent inferred from its members).
- **Technology counts** (`data.ts:1000-1011`): each entry's resolved technology ids are tallied; when counting against entries, only techs with `count > 0` are shown.

### 3.8 Garden link & graph inference

The garden derives structure from the notes themselves, all at build time:
- **Wikilink resolution** (`garden/index.ts:59-75`): `[[name]]` resolves (case-insensitive) by filename, title, slug, or alias; unresolved links render as a distinct "unresolved" style but still produce a slug.
- **Backlinks** ("linked mentions"): inbound edges computed from everyone's outbound links (`index.ts:98-104`).
- **Transclusion** `![[note]]` / `![[note#heading]]` / `![[note#^block]]`: substitutes the target's rendered HTML, recursively, **max depth 2** (`index.ts:107-115,141-159`).
- **Communities**: Louvain modularity clustering over the link graph; singleton/loose nodes → community `-1` (`garden/analytics.ts:62-197`).
- **Cluster label**: most-common tag shared by ≥2 members, else the highest-degree member's title (truncated to 26 chars) (`analytics.ts:242-253`).
- **Hubs**: nodes at/above the 90th-percentile degree (min threshold 5) (`analytics.ts:199-214`).
- **Orphans**: notes with zero links (`analytics.ts:211`).
- **Latent links** (suggested connections): unlinked 2-hop pairs scored by Adamic-Adar + `0.4 × shared-tag count`, top 16 (`analytics.ts:276-323`).
- **Co-tag edges** (second lens): connect notes sharing a tag, skipping tags with >30 members to avoid a hairball (`analytics.ts:255-274`).
- Determinism: a seeded PRNG (`mulberry32`) makes clustering reproducible across builds.

### 3.9 Public stack rewriting (taxonomy massaging for readers)

Before a work item's stack is shown publicly, it is rewritten (`data.ts:193-228, 948-991`):
- **Alias/expansion/suppression map** `publicStackTechnologyAliases`: e.g. `chatgpt → codex`, `cron → [github-actions, upstash]`, `ai-image-generation → kie-ai`, `css-variables → css`, `lucide-react / motion-react / react-router → react`; and **suppressions** mapping to `null` (dropped entirely): `longform`, `short`, `oauth`.
- **Per-project removals** `publicStackRemovalsByProject`: e.g. the `artlu-ai-rebuild-mockup` item has `spoolcast` stripped from its public stack.
- **Static thumbnail overrides** `projectThumbnailOverrides`: a fixed map from project public-key → a curated thumbnail, taking precedence over inferred thumbnails.

### 3.10 Thumbnail cascade (videos)

`projectVideoThumbnail` (`data.ts:805-813`): static override → matched video's `thumbnailUrl` → item's first screenshot → derived YouTube thumbnail (`oardefault.jpg` for short, `maxresdefault.jpg` for long).

---

## 4. Privacy / Visibility Rules

The single most important class of rules: **what prevents a record from being seen publicly.**

### 4.1 Work items — *strict allow-list*
A work item is public **only if `visibility === "public"`**. Anything else — `private`,
`gated`, empty, or missing — is **excluded**. Enforced twice: the build snapshot only bakes
`visibility === "public"` projects (`scripts/sync-firestore-snapshot.mjs:56-62`), and the read
layer filters to `=== "public"` again (`data.ts:467-488`).

### 4.2 Log entries — *deny "private"*
A log entry is hidden when `visibility === "private"`; otherwise shown (`data.ts:490-511`).
**Caveat / known inconsistency:** the build snapshot is *stricter* — it only bakes journal
docs with `visibility === "public"` (`sync-firestore-snapshot.mjs:59`). So in the shipped
(static) site a log entry effectively needs to be explicitly `"public"`; the more permissive
`!== "private"` rule only matters on the live-Firestore fallback path. **Rebuild decision
needed:** pick one rule. The safer, intended rule is **explicit `"public"` to publish.**

### 4.3 Product lines / series / technologies — *deny "private", default public*
These are shown unless `visibility === "private"`; a missing value means **public**
(`data.ts:519, 558, 597`; defaults file all set `"public"`).

### 4.4 Work-item files — *three-state*
(`src/components/ProjectDetail.astro:8, 72-89`)
- `visibility === "private"` → the file is **omitted entirely** (filtered before render).
- `visibility === "gated"` → the file is listed but shows a **"locked"** badge and the body is replaced with *"content locked — unlock to read"* (content never emitted). A `gated` file of `type: "link"` still exposes its URL.
- otherwise (public) → content/URL shown in full.

### 4.5 Garden notes — *deny drafts*
A note with `draft: true` is excluded from the build; drafts are only included when running in
DEV (`garden/index.ts:41-44`).

### 4.6 Admin surface — *auth + indexing*
- `/admin` and `/admin/settings` are `noindex` and **excluded from the sitemap** (`astro.config.mjs:8-10`, settings page `noindex`).
- Access requires Google sign-in **and** the email must equal the single allow-listed admin email; an authenticated-but-unauthorized user is immediately signed out (`src/scripts/admin.ts:643-668`).
- Stated authoring default: **new entries default to private** until explicitly shipped (admin settings copy; `admin.ts` new-entry form defaults `visibility: "private"`, `admin.ts:382-396`).

### 4.7 Embed safety (a visibility rule for *external* content)
A work item's `link` is only rendered as a live-demo iframe if it passes an **allow-list /
deny-list** check (`src/lib/format.ts:83-103`):
- **Denied always** (never embedded): `github.com`, `youtube.com`, `youtu.be`, `loom.com`, `screen.studio`, `twitter.com`, `x.com`, `linkedin.com`, `notion.so`, `drive.google.com`, `docs.google.com`.
- **Allowed** (embeddable hosts): `netlify.app/.com`, `vercel.app`, `github.io`, `pages.dev`, `render.com`, `railway.app`, `fly.dev`, `surge.sh`, several `manus*` hosts, `adsmetri.com`.
- Anything not on the allow-list is not embedded. `artifactHtml` demos are embedded in a **sandboxed** iframe (`allow-scripts allow-forms allow-popups`, no same-origin); URL embeds add `allow-same-origin`.

---

## 5. Cross-cutting rules

- **Campaign clock**: a fixed start date constant **`2026-03-18`** anchors all day math
  (`src/lib/format.ts:1-22`). `dayNum(date) = floor((date − start)/1day) + 1`, clamped to
  `≥ 1` (else `null`). The campaign target is **100**: `shipped = count of public items`,
  `toGo = max(0, 100 − shipped)` (`data.ts:1082-1096`).
- **Activity heatmap**: 20 weekly buckets ending today; each cell counts items shipped that
  week; `level = min(4, count)` (`data.ts:1098-1120`).
- **Sort order** (work items, `data.ts:681-687`): `date` desc → then `updatedAt` (fallback
  `date`) desc → then `sortOrder` asc. Logs sort by `date` → `createdAt` → `updatedAt` →
  title. Technologies sort by category order → `sortOrder` → name.
- **Slug rules** (`format.ts:3-10`): lowercase, trim, non-alphanumerics → `-`, trim leading/
  trailing `-`, truncate to **80 chars**. (Two other slugify copies disagree on apostrophes —
  see TECH_STACK §3.)
- **Light markdown** (`renderMarkdownLite`, `format.ts:57-81`): a tiny hand-rolled renderer
  for work-item/log bodies — paragraphs, `**bold**`, `*italic*`, `` `code` ``, `[text](http…)`
  links, `- ` lists, and `**…**`/`##`–`####` as `<h4>`. (The garden uses a full processor
  instead.)
- **Change journal**: every admin write also stamps `siteMeta/publishState` (`dirty: true`,
  increments a pending-change counter, records last-changed-by) and appends to a `changes`
  subcollection (`admin.ts:136-155`). Currently informational — nothing consumes it to
  publish (see TECH_STACK graveyard).

---

*Companion documents: `TECH_STACK.md` (physical targets, tokens, dead code) and
`BEHAVIOR_INVENTORY.md` (the same rules expressed as a testable checklist).*
