export const meta = {
  name: 'runspec',
  description:
    'One run: plan -> spec review -> parallel work lanes (build/review/docs in isolated git worktrees) -> integrate & test -> write a structured run report. A self-contained, product-agnostic agentic build loop.',
  phases: [
    { title: 'Plan', detail: 'decompose the goal into independent, parallel specs' },
    { title: 'Spec review', detail: 'batch critique; catch cross-spec conflicts' },
    { title: 'Work lanes', detail: 'per item: build -> skeptic review -> docs, in an isolated worktree' },
    { title: 'Integrate', detail: 'merge lanes, resolve conflicts, loop tests to green' },
    { title: 'Report', detail: 'compile the run report to ./run-reports/' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. Launched as `/runspec with goal '...' and direction '...'`.
// Read defensively: args may be an object, a JSON string, or a bare goal string.
// ---------------------------------------------------------------------------
let input = args
if (typeof input === 'string') {
  try { input = JSON.parse(input) } catch { input = { goal: input } }
}
const goal = (input && input.goal) || 'Advance the project per the latest direction and the project conventions.'
const direction = (input && input.direction) || ''
const runId = (input && input.runId) || null // null => reporter derives a slug from the goal

const MAX_SPEC_REVIEW_ROUNDS = 2
const MAX_BUILD_ATTEMPTS = 3 // 1 build + 2 retries with objections attached

const CONTEXT = `
RUN GOAL:
${goal}

CARRY-OVER DIRECTION (standing guidance from the last review — honor it):
${direction || '(none — this is the first run)'}

If the project has a CLAUDE.md or AGENTS.md, read it first for product context,
contracts, and conventions. Specs follow specs/SPEC_TEMPLATE.md. Spec review follows the
spec-review skill. Builders follow the spec's Implementation Tasks in order — tests
first — per the test-driver skill. Docs follow the docs-maintainer skill.
`.trim()

// ---------------------------------------------------------------------------
// Schemas — every agent returns validated structured data, never prose.
// ---------------------------------------------------------------------------
const SPECS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'specPath', 'purpose', 'acceptanceCriteria', 'targetFiles', 'testCases'],
        properties: {
          id: { type: 'string', description: 'short slug, e.g. "minutes-endpoint"' },
          title: { type: 'string' },
          specPath: { type: 'string', description: 'path to the written spec file, e.g. specs/minutes-endpoint.md' },
          purpose: { type: 'string' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' } },
          targetFiles: { type: 'array', items: { type: 'string' } },
          testCases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    planSummary: { type: 'string' },
  },
}

const SPEC_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'crossSpecConflicts', 'perSpecIssues', 'summary'],
  properties: {
    approved: { type: 'boolean' },
    crossSpecConflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemIds', 'issue'],
        properties: {
          itemIds: { type: 'array', items: { type: 'string' } },
          issue: { type: 'string' },
        },
      },
    },
    perSpecIssues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'issues'],
        properties: {
          itemId: { type: 'string' },
          issues: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'filesChanged', 'escalateContractIssue'],
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' } },
    escalateContractIssue: {
      type: 'boolean',
      description: 'true ONLY if implementing this faithfully would weaken an already-implemented contract — a human decision, not a lane decision',
    },
    escalationReason: { type: 'string' },
  },
}

