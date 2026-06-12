# Cleanroom TDD Onboarding Roadmap

This document is for a junior developer joining the cleanroom rebuild. It explains where the project is now, what the domain words mean, why the first tests were written the way they were, and what to build next.

The short version:

- We are not copying the current app file by file.
- We are extracting the domain rules that should survive any implementation.
- We are writing those rules as tests before implementation.
- We are keeping authoring easy, including allowing unclassified work.
- We are deleting silent guessing, duplicated logic, and framework-specific accidents as we rebuild.

Read these first:

- `CLEANROOM_SPEC.md` - technology-agnostic rebuild spec.
- `DOMAIN_PRIMER.md` - operator-facing explanation of the current system.
- `TECH_STACK.md` - current implementation inventory and live-vs-dead code map.

## 1. Current State

The cleanroom effort has started conceptually at the domain layer.

Important repository note: this checkout currently contains the existing app, the cleanroom docs, and the implementation inventory. The Phase 1 TDD work described below may exist in a prior session log, branch, or separate cleanroom checkout. Before continuing, a junior should verify whether the Phase 1 files are actually present in the current branch:

```sh
rg --files -g 'src/domain/**' -g 'tests/**' -g 'vitest.config.ts'
```

If those files are missing, recreate Phase 1 here using the tests and behaviors in this document. Do not assume the test harness exists just because the design decision has been made.

The first Phase 1 TDD work established the intended TypeScript/Vitest loop and tested the smallest domain behaviors:

1. Creating a work item defaults visibility to `private`.
2. Creating a work item without a product line assigns it to a catch-all product line.
3. Public export excludes non-public work items.

Those tests are valuable because they target domain behavior, not UI mechanics.

The current important clarification is this:

`catch-all` is allowed if it is a first-class domain bucket for unclassified work.

That means:

```txt
missing productLineId -> CATCH_ALL_PRODUCT_LINE_ID
```

is acceptable when the contract is:

```txt
The catch-all product line is where unclassified work items live until the author classifies them.
```

That is different from silent inference.

This is good:

```txt
No product line supplied -> catch-all bucket -> rendered as "Unclassified" if the UI wants.
```

This is debt:

```txt
No product line supplied -> inspect title/tags/link/description -> guess a product line -> pretend it was explicit.
```

The cleanroom rebuild should preserve the first behavior and remove the second.

## 2. The Domain In Plain English

This system is a build archive. One operator ships a stream of work over time. The public site shows the public subset of that work as a fast, stable archive.

The domain is not React, Astro, Firebase, Netlify, a table layout, or a specific admin form.

The domain is the set of concepts and rules that would still matter if the app were rebuilt with a different stack.

Core concepts:

| Term | Meaning |
|---|---|
| Work item | The atom of shipped or tracked work. A work item may later appear as a project, video, research item, or other public artifact. |
| Product line | A broad grouping for work items. In the current app this concept is close to `mainProjectId`; in the cleanroom model it is called `productLineId`. |
| Catch-all product line | The valid product line used when the author has not classified a work item yet. It can be rendered as "Unclassified" or any chosen label. |
| Series | Optional subgroup inside a product line. |
| Technology | Controlled vocabulary entry for what a work item uses. Work items should reference technology by stable IDs, not loose display strings. |
| Log entry | A dated narrative post about the work. It does not itself count as a work item. |
| Research doc | Long-form authored content, usually file-based. |
| Read model | The public, sanitized representation consumed by the public site. |
| Privacy gate | The single rule that prevents non-public records from entering the read model. |

The most important architectural idea:

```txt
Authoring is private and mutable.
Reading is public, cheap, and isolated.
```

Everything else is a tactic for preserving that property.

## 3. Product Line Decision

There was a real question about whether requiring `productLineId` forces the author to decide too early.

The answer for this rebuild:

Do not force the author to choose a specific product line just to create a work item.

