# Standard 8 — Typography

Readable text: sizing, line length, line height, hierarchy, truncation, and behavior under user font
scaling. Typography is where a design system's proportionality requirement bites first, because every
interface has text.

Source: §12 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — A typography scale SHOULD be defined and used

Font sizes, weights, and line heights SHOULD come from a defined scale rather than being chosen per
component. Where a scale exists, [Standard 6](06-design-tokens-and-design-system-consistency.md) R3
governs its use.

### R2 — Text MUST remain usable under zoom and user font scaling

Text MUST remain readable and its container MUST remain operable when the user enlarges text or
scales the interface. Informed by [WCAG 2.2 SC 1.4.4 "Resize Text" (AA)] and
[WCAG 2.2 SC 1.4.12 "Text Spacing" (AA)].

A layout that clips, overlaps, or hides content under user scaling fails this requirement even if it
renders correctly at the design's default size.

### R3 — Heading hierarchy MUST reflect document structure

Heading levels MUST describe the document's outline, not its visual weight. See
[Standard 3](03-accessibility-foundations.md) R2, which owns the mechanical form of this requirement.

### R4 — Line length and line height SHOULD support sustained reading

Long-form content SHOULD constrain measure and set line height for readability. This framework
prescribes no numeric threshold: the appropriate values depend on typeface, size, and audience, and a
universal number would be a fabricated precision.

### R5 — Meaningful content MUST NOT be truncated without a path to the whole value

Where a truncated value matters — an identifier, a file name, an error message, a user-entered
string — the complete value MUST remain reachable. Truncation for visual tidiness that destroys
access to the content is a violation.

Truncation of genuinely unimportant content is fine and this requirement does not touch it.

### R6 — Monospace and tabular usage SHOULD follow the content

Code, identifiers, and other character-significant content SHOULD use a monospace face. Numeric data
compared column-wise SHOULD use tabular figures. See
[Standard 22](22-data-heavy-interfaces.md) for the data-presentation requirements this supports.

## Additions this standard makes beyond the source

- R4's explicit refusal to name numeric thresholds is this framework's decision, disclosed because a
  reader may expect a standard to supply numbers. The source asks for line-length and line-height
  standards without specifying values.
- R5's qualifier — "where the complete value matters" — is the source's; the enumeration of what
  typically matters is this framework's.

## Relationship to other standards

[Standard 3](03-accessibility-foundations.md) owns heading semantics and the zoom requirement R2
specializes. [Standard 6](06-design-tokens-and-design-system-consistency.md) owns the scale R1 draws
on. [Standard 11](11-visual-hierarchy-and-progressive-disclosure.md) owns hierarchy as a design
property, of which typography is one instrument.
[Standard 20](20-content-design.md) owns what the text says.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `visual.typography-scale` | `configuration`, partial. |
| R2 | `accessibility.zoom-reflow` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R3 | `accessibility.heading-structure` | See [Standard 3](03-accessibility-foundations.md). |
| R4, R5, R6 | — | No rule in v1.0.0. R5 is a manual-review candidate recorded for a later release. |
