# DOMAIN_PRIMER.md — what this system actually is, for the operator

A long-form orientation written for the one human who runs this thing. Not the rebuild
spec (`CLEANROOM_SPEC.md` is the agnostic "what & why"); not the inventory (`TECH_STACK.md`
is the concrete "how"). This document answers a narrower, more personal question: **when you
sit down at this system, what are you actually doing, where does your work physically go, and
why is it built the way it is.**

Everything below is grounded in the code as it stands. File:line citations point at the exact
mechanic so you can check any claim. No analogies — the entities are described as themselves.

---

## 0. The one-sentence frame

You are one person running a **build-archive**: a stream of shipped work, catalogued as it
happens over a fixed 100-day campaign, and published as a fast public website.

Two facts about that frame drive every design decision, and they pull in opposite directions:

1. **Authoring is messy, private, and high-frequency.** You create half-finished things,
   rename them, reclassify them, hide them, let an agent batch-write them. You do this every day.
2. **Delivery must be clean, public, and stable.** An audience is watching a 100-day run. The
   site has to be fast, always-up, and must never leak your real identity or unrelated ventures.

The entire architecture exists to let those two activities run at full speed **without touching
each other**. That separation is the thing to understand. The three sections below build up to it:
first the units you author (§1), then how your work moves from private to public (§2), then why
that movement is split the way it is (§3).

---

# Part 1 — The human reality of the primitives

You author content in exactly **three** forms. They are not three flavors of one thing; they are
three genuinely different acts, with different substrates, different lifecycles, and different
consequences. This section is about what you are *physically doing* in each case.

A fast orientation before the detail:

| | **Work Item** | **Log Entry** | **Research Doc** |
|---|---|---|---|
| What it is | A shipped thing (project or video) | A dated narrative post about the work | A long-form written piece |
| Where it lives | Firestore `projects` collection | Firestore `journal` collection | A `.md` file in the git repo |
| How you create it | `/admin` form, or an MCP agent | `/admin` journal form | You write a file and commit it |
| Counts toward the 100? | **Yes** | No | No (surfaces on `/research`) |
| Has a status lifecycle? | Yes (idea→building→launched→abandoned) | No | No |
| Schema enforced by | Convention (Firestore is schemaless) | Convention | **Zod, at build time** |
| Type in code | `Project` (`src/lib/data.ts:20`) | `JournalEntry` (`src/lib/data.ts:56`) | content collection (`src/content.config.ts:5`) |

The reason there are three is not arbitrary. **Each primitive is matched to the natural authoring
substrate for its kind of content.** A structured record with a lifecycle wants to be a database
row. A long document wants to be a file. A short dated note wants to be a lightweight row. Forcing
all three into one mechanism would impose the wrong friction on two of them. The rest of Part 1 is
why each match is the right one.

## 1.1 Work Item — the atom that counts

**What you are physically doing.** You finished (or started, or abandoned) a piece of work. You
open `/admin`, sign in with Google — the console is locked to one allow-listed email; an
authenticated-but-unauthorized account is immediately signed back out — and you fill a form:
name, one-line description, long writeup, date, status, visibility, tags, stack, links, an optional
inline HTML demo, which product line it belongs to, and optionally which series. You click save.

In the code, that save is `saveProject` (`src/scripts/admin.ts:440`). A new item is an
`addDoc(collection(db, "projects"))` (`admin.ts:464`); an edit is an `updateDoc` (`admin.ts:470`).
The slug is generated from the name right there — lowercased, non-alphanumerics collapsed to
hyphens, capped at 80 chars (`slugify`, `src/lib/format.ts:3`). The stack field resolves your
tag-picker selections into canonical technology IDs (`stackRefs`) plus their display names
(`admin.ts:449`).

**Why the work item is the center of everything.** It is the *atom* — the unit the whole campaign
is counted in. The headline math reads directly off the set of public work items:

- `shipped = count of public work items` (`getStats`, `src/lib/data.ts:1082-1095`: `shipped:
  projects.length`)
- `to go = max(0, 100 − shipped)` (same function, `data.ts:1092`)
- `active days = count of distinct ship dates` (`data.ts:1093`, `byDay.size`)
- the activity heatmap is built from **ship dates of work items** — not code commits — because the
  author does not code (`buildActivity`, `data.ts:1098`; rule stated in `CLAUDE.md`)

So when you create a public work item, you are not "adding a row." You are advancing the only number
the campaign tracks. Nothing else you author moves that number.

