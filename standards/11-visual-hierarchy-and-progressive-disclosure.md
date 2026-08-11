# Standard 11 — Visual Hierarchy and Progressive Disclosure

Hierarchy is what makes an interface scannable, and progressive disclosure is how complexity is
introduced without hiding what people need. Neither can be established by a machine, which is the
central fact about this standard.

Source: §11 and §35 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. Every requirement here is
manual-review or browser-established; none is statically detectable, and the framework reports them
`not-evaluated` rather than passing them when no review exists.

## Requirements

### R1 — Hierarchy MUST be communicated intentionally

Interfaces MUST use typography, spacing, grouping, alignment, contrast, containment, and progressive
disclosure to communicate what matters. The instruments are means; the requirement is that the
resulting hierarchy is deliberate.

### R2 — Visual decoration MUST NOT substitute for information architecture

Ornament that suggests structure the content does not have is a hierarchy failure. If the
architecture is wrong, styling cannot fix it.

### R3 — Not everything MAY be prominent

An interface in which every element competes for attention has no hierarchy. This is the most common
form of R1 failure and is called out separately because it usually results from accumulation rather
than from a decision.

### R4 — The primary action MUST be identifiable without relying solely on color

A user MUST be able to identify the primary action from position, size, weight, or label — not from
hue alone. Informed by [WCAG 2.2 SC 1.4.1 "Use of Color" (A)].

### R5 — Advanced options SHOULD be progressively disclosed

Complexity SHOULD be revealed when useful. Every advanced option MUST NOT be placed on the primary
surface by default.

### R6 — Frequently required actions MUST NOT be buried for visual simplicity

R5's inverse, and equally binding. Hiding something people need on every visit, to make a screenshot
look calm, is a usability failure disguised as restraint.

**Simplicity is measured by task comprehension, not element count.** A screen with fewer elements
that nobody can complete a task on is not simpler.

## Additions this standard makes beyond the source

- R3's observation that over-prominence usually results from accumulation rather than decision is
  explanatory, not a source requirement.
- R2's second sentence is this framework's phrasing of the source's prohibition.
- The scope statement — that every requirement here is unestablishable statically — is this
  framework's disclosure. It is stated at the top rather than in the table because a reader who
  misses it will misread a clean result.

## Relationship to other standards

[Standard 8](08-typography.md), [Standard 9](09-color.md), and
[Standard 10](10-spacing-and-layout.md) own the instruments R1 lists.
[Standard 20](20-content-design.md) owns label specificity, which R4 depends on.
[Standard 37](37-manual-design-review.md) owns the review mechanism that establishes this standard.
The assurance boundary that matters here — that a rendered artifact cannot establish whether
hierarchy is good — is stated in [Standard 36](36-browser-and-visual-evidence.md) R6 and enforced by
[Standard 35](35-evidence-assurance-and-compliance-output.md) R6.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3 | `visual.hierarchy-intentional` | `manual-review`, none. Attestable. |
| R4 | `visual.primary-action-identifiable` | `manual-review`, none. Attestable. |
| R5, R6 | `visual.hierarchy-intentional` | Same rule. Progressive disclosure is a hierarchy judgment, not a separate identity. |
