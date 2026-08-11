# Standard 32 — UI Definition of Done

A UI feature is not complete because its happy path renders. This standard states what completion
includes, and states equally firmly that applicability drives the checklist rather than the checklist
driving the work.

Source: §48 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`, at the level of a UI feature
rather than the project as a whole.

## Requirements

### R1 — Happy-path rendering MUST NOT be treated as completion

A feature that renders correctly with ideal data, on the developer's viewport, with no errors, is not
done. It is the first of the states [Standard 16](16-interface-states.md) enumerates.

### R2 — Completion includes the applicable items below

Where applicable to the feature:

```text
required functional behavior      loading state
empty state                       error state
validation                        keyboard operation
responsive behavior               accessibility semantics
supported theme behavior          analytics/audit integration
documentation                     tests
visual review                     acceptance criteria
verification
```

### R3 — Applicability MUST drive the checklist

Irrelevant items MUST NOT be required mechanically. A read-only display with no input needs no
validation, and requiring one would be the ceremony this framework rejects.

The direction matters: applicability narrows the checklist, and it MUST be a stated decision rather
than an omission. "We did not do it" and "it does not apply" are different claims, and only the
second is a completion.

### R4 — Verification MUST be distinguishable from implementation

An item is complete when it has been verified, not when it has been written. This mirrors the
three-state distinction this framework applies to its own release criteria — implemented, verified,
released — see [Standard 35](35-evidence-assurance-and-compliance-output.md).

### R5 — Completion MUST NOT be claimed for what was not evaluated

A feature MUST NOT be reported done on the strength of checks that did not run. This is the same law
that governs compliance verdicts, applied at feature scope.

## Additions this standard makes beyond the source

- R3's second paragraph — that narrowing must be a stated decision, and that "not done" and "not
  applicable" are different claims — is this framework's, and it is the difference between an honest
  and a decorative definition of done.
- R4 and R5 are not in the source's §48. They apply this framework's own evidence discipline to
  feature completion, so that a definition of done cannot become a checklist signed without evidence.

## Relationship to other standards

[Standard 16](16-interface-states.md) owns the states R2 lists.
[Standard 34](34-project-policy-applicability-and-exceptions.md) owns applicability at project
scope; R3 is its feature-scope analog.
[Standard 35](35-evidence-assurance-and-compliance-output.md) owns the evidence law R5 applies.
[Standard 37](37-manual-design-review.md) owns the visual-review item in R2.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3 | `interaction.states-complete` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R4, R5 | — | No rule. Constraints on how completion is claimed, enforced by this framework's own reporting. |
