# Standard 28 — Platform Conventions and Supported Environments

What a project runs on, and whose conventions it follows there. This standard makes support an
explicit declaration rather than an implied claim of universal compatibility.

Source: §37 and §38 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — Supported environments MUST be declared

A project with a UI MUST declare what it supports rather than implying it supports everything.
Declarable in policy: platforms, browsers with minimum versions, mobile operating systems, device
classes, viewport ranges, and assistive-technology support targets.

A project declaring a non-`no-ui` applicability MUST declare at least one platform. That is a policy
validity condition; see [Standard 34](34-project-policy-applicability-and-exceptions.md).

### R2 — Unsupported environments MUST NOT influence compliance

An environment outside the declared support set MUST NOT contribute findings, and MUST NOT silently
improve a score by narrowing the denominator without a record. The declared set is visible in output
alongside the result, so a narrow declaration is visible as a narrow declaration rather than as a
strong result.

This is the requirement that keeps R1 honest. Without it, declaring support for one browser would be
the cheapest way to a clean result.

### R3 — Platform conventions MUST be respected where the project targets that platform

An interface targeting a platform SHOULD follow that platform's interaction conventions for
navigation, gestures, system controls, and standard affordances. The platform's own published
guidance is the natural reference — see [see: apple-hig] and [see: material-3].

Those documents are advisory guidance for their platforms. They are **not** requirements of this
framework, and a convention from one platform MUST NOT be applied to another. An iOS interaction
convention is not a requirement for a web application.

### R4 — Cross-platform consistency MUST NOT override platform expectation blindly

Shared product semantics MAY be consistent across platforms while interaction details remain
platform-native. Where the two conflict, the conflict MUST be a decision rather than an oversight,
and consequential decisions MUST be recorded; see
[Standard 31](31-design-artifacts-and-documentation.md).

### R5 — A multi-platform declaration MUST name more than one platform

A project declaring `multi-platform` applicability MUST declare at least two platforms. A policy
validity condition, not a compliance finding.

### R6 — Assistive-technology targets MUST NOT be read as conformance claims

Declaring a supported assistive technology states what the project tests against. It does not
establish that the interface works with it, and this framework never converts the declaration into
a result. See [Standard 35](35-evidence-assurance-and-compliance-output.md).

## Additions this standard makes beyond the source

- R2's second paragraph — that R2 is what keeps R1 honest — is this framework's rationale, and it
  names the abuse the requirement blocks.
- R3's second paragraph is this framework's. **This framework cites no requirement from any platform
  human-interface guidance in v1.0.0.** Both platform sources are recorded in
  `artifacts/external-standards-provenance.json` with a failed retrieval: their documentation is
  served from client-rendered applications and no citable content was obtainable. They may be
  pointed at and may not back a claim. See
  [Standard 38](38-external-source-provenance.md) and
  [ADR 0013](../artifacts/adr/0013-external-claims-in-prose-are-structured-citation-tokens.md).
- R6 is not in the source. It exists because an assistive-technology support declaration is the
  policy field most likely to be read as a conformance claim.

## Relationship to other standards

[Standard 13](13-responsive-and-adaptive-design.md) owns viewport-class behavior.
[Standard 34](34-project-policy-applicability-and-exceptions.md) owns the declaration mechanism and
its validity conditions. [Standard 35](35-evidence-assurance-and-compliance-output.md) owns the
denominator R2 constrains. [Standard 31](31-design-artifacts-and-documentation.md) owns the
decision records R4 requires.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R5 | — | Policy validation, exit 2. Not compliance rules. |
| R2 | `evidence.surfaces-declared` | `structural`, full. Applies to process, not to a UI class. |
| R3, R4 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | — | No rule. A constraint on how this framework reports. |
