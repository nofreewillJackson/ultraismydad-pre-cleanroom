# Spoolcast Case Study Export Format

## Goal

Spoolcast should export a portable video case-study package that other users are likely to find useful.

This should not be an artlu.ai-specific guidebook format. Spoolcast owns video production metadata. artlu.ai is only one importer/consumer of that export.

## Product Boundary

Spoolcast should handle:

- final video metadata
- poster and thumbnail assets
- transcript and captions
- scene/beat list
- source links
- prompts and model metadata
- character and style references
- render/audit metadata
- cost/runtime summaries

Spoolcast should not handle:

- Firestore tracker writes
- artlu.ai deployment
- artlu.ai project schema
- tracker/card duplication logic
- Netlify rebuild triggers

artlu.ai should handle:

- importing the Spoolcast export
- copying or adapting assets into the artlu.ai public site
- linking one Firestore tracker entry to the imported video package
- rendering list/map/stack/showcase pages
- rendering SEO pages and structured metadata

## Core Rule

One shipped video should be one tracker entry.

The Spoolcast case-study package is extra production detail attached to that entry. It should never create a second Firestore tracker entry.

Normal path:

```text
ship video -> export case-study package -> artlu importer updates/creates one Firestore entry marked ready
```

Fallback path:

```text
manual Firestore video entry -> guidebookStatus pending -> importer attaches package later
```

## Export Shape

Spoolcast should export:

```text
exports/
  <video-id>/
    case-study.json
    assets/
      poster.webp
      scenes/
        01.webp
        02.webp
      characters/
        sundar-pichai.webp
      style/
        anchor.webp
```

The package could also be zipped as:

```text
<video-id>-case-study.zip
```

## Proposed JSON Contract

```json
{
  "schema": "spoolcast.case-study.v1",
  "id": "news-anime-bot-2026-05-18",
  "title": "Google Closes In On Nvidia As World's Most Valuable Company",
  "description": "Daily AI news satire about Google closing in on Nvidia.",
  "format": "short",
  "publishedAt": "2026-05-18",
  "durationSec": 63,
  "video": {
    "youtubeId": "zsYb_mliXnc",
    "youtubeUrl": "https://www.youtube.com/watch?v=zsYb_mliXnc",
    "tiktokUrl": "https://www.tiktok.com/@...",
    "mp4Url": "",
    "posterUrl": "assets/poster.webp"
  },
  "summary": {
    "hook": "The company written off in the AI race is now closing in on the throne.",
    "topic": "AI market narrative reversal",
    "style": "anime news satire",
    "tools": ["Seedance 2.0 Fast", "Google Cloud TTS", "ffmpeg"],
    "cost": "~$0.38"
  },
  "scenes": [
    {
      "n": 1,
      "title": "Arena open",
      "durationSec": 5,
      "thumbnailUrl": "assets/scenes/01.webp",
      "narration": "For two years, the agreed-upon story was that Google had lost the AI race.",
      "prompt": "Anime cel-shaded arena at night...",
      "model": "Seedance 2.0 Fast",
      "characterRefs": ["sundar-pichai"],
      "sourceRefs": ["cnbc-alphabet-nvidia"]
    }
  ],
  "sources": [
    {
      "id": "cnbc-alphabet-nvidia",
      "title": "A major Mag 7 shift, with Alphabet's market cap set to pass Nvidia's",
      "publisher": "CNBC",
      "url": "https://..."
    }
  ],
  "assets": {
    "characters": [
      {
        "id": "sundar-pichai",
        "name": "Sundar Pichai",
        "imageUrl": "assets/characters/sundar-pichai.webp"
      }
    ],
    "styleRefs": [
      {
        "id": "anime-news-anchor",
        "name": "Anime news anchor style",
        "imageUrl": "assets/style/anchor.webp"
      }
    ]
  },
  "transcript": "Full transcript text...",
  "quality": {
    "checks": [
      {
        "name": "source coverage",
        "status": "pass",
        "notes": "All factual claims have source references."
      }
    ]
  }
}
```

## Required Fields

- `schema`
- `id`
- `title`
- `format`
- `publishedAt`
- `durationSec`
- `video`
- `transcript`

## Optional But Useful Fields

- `description`
- `summary`
- `scenes`
- `sources`
- `assets.characters`
- `assets.styleRefs`
- `quality`
- `video.youtubeId`
- `video.tiktokUrl`
- `video.mp4Url`
- `video.posterUrl`

## artlu.ai Import Mapping

artlu.ai can map the generic export into its own tracker model:

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

The Firestore entry remains the single tracker record. The imported Spoolcast case-study package becomes the guidebook data for that record.

## Why This Is Generic

Other Spoolcast users may use the package for:

- a portfolio case-study page
- a client production report
- a prompt library
- a source/audit appendix
- a YouTube description generator
- a production analytics dashboard
- a reproducibility archive

Consumers can ignore fields they do not need. The contract should describe video production, not artlu.ai tracking.