Instead, make the default explicit:

```ts
export const CATCH_ALL_PRODUCT_LINE_ID = "catch-all";
```

Then:

```ts
export function createWorkItem(input: CreateWorkItemInput): WorkItem {
  return {
    ...input,
    productLineId: input.productLineId ?? CATCH_ALL_PRODUCT_LINE_ID,
    visibility: input.visibility ?? "private",
  };
}
```

This means every work item still has exactly one product line, but the author is not forced to classify it immediately.

The catch-all line must be treated as a real product line record:

```ts
{
  id: "catch-all",
  name: "Unclassified"
}
```

The exact display name is a presentation choice. The stable ID is the contract.

Tests should lock this in:

```txt
creating a work item without a product line assigns it to the catch-all line
creating a work item with a product line preserves the explicit line
the public read model may include catch-all items under the catch-all line
the system never silently infers a product line from title/tags/link text
```

If the team later decides that public output must not show catch-all items, write that as a new explicit rule. Do not smuggle it into unrelated code.

## 4. What Counts As Technical Debt Here

Not all defaults are debt.

A default is fine when it is explicit, named, tested, and visible in the product.

This is fine:

```txt
missing visibility -> private
missing productLineId -> catch-all
```

Those are authoring-friendly defaults.

The actual debt we are trying to remove is:

| Debt | Why it hurts |
|---|---|
| Silent inference | The system guesses relationships from text and treats guesses as facts. |
| Duplicated domain logic | Slugging, normalization, filtering, and visibility rules drift across files. |
| Mixed trust boundaries | Public rendering code can accidentally know about private/live data. |
| Instance-specific patches in code | One-off record fixes require code changes instead of data changes. |
| Parallel representations | Example: free-text stack labels plus canonical technology refs that can disagree. |
| Hidden fallback chains | The app can silently source data from different places depending on environment. |

The cleanroom goal is not "more strict everywhere." The goal is fewer hidden decisions.

## 5. TDD Rules For This Rebuild

TDD means the order matters.

For each behavior:

1. Write one failing test.
2. Run it.
3. Confirm it fails for the right reason.
4. Write the smallest production code that passes.
5. Run the targeted test.
6. Run the full suite.
7. Refactor only while green.

Do not write a batch of tests and then implement a batch of code. That is not the learning loop we want.

Good test names describe behavior:

```txt
defaults visibility to private when omitted
assigns missing product line to catch-all
excludes private work items from the read model
preserves explicit product line assignment
does not infer product line from title text
```

Weak test names describe implementation:

```txt
createWorkItem works
returns object
filters array
handles input
```

A junior should be able to read the test list and understand the system.

## 6. Testing Layers

Use the cheapest test that proves the behavior.

### Domain Unit Tests

Fast, pure TypeScript. No browser. No database. No framework.

Use these for:

- creating work items
- default visibility
- catch-all product line
- status transitions
- slug generation
- privacy filtering
- read-model selection
- embeddable-link decisions
- statistics and activity calculations
- technology-reference validation

### Contract Tests

Tests for public data shapes.

Use these for:

- sanitized read snapshot
- video bundle contract
- feed/index contract
- path-free public media records
- no private records downstream

### Adapter Tests

Tests that a storage implementation obeys the domain contract.

Start with an in-memory adapter. Add database-specific tests later.

### UI Tests

Use after the domain is stable.

Use these for:

- public homepage behavior
- routes
- filter interactions
- theme persistence
- responsive layout
- admin flows

### Visual Regression Tests

Use only for screens where layout matters.

Suggested snapshots:

- homepage desktop light
- homepage desktop dark
- homepage mobile
- work item detail
- log list
- admin dashboard
- graph/map view if retained

## 7. Phase Roadmap

### Phase 0 - Align The Spec

Goal: make the documentation reflect the actual domain decisions before more tests harden them.

Tasks:

