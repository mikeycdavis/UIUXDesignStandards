# Standard 27 — First-Use and Onboarding

The state of an interface for a user who has nothing yet. This standard is conditional: onboarding
MUST NOT be forced onto interfaces that people can understand without it.

Source: §36 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which has a first-use
experience — an empty account, a setup flow, or an onboarding sequence. A project with none is
reported `not-applicable` with the reason, not passed.

## Requirements

### R1 — The first-use state MUST be designed

A new account, an empty workspace, or a fresh install MUST show something deliberate. The
zero-data screen is the first thing every user sees and the last thing most products design. See
[Standard 16](16-interface-states.md) R5.

### R2 — Required and optional setup MUST be distinguishable

A user MUST be able to tell what they have to do before the product works from what they may do
later. Presenting optional configuration as required is how setup abandonment happens.

### R3 — Setup progress MUST be visible where setup is multi-step

A multi-step flow MUST show where the user is and how much remains. Informed by
[NN/g heuristic 1 "Visibility of System Status"].

### R4 — Skip and resume MUST be supported where setup is not strictly required

A user MUST be able to leave optional setup and return to it. Work completed before leaving MUST
survive. See [Standard 15](15-forms-and-data-entry.md) R4.

### R5 — Tours MUST NOT be forced

An onboarding tour MUST NOT be required where users can understand the interface without one, and
MUST always be dismissible. A tour that cannot be skipped is an obstacle presented as help.

### R6 — Sample data MUST be identifiable as sample data

Where a product seeds example content, that content MUST be distinguishable from the user's own and
MUST be removable. Sample data indistinguishable from real data is fabricated data in the user's
workspace; see [Standard 29](29-design-integrity-prohibitions.md).

### R7 — Contextual help SHOULD be available where it is needed

Help SHOULD be reachable at the point of difficulty rather than only from a separate section.
Informed by [NN/g heuristic 10 "Help and Documentation"].

## Additions this standard makes beyond the source

- R1's second sentence is an observation, not a source requirement.
- R2's failure statement is this framework's.
- R6 connects sample data to the fabricated-data prohibition. The source lists `sample data` as an
  onboarding topic without that connection; making it explicit is this framework's, and it is what
  gives R6 a rule to bind to.

## Relationship to other standards

[Standard 16](16-interface-states.md) owns empty and initial states — a different subject from
onboarding, which is why the two are separate standards.
[Standard 15](15-forms-and-data-entry.md) owns setup forms.
[Standard 29](29-design-integrity-prohibitions.md) owns the fabricated-data prohibition R6 invokes.
[Standard 39](39-bootstrap-and-existing-ui-reconstruction.md) governs this framework's own
bootstrap, which is a different subject despite the shared word.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `interaction.empty-states-differentiated` | See [Standard 16](16-interface-states.md). |
| R2, R3, R4, R5, R7 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | `design-integrity.no-fabricated-data` | `code-analysis`, partial. Forbidden, non-exemptible. |
