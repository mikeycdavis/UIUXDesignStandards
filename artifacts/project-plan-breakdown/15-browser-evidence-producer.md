# 15 — Browser-evidence producer

**Deferred beyond v1.0.0. Blocked on an owner decision: where the producer lives.**

`07-browser-evidence-interface.md` ships the ingestion half of
[ADR 0002](../adr/0002-browser-evidence-arrives-by-ingestion-contract.md) — the schema, the loader,
the freshness verification, and the fixtures. This section is the other half: something that drives
a real browser and emits a conforming document.

Until it exists, every `browser-analysis` and `visual-analysis` rule reports `notEvaluated`. That is
the framework working as designed rather than a defect, and the release-readiness report states it
as a known gap. But it is the largest single gap in v1.0.0's coverage, and closing it converts a
substantial share of the catalog from unestablished to establishable.

The open question is structural, not technical. A consumer-side recipe keeps this repository free of
browser dependencies forever but leaves every adopter to implement the same thing. A companion
repository centralizes the work but needs its own dependency policy, because it will depend on
Playwright and cannot pretend otherwise.

---

### Decide where the producer lives

- **Status:** `NOT_STARTED` — blocked
- **Purpose:** Choose between a documented recipe and a companion repository, since the choice
  determines everything below.
- **Deliverables:** an owner decision recorded in `artifacts/prompts/owner-decisions.md` and an ADR
  in whichever repository ends up owning the producer. The two options:
  - **Consumer-side recipe** — documentation plus a reference Playwright spec an adopter copies into
    their own suite. No new repository, no new dependency anywhere in this family. Every adopter
    maintains their own copy, and they will drift.
  - **Companion repository** (`UIUXBrowserRunner`) — a real tool with a real Playwright dependency
    and its own release cycle. One implementation to maintain and improve; a new repository, and a
    new place for version identity to matter.
- **Acceptance Criteria:**
  - The decision records what happens to the zero-dependency rule under each option. It stays intact
    for this repository either way; a companion repository is explicitly outside it.
  - The decision names who maintains the producer.
- **Verification:**
  ```bash
  grep -n "producer" artifacts/prompts/owner-decisions.md    # → the recorded decision
  ```
- **Dependencies:** `12-release-readiness-and-v1.md`.

### Implement the producer against the frozen contract

- **Status:** `NOT_STARTED`
- **Purpose:** Emit conforming evidence for the checks a browser can genuinely establish.
- **Deliverables:** a runner that navigates the project's declared routes at its declared viewports
  and emits a document conforming to `schemas/browser-evidence.schema.json`. First checks, chosen
  because each has an unambiguous browser-observable answer: keyboard operability of interactive
  controls; focus visibility; focus order; modal focus trapping; computed contrast; responsive
  overflow at each declared viewport; rendered accessible names; touch-target size; reduced-motion
  behavior.
- **Acceptance Criteria:**
  - The producer records `run.status: "failed"` and stops rather than emitting partial results as
    if complete.
  - A route it could not reach is `status: "failed"`, never omitted — an omitted route is
    indistinguishable from a route that was never in scope.
  - A check it cannot decide is `inconclusive`, never `passed`.
  - `revision.sourceIdentity` is computed with the same algorithm this repository uses, from
    committed content, so a run against a dirty working copy cannot report `FRESH`.
  - It emits no `ruleId` that is not in the catalog it was run against.
- **Verification:**
  ```bash
  node scripts/uiux.mjs validate <target> --evidence=<produced.json>    # → browser rules report evidenced, not not-evaluated
  ```
- **Dependencies:** the location decision; the frozen evidence schema.

### Wire the producer into the reusable workflow

- **Status:** `NOT_STARTED`
- **Purpose:** Make browser evidence part of the gate for projects that opt into it, produced in the
  same job that validates so freshness holds.
- **Deliverables:** an optional producer step in `.github/workflows/validate.yml`, gated on the
  `evidence-path` input, running before `validate` and in the same checkout.
- **Acceptance Criteria:**
  - Evidence is produced from the same commit that is validated; a separate job would risk a
    different checkout and a stale identity.
  - A producer failure yields `run.status: "failed"` and therefore `evidence-unavailable`, never a
    skipped step that leaves the previous run's evidence in place.
  - Projects that do not opt in are unaffected.
- **Verification:**
  ```bash
  # In a consuming repository with the producer enabled:
  # the uploaded envelope shows browserRun.status: "completed" and a non-empty routesTested
  ```
- **Dependencies:** the producer; `13-version-identity-and-reusable-workflow.md`.

---

## Gotchas this section discovered

*Deferred; not started.*