- Add glossary entries for `WorkItem`, `ProductLine`, `Series`, `Technology`, `LogEntry`, `ReadModel`, and `CatchAllProductLine`.
- Clarify that `catch-all` is a valid unclassified product line if that is the chosen workflow.
- Clarify whether `gated` is a real visibility state or a placeholder.
- List which current behaviors are domain rules and which are implementation accidents.
- Decide whether campaign counters are core domain or configurable presentation.

Done when:

- A junior can explain what a missing `productLineId` means.
- The spec no longer contradicts the tests.
- The first TDD tests match the spec language.

### Phase 1 - Domain Harness

Goal: establish the smallest repeatable TDD loop.

Expected files:

```txt
package.json
tsconfig.json
vitest.config.ts
src/domain/work-item.ts
src/domain/privacy-gate.ts
tests/work-item.test.ts
tests/privacy-gate.test.ts
```

Minimum scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Behaviors:

- `createWorkItem` defaults visibility to `private`.
- `createWorkItem` defaults missing `productLineId` to `CATCH_ALL_PRODUCT_LINE_ID`.
- `createWorkItem` preserves explicit visibility.
- `createWorkItem` preserves explicit product line.
- `selectPublicWorkItems` excludes private and gated/non-public work.

Done when:

- Every behavior has a RED/GREEN record.
- Full test suite passes.
- Constants are named and exported.

### Phase 2 - Core Domain Model

Goal: model the entities without UI or storage assumptions.

Build:

```txt
src/domain/work-item.ts
src/domain/product-line.ts
src/domain/series.ts
src/domain/technology.ts
src/domain/log-entry.ts
src/domain/slug.ts
src/domain/links.ts
```

Behaviors:

- Work item has stable ID, title, status, visibility, product line, optional series, optional links.
- Product line has stable ID and display name.
- Catch-all product line is a valid product line.
- Series belongs to a product line.
- Technology refs are stable IDs.
- Slugs are deterministic and length-capped.
- Log slugs handle collisions.
- Inline demo HTML takes priority over external link.
- Embeddable URLs require allow-list acceptance.
- Denied hosts open externally.

Done when:

- Domain code has no imports from UI, database, or framework packages.
- Tests describe rules in user-facing language.
- No inference logic is introduced.

### Phase 3 - Read Model And Privacy Gate

Goal: define the public contract.

Build:

```txt
src/domain/read-model.ts
src/domain/snapshot.ts
src/domain/public-export.ts
```

Behaviors:

- Only public work items enter the read model.
- Only public log entries enter the read model.
- Supporting records follow one explicit visibility rule.
- Non-public records are absent, not hidden.
- Arrays are normalized to empty arrays.
- Timestamps are normalized to a stable string format.
- Work items in catch-all remain visible under catch-all when public.
- Read-model records contain no private-only fields.

Done when:

- A test proves no private work item can appear downstream.
- The public contract is documented in types.
- Rendering code will not need to know how privacy works.

### Phase 4 - Classification And Relationships

Goal: replace runtime guessing with explicit relationships and optional suggestions.

Build:

```txt
src/domain/classification.ts
src/domain/relationship-validation.ts
```

Behaviors:

- Explicit product line wins.
- Missing product line becomes catch-all.
- Explicit series must belong to the selected product line.
- Invalid series/product-line pairs fail validation.
- Technology refs must resolve.
- Placeholder technology IDs are rejected if the spec says so.
- Product line is never inferred from title, tags, stack, or link.

Optional later feature:

- Suggest a likely product line from text, but return it as a suggestion only.
- Never write a suggestion as the actual product line without author confirmation.

Done when:

- Relationship validation is deterministic.
- There is no runtime fallback that changes product line silently.

### Phase 5 - Derived Presentation

Goal: compute public counts and display helpers from data, never store them as facts.

Build:

```txt
src/domain/timeline.ts
src/domain/stats.ts
src/domain/activity.ts
src/domain/sort.ts
```

