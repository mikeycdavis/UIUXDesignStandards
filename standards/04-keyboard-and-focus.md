# Standard 4 — Keyboard and Focus

Keyboard operability, focus visibility, and focus order. These properties are established by
exercising an interface rather than by reading it, which is why they are a separate standard from
[Standard 3](03-accessibility-foundations.md) with a different evidence source.

Source: §4 (Accessibility) of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. Most requirements here are
browser-established; the framework reports them `not-evaluated` rather than passing them when browser
evidence is absent.

## Requirements

### R1 — All functionality MUST be operable by keyboard

Every interactive element MUST be reachable and operable using a keyboard alone, without requiring
specific timings for individual keystrokes. Informed by [WCAG 2.2 SC 2.1.1 "Keyboard" (A)].

### R2 — Keyboard focus MUST NOT become trapped

A user who can move focus into a component MUST be able to move it out again using the keyboard.
Informed by [WCAG 2.2 SC 2.1.2 "No Keyboard Trap" (A)].

Modal dialogs are the deliberate exception in shape only: a modal confines focus while it is open and
MUST release it on dismissal, and MUST provide a keyboard dismissal path. See
[Standard 5](05-accessible-component-patterns-and-custom-controls.md).

### R3 — The focused element MUST be visibly indicated

Keyboard focus MUST be visible on every focusable element. Informed by
[WCAG 2.2 SC 2.4.7 "Focus Visible" (AA)].

Removing the default focus indicator without providing an accessible replacement is prohibited; see
[Standard 29](29-design-integrity-prohibitions.md). The static detector for this reports on CSS that
removes an outline in a focus rule with no compensating declaration in the same file — a partial
signal, not a conformance determination.

### R4 — Focus order MUST be meaningful

The order in which focus moves MUST preserve meaning and operability. Informed by
[WCAG 2.2 SC 2.4.3 "Focus Order" (A)] and [WCAG 2.2 SC 1.3.2 "Meaningful Sequence" (A)].

Positive `tabindex` values MUST NOT be used. They impose a document-global order that no component
author can reason about locally, and they are the one focus-order defect this framework can detect
statically.

### R5 — The focused element SHOULD NOT be obscured

Sticky headers, floating toolbars, and cookie banners SHOULD NOT hide the element that has focus.
Informed by [WCAG 2.2 SC 2.4.11 "Focus Not Obscured (Minimum)" (AA)].

### R6 — Focus SHOULD move deliberately after a consequential change

When a dialog opens, a route changes, or content is replaced, focus SHOULD be placed where the user's
task continues. Focus MUST NOT be moved as an unrequested side effect of merely receiving focus or
entering data. Informed by [WCAG 2.2 SC 3.2.1 "On Focus" (A)] and
[WCAG 2.2 SC 3.2.2 "On Input" (A)].

## Additions this standard makes beyond the source

- R4's flat prohibition on positive `tabindex` is a strengthening. The external criterion requires a
  meaningful order; it does not name the mechanism. This framework prohibits the mechanism because
  it is statically detectable and because a positive value is almost never the cheapest way to
  achieve a meaningful order.
- R3's second paragraph describes a detector's limits rather than a requirement. It is stated here so
  that a reader is not misled by a passing result into thinking focus visibility was established.
- The external criteria cited above informed these requirements; the requirement text is this
  framework's own. See [Standard 38](38-external-source-provenance.md).

## Relationship to other standards

[Standard 3](03-accessibility-foundations.md) owns structural accessibility.
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) owns the per-pattern keyboard
contracts that R1 and R2 generalize.
[Standard 36](36-browser-and-visual-evidence.md) owns the evidence surface most of this standard
depends on. [Standard 29](29-design-integrity-prohibitions.md) owns the prohibition form of R3.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `accessibility.keyboard-operable` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R2 | `accessibility.dialog-focus-management` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R3 | `accessibility.focus-visible`, `accessibility.no-removed-focus-indicators` | The second is `code-analysis`, partial, with a static detector in v1.0.0. |
| R4 | `accessibility.focus-order`, `accessibility.positive-tabindex` | The second is `code-analysis`, partial, with a static detector in v1.0.0. |
| R5 | `accessibility.focus-order` | `browser-analysis`, partial. Covered by the same rule; the obscuring case needs rendering. |
| R6 | `accessibility.dialog-focus-management` | `browser-analysis`, partial. |
