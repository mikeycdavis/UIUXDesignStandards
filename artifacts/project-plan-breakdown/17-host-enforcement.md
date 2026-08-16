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

- **Status:** `NOT_STARTED` (D1-B)
- **Purpose:** Turn GitHub's branch-protection, ruleset, and required-check state into control
  observations the state machine can decide over.
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

- **Status:** `NOT_STARTED` (D1-C)
- **Purpose:** Prove the mechanism reports the truth about a repository that is *not* governed, before
  any setting exists that would make the happy path available.
- **Deliverables:** a recorded run against this repository as it stands, with the missing controls
  enumerated individually.
- **Acceptance Criteria:**
  - The expected result is `UNGOVERNED`, and that is a **success of the collector**, not a failure of
    it. A run that reported `INDETERMINATE` here would mean the collector could not read a host it has
    every permission to read.
  - Each absent control is named. A count is not an enumeration.
- **Dependencies:** the collector.

### Change the host settings, with explicit authorization

- **Status:** `NOT_STARTED` (D1-D)
- **Purpose:** Make the controls real.
- **Gated on, and this is a dependency rather than a `BLOCKED` status:** an owner decision on
  `main.review_required`, and explicit owner authorization to change repository settings. `BLOCKED`
  in this plan's vocabulary means a carried obligation of the release being cut, and is excused only
  by naming a strictly later version — see the obligations criterion in
  [scripts/release-readiness.mjs](../../scripts/release-readiness.mjs). This item is neither: it is
  ordinary not-yet-started work whose start condition is a human decision. Recording it as `BLOCKED`
  would have failed the release gate honestly, and writing "blocked on `v2.0.0`" to clear that would
  have been a false statement made to turn a check green.
- **Deliverables:** branch protection or rulesets on `main`, a tag ruleset for `v*`, the `standards`
  check required against the merge head, and an explicit bypass configuration.
- **Acceptance Criteria:**
  - Performed only on explicit owner authorization, and never as a side effect of any other task.
  - The `review_required` question is settled first — see `docs/host-enforcement.md` §5, where option
    C is recorded as not recommended because it makes admin bypass the routine merge path.
- **Dependencies:** the dogfood run.

### Re-read the host, and prove the same code says GOVERNED

- **Status:** `NOT_STARTED` (D1-E)
- **Purpose:** Both sides of the mechanism, from one implementation.
- **Acceptance Criteria:**
  - The same collector, unmodified between the two runs, reports `UNGOVERNED` before and `GOVERNED`
    after. If it required a change to report the second, the second result is not evidence.
- **Dependencies:** the settings change.

### Negative controls proving the settings cannot silently drift

- **Status:** `NOT_STARTED` (D1-F)
- **Purpose:** A control that was true once is not a control that is true now. Host state changes
  without any repository changing, which is the property that makes it unlike everything else this
  framework verifies.
- **Deliverables:** governance observations carrying the time they were read, and a check that fails
  when a required control has silently reverted.
- **Acceptance Criteria:**
  - Removing any single required control from the host flips the aggregate away from `GOVERNED`.
  - A stale reading is distinguishable from a fresh one, since host facts expire in a way file facts
    do not.
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
