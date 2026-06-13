# BEHAVIOR_INVENTORY.md — Observable Capabilities

> Cleanroom extraction artifact. A flat, exhaustive checklist of **observable domain and
> user behaviors** — what the system *does*, not how. Each line is a candidate for one TDD
> cycle (write the failing test first). Trust-boundary / error-path items describe behaviors
> whose expected outcome is *rejection* or *hiding*.
>
> Architectural mechanics (databases, adapters, frameworks, build pipeline) are **excluded by
> design** — those live in `TECH_STACK.md`. The *rules* behind these behaviors are detailed in
> `DOMAIN_PRIMER.md`.

---

## A. Slugs, identity & naming

- [ ] System generates a work-item slug from its title when none is provided
- [ ] System generates a log-entry slug from `day-{day}-{title}` when none is provided
- [ ] System lowercases, hyphenates, trims, and truncates a slug to 80 characters
- [ ] System gives an untitled work item the title "untitled project"
- [ ] System gives an untitled log entry the title "untitled entry"
- [ ] System de-duplicates colliding log slugs by appending a short id suffix to later ones
- [ ] System title-cases a series name from its id when no name is given
- [ ] System resolves a series alias to its canonical id (e.g. `news-anime-bot` → `aninews`)

## B. Product-line (main project) inference

- [ ] System keeps an explicit product-line assignment when one is set
- [ ] System falls back to the parent assignment when no explicit line is set
- [ ] System infers a work item's product line from its text when none is assigned
- [ ] System routes a "chat to video workflow" / "session to video" item to spoolcast
- [ ] System routes a "context gate" / "hallucination experiment" / "tribe v2" item to research
- [ ] System routes an item whose title contains "artlu" to the artlu line
- [ ] System routes "google ads" / "pipelinecpc" items to pipelinecpc
- [ ] System routes "meta ads" / "adsmetri" items to adsmetri
- [ ] System routes "vibeskill" / "skill-tree" items to vibeskill
- [ ] System routes "costintel" / "fulfillment" items to costintel
- [ ] System assigns a work item with no recognizable line to the catch-all "other" line
- [ ] System applies the inference keywords in a fixed priority order (earlier rules win)

## C. Series inference

- [ ] System keeps an explicit series assignment when one is set
- [ ] System infers a series from text (aninews / dev-log / videos / spoolcast-features)
- [ ] System attaches an *inferred* series only when the item belongs to the spoolcast line
- [ ] System discards an inferred series for non-spoolcast items
- [ ] System always honors an explicitly set series regardless of line

## D. Video detection & matching

- [ ] System treats an item of type "video" as a video
- [ ] System treats an item carrying a video id / youtube id / tiktok id / video format as a video
- [ ] System treats a spoolcast item with a series and media/youtube as a video
- [ ] System matches a work item to a shipped video by explicit video/bundle id
- [ ] System matches a work item to a shipped video by shared YouTube id
- [ ] System matches a work item to a shipped video by same ship date + title-token overlap
- [ ] System uses a lower title-overlap threshold when both sides infer the same series
- [ ] System ignores stop-words (and keeps numeric tokens) when scoring title overlap
- [ ] System parses a YouTube id from a bare id or watch / shorts / embed / youtu.be URL
- [ ] System defaults an aninews video's format to "short"
- [ ] System defaults any other video's format to "long"
- [ ] System marks a video item "ready" once matched to a shipped bundle, else "pending" when it has a video id
- [ ] System picks a video thumbnail by cascade: static override → bundle thumb → screenshot → derived YouTube thumb

## E. Stack / technology taxonomy

- [ ] System resolves free-text stack labels and refs to canonical technology ids (case/slug-insensitive, via aliases)
- [ ] System rewrites public stack labels through the public alias map (e.g. chatgpt → codex)
- [ ] System expands a stack label that maps to multiple technologies (e.g. cron → github-actions + upstash)
- [ ] System suppresses non-technology stack labels from the public view (e.g. longform, short, oauth)
- [ ] System removes specifically-blocked stack tags from specific items' public stacks
- [ ] System defaults a technology with no category to the "media" category
- [ ] System counts how many public entries use each technology
- [ ] System orders technologies by category, then sort order, then name

## F. Grouping, counts & stats

- [ ] System counts public entries per product line and hides empty lines
- [ ] System shows the "other" line only when it has at least one public entry
- [ ] System counts public entries per series and hides empty series
- [ ] System synthesizes a placeholder line/series for an unknown id that has entries
- [ ] System computes the current day number from the fixed start date
- [ ] System reports "day N / 100", count shipped, and count "to go" (100 − shipped, floored at 0)
- [ ] System builds a 20-week activity heatmap counting items shipped per week
- [ ] System sorts work items by date desc, then last-updated, then sort order
- [ ] System sorts log entries by date, then created, then updated, then title

## G. Reader — browsing & navigation

