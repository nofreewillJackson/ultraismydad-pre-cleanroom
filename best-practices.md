# artlu.ai Tracker Best Practices

## Astro Tracker Publishing

The live site is an Astro static build. Firestore is the content source of truth, but public pages only update after a rebuild/deploy.

When changing tracker content through MCP, admin UI, or scripts:

- write the Firestore content first
- include stable references: `mainProjectId`, optional `seriesId`, readable `stack`, canonical `stackRefs`, and `tags`
- mark the site dirty after content changes
- run `npm run sync:data` to generate `src/data/tracker-snapshot.json`
- run `npm run build:strict` before deploy

Use `mainProjectId` for the project line: `artlu`, `spoolcast`, `pipelinecpc`, `adsmetri`, `vibeskill`, `costintel`, `research`, or `other`.

Use `seriesId` only for a real recurring line, such as `aninews` or `spoolcast-dev-log`. Standalone entries should connect directly to `mainProjectId`.

Use `stackRefs` for canonical stack graph links. Keep readable `stack` labels too, but do not rely on raw labels as the only stack source.

Use `tags` for public filtering and content grouping. Tags are looser than `stackRefs`; do not use tags as technology records.

For MCP-created projects, confirm the slug. If a slug is missing or wrong, run:

```bash
update_project("project name", { slug: "project-name-slug" })
```

Deploys must never publish from the old MCP backup. Netlify runs `npm run sync:data && npm run validate:stack && npm run build:strict`; if Firestore quota is exhausted, the snapshot cannot be generated, or stack metadata is invalid, deploy should fail instead of shipping stale counts.

Local `npm run build` may still fall back for debugging, but do not treat that output as launch-ready when the console says `Quota exceeded` or `using local backup`.

## Static Preview Thumbnails

Stack/list showcase previews should prefer static thumbnails over live embeds. Live iframes are slower, can show blank states, and can create scrollbars in small preview cards.

Use screenshots or curated thumbnails in `public/images/project-thumbnails/`, then reference them through the project `screenshots` field, main project `heroImg`, or a local thumbnail override when needed.

Never embed artlu.ai inside artlu.ai. Use a thumbnail for artlu.ai tracker previews.

## Mobile Stack View

The stack route has a purpose-built mobile view at `/`, not a redirect or fallback to list view.

At `<=720px`, render the mobile stack shell and hide the desktop canvas. The map nav item stays hidden on mobile, but the stack nav item should remain available.

The mobile stack home is tech-first: a 4-column grid of all public technology tiles in the static snapshot, then a tap-through tech panel with project pills and inline demos, updates, series, and episodes. Do not replace it with a curated subset.

Mobile stack category labels show build-time stats from the static snapshot. The first label uses the compact `FE · proj · upd · demo` form so it stays on one row; the other category labels use full words. Keep the final total tally build-time too. Do not add client-side Firestore reads for these counts.

Mobile stack should not show `other builds` as one mixed parent. Entries that resolve to `other` should behave as individual pseudo-project cards in the mobile tech panel, so each stack tile only expands to items that actually use that technology.

Mobile stack should also treat `research` entries as individual pseudo-project cards. Research is a category of separate experiments, not one product with shared child features. For example, tapping `TRIBE v2` should show the TRIBE v2 research entry directly, not every item under the broader research line.

Mobile demo cards should render the demo embed directly by default. Do not show a separate thumbnail plus a show-demo button in the same card.

Keep mobile stack data computed from the static tracker snapshot at build time. Do not add client-side Firestore reads for switching between list, map, stack, log, or research views.

## Video Guidebook Shipping

Uploading a video to the site is a different process from adding a normal tracker entry.

For guidebook-required videos, do not create the Firestore tracker entry by hand first. Create one video shipment metadata row, then run the shipping script. The metadata row is the single source of truth for both the guidebook page and the tracker entry.

The metadata row lives in `scripts/video-shipments.json` and should include the video identity:

- `id` / `videoId`: stable guidebook folder id under `public/videos/<videoId>/`
- `title`: public video title
- `desc`: one-sentence public description
- `format`: `short` or `long`
- `show` / `seriesId`: e.g. `aninews` or `spoolcast-dev-log`
- `sessionDate` or source folder id: where the finished video files live in `../spoolcast-content`
- `youtubeId`: public YouTube id
- `shippedAt`: publish date
- `durationSec`: duration when known
- `trackerDocId`: only when updating an existing Firestore tracker entry

That row answers both questions:

- tracker entry: what shipped?
- guidebook: where are the finished source materials and what should the public page be called?

A guidebook must not create a second Firestore tracker entry.

Correct wording:

- Spoolcast produces the source materials.
- Claude/Codex runs the shipping script.
- The artlu.ai shipping script builds the guidebook package from Spoolcast materials.
- The artlu.ai site build publishes that package as a crawlable guidebook page.

Do not say:

- Claude builds the guidebook.
- Spoolcast builds the guidebook.
- artlu.ai rebuilds the guidebook.

One shipped video should produce:

- 1 Firestore tracker entry
- 1 guidebook package folder
- 1 public video card

Use the one-command shipping flow after the metadata row exists:

```bash
node scripts/ship-video.mjs <videoId>
```

Use `trackerDocId` when a Firestore tracker entry already exists, so the script updates that entry instead of creating a duplicate. If there is no `trackerDocId`, the script should create exactly one tracker entry.

The script should:

