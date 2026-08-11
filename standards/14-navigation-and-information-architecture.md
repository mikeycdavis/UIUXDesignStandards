# Standard 14 — Navigation and Information Architecture

Where a user is, how they got there, how they leave, and what happens to their work when they do.
This standard is deliberately bounded: it does not require breadcrumbs or elaborate hierarchies for
interfaces that gain nothing from them.

Source: §4 (Navigation and information architecture) of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which has more than one
navigable surface.

## Requirements

### R1 — The navigation hierarchy MUST be understandable

A user MUST be able to form a correct model of where things are. A navigation structure that requires
memorizing which of five similar sections holds a feature is a failure of this requirement.

### R2 — Current location MUST be indicated

The interface MUST show where the user currently is within the navigation structure. Informed by
[NN/g heuristic 1 "Visibility of System Status"].

The indication MUST NOT rely solely on color; see [Standard 9](09-color.md) R3.

### R3 — Navigation MUST be predictable and consistent

Navigation mechanisms repeated across surfaces MUST appear in the same relative order, and components
with the same function MUST be identified consistently. Informed by
[WCAG 2.2 SC 3.2.3 "Consistent Navigation" (AA)] and
[WCAG 2.2 SC 3.2.4 "Consistent Identification" (AA)].

### R4 — Breadcrumbs and deep hierarchies are OPTIONAL

Breadcrumbs MUST NOT be required for interfaces where they add no value. Where they exist, they
SHOULD reflect the information architecture rather than the user's click path. See
[APG pattern "Breadcrumb"].

### R5 — Meaningful surfaces SHOULD be deep-linkable

Where a project has addressable surfaces, a user SHOULD be able to link to a specific one, and that
address SHOULD remain stable. Application state that a user would reasonably expect to share or
bookmark SHOULD be reachable by address.

### R6 — Platform navigation MUST work

Where the platform provides a back affordance, it MUST behave as the user expects: it MUST NOT
silently discard context, and it MUST NOT be intercepted to prevent departure.

### R7 — Unsaved work MUST NOT be lost silently

Navigating away from unsaved changes MUST either preserve them or warn. A silent discard is a data
loss the user did not choose. Informed by [NN/g heuristic 5 "Error Prevention"].

The warning MUST NOT become ceremony: a prompt on every navigation regardless of whether anything
changed trains users to dismiss it, which defeats the requirement.

### R8 — More than one way to reach content SHOULD exist

Within a set of surfaces, more than one route SHOULD lead to a given surface — navigation plus
search, or navigation plus an index. Informed by [WCAG 2.2 SC 2.4.5 "Multiple Ways" (AA)].

## Additions this standard makes beyond the source

- R1's failure example is illustrative.
- R4's second sentence — that breadcrumbs reflect architecture rather than click path — is this
  framework's; the source only bounds when breadcrumbs are required.
- R7's second paragraph, on unconditional prompts, is this framework's. It follows from the same
  reasoning as [Standard 18](18-destructive-actions-error-prevention-and-recovery.md)'s prohibition
  on confirmation ceremony.

## Relationship to other standards

[Standard 13](13-responsive-and-adaptive-design.md) owns navigation behavior across viewport classes.
[Standard 23](23-search-and-filtering.md) owns search, one of R8's alternate routes.
[Standard 18](18-destructive-actions-error-prevention-and-recovery.md) owns confirmation semantics
that R7 borrows. [Standard 11](11-visual-hierarchy-and-progressive-disclosure.md) owns hierarchy as a
visual property; R1 is about the structure itself.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R3, R4, R8 | — | No rule in v1.0.0. Manual-review candidates recorded for a later release. |
| R2 | `navigation.current-location-indicated` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R5 | `navigation.deep-linkable` | `code-analysis`, partial. |
| R6 | `navigation.deep-linkable` | Same rule; route stability and back behavior share an identity. |
| R7 | `navigation.unsaved-change-protection` | `code-analysis`, partial. |
