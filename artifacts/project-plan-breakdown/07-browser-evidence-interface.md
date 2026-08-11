# 07 — Browser evidence interface

This repository defines and verifies a browser-evidence contract. It never produces browser evidence
([ADR 0002](../adr/0002-browser-evidence-arrives-by-ingestion-contract.md)).

v1.0.0 ships the whole ingestion half — schema, loader, freshness verification, and the fixtures
that exercise every path — with no browser anywhere in the dependency graph. The producer is
deferred to `15-browser-evidence-producer.md`.

The verification rules are the point. An evidence file is external input authored by a tool this
repository does not control, so it gets the same suspicion as any other external input: it may not
invent rule identities, it may not claim freshness it cannot support, and a run that failed must
never look like a run that passed or a run that was never attempted.

---

### Define the evidence contract

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Specify exactly what a runner must emit, so any tool — Playwright, Cypress, or a
  hand-driven session — can participate without this repository knowing about it.
- **Deliverables:** `schemas/browser-evidence.schema.json`: `schemaVersion`, `producedBy`, `runAt`,
  `revision: { gitSha, sourceIdentity }`, `run: { status: completed|failed, failureReason }`,
  `viewports[]` — each `{ name, class, width, height }`, where `class` is one of the project's
  declared viewport classes so that coverage is comparable against `ui.viewportClasses` — and
  `routes[]` each with `route`, `status: tested|failed|skipped`, `viewportsTested[]`,
  `accessibilityTree: obtained|not-obtained`, `checks[]` (`ruleId`, `outcome:
  passed|failed|inconclusive`, `viewport`, `evidence`, `details`), and `screenshots[]` (`path`,
  `sha256`, `viewport`).
  `revision.paths` is required, so the identity says what it covers; `ui.evidencePaths` was added to
  the policy schema so a project can bind a producer to its own subject.
  No generic `dirty` field: freshness is path-scoped, and identity resolves from the committed tree
  at `revision.gitSha`
  ([ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)).
- **Acceptance Criteria:**
  - Every keyword used is in the vendored evaluator's supported set.
  - The document records the default path `artifacts/uiux-evidence/browser-evidence.json`, and
    `--evidence=` overrides it.
  - The schema is versioned, because external producers encode it and it moves under semver.
- **Verification:**
  ```bash
  node -e "import('./scripts/jsonschema.mjs').then(m=>{m.assertSchemaSupported(require('./schemas/browser-evidence.schema.json'));console.log('supported')})"   # → supported
  ```
- **Dependencies:** `01-repo-skeleton-and-vendored-core.md`, `03-rule-catalog.md`.

### Implement ingestion and freshness verification

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Accept evidence only where it is well-formed, bound to real rules, and demonstrably
  about the current committed subject.
- **Deliverables:** `scripts/evidence.mjs`:
  - Unreadable or schema-invalid evidence → **exit 2**. A malformed input is a configuration
    problem, never a statement about the project.
  - A `checks[].ruleId` the catalog does not define → **exit 2**, naming the id. An evidence
    producer must not be able to invent rule identities.
  - Freshness through `scripts/content-identity.mjs` — the same primitive attestations use, never a
    second implementation: historical identity at `revision.gitSha` versus current committed
    identity at HEAD, plus `workingSubjectClean` over the policy-declared UI paths.
    `FRESH` → results usable. `STALE` → every browser-established result degrades to
    `stale-evidence`. `EVIDENCE_UNAVAILABLE` → `evidence-unavailable`.
  - `run.status: "failed"` → `evidence-unavailable` for every browser-analysis rule.
  - Per-route `failed` establishes nothing and is recorded in `evidenceSurface.routesFailed`.
  - `inconclusive` establishes nothing.
  - A `failed` check is an ordinary finding and contradicts any attestation on the same rule —
    evidence outranks assertion.
  - A `checks[].ruleId` whose `validationType` is not `browser-analysis` or `visual-analysis` →
    **exit 2**. The id existing is not authority to speak for it.
  - A record that contradicts itself — a check on a viewport it never declares — → **exit 2**.
  - An identity over paths other than a declared `ui.evidencePaths` → **exit 2**.
  - Coverage assessment: every enumerated route exercised, every declared viewport class tested, and
    at least as many routes enumerated as the source scan found route modules. Incomplete coverage
    with all-passing checks is the `partial-coverage` disposition — unestablished, and it caps a
    forbidden rule's verdict.
- **Acceptance Criteria:**
  - No path allows a browser rule to pass when `run.status` is `failed`, whatever the individual
    check outcomes say.
  - `STALE` and `EVIDENCE_UNAVAILABLE` produce distinct dispositions and distinct output.
  - Both unestablish; neither is a failure and neither is a pass.
  - One conclusive failure outranks any number of passes, and coverage never softens it.
  - Omitting `--evidence` yields `not-evaluated`, never `evidence-unavailable`.
