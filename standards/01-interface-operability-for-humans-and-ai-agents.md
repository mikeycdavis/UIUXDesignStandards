# Standard 1 — Interface Operability for Humans and AI Agents

Interfaces are built and modified by humans and by AI agents, and the standards must hold for both.
This standard governs where that shared authorship changes what a good interface looks like — and,
just as importantly, where it does not.

Source: §2 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project with an applicable user interface. It governs the relationship between an
interface and the application capability beneath it, from the presentation side of that boundary
only. The capability layer itself belongs to EngineeringStandards; see
[Standard 2](02-boundary-with-engineering-standards.md).

This standard does **not** require that an agent be able to drive the UI. That is the confusion it
exists to prevent.

## Requirements

### R1 — Five concerns MUST stay distinguishable

A project MUST NOT collapse these into one another when reasoning about operability:

```text
application capabilities
user-interface interaction
design-time operations
accessibility semantics
agent-accessible application behavior
```

They fail differently and they are owned differently. "An agent can invoke the business capability"
and "an agent should click through the UI" are different claims, and the second is not implied by
the first. A project that reads a UI-automation requirement into this standard has misread it.

### R2 — A capability SHOULD NOT be reachable only through visual manipulation

Where an underlying application capability can reasonably be exposed structurally, the interface
SHOULD NOT be the only way to reach it.

The requirement is on the *system*, and the remedy usually lives outside the UI. The interface's
obligation here is narrow: it MUST NOT be the place where the capability is defined. A workflow
whose ordering exists only in component state, a permission enforced only by not rendering a button,
and a computation performed only in a view model are the signals this requirement exists to catch —
and each of them is a
[Standard 2](02-boundary-with-engineering-standards.md) boundary violation, cross-referenced rather
than redefined here.

### R3 — Accessibility semantics are not an agent-automation interface

Accessible names, roles, and structure MUST be provided because users need them, not because an
automation harness reads them. A project MUST NOT justify weakening accessibility semantics on the
grounds that agents reach the capability another way, and MUST NOT claim accessibility conformance on
the grounds that an automation harness can navigate the interface.

The two claims are independent. Conflating them lets either one launder the other.

### R4 — Design-time operations SHOULD be as inspectable as runtime ones

Tokens, component definitions, route declarations, and state inventories SHOULD live in files a
reader — human or agent — can inspect without running the application. This is what makes the rest
of this framework's static evidence surface possible at all; an interface whose design decisions
exist only inside a binary or a hosted design tool can be evaluated only by
[Standard 36](36-browser-and-visual-evidence.md) evidence and
[Standard 37](37-manual-design-review.md) review.

## Additions this standard makes beyond the source

Disclosed rather than presented as source text:

- R3's second sentence — that automation navigability does not establish accessibility conformance —
  is not stated in the source. It is the inverse of the confusion the source does name, and it is
  the direction this framework is most likely to be asked to accept.
- R4 is an inference from the source's structural-exposure preference, extended to design-time
  artifacts because the evidence model in [Standard 35](35-evidence-assurance-and-compliance-output.md)
  depends on it. The source does not state it.

## Relationship to other standards

[Standard 2](02-boundary-with-engineering-standards.md) owns the repository boundary this standard
sits on. [Standard 26](26-ai-user-experience.md) governs interfaces that *present* AI behavior to a
user, which is a different subject from interfaces *built by* AI agents.
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) owns the accessibility contract
R3 refers to.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | — | No rule. A conceptual distinction, enforced by how other rules are scoped. |
| R2 | cross-referenced to EngineeringStandards (see [Standard 2](02-boundary-with-engineering-standards.md)) | Not duplicated here by design. |
| R3 | `accessibility.no-inaccessible-custom-controls` | `code-analysis`, partial assurance. Static detector in v1.0.0. |
| R4 | — | No rule. Realized by the evidence-surface census in `audit`. |
