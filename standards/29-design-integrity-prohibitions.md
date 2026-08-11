# Standard 29 — Design Integrity Prohibitions

The Must-Never layer. These are `forbidden`-level rules whose qualifiers already contain their
legitimate boundaries, which is why most of them are non-exemptible: there is no remaining case an
exception would need to cover.

Source: §31, §32, and §56 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

**A prohibition's qualifier is part of the prohibition.** Every requirement below contains a clause
bounding what it forbids, and reading a rule without its qualifier produces the over-broad reading
this standard is written to avoid.

**Most of these rules are non-exemptible.** A project policy MUST NOT make a non-exemptible rule
exemptible; see [Standard 34](34-project-policy-applicability-and-exceptions.md).

## Requirements

### R1 — Dark patterns MUST NOT be used

Design patterns intentionally manipulating users into actions they did not reasonably intend are
prohibited: disguised advertisements, confusing opt-out controls, intentionally asymmetric consent,
hidden recurring-cost disclosure, obstructive cancellation, confirmshaming, and misleading button
hierarchy.

**Ordinary persuasive design is not a dark pattern.** A prominent primary action, a recommended
default, a well-written benefit statement, and a reminder are all legitimate. The distinguishing
property is whether the design works by *impairing the user's ability to understand or act on their
own intent*. Where that is absent, persuasion is not manipulation.

### R2 — Fake success MUST NOT be shown

An interface MUST NOT report that an operation succeeded when it did not. This is the presentation
form of a rule EngineeringStandards owns for the capability layer; see
[Standard 2](02-boundary-with-engineering-standards.md).

### R3 — Fake measured progress MUST NOT be shown

An indicator MUST NOT represent unmeasured work as measured. An indeterminate spinner is honest; a
progress bar animating to 90% on a timer is not. See [Standard 16](16-interface-states.md) R3.

### R4 — Fake availability MUST NOT be shown

A feature MUST NOT be presented as available when it is not. Scarcity, urgency, and availability
claims MUST correspond to something real.

### R5 — Inert controls MUST NOT appear actionable without explanation

A control that looks actionable and does nothing MUST either be visibly non-actionable or explain
why it is unavailable. See [Standard 16](16-interface-states.md) R9.

### R6 — Fabricated data MUST NOT be presented as real

Placeholder content, seeded examples, and mock values MUST NOT reach production presented as the
user's real data. See [Standard 27](27-first-use-and-onboarding.md) R6.

### R7 — Destructive consequences MUST NOT be obscured

Wording, placement, or visual weight MUST NOT be used to make a destructive consequence harder to
notice. See [Standard 18](18-destructive-actions-error-prevention-and-recovery.md) R8.

### R8 — Tests MUST NOT be weakened to hide a visual or accessibility regression

Deleting, skipping, or loosening a test because it caught a regression is prohibited. Cross-references
the EngineeringStandards rule on not weakening standards; see
[Standard 40](40-detector-and-testing-integrity.md).

### R9 — Accessibility MUST NOT be deliberately disabled to simplify implementation

Turning off accessibility behavior because implementing it is inconvenient is prohibited. The
detectable form is viewport-level disabling — suppressing user scaling or capping maximum zoom below
a usable factor.

Generic invalid ARIA usage is **not** this rule. It belongs to
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) R2, because intent is not
inferable from the markup and one finding satisfies exactly one rule identity.

### R10 — Focus indicators MUST NOT be removed without an accessible replacement

Removing the default focus indicator is permitted only when an accessible replacement is provided.
See [Standard 4](04-keyboard-and-focus.md) R3.

### R11 — Critical state MUST NOT be conveyed solely by color

See [Standard 3](03-accessibility-foundations.md) R7 and [Standard 9](09-color.md) R3.

### R12 — Inaccessible custom controls MUST NOT replace functional native controls merely for appearance

See [Standard 5](05-accessible-component-patterns-and-custom-controls.md) R1. The qualifier is
"merely for appearance": a custom control with an implemented accessibility contract is permitted.

### R13 — Consent choices MUST NOT use deceptive patterns

See [Standard 25](25-privacy-ux.md) R1 and R2.

### R14 — Generated content MUST NOT be presented as verified human-authored fact where that distinction matters

See [Standard 26](26-ai-user-experience.md) R1.

### R15 — Design-system requirements MUST NOT be weakened merely because implementation is difficult

Difficulty is grounds for an exception with an owner, an approval, and a revisit trigger. It is not
grounds for lowering the requirement. See
[Standard 6](06-design-tokens-and-design-system-consistency.md) R7.

## Additions this standard makes beyond the source

- R1's second paragraph states an operational test for the persuasion/manipulation boundary —
  whether the design works by impairing understanding or action. The source requires precision here
  without supplying the test; this is this framework's, and it is the clause a reviewer will actually
  apply.
- R9's second paragraph settles detector ownership between this rule and generic ARIA validity. The
  source does not address it.
- R3's spinner-versus-timed-bar contrast is illustrative.

## Relationship to other standards

Every requirement here has an owning standard that states the positive requirement; this standard
states the prohibition and carries the `forbidden` rule identity. Prohibitions are the rules for
which [Standard 35](35-evidence-assurance-and-compliance-output.md)'s unestablished-prohibition
verdict cap exists: a forbidden rule that could not be evaluated caps the verdict at `NOT_EVALUATED`
rather than passing.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `design-integrity.no-dark-patterns` | `manual-review`, none. Non-exemptible. |
| R2 | `design-integrity.no-fake-success` | `browser-analysis`, partial. Non-exemptible. Cross-references EngineeringStandards. |
| R3 | `design-integrity.no-fake-progress` | `manual-review`, none. Non-exemptible. Attestable. Re-typed before v1.0.0 — ADR 0014. |
| R4 | `design-integrity.no-fake-availability` | `manual-review`, none. Non-exemptible. |
| R5 | `design-integrity.no-inert-controls` | `browser-analysis`, partial. Non-exemptible. |
| R6 | `design-integrity.no-fabricated-data` | `code-analysis`, partial. Non-exemptible. Static detector in v1.0.0. |
| R7 | `design-integrity.no-obscured-destruction` | `manual-review`, none. Non-exemptible. |
| R8 | `design-integrity.no-weakened-visual-evidence` | `manual-review`, none. Non-exemptible. Cross-references EngineeringStandards. |
| R9 | `accessibility.not-deliberately-disabled` | `code-analysis`, partial. Non-exemptible. Static detector in v1.0.0. |
| R10 | `accessibility.no-removed-focus-indicators` | `code-analysis`, partial. Non-exemptible. Static detector in v1.0.0. |
| R11 | `accessibility.no-color-only-critical-state` | `manual-review`, none. Non-exemptible. Attestable. |
| R12 | `accessibility.no-inaccessible-custom-controls` | `code-analysis`, partial. Non-exemptible. Static detector in v1.0.0. |
| R13 | `privacy.no-deceptive-consent` | `manual-review`, none. Non-exemptible. |
| R14 | `ai-ux.no-generated-as-verified` | `manual-review`, none. Non-exemptible. Cross-references EngineeringStandards. |
| R15 | `design-system.not-weakened-for-convenience` | `manual-review`, none. Non-exemptible. Cross-references EngineeringStandards. |
