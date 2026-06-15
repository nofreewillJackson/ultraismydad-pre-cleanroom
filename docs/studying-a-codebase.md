# How to study any codebase (without an LLM)

A repeatable, framework-agnostic routine for answering: *Where does this app start?
What references what? How does data flow? What's dead?* — using only tools you run
yourself. Copy this file (and `scripts/trace-reachability.mjs`) into any project, or
keep both in your dotfiles / a personal `tools/` repo so they're always available.

> The whole method is two moves: **(1) find where execution starts, (2) follow the
> references outward until nothing new appears.** Everything else is tooling that
> does those two moves faster or draws you a picture of the result.

---

## The 5-step routine

### 1. Find the entry points
Where does execution begin? Don't guess — look:

| Ecosystem | Where the entry point is declared |
|-----------|-----------------------------------|
| Any Node project | `package.json` → `"scripts"`, `"main"`, `"module"`, `"bin"` |
| Astro / Next (pages router) | **every file** in `src/pages/` (or `pages/`) = one route |
| Next (app router) | every `page.tsx` / `route.ts` in `app/` |
| Vite/CRA SPA | the `<script src>` in `index.html` → usually `src/main.*` / `src/index.*` |
| Python | `if __name__ == "__main__"`, `[project.scripts]` in `pyproject.toml`, `manage.py` |
| Go | `func main()` in `package main` |
| Rust | `src/main.rs` (bin) or `src/lib.rs` (lib); `[[bin]]` in `Cargo.toml` |
| Java | `public static void main`, or the `mainClass` in build config |

⚠️ **Watch for decoys:** abandoned alternate entry points (an old `index.html`, a
legacy `main.jsx`) that nothing live uses. If a "front door" isn't referenced by the
build/run config, it may be dead. (This repo has exactly that — see `ONBOARDING.md`.)

### 2. Follow the references outward
A file *uses* another when it imports/includes it. Start at the entry points and walk
those edges recursively. Two ways:

```bash
# (a) The owned tool — walks imports across .astro/.ts/.tsx/.js/.jsx/.vue/.svelte
node scripts/trace-reachability.mjs                       # auto-detects entry points
node scripts/trace-reachability.mjs --roots src/index.ts  # or point it yourself
node scripts/trace-reachability.mjs --src app --roots app/server.ts

# (b) Manual grep — works in ANY language, no setup
grep -n "^import"            path/to/entry.ts     # what THIS file pulls in
grep -rln "lib/data"  src --include=*.ts          # who references THAT file
# Python: grep -rn "^\(from\|import\) "   Go: grep -rn "import ("
```

### 3. Get ground truth (don't trust the source alone)
The source says what *could* run; the build/run says what *does*.

```bash
# Static sites / bundlers: build, then inspect the output
npm run build && find dist -name '*.html'   # pages produced
find dist -name '*.js'                       # JS that actually ships to the browser

# Servers / CLIs: run it and watch which files load
node --trace-... / NODE_DEBUG=module node app.js     # Node module loads
python -v app.py                                     # Python: prints every import
strace -f -e trace=open,openat <cmd>                 # any program: files it opens
```
If a file's work never shows up in the build output or the runtime trace, it isn't used.

### 4. Visualize — find the convergence points
A picture shows you the *hubs*: the few files everything depends on (usually the data
layer or core domain). Those are where to start reading.

```bash
node scripts/trace-reachability.mjs --graph    # writes graph.dot
dot -Tsvg graph.dot -o graph.svg               # graphviz; open graph.svg
```
Off-the-shelf alternatives by ecosystem:

| Ecosystem | Tool | Command |
|-----------|------|---------|
| JS/TS | madge | `npx madge --image graph.svg src` |
| JS/TS | dependency-cruiser | `npx depcruise src --output-type dot \| dot -Tsvg -o graph.svg` |
| Python | pydeps | `pydeps yourpackage` |
| Go | (built-in) | `go mod graph` ; `godepgraph .` |
| Any | graphviz | renders the `.dot` any of the above emit |

> Caveat: madge & dependency-cruiser can't parse `.astro`/`.vue`/`.svelte` import
> edges — that's why the owned `trace-reachability.mjs` exists. And no import-follower
> sees files loaded *by convention* (Astro's `content.config.ts`, framework config,
> reflection/DI). Cross-check with ground truth (step 3).

### 5. Find the dead code (the leftover)
Whatever step 2 never reached is a candidate for dead code.

```bash
node scripts/trace-reachability.mjs            # prints the unreached files
npx knip                                       # JS/TS: unused files, exports, deps
npx ts-prune                                   # TS: unused exports
# Python: vulture .     Rust: cargo +nightly udeps / #[warn(dead_code)]
```
Confirm before deleting: a file can be reached by convention or only in production.

---

## The 10-minute version, "after I break it"

When you've changed something and want to understand the blast radius:

1. **Reproduce** the break; copy the exact error + the file it points at.
2. **Locate** that file, then run `grep -rln "thatFile" src` to see **who calls it** (upstream)
   and `grep -n "^import" thatFile` to see **what it calls** (downstream).
3. **Trace from the broken entry** only: `node scripts/trace-reachability.mjs --roots <the page/route>`
   — now you see the exact subset of files in play, not the whole app.
4. **Ground-truth** it: `npm run build` (or run it) and read the real error/output.
5. **Bisect** if stuck: `git stash` / `git bisect` to find the commit that changed behavior.

The goal of steps 1–3 is to shrink "the whole app" down to "the ~10 files that matter
for this break" before you start reading line by line.

---

## Your toolbelt (what you now own)

- `scripts/trace-reachability.mjs` — portable import-walker (`--src`, `--roots`, `--ext`, `--graph`).
- `graphviz` (`dot`) — turns any `.dot` into a picture.
- `grep -rln` / `grep -n "^import"` — the zero-dependency, any-language fallback.
- `npm run build` + `find dist` — ground truth for front-end projects.
- `npx madge` / `npx knip` — when you want batteries-included JS/TS analysis.

No LLM required for any of it. Re-run, read, decide.