Behaviors:

- Shipped count derives from public launched work items or the chosen public-count rule.
- Active days derive from distinct work-item dates.
- Optional campaign counters derive from campaign config.
- Heatmap derives from work-item ship dates.
- Sort order is deterministic.
- Manual order, if retained, is a tiebreaker or explicit view policy.

Done when:

- The same input always creates the same counts.
- No count is hand-authored.
- Campaign-specific math is isolated from the core archive model.

### Phase 6 - Media And Demo Contracts

Goal: model public media without leaking file-system or production-pipeline details.

Build:

```txt
src/domain/demo.ts
src/domain/video-bundle.ts
src/domain/media-contract.ts
```

Behaviors:

- Inline demo HTML wins over external link.
- Embeddable link renders inline only when allowed.
- Non-embeddable link remains external.
- Video bundle contains public URLs, not local paths.
- Video format determines expected public shape.
- Missing optional media fields degrade predictably.

Done when:

- Public media contracts are path-free.
- UI can render demos/videos without knowing source pipeline details.

### Phase 7 - Authoring Use Cases

Goal: express what the admin/editor does without binding to a database.

Build:

```txt
src/application/create-work-item.ts
src/application/update-work-item.ts
src/application/publish-work-item.ts
src/application/create-log-entry.ts
src/application/record-change.ts
```

Behaviors:

- Create work item.
- Update work item.
- Publish/unpublish work item.
- Record authoring change event.
- Create log entry.
- Update cross-links.
- Preserve slug rules.
- Preserve catch-all default.

Done when:

- Use cases depend on repository interfaces, not concrete storage.
- In-memory tests cover the full authoring flow.

### Phase 8 - Repository Interfaces And Adapters

Goal: keep storage replaceable.

Build:

```txt
src/ports/work-item-repository.ts
src/ports/log-repository.ts
src/adapters/in-memory-work-item-repository.ts
```

Later:

```txt
src/adapters/firestore-work-item-repository.ts
```

Behaviors:

- In-memory adapter obeys the same contract as any real adapter.
- Saves and reads preserve domain fields.
- Repository never performs silent classification.
- Repository never bypasses privacy export.

Done when:

- Application tests run against in-memory repositories.
- Database adapter is thin.
- Domain code has no database imports.

### Phase 9 - Public UI From Fixtures

Goal: rebuild visible public behavior on top of stable contracts.

Start with fixture data, not live storage.

Build:

- public shell
- navigation
- theme toggle
- work item list
- product line grouping
- catch-all/unclassified grouping
- work item detail route
- log list/detail
- demo rendering
- media/video pages if retained

Tests:

- homepage renders public work items
- catch-all work items appear under the catch-all display label
- filters do not expose private records
- route generation uses slug rules
- inline demo appears before external link
- responsive layout does not hide required content

Done when:

- Public UI works from fixtures.
- No public component imports live storage.
- Visual snapshots cover major layouts.

### Phase 10 - Admin UI

Goal: rebuild authoring workflows after the public contract is stable.

Build:

- sign-in shell
- work item form
- product line select with catch-all default
- series select
- technology selector
- visibility controls
- log entry form
- publish/change status indicator if retained

Tests:

- new work item defaults private
- new work item defaults catch-all if no line chosen
- explicit product line persists
- changing product line moves the item
- private item does not appear in public fixture export
- form prevents invalid series/product-line pair

Done when:

- Admin flows call application use cases.
- Form state does not define domain rules by itself.
- All rules are already tested below the UI.

### Phase 11 - Build, Deploy, And Runtime Strategy

Goal: choose how the read/write split is implemented.

Options:

1. Static build with generated read snapshot.
2. Server with edge/incremental cache.
3. Hybrid static-first approach.

The invariant is not "must use a static bake."

The invariant is:

```txt
Visitors get cheap public reads that cannot touch private authoring data.
```

