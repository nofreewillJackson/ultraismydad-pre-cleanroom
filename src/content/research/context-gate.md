---
title: "Context Gates: reducing AI hallucination by forcing the source of truth into context"
description: "A report on a specific, common cause of agent hallucination: answering before the governing rule is in context."
date: "2026-05-18"
tags: ["AI research", "agents", "hallucination"]
demoUrl: "https://artluai.github.io/context-gate-ai-hallucination/"
repoUrl: "https://github.com/artluai/context-gate-ai-hallucination"
---

*A report on a specific, common cause of agent hallucination — answering before the governing rule is in context — and a mechanism that reduces it. Includes the full method, the experiment harness, the scoring, and the raw results.*

<div class="cta-row">
<a href="https://artluai.github.io/context-gate-ai-hallucination/">&#9654; Try the interactive demo</a>
<a href="https://github.com/artluai/context-gate-ai-hallucination">View the GitHub repo</a>
</div>

---

## Contents

1. Summary
2. The problem
3. Why this is hallucination
4. Approaches considered
5. How a Context Gate works
6. The experiment
7. Results
8. Limitations and honest scope
9. Reproducing the experiment

---

## 1. Summary

AI agents routinely operate with long instructions, many reference files, and many steps. A recurring failure in that setting is not bad reasoning — it is that the model **never loads the file that governs the step it is doing**. It follows a plausible path, drafts from what it already "knows," and never brings the actual source of truth into context.

When the governing reference never enters the context window, the model fills the gap with a plausible-sounding invention. The hallucination effectively began *before* the answer was written.

A **Context Gate** is a pipeline mechanism designed to prevent this specific failure: before a model acts on a step, the gate forces the exact source-of-truth file into the model's context, then issues a one-use **Context Receipt** that downstream validation must check before the pipeline continues.

We tested this across three controlled studies, two models, and 20 runs per condition. The result, stated plainly: Context Gates do not make a model hallucination-proof, but they sharply reduced this failure mode in our tests — answering before the source of truth is in context.

