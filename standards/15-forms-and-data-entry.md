# Standard 15 — Forms and Data Entry

Labels, validation, error recovery, submission states, and the preservation of what a user typed.
Forms are where most interfaces lose data and most accessibility failures concentrate.

Source: §4 (Forms and data entry) of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which accepts user input.

## Requirements

### R1 — Every control MUST have a programmatically associated label

A form control MUST have a label associated with it in markup, not merely placed near it. Informed by
[WCAG 2.2 SC 3.3.2 "Labels or Instructions" (A)] and
[WCAG 2.2 SC 1.3.1 "Info and Relationships" (A)].

A placeholder is not a label. It disappears on input, it is not reliably announced, and it fails the
users who most need the label.

### R2 — Required and optional status MUST be indicated

Which fields are required MUST be visible before submission, not discovered by attempting it.
Indication MUST NOT rely solely on color; see [Standard 9](09-color.md) R3.

### R3 — Errors MUST be identified and associated with their field

A validation error MUST identify which field failed, MUST be programmatically associated with that
field, and MUST describe what to do. Informed by
[WCAG 2.2 SC 3.3.1 "Error Identification" (A)] and
[WCAG 2.2 SC 3.3.3 "Error Suggestion" (AA)].

Field-level and form-level errors MUST both be available where both apply, and MUST NOT be collapsed
into one another.

### R4 — Entered data MUST be preserved through validation failure

A failed submission MUST NOT clear the user's input. This is the single most damaging common form
defect and it has no legitimate variant.

### R5 — Information already provided MUST NOT be re-requested unnecessarily

Within a process, information the user already entered MUST NOT be required again, except where
re-entry is essential. Informed by [WCAG 2.2 SC 3.3.7 "Redundant Entry" (A)].

### R6 — Input types and autocomplete MUST be declared

Controls MUST use the input type matching their data and MUST declare autocomplete purpose where one
exists, so that browsers, password managers, and assistive technology can assist. Informed by
[WCAG 2.2 SC 1.3.5 "Identify Input Purpose" (AA)].

Password managers MUST NOT be actively blocked.

### R7 — Submission state MUST be visible and duplicate submission MUST be prevented

A submitting form MUST indicate that submission is in progress, and MUST NOT allow the same
submission to be issued twice by repeated activation. See
[Standard 16](16-interface-states.md) for the state model.

A submit control inside a form MUST declare its type. An untyped control inside a form submits it,
which is the mechanism behind a large share of accidental duplicate submissions.

### R8 — Validation timing MUST NOT punish typing

Validation MUST NOT report an error for an incomplete value the user is still entering. Validate on
blur, on submission, or after a settling delay.

### R9 — Destructive submissions MUST follow the destructive-action requirements

See [Standard 18](18-destructive-actions-error-prevention-and-recovery.md).

### R10 — Error text MUST be actionable

A generic message MUST NOT be the only information offered when the application holds a meaningful,
actionable error. See [Standard 17](17-error-presentation-and-feedback.md) and
[Standard 20](20-content-design.md).

## Additions this standard makes beyond the source

- R1's second paragraph — that a placeholder is not a label — is this framework's, with its reasons.
- R4's "no legitimate variant" is a strengthening: the source lists data preservation among many
  form concerns without singling it out.
- R7's second paragraph names the untyped-submit-control mechanism. This is this framework's, and it
  exists because it is the one part of R7 with a reliable static signal.
- R8's three acceptable timings are this framework's; the source requires validation timing be
  defined without prescribing options.

## Relationship to other standards

[Standard 3](03-accessibility-foundations.md) owns the semantic association mechanism R1 and R3 rely
on. [Standard 16](16-interface-states.md) owns submission and error states.
[Standard 17](17-error-presentation-and-feedback.md) owns error classification and presentation.
[Standard 20](20-content-design.md) owns message wording.
[Standard 24](24-authentication-and-authorization-ux.md) owns credential forms specifically.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `forms.control-label` | `code-analysis`, partial. Static detector in v1.0.0 for HTML-like templates only. |
| R2 | `forms.required-status-indicated` | `manual-review`, none. Required indication is not statically detectable. |
| R3 | `forms.error-field-association` | `code-analysis`, partial. Message wording is [Standard 20](20-content-design.md)'s, not this rule's. |
| R4 | `forms.data-preserved-on-error` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R5, R8 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | `forms.control-label` | Same rule; input purpose is part of the labeling contract. |
| R7 | `forms.duplicate-submission-prevented`, `forms.button-type` | The second is `code-analysis`, partial, with a static detector in v1.0.0. |
| R9 | `interaction.destructive-confirmation` | See [Standard 18](18-destructive-actions-error-prevention-and-recovery.md). |
| R10 | `content.error-messages-actionable` | See [Standard 20](20-content-design.md). |
