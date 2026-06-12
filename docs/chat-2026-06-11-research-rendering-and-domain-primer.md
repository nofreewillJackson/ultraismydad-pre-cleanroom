# Chat log — Domain Primer + the research-doc rendering pipeline

**Date:** 2026-06-11
**Repo:** artluai-pre-cleanroom (the pre-cleanroom artifact)
**Topics:** (1) writing a Domain Primer for the operator, (2) inferring how `context-gate.md`
was pipelined into the research channel, (3) whether the custom figure rendering is
overengineering / reinvented wheel.

> A faithful record of the session. File:line citations point at the exact mechanic in the
> repo as of this date. Grounded by reading: `CLEANROOM_SPEC.md`, `TECH_STACK.md`,
> `src/lib/data.ts`, `src/lib/format.ts`, `src/content.config.ts`, `src/scripts/admin.ts`,
> `scripts/sync-firestore-snapshot.mjs`, `src/pages/research/[slug].astro`,
> `src/content/research/context-gate.md`, and `src/styles/global.css`.

---

## Turn 1 — Build a Domain Primer

**User:** Read the codebase without assuming or hallucinating. Produce a comprehensive,
long-form Domain Primer for the human operator that explains exactly what this system is —
no forced analogies or metaphors. Cover: (1) the human reality of the primitives (Work Item
vs Research Doc vs Log Entry — what am I physically doing, lifecycle, why three types);
(2) the flow of state (the asymmetry between the private authoring world and the public
delivery world; why it's physically split); (3) the core philosophy (why segregating reads
and writes is the right choice for a 100-projects-in-100-days velocity, what friction it
eliminates daily). Output to a new MD file.

**Assistant:** Created `DOMAIN_PRIMER.md` at the repo root, grounded in the live code. Summary
of what it argues:

- **Part 1 — the three primitives** are three genuinely different authoring acts, each matched
  to the natural substrate for its kind of content:
  - **Work Item** (`projects` Firestore docs; `Project` type at `data.ts:20`) — the *atom* and
    the only thing that moves the 100-count (`shipped = projects.length`, `data.ts:1082`).
    Two independent axes: status (`idea→building→launched→abandoned`) and visibility
    (`public`/`private`). Authored via `saveProject` (`admin.ts:440`) or an MCP agent. Slug
    from name (`format.ts:3`). "Video" vs "project" kind is *derived*, not chosen
    (`isProjectVideoEntry`, `data.ts:787`).
  - **Log Entry** (`journal` docs; `data.ts:56`) — dated narrative *about* the work; does
    **not** count toward 100; carries an `ai`/`human` author; slug from `day-<n>-<title>` with
    collision de-dup (`data.ts:388,646`); cross-links work items via `projectRefs`.
  - **Research Doc** — the outlier: a git-committed `.md` file in `src/content/research/`,
    Zod-validated front-matter (`content.config.ts:5`), **never touches the admin UI or
    Firestore**. The commit *is* the publish.
- **Part 2 — flow of state** framed as **two truths allowed to disagree**: the *store* (what
  you've authored, mutable Firestore) vs. the *site* (what you've published, frozen static
  files). `siteMeta/publishState` (`admin.ts:136-154`) measures the distance (`dirty` +
  `pendingChanges`). The privacy boundary is enforced once, at export, by physically omitting
  non-public records (`sync-firestore-snapshot.mjs:56-60`). Flagged the real default-deny
  (projects/journal must be `== "public"`) vs default-allow (supporting records pass unless
  `== "private"`) inconsistency.
- **Part 3 — philosophy**: the amortization / CQRS argument. Read load scales with audience,
  write load with one operator; baking pays the (substantial) per-item compute once and serves
  it over `R` reads, so per-read cost trends to the static-file floor — the optimum for a
  read-heavy / write-light / single-author workload.
