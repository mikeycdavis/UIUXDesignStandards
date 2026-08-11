# Standard 20 — Content Design

The words in the interface. Understandable, concise, actionable, consistent, and specific where
consequences are involved — without forcing unnatural phrasing to satisfy a rule.

Source: §17 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. Every requirement here is
manual-review; none is statically detectable, and none is reported as passing without a review.

## Requirements

### R1 — Copy MUST be understandable by its intended audience

Language MUST match the expertise the product assumes. Jargon MUST NOT be used where users are not
expected to understand it, and MUST NOT be avoided where it is the precise and expected term.
Informed by [NN/g heuristic 2 "Match Between the System and the Real World"].

### R2 — Button text SHOULD describe the action

Generic labels — `OK`, `Yes`, `Submit` — SHOULD be replaced with the action they perform where a more
specific label is useful.

`Delete 3 projects` tells a user what the button does when the surrounding text has scrolled out of
view; `OK` does not. This matters most in confirmation dialogs, where the label is often the last
thing read. See [Standard 18](18-destructive-actions-error-prevention-and-recovery.md) R1.

### R3 — Unnatural wording MUST NOT be required

R2 is a preference with a stated purpose, not a prohibition on the word "OK". Where a generic label
is genuinely the clearest one, it is correct.

### R4 — Error and consequence copy MUST be specific

A message reporting a failure or a consequence MUST say what happened and what the user can do.
`Something went wrong` MUST NOT be the only information available when the application holds a
meaningful, actionable error. Informed by
[NN/g heuristic 9 "Help Users Recognize, Diagnose, and Recover from Errors"].

The qualifier is load-bearing: an application that genuinely does not know what failed may say so.
What it may not do is know and not say.

### R5 — Terminology MUST be consistent

The same concept MUST be named the same way across the interface. Informed by
[NN/g heuristic 4 "Consistency and Standards"].

### R6 — Copy SHOULD be concise without being cryptic

Brevity is a means to comprehension, not a goal. Text cut to the point of ambiguity has failed R1.

## Additions this standard makes beyond the source

- R2's worked example and its confirmation-dialog rationale are this framework's.
- R3 is stated as its own requirement rather than as a caveat to R2, because a rule that reads as an
  absolute prohibition on generic labels is how this standard would be misapplied.
- R4's second paragraph interprets the source's qualifier and states the failure it targets: knowing
  and not saying.
- R6 is not in the source's list. It is added because conciseness pursued alone produces the defect
  R1 exists to prevent.

## Relationship to other standards

[Standard 17](17-error-presentation-and-feedback.md) owns error classification and presentation;
this standard owns the wording. [Standard 15](15-forms-and-data-entry.md) owns form-specific message
requirements. [Standard 21](21-localization-and-internationalization.md) governs how this copy
survives translation. [Standard 11](11-visual-hierarchy-and-progressive-disclosure.md) R4 depends on
R2 for non-color action identification.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R5, R6 | — | No rule in v1.0.0. Manual-review candidates recorded for a later release. |
| R2, R3 | `content.button-labels-specific` | `manual-review`, none. Attestable. |
| R4 | `content.error-messages-actionable` | `manual-review`, none. Attestable. |