- **Verification:**
  ```bash
  node --test test/evidence.test.mjs    # → 25 pass
  ```
- **Dependencies:** the evidence contract; `content-identity.mjs`.

### Report the evidence surface on every run

- **Status:** `COMPLETE` — 2026-08-10, built early in section 06, which needed the block before any
  browser evidence existed to put in it. The `browserRun` sub-block is `not-attempted` on every run
  until ingestion lands here.
- **Purpose:** State what was actually evaluated, so a clean result can never be read as "the tool
  noticed nothing."
- **Deliverables:** the `evidenceSurface` envelope block, present on every validate run with
  `not-attempted` defaults when no evidence is supplied — empty is not the same as absent:
  `sourceRead: { files, capHit }`, `routesDiscovered[]`, `storybook:
  available|unavailable|not-detected`, `browserRun: { status: completed|failed|not-attempted,
  runAt, viewportsTested[], routesTested[], routesFailed[], screenshotsCaptured, evidenceFreshness:
  fresh|stale|unavailable|n/a }`, `designArtifactsFound[]`.
- **Acceptance Criteria:**
  - The block is present when `--evidence` is not passed, with `status: "not-attempted"`.
  - A failed run is distinguishable from an unattempted one in the output.
  - Viewports and routes actually exercised are named, not counted.
- **Verification:**
  ```bash
  node scripts/uiux.mjs validate . --json | grep -o '"status":"not-attempted"'    # → "status":"not-attempted"
  ```
- **Dependencies:** the evaluator from `06-evaluator-and-detectors.md`. Ingestion fills the block in;
  it is not needed to declare it, and waiting for it would have meant shipping runs that said nothing
  about their own surface.

---

## Gotchas this section discovered

**A producer that runs against uncommitted work cannot mint a `FRESH` identity, and that is correct
rather than a bug to work around** (known in advance, and confirmed). Identity resolves from the
committed tree, and `workingSubjectClean` fails on a modified reviewed path, so evidence gathered
from a dirty working copy of the UI reports `STALE`. Uncommitted UI is unverifiable UI. The producer
documentation must say so, or the first adopter will read it as a tooling defect.

**Freshness turned out to be the easy half.** The plan treated ingestion as a freshness problem, and
freshness is necessary without being remotely sufficient: a completed run over fresh source that
exercised one viewport class of two, or reached no conclusion about a rule, or recorded a pass on a
route it never finished, establishes nothing — and the first draft would have passed all three. The
fix was to name four axes (run completion, freshness, coverage, check outcome) and refuse to let any
one of them stand in for another.

**Coverage cannot be self-certified, so it is assessed only against things the producer does not
control.** A producer that enumerates one route and tests it would otherwise report complete
coverage of a one-route interface. The three inputs are the policy's declared `ui.viewportClasses`,
the routes the record itself enumerates (a route it lists and did not reach is a hole it admitted),
and the count of route modules the source scan found. The last is a lower bound rather than a
mapping — route modules and URL routes do not correspond one to one — so it is labelled INFERRED,
reported with both numbers, and can only ever make coverage incomplete.

**A pass and a failure need different amounts of surface, and the precedence has to say so.** One
conclusive failure establishes the failure whatever coverage says: the interface did that, and
unexercised surface elsewhere does not undo it. A pass is the claim that a defect is ABSENT, so it
needs the surface covered. This is the same asymmetry Gate 1 runs on, arriving independently at the
evidence layer.

**`revision.paths` had to become required, and the policy had to gain `ui.evidencePaths`.** An
identity is only as strong as the subject it covers, and a producer free to choose that subject can
widen its claim by narrowing what it measures. The record now says what it covered, and a project
that declares `ui.evidencePaths` binds the producer to its own answer — a mismatch is exit 2 rather
than a quietly narrower verdict.

**The exit-2 list grew by three.** The plan named unknown rule ids. Implementation added: a rule
whose `validationType` names a different evidence surface (a browser must not establish a
code-analysis rule merely because the id exists), a record that references a viewport it never
declared (a document that disagrees with itself anchors nothing), and an identity over undeclared
paths. All three are defects in a producer, and none may become a finding about a project.

**The fixtures had to be templates.** A committed evidence file cannot carry a real content identity
— the identity is a fact about a specific commit in a specific repository — so the ten fixtures carry
placeholder zeroes and the suite rewrites them against a throwaway repository it creates and commits.
A baked-in identity would have been a number that looks like evidence and proves nothing, and the
freshness path would have been tested against string equality rather than against git.
