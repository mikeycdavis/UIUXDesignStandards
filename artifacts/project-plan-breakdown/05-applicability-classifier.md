# 05 — UI applicability classifier (Gate 1)

The classifier answers the question that must be settled before any UI rule runs: does this
repository have a user interface this framework governs?

It ships in v1.0.0 rather than a later minor release, because `NOT_APPLICABLE` is itself an evidence
claim and the first immutable contract must establish who is subject to enforcement
([ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md), owner
decision 1).

The epistemic contract is deliberately stricter than the detection sophistication. The classifier
does not need to be a product taxonomy engine; it needs to be honest about the limits of what it
looked for. `NOT_APPLICABLE` — the state that exempts the entire UI rule surface — is the hardest
outcome to obtain in the whole framework.

The precedence is written down rather than left to branch order, because branch order is not a
contract:

```text
0. the classifier cannot execute        → no classification, exit 2
1. declared no-ui, and UI evidence      → INDETERMINATE, agreement conflict
2. any positive UI signal               → APPLICABLE
3. no signal, declared no-ui, complete  → NOT_APPLICABLE, agreement match
4. no signal, declared no-ui, partial   → INDETERMINATE, agreement indeterminate
5. no signal, a UI class declared       → INDETERMINATE, agreement indeterminate
6. no signal, nothing declared          → INDETERMINATE, agreement undeclared
```

---

### Implement the signal families

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Detect the presence of a user interface from explicit, reviewable repository
  evidence, with each detection carrying the paths that establish it.
- **Deliverables:** `scripts/applicability.mjs`, signal detection only. Ten families: frontend
  framework dependencies; route and page conventions; HTML documents; component files; mobile
  projects; desktop shells; Storybook; style systems; browser test configuration; browser build
  targets. Each reports `{ id, detected, label, evidence[], implies[] }`, where `implies` is the set
  of UI classes the signal *proves* — frequently empty, and empty is the honest answer.
  `scripts/uiux.mjs` arrives here too, as the CLI dispatcher: it routes `applicability`, and exits 2
  with a message naming the implementing section for `audit`, `validate`, and `init`.
- **Acceptance Criteria:**
  - Every signal carries at least one evidence path when it fires.
  - No signal is negatively weighted. Absence of a signal is absence of evidence, never evidence of
    absence.
  - Heuristic signals are never labeled `OBSERVED`.
  - Every family appears in the envelope whether or not it fired — empty is not absent.
- **Verification:**
  ```bash
  node scripts/uiux.mjs applicability test/fixtures/web-ui-signals    # → APPLICABLE, 7 signals, each with evidence
  node --test test/applicability.test.mjs                             # → 23 pass
  ```
- **Dependencies:** `01-repo-skeleton-and-vendored-core.md`.

### Implement the classification law

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Convert signals and the policy declaration into one of three classifications, without
  ever letting a failure to establish become an exemption.
- **Deliverables:** `decide()` — a pure function of `{ signals, scan, declaredPolicy }`, exported so
  the precedence table can be tested branch by branch rather than inferred from end-to-end runs.
  Plus `agreement` as an independent axis (`match`, `conflict`, `undeclared`, `indeterminate`), and
  `classResolution` (`resolved`, `unresolved`, `not-established`) so that "a UI exists" and "the
  platform is known" stay separable.
- **Acceptance Criteria:**
  - Zero signals with no policy declaration yields `INDETERMINATE` with `agreement: undeclared` —
    never `NOT_APPLICABLE`. A complete scan proves only that no supported signal was present.
  - A `no-ui` declaration over a repository with UI signals yields `INDETERMINATE` with
    `agreement: conflict`.
  - `scan.complete` is false whenever the file cap was hit, any path was unreadable, or the manifest
    failed to parse — and each of those blocks `NOT_APPLICABLE` on its own.
  - An incomplete scan does **not** demote `APPLICABLE`.
  - `applicabilityClasses` contains only classes a signal proves.
- **Verification:**
  ```bash
  node scripts/uiux.mjs applicability test/fixtures/no-ui           # → NOT_APPLICABLE, agreement match
  node scripts/uiux.mjs applicability test/fixtures/policies        # → INDETERMINATE, agreement undeclared
  ```
- **Dependencies:** the signal families; the policy loader from `04-policy-schema-and-templates.md`.

### Separate classifier uncertainty from classifier failure

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make "I measured and could not establish it" mechanically distinct from "I could not
  measure", so a consumer never has to infer which happened.
- **Deliverables:** the exit contract and the `--self` flag. `INDETERMINATE` exits 0 with the full
  envelope — classification, scan evidence, signals, reasons. Non-execution exits 2 with an envelope
  that has no `classification`, no `scan`, and no `signals` at all. `--self` asserts
  `classification === "NOT_APPLICABLE" && agreement === "match" && scan.complete === true`, exiting
  1 on any deviation, with a message saying the policy is what has to change.
- **Acceptance Criteria:**
  - `INDETERMINATE` never exits 2.
  - A missing target path exits 2 and emits no classification field.
  - `--self` on this repository exits 0; adding a UI makes it exit 1, not 2 — the tool worked.
- **Verification:**
  ```bash
  node scripts/uiux.mjs applicability ./definitely-not-a-path >/dev/null 2>&1; echo $?   # → 2
  npm run applicability:self                                                             # → exit 0
  ```
- **Dependencies:** the classification law.

### Publish the integration contract

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Let a downstream adapter be authored from a specification instead of by
  reverse-engineering command output.
