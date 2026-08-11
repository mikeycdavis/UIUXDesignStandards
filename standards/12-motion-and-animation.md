# Standard 12 — Motion and Animation

Motion must serve a purpose, and where meaningful motion exists a reduced-motion preference must be
honored. This is one of the few design-quality requirements with a genuine static signal.

Source: §15 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which implements animation or
transitions. A project with no motion is not applicable to R1 and R2, and this is reported as
`not-applicable` with the reason, not as a pass.

## Requirements

### R1 — Motion MUST have a purpose

Animation SHOULD explain a state transition, preserve spatial context, communicate hierarchy,
indicate progress, or provide interaction feedback. Motion added because it is impressive is not a
purpose.

### R2 — Reduced-motion preferences MUST be honored where meaningful motion exists

Where a project defines animation, it MUST respond to the user's reduced-motion preference. Informed
by [WCAG 2.2 SC 2.3.3 "Animation from Interactions" (AAA)].

The static detector for this is project-wide rather than per-declaration: a project that defines
keyframe animations and contains no reduced-motion query anywhere is reported. A project with both is
not reported — the detector cannot establish that every animation is covered, and it does not claim
to. This is a partial-assurance signal, and the requirement is stronger than the detector.

### R3 — Motion MUST NOT interfere with task completion

Animation MUST NOT delay a user's ability to act, obscure content they are reading, or require
waiting through a transition to reach a control.

### R4 — Motion likely to cause discomfort MUST be avoided

Large-area parallax, rapid scaling, and vestibular-triggering patterns MUST NOT be used where a
reduced-motion alternative is unavailable. Content MUST NOT flash above the threshold that induces
seizures. Informed by [WCAG 2.2 SC 2.3.1 "Three Flashes or Below Threshold" (A)].

### R5 — Automatically starting motion SHOULD be pausable

Motion that starts automatically, lasts more than a few seconds, and runs alongside other content
SHOULD be pausable, stoppable, or hideable. Informed by
[WCAG 2.2 SC 2.2.2 "Pause, Stop, Hide" (A)].

## Additions this standard makes beyond the source

- R2's second paragraph is a detector-scope disclosure, not a requirement. It is stated because a
  passing result here means less than a reader would assume, and
  [Standard 40](40-detector-and-testing-integrity.md) requires detectors to declare what they
  establish.
- The reduced-motion requirement is cited above at conformance level AAA, and this framework states
  it at `required` for projects with meaningful motion. That is a **strengthening** relative to the
  external criterion, recorded as such in the provenance artifact. External conformance level and
  this framework's enforcement level are independent axes; see
  [Standard 38](38-external-source-provenance.md).
- R4's enumeration of discomfort-inducing patterns is this framework's; the source states the
  requirement without examples.

## Relationship to other standards

[Standard 6](06-design-tokens-and-design-system-consistency.md) owns motion conventions as part of a
design system. [Standard 19](19-performance-as-ux.md) owns layout stability, which motion can
violate. [Standard 16](16-interface-states.md) owns loading indication, the most common purpose R1
admits.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `motion.purposeful` | `manual-review`, none. Attestable. |
| R2 | `motion.reduced-motion-support` | `code-analysis`, partial. Static detector in v1.0.0. |
| R3 | `motion.purposeful` | Same rule; the interference case is a review judgment. |
| R4, R5 | — | No rule in v1.0.0. Browser-analysis candidates recorded for a later release. |