**The two-axis lifecycle.** A work item has two independent state axes, and keeping them separate in
your head is essential:

- **Status** — where the *work* is: `idea → building → launched → abandoned`. This is editorial; it
  describes the thing.
- **Visibility** — who may *see* it: `public` / `private`. This is the privacy boundary. It is
  enforced once, at export (covered in §2). You flip it with one click (`toggleVisibility`,
  `admin.ts:480`), and that flip is itself a content change that marks the site dirty
  (`admin.ts:487`).

These never interact. A `launched` item can be `private` (done, but you haven't published it). An
`idea` can be `public` (a stub you want visible). The form lets you set them independently because
they answer different questions.

**Kind is derived, not chosen.** A work item is sometimes a "project" and sometimes a "video," but
you do not pick a rigid type. The system decides at render time: an item is treated as a video if it
is explicitly typed so, carries a video ID / YouTube ID / TikTok URL, or matches a produced video by
date-and-title overlap (`isProjectVideoEntry`, `data.ts:787`; the matching itself in
`findVideoForProject`, `data.ts:815`, and `titleOverlapScore`, `data.ts:840`). This is why one
primitive covers both: a "video" is just a work item that happens to have a video realization. The
day-to-day act — open the form, fill it, save — is identical either way.

**Concrete lifecycle, start to finish.** You build a dashboard mockup. You add it as a *private*
work item with status `building` so you can keep editing without anything appearing publicly. You
paste the self-contained HTML into `artifactHtml` so the live-demo surface renders it inline
(`artifactHtml` takes priority over an external `link`). Over a few sessions you refine the long
description, fix the stack tags, assign it to the `adsmetri` product line. When it's ready you flip
status to `launched` and visibility to `public`. None of this is on the website yet — it is all in
the live store. It goes public only when you bake (§2). At that point it gets a permalink at
`/project/<slug>`, a JSON-LD `CreativeWork` block, a day number (its date minus the March 18 start),
a heatmap cell, and +1 on `shipped`.

> **Note for agent-authored items.** An MCP agent can write the same `projects` documents you do.
> But slug generation lives in the *frontend* save path, not in Firestore, so an agent-created item
> has no slug until one is set explicitly — this is the documented gotcha in `CLAUDE.md` ("projects
> added via MCP don't get slugs auto-generated"). The work item is the one primitive with two
> authoring doors (you and agents), and that asymmetry is the price.

## 1.2 Log Entry — the narration that does not count

**What you are physically doing.** You want to *write about* the work — a dev-log, a reflection, a
note on a decision. You open the journal section of `/admin` and fill a lighter form: a day number, a
title, a body, a date, an author (`ai` or `human`), a visibility, optional cross-links to work items,
and tags. You save. It lands in the `journal` collection as a `JournalEntry` (`data.ts:56`).

**Why this is a separate primitive from a work item.** A log entry is *commentary about* deliverables,
not a deliverable. The differences are concrete and intentional:

- **It does not count.** `shipped` is `projects.length` — journal entries are absent from that
  calculation entirely. You can write ten log entries in a day and the campaign counter does not move.
  This is correct: the challenge is "100 things built," not "100 things written about."
- **It carries authorship.** Every entry is attributed to `ai` or `human` and the public log lets a
  visitor filter by that (`/log` author filter). A work item has no author field — it's assumed to be
  the operator's work. The log explicitly exposes the human/AI split as a first-class fact.
- **Its identity is date-derived.** The slug is built from `day-<day>-<title>` rather than from the
  title alone (`normalizeJournal`, `data.ts:388`). Because two entries can collide on that, there is a
  de-duplication pass that appends a 6-char ID fragment to the second one (`withUniqueJournalSlugs`,
  `data.ts:646-654`). Work items don't need this — their titles are distinct product names.
- **It points outward.** A log entry carries `projectRefs` that link to the work items it discusses
  (`data.ts:67`, resolved in `src/lib/projectRefs.ts`). The relationship is one-directional narration:
  the post references the work, not the reverse.

**Concrete lifecycle.** You ship the dashboard work item on day 47. The next morning you write a log
entry: title "why I rewrote the payment engine," author `human`, dated, with a `projectRef` pointing
at the dashboard. You save it `public`. It surfaces at `/log` and `/log/<slug>` after the next bake.
It is fully expanded inline — the system never truncates entries with a "read more," because most
items only ever get one or two (`CLAUDE.md`, Journal section). The campaign counter is unchanged; what
changed is the *story around* the count.

## 1.3 Research Doc — the long-form piece that lives in the repo, not the database

**What you are physically doing.** This one is unlike the other two: **you never open the admin UI.**
You create a Markdown file — `src/content/research/<topic>.md` — with front-matter and a body. You
write it in your editor with full tooling. You commit it to git. That commit is the entire act.

The front-matter is schema-enforced by Zod at build time (`src/content.config.ts:5-15`):

```
title:       string        (required)
description: string        (required)
date:        string        (required)
tags:        string[]      (default [])
demoUrl:     url           (optional)
repoUrl:     url           (optional)
```

If you omit `title`, `description`, or `date`, **the build fails.** That is the opposite of the
work-item and log-entry experience, where Firestore accepts whatever you write and the data layer
papers over gaps at read time (`normalizeProject`, `data.ts:261`, coerces missing arrays to `[]`,
invents a slug, defaults a name). Research docs are strict because they are authored in files where a
schema check is cheap and a typo is a one-line fix.

**Why this is a third primitive and not "a work item with a long body."** Because the *artifact is the
prose*. A research writeup (the existing one, `context-gate.md`, is ~30 KB) is a document you want to
draft, diff, review, and version in source control — not type into a database textarea and round-trip
through an export. The natural unit for that content is a file, and the publish trigger for a file is
a git commit. Routing it through Firestore and the admin form would add friction (a form, a live-store
write, a dirty-flag, a bake) and buy nothing. So research docs get their own channel: file-based,
git-versioned, schema-validated, no admin UI, no Firestore.

**How it surfaces, and the one piece of cross-channel logic.** Research docs render at
`/research/<slug>` (slug = filename minus `.md`) and are listed on `/research` alongside work items
whose product line is `research` (`src/pages/research.astro:8,34-36`). To avoid showing the same thing
twice, a research-line *work item* whose `link` or `repo` matches a research doc's `demoUrl` or
`repoUrl` is suppressed from that page (`research.astro:15,36`). This is the only place the file
channel and the database channel have to be reconciled, and it's done by URL match.

**Concrete lifecycle.** You run an experiment on model hallucination. You write
`src/content/research/context-gate.md`: front-matter with title, description, today's date, a few
tags, and the demo URL. You write the analysis in Markdown. You `git commit` and push. On the next
build Astro's content loader picks it up, Zod validates it, and it renders at `/research/context-gate`.
No admin session, no visibility toggle (research docs have no `visibility` field — committing *is*
publishing), no effect on `shipped`.

## 1.4 Why three, restated

The three primitives are three answers to "what is the natural way to author *this kind of thing*":

- **Work item** — a structured record with a lifecycle, classification, and links, that *counts*. →
  a database row you edit through a form, with a deliberate publish step so in-progress work stays
  private.
- **Log entry** — a short, dated, attributed note *about* the work, that does *not* count. → a lighter
  database row, no lifecycle, with cross-links and an author.
- **Research doc** — a long-form *document* where the writing is the deliverable. → a file in the repo,
  schema-checked, published by commit.

If you remember nothing else from Part 1: **only work items move the 100-count.** Log entries narrate
it; research docs sit in a parallel channel. That distinction is why the three exist as separate things.

---

# Part 2 — The flow of state: the private world and the public world

There is a hard wall down the middle of this system. On one side is everything you can change. On the
other is everything a visitor can see. They are physically different stores, and they are *allowed to
disagree.* Understanding that controlled disagreement is the whole of Part 2.

## 2.1 Two stores, two truths

Hold two ideas at once:

- **The store** = the live Firestore database. This is *what you have authored.* It is mutable. Every
  save changes it instantly.
- **The site** = the pre-rendered static files served from the CDN. This is *what you have published.*
  It is frozen. It reflects the store **as of the last build** and nothing newer.

These are not two views of one truth. They are two truths that drift apart the moment you make an edit
and snap back together only when you bake. The system is built around managing that drift on purpose.

```
   YOU AUTHOR                          A VISITOR READS
   (private, mutable)                  (public, frozen)

   ┌─────────────────┐                 ┌──────────────────┐
   │  Firestore      │   ── bake ──▶   │  static files    │
   │  (the store):   │   (manual)      │  (the site):     │
   │  current truth  │                 │  last-published  │
   └─────────────────┘                 │  truth           │
        ▲                              └──────────────────┘
        │ every save                            ▲
        │ also bumps                            │ pure file read
   ┌─────────────────┐                          │ no DB, no auth,
   │ publishState:   │                          │ no query
   │ dirty? + count  │ ◀── measures the gap     │
   └─────────────────┘     between the two
```

The `publishState` document is the system measuring the distance between the two truths. When it says
`dirty: true, pendingChanges: 7`, it means *the store is seven edits ahead of the site.* That is the
single most important piece of state in the whole flow, and you write to it without thinking every time
you save.

## 2.2 What a single edit actually triggers

Every authoring write does two things, not one. Take the work-item save again
(`saveProject`, `admin.ts:440`):

1. **It writes the record.** `addDoc` / `updateDoc` against `projects` (`admin.ts:464,470`).
2. **It records the intent to publish.** `markDirty(...)` (`admin.ts:136`) does two writes of its own
   (`admin.ts:147-154`):
   - sets `siteMeta/publishState` to `{ dirty: true, pendingChanges: increment(1),
     lastContentChangeAt: now, lastChangedBy: <who/what/which fields> }`
   - appends one record to the `siteMeta/publishState/changes` subcollection:
     `{ agent, client, operation, targetType, targetId, targetName, changedFields[], at }`

That second write is a **change journal** — an append-only event log, one entry per edit, recording
*what changed, on what, by whom.* It already exists and is already clean. Right now it is purely
informational: nothing consumes it automatically. But it is exactly the signal that *could* drive an
automatic publish (this is the central finding in `CLEANROOM_SPEC.md` §3.4 — the system knows when it's
stale but doesn't yet act on it). For your mental model: **every edit you make leaves a precise,
timestamped record of itself, and bumps a counter that says "the site owes you a rebuild."**

## 2.3 The seam: how the store becomes the site

The crossing from store to site is a build pipeline, run today by you pushing to git (Netlify rebuilds
on push). It is three steps chained as the Netlify build command (`TECH_STACK.md` §2):

1. **Export + privacy filter** (`sync:data` → `scripts/sync-firestore-snapshot.mjs`). Reads all the
   collections with privileged credentials and writes one immutable file,
   `src/data/tracker-snapshot.json` (git-ignored — it's a build artifact). The privacy boundary is
   applied *here, once*, in `publicDoc` (`sync-firestore-snapshot.mjs:56-60`):

   ```
   projects:  keep only if visibility === "public"
   journal:   keep only if visibility === "public"
   everything else (lines, series, technologies): keep unless visibility === "private"
   ```

   **A non-public record never leaves this step.** It is not hidden by CSS or skipped at render — it is
   physically absent from the snapshot, so it cannot reach any downstream artifact. That is what makes
   the privacy rule structural rather than something you have to police page by page.

   > One real inconsistency to know about: work items and journal use a *default-deny* rule (must be
   > explicitly `public`), but supporting records use *default-allow* (anything not explicitly
   > `private` passes). The two semantics live side by side here and in the live read path
   > (`data.ts:471` requires `=== "public"` for projects; `data.ts:496` allows journal that is
   > `!== "private"`). `CLEANROOM_SPEC.md` §3.1 #8 flags this as a leak risk to unify in the rebuild.
   > For now: to keep a supporting record off the site you must set it `private` explicitly.

2. **Validate** (`validate:stack`). Loads the snapshot and asserts every public work item's stack
   resolves to a known technology, failing the build otherwise. The placeholder `"other"` is forbidden
   in stored data. This is a referential-integrity gate: bad taxonomy stops the publish rather than
   shipping broken cross-links.

3. **Render strict** (`build:strict`, with `ARTLU_REQUIRE_SNAPSHOT=1`). Astro pre-renders every page
   from the snapshot — one `/project/<slug>` per public item, `/log` and `/log/<slug>`, the home graph,
   `/list`, `/map`, the research pages (from the files), the video guidebooks (from
   `public/videos/*/bundle.json`), plus the feeds (`rss.xml`, `llms.txt`, `robots.txt`). "Strict" means
   if the snapshot is missing it *errors out* instead of silently querying live Firestore
   (`requireSnapshot`, `data.ts:410`; the throw at `data.ts:424`).

The output is `dist/` — static HTML and JSON — published to Netlify's CDN. At that moment the two
truths reconverge, and (in the intended design) the dirty flag should reset to false. Today that reset
is the one part not wired up; you bake manually and the flag is informational.

## 2.4 What the visitor's side looks like

The delivery world is deliberately stupid, and that is its virtue. A visitor request is a **file read.**
No database connection, no authentication, no query, no computation. All of the system's intelligence —
every derivation in §3 — already ran once, at bake time, and was frozen into the files. The home page's
interactive stack graph, for instance, is ~900 lines of plain JavaScript with its data *injected at
build time* via Astro's `define:vars` (`TECH_STACK.md` §6); even the one rich interactive surface
carries no live data dependency.

## 2.5 Why the flow is physically split — the honest version

It is worth separating two claims that are easy to conflate:

- **Claim A (domain law):** reads must be cheap and must never touch the write store. This is real and
  permanent. It is what protects your authoring speed and the site's stability from each other, and it
  is what makes the privacy boundary enforceable at a single gate.
- **Claim B (one implementation of A):** the *specific* way this codebase honors Claim A is to **bake**
  the mutable store into immutable files on a manual trigger, with a snapshot exporter, a dirty-flag, a
  change journal, and a five-deep source-fallback cascade (`data.ts` tries snapshot → admin SDK → client
  SDK → a local backup file at a hardcoded path `data.ts:158` → bundled defaults).

Claim A is domain; Claim B is a consequence of the original hosting choice — a static site that cannot
re-render itself when the store changes. A different stack (a server with edge/incremental caching)
would honor the *same* Claim A and delete most of the apparatus in Claim B. `CLEANROOM_SPEC.md` §3.4
makes this case in full. The reason it matters *to you as the operator* is the next section: the part of
the daily friction that comes from the split itself (which is unavoidable and good) versus the part that
comes from the bake (which is the contingent piece you currently pay for and could remove).

---

# Part 3 — The core philosophy: why segregating reads from writes is correct for 100-in-100

The challenge is a throughput problem with an audience: ship roughly one unit a day for a hundred days,
solo, while a public site stays fast and always-up the whole time. The read/write segregation is the
right architecture for that specific shape, and the argument is concrete, not aesthetic.

## 3.1 The two activities have opposite requirements

Authoring and delivery want contradictory things:

| | Authoring (you) | Delivery (the audience) |
|---|---|---|
| Frequency | Constant, all day | Constant, but read-only |
| Correctness | Often wrong, in-progress | Must be correct |
| Speed need | Fast iteration | Fast page loads |
| Stability | Wants to thrash | Must not break |
| Trust | Privileged, authenticated | Anonymous |
| Privacy | Sees everything | Must see only public |

If a single path served both — a website querying the live database on each request — these
requirements would be welded together. Every visitor read would hit the store. Every half-finished edit
would be one render away from the public. Your *experimentation velocity* would be coupled to your
*public reliability*, and you'd have to slow down authoring to protect the site. Segregation breaks that
coupling: you get to be fast and wrong in private while the public stays correct and stable.

## 3.2 The amortization argument (the "mathematically correct" part)

Here is the load math, which is genuinely the materialized-view / CQRS argument:

- **Reads scale with audience; writes scale with one pair of hands.** Read volume can be anything a
  campaign attracts. Write volume is bounded by one operator (plus agents). These two numbers have
  nothing to do with each other and should not share a cost path.
- **The system has real per-item intelligence, and it is not cheap.** Look at what has to be computed to
  render the site: day numbers from a fixed start date (`dayNum`, `format.ts:12`), the shipped/to-go/
  active-day counts and the windowed heatmap (`getStats`/`buildActivity`, `data.ts:1082,1098`), slug
  generation and de-duplication (`data.ts:646`), technology resolution and rollups
  (`resolveTechnologyIds`, `data.ts:978`), product-line inference (`inferMainProject`, `data.ts:718`),
  series inference (`inferSeries`, `data.ts:746`), and video↔item matching by title-token overlap
  (`findVideoForProject`/`titleOverlapScore`, `data.ts:815,840`). That is a lot of work per page.
- **Baking pays that cost once and serves it many times.** If the site is read `R` times between two
  publishes, the per-read cost of all that computation is `total_compute / R`. As `R` grows — which is
  exactly what an audience does — the per-read cost trends toward the cost of serving a static file,
  which is the floor. You cannot beat "read a pre-computed file." For a workload that is **read-heavy,
  write-light, single-author**, moving all computation to publish time is the optimum, not a preference.

So "mathematically correct" is fair, with one precision: what is provably optimal is the **segregation**
— cheap, isolated reads with all intelligence pre-computed. The *bake* is one way to realize it; a
cached server is another that hits the same floor. The optimum is the property, not the machine
(`CLEANROOM_SPEC.md` §3.4, principle 6).

## 3.3 The friction it eliminates from your day

This is the part you feel. Because reads and writes are segregated, on any given day:

1. **You never fear publishing.** You edit the store all day — create stubs, rename things, reclassify,
   let an agent batch-write — and *none of it is public* until you choose to bake. There is no "did my
   half-finished edit just go live?" The visibility toggle (`admin.ts:480`) lets you stage anything as
   private and flip it when ready, with no code change.

2. **You don't deploy per item.** Changes accumulate; the `pendingChanges` counter tells you how many are
   waiting (`admin.ts:149`). You publish a batch when it suits you, not once per project.

3. **Public breakage can't come from your experiments.** The site is frozen between bakes. An in-progress
   edit, a malformed record, a wrong tag — none of it can degrade what a visitor sees, because the
   visitor is reading last-published files, not your live work.

4. **There is nothing to babysit at runtime.** The public site is files on a CDN — no server, no live
   database on the read path. During a 100-day sprint that is one entire class of 2 a.m. problems that
   simply cannot occur. The strict build (`data.ts:410,424`) even refuses to publish from a missing
   snapshot rather than silently degrading.

5. **Privacy is structural, not vigilance.** The hard rule — never expose your real identity or unrelated
   ventures — is enforced *once*, at the export gate (`sync-firestore-snapshot.mjs:56-60`), by physically
   omitting non-public records. You do not have to remember to hide things on each page; a private record
   cannot reach the site because it was never written into the snapshot.

6. **The counts maintain themselves.** You never hand-edit "day 47 of 100," the shipped number, or the
   heatmap. They are recomputed from dates and the set of public items at every bake (`getStats`,
   `data.ts:1082`). You set a date; the campaign math follows.

## 3.4 The one friction the current implementation *adds back* — and why it's worth knowing

Honesty, because you're rebuilding this: not all of the above comes from the segregation. Most does. But
the **bake** re-introduces exactly one daily friction the segregation itself doesn't require — **you have
to remember to publish.** The store can be seven edits ahead and the site won't catch up until you push.
The system already knows it's stale (the `dirty` flag and the change journal, §2.2), it just doesn't act
on that knowledge yet.

That gap is the clearest place where an *implementation accident* leaks into your day. The segregation is
load-bearing and should survive any rebuild. The manual publish step is contingent: wire the existing
change journal to trigger a rebuild-and-deploy (and reset the flag on success), or drop baking for a
cached server and the staleness question disappears entirely (`CLEANROOM_SPEC.md` §3.1 #7 and §3.4). The
friction-elimination story in §3.3 is what the architecture *buys* you; closing the publish loop is the
last piece it currently makes you pay for by hand.

---

## Appendix — the primitives and their mechanics, at a glance

| Concern | Work Item | Log Entry | Research Doc |
|---|---|---|---|
| Store | Firestore `projects` | Firestore `journal` | `src/content/research/*.md` |
| Type / schema | `Project` (`data.ts:20`) | `JournalEntry` (`data.ts:56`) | Zod (`content.config.ts:5`) |
| Author path | `saveProject` (`admin.ts:440`) + MCP | journal admin form | git commit |
| Slug | from name (`format.ts:3`) | from `day-<n>-<title>` + dedupe (`data.ts:388,646`) | filename |
| Counts toward 100 | **yes** (`data.ts:1082`) | no | no |
| Status lifecycle | idea/building/launched/abandoned | none | none |
| Visibility gate | export `=== "public"` (`sync-firestore-snapshot.mjs:58`) | export `=== "public"` (`:59`) | git (no field) |
| Public route | `/project/<slug>` | `/log/<slug>` | `/research/<slug>` |
| Marks dirty on edit | yes (`admin.ts:136`) | yes | no (commit is publish) |

**The shortest possible summary:** you author in three forms matched to three kinds of content; all
authoring is private and mutable and leaves a precise change record; a manual bake freezes the public
subset of that work into static files behind a one-time privacy gate; and the whole point of the split is
that it lets you move fast and loose in private without ever endangering a fast, stable, leak-proof public
site — which is exactly the trade a solo 100-in-100 run needs.

---

*Grounded in the repository as of this writing. For the agnostic rebuild model see `CLEANROOM_SPEC.md`;
for the concrete stack and the live-vs-dead-code map see `TECH_STACK.md`.*