- **Deliverables:** `docs/integration-contract.md` — the exit-code contract, the Gate 1 envelope,
  the non-execution envelope, the precedence table, the classification/agreement matrix, the
  class-resolution rule, and the suggested map (`APPLICABLE → IN_SCOPE`, `NOT_APPLICABLE →
  OUT_OF_SCOPE_EVIDENCED`, `INDETERMINATE → SCOPE_REVIEW_REQUIRED`). The `validate` sections are
  marked *specified, not implemented*, so nothing in the document claims more than exists.
- **Acceptance Criteria:**
  - Every implemented section describes output a command actually emits today.
  - Every unimplemented section says so in the section itself, not only in a preamble.
- **Verification:**
  ```bash
  node scripts/uiux.mjs applicability . --json    # → the §2.1 envelope, key for key
  ```
- **Dependencies:** the classifier.

### Wire Gate 1 into validate

- **Status:** `COMPLETE` — 2026-08-10, once `06-evaluator-and-detectors.md` supplied the evaluator
- **Purpose:** Make applicability gate compliance, in the envelope shape downstream governance tools
  can consume without knowing anything about UI.
- **Deliverables:** Gate ordering in `validate` (Gate 0 policy validity → Gate 1 classifier →
  Gate 2 rules); the three-block envelope — `applicability`; `uiCompliance`, null unless the
  classification is `APPLICABLE`; `frameworkCompliance`, always present, covering
  `appliesTo: ["process"]` rules; and the exit behavior in
  [the integration contract](../../docs/integration-contract.md) §3.3.
- **Acceptance Criteria:**
  - `INDETERMINATE` never produces a compliant UI verdict and never exits 0, and a passing
    `frameworkCompliance` does not rescue it.
  - `uiCompliance` is null in exactly the non-`APPLICABLE` cases.
  - No UI rule acquires a result at all when Gate 1 did not admit the UI surface — the detectors do
    not run, rather than running and having their findings discarded.
- **Verification:**
  ```bash
  node scripts/uiux.mjs validate . --json    # → applicability NOT_APPLICABLE, uiCompliance null, frameworkCompliance COMPLIANT
  ```
- **Dependencies:** the classifier; the evaluator from `06-evaluator-and-detectors.md`.

---

## Gotchas this section discovered

**The `no-ui` fixture needs a policy file** (known in advance, and confirmed). Because
`NOT_APPLICABLE` requires a declaration, a fixture directory with no `project-policy.yml` classifies
as `INDETERMINATE`. The undeclared variant is derived in a temporary directory by removing the
policy — it cannot be a second committed fixture, because the two would differ only by an absence.

**Scan incompleteness had to be given an explicit place in the precedence, not an accidental one.**
Written naively, the classifier checks `scan.complete` early and returns `INDETERMINATE` — which
would mean that an unreadable subtree anywhere in a repository un-witnesses a UI that was already
found, and that a project could shed its UI obligations by containing something the scanner cannot
read. The correct asymmetry is that incompleteness threatens claims of *absence* only: it blocks
`NOT_APPLICABLE` and leaves `APPLICABLE` alone. That ordering is now stated in the module header, in
[Standard 34](../../standards/34-project-policy-applicability-and-exceptions.md) R3, in the
integration contract, and tested through `decide()` directly — an end-to-end test can show that an
outcome happened, but only a pure call can show which rule produced it.

**"The declaration is not corroborated" is not the same finding as "the declaration is
contradicted."** A policy declaring `web-ui` over a repository where no signal fired is rule 5, and
it reports `agreement: indeterminate`, not `conflict`. Calling it a conflict would claim the search
had proved the interface absent, which it cannot do — the classifier only ever establishes that the
signals it supports were not present. The reverse direction (`no-ui` declared, signals found) *is* a
conflict, because there the evidence is positive and the declaration denies it. The asymmetry in the
evidence produces an asymmetry in the vocabulary.

**A resolved class is rarer than it looks, and guessing one would have been easy.** A `.tsx` file
containing markup proves a component tree exists and proves nothing about the platform — React
Native components look the same. `react` in a manifest is likewise ambiguous until you know whether
`react-native` sits beside it. Rather than defaulting to `web-ui` (which would have been right most
of the time, and silently wrong for every mobile project), `implies` is empty for those signals and
the envelope reports `classResolution: unresolved`. `APPLICABLE` with no proven class is a real
state, and the framework says so.

**Excluding test fixtures from the search surface is a real epistemic cost, so it is recorded rather
than assumed.** This repository's own fixtures contain deliberate UI markup; scanning them would
make `--self` fail on evidence that describes nothing about this repository. The exclusion is
anchored to a test directory (`test/fixtures`, never any directory named `fixtures`, so a project's
`src/fixtures` is still searched), every exclusion actually encountered is listed in
`scan.excluded`, and a `NOT_APPLICABLE` result names them in its reasons. An exemption does not get
to be silent about what it did not look at.

**A malformed policy is not a classifier failure.** The classifier reads `ui.applicability` and
nothing else; it does not validate the policy, because exiting 2 on a bad policy would collapse a
configuration error into a measurement failure. An unreadable or unrecognized declaration yields
`present: false` with a reason, which routes to `agreement: undeclared` — and `undeclared` can never
reach `NOT_APPLICABLE`. Unreadable never becomes exempt.

**The markup heuristic reads raw file text, because `splitSource` does not exist yet.** Markup named
inside a string or a comment counts as a component signal until the use/mention split arrives with
the detectors in section 06. The family is labeled `INFERRED` partly for that reason, and the
direction of the error is deliberate: over-detection produces `APPLICABLE`, which costs an
evaluation that reports most rules not-evaluated. Under-detection would produce an exemption.