- [ ] User can view the home stack/relationship view of all public entries
- [ ] User can switch between stack, list, and map views of the same entries
- [ ] User returns to their last-used index view via a "back to projects" link
- [ ] User can toggle between light and dark themes
- [ ] System persists the chosen theme across visits
- [ ] System defaults to dark on desktop and light on mobile when no theme is saved
- [ ] User sees a progress readout (day, shipped, to-go) and an activity heatmap in the header
- [ ] User can navigate to log, research, and garden sections
- [ ] User gets a 404 page for unknown routes
- [ ] Visitor is redirected from legacy paths (/journal, /journal/*, /dashboard) to current ones

## H. Reader — work-item detail

- [ ] User can open a work item's detail page by slug
- [ ] User sees the item's day number, formatted date, and status
- [ ] System shows a "live demo" tab by default when a demo is available, otherwise "info"
- [ ] User can view an inline live demo when the item has self-contained artifact HTML
- [ ] User can view an embedded live demo when the item's link is an embeddable host
- [ ] User sees the item's long description rendered as light markdown
- [ ] User sees the stack as chips, screenshots as a grid, and media as an embed
- [ ] User can open external site and repo links
- [ ] User sees a "files" tab only when the item has a repo

## I. Reader — log / journal

- [ ] User can read the list of public log entries, newest first
- [ ] User can filter the log by author: all, by the AI, by the human
- [ ] System treats a log entry with no author as authored by the AI
- [ ] System reflects the active filter in the URL and updates the visible count
- [ ] System shows a tailored empty-state message when no entries match (special copy for "human")
- [ ] User can follow a log entry's project references to the linked work items
- [ ] System resolves a project reference via legacy aliases, exact key, or slug
- [ ] System renders an unresolved project reference as plain text (no broken link)
- [ ] User can open a log entry's permalink

## J. Reader — research & feeds

- [ ] User can read the research list and individual research articles
- [ ] System validates research front-matter (title, description, date required) at build
- [ ] User/agent can fetch an RSS feed of research articles, newest first
- [ ] Agent can fetch an llms.txt index of the site's main pages, research, recent projects, and videos
- [ ] Crawler can fetch robots.txt pointing at the sitemap

## K. Reader — videos

- [ ] User can open a video page by id
- [ ] System renders a short-format video page differently from a long-format one
- [ ] System back-fills missing video identity (youtube/tiktok/thumbnail) from the video bundle

## L. Reader — digital garden

- [ ] User can browse the garden index of notes
- [ ] User can read a garden note rendered with Obsidian-flavored markdown
- [ ] User can follow a wikilink to another note
- [ ] System renders a wikilink to a non-existent note in a distinct "unresolved" style
- [ ] User sees a note's backlinks ("linked mentions") with count
- [ ] User sees an empty-state when no notes link to the current note
- [ ] System transcludes an embedded note (whole, by-heading, or by-block), bounded in recursion depth
- [ ] User can filter garden notes by tag, reflected in the URL and the visible count
- [ ] User can explore an interactive link graph of all notes
- [ ] User can explore a local subgraph of the current note and its neighbors
- [ ] System groups notes into communities and labels each cluster
- [ ] System marks orphan notes (no links) and hub notes (high degree) distinctly
- [ ] System suggests latent links between unlinked but related notes
- [ ] System offers a co-tag lens connecting notes that share tags
- [ ] User can render callouts, collapsible callouts, math, footnotes, task lists, highlights, and mermaid diagrams in a note
- [ ] System strips Obsidian comments (%%…%%) from rendered output
- [ ] System re-themes highlighted code and mermaid diagrams when the site theme toggles

## M. Authoring (admin)

- [ ] Operator can sign in to the admin with Google
- [ ] Operator can create a new work item
- [ ] Operator can edit an existing work item
- [ ] Operator can toggle a work item between public and private
- [ ] New work items default to private until explicitly made public
- [ ] Operator can pick canonical technologies for a work item via a searchable picker
- [ ] Operator can create or edit a technology (name, category, aliases, order, visibility)
- [ ] Operator can hide a technology (set it private)
- [ ] Operator can assign a work item to a product line and series via dependent dropdowns
- [ ] Operator sees dashboard stats (lines, series, entries, launched, public counts)

## N. Trust boundaries & error paths

- [ ] System publishes a work item only when its visibility is exactly "public"
- [ ] System never publishes a work item that is private, gated, or unset
- [ ] System hides a log entry marked private
- [ ] System hides a product line, series, or technology marked private
- [ ] System excludes a garden note marked draft from the published site
- [ ] System omits a private file from a work item's detail entirely
- [ ] System shows a gated file as "locked" and never emits its content
- [ ] System refuses to embed a link from a denied host (github, youtube, loom, x, notion, drive, etc.)
- [ ] System embeds only links from the allow-listed hosts; everything else is not embedded
- [ ] System sandboxes an artifact-HTML demo (no same-origin) when embedding it
- [ ] System rejects the build when a public item's stack references an unknown technology
- [ ] System rejects the build when a public item's stack uses the forbidden "other" placeholder
- [ ] System rejects an admin save with no work-item name
- [ ] System rejects an admin technology save with no id
- [ ] System signs out an authenticated user whose email is not the allow-listed admin
- [ ] System keeps the admin pages out of the sitemap and marked noindex
- [ ] System excludes non-public records when producing the published data set

---

*Companion documents: `DOMAIN_PRIMER.md` (the rules in detail) and `TECH_STACK.md`
(physical targets, design tokens, dead code).*