Tests:

- production build fails if required public data is unavailable
- private records are absent from build artifacts
- admin routes are excluded from public indexing
- generated feeds contain only public records
- deployment artifacts are deterministic for the same input

Done when:

- The selected implementation preserves the read/write boundary.
- The build/deploy flow is documented.
- CI runs tests before deploy.

## 8. Behavior Inventory To Convert Into Tests

Use this list as the backlog. Do not implement all at once.

Work item:

- defaults visibility to private
- defaults missing product line to catch-all
- preserves explicit product line
- preserves explicit visibility
- supports status lifecycle
- derives slug from title
- keeps product line stable when title changes

Privacy:

- public export excludes private work items
- public export excludes private log entries
- public export does not include private fields
- catch-all public items are allowed unless a future rule says otherwise

Classification:

- no product-line inference from title
- no product-line inference from tags
- no product-line inference from links
- invalid product line is rejected or normalized by explicit rule
- invalid series/product line pair is rejected

Links and demos:

- inline demo HTML takes priority
- allowed deployed hosts can embed
- denied hosts do not embed
- external links remain available

Timeline and stats:

- shipped count derives from public work items
- active days derive from distinct dates
- campaign counters are optional presentation
- heatmap derives from work-item dates

Technology:

- work item stores technology refs
- technology refs must resolve
- display names come from technology records
- unresolved refs fail validation

Logs:

- log entry has title, body, date, visibility, author
- log entry slug is deterministic
- log entries do not count as shipped work
- log entries can reference work items

Media:

- video bundle has no local file paths
- video bundle exposes public URLs only
- work item can be realized as a video
- media ingestion failures are explicit

## 9. How A Junior Should Add The Next Behavior

Example behavior:

```txt
creating a work item with an explicit product line preserves it
```

Steps:

1. Open the relevant test file.
2. Add exactly one test.
3. Run only that test.
4. Confirm it fails.
5. Add the smallest implementation.
6. Run the targeted test again.
7. Run the full suite.
8. Refactor only if green.
9. Update this roadmap only if the behavior changes the project direction.

Do not start by editing the UI. Do not start by adding storage. Do not add framework code to make a domain test pass.

## 10. Review Checklist

Before merging any cleanroom change, ask:

- Is this behavior in the spec or clearly added to the spec?
- Is the first test a behavior test, not an implementation test?
- Did the test fail before implementation?
- Does the implementation import only what belongs at its layer?
- Did we avoid silent inference?
- Did we preserve the privacy boundary?
- Did we keep authoring friction low?
- Is `catch-all` treated as a real domain bucket, not an error?
- Are public records and private records separated by a tested gate?
- Can a junior explain the change from the test name alone?

## 11. Open Decisions

These need explicit decisions before they harden into code:

1. Visibility states:
   - Is `gated` real now?
   - If yes, what does it do?
   - If no, remove it from the cleanroom domain until paywall behavior exists.

2. Catch-all display:
   - Should `catch-all` render as "Unclassified," "Catch-all," or another label?
   - This is presentation, but the product line record should define it.

3. Public catch-all policy:
   - Are public catch-all work items allowed on the public site?
   - Current working answer: yes, because unclassified is a valid category.

4. Campaign math:
   - Is the 100-day campaign core domain or configurable presentation?
   - Current cleanroom direction: configurable presentation.

5. Static bake vs cached server:
   - The domain requires cheap isolated reads.
   - It does not require a particular delivery mechanism.

6. Research docs:
   - Are they work items, a separate content channel, or both?
   - Current direction: separate authored document channel that can be cross-linked.

## 12. The Mental Model To Keep

The rebuild succeeds if this remains true:

```txt
The author can move quickly in private.
The public site sees only the explicit public read model.
Missing classification is honest and visible, not guessed.
The tests describe the business rules before the implementation exists.
```

That is the cleanroom TDD path.