- **Honest caveat (per `CLEANROOM_SPEC.md` §3.4):** the read/write *segregation* is domain law
  and load-bearing; the *bake + manual publish* is an implementation accident. The one daily
  friction the bake adds back is "you have to remember to publish," even though the change
  journal already knows the site is stale.

---

## Turn 2 — How was `context-gate.md` pipelined into the research channel?

**User:** Can you infer how the operator pipelined `context-gate.md` inside
`src/content/research/`? It's clearly meant for GitHub's markdown syntax rather than general
markdown, and he clearly did not write it by hand — there had to be a pipeline.

**Assistant:** Read the full file and hunted for pipeline traces. Findings:

**Correction to the premise — it isn't really "for GitHub."** The styled figures
(`<figure class="cgfig">`, `<div class="cgbar">`, `cgpipe/cgnode/cgcond/cgfile/cgstudy`) only
render as designed on **artlu.ai itself**, because the matching CSS lives in this repo at
`global.css:543-578+`, scoped as `.md .cgfig`, `.md .cgbar`, etc., driven by the site's design
tokens. On GitHub those `class=`/`style=` attributes get sanitized → unstyled stacked text. The
target renderer is artlu.ai's Astro pipeline: `research/[slug].astro:42` drops the post into
`<div class="md"><Content/></div>`, and `<Content>` is Astro's native content-collection
renderer (`render(post)`, line 17), which passes raw HTML through and supports GFM tables. What's
GFM-flavored (the `| Arm | Drift | σ |` tables, raw-HTML-in-markdown) is real, but aimed at
artlu.ai's engine, not a GitHub README.

**Tells it wasn't hand-written:**
1. HTML-entity-encoded glyphs — `&#9654;` (▶), `&rarr;` (→), `&mdash;` (—), `&#9733;` (★),
   `&asymp;` (≈). Nobody hand-types `&asymp;` in markdown; that's HTML-serializer / generated
   output.
2. Inline-styled component HTML — `style="width:90%"` bar fills with semantic classes.
3. The prose is written *from the codebase*: line 189 — "one self-contained Python file —
   `run_experiment.py`… **Everything quoted below is from that file**," then verbatim code blocks
   (`AUTHORITY`, `BRIEF`, the three arms, the read-loop, `score_output`). Result tables are the
   contents of `results/<study>/summary.json` (named at line 403).
4. A writeup-time renaming artifact — line 290: "the variable is still named `token` because the
   experiment was built before we settled on the public term **Context Receipt**." That's an
   editorial reconciliation between old code and new public naming.

**Reconstructed pipeline (two stages; no ingestion script does either — scripts/ has only
stack/video/seed tooling):**
- **Stage 1 — content generation (external):** a standalone experiment project (its own repo +
  GitHub Pages report, declared in front-matter: `repoUrl: github.com/artluai/
  context-gate-ai-hallucination`, `demoUrl: artluai.github.io/...`). An LLM was fed
  `run_experiment.py` + the results JSON and emitted the narrative **as HTML** with the `cg*`
  figure components.
- **Stage 2 — port into the research channel (this repo, by hand):** report body →
  `src/content/research/context-gate.md` with YAML front-matter matching the Zod schema
  (`content.config.ts:5` — build fails otherwise); figure CSS re-expressed in the site's design
  tokens and pasted into `global.css`; then `git commit`. For a research doc the commit *is* the
  publish step (no admin UI, no Firestore, no dirty-flag).

**Why it had to be a research doc, not a work-item `longDesc`:** `longDesc` renders through the
hand-rolled `renderMarkdownLite` (`format.ts:66`), which only handles bold/lists/inline code and
would mangle raw-HTML figures + GFM tables. The research channel is the *only* path that uses
Astro's full markdown engine — exactly what this content needs.

**Confidence:** in-repo facts certain (target renderer, schema match, manual commit,
generated-from-code prose). External upstream HTML report = strong inference; couldn't see that
repo to confirm whether the report HTML or the markdown came first.

---

