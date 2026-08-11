# Standard 5 — Accessible Component Patterns and Custom Controls

Dialogs, menus, tabs, accordions, tooltips, comboboxes, and drag-and-drop: the interactive patterns
whose accessibility lives in behavior rather than markup. This standard also governs when a native
control may be replaced.

Source: §4 (Accessibility) and §30 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which implements interactive
components beyond plain form controls and links.

## Requirements

### R1 — A custom control MUST implement the accessibility contract of the control it replaces

Recreating a native control for appearance is permitted. Losing its keyboard behavior, its semantics,
its accessible name, or its platform expectations while doing so is not.

A project that implements a custom control MUST be able to state, for that control: its role, its
keyboard interaction, its states and how they are exposed, and its focus behavior. Where a published
authoring pattern exists for the control, that pattern is the natural reference — see
[APG pattern "Combobox"], [APG pattern "Dialog (Modal)"], [APG pattern "Tabs"],
[APG pattern "Disclosure (Show/Hide)"], and [APG pattern "Menu and Menubar"].

The published patterns are guidance, not conformance criteria. Following one is evidence that a
control's contract was considered; it is not by itself a pass, and a control implemented differently
is not by itself a failure.

### R2 — Roles and states MUST be valid

A `role` MUST be a defined role. State and property attributes MUST be used on elements that support
them, with defined values. Informed by [WCAG 2.2 SC 4.1.2 "Name, Role, Value" (A)].

Marking an interactive element hidden from assistive technology while leaving it focusable is invalid
usage and is reported under this requirement, not under
[Standard 29](29-design-integrity-prohibitions.md). Intent is not inferable from the markup, and one
finding satisfies exactly one rule identity.

### R3 — Modal dialogs MUST manage focus

An open modal MUST place focus inside itself, MUST confine focus while open, MUST return focus to a
sensible element on close, and MUST offer a keyboard dismissal. Informed by
[APG pattern "Dialog (Modal)"].

### R4 — Content shown on hover or focus MUST be dismissible, hoverable, and persistent

Tooltips and similar transient content MUST be dismissible without moving the pointer, MUST remain
visible while the pointer is over them, and MUST persist until dismissed or no longer valid. Informed
by [WCAG 2.2 SC 1.4.13 "Content on Hover or Focus" (AA)].

### R5 — Pointer-only interactions MUST have an alternative

Drag-and-drop, path-based gestures, and multipoint gestures MUST have a single-pointer alternative
unless the gesture is essential. Informed by [WCAG 2.2 SC 2.5.1 "Pointer Gestures" (A)] and
[WCAG 2.2 SC 2.5.7 "Dragging Movements" (AA)].

### R6 — Pointer targets MUST meet the declared target size

Interactive targets MUST meet the size threshold of the project's declared accessibility target,
subject to that criterion's own exceptions. Informed by
[WCAG 2.2 SC 2.5.8 "Target Size (Minimum)" (AA)].

### R7 — A replacement MUST be justified when it loses capability

Where a custom control cannot fully implement the contract of the native control it replaces, the
gap MUST be recorded as a design decision (see
[Standard 31](31-design-artifacts-and-documentation.md)) or as an explicit exception (see
[Standard 34](34-project-policy-applicability-and-exceptions.md)). It MUST NOT be silent.

## Additions this standard makes beyond the source

- R1's four-part statability test (role, keyboard interaction, states, focus behavior) is this
  framework's operationalization of the source's "accessibility contract is implemented". The source
  does not enumerate it.
- R2's second paragraph settles a detector-ownership question. The source does not address it; the
  decision is recorded here because ambiguity about which rule a finding satisfies is how one defect
  becomes two identities.
- The published authoring patterns are advisory. R1's third paragraph is this framework's statement
  of that, and it exists to prevent a guidance document from being read as a conformance requirement.

## Relationship to other standards

[Standard 4](04-keyboard-and-focus.md) owns the general keyboard and focus requirements this standard
specializes. [Standard 7](07-component-reuse-and-component-states.md) owns the reuse and state
documentation of these same components.
[Standard 29](29-design-integrity-prohibitions.md) owns the prohibition on inaccessible replacements.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R7 | `accessibility.no-inaccessible-custom-controls` | `code-analysis`, partial. Static detector in v1.0.0; findings are labeled INFERRED, and semantics supplied by a wrapper or a spread are invisible to it. |
| R2 | `accessibility.aria-valid-usage` | `code-analysis`, partial. Static detector in v1.0.0. |
| R3 | `accessibility.dialog-focus-management` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R4 | `accessibility.no-inaccessible-custom-controls` | `browser-analysis` aspect; `not-evaluated` in v1.0.0. |
| R5 | `accessibility.keyboard-operable` | `browser-analysis`, partial. |
| R6 | `accessibility.pointer-target-size` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
