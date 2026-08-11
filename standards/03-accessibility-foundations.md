# Standard 3 — Accessibility Foundations

The structural accessibility properties of an interface: text alternatives, semantic structure,
accessible names, landmarks, contrast, zoom, and non-color state indication. This standard covers
what an interface must *be*; [Standard 4](04-keyboard-and-focus.md) covers what it must *do* under a
keyboard.

Source: §4 (Accessibility) of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. The project's declared
accessibility target (see [Standard 34](34-project-policy-applicability-and-exceptions.md)) selects
which external criteria the framework evaluates against; the requirements below hold at every target,
including the `framework-baseline` minimum.

**No requirement in this standard is satisfied by structural automation alone.** A conformance claim
against an external target is never produced by this framework —
[Standard 35](35-evidence-assurance-and-compliance-output.md) states what a clean result does and
does not mean.

## Requirements

### R1 — Meaningful non-text content MUST carry a text alternative

Every image, icon, chart, or media element conveying information MUST expose an equivalent text
alternative. Decorative content MUST be marked decorative rather than given an invented description.
Informed by [WCAG 2.2 SC 1.1.1 "Non-text Content" (A)].

An empty alternative on a decorative image is correct. A missing alternative is not the same thing,
and the framework treats them differently: the first is a declaration, the second is an absence.

### R2 — Structure MUST be conveyed semantically, not only visually

Headings, lists, tables, groups, and relationships MUST exist in the markup, not only in the visual
rendering. Informed by [WCAG 2.2 SC 1.3.1 "Info and Relationships" (A)].

Heading levels MUST descend without skipping within a document. A visual heading implemented as a
styled `div` is a violation of this requirement even when it looks correct.

### R3 — Every interactive element MUST have an accessible name

Buttons, links, form controls, and custom interactive elements MUST expose a name that describes
their purpose. Informed by [WCAG 2.2 SC 4.1.2 "Name, Role, Value" (A)].

Where a visible label exists, the accessible name MUST contain it. Informed by
[WCAG 2.2 SC 2.5.3 "Label in Name" (A)].

### R4 — Landmark structure SHOULD partition the page

A document SHOULD expose its major regions through landmarks so that a user can move between them
without traversing the whole page. Informed by [APG pattern "Landmarks"] and by
[WCAG 2.2 SC 2.4.1 "Bypass Blocks" (A)].

### R5 — Text MUST remain usable at increased zoom and text size

Content MUST remain readable and operable when text is enlarged and when the viewport is reduced,
without loss of content or functionality. Informed by [WCAG 2.2 SC 1.4.4 "Resize Text" (AA)] and
[WCAG 2.2 SC 1.4.10 "Reflow" (AA)].

### R6 — Contrast MUST meet the project's declared target

Text and meaningful non-text elements MUST meet the contrast thresholds of the project's declared
accessibility target. Informed by [WCAG 2.2 SC 1.4.3 "Contrast (Minimum)" (AA)] and
[WCAG 2.2 SC 1.4.11 "Non-text Contrast" (AA)].

Contrast is not computable from source text in v1.0.0 of this framework. The rule is typed
`browser-analysis` and reports `not-evaluated` until browser evidence exists. It is not scored as
passing.

### R7 — Critical state MUST NOT be conveyed by color alone

Where color communicates state — error, success, required, selected, disabled, unavailable — a
second channel MUST also carry it. Informed by [WCAG 2.2 SC 1.4.1 "Use of Color" (A)].

This requirement is a prohibition in the catalog; see
[Standard 29](29-design-integrity-prohibitions.md).

### R8 — Media MUST carry alternatives where applicable

Prerecorded audio and video MUST carry captions or an equivalent alternative where the project's
declared target requires it. Informed by [WCAG 2.2 SC 1.2.2 "Captions (Prerecorded)" (A)] and
[WCAG 2.2 SC 1.2.3 "Audio Description or Media Alternative (Prerecorded)" (A)].

## Additions this standard makes beyond the source

- The empty-versus-missing text alternative distinction in R1 is this framework's, not the source's.
  It exists because the two are indistinguishable to a naive detector and must not be.
- R6's second paragraph — that contrast is typed as browser-established and reports `not-evaluated`
  in v1.0.0 — is a scope declaration this framework makes, disclosed rather than hidden. The source
  requires contrast coverage; it does not say the first release cannot compute it.
- The external criteria cited above informed these requirements. **The requirement text is this
  framework's own**, and a citation never establishes that a project conforms to the cited criterion.
  [Standard 38](38-external-source-provenance.md) states this invariant and the mechanism that
  enforces it.

## Relationship to other standards

[Standard 4](04-keyboard-and-focus.md) owns keyboard operation and focus.
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) owns custom widgets and their
accessibility contracts. [Standard 9](09-color.md) owns the color system that R6 and R7 constrain.
[Standard 22](22-data-heavy-interfaces.md) applies R2 to tables and charts.
[Standard 29](29-design-integrity-prohibitions.md) owns the forbidden-level form of R7.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `accessibility.img-alt-text` | `code-analysis`, partial. Static detector in v1.0.0. |
| R2 | `accessibility.heading-structure`, `accessibility.table-semantics` | `code-analysis`, partial. Heading detector in v1.0.0. |
| R3 | `accessibility.accessible-names` | `browser-analysis`, partial. `not-evaluated` without browser evidence. |
| R4 | `accessibility.landmarks` | `code-analysis`, partial. |
| R5 | `accessibility.zoom-reflow` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R6 | `accessibility.contrast` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R7 | `accessibility.no-color-only-critical-state` | `manual-review`, none. Attestable. |
| R8 | `accessibility.media-alternatives` | `code-analysis`, partial. |
