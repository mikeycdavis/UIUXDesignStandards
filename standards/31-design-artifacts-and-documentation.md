# Standard 31 — Design Artifacts and Documentation

Where durable design artifacts live, which decisions get recorded, and what a person or agent
arriving with no prior context must be able to determine from the repository alone.

Source: §25, §50, and §53 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

**Documentation MUST be proportional.** Every project MUST NOT be required to produce every document
named below. What is required is that the questions in R4 are answerable.

## Requirements

### R1 — Durable design artifacts SHOULD have canonical locations

```text
docs/design/
artifacts/design/
artifacts/adr/
```

A project MAY use different locations. What it MUST NOT do is scatter artifacts such that a reader
cannot find them.

### R2 — Consequential design decisions MUST be recorded

Decisions that shape the interface's structure or constrain future work MUST be written down:
navigation architecture, mobile strategy, design-system adoption, accessibility tradeoffs, unusual
interaction patterns, data-visualization strategy, and intentionally unsupported viewport classes.

### R3 — Ordinary cosmetic decisions MUST NOT require a decision record

A record for every color change makes the records worthless and the process resented. R2's list is
the shape of what qualifies: decisions with consequences beyond their own surface.

### R4 — A reader with no prior context MUST be able to determine nine things

From repository contents alone, without conversation history, a person or agent MUST be able to
determine:

```text
what UI exists                    what design system is used
supported platforms               accessibility targets
relevant UX constraints           current known design gaps
how to run validation             what requires human review
what artifacts are canonical
```

If answering any of these requires tribal knowledge, the documentation is incomplete. This
requirement is the test for the rest of this standard.

### R5 — Documentation topics SHOULD follow the project's actual concerns

Candidate documents — a design-system description, an accessibility document, an information
architecture document, a design-decisions log, a browser-support statement, a responsive strategy —
SHOULD be written where the project has something to say. A project MUST NOT be required to create
every one.

### R6 — Generated documentation MUST be checked against implementation evidence

Documentation produced by tooling MUST NOT be published as fact without verification against the
implementation. Generated documentation is a claim about the code, and an unverified claim is
exactly what this framework exists to prevent.

### R7 — Known design gaps MUST be recorded rather than omitted

R4 requires that current known gaps be determinable. A gap left out of the documentation because it
is embarrassing is the failure mode this requirement targets: absent gaps read as no gaps.

## Additions this standard makes beyond the source

- R3's rationale — that universal decision records make records worthless — is this framework's.
- R4 is stated as the test for the standard rather than as a separate concern. The source presents
  §53 as its own topic; treating it as the acceptance criterion for §25 and §50 is this framework's
  structuring choice, recorded because it is why three source sections became one standard.
- R7 is not stated in the source, which requires only that gaps be determinable. Making the omission
  a named failure is this framework's.

## Relationship to other standards

[Standard 30](30-design-code-consistency.md) owns whether these artifacts agree with the
implementation. [Standard 28](28-platform-conventions-and-supported-environments.md) owns the
supported-environment declaration R4 asks for.
[Standard 34](34-project-policy-applicability-and-exceptions.md) owns the policy that answers
several of R4's questions mechanically.
[Standard 39](39-bootstrap-and-existing-ui-reconstruction.md) governs producing these artifacts for
a project that has none.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R5 | `design-integrity.artifact-freshness` | `document`, partial. Artifact presence is the detectable part. |
| R4, R7 | `evidence.surfaces-declared` | `structural`, full. Applies to process. |
| R6 | — | No rule in v1.0.0. Recorded as a requirement without mechanical support. |