const LANE_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'specWrong', 'reasons', 'summary'],
  properties: {
    pass: { type: 'boolean' },
    specWrong: {
      type: 'boolean',
      description: 'true if the failure is the spec being wrong (weakening a contract), which must escalate to the human rather than be fixed in-lane',
    },
    reasons: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const DOCS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['updated', 'files', 'summary'],
  properties: {
    updated: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const INTEGRATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mergedBranches', 'conflictsResolved', 'testStatus', 'summary'],
  properties: {
    mergedBranches: { type: 'array', items: { type: 'string' } },
    conflictsResolved: { type: 'array', items: { type: 'string' } },
    testStatus: { type: 'string', enum: ['green', 'red', 'no-tests'] },
    testOutput: { type: 'string' },
    commitRange: { type: 'string', description: 'e.g. abc123..def456 for the reporter to diff' },
    summary: { type: 'string' },
  },
}

const REPORT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['written', 'reportPath', 'openQuestions', 'summary'],
  properties: {
    written: { type: 'boolean' },
    reportPath: { type: 'string', description: 'path to the saved Markdown report' },
    jsonPath: { type: 'string', description: 'path to the saved raw run record' },
    openQuestions: { type: 'number', description: 'escalated + unresolved items needing a human decision' },
    specsRemoved: { type: 'array', items: { type: 'string' }, description: 'completed spec files deleted after the report was written' },
    summary: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// 1. Plan
// ---------------------------------------------------------------------------
phase('Plan')
let specs = await agent(
  `${CONTEXT}

You are the PLANNER. Decompose the run goal into concrete, non-overlapping work items. YOU decide
how many — split into as many genuinely independent items as the goal naturally divides into so
they can be built in parallel, but don't invent busywork or split work that's truly one unit. Each
item becomes its own parallel build lane, so favor parallelism: two items must NOT edit the same file.
For EACH item, write a spec file under specs/ following specs/SPEC_TEMPLATE.md exactly (purpose,
acceptance criteria, target files, modules, data models, test cases) — keep its
"## Implementation Tasks" and "## Completion Tasks" checklists verbatim; the builder works them.
Specs are the contract everything downstream verifies against, so make acceptance criteria precise and testable.

Write the spec files to disk now, then return the structured list. Do not implement anything.`,
  { schema: SPECS_SCHEMA, model: 'sonnet', label: 'planner' }
)

// ---------------------------------------------------------------------------
// 2. Spec review (batch; up to 2 rounds). Cross-spec conflicts are the point.
// ---------------------------------------------------------------------------
phase('Spec review')
for (let round = 1; round <= MAX_SPEC_REVIEW_ROUNDS; round++) {
  const review = await agent(
    `${CONTEXT}

You are the SPEC REVIEWER. Use the spec-review skill — its conventions are authoritative. Review ALL of this run's specs
TOGETHER in one batch — check each spec internally (clear, testable acceptance criteria;
realistic target files) AND check the set against each other. The thing you must not miss:
overlapping file claims between items that will collide at merge. Read the actual spec files.

Specs under review:
${JSON.stringify(specs.items, null, 2)}

Return approved=true only if every spec is sound and the set is conflict-free.`,
    { schema: SPEC_REVIEW_SCHEMA, model: 'sonnet', label: `spec-review-r${round}` }
  )
  log(`Spec review round ${round}: ${review.approved ? 'approved' : `${review.crossSpecConflicts.length} conflicts, ${review.perSpecIssues.length} per-spec issues`}`)
  if (review.approved) break
  if (round === MAX_SPEC_REVIEW_ROUNDS) {
    log('Spec review cap reached — proceeding with current specs (residual issues go on the report).')
    break
  }
  specs = await agent(
    `${CONTEXT}

You are the PLANNER, revising after spec review. Rewrite the spec files on disk to resolve
every issue below, especially cross-spec file collisions (re-partition the work so no two items
edit the same file). Return the full revised item list.

Review feedback:
${JSON.stringify(review, null, 2)}

Current specs:
${JSON.stringify(specs.items, null, 2)}`,
    { schema: SPECS_SCHEMA, model: 'sonnet', label: `planner-revise-r${round}` }
  )
}

// ---------------------------------------------------------------------------
// 3-5. Work lanes — parallel per item, each in its own git worktree.
// build -> skeptic review (retry w/ objections, cap 2) -> docs. Each lane
// exits fully done, escalated, or unresolved.
// ---------------------------------------------------------------------------
phase('Work lanes')

async function runLane(item, i) {
  const branch = `run/${item.id}`
  const wt = `.worktrees/${item.id}`
  let objections = ''
  let lastReview = null

  for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
    const build = await agent(
      `${CONTEXT}

You are a BUILDER. Your whole world is ONE spec. Read it: ${item.specPath}.

Work in an ISOLATED git worktree so parallel lanes don't collide:
- On attempt 1, create it from repo root: \`git worktree add -b ${branch} ${wt} HEAD\`
  (if it already exists, just cd into ${wt}).
- Do ALL your work inside ${wt} and commit on branch ${branch}.

Follow the spec's "## Implementation Tasks" IN ORDER — this is the lifecycle, do not reorder it
(test-driver skill is authoritative):
1. Decide the approach, boundaries, and affected files.
2. Write the tests FIRST for normal, error, and boundary cases — they must fail before the
   implementation exists. Do not write implementation before its failing test.
3. Implement the smallest clean change that satisfies every acceptance criterion.
4. Refactor to remove duplication and unnecessary complexity; keep tests green.
Check off each box (\`[ ]\` -> \`[x]\`) in ${item.specPath} as you complete it (the spec is a
per-run working artifact, not tracked in git — the checkmarks are for the reviewer reading the
worktree). Then run the spec's "## Completion Tasks" before your final commit.

${attempt > 1 ? `This is attempt ${attempt}. A reviewer REJECTED the previous attempt. Fix exactly these objections:\n${objections}\n` : ''}
Set escalateContractIssue=true ONLY if faithfully implementing this spec would weaken a
contract that is already implemented elsewhere — that is a human decision; do not silently resolve it.`,
      { schema: BUILD_SCHEMA, label: `build:${item.id}:a${attempt}`, phase: 'Work lanes' }
    )

    if (build.escalateContractIssue) {
      return { id: item.id, title: item.title, branch, status: 'escalated', reason: build.escalationReason, build }
    }

    lastReview = await agent(
      `${CONTEXT}

You are an IMPLEMENTATION REVIEWER — a fresh-eyed skeptic. You did not write this code.
Read the spec ${item.specPath}, then diff the worktree ${wt} against it section by section
(\`git -C ${wt} diff HEAD~..HEAD\` or against base as appropriate) and run its tests inside ${wt}.
Use the spec-review skill — its conventions are authoritative.

Verify the lifecycle was actually followed, not just the boxes checked:
- The spec's "## Implementation Tasks" boxes are checked AND genuinely done.
- Tests exist for the spec's normal/error/boundary cases and assert real behavior — not
  coverage-optics, not self-fulfilling tests that reimplement the code. The commit history
  should show tests landing before or with the implementation, not bolted on after.
Return pass=true only if every acceptance criterion is genuinely met and tests pass.
If the failure is that the SPEC itself is wrong (it would weaken an implemented contract),
set specWrong=true — that escalates to the human instead of being fixed in-lane.
Be specific in reasons; the builder will act on them verbatim.`,
      { schema: LANE_REVIEW_SCHEMA, model: 'sonnet', label: `review:${item.id}:a${attempt}`, phase: 'Work lanes' }
    )

    if (lastReview.specWrong) {
      return { id: item.id, title: item.title, branch, status: 'escalated', reason: lastReview.reasons.join('; '), build, review: lastReview }
    }
    if (lastReview.pass) {
      const docs = await agent(
        `${CONTEXT}

You are the DOCS MAINTAINER for this lane. Use the docs-maintainer skill — its conventions are authoritative. Inside worktree
${wt}, update docs/ to reflect the new CONFIRMED state from this item (spec ${item.specPath}):
rewrite stale sections, current state only, no history notes. This is the final Implementation
Task — check its box in ${item.specPath}. Commit the docs change on ${branch}.`,
        { schema: DOCS_SCHEMA, model: 'sonnet', label: `docs:${item.id}`, phase: 'Work lanes' }
      )
      return { id: item.id, title: item.title, branch, status: 'done', build, review: lastReview, docs }
    }

    objections = lastReview.reasons.map((r, n) => `${n + 1}. ${r}`).join('\n')
    log(`Lane ${item.id}: attempt ${attempt} rejected — ${lastReview.reasons.length} objection(s)`)
  }

  return { id: item.id, title: item.title, branch, status: 'unresolved', objections, review: lastReview }
}

const lanes = (await parallel(specs.items.map((item, i) => () => runLane(item, i)))).filter(Boolean)
const done = lanes.filter((l) => l.status === 'done')
const escalated = lanes.filter((l) => l.status === 'escalated')
const unresolved = lanes.filter((l) => l.status === 'unresolved')
log(`Lanes complete: ${done.length} done, ${escalated.length} escalated, ${unresolved.length} unresolved`)

// ---------------------------------------------------------------------------
// 6. Integrate & test — merge the done lanes into main, loop tests to green.
// ---------------------------------------------------------------------------
phase('Integrate')
const integrate = await agent(
  `${CONTEXT}

You are INTEGRATION. From the repo root on the main branch, merge ONLY these branches that
passed review: ${JSON.stringify(done.map((l) => l.branch))}.
- Record the pre-merge HEAD, then merge each branch; resolve any conflicts (code AND docs).
- Run a docs consistency pass so merged docs/ don't contradict each other.
- Run the project's tests and loop until they pass, capped at 3 attempts, fixing failures.
  The test command is usually obvious or documented. If the project genuinely has no tests,
  report 'no-tests'.
- Clean up the merged worktrees: \`git worktree remove <path>\` for each.
- Return commitRange as <pre-merge-HEAD>..HEAD so the reporter can diff the run.

Do NOT merge escalated/unresolved branches: ${JSON.stringify([...escalated, ...unresolved].map((l) => l.branch))} — leave them for the human.`,
  { schema: INTEGRATE_SCHEMA, label: 'integrate' }
)
log(`Integrate: ${integrate.mergedBranches.length} merged, tests ${integrate.testStatus}`)

// ---------------------------------------------------------------------------
// 7. Reporter — compile a structured run report a human reads to decide
// what happens next. File sink: ./run-reports/<runId>.{md,json}.
// Swap this phase to deliver the report elsewhere (PR comment, Slack, an
// HTTP endpoint) — everything above is delivery-agnostic.
// ---------------------------------------------------------------------------
phase('Report')
const runRecord = {
  goal,
  direction,
  specs: specs.items,
  planSummary: specs.planSummary,
  lanes,
  integrate,
}
const doneSpecPaths = done
  .map((l) => (specs.items.find((i) => i.id === l.id) || {}).specPath)
  .filter(Boolean)

const report = await agent(
  `${CONTEXT}

You are the REPORTER. Compile the run report a human reads to decide what happens next.
Here is everything that happened this run (planner output, every lane's build/review/docs
including failed attempts, and integration/test results):

${JSON.stringify(runRecord, null, 2)}

The full spec files are still on disk under specs/ — read whichever you need for the
spec-vs-implementation delta. Also read the real git history yourself: \`git log --oneline\`
and the diff for ${integrate.commitRange || 'the recent commits'}.

Write a structured Markdown report to ./run-reports/${runId ? runId : '<slug>'}.md
(\`mkdir -p run-reports\` first${runId ? '' : '; derive <slug> as a short kebab-case slug from the goal'}),
with these sections:
- **Goal** and a one-paragraph outcome.
- **Shipped** — one subsection per done item (${done.length}): the spec-vs-implementation delta, terse bullets.
- **Docs changed** — what was rewritten this run.
- **Open questions** — one entry per escalated item (${escalated.length}) and per unresolved item
  (${unresolved.length}); state precisely what decision you need from the human. If there are none, say so.
- **Proposed next steps** — concrete options for the next run's goal/direction.
Also write the raw run record to ./run-reports/${runId ? runId : '<slug>'}.json for tooling.

FINALLY, once the report is written, BEST-EFFORT clean up the completed specs — their lanes merged
and shipped, so they're spent: try to delete each of ${JSON.stringify(doneSpecPaths)}
(\`git clean -fX --\` on them, or \`rm -f\`) and return whatever you removed in specsRemoved.
This is non-essential and must never block the run: the specs are gitignored, so if a permission
restriction stops the delete, just skip it and set specsRemoved=[] — do not retry or stall.
Do this LAST, after you've used the specs for the report. Leave the specs for escalated/unresolved
items in specs/ — they're the run's open work for the human.

Return the structured result, with openQuestions = escalated + unresolved count.`,
  { schema: REPORT_RESULT_SCHEMA, label: 'reporter' }
)

log(`Reporter: written=${report.written} path=${report.reportPath} openQuestions=${report.openQuestions} specsRemoved=${report.specsRemoved?.length ?? 0}`)

return {
  goal,
  lanes: { done: done.length, escalated: escalated.length, unresolved: unresolved.length },
  testStatus: integrate.testStatus,
  report,
}
