# Spec Title

<!-- One spec per work item. Written by the planner, reviewed in batch by the spec reviewer
(max two rounds), implemented by one builder in an isolated git worktree following the
Implementation Tasks below in order, verified section-by-section by the implementation
reviewer. The builder checks off each task box as it completes it. Generated specs are per-run
working artifacts (gitignored); only this template is tracked. -->

## Overview
- Summarize the purpose, background, and deliverables for this spec.
- Purpose:
- Background:
- Deliverables:

## Requirements
- List only confirmed requirements, MVP scope, and acceptance criteria.
- Goal / deliverables:
- MVP:
- Non-goals:
- Acceptance criteria:
- Constraints / risks:

## Design
- Describe the design at implementation-level granularity.

### Target Files
- List files to add, update, or delete and the purpose of each change. Two specs in the same
  run must not claim the same file — the spec reviewer rejects overlap.
- Add:
  - `path` - one-line purpose
    - Notes:
- Update:
  - `path` - one-line purpose
    - Notes:
- Delete:
  - `path` - one-line purpose
    - Notes:

### Modules, Classes, And Functions
- Describe the main responsibility units and dependencies.
- Module: `path` - one-line purpose
  - Class/function: `name` - one-line purpose
    - Notes:
  - Responsibility:
  - Input/output:
  - Dependencies:

### Data Models
- Describe persisted or exchanged data structures and field meanings.
- Model: `Model` - one-line purpose
  - Fields:
    - `name: type` - one-line meaning
  - Validation:

### API
- Use this section when adding or changing an API.
- Endpoint: `/path` - one-line purpose
  - Method: `GET/POST/...`
  - Authentication / authorization:
  - Input: params/body, types, required fields, validation
  - Output: status and response schema
  - Errors: status, condition, message

### Data Storage
- Use this section when adding or changing storage/schema.
- Table/collection: `name` - one-line purpose
  - Change: add/update/delete
  - Columns/fields: name/type/null/default
  - Constraints/indexes:
  - Migration plan:

### Errors And Exceptions
- List expected errors and handling policy.
- Error: condition / message - one-line handling policy

## Implementation Tasks
- The builder works these in order and checks each box (`[ ]` -> `[x]`) in this file as it
  completes it. This is the lifecycle — do not reorder it. Tests come before implementation.
- [ ] Decide implementation approach, boundaries, and affected files.
- [ ] Write tests first for normal, error, and boundary cases (they must fail before implementation exists).
- [ ] Implement the target files/classes/functions to satisfy every acceptance criterion.
- [ ] Refactor to remove duplication and unnecessary complexity; keep tests green.
- [ ] Pass implementation review: diff against this spec section by section, fix every valid finding, rerun until none remain.
- [ ] Update docs/ to reflect the new confirmed state — only after review passes.

## Completion Tasks
- Run before committing the lane.
- [ ] Inspect `git status` and the diff; confirm only intended files changed.
- [ ] Run every command in `## Verification` and fix failures.
- [ ] Run `git diff --check` and fix whitespace/patch errors.
- [ ] Confirm docs/ are updated when behavior, requirements, or design changed.
- [ ] Commit the change on this item's branch.

## Test Cases
- List concrete TDD coverage (these are written first, in the Implementation Tasks).
- Normal:
- Error:
- Boundary:

## Verification
- List the project's own commands and manual checks (e.g. the test and build commands).
- Commands:
- Manual checks:

## Completion Criteria
- Every box in `## Implementation Tasks` and `## Completion Tasks` is checked.
- All acceptance criteria met, the spec's test cases pass, implementation review passed.
- docs/ reflect the change.
