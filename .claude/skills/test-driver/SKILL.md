---
name: test-driver
description: Test-driven development discipline for a builder lane — write failing tests first, implement the smallest clean change, then refactor. Use when implementing a spec's Implementation Tasks in the runspec workflow, or any time non-test code changes externally observable behavior.
---

# Test Driver (TDD)

## Purpose
- Tests exist to give justified confidence that a change works and stays easy to change —
  not to manufacture coverage. A passing test lets work proceed; a failing test points at
  something worth fixing.

## The order is the lifecycle
This maps onto the spec's `## Implementation Tasks` and must not be reordered:
1. Decide the approach, boundaries, and affected files.
2. **Write the tests first** — for normal, error, and boundary cases. They must fail before
   the implementation exists (a test that passes against no implementation is testing nothing).
3. Implement the smallest reasonable clean change that makes them pass.
4. Refactor to remove duplication and unnecessary complexity; tests stay green.

## When full TDD is required
- For any change to externally observable behavior or a contract, write failing tests first.
- For pure renames, mechanical edits, docs, or config, targeted verification may be enough.
- When unsure, judge by how much observable contract changes.

## Minimum per change
- At least one normal case plus the relevant error, boundary, empty, not-found, or
  permission cases. For a conditional, cover both reachable paths.
- Assertions check return values, state changes, side effects, or exception type/message —
  not merely the absence of a crash.

## Tests to avoid
- **Brittle/fragile**: coupled to harmless refactors, private helper splits, internal call
  order, or exact wording when structure is the real contract.
- **Flaky**: dependent on live network, sleeps, wall clock, randomness, or leaked shared state.
- **Self-fulfilling**: reimplement the production logic and pass the same bug twice.
- **Coverage-optics**: `does not throw`, `is not null`, huge snapshots, or mock choreography
  with no behavioral assertion.
- If only a brittle test is possible, change the design first. If a brittle/flaky test is
  genuinely unavoidable, say why instead of forcing it.

## Prompt / instruction / template tests
- Test structure, tags, placeholders, schema fields, branching, and interpolation — not full
  editorial text, unless the exact wording is the stable contract.

## Run them
- After editing, run the project's own test command (and build/type-check where it has one),
  and loop until green. For a focused run, target the new tests by name or path first.
