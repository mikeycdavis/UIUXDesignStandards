# 17 — Host enforcement of the default branch and published tags

**Started 2026-08-16, after the local-CI and verified-submission work merged (`main` at `536438b`).**

`16-portfolio-integration.md` owns the portfolio-wide question: which repositories are governed. This
section owns the concrete instance that must exist before that question can be answered honestly about
anything — *this* repository, whose tooling now demonstrably refuses to publish an unverified commit,
and whose host currently prevents nobody else from doing so.

The boundary this section exists to close:

```text
Tooling discipline                    Host enforcement
  submit-pr refuses direct              main protection:         absent
  publication to main                   v* protection:           absent
  verified-SHA invariant established    required standards check: absent
                                        bypass policy:            absent
```

The governing constraint, unchanged from `13-version-identity-and-reusable-workflow.md`:

> A committed workflow file is **not** proof that enforcement exists.

The sequencing constraint, which is the point of the whole section: **the collector is dogfooded
against the unprotected repository before any setting changes.** Testing only the happy state would
leave the mechanism half-proven, and the more valuable half is the one that reports the truth about a
repository that is not yet governed.

---

### Define the governance contract and its state machine

- **Status:** `COMPLETE` — 2026-08-16 (D1-A)
- **Purpose:** Establish what "host-enforced" is allowed to mean, and what must be reported when the
  host cannot be read, before asking GitHub to enforce anything.
- **Deliverables:** [docs/host-enforcement.md](../../docs/host-enforcement.md) — the seven controls
  with their evidence sources, the three-state machine, the four refusals, and the one open owner
  decision. [scripts/governance.mjs](../../scripts/governance.mjs) — the contract as data plus
  `deriveGovernance()`, pure and offline: it reads nothing and calls no API, so the decision procedure
  is testable inside the CI container, which has neither a network nor a token.
  [test/governance.test.mjs](../../test/governance.test.mjs) — every refusal plus the positive control.
- **Acceptance Criteria:**
  - The aggregate state is derived from control-level results; a caller cannot hand in its own.
  - An unreadable required control yields `INDETERMINATE`, never `UNGOVERNED` and never `GOVERNED`,
    and unreadability outranks absence.
  - A required control that no observation mentions is unreadable, not skipped.
  - A result claiming `SATISFIED` over a source that was not read is not believed.
  - A control outside the conjunction carries a recorded reason; deferring is never silent omission.
- **Verification:**
  ```bash
  node --test test/governance.test.mjs    # → 13 pass
  ```
- **Dependencies:** none. Deliberately: the contract is written before the collector, so the collector
  is authored against a specification rather than the specification being back-filled from whatever
  the GitHub API happened to return.

### Build the read-only host evidence collector

- **Status:** `COMPLETE` — 2026-08-16 (D1-B)
- **Purpose:** Turn GitHub's branch-protection, ruleset, and required-check state into control
  observations the state machine can decide over.
- **Built as** [scripts/host-evidence.mjs](../../scripts/host-evidence.mjs), `npm run governance`,
  with [test/host-evidence.test.mjs](../../test/host-evidence.test.mjs) driving it offline through an
  injected request function. The HTTP status comes from the `status` field of GitHub's own JSON error
  body rather than from gh's stderr sentence — API data, not CLI prose, for the reason `submit-pr`
  already learned once. An undeterminable status is a failed read, never a not-found.
- **Deliverables:** a collector reading branch protection, rulesets, tag rulesets, and bypass actors,
  emitting one observation per contract control with its source and whether that source was read. It
  mutates nothing. A 404 (`Branch not protected`) is a *successful read establishing absence*; a 403,
  a network failure, or an unauthenticated call is `UNREADABLE` — the two must not be conflated, since
  one is a fact about the repository and the other is a fact about the caller.
- **Acceptance Criteria:**
  - Read-only: no endpoint that mutates state is reachable from the collector.
  - `404 Branch not protected` → `ABSENT`; permission or transport failure → `UNREADABLE`.
  - Every observation names the endpoint it came from and whether that endpoint answered.
  - The collector never computes an aggregate; it reports observations and calls `deriveGovernance()`.
- **Verification:**
  ```bash
  node --test test/governance.test.mjs    # collector cases, against recorded API fixtures
  ```
- **Dependencies:** this section's contract.

### Dogfood the collector against the unprotected repository

- **Status:** `COMPLETE` — 2026-08-16 (D1-C)
- **Purpose:** Prove the mechanism reports the truth about a repository that is *not* governed, before
  any setting exists that would make the happy path available.
- **Deliverables:** [artifacts/governance/host-evidence-2026-08-16.json](../governance/host-evidence-2026-08-16.json)
  — `UNGOVERNED`, six required controls `ABSENT`, each with `evidenceRead: true`, and nothing
  `UNREADABLE`. The deferred `main.review_required` is observed and reported alongside, with its
  reason and revisit trigger.
- **Acceptance Criteria:**
  - The expected result is `UNGOVERNED`, and that is a **success of the collector**, not a failure of
    it. A run that reported `INDETERMINATE` here would mean the collector could not read a host it has
    every permission to read.
  - Each absent control is named. A count is not an enumeration.
- **Dependencies:** the collector.

### Change the host settings, with explicit authorization

- **Status:** `COMPLETE` — 2026-08-16 (D1-D), on explicit owner authorization scoped to exactly two
  rulesets and nothing else.