## Turn 3 — Is the custom rendering overengineering / a reinvented wheel?

**User:** Is this overengineering, or is the custom rendering truly needed — did the vibecoder
reinvent the wheel? I want to incorporate the "turn an MD file into a research log rendered how I
want" capability. Was the execution a side effect of the LLM reinventing the wheel instead of
saying there's a better way? Or does it use a universal HTML rendering technique, making it easy
to copy HTML artifacts from Claude into it?

**Assistant:** Verified two deciding facts first:
- The figure variables (`--green`, `--surface`, `--mono`, …) **are theme-scoped** — defined under
  `html[data-theme="dark"]` (`global.css:1`) and `html[data-theme="light"]` (`global.css:15`). So
  inline figures automatically reflow into the site's light/dark theme.
- `renderMarkdownLite` is used for Firestore content (`ProjectDetail.astro:49`, `log/*`,
  `VideoLong.astro:42`, and the research **listing** card bodies in `research.astro:47`) — **not**
  for the research **doc body**, which uses the real Astro renderer.

**Verdict: not overengineering, and mostly not reinvention.** Three layers, three answers:

1. **Transport (raw HTML in markdown) = the universal wheel, used correctly.** Raw-HTML
   passthrough works in every markdown engine. Your guess is right: it *is* a universal HTML
   rendering technique, which is exactly what makes it easy to paste an HTML artifact body in.
   Nothing reinvented.
2. **Styling (`cg*` classes) = bespoke one-offs, not a system — but appropriate at n=1.** The
   classes are specific to this one report; a new figure type needs new CSS. That's *under*-
   abstraction, not over-engineering. Building a generalized "research figure framework" for a
   sample of one would be the premature abstraction. The genuinely reinvented wheel in the repo is
   `renderMarkdownLite` (`format.ts:66`) — flagged by `CLEANROOM_SPEC.md` §3.1 #11 / `TECH_STACK.md`
   as "two markdown renderers" debt — but it doesn't render research docs, so this path is the
   clean one.
3. **Inline-and-themed instead of an iframe = truly needed, not a side effect.** The figures use
   theme-scoped vars so they look native (track dark/light, match fonts/colors). An iframe can't
   inherit the site theme. The codebase deliberately has **two** HTML-embed strategies:

   | | Inline raw HTML (research figures) | iframe `srcdoc` (`artifactHtml`) |
   |---|---|---|
   | Isolation | None — shares the page | Full — sandboxed |
   | Theme | **Follows site light/dark** | Frozen; ignores theme |
   | CSS | You own/ship it (`global.css`) | Self-contained in artifact |
   | Paste-a-Claude-artifact | Reconcile styles to site | **Paste wholesale, zero coupling** |
   | Best for | Figures meant to look native | Standalone demos/tools |

   So the right tool was used for each job: a themed native figure *must* be inline; a
   self-contained interactive demo *should* be an iframe. Not "reinventing instead of suggesting a
   better way."

**Guidance for the rebuild / the workflow:**
- Keep the mechanism (MD → real markdown engine + raw HTML). Standard and portable.
- For pasting Claude artifacts, pick by intent: *self-contained, theme-independent* → iframe
  `srcdoc` (`artifactHtml`, already built); *should look like the site* → inline raw HTML, and
  accept you own the CSS (that's the cost of integration).
- The one "better way" worth adopting **only if** research logs become recurring: move research
  from `.md` to **`.mdx`** and turn figures into imported Astro components (`<DriftChart>`,
  `<Pipeline>`) with props. Buys reuse + data/markup separation, but couples content to the
  framework and makes "paste a Claude artifact" harder. At n=1 it's not worth it — the current
  under-abstraction is the correct call.

**Bottom line:** the visual capability is real and built on a standard foundation. The bespoke CSS
isn't wheel-reinvention, just not-yet-a-system — fine until there are enough research logs to
justify a system.

---

*End of log.*
