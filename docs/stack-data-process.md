# Stack Data Process

## Goal

The stack view should not be built from random free-text labels on each tracker entry.

It should use canonical technology records, then connect each shipped entry to those records.

## Firestore Shape

### `technologies/{technologyId}`

Canonical stack item.

```json
{
  "name": "Firestore",
  "category": "data",
  "aliases": ["firestore", "firebase firestore"],
  "visibility": "public",
  "sortOrder": 10
}
```

### `projects/{projectId}`

Tracker entry.

```json
{
  "name": "live-updating activity heatmap — artlu.ai",
  "stack": ["React", "Firestore"],
  "stackRefs": ["react", "firestore"]
}
```

`stack` remains readable fallback text. `stackRefs` is the stable source for the stack graph.

## Agent Workflow

When adding or editing tracker entries:

1. Pick existing ids from `technologies`.
2. Put those ids in `stackRefs`.
3. Keep `stack` human-readable if the entry form or MCP still expects it.
4. If a real new tool is missing, add it to `technologies` first.

Do not create new one-off labels like `Firebase Firestore`, `firestore db`, or `Firebase DB`. They should all resolve to the same canonical id.

Use `other` only as a temporary catch-all when a label is not ready to become a real technology yet. Review and remap `other` entries later.

## Commands

Seed canonical technology metadata:

```bash
npm run seed:technologies -- --dry-run
npm run seed:technologies
```

Audit live tracker entries:

```bash
npm run audit:stack -- --firestore --write
```

Review the generated files:

- `docs/stack-audit.md`
- `docs/stack-audit.json`

Dry-run migration. This writes both canonical `stackRefs` and readable canonical `stack` labels when applied:

```bash
npm run migrate:stack-refs
```

Apply only after review:

```bash
npm run migrate:stack-refs -- --apply
```

## Current Status

The live Firestore audit scanned 82 public projects and 142 raw stack labels.

All raw labels now resolve to canonical technology defaults. The migration has not been applied yet.
