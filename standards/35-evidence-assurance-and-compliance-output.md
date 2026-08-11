# Standard 35 — Evidence, Assurance, and Compliance Output

What a result means. A clean validation result must never mean "the tool didn't notice anything" — it
must mean that for the standards and evidence surfaces this project declared and the framework could
actually evaluate, the recorded evidence supports this result, and everything not evaluated remains
visible.

Source: §40, §42, §47, and §59 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md),
the closing philosophy in §64, and the enforcement-architecture prompt at
[`artifacts/prompts/enforcement-architecture-prompt.md`](../artifacts/prompts/enforcement-architecture-prompt.md).

## Scope

Applies to this framework's output and to any consumer interpreting it.

## Requirements

### R1 — A verdict MUST NEVER be strengthened by an inability to run

This is the framework's governing law. Every mechanism below exists to implement it.

An unavailable browser, a failed route, an inaccessible component catalog, missing credentials, or an
unsupported environment becomes **evidence unavailability** — never a pass.

### R2 — Result states MUST stay distinguishable

```text
passed      failed      warning     skipped
not applicable          not evaluated
manually reviewed       excepted    evidence unavailable
```

These are carried on two axes: a status, and a **disposition** that says how the status was reached.
`not-evaluated` is a disposition, not a validation type; see
[ADR 0004](../artifacts/adr/0004-add-browser-and-visual-validation-types-and-keep-not-evaluated-a-disposition.md).

### R3 — Validation types MUST describe how evidence is obtained

```text
structural     document        configuration
code-analysis  browser-analysis visual-analysis  manual-review
```

Each maps to an evidence surface: static source, browser, visual, or human.

### R4 — Assurance MUST be reported in five buckets, and MUST sum to the applicable set

```text
automated   browserAnalysis   visualAnalysis   manualReview   notEvaluated
```

The source's example names this bucket `visualReview`; this framework uses `visualAnalysis` so that
the bucket is 1:1 with the validation type. The departure is disclosed rather than silently applied.

### R5 — Coverage and compliance are separate, and a high score MUST NOT conceal low assurance

Score is computed over evaluated required rules and is `null` when the denominator is zero. **Score
never drives status.** The assurance breakdown and the denominator basis travel in the payload
alongside it, so a score of 100 with most rules unevaluated reads as what it is.

### R6 — Rules typed browser, visual, or manual MUST NEVER pass from a static run

A `manual-review`, `browser-analysis`, or `visual-analysis` rule can reach an established state only
through ingested evidence or a valid attestation. There is no static path to passing them, and this
is enforced in the evaluator rather than left to rule authoring.

### R7 — Unestablished prohibitions MUST cap the verdict

A `forbidden` rule that could not be established — `not-evaluated`, `evidence-unavailable`,
`stale-evidence`, `class-unresolved`, `partial-coverage`, `unscoped-review`, or `partial-review` —
caps the overall verdict at `NOT_EVALUATED` and exits 1. A prohibition nobody checked is not a
prohibition anybody kept; neither is one checked over half the interface, nor one reviewed by someone
who chose which half to look at.

This list grows whenever the framework learns a new way to not know something, and that is the correct
direction for it to grow. A disposition that unestablishes a rule and is missing from this list is a
prohibition passing quietly.

**`evidence-unavailable` MUST mean an attempt was made and established nothing.** A project that
supplied no browser evidence at all reports `not-evaluated`. Collapsing the two would make never
having adopted an evidence surface look like a failure of one.

`unestablishedProhibitions` is present in every payload. An empty list and an absent field are
different claims.

### R8 — The evidence surface MUST be reported on every run

```text
source code read           routes discovered
component catalog available/unavailable
browser run completed/failed/not-attempted
viewports tested           accessibility tree obtained/not obtained
screenshots captured/not captured
design artifacts found/not found
```

Defaults are `not-attempted` rather than empty, because empty and absent are different claims.

### R9 — Exit codes MUST NOT be collapsed

```text
0  compliant, or the command completed with nothing to report
1  the tool worked and the project has problems
2  no verdict was reached — invocation or configuration error
```

Collapsing 1 and 2 teaches a consumer to treat a broken run as a failing project, or worse, to
weaken the check until it stops distinguishing them.

### R10 — Automated tooling MUST NOT be treated as a replacement for design judgment

A rendered artifact can establish what rendered, whether something changed, whether content overlaps,
and whether expected interface elements are visible. It generally cannot establish whether hierarchy
is good, whether a workflow is intuitive, whether language is understandable, or whether a design
manipulates the user.

**This boundary is preserved mechanically**, by R6: the rules covering those judgments are typed
`manual-review` and cannot pass without a review. See
[Standard 36](36-browser-and-visual-evidence.md).

### R11 — A declared target MUST NOT become a conformance claim

This framework evaluates against its own supported representation of a project's declared
accessibility target. It MUST NOT report, and a consumer MUST NOT infer, that the project conforms to
any external standard. See [Standard 38](38-external-source-provenance.md).

## Additions this standard makes beyond the source

- R4's naming departure is disclosed here, per §61's requirement that scope changes never be silent.
- R6's enforcement location — in the evaluator, not in rule authoring — is this framework's
  decision. Rule metadata could express the same intent and would be one authoring mistake away from
  a false pass.
- R7's extension of the verdict cap to `evidence-unavailable` and `stale-evidence` is this
  framework's; the source names only unevaluated prohibitions.
- R9's exit-code rationale is inherited from the family and stated here because the collapse is a
  real and tempting failure.
- R11 is this framework's, and it is the statement most likely to be needed when a result is quoted
  outside its context.

## Relationship to other standards

[Standard 33](33-rule-catalog-and-rule-identity.md) owns rule identity and the assurance legality
matrix. [Standard 34](34-project-policy-applicability-and-exceptions.md) owns applicability and the
policy half of the verdict. [Standard 36](36-browser-and-visual-evidence.md) owns how browser and
visual evidence is obtained — a deliberately separate owner from what that evidence licenses.
[Standard 37](37-manual-design-review.md) owns attestations.
[Standard 40](40-detector-and-testing-integrity.md) owns whether a detector establishes what it
claims.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R5, R6, R7, R9 | — | No rule. Implemented in the evaluator and asserted by meta-tests. |
| R4 | — | Enforced by a sum-to-applicable invariant test. |
| R8 | `evidence.surfaces-declared` | `structural`, full. Applies to process. |
| R10 | — | Enforced by R6's mechanism: the relevant rules are typed `manual-review`. |
| R11 | — | No rule. A constraint on this framework's reporting and on consumers. |
