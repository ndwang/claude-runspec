# Setting up runspec

This is a runbook for an interactive coding-agent session. Open Claude Code in the target
repository and tell it: **"set up runspec by following SETUP.md."** The agent reads this file
and executes the path that matches the repo.

`install.sh` (next to this file) does the deterministic file copy. This runbook does the
judgment: interviewing, scaffolding, finding the test command, and writing the docs.

**This runbook only sets things up. It never runs `/runspec`.** It ends at "ready to run,"
reports what it did, and tells the user how to launch the first run — it does not launch it.

Pick the path:
- **No code yet / brand-new directory →** [New project](#new-project).
- **Existing repository with code →** [Existing project](#existing-project).

---

## New project

Greenfield. **Run `install.sh` first**, then interview and scaffold. Do the steps in order.

1. **Install the runspec bundle first, before anything else.** Run `install.sh` with the target
   as its argument: `bash <path-to-runspec>/install.sh .` — `<path-to-runspec>` is the directory
   holding SETUP.md. It drops in the workflow, skills, the spec template, `specs/`, and the
   `.gitignore` entries.
2. **Interview the user.** Ask, conversationally, and confirm a summary before building:
   - What is the project — purpose and scope?
   - Primary programming language?
   - Tech stack / frameworks / runtime?
   - Test framework (and the command to run it)?
   - Preferred file/directory organization?
   - License, and anything else worth pinning down.
3. **Initialize the repo.** `git init` if it isn't a repo yet, on a clean main branch. Create
   the directory layout from the interview.
4. **Stand up the test runner.** Install/configure the chosen framework and add **one trivial
   passing test**, then run it to confirm green. This makes "the tests pass" meaningful from the
   very first run — runspec's Integrate phase gates on it. Then add the project's test (and any
   build/lint) command to `.claude/settings.json` (installed in step 1) under `permissions.allow`
   — e.g. `"Bash(npm test:*)"` — so Integrate runs it without a permission prompt. The git
   commands the workflow uses are already pre-approved there.
5. **Write the docs.**
   - `AGENTS.md` is the canonical agent doc: product vision/scope, stack, conventions, the
     **test command**, and **[the master rules](#the-opinionated-master-rules)** — new projects
     always adopt them, so include them without asking.
   - Make `CLAUDE.md` a **symlink to `AGENTS.md`** (`ln -s AGENTS.md CLAUDE.md`) so Claude Code
     and other agents read one source of truth.
   - Write a `README` for humans.
6. **Commit** the scaffold as one clear commit.
7. **Stop and report.** List what was set up and tell the user they can now run
   `/runspec 'their first goal'`. Do not run it.

---

## Existing project

The repo already has a stack, a layout, conventions, and history. **Respect them — discover and
adapt, never impose.** The "interview" here is a confirmation review: infer what you can, ask the
user only to confirm or correct.

1. **Check preconditions.** Confirm it's a git repo, the working tree is clean, and you're on a
   branch (not detached HEAD). Stop and report if any of these fail.
2. **Install the bundle.** Run `bash <path-to-runspec>/install.sh .` and read its report. If it
   **skipped** `specs/SPEC_TEMPLATE.md` or a same-named skill, surface that to the user: the
   planner reads `specs/SPEC_TEMPLATE.md`, so the repo must use runspec's or a compatible one. Only re-run with
   `--force` to overwrite once the user agrees.
3. **Establish a green baseline.** Discover the project's test command, **actually run it**, and
   confirm it passes. If the baseline is red, **stop and report** — runspec's Integrate phase
   assumes green, and a pre-existing failure would corrupt every run's signal. (Don't add specs
   or workflow pointers to the docs — Claude Code discovers the workflow and skills on its own.)
4. **Pre-approve the workflow's commands.** Subagents run in `acceptEdits` mode, which prompts on
   `git merge`/`git worktree`/the test command unless they're allowlisted. install.sh ships
   `.claude/settings.json` pre-approving the workflow's git commands — but if the repo already had
   a `.claude/settings.json`, install.sh skipped it, so **merge** runspec's `permissions.allow`
   entries into the existing one (never overwrite it). Either way, add the project's test (and any
   build/lint) command, e.g. `"Bash(pytest:*)"`.
5. **Make sure `CLAUDE.md` exists.** If it already does, leave it. If not and an `AGENTS.md`
   exists, symlink `CLAUDE.md → AGENTS.md` (`ln -s AGENTS.md CLAUDE.md`). If neither exists,
   draft a short `AGENTS.md` from the codebase (stack, conventions, test command) for the user to
   confirm, then symlink `CLAUDE.md` to it. Never overwrite an existing `CLAUDE.md`.
6. **Master rules.** Present [the opinionated master rules](#the-opinionated-master-rules) and let
   the user decide interactively whether to adopt them. For a mature codebase the safe default is
   additive — don't force them on. If the user opts in, merge them into the docs **without**
   overwriting the repo's existing conventions.
7. **Confirm structure.** `install.sh` created `specs/` (with the tracked template; generated
   specs are gitignored). Do **not** reorganize the repo's existing files.
8. **Commit** the setup as one clear commit (e.g. "Add runspec workflow").
9. **Stop and report.** Confirm the bundle is in place and the baseline is green, then tell the
   user how to launch — suggest a small, low-risk first goal to validate the loop end-to-end. Do
   not run `/runspec`.

---

## The opinionated master rules

runspec carries a coding philosophy from its lineage. **New projects adopt these by default**,
recorded in `AGENTS.md`. **For an existing project, offer them and let the user decide** — and if
adopted, merge them in without overwriting the repo's existing conventions.

- **No backward compatibility, compatibility layers, or aliases** unless explicitly required —
  prefer a clean breaking change that keeps the implementation simpler.
- **Remove historical traces.** Code should read as if the new behavior had always existed — no
  "kept for compatibility" comments, no dead alternative paths.
- **No silent fallbacks or ad hoc alternative paths** unless explicitly requested.
- **Fail fast.** If safe continuation isn't possible, raise a clear error. Don't pass default
  fallback values to env/config lookups — require the variable and fail clearly if it's missing.
- **Specs are the contract.** Plan with `specs/SPEC_TEMPLATE.md`; build test-first (TDD).
