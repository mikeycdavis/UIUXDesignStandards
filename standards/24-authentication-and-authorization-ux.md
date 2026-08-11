# Standard 24 — Authentication and Authorization UX

Sign-in, sign-out, session expiry, reauthentication, and permission denial. The recurring hazard is
that security reasoning pushes interfaces toward vagueness, and vagueness costs users the ability to
act.

Source: §21 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which authenticates users or
restricts access by role.

## Requirements

### R1 — Authentication MUST NOT depend on a cognitive test

Sign-in MUST NOT require the user to recall, transcribe, or solve something when an alternative
exists. Pasting into a password field MUST NOT be blocked, and password managers MUST NOT be
obstructed. Informed by
[WCAG 2.2 SC 3.3.8 "Accessible Authentication (Minimum)" (AA)].

### R2 — Session expiry MUST be communicated, and work MUST NOT be silently lost

A session ending MUST be visible to the user, and unsaved work MUST NOT disappear because of it. See
[Standard 14](14-navigation-and-information-architecture.md) R7.

Reauthentication SHOULD return the user to what they were doing.

### R3 — Permission failure MUST be distinguishable from absence

A user denied access MUST NOT be shown a generic not-found or empty state where the distinction
matters to them. See [Standard 17](17-error-presentation-and-feedback.md) R1.

Where disclosing that a resource exists is itself a disclosure risk, a project MAY deliberately
present permission denial as absence. That is a design decision with a security rationale, and it
MUST be recorded as such rather than arrived at by accident. See
[Standard 31](31-design-artifacts-and-documentation.md).

### R4 — Authorization detail MUST NOT be over-disclosed

A permission error MUST NOT enumerate the roles, resources, or policy internals that would help an
attacker. R3 and R4 bound each other: name what the user needs to act, not the system's model.

### R5 — Account lockout and rate limiting MUST explain the recovery path

A locked-out user MUST be told what will unlock the account or how long the lock lasts. A lockout
with no stated path is indistinguishable from a broken product.

### R6 — Multi-factor and security-sensitive flows MUST state what is happening

Where an additional factor is requested, the interface MUST say why and what the user is confirming.
A confirmation prompt with no stated subject trains users to approve prompts they did not initiate.

### R7 — Sign-out MUST be reachable and complete

Sign-out MUST be findable from any authenticated surface, and MUST end the session it appears to end.

## Additions this standard makes beyond the source

- R3's second paragraph is this framework's. The source prohibits disguising permission failures
  "when the distinction matters to the user"; the deliberate, recorded exception is the reading that
  keeps the rule compatible with resource-existence confidentiality.
- R4's second sentence — that R3 and R4 bound each other — is this framework's framing.
- R5 and R6's failure statements are this framework's; the source lists the topics without stating
  the obligations.

## Relationship to other standards

[Standard 17](17-error-presentation-and-feedback.md) owns error classification.
[Standard 15](15-forms-and-data-entry.md) owns the credential forms.
[Standard 25](25-privacy-ux.md) owns consent, a related but separate subject.
[Standard 16](16-interface-states.md) owns the permission-denied and authentication-required states.
Authorization enforcement itself is an EngineeringStandards concern; see
[Standard 2](02-boundary-with-engineering-standards.md).

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `forms.control-label` | `code-analysis`, partial. Autocomplete and paste-blocking are the detectable parts. |
| R2 | `navigation.unsaved-change-protection` | See [Standard 14](14-navigation-and-information-architecture.md). |
| R3, R4 | `interaction.error-classes-distinguished` | See [Standard 17](17-error-presentation-and-feedback.md). |
| R5, R6, R7 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
