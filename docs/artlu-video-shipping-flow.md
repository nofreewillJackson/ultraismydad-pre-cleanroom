# artlu.ai Video Shipping Flow

## Current Decision

The guidebook is built by an artlu.ai-side shipping script.

Do not say Claude builds the guidebook. Do not say Spoolcast builds the guidebook. They do not.

Accurate wording:

```text
Claude runs the shipping script.
The artlu.ai shipping script builds the guidebook package from Spoolcast materials.
The artlu.ai site build publishes that package as a crawlable guidebook page.
```

## Responsibility Split

Spoolcast produces source materials:

- rendered video
- script and narration
- scene/beat data
- transcript
- source links
- prompts
- character references
- thumbnails or frame sources
- render/audit metadata

Claude/Codex can operate the process:

- run the shipping command
- inspect failures
- update metadata if needed
- verify the generated output

The artlu.ai shipping script builds the guidebook:

- reads the Spoolcast source materials
- writes `public/videos/<videoId>/bundle.json`
- writes/copies `public/videos/<videoId>/assets/...`
- updates `public/videos/index.json`
- creates or updates one Firestore tracker entry
- marks that entry as `guidebookStatus: "ready"`
- marks the static site as needing a rebuild

Astro/Netlify publishes the page:

- reads Firestore
- reads `public/videos/<videoId>/bundle.json`
- renders `/video/<videoId>/`
- renders the same video in list/map/stack/showcase

## Core Rule

One shipped video should produce:

```text
1 Firestore tracker entry
1 guidebook package folder
1 public video card
```

It should not produce:

```text
2 Firestore tracker entries
2 public cards
```

The guidebook is attached to the tracker entry. It is not a second tracker entry.

## Flow

```text
Spoolcast materials
  -> artlu.ai ship-video script
  -> guidebook package
  -> Firestore tracker entry
  -> artlu.ai static site build
  -> public guidebook page
```

## One-Command Goal

The operator should run one command from the artlu.ai repo:

```bash
node scripts/ship-video.mjs <videoId>
```

The command reads shipping metadata from:

```text
scripts/video-shipments.json
```

If the Firestore tracker entry already exists, that row must include `trackerDocId`.
That is what prevents the guidebook from becoming a duplicate tracker entry.

Example:

```bash
node scripts/ship-video.mjs news-anime-bot-2026-05-18
```

That one command should do the internal work:

1. Resolve the matching Spoolcast session/show folder.
2. Read the source materials.
3. Update or insert the matching row in `scripts/shipped-videos.json`.
4. Run or reuse the existing `scripts/sync-video.mjs <videoId>` guidebook builder.
5. Confirm `public/videos/<videoId>/bundle.json` exists.
6. Confirm the thumbnail URL renders a real image, not a YouTube placeholder.
7. Update the existing Firestore tracker entry by `trackerDocId`, or create one only when no existing entry is supplied.
8. Set video tracker fields.
9. Mark the site dirty for rebuild.

Optional checks, like `npm run build`, can happen inside the script or after it. They are validation, not the shipping action.

Dry-run first when adding a new video:

```bash
node scripts/ship-video.mjs <videoId> --dry-run
```

Thumbnail check: open the local guidebook/card before commit. If YouTube `maxresdefault.jpg` is missing or shows the gray placeholder, switch the bundle/index thumbnail to a working URL such as `hqdefault.jpg` or a curated local thumbnail.

## Firestore Fields

The single Firestore tracker entry should include:

```json
{
  "type": "video",
  "mainProjectId": "spoolcast",
  "seriesId": "aninews",
  "videoId": "news-anime-bot-2026-05-18",
  "youtubeId": "zsYb_mliXnc",
  "videoFormat": "short",
  "guidebookStatus": "ready"
}
```

For long videos:

```json
{
  "type": "video",
  "mainProjectId": "spoolcast",
  "seriesId": "spoolcast-dev-log",
  "videoId": "spoolcast-dev-log-07",
  "youtubeId": "...",
  "videoFormat": "long",
  "guidebookStatus": "ready"
}
```

## Important Ordering

Build the guidebook package first.

Then update Firestore as ready.

Reason:

```text
Firestore should not say "guidebook ready" before public/videos/<videoId>/bundle.json exists.
```

Correct order:

```text
build guidebook package -> update Firestore -> trigger site rebuild
```

Incorrect order:

```text
update Firestore -> trigger guidebook build
```

## What artlu.ai Does

artlu.ai is the publisher/display site.

It:

- stores public tracker metadata in Firestore
- stores generated guidebook package files in the repo
- builds static HTML pages from Firestore plus guidebook files
- displays videos in list/map/stack/showcase
- prevents duplicates by treating Firestore as the canonical tracker entry

It does not:

- generate the video
- decide video content
- replace Spoolcast
- create a second entry for guidebooks

## What To Tell Agents

When asking Claude/Codex to ship a video, use this instruction:

```text
Ship this Spoolcast video to artlu.ai.

Important: Claude does not manually build the guidebook, and Spoolcast does not build the guidebook. The artlu.ai shipping script builds the guidebook package from Spoolcast source materials.

Run the one-command shipping flow from:
/Users/ralphxu/Documents/Projects/artluai-tracker

Command:
node scripts/ship-video.mjs <videoId>

The script should:
- build public/videos/<videoId>/bundle.json and assets from ../spoolcast-content
- update public/videos/index.json
- create or update exactly one Firestore tracker entry
- set type: "video"
- set mainProjectId: "spoolcast"
- set seriesId appropriately, such as "aninews" or "spoolcast-dev-log"
- set videoId
- set youtubeId
- set videoFormat
- set guidebookStatus: "ready"
- mark the site dirty for rebuild

Do not create a second Firestore tracker entry for the guidebook.
```

## Future Note

A portable Spoolcast export format may be useful later if Spoolcast has multiple external consumers.

For now, that is not the main path. The practical current path is one artlu.ai-side shipping script that reads `../spoolcast-content` directly.