- build `public/videos/<videoId>/bundle.json` and assets from `../spoolcast-content`
- update `public/videos/index.json`
- create or update exactly one Firestore tracker entry, using `trackerDocId` when available
- set `type: "video"`
- set `mainProjectId: "spoolcast"`
- set `seriesId` appropriately, such as `"aninews"` or `"spoolcast-dev-log"`
- set `videoId`
- set `youtubeId`
- set `videoFormat`
- set `guidebookStatus: "ready"`
- mark the site dirty for rebuild

Order matters:

1. add/update the shipment metadata row
2. run the shipping script
3. script builds the guidebook package first
4. script creates/updates the Firestore tracker entry second
5. script marks the site dirty
6. run `npm run sync:data`
7. run `npm run build:strict`
8. open the local guidebook/card and confirm the thumbnail renders
9. commit and push with GitHub Desktop
10. Netlify publishes the guidebook files and the refreshed tracker snapshot

Build the guidebook package before updating Firestore as ready. The dirty flag is expected: the static Astro site needs a new build so the guidebook page, video card, and tracker entry are published together.

If the guidebook cannot be created because source files are missing, do not mark the video fully shipped. Leave `guidebookStatus` as `pending` or `failed`, explain what source material is missing, and do not create duplicate tracker entries.

Use a dry run before a real ship when adding new metadata:

```bash
node scripts/ship-video.mjs <videoId> --dry-run
```

Before shipping, verify the thumbnail URL used in `public/videos/index.json` and `public/videos/<videoId>/bundle.json` loads a real image. If YouTube `maxresdefault.jpg` shows the gray placeholder or returns 404, use a working thumbnail URL such as `hqdefault.jpg` or a curated local thumbnail.

Full handoff: [docs/artlu-video-shipping-flow.md](docs/artlu-video-shipping-flow.md)

## Future Spoolcast Export Format

A portable Spoolcast case-study export may be useful later if Spoolcast has multiple external consumers.

That is not the current shipping path. The current path is one artlu.ai-side shipping script that reads `../spoolcast-content` directly.

## Main Project Metadata

Parent project / line metadata lives in Firestore collection `mainProjects`.

Tracker entries should reference these docs with `mainProjectId` or `parentProjectId`. Do not hardcode project logos, hero thumbnails, site links, repo links, demo links, descriptions, or display order in individual views.

Use the local fallback file only as seed data:

```bash
npm run seed:main-projects -- --dry-run
npm run seed:main-projects
```

The list, map, and stack views should all read the same `getMainProjects()` output.

Local and CI builds should read `mainProjects` with Firebase Admin credentials. Public Firestore rules may also allow reading public `mainProjects`, but the static build should not rely on client-side DB access.

## Series / Subgroup Metadata

Series and subgroup metadata lives in Firestore collection `series`.

Use `seriesId` only when an entry belongs to a real recurring line, such as `aninews` or `spoolcast-dev-log`. Standalone entries should leave `seriesId` empty and connect directly to their `mainProjectId`.

Use the local fallback file only as seed data:

```bash
npm run seed:series -- --dry-run
npm run seed:series
```

The map and stack views should read series names, descriptions, sort order, and parent project references from `getSeries()`.

## Technology / Stack Metadata

Stack metadata lives in Firestore collection `technologies`.

Tracker entries should reference canonical technology docs with `stackRefs`. Keep the old `stack` string array as a readable fallback during migration, but do not rely on raw stack labels for the public stack map.

Use the local fallback file only as seed data:

```bash
npm run seed:technologies -- --dry-run
npm run seed:technologies
```

Before changing project `stackRefs` and canonical readable `stack` labels, run the audit first:

```bash
npm run audit:stack -- --firestore --write
npm run migrate:stack-refs
```

Only run the actual Firestore migration after reviewing `docs/stack-audit.md`:

```bash
npm run migrate:stack-refs -- --apply
```

Future agents should choose existing technology ids from `technologies` instead of inventing new free-text stack names. If a new real tool appears, add it to `technologies` first, then reference its id from tracker entries.

The MCP exposes `list_technologies` and `upsert_technology`. New tracker entries should include both readable `stack` labels and canonical `stackRefs`.

Do not add `Other / unmapped`, `other`, or `unmapped` to public tracker entries. Those labels are temporary audit placeholders only. If a real tool is missing, add or update a technology record first, then use that specific technology id. If the label is a concept rather than a tool, keep it in the description or tags, not the stack.

Deploys run stack validation after `npm run sync:data` and before `npm run build:strict`:

```bash
npm run validate:stack
```

This validation should fail when a public tracker entry has an unknown stack label, an unknown `stackRefs` id, or the forbidden `other` placeholder. Fix the Firestore data instead of bypassing validation.

The public stack view should show exact technologies, not fake grouped stack nodes. The stack rail is viewport-aware until the visitor selects a node. Once a feature, series, project, showcase, or technology is selected, freeze the rail to that selection's exact stack so zooming or panning does not keep adding unrelated pills. Keep Firestore entries tied to exact tools. If grouped stack display comes back later, treat it as presentation-only and do not create fake technology docs for display groups.

Some public stack cleanup can happen in the resolver. Current examples: `chatgpt` resolves into `codex`, `ai-image-generation` resolves into `kie-ai`, `css-variables` resolves into `css`, React ecosystem helpers like `motion-react`, `lucide-react`, and `react-router` resolve into `react`, `cron` resolves into `github-actions` + `upstash`, and `oauth` is hidden from the public stack rail because it reads as an implementation protocol rather than a useful shipped-tool tag. Keep Firebase services separate (`firestore`, `firebase-auth`, `firebase-storage`, `firebase-realtime-db`) because they are distinct services. Keep the underlying Firestore docs exact; only collapse or hide tags when the public visualization becomes less clear.

Full process: [docs/stack-data-process.md](docs/stack-data-process.md)
