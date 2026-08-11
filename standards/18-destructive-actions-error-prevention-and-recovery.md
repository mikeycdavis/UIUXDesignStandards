# Standard 18 — Destructive Actions, Error Prevention, and Recovery

Preventing predictable mistakes, confirming the ones worth confirming, and recovering from the rest.
The three subjects share a standard because they trade against one another: over-confirming is itself
a failure of prevention.

Source: §10, §33, and §34 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which exposes destructive,
irreversible, or high-impact operations.

## Requirements

### R1 — A destructive action MUST identify what it will do

Before confirming, the user MUST be able to see what will be affected, whether the change is
reversible, and what else it cascades to.

"Are you sure?" identifies nothing. A confirmation that names neither the object nor the consequence
does not satisfy this requirement.

### R2 — Disablement MUST remain understandable

An action MAY be disabled to prevent an error, and when it is, the reason MUST remain discoverable.
A disabled control with no explanation converts a preventable error into an unsolvable puzzle. See
[Standard 16](16-interface-states.md) R9.

### R3 — Predictable errors SHOULD be prevented rather than reported

Constrain invalid input where appropriate, make requirements visible before submission, and warn
before destructive behavior. Informed by [NN/g heuristic 5 "Error Prevention"].

Input MUST NOT be over-constrained where flexibility is legitimate. A field that rejects a valid
value because a pattern was written narrowly is a prevention failure, not a prevention success.

### R4 — Confirmation MUST be proportional

Confirmation MUST be required where an action is consequential and MUST NOT be required for ordinary
harmless ones. Confirmation dialogs MUST NOT become ceremony: a confirmation the user always accepts
teaches them to accept the one that mattered.

For data-affecting, financial, or legal submissions, the action MUST be reversible, checkable, or
confirmable. Informed by
[WCAG 2.2 SC 3.3.4 "Error Prevention (Legal, Financial, Data)" (AA)].

### R5 — Destructive defaults MUST NOT be pre-focused

A confirmation dialog MUST NOT place initial focus on its destructive action. A user dismissing a
dialog by reflex MUST NOT thereby confirm it.

### R6 — Recovery SHOULD be offered where operations are meaningfully reversible

Undo deletion, restore archived content, recover drafts, preserve form state, retry failed uploads.
Informed by [NN/g heuristic 3 "User Control and Freedom"].

### R7 — Reversibility MUST NOT be claimed unless recovery is reliable

An interface MUST NOT offer undo it cannot honor. A failed undo is worse than no undo: the user
stopped taking care because the interface said they did not need to.

Where recovery is partial or time-limited, the limit MUST be stated.

### R8 — Consequences MUST NOT be obscured

Making a destructive consequence hard to notice — through wording, placement, or visual weight — is
prohibited; see [Standard 29](29-design-integrity-prohibitions.md).

## Additions this standard makes beyond the source

- R1's second paragraph, rejecting contentless confirmations, is this framework's operationalization
  of "clearly identify what will happen".
- R3's second paragraph reframes over-constraint as a prevention failure. The source states the
  limit without that framing.
- R5 is this framework's reading of the source's "avoid dangerous default focus", stated as a
  testable requirement about initial focus placement.
- R7's second paragraph — that partial or time-limited recovery must state its limit — is this
  framework's.

## Relationship to other standards

[Standard 15](15-forms-and-data-entry.md) owns destructive submissions and data preservation.
[Standard 16](16-interface-states.md) owns the destructive-confirmation state and disablement.
[Standard 17](17-error-presentation-and-feedback.md) owns durable confirmation of what changed.
[Standard 20](20-content-design.md) owns the wording R1 depends on.
[Standard 29](29-design-integrity-prohibitions.md) owns R8's prohibition and the dark-pattern rule
R4 borders on.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R4, R5 | `interaction.destructive-confirmation` | `manual-review`, none. Attestable. |
| R2 | `interaction.states-complete` | See [Standard 16](16-interface-states.md). |
| R3 | — | No rule in v1.0.0. Recorded as a requirement without mechanical support. |
| R6, R7 | — | No rule in v1.0.0. A false-reversibility rule is a candidate for a later release. |
| R8 | `design-integrity.no-obscured-destruction` | `manual-review`, none. Forbidden, non-exemptible. |
