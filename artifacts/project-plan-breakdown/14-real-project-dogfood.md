# 14 — Dogfood against a real UI project

**Deferred beyond v1.0.0. Blocked on an owner decision: which project.**

This repository has no user interface, so its self-validation exercises the process rules and proves
scope honesty — it establishes nothing about whether the UI detectors are any good. That question
can only be answered against a real interface built by someone who was not thinking about these
detectors while building it.

This matters more here than in any sibling pack. EngineeringStandards' two shipped bugs were both
false positives, and both surfaced from outside the repository — a detector firing on a project that
*named* a technology rather than using it. UI detectors read CSS, HTML, and JSX, where the vocabulary
of the thing and the thing itself are even harder to tell apart. A framework validated only against
its own fixtures has been validated against fixtures written by the person who wrote the detectors.

The failure mode to avoid is also known, and stated in the source enforcement architecture:

```text
installed standards yesterday
→ 87 failures
→ everybody disables the gate
```

So the first adoption is a measurement exercise, not a compliance exercise. Findings get
classified; they do not get fixed by this section.

---

### Nominate the target project

- **Status:** `NOT_STARTED` — blocked
- **Purpose:** Choose a real UI repository whose findings will calibrate detector thresholds before
  anyone else adopts.
- **Deliverables:** the owner names a repository. Selection criteria worth applying: a real UI with
  real users rather than a scaffold; a stack the classifier's signal families cover, or one that
  deliberately tests an uncovered stack; and a size where every finding can actually be reviewed by
  hand.
- **Acceptance Criteria:**
  - The target is recorded here with the date and the reason it was chosen.
  - The framework is frozen at its released version for the duration, so the run measures the
    release rather than a moving target.
- **Verification:**
  ```bash
  grep -n "Target project:" artifacts/project-plan-breakdown/14-real-project-dogfood.md   # → a named repository
  ```
- **Dependencies:** `12-release-readiness-and-v1.md`.

### Run the adoption protocol and classify every finding

- **Status:** `NOT_STARTED`
- **Purpose:** Establish external validity — measure whether the detectors are right, rather than
  whether the target project is compliant.
- **Deliverables:** an adoption record under `artifacts/adoption/`, following the protocol in
  `F:\Repos\FinancialStandards\artifacts\adoption\`: the framework frozen at its released version;
  a naive day-one policy rather than a tuned one; every finding classified, not fixed. The
  classification vocabulary:
  `TRUE_POSITIVE`, `FALSE_POSITIVE`, `FALSE_NEGATIVE`, `ASSURANCE_OVERCLAIM`, `APPLICABILITY_ERROR`.
- **Acceptance Criteria:**
  - Every finding carries exactly one classification with the reasoning recorded.
  - Findings are not fixed in the target project as part of this exercise — fixing them would
    destroy the measurement.
  - `FALSE_NEGATIVE` entries are sought deliberately by inspecting the interface for defects the
    framework should have caught and did not. A false-negative count of zero that nobody looked for
    is not evidence.
  - The classifier's result for the target is recorded, including whether its declared applicability
    matched the observed signals.
- **Verification:**
  ```bash
  ls artifacts/adoption/*.md    # → a dated adoption record
  ```
- **Dependencies:** the nominated target.

### Feed the results back as calibration

- **Status:** `NOT_STARTED`
- **Purpose:** Turn measured defects into mechanical tests, so a known failure class cannot recur
  unnoticed.
- **Deliverables:** for each `FALSE_POSITIVE`, a new known-negative fixture reproducing it and a
  detector narrowing. For each `FALSE_NEGATIVE`, either a detector extension or an honest
  re-typing of the rule to the evidence surface that can actually establish it. For each
  `ASSURANCE_OVERCLAIM`, an assurance downgrade with a `$assuranceNote`. For each
  `APPLICABILITY_ERROR`, a new or corrected signal family.
- **Acceptance Criteria:**
  - Every classified defect becomes a test or an explicitly recorded unresolved gap. None is fixed
    silently.
  - Rule identity does not change as a side effect of detector calibration — a re-typing is a
    catalog change with lifecycle metadata, not an edit to the frozen design artifact.
  - The resulting release increments correctly under the semver law.
- **Verification:**
  ```bash
  npm test    # → all pass, including the new fixtures
  ```
- **Dependencies:** the adoption record.

---

## Gotchas this section discovered

*Deferred; not started.*
