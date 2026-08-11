# Standard 26 — AI User Experience

Interfaces that present AI behavior to a user. This standard owns presentation; authorization,
attribution, and auditability of AI actions belong to EngineeringStandards and are referenced rather
than restated.

Source: §23 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which surfaces generated
content or AI-initiated actions.

Note the distinction from [Standard 1](01-interface-operability-for-humans-and-ai-agents.md): that
standard governs interfaces *built by* AI agents; this one governs interfaces that *present* AI
behavior.

## Requirements

### R1 — Generated content MUST be distinguishable where the distinction matters

Where a user could reasonably take generated output for verified, human-authored fact, the interface
MUST mark it. Presenting generated inference as established fact is prohibited; see
[Standard 29](29-design-integrity-prohibitions.md).

"Where it matters" is the qualifier: a generated autocomplete suggestion in a text field does not
require a provenance badge.

### R2 — Proposal MUST be distinguishable from execution

An interface MUST NOT imply an action happened when it was only proposed. A proposed change and an
applied change MUST differ in the interface, unambiguously.

The authorization model that decides whether a proposal may be executed is an EngineeringStandards
concern; this requirement is about what the user sees. See
[Standard 2](02-boundary-with-engineering-standards.md).

### R3 — Consequential AI actions MUST show what they will change before approval

A user asked to approve MUST be able to see the change. Where the change is structured, it SHOULD be
presented diffably. An approval prompt that describes an action in prose the user cannot verify is
an approval of nothing.

### R4 — AI operations MUST expose their failure states

Provider unavailable, model error, tool failure, timeout, cancellation, partial response: each MUST
be distinguishable in the interface, and none MUST be presented as a completed result. See
[Standard 17](17-error-presentation-and-feedback.md) R1.

A truncated response MUST NOT be shown as a whole one.

### R5 — Long-running AI operations MUST be cancellable and honest about progress

Where generation is slow, the interface MUST allow cancellation and MUST NOT display fabricated
progress. See [Standard 16](16-interface-states.md) R3.

### R6 — Uncertainty SHOULD be conveyed where it is available and meaningful

Where a system has a defensible measure of its own confidence, the interface SHOULD convey it.
An interface MUST NOT invent a confidence indication that the underlying system does not produce.

### R7 — Sources SHOULD be presented where a claim depends on them

Where output cites or draws on sources, those sources SHOULD be reachable. A citation the user cannot
open is a claim, not evidence.

### R8 — The system MUST NOT be anthropomorphized in ways that misrepresent capability

Language implying memory, intent, understanding, or agency the system does not have misleads users
about what it will do. Personality is permitted; misrepresentation is not.

### R9 — Recovery MUST exist for AI-applied changes

Where an AI action modifies user-visible state, the interface MUST provide a path back, subject to
[Standard 18](18-destructive-actions-error-prevention-and-recovery.md) R7 — reversibility MUST NOT
be claimed unless it is reliable.

## Additions this standard makes beyond the source

- R6's second sentence is this framework's, and it is the stronger half: a fabricated confidence
  score is worse than none, because it looks like evidence.
- R7's "a citation the user cannot open is a claim, not evidence" is this framework's.
- R4's final sentence, on truncated responses, is this framework's application of the source's
  `partial responses` bullet.
- R8's separation of personality from misrepresentation is this framework's; the source states the
  prohibition without the boundary.

## Relationship to other standards

[Standard 2](02-boundary-with-engineering-standards.md) owns the boundary with the actor and audit
model. [Standard 16](16-interface-states.md) owns AI loading and progress states.
[Standard 17](17-error-presentation-and-feedback.md) owns failure presentation.
[Standard 29](29-design-integrity-prohibitions.md) owns the generated-as-verified prohibition.
[Standard 1](01-interface-operability-for-humans-and-ai-agents.md) governs the different subject of
agent-authored interfaces.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `ai-ux.no-generated-as-verified` | `manual-review`, none. Forbidden, non-exemptible. |
| R2, R3 | `ai-ux.proposal-vs-execution` | `manual-review`, none. Attestable. Cross-references the EngineeringStandards propose/execute rule. |
| R4, R5 | `ai-ux.ai-failure-states` | `manual-review`, none. Attestable. |
| R6, R7, R8 | `ai-ux.no-generated-as-verified` | Same rule; each is a distinct finding under it. |
| R9 | `interaction.destructive-confirmation` | See [Standard 18](18-destructive-actions-error-prevention-and-recovery.md). |
