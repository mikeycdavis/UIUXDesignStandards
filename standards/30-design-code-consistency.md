# Standard 30 — Design/Code Consistency

Documentation, mockups, screenshots, prototypes, component catalogs, and production code must not
contradict one another silently. This standard treats design-documentation freshness as correctness.

Source: §24 and §49 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which maintains durable design
artifacts.

## Requirements

### R1 — Material contradictions MUST be explicit

Where a design artifact and the implementation disagree materially, the disagreement MUST be
recorded. It MUST NOT be left for a reader to discover.

"Materially" bounds this. A mockup whose padding differs from the build by a few pixels is not a
contradiction; one showing a workflow the product no longer has is.

### R2 — Stale documentation presented as current is WRONG documentation

A screenshot of an old interface, presented as the current one, is incorrect — not merely dated. The
error is the presentation, not the age.

### R3 — Historical artifacts MUST be identifiable as historical

Every artifact MUST NOT be kept current. Superseded artifacts MAY be retained, and when they are they
MUST be clearly marked as historical, with what they depict and when.

### R4 — Divergence SHOULD be detectable where artifacts are structured

Where a project has structured design artifacts, the framework SHOULD be able to identify likely
disagreement between:

```text
design tokens              ↔  implementation
documented variants        ↔  actual variants
screenshots                ↔  current UI
documented routes          ↔  current routes
prototypes                 ↔  shipped workflows
accessibility claims       ↔  implementation
responsive claims          ↔  tested viewport behavior
```

Each of these is a *likely* disagreement. A divergence signal is evidence that something needs
attention, never a determination of which side is wrong.

### R5 — Neither side MAY be declared authoritative by default

Where design and implementation disagree, this framework MUST NOT silently treat one as correct. A
project MAY declare which artifact is canonical; absent that declaration, a divergence is reported
as a divergence.

### R6 — Design artifact freshness MUST be assessable

Where a project relies on a design artifact as evidence, that artifact's currency MUST be
determinable. Freshness is established against committed repository content; see
[ADR 0011](../artifacts/adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)
and [Standard 37](37-manual-design-review.md).

An artifact whose freshness cannot be established is `evidence-unavailable`, which is distinct from
stale and is never a pass.

## Additions this standard makes beyond the source

- R2 states the source's point as a definition rather than an example, because "wrong" rather than
  "old" is the classification that drives the right remedy.
- R4's closing paragraph — that a divergence signal never determines which side is wrong — is this
  framework's, and it is what makes R5 implementable.
- R6 is not in the source's list. It is added because [Standard 37](37-manual-design-review.md)'s
  attestation model depends on artifact freshness being mechanically determinable, and a
  design/code-consistency standard that ignored freshness would leave that dependency unowned.

## Relationship to other standards

[Standard 31](31-design-artifacts-and-documentation.md) owns where artifacts live and which
decisions are recorded. [Standard 6](06-design-tokens-and-design-system-consistency.md) owns token
divergence. [Standard 7](07-component-reuse-and-component-states.md) owns documented component
states. [Standard 36](36-browser-and-visual-evidence.md) owns screenshot evidence.
[Standard 37](37-manual-design-review.md) owns the freshness mechanism R6 refers to.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R6 | `design-integrity.artifact-freshness` | `document`, partial. |
| R4 | `design-system.tokens-used`, `design-system.component-states-documented` | Divergence signals; see [Standard 6](06-design-tokens-and-design-system-consistency.md) and [Standard 7](07-component-reuse-and-component-states.md). |
| R5 | — | No rule. A constraint on how this framework reports divergence. |
