# runspec

A drop-in **spec-driven, test-first agentic workflow** for Claude Code: one command (`/runspec`)
takes a goal and runs a full build loop across parallel subagents, then writes a structured
report a human reads to decide what happens next.

```
plan ──▶ spec review ──▶ ║ build ─▶ skeptic review ─▶ docs ║ ──▶ integrate & test ──▶ report
 (1)        (2, ≤2 rounds)  ╚═══ parallel lane per spec ═══╝     (merge to green)      (to disk)
```

It is product-agnostic. Copy the `.claude/` bundle and `SPEC_TEMPLATE.md` into any git repo
and run `/runspec`.

## What it does

`/runspec` is a [dynamic workflow](https://docs.claude.com/en/docs/claude-code) (`.claude/workflows/runspec.mjs`)
that orchestrates a fleet of subagents through five phases:

1. **Plan** — a planner decomposes the goal into as many independent, non-overlapping specs as it
   naturally divides into (it decides the count, favoring parallel-friendly splits where two specs
   never touch the same file), each following `SPEC_TEMPLATE.md` including its checkbox lifecycle,
   written to `specs/`.
2. **Spec review** — one reviewer critiques all specs as a batch (≤2 rounds), catching
   cross-spec file collisions *before* the fan-out. Governed by the `spec-review` skill.
3. **Work lanes** — one lane per spec, running **in parallel, each in its own git worktree**
   so they can't collide. Each lane: a builder works the spec's `## Implementation Tasks` **in
   order — TDD, tests first** (`test-driver` skill), checking off each box → a fresh skeptic
   reviewer diffs it against the spec section-by-section, confirms the tests are real, and runs
   them → on pass, the `docs-maintainer` skill updates `docs/`. Rejections retry with objections
   attached (cap 2).
4. **Integrate** — merge only the lanes that passed, resolve conflicts, loop the project's
   build/test to green, and clean up the worktrees.
5. **Report** — a reporter compiles a structured Markdown run report (what shipped, what
   docs changed, open questions needing a decision, proposed next steps) to `run-reports/`.

Every agent returns **schema-validated structured data**, never prose, so the orchestration is
deterministic. Escalations (a spec that would weaken an existing contract, or an item that
can't pass review) are never silently resolved — they surface as **open questions** in the
report for a human to decide.

## Use it

In a Claude Code session inside your repo:

```
/runspec with goal 'Add rate limiting to the public API' and direction 'keep the 60rps default'
```

- **goal** (required) — the run objective.
- **direction** (optional) — standing guidance carried over from a previous review.
- **runId** (optional) — names the report file; otherwise the reporter derives a slug.

The report lands at `run-reports/<runId>.md` (plus a `.json` raw record). Read it,
decide the next move, and run `/runspec` again with the new goal/direction. That manual
read-and-redirect loop is the human-in-the-loop gate.

## Install

```bash
# from your repo root
cp -r /path/to/runspec-kit/.claude/skills/*  .claude/skills/   # spec-review, docs-maintainer
cp    /path/to/runspec-kit/.claude/workflows/runspec.mjs  .claude/workflows/
cp    /path/to/runspec-kit/SPEC_TEMPLATE.md  .
```

Add `.worktrees/` to your `.gitignore`. The workflow assumes a git repo with a clean main
branch; if there's an `npm test`/`npm run build` it loops them to green, otherwise it reports
`no-tests`.

## Customize

- **Where the report goes.** The Report phase (phase 7 in `runspec.mjs`) is the only delivery
  seam — everything above it is delivery-agnostic and hands off a clean `runRecord` object.
  Swap that phase to POST the report to an HTTP endpoint, open a PR comment, or message Slack
  instead of (or in addition to) writing to disk.
- **Build/test commands.** The Integrate phase discovers your project's real test/build commands
  (package.json, Makefile, pyproject, Cargo, go, CI config, or a spec's Verification section) — no
  npm assumption. Naming them in `CLAUDE.md`/`AGENTS.md` makes discovery reliable.
- **Caps.** `MAX_SPEC_REVIEW_ROUNDS` and `MAX_BUILD_ATTEMPTS` at the top of `runspec.mjs`.
- **Model routing.** Planner/reviewers/docs run on `sonnet`; builders, integrator, and reporter
  inherit the session model. Adjust the `model:` options per `agent()` call.

## Lineage

The run loop and skills were extracted from the **Lab Meeting** project, where the report is
posted to a live voice-driven "lab meeting" app instead of written to disk. This kit is the
reusable core with that product-specific delivery cut behind the report seam.
