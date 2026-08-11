# Standard 40 — Detector and Testing Integrity

A check that cannot fail against the defect it claims to detect proves nothing. This standard governs
how this framework's own detectors are built, tested, and scoped — and how they avoid reporting
discussions of a defect as instances of it.

Source: §57 and §58 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to this repository's detectors and test suite. Adopting projects inherit R1 and R2 as
guidance for their own UI tests.

## Requirements

### R1 — Every detector MUST have a known-positive and a known-negative fixture

A known-positive fixture contains the defect and the detector MUST fire. A known-negative fixture
mentions the defect — in comments, documentation, and test material — without containing one, and the
detector MUST stay silent.

**The known-negative side is the one that matters.** Visual and design tooling has a high false-green
risk, and a false positive that fires on documentation is how a framework gets switched off.

### R2 — Detectors MUST be mutation-tested

Each detector MUST be proved to fail against the defect it claims to detect: remove a label, remove a
text alternative, remove a focus outline, replace a token with a literal, strip a reduced-motion
query, report success after a failed operation. The mutation is applied, the failure observed, the
mutation reverted, and the clean state re-asserted.

A detector that has never been observed failing is an assumption.

### R3 — Use and mention MUST be distinguished

A detector reports an **instance** of its subject, never a **discussion** of it. Source is split into
three views and each detector declares which it reads:

```text
source view      comments removed, strings intact    — import and dependency matching
structure view   comments removed, strings blanked   — structural signals
comment view     comment text only                   — annotation markers
```

Documentation saying "do not remove focus indicators" MUST NOT trigger the focus-removal detector.
Test material containing intentionally invalid markup MUST NOT become a production finding.

### R4 — Each detector MUST declare the surface it evaluates and why

Every detector carries a declaration of which view it reads and the reason. A meta-test reads the
detector source and fails when the declaration is absent, so the discipline cannot decay silently.

### R5 — Detector limits MUST be documented where a pass means less than it appears

Where a detector establishes something narrower than the requirement it binds to, that gap MUST be
stated in the standard's prose. A reader MUST NOT have to infer a detector's scope from its silence.

### R6 — A detector MUST NOT influence rule identity

Rule identity is frozen before detectors are implemented. Where two rules could own a defect,
ownership is decided in the catalog; a detector MUST NOT acquire a second rule identity because it
happened to find something adjacent. See
[Standard 33](33-rule-catalog-and-rule-identity.md) R2 and R8.

### R7 — Heuristic findings MUST NOT be labeled as observations

A finding derived from a similarity signal, a threshold, or a structural guess is `INFERRED`. Only a
direct observation is `OBSERVED`. Mislabeling a heuristic as an observation is a false evidence
claim.

### R8 — Assertions MUST NOT be vacuous

A test asserting a property over a set MUST first assert the set is non-empty. A suite that passes
because it examined nothing is the same defect as a verdict that passes because nothing ran.

### R9 — A skipped or excluded surface MUST be reported

Where a detector skips a directory, hits a file cap, or cannot read a path, that MUST appear in the
evidence surface. Silent truncation reads as complete coverage. See
[Standard 35](35-evidence-assurance-and-compliance-output.md) R8.

### R10 — Tests MUST NOT be weakened to hide a regression

Deleting, skipping, or loosening a test because it caught something is prohibited; see
[Standard 29](29-design-integrity-prohibitions.md) R8.

### R11 — A release-critical invariant MUST be registered, defended, and falsified

R1 and R2 require a detector to have fixtures and a mutation. This requirement says the same thing
about the framework's ARCHITECTURAL promises, which have no fixtures and no detector:

```text
the invariant is on record       a normative or plan document states it
a named test defends it          and that test exists in the suite
a named falsifier breaks it      and the suite fails when it is applied
```

The registry is mechanically checked in both directions: an invariant claiming a falsifier that does
not run fails, and a falsifier breaking something no invariant registered fails. A test that passes
against both the correct implementation and the broken one is not evidence of anything, and a suite
made of those is a green build with nothing behind it — R8's concern, applied to the architecture
rather than to a set.

Falsification is REQUIRED, not advisory, for the invariants that convert an inability into a pass if
they fail: applicability, freshness, coverage, review scope, and the verdict cap. The others may be
defended by tests alone, and the registry records which are which rather than implying all are equal.

### R12 — A deferred check MUST NOT become a satisfied one by inaction

Where a verification cannot yet run — because the material it inspects does not exist — the deferral
is recorded, and a test asserts the deferral is still recorded. The moment the material appears, that
test MUST perform the real check instead of continuing to accept the deferral. A deferral nobody
re-examines is indistinguishable from a check nobody wrote.

## Additions this standard makes beyond the source

- R4's meta-test enforcement is this framework's mechanism for the source's "each detector should
  declare the source surface it evaluates".
- R5 is this framework's, and it is the requirement that keeps a partial detector from reading as a
  complete one.
- R7 and R8 are this framework's. R8 in particular generalizes the source's false-green concern from
  detectors to the test suite that defends them.
- R9 is this framework's, drawn from the same principle as
  [Standard 35](35-evidence-assurance-and-compliance-output.md) R8.
- R11 and R12 are this framework's. The source asks that detectors be falsifiable; it does not ask the
  same of the architecture the detectors sit inside, and that is where the more expensive failures
  are. A regressed alt-text regex costs a finding; an applicability gate that quietly starts exempting
  projects costs the framework its meaning.

## Relationship to other standards

[Standard 35](35-evidence-assurance-and-compliance-output.md) owns what a detector's output licenses.
[Standard 33](33-rule-catalog-and-rule-identity.md) owns the identity discipline R6 protects.
[Standard 29](29-design-integrity-prohibitions.md) owns R10's prohibition.
[Standard 36](36-browser-and-visual-evidence.md) owns the evidence surfaces R9 reports on.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R8 | — | No rule. Enforced by the test suite and by the release-readiness fixture-pair check. |
| R11, R12 | — | No rule. The invariant registry in `test/invariants.test.mjs`, cross-checked against the falsifier table in `test/falsifiers.mjs` and executed by `test/falsifiers.test.mjs`. |
| R3, R4 | — | No rule. Enforced by a source-scanning meta-test over the detector implementations. |
| R5 | — | No rule. Enforced by review; each affected standard states its detector's limits. |
| R6 | — | No rule. Enforced by the frozen catalog design artifact preceding detector work. |
| R7 | — | No rule. Enforced by finding-label assertions in detector tests. |
| R9 | `evidence.surfaces-declared` | `structural`, full. Applies to process. |
| R10 | `design-integrity.no-weakened-visual-evidence` | See [Standard 29](29-design-integrity-prohibitions.md). |
