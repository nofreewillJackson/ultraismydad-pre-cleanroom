# artlu.ai Tracker Best Practices

## Video Guidebook Shipping

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

Use the one-command shipping flow:

```bash
node scripts/ship-video.mjs <videoId>
```

Before running it, the video must have one row in `scripts/video-shipments.json`.
Use `trackerDocId` when a Firestore tracker entry already exists, so the script updates that entry instead of creating a duplicate.

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

Build the guidebook package before updating Firestore as ready.

Use a dry run before a real ship when adding new metadata:

```bash
node scripts/ship-video.mjs <videoId> --dry-run
```

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

The public stack view should show exact technologies, not fake grouped stack nodes. The stack rail is viewport-aware until the visitor selects a node. Once a feature, series, project, showcase, or technology is selected, freeze the rail to that selection's exact stack so zooming or panning does not keep adding unrelated pills. Keep Firestore entries tied to exact tools. If grouped stack display comes back later, treat it as presentation-only and do not create fake technology docs for display groups.

Some public stack cleanup can happen in the resolver. Current examples: `chatgpt` resolves into `codex`, `ai-image-generation` resolves into `kie-ai`, `css-variables` resolves into `css`, React ecosystem helpers like `motion-react`, `lucide-react`, and `react-router` resolve into `react`, `cron` resolves into `github-actions` + `upstash`, and `oauth` is hidden from the public stack rail because it reads as an implementation protocol rather than a useful shipped-tool tag. Keep Firebase services separate (`firestore`, `firebase-auth`, `firebase-storage`, `firebase-realtime-db`) because they are distinct services. Keep the underlying Firestore docs exact; only collapse or hide tags when the public visualization becomes less clear.

Full process: [docs/stack-data-process.md](docs/stack-data-process.md)
