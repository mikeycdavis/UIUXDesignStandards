# Standard 9 — Color

Color as a semantic system rather than a palette: defined roles, tokenized values, no state carried
by color alone, and dark mode as a designed theme rather than an inversion.

Source: §13 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — Color SHOULD be defined by role

Where practical, colors SHOULD be named for what they mean rather than what they are. The source's
role vocabulary:

```text
background   surface     foreground   muted
primary      success     warning      danger
information  focus       interactive  disabled
```

A project is not required to define every role. It is required not to use `blue-500` as the name of
its danger color.

### R2 — Color values SHOULD be tokenized

Where a project has a token system, color literals SHOULD NOT appear in component code. See
[Standard 6](06-design-tokens-and-design-system-consistency.md) R3, which owns the mechanism and its
proportionality limit.

### R3 — State MUST NOT be encoded solely through color

Any state a user must perceive — error, success, required, selected, disabled, unavailable — MUST be
carried by at least one channel besides color. Informed by
[WCAG 2.2 SC 1.4.1 "Use of Color" (A)].

Where the state is *critical*, this is a prohibition rather than a requirement; see
[Standard 29](29-design-integrity-prohibitions.md).

### R4 — Contrast MUST meet the declared target

See [Standard 3](03-accessibility-foundations.md) R6, which owns this requirement and its evidence
type.

### R5 — Dark mode is OPTIONAL, and when it exists it MUST be designed

Dark mode MUST NOT be universally required. A product that does not need it does not fail this
standard for lacking it.

Where dark mode exists, it MUST be treated as a designed theme. A programmatic inversion of a light
theme is not a dark theme: it destroys elevation semantics, it inverts imagery that should not
invert, and it produces contrast relationships nobody chose. A project claiming dark-mode support
MUST have designed its color roles in both themes.

### R6 — Focus and interactive colors MUST survive theming

The focus indicator's color MUST remain visible in every supported theme. A focus style that meets
its contrast requirement in one theme and disappears in another is a defect in both.

## Additions this standard makes beyond the source

- R1's example of the failure mode — naming a danger color `blue-500` — is illustrative, not a source
  requirement.
- R5's second paragraph enumerates *why* inversion is not a theme. The source states the conclusion;
  the reasons are this framework's.
- R6 is not in the source. It is added because theme-conditional focus visibility is a real defect
  class that neither [Standard 4](04-keyboard-and-focus.md) nor R5 would catch on its own.

## Relationship to other standards

[Standard 3](03-accessibility-foundations.md) owns contrast and the accessibility form of R3.
[Standard 6](06-design-tokens-and-design-system-consistency.md) owns tokenization.
[Standard 4](04-keyboard-and-focus.md) owns focus visibility, which R6 extends across themes.
[Standard 29](29-design-integrity-prohibitions.md) owns the prohibition on color-only critical state.
[Standard 22](22-data-heavy-interfaces.md) applies R3 to charts.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `visual.color-roles-semantic` | `configuration`, partial. |
| R2 | `design-system.tokens-used` | See [Standard 6](06-design-tokens-and-design-system-consistency.md). |
| R3 | `accessibility.no-color-only-critical-state` | `manual-review`, none. Attestable. Forbidden, non-exemptible. |
| R4 | `accessibility.contrast` | See [Standard 3](03-accessibility-foundations.md). |
| R5 | `visual.dark-mode-designed` | `manual-review`, none. Applicable only when the project declares dark-mode support. |
| R6 | `accessibility.focus-visible` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
