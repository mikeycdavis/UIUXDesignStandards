# Standard 17 — Error Presentation and Feedback

How failures and confirmations reach the user. This standard owns the *presentation* of errors; the
structured error contract beneath it belongs to EngineeringStandards and is referenced rather than
restated.

Source: §8 and §9 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — Error classes MUST stay distinguishable in presentation

The interface MUST preserve the distinction between:

```text
validation failure      permission failure       authentication failure
dependency failure      network failure          server failure
unavailable feature     destructive-action denial
unknown/unclassified error
```

Rendering all of them as one message destroys information the application already has. The user's
next action differs by class: retry, sign in, request access, wait, or report.

### R2 — Structured application errors MUST map to structured UX behavior

Where the application produces a structured error, the interface MUST use its class rather than
flattening it to a string. The error contract itself is owned by EngineeringStandards; see
[Standard 2](02-boundary-with-engineering-standards.md).

### R3 — The interface MUST NOT report success for a failed operation

A false success is the most damaging thing an interface can do, because the user stops watching. This
is a prohibition; see [Standard 29](29-design-integrity-prohibitions.md).

### R4 — Failures MUST NOT be silently swallowed

An error caught and discarded to keep an interface visually clean is a failure the user is entitled
to know about. Where a failure genuinely does not warrant interruption, it MUST still be recoverable
from somewhere — a status surface, a log the user can reach, a retry affordance.

### R5 — Meaningful actions MUST receive appropriate feedback

Saved, submitted, copied, deleted, queued, processing, failed, retried, completed: where an action
matters, its outcome MUST be communicated. Informed by
[NN/g heuristic 1 "Visibility of System Status"].

### R6 — Feedback durability MUST match the information's importance

Inline, persistent, modal, and transient feedback MUST be chosen by how long the information matters
and how much it costs to miss.

A destructive action's confirmation MUST NOT disappear into a transient notification when the user
needs a durable record of what changed.

### R7 — Notification volume MUST NOT defeat notification

Excessive transient notifications train users to dismiss them unread, which removes the channel R5
depends on.

### R8 — Status changes MUST be announced to assistive technology

A status message that appears without a change of focus MUST be programmatically announced. Informed
by [WCAG 2.2 SC 4.1.3 "Status Messages" (AA)].

### R9 — Error messages MUST say what happened and what to do

See [Standard 20](20-content-design.md), which owns message wording, and
[Standard 15](15-forms-and-data-entry.md) R10 for the form-specific case.

## Additions this standard makes beyond the source

- R1's second paragraph — that the user's next action differs by class — is this framework's
  rationale for the source's requirement.
- R4's second sentence is a partial allowance the source does not state: it admits that not every
  failure warrants interruption while refusing the silent-discard case.
- R7 restates the source's "avoid excessive toast notifications" as a requirement with its
  mechanism.

## Relationship to other standards

[Standard 2](02-boundary-with-engineering-standards.md) owns the cross-reference to the structured
error contract. [Standard 16](16-interface-states.md) owns the error *states*; this standard owns
their presentation. [Standard 20](20-content-design.md) owns wording.
[Standard 24](24-authentication-and-authorization-ux.md) owns the permission and authentication
classes specifically. [Standard 29](29-design-integrity-prohibitions.md) owns R3's prohibition.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2 | `interaction.error-classes-distinguished` | `code-analysis`, partial. Cross-references the EngineeringStandards structured-error rule. |
| R3 | `design-integrity.no-fake-success` | `browser-analysis`, partial. Forbidden, non-exemptible. |
| R4 | `interaction.error-classes-distinguished` | Same rule; the swallowed-failure case is a distinct finding under it. |
| R5, R6, R7 | — | No rule in v1.0.0. Manual-review candidates recorded for a later release. |
| R8 | `accessibility.accessible-names` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R9 | `content.error-messages-actionable` | See [Standard 20](20-content-design.md). |