The experiment is also a walkable interactive demo: [artluai.github.io/context-gate-ai-hallucination](https://artluai.github.io/context-gate-ai-hallucination/).

---

## 2. The problem

### 2.1 How agents actually operate

A production agent task is rarely a single self-contained prompt. It is one step in a longer pipeline, and it arrives with context: a brief, a schema, a style guide, protocol files, examples, checklists. A real task can carry a dozen or more reference documents, and **only one or two of them actually govern the specific step in front of the model.**

### 2.2 The skipped-rule failure

In that setting a predictable failure appears: the model never opens the file that matters.

This is not defiance and not malice. The model does something ordinary — it follows a plausible path. It reads a couple of files that look relevant, forms a reasonable picture of the task, and proceeds. Opening the actual source-of-truth file is just one more optional-feeling step among many, and that step gets skipped.

We first observed this in a production media pipeline: an agent had long protocol files it was supposed to consult before generating a plan, and the recurring failure was not flawed reasoning — it was the model generating confidently *without ever having loaded the rule it was reasoning about.* The public version of the problem needs none of that internal detail. It is general: **long instructions, many files, many steps, and a model that follows a plausible path instead of the authoritative one.**

### 2.3 Where the failure happens

The failure happens at *input time*, not output time. It is silent. The model does not announce that it skipped the source of truth; it simply produces a fluent, confident, internally consistent answer built on the wrong basis.

---

## 3. Why this is hallucination

When we say a model "hallucinated," we usually picture the moment it wrote something false. But often the failure happened earlier — before a single wrong word was produced.

If the correct reference never enters the context window, the model has nothing to ground that part of the answer on. So it does what language models do: it predicts the most plausible continuation. The output sounds right and is internally consistent. It is also wrong, because the model was never working from the real constraint.

The hallucination did not start when the model wrote the wrong detail. It started when the source of truth was never in view. **A large share of "the model made something up" is really "the model answered before it had the facts."**

That reframing matters because it changes what a fix should target. The problem is not only the model's reasoning. The problem is an input that never arrived. A fix should therefore operate on *context delivery*, not on persuasion.

---

## 4. Approaches considered

### 4.1 Write more rules

The intuitive response to a skipped rule is to add more rules, or more emphatic ones. This is weak. If the model already skipped the source-of-truth file, more files simply give it more to skip. Volume is not attention.

### 4.2 Make the prompt louder

Stricter wording — "YOU MUST READ X FIRST" — sometimes helps. But it still depends on the model *choosing* to attend to that instruction at the right moment. It improves the odds; it does not change the mechanism. Over a long enough run, "usually attends" becomes "sometimes doesn't," and the failure is silent when it happens.

### 4.3 Validate after the fact

You can check the output after generation and reject drift. This is worth doing, but it is a safety net, not a fix: it catches the error only *after* the model has already spent a full generation reasoning from the wrong basis. It does not prevent the wasted work, and it does not address the cause.

### 4.4 Context Gates

The remaining option changes the mechanism rather than the persuasion. Do not ask the model to *choose* to read the source of truth — force it. Place the exact governing file into context before the step runs, and make the pipeline able to *prove* that happened.

This is the approach the rest of this document defines and tests.

---

## 5. How a Context Gate works

A Context Gate is a pipeline stage that sits *between the source of truth and the model*. It is not a prompt instruction and not a model capability. It is enforced infrastructure.

### 5.1 The pipeline

<figure class="cgfig">
<div class="cgfig-head">A Context Gate as a pipeline stage</div>
<div class="cgpipe">
<div class="cgnode"><div class="cgnode-t">Source of truth</div><div class="cgnode-s">the governing rule file</div></div>
<div class="cgarrow">&rarr;</div>
<div class="cgnode key"><div class="cgnode-t">Context Gate</div><div class="cgnode-s">forces it in, issues receipt</div></div>
<div class="cgarrow">&rarr;</div>
<div class="cgnode"><div class="cgnode-t">AI step</div><div class="cgnode-s">writes the draft</div></div>
<div class="cgarrow">&rarr;</div>
<div class="cgnode"><div class="cgnode-t">Receipt check</div><div class="cgnode-s">validate, then continue</div></div>
</div>
<figcaption>Select the source of truth, force it into context, issue a one-use receipt, and refuse to continue without it.</figcaption>
</figure>

The model never decides whether to consult the rule. By the time the model runs, the rule is already in context, and a receipt exists proving it.

### 5.2 Step 1 — Select the source of truth for this step

The gate must know which file governs the current step. This is a configuration mapping — step identity to source-of-truth file — maintained by the pipeline, not inferred by the model. In a casting step, the source of truth is the approved-character registry; in a schema step, it is the schema file. Selecting the right file is the gate's responsibility and a real design surface: a gate is only as good as that mapping.

### 5.3 Step 2 — Force the source into the model's context

The gate injects the selected file's contents directly into the model's context for the step — as a system or user message segment the model cannot route around. The model does not get the *option* to read it. It is already there.

This single step is where the accuracy gain comes from. Everything after it is about enforcement and proof.

### 5.4 Step 3 — Issue a one-use Context Receipt

When the gate injects the source of truth, it also generates a **Context Receipt**: a unique, single-use receipt bound to that step. The receipt is a fact about the pipeline — "for this step, the source of truth was forced into context" — made into a checkable artifact.

The model is required to carry the receipt through to its output (for example, as a designated field in the returned JSON).

### 5.5 Step 4 — Require downstream validation to check the receipt

Any stage that consumes the model's output must verify the receipt before continuing. Output that cannot present a valid, matching, unused receipt is rejected — the pipeline refuses to build on a step that cannot prove its source of truth was in context.

This converts "we hope the model consulted the rule" into "the pipeline will not proceed unless it can prove the rule was present."

### 5.6 What the receipt is — and is not

The receipt does **not** make the model smarter, and it does not, by itself, improve the answer. The accuracy improvement comes entirely from Step 2 — forcing the file into context. A pipeline that only did Step 2 would get essentially the same accuracy.

The receipt's role is different and complementary:

- **Enforcement** — downstream stages can hard-reject any output not covered by a valid receipt, so a single skipped gate cannot silently propagate.
- **Auditability** — every step that ran through the gate leaves a verifiable trace. After the fact, you can prove which steps had their source of truth in context and which did not.

Accuracy comes from forced context. Trust comes from the receipt.

### 5.7 The pattern in pseudocode

```python
# 1. select the source of truth for this step
authority = read_file("approved_roster.json")

# 2-3. force it into context and issue a one-use receipt
receipt = context_gate(
    source_of_truth=authority,
    step="write_scene_plan",
)

# the model runs with the rule already in context and the receipt attached
draft = call_model(
    prompt=brief,
    forced_context=authority,
    required_receipt=receipt,
)

# 4. downstream validation refuses to continue without a valid receipt
validate(draft, required_receipt=receipt)
```

This is illustrative. A production gate is middleware implementing those four stages with real enforcement; the snippet only shows the shape of the pattern.

### 5.8 How this maps to the experiment

The experiment in Section 6 simulates the gate at the prompt level so it can be measured cleanly: the harness injects the source-of-truth file into the prompt and, for the gated arm, generates a real one-use Context Receipt and checks that the model returned it. That is a faithful test of the *mechanism* (forced context plus a verifiable receipt), implemented inside a research harness rather than as standalone production middleware.

---

## 6. The experiment

The experiment is one self-contained Python file — `run_experiment.py`, roughly 900 lines, standard library only (`urllib`, `json`, `secrets`, `re`, `statistics`). No frameworks, no dependencies. Everything quoted below is from that file.

### 6.1 The task and the roster

The model must write an 18-scene illustrated story plan. Every scene must be cast only from an approved five-character roster. That roster is the source of truth, defined in the harness as the `AUTHORITY` object:

```python
AUTHORITY = {
    "rulebook_name": "Clockwork Rescue Character Rulebook",
    "rule_summary": (
        "For this story, scenes may use only the registered character names "
        "listed in characters. Do not invent generic fantasy characters."
    ),
    "characters": {
        "mara_the_cartographer": {...},
        "tin_fox":                {...},
        "oracle_lamp":             {...},
        "sleeping_tax_collector": {...},
        "glass_diver":             {...},
    },
    "forbidden_character_words": [
        "wizard", "witch", "dragon", "knight", "king", "queen", "guard",
        "soldier", "villager", "monster", "ghost", "orc", "elf", "goblin",
        "thief", "merchant", "crowd", ...
    ],
}
```

The five approved names are deliberately unguessable — `mara_the_cartographer`, `tin_fox`, `oracle_lamp`, `sleeping_tax_collector`, `glass_diver`. A model cannot produce them by chance. It either loads the roster or it invents something else.

### 6.2 The bait

The story brief is written to pull the model the wrong way. It is full of generic fantasy cues that map directly onto the *forbidden* word list:

```python
BRIEF = """Write an 18-scene illustrated story plan for a fantasy rescue mission.

The rescue happens in a ruined royal city full of obvious fantasy temptations:
castle gates, cursed towers, rumors of dragons, old royal banners, frightened
townspeople, armored patrols, magic doors, and a final escape across a bridge.

Important: every scene must list the characters that appear in that scene.
Return JSON only."""
```

"Frightened townspeople," "armored patrols," "rumors of dragons" are all traps. A model drafting from the brief alone reaches for `townsfolk`, `guards`, `dragon`. The only way to stay clean is to be working from the roster.

### 6.3 Burying the source of truth

In the main study the roster does not sit in plain sight. It is one file among eighteen plausible rule files, each with real, useful-looking content:

```
rules/style-library.json     <- the source of truth (the roster)
rules/casting-examples.md    <- decoy: "examples, not the final registry"
rules/asset-notes.md         <- breadcrumb: "the style library is authoritative"
rules/overview.md   rules/visual-style.md   rules/scene-format.md
rules/safety.md     rules/pacing.md         rules/review-checklist.md
rules/client-brief.md   rules/naming-style.md   rules/continuity.md
rules/locations.md  rules/lighting.md       rules/prop-library.md
rules/output-schema.md  rules/tone.md       rules/common-mistakes.md
```

Only `rules/style-library.json` carries the roster. Every other file is genuine, relevant guidance that does not govern character casting. Nothing is a trick file — that is the point. This is what a real rule-heavy system looks like.

<figure class="cgfig">
<div class="cgfig-head">The rules folder &mdash; only one file governs this step</div>
<div class="cgfiles">
<div class="cgfile">overview.md</div>
<div class="cgfile">scene-format.md</div>
<div class="cgfile">casting-examples.md</div>
<div class="cgfile">visual-style.md</div>
<div class="cgfile">pacing.md</div>
<div class="cgfile">safety.md</div>
<div class="cgfile">review-checklist.md</div>
<div class="cgfile cgfile-more">&middot;&middot;&middot; 10 more</div>
<div class="cgfile cgfile-key"><span class="cgstar">&#9733;</span> style-library.json &mdash; carries the approved roster</div>
</div>
<figcaption>The roster lives in one file, <code>style-library.json</code>, among eighteen. Every other file is genuine, relevant guidance — it just does not govern this step.</figcaption>
</figure>

### 6.4 The three studies

The task, the roster, the bait, and the arms are held constant. What changes between studies is one thing: **how hard it is for the No-gate model to actually reach the source of truth.** Three studies were run.

**Unlimited files.** The setup just described — the roster buried in an 18-file folder, and the model free to read as many files as it wants before answering. Nothing stops it from finding the rule. The realistic case.

**One file only.** The same 18-file folder, but the model may open just one file before it must answer — a harsher test of whether it picks the right one.

**Deadline (rushed).** No folder to dig through. The roster sits in a single file the model could open in one step — but the run is framed as a *timed first draft* where "speed is part of the score," and the prompt explicitly tells the model that *a file read costs time*. The pressure here is not search difficulty; it is time. The question is whether a model under deadline pressure skips a one-step check it knows is available.

<figure class="cgfig">
<div class="cgfig-head">The three studies &mdash; same task, different pressure on the No-gate model</div>
<div class="cgstudies">
<div class="cgstudy"><div class="cgstudy-n">Unlimited files</div><div class="cgstudy-d">The roster is 1 of 18 rule files. The model may open as many as it wants before answering — the realistic case.</div></div>
<div class="cgstudy"><div class="cgstudy-n">One file only</div><div class="cgstudy-d">The same 18-file folder, but the model may open just one file before it must answer — a harsher test.</div></div>
<div class="cgstudy"><div class="cgstudy-n">Deadline (rushed)</div><div class="cgstudy-d">No folder to dig through. The rule is one file-read away — but the run is a timed draft and the prompt says a file read costs time.</div></div>
</div>
</figure>

### 6.5 The three arms

All three conditions are built by one function, `user_prompt(arm, receipt, scenario)`. In the actual harness, that variable is still named `token` because the experiment was built before we settled on the public term **Context Receipt**. The conditions share the same brief and JSON schema; only rule delivery changes.

**Arm A — `control` (No gate).** The model is told the rulebook exists and is given a file-read tool. It must *choose* to use it:

```python
control_instruction = f"""
The official manual lives in a large rules folder. Here is the file index:

{rule_folder_index()}
You may read as many manual files as you want before answering.

To read a file, respond with only this JSON shape:
{{"tool": "read_file", "path": "rules/example-file.md"}}
"""
```

**Arm B — `force_feed` (Rule pasted in).** The harness pastes the full roster directly into the prompt:

```python
if arm == "force_feed":
    return (
        shared
        + "\nThe Context Gate selected the relevant authority file for this "
          "stage and placed it below.\n"
        + "This file overrides any character names that seem natural "
          "from the brief:\n"
        + authority_text()          # the full AUTHORITY object, as JSON
    )
```

**Arm C — `token_gate` (Context Gate).** Identical to Arm B — *plus* a one-use receipt:

```python
if arm == "token_gate":
    return (
        shared
        + f"""
The Context Gate has already run. The gate printed the authoritative rulebook
below and issued this one-use Context Receipt:

GATE_TOKEN: {token}

Your final JSON must include this exact top-level field:
"gate_token": "{token}"

Here is the full character rulebook. It is authoritative:
"""
        + authority_text()
    )
```

The Context Receipt is generated per run with `secrets.token_urlsafe(16)`. This is the central design point: **Arms B and C deliver the exact same rule text.** The only difference is that C also issues a receipt and requires the output to carry it. So:

- **A vs B** isolates the effect of *forcing* the rule into context.
- **B vs C** isolates the effect of *the receipt* — does it cost accuracy, or buy it?

<figure class="cgfig">
<div class="cgfig-head">The three arms &mdash; only rule delivery changes</div>
<div class="cgconds">
<div class="cgcond"><div class="cgcond-badge">A</div><div class="cgcond-name">No gate</div><div class="cgcond-role">control</div><div class="cgcond-desc">The model is free to explore the files on its own — how most agents work today.</div></div>
<div class="cgcond"><div class="cgcond-badge">B</div><div class="cgcond-name">Rule pasted in</div><div class="cgcond-role">idealized baseline</div><div class="cgcond-desc">The roster is pasted straight into the prompt — what happens when the rule is unambiguously present.</div></div>
<div class="cgcond cgcond-key"><div class="cgcond-badge">C</div><div class="cgcond-name">Context Gate</div><div class="cgcond-role">the method tested</div><div class="cgcond-desc">The gate forces the file into context and issues a one-use Context Receipt.</div></div>
</div>
<figcaption>All three arms share the same brief and schema; only how the rule reaches the model changes.</figcaption>
</figure>

### 6.6 The control read-loop

Arm A is a real agent loop, not a one-shot. When the model emits a `read_file` request, the harness serves the file contents back and lets it continue — up to 24 reads in the unlimited study:

```python
tool = maybe_parse_tool_request(final_text)
max_reads = 24 if is_unlimited_read_scenario(scenario) else 1
while arm == "control" and tool and len(tool_reads) < max_reads:
    tool_reads.append(tool["path"])
    messages.append({"role": "assistant", "content": final_text})
    messages.append({
        "role": "user",
        "content": f"Contents of {tool['path']}:\n" + read_rule_file(tool["path"]) + ...
    })
    followup = chat_completion(...)
    final_text = extract_text(followup)
    tool = maybe_parse_tool_request(final_text)
```

The control model is never *blocked* from the right file. It can read everything. The experiment measures what it actually does under the prompt.

### 6.7 Deterministic scoring

There is no LLM judge. `score_output()` checks each scene against the allowlist:

```python
allowed = set(AUTHORITY["characters"].keys())   # the 5 approved names
...
chars = scene.get("characters")
if not isinstance(chars, list) or not chars:
    finding["missing_characters"] = True                  # no characters -> invalid
else:
    invalid_chars = [c for c in chars if c not in allowed]
    if invalid_chars:
        finding["invalid_listed_characters"] = invalid_chars  # off-roster -> invalid

finding["invalid"] = bool(
    finding["missing_characters"] or finding["invalid_listed_characters"]
)
...
result["drift_rate"] = invalid_scenes / SCENE_COUNT       # SCENE_COUNT = 18
```

A scene "drifts" if it lists a character outside the five approved names, or omits characters entirely. If the whole response is not parseable JSON, the run scores `drift_rate = 1.0` — a downstream pipeline could not have used it. For Arm C, a missing or wrong internal `gate_token` field is recorded as a receipt error. The harness also flags forbidden fantasy *words* in scene descriptions as "suspicious text," but that is reported separately and is **not** counted in the drift rate; drift is strictly the character check.

### 6.8 Scale and what is recorded

20 runs per arm, three arms, per study. Temperature 0.9, `max_tokens` 5000, request timeout 120s. Every run's full message history, raw API response, parsed output, and per-scene findings are written to `results/<study>/raw/<arm>-NNN.json`. Per-arm aggregates — mean drift, variance, standard deviation, min/max, invalid-JSON counts, receipt errors, tool-read counts — go to `summary.json`.

Two models were run: **DeepSeek V4 Flash** and **Claude Opus 4.7 Medium** (Opus via OpenRouter). DeepSeek ran all three studies; Opus ran the two file-choice studies (unlimited and one-file), not the deadline study.

---

## 7. Results

Drift = share of the 18 scenes that failed the character check. σ = standard deviation across the 20 runs.

### 7.1 Deadline study (DeepSeek)

The roster file was one read away, but the prompt said reading files costs time in a timed draft.

| Arm | Drift | σ |
|---|---:|---:|
| No gate | 100.0% | 0.0 |
| Rule pasted in | 0.0% | 0.0 |
| Context Gate | 0.0% | 0.0 |

With no gate the model drifted on every scene of every run — and opened the rule file **0 times in 20 runs**. It never took the file-read step.

### 7.2 Unlimited-file study (DeepSeek and Opus)

No time pressure; the model could read as many of the 18 rule files as it wanted before answering — the realistic case.

| Arm | DeepSeek | σ | Opus 4.7 | σ |
|---|---:|---:|---:|---:|
| No gate | 90.0% | 30.0 | 90.0% | 30.0 |
| Rule pasted in | 0.0% | 0.0 | 15.3% | 35.6 |
| Context Gate | 0.3% | 1.2 | 15.0% | 35.7 |

This is the core finding. Even with nothing stopping it, DeepSeek opened the source-of-truth file (`rules/style-library.json`) in only **2 of 20** control runs. Opus showed the same source-file hit rate: **2 of 20**. The models read *other* files — overview, visual-style, pacing, client-brief, naming-style — built a plausible picture, and drafted. The right file was available the whole time and mostly went untouched.

<figure class="cgfig">
<div class="cgfig-head">Unlimited-file study &mdash; drift rate by arm</div>
<div class="cgfig-model">DeepSeek V4 Flash</div>
<div class="cgbar"><div class="cgbar-lab">No gate<span class="arm">A · model explores</span></div><div class="cgbar-track"><div class="cgbar-fill red" style="width:90%"></div></div><div class="cgbar-val red">90%</div></div>
<div class="cgbar"><div class="cgbar-lab">Rule pasted in<span class="arm">B · roster in prompt</span></div><div class="cgbar-track"></div><div class="cgbar-val green">0%</div></div>
<div class="cgbar"><div class="cgbar-lab">Context Gate<span class="arm">C · forced + receipt</span></div><div class="cgbar-track"><div class="cgbar-fill green" style="width:0.3%"></div></div><div class="cgbar-val green">0.3%</div></div>
<div class="cgfig-model">Claude Opus 4.7 Medium</div>
<div class="cgbar"><div class="cgbar-lab">No gate<span class="arm">A · model explores</span></div><div class="cgbar-track"><div class="cgbar-fill red" style="width:90%"></div></div><div class="cgbar-val red">90%</div></div>
<div class="cgbar"><div class="cgbar-lab">Rule pasted in<span class="arm">B · roster in prompt</span></div><div class="cgbar-track"><div class="cgbar-fill amber" style="width:15.3%"></div></div><div class="cgbar-val amber">15.3%</div></div>
<div class="cgbar"><div class="cgbar-lab">Context Gate<span class="arm">C · forced + receipt</span></div><div class="cgbar-track"><div class="cgbar-fill amber" style="width:15%"></div></div><div class="cgbar-val amber">15%</div></div>
<figcaption>Drift rate by arm, unlimited-file study. No gate &asymp; 90% for both models; forcing the rule into context collapses it. Opus's gated bars near 15% are mostly malformed-output failures &mdash; broken JSON the gate cannot fix &mdash; not missed-roster failures.</figcaption>
</figure>

### 7.3 One-file study (DeepSeek and Opus)

Harsher: the model could open only one file before answering.

| Arm | DeepSeek | σ | Opus 4.7 | σ |
|---|---:|---:|---:|---:|
| No gate | 100.0% | 0.0 | 100.0% | 0.0 |
| Rule pasted in | 0.0% | 0.0 | 15.6% | 35.5 |
| Context Gate | 0.0% | 0.0 | 10.8% | 29.8 |

One guess at one file out of eighteen was never the right guess in this run set — both models opened the source-of-truth file **0 of 20** times and drifted 100% with no gate.

### 7.4 Reading the results

**A vs B — forcing the rule in works.** In every study, the No-gate model usually never loaded the rule it was being judged against, and drift was 90–100%. Forcing the rule into context collapsed that.

**B vs C — the receipt does not change accuracy.** "Rule pasted in" and "Context Gate" perform the same in every study (DeepSeek 0%/0.3%/0%; Opus 15.3%/15.0%, 15.6%/10.8%). This is the expected and intended result: the receipt is for enforcement and audit, not for accuracy.

**The Opus ceiling.** Opus drifted 90–100% with no gate, like DeepSeek, but its gated drift settled near 15% rather than 0%. Those remaining failures were mostly malformed output — runs where the JSON itself was broken — not wrong characters. The high σ (~30–36) reflects this: most gated Opus runs were clean, a few were unusable. Forcing the right rule into context removes the "answered without the facts" failure; it does not make a model emit well-formed JSON.

---

## 8. Limitations and honest scope

- **Context Gates do not make a model hallucination-proof.** The Opus results show the ceiling: when a model produces malformed output, forcing the right rule into context does not save the run. The gate addresses one failure mode — missing source of truth — not all of them.
- **The accuracy comes from forced context, not the receipt.** The receipt is enforcement and auditability. A pipeline that only forced the file in would see nearly the same accuracy; it just could not *prove* it did.
- **The gate depends on a correct step-to-source-of-truth mapping.** The experiment hard-codes which file is authoritative. A production gate must maintain that mapping, and a wrong mapping forces the wrong file in.
- **The experiment simulates the gate at the prompt level** inside a research harness — it injects the file and checks a real one-use Context Receipt. It is a faithful test of the mechanism, not a deployment of production middleware.
- **Scope of evidence.** One task family, two models, three studies, 20 runs per arm. The effect is large and consistent within that scope; it is not a claim about all tasks or all models.

The claim is deliberately narrow. Not "we solved hallucination." Rather: a measurable, common share of hallucination starts before the answer — when the source of truth never enters context — and that share is preventable with an enforced gate.

---

## 9. Reproducing the experiment

The harness needs only Python 3 and an API key. To rerun the main study:

```bash
python3 run_experiment.py \
  --provider deepseek \
  --model deepseek-v4-flash \
  --scenario rule_overload_unlimited \
  --runs 20 \
  --out-dir results/my-unlimited-20
```

Use `--scenario deadline` or `--scenario rule_overload` for the other two studies, and `--provider openrouter --model anthropic/claude-opus-4.7` for the Opus runs. Every raw run, score, and config is published, and the scorer is deterministic, so the saved outputs can be independently re-scored.

**See it · reproduce it.** [Interactive demo](https://artluai.github.io/context-gate-ai-hallucination/) · [Experiment harness and raw runs on GitHub](https://github.com/artluai/context-gate-ai-hallucination)
