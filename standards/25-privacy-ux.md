# Standard 25 — Privacy UX

Consent, collection, retention, sharing, deletion, export, and the display of sensitive values. This
standard governs the interface only; what data may lawfully be collected is not its subject.

Source: §22 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which collects, displays, or
shares personal or sensitive information.

This standard does not state legal requirements and MUST NOT be read as a compliance framework for
any privacy regulation. It requires that privacy choices be presented honestly; which choices must
be offered is decided elsewhere.

## Requirements

### R1 — Consent MUST be intentional and symmetric

A consent choice MUST be as easy to decline as to accept. Asymmetric prominence, pre-checked
agreement, and a decline path with more steps than the accept path are deceptive patterns and are
prohibited; see [Standard 29](29-design-integrity-prohibitions.md).

### R2 — Consequential choices MUST NOT be buried in confusing wording

A privacy decision MUST be understandable at the point it is made. Double negatives, opt-out controls
phrased as opt-in, and consequential defaults hidden behind a settings link are prohibited.

### R3 — Collection MUST be evident where it is not obvious

Where an interface collects data a user would not expect it to, that MUST be visible at the point of
collection. See [NN/g heuristic 1 "Visibility of System Status"].

### R4 — Deletion, retention, and export MUST be discoverable where offered

Where a project provides these, the controls MUST be findable from the interface rather than only
through support. Retention MUST be stated where the user's expectation would otherwise be wrong.

### R5 — Deletion MUST NOT be claimed beyond what happens

An interface MUST NOT describe an action as deletion when it archives, hides, or soft-deletes. See
[Standard 18](18-destructive-actions-error-prevention-and-recovery.md) R7.

### R6 — Sensitive values MUST be masked by default

Credentials, tokens, financial identifiers, and comparable values MUST be masked in display, with
reveal as a deliberate user action. Masking MUST also apply to values echoed into logs, exports, and
error messages that reach the interface.

### R7 — Permission requests MUST state their purpose

A request for a device or account permission MUST say what it is for, at a moment where that purpose
is evident. A permission requested on load, before context exists, is a request the user cannot
evaluate.

## Additions this standard makes beyond the source

- R1's three named asymmetries are this framework's enumeration of the source's "intentionally
  asymmetric consent".
- R5 is not in the source's privacy list. It is placed here because deletion language is where
  privacy UX and the honesty prohibitions meet, and a reader looking for it will look here.
- R6's second sentence, extending masking to logs and exports that surface in the interface, is this
  framework's.
- R7's second sentence is this framework's, and it names the most common failure: a permission prompt
  before any context.

## Relationship to other standards

[Standard 29](29-design-integrity-prohibitions.md) owns the deceptive-consent prohibition.
[Standard 20](20-content-design.md) owns the wording R2 depends on.
[Standard 18](18-destructive-actions-error-prevention-and-recovery.md) owns reversibility claims.
[Standard 24](24-authentication-and-authorization-ux.md) owns credential handling in forms.
Data handling beneath the interface is an EngineeringStandards concern; see
[Standard 2](02-boundary-with-engineering-standards.md).

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2 | `privacy.no-deceptive-consent` | `manual-review`, none. Forbidden, non-exemptible. |
| R3, R4, R7 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R5 | `design-integrity.no-fake-success` | See [Standard 29](29-design-integrity-prohibitions.md). |
| R6 | `privacy.sensitive-data-masked` | `code-analysis`, partial. |