- **Purpose:** Make the controls real.
- **Deliverables:** two active repository rulesets, no bypass actors on either.
  - **`main`** (id 20914072, target `branch`, `~DEFAULT_BRANCH`): `pull_request` with 0 required
    approvals — GitHub supports requiring a pull request *without* requiring approval, which is what
    makes the single-maintainer decision expressible without a routine bypass —
    `required_status_checks` naming `standards` with `strict_required_status_checks_policy: false`,
    `non_fast_forward`, and `deletion`.
  - **`released-tags`** (id 20914075, target `tag`, `refs/tags/v*`): `deletion`, `non_fast_forward`,
    and `update`. Classic branch protection cannot express this half of the contract at all, which is
    why rulesets were chosen over it.
  - Strict "branch must be up to date" was deliberately **not** enabled. It is a concurrency policy,
    not one of the six controls, and it triggers reruns caused only by an unrelated merge.
- **Acceptance Criteria:**
  - Performed only on explicit owner authorization, and never as a side effect of any other task.
  - The required check name is **read back from what GitHub recorded**, not assumed from what was
    submitted: the ruleset's stored context is `standards`, and the check run this repository actually
    produces is also named `standards`. A required check whose name resolves to nothing is a required
    check that can never block anything, and it looks identical to a working one in the UI.
  - Nothing else changed: no collaborator, Actions setting, merge method, visibility, or tag.
- **Dependencies:** the dogfood run.

### Re-read the host, and prove the same code says GOVERNED

- **Status:** `COMPLETE` — 2026-08-16 (D1-E)
- **Purpose:** Both sides of the mechanism, from one implementation.
- **Deliverables:** [before](../governance/host-evidence-2026-08-16.json) — `UNGOVERNED`, six
  `ABSENT`; [after](../governance/host-evidence-2026-08-16-after-rulesets.json) — `GOVERNED`, six
  `SATISFIED`. The collector was not modified between the two runs; only the host changed.
- **Acceptance Criteria:**
  - The same collector, unmodified between the two runs, reports `UNGOVERNED` before and `GOVERNED`
    after. If it required a change to report the second, the second result is not evidence.
- **Observed enforcement, beyond configuration:** a direct push of a throwaway commit to `main` was
  attempted and **rejected by GitHub** — `GH013`, naming both *"Changes must be made through a pull
  request"* and *"Required status check `standards` is expected"* — with `refs/heads/main` verified
  unchanged before and after (`536438b` both times). That converts `main.pr_required` and
  `main.standards_check_required` from *configuration says so* into *configuration plus observed
  refusal*, which is the same gap this milestone exists to close one layer down.

  Two probes were deliberately **not** run. A force-push or deletion probe against `main` is
  redundant — the pull-request rule already refuses every direct ref update, as the rejection above
  shows — and its failure mode is rewriting or removing the default branch. A tag-mutation probe is
  worse than redundant: with no bypass actors, a probe tag matching `v*` could not afterwards be
  deleted, so a successful test would leave permanent litter in the release namespace. `v1.0.0` was
  never a candidate probe.
- **Dependencies:** the settings change.

### Negative controls proving the settings cannot silently drift

- **Status:** `COMPLETE` — 2026-08-16 (D1-F)
- **Purpose:** A control that was true once is not a control that is true now. Host state changes
  without any repository changing, which is the property that makes it unlike everything else this
  framework verifies.
- **Deliverables:** [scripts/governance-drift.mjs](../../scripts/governance-drift.mjs),
  `npm run governance:drift` and `npm run governance:baseline`, over the semantic baseline at
  [artifacts/governance/baseline.json](../governance/baseline.json). Four outcomes: `NO_DRIFT`,
  `DRIFTED`, `INDETERMINATE`, `CONTRACT_CHANGED`. It is not a second governance evaluator — it
  consumes the same `CONTROLS` and the same collector, and pins no ruleset id, name, or JSON shape,
  because the durable claim is the control rather than the identifier GitHub assigned it.
- **Acceptance Criteria:**
  - A required control that was `SATISFIED` and is now `ABSENT` is `DRIFTED`; one that became
    `UNREADABLE` is `INDETERMINATE`, since a failed read is not evidence that anything changed.
  - A change to the required-control set is `CONTRACT_CHANGED`, never drift. The policy moved; the
    host may not have.
  - A change in the deferred review control is reported and never causes drift.
  - Recreating an equivalent ruleset under a new id or name is `NO_DRIFT`.
  - The baseline stores normalized control results, never raw API bodies, so a field GitHub adds
    later cannot manufacture drift no control experienced.
- **Verification:**
  ```bash
  node --test test/governance-drift.test.mjs    # → 13 pass
  npm run governance:drift                      # → NO_DRIFT, exit 0
  ```
- **Exit semantics, deliberately unlike the collector's:** the collector reports state and exits 0 for
  all three, because reporting is its job. This command is asked whether governance *remains*
  established, so it uses the exit triple — 0 established, 1 regressed, 2 no verdict reached. That is
  a new enforcement decision belonging to this command; it was not smuggled into the collector, and
  the command is **not** part of the container gate, which has no network by construction.
- **Dependencies:** the re-read.

---

## Gotchas this section discovered

**Requiring one review would have required a bypass.** The recommended policy — one approving review
on `main` — collides with a mechanical fact about this repository: it has a single collaborator, and
GitHub does not permit self-approval. Requiring it would make every pull request mergeable only by
admin bypass, which contradicts `bypass.policy` and turns the bypass signal into noise by firing it on
every merge. The control is modelled and collected but held outside the conjunction, with the reason
recorded in the control itself. A control that forces another control to be violated is not a
strengthening, and the collision was invisible until the collaborator list was actually read — which
is the same lesson as `docs/local-ci.md` §9, one layer up: the host is a source of facts that local
reasoning cannot supply.
