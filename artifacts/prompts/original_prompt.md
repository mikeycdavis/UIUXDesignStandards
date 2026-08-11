# Build a Standalone UI/UX/Design Standards Framework

Create a new standalone repository named:

`UIUXDesignStandards`

This repository will be the canonical, versioned, machine-readable standards framework governing user interface, user experience, interaction design, visual design, accessibility, responsive behavior, design-system usage, and design implementation quality across my software projects.

It should follow the architectural philosophy and rigor of my existing EngineeringStandards framework, while remaining independently versioned and independently applicable.

Do not merely create a design-style guide.

Build an enforceable standards system that can answer:

* What UI/UX standards apply to this project?
* Which standards can be verified automatically?
* Which require visual or human review?
* Which do not apply?
* Which have explicit approved exceptions?
* What evidence supports each result?
* What parts of the interface were not evaluated?
* Can this project honestly claim its UI/UX implementation meets the standards?

The framework must distinguish evidence from inference and must never turn an inability to evaluate something into a pass.

---

# 1. Core architectural law

Use the same separation of concerns as the EngineeringStandards architecture:

> The catalog defines rule identity and metadata.
> The project policy defines project applicability.
> The evaluator produces evidence.
> None of the three may redefine the others.

There must be exactly one canonical identity for every enforceable rule.

Do not allow standards prose, project policy, evaluator code, CI configuration, or design tooling to invent alternative rule identities or meanings.

---

# 2. Human and AI operability

The standards must assume that both humans and AI agents will build and modify interfaces.

A UI should not be designed in a way that can only be manipulated through manual visual interaction when the underlying application capability can reasonably be exposed structurally.

However, distinguish:

* application capabilities;
* user-interface interaction;
* design-time operations;
* accessibility semantics;
* agent-accessible application behavior.

Do not confuse “AI can invoke the business capability” with “AI should click through the UI.”

EngineeringStandards remains authoritative for underlying agent-operable business capabilities.

UIUXDesignStandards governs how those capabilities are presented and interacted with through user interfaces.

---

# 3. Standards repository structure

Use a structure broadly compatible with:

```text
UIUXDesignStandards/
  README.md
  INSTRUCTIONS.md
  PROJECT.md
  VERSION
  CHANGELOG.md

  standards/
  rules/
  schemas/
  scripts/
  templates/
  test/
  docs/

  artifacts/
    adr/
    prompts/
    standards-source-inventory.json

  project-policy.yml
```

Maintain zero or near-zero unnecessary dependencies.

If adding a dependency, justify it explicitly in an ADR.

Local validation must be runnable identically in CI.

CI must call repository commands rather than reimplement standards logic.

---

# 4. Initial standards taxonomy

Design the initial standards corpus around the following domains.

Do not assume this list is exhaustive. Audit it for missing concerns before freezing v1.

## Accessibility

Cover at minimum:

* WCAG-aligned accessibility expectations
* semantic HTML
* accessible names
* keyboard operation
* keyboard focus visibility
* logical focus order
* screen-reader semantics
* headings and document structure
* landmarks
* form labels
* validation/error association
* accessible tables
* dialogs/modals
* menus
* tooltips
* tabs
* accordions
* drag-and-drop alternatives
* pointer target size
* zoom/text resizing
* contrast
* non-color indicators
* reduced-motion support
* media captions/transcripts where applicable

Do not claim complete WCAG compliance from structural automation alone.

Accessibility findings must state their assurance level.

---

## Design-system consistency

Require projects with a UI to define or adopt:

* design tokens
* typography scale
* spacing scale
* border/radius conventions
* color roles
* elevation/shadow conventions where applicable
* iconography rules
* component states
* responsive breakpoints
* motion conventions

Prefer reusable design-system primitives over repeated page-specific implementations.

Avoid unexplained magic values when a project design token exists.

Do not require a massive design system for tiny projects.

The sophistication of the system should be proportional to the product.

---

## Component reuse and consistency

Define standards around:

* reusable components
* consistent interaction patterns
* avoiding duplicate implementations
* component composition
* state ownership
* variant design
* accessibility behavior being centralized when appropriate

For example, projects should not independently implement five different modal patterns, button behaviors, form-field error states, or loading spinners without justification.

A shared component must not become an excuse for a giant abstraction that is harder to use than the repeated code it replaces.

---

## Responsive and adaptive design

Every supported UI must define behavior across relevant viewport classes.

Cover:

* mobile
* tablet where applicable
* desktop
* wide desktop where applicable
* orientation changes where applicable
* responsive navigation
* responsive tables/data presentation
* touch versus pointer interaction
* text wrapping
* long-content behavior
* image/media resizing
* overflow behavior

“No horizontal scrolling” should not be a universal prohibition because some content, such as large data grids or timelines, may legitimately require it.

Require intentional overflow behavior instead.

---

## Navigation and information architecture

Standards should cover:

* understandable navigation hierarchy
* current-location indication
* predictable navigation
* breadcrumbs where appropriate
* back behavior
* deep-linkability
* browser navigation where applicable
* route stability
* meaningful URLs
* preserving user context
* preventing accidental navigation loss
* unsaved-change behavior

Do not require breadcrumbs or complex navigation for interfaces where they add no value.

---

## Forms and data entry

Define standards for:

* labels
* required/optional indication
* help text
* sensible defaults
* input types
* validation timing
* validation messages
* field-level errors
* form-level errors
* preserving entered data after validation failure
* submission states
* preventing duplicate submissions
* destructive submissions
* autofill
* autocomplete
* password-manager compatibility
* keyboard usage
* date/time input
* numeric input
* file upload
* long-running submission

Error messages must explain what happened and what the user can do next.

Do not use generic “Something went wrong” as the only available error information when the application possesses a meaningful actionable error.

---

# 5. Every meaningful interface state must exist

A UI is not complete when only its happy path is designed.

For every meaningful asynchronous or data-driven surface, consider:

* initial state
* loading
* progressive loading where appropriate
* empty state
* partial data
* success
* validation error
* recoverable error
* unrecoverable error
* permission denied
* authentication required
* offline/degraded state where applicable
* stale data
* destructive confirmation
* disabled state
* read-only state

Do not require irrelevant states merely to satisfy a checklist.

Applicability must be explicit.

---

# 6. Loading behavior

Loading experiences should:

* communicate that work is occurring;
* avoid unnecessary layout shifts;
* avoid blocking unrelated interaction unnecessarily;
* use skeletons only when they improve comprehension;
* preserve existing data during refresh where appropriate;
* communicate long-running operations honestly;
* never display fake progress as measured progress.

Indeterminate progress and measured progress must be visually and semantically distinguishable.

---

# 7. Empty states

An empty state should explain, where relevant:

* why nothing is present;
* whether this is expected;
* how the user can create or obtain content;
* whether filters/search caused the empty result;
* what action is available next.

Differentiate:

* genuinely empty data;
* no search results;
* no filtered results;
* unavailable data;
* failed data retrieval.

Do not collapse them into the same visual state.

---

# 8. Error UX

User-facing error presentation must preserve the distinction between:

* validation failure;
* permission failure;
* authentication failure;
* dependency failure;
* network failure;
* server failure;
* unavailable feature;
* destructive-action denial;
* unknown/unclassified error.

Structured application errors should map to structured UX behavior.

The UI must not falsely report success when the underlying operation failed.

Never silently swallow a failure merely to keep an interface visually clean.

---

# 9. Feedback and system status

Users should receive appropriate feedback for meaningful actions.

Examples:

* saved
* submitted
* copied
* deleted
* queued
* processing
* failed
* retried
* completed

Avoid excessive toast notifications.

Use inline, persistent, modal, or transient feedback according to the importance and lifespan of the information.

A destructive action should not disappear into a transient toast if the user needs durable confirmation of what changed.

---

# 10. Destructive and high-impact UX

Destructive or high-impact actions should:

* clearly identify what will happen;
* distinguish reversible from irreversible changes;
* require confirmation when appropriate;
* avoid dangerous default focus;
* offer undo where genuinely reliable;
* explain cascading consequences;
* avoid dark patterns.

Confirmation dialogs must not become ceremony.

Do not ask users to confirm ordinary harmless actions.

---

# 11. Visual hierarchy

Interfaces should communicate hierarchy through intentional use of:

* typography
* spacing
* grouping
* alignment
* contrast
* containment
* progressive disclosure

Do not use visual decoration as a substitute for information architecture.

Do not make every element equally prominent.

Primary actions should be identifiable without relying solely on color.

---

# 12. Typography

Define standards for:

* readable font sizing
* line length
* line height
* heading hierarchy
* typography tokens
* truncation
* long-form content
* code/monospace usage
* numerical/tabular data where relevant

Text must remain usable at browser zoom and user-selected font scaling where applicable.

Avoid truncating meaningful content without a way to access the complete value when the complete value matters.

---

# 13. Color

Color use must be semantic and tokenized where practical.

Define roles such as:

* background
* surface
* foreground
* muted
* primary
* success
* warning
* danger
* information
* focus
* interactive
* disabled

Do not encode state solely through color.

Support dark mode when the product requires it, but do not make dark mode universally mandatory.

If dark mode exists, it must be treated as a designed theme, not as a color inversion.

---

# 14. Spacing and layout

Prefer an intentional spacing system.

Avoid arbitrary one-off spacing values without reason.

Require:

* predictable alignment
* readable density
* clear grouping
* consistent container behavior
* intentional whitespace
* responsive behavior

Do not turn spacing-token compliance into pixel policing.

Visual judgment still matters.

---

# 15. Motion and animation

Motion must have a purpose, such as:

* explaining state transition;
* preserving spatial context;
* communicating hierarchy;
* indicating progress;
* providing interaction feedback.

Do not add motion merely because it looks impressive.

Support reduced-motion preferences where meaningful motion exists.

Avoid motion patterns likely to cause discomfort or interfere with task completion.

---

# 16. Performance as UX

Treat perceived and actual performance as user-experience concerns.

Cover:

* initial rendering
* interaction latency
* layout stability
* large-list behavior
* image/media optimization
* unnecessary loading
* optimistic updates
* perceived progress
* client bundle impact where relevant

Do not prescribe universal millisecond thresholds without context.

Projects may define performance budgets.

Where budgets exist, they should be testable.

---

# 17. Content design

UI copy should be:

* understandable
* concise
* actionable
* consistent
* appropriate to the user's expertise
* specific when reporting errors or consequences

Avoid jargon unless users are expected to understand it.

Button text should normally describe the action rather than generic words such as:

* OK
* Yes
* Submit

when a more specific action is useful.

Do not require unnatural wording merely to satisfy a rule.

---

# 18. Localization and internationalization

Where applicable, design for:

* string expansion
* RTL
* date formats
* time formats
* numbers
* currencies
* units
* pluralization
* locale-aware sorting
* language switching

Do not concatenate translated string fragments in ways that assume English grammar.

Do not mark localization mandatory for projects whose declared scope does not require it.

---

# 19. Data-heavy interfaces

Create dedicated requirements for:

* tables
* grids
* charts
* dashboards
* filters
* sorting
* pagination
* virtualized lists
* dense analytics interfaces

Tables must have appropriate semantic structure.

Charts must not rely solely on color.

Important chart information should have an accessible textual or tabular equivalent where appropriate.

Loading, empty, error, filtered-empty, and partial states must remain distinguishable.

---

# 20. Search and filtering

Search/filter interfaces should define:

* when search executes
* clear/reset behavior
* active filters
* result counts where useful
* no-results behavior
* query persistence where appropriate
* keyboard interaction
* loading behavior
* stale-query behavior
* debouncing where relevant

Users should not have to guess why results disappeared.

---

# 21. Authentication and authorization UX

Cover:

* login
* logout
* session expiration
* reauthentication
* permission denied
* role restrictions
* account lockout
* MFA where applicable
* security-sensitive changes

Do not reveal sensitive authorization information unnecessarily.

Do not disguise permission failures as generic missing-content states when the distinction matters to the user.

---

# 22. Privacy UX

Where personal or sensitive information is involved, require intentional UX for:

* consent
* data collection
* deletion
* retention
* sharing
* export
* permissions
* sensitive-field display
* masking

Avoid dark patterns designed to manipulate consent.

Do not bury consequential privacy choices behind intentionally confusing wording.

---

# 23. AI user experience

Define a dedicated AI UX standard.

Cover at minimum:

* clearly distinguishing generated content when material;
* confidence/uncertainty where appropriate;
* proposal versus execution;
* human approval for consequential AI actions;
* showing what an AI action will change;
* diffable proposed changes;
* recoverability;
* hallucination-sensitive interfaces;
* source/evidence presentation;
* AI loading states;
* cancellation;
* retries;
* partial responses;
* unavailable providers;
* model/tool failures;
* agent activity history where useful.

Do not anthropomorphize the system in ways that misrepresent its capabilities.

Do not imply an AI action happened when it was merely proposed.

Do not represent generated inference as established fact.

Where AI is operating application capabilities, integrate with the underlying EngineeringStandards actor/audit model rather than inventing a second attribution system.

---

# 24. Design/code consistency

Documentation, mockups, screenshots, prototypes, Storybook examples, design specifications, and production code must not materially contradict one another without the discrepancy being explicit.

Treat design documentation freshness as correctness.

A screenshot showing an old interface is wrong documentation when presented as current.

Do not require every historical design artifact to be updated.

Historical artifacts should be clearly identifiable as historical.

---

# 25. Design artifacts

Define canonical locations for durable design artifacts.

Consider:

```text
docs/design/
artifacts/design/
artifacts/adr/
```

Projects should record consequential design decisions.

Examples:

* navigation architecture
* mobile strategy
* design-system adoption
* accessibility tradeoffs
* unusual interaction patterns
* data-visualization strategy
* intentionally unsupported viewport classes

Avoid requiring an ADR for ordinary cosmetic decisions.

---

# 26. Visual regression evidence

Where practical, projects should support visual-regression evidence for high-value interfaces.

Possible mechanisms:

* screenshot testing
* Storybook/Chromatic-like workflows
* browser automation
* component snapshots where appropriate

Do not treat screenshot equality as proof of good UX.

Visual regression answers:

> Did the interface visibly change?

It does not answer:

> Is the interface good?

Those are separate assurance claims.

---

# 27. Component states documentation

Reusable interactive components should define their supported states.

For example:

```text
Button
- default
- hover
- focus-visible
- active
- disabled
- loading

TextField
- empty
- populated
- focused
- disabled
- read-only
- validation-error
- success where applicable
```

Do not force irrelevant states onto components.

---

# 28. Design tokens as contracts

Treat public design tokens like API contracts.

Breaking token changes can affect large interface surfaces.

Version consequential changes appropriately.

Do not let individual features redefine canonical tokens locally while still claiming to use the design system.

---

# 29. No UI-only business logic

UIUXDesignStandards should cross-reference EngineeringStandards rather than redefining this rule:

> Business logic must not exist only inside the UI when it belongs to an underlying application capability.

The UI may own presentation logic and interaction-state logic.

It should not become the only implementation of consequential domain behavior.

---

# 30. No inaccessible custom controls without justification

Do not recreate native controls merely for appearance when doing so loses:

* keyboard behavior
* semantics
* accessibility
* platform expectations

Custom controls are allowed when their behavior is intentional and their accessibility contract is implemented.

---

# 31. No dark patterns

Create a Must-Never rule prohibiting intentional design patterns that manipulate users into actions they did not reasonably intend.

Examples may include:

* disguised advertisements
* confusing opt-out controls
* intentionally asymmetric consent
* hidden recurring-cost disclosure
* obstructive cancellation
* confirmshaming
* misleading button hierarchy

Be precise enough that ordinary persuasive design is not automatically classified as a violation.

---

# 32. No fake interface states

Create Must-Never rules around:

* fake progress
* fake success
* fake availability
* fake scarcity where applicable
* buttons that visually appear actionable but are intentionally inert without explanation
* fabricated data presented as real data
* placeholder content reaching production while appearing real

Use existing EngineeringStandards rules where they already own the underlying honesty requirement.

Do not duplicate rule identities across standards repositories.

---

# 33. Error prevention

Prefer preventing predictable errors over merely reporting them afterwards.

Examples:

* disable actions only when the reason remains understandable;
* constrain invalid input where appropriate;
* warn before destructive behavior;
* make requirements visible before submission.

Do not over-constrain user input when flexibility is legitimate.

---

# 34. Undo and recovery

Where operations are meaningfully reversible, consider providing recovery.

Examples:

* undo deletion
* restore archived content
* recover drafts
* preserve form state
* retry failed uploads

Do not claim something is reversible unless recovery is actually reliable.

---

# 35. Progressive disclosure

Complexity should be revealed when useful.

Do not put every advanced option on the primary surface.

But do not bury frequently required actions merely to create visual simplicity.

Measure simplicity by task comprehension, not element count.

---

# 36. First-use and onboarding UX

Where onboarding exists, govern:

* first-use state
* permissions
* setup progress
* optional versus required setup
* skip/resume behavior
* sample data
* tours
* contextual help

Do not force onboarding tours when users can understand the interface without them.

---

# 37. Platform conventions

Respect relevant platform conventions for:

* web
* iOS
* Android
* desktop
* responsive web

Cross-platform consistency must not override important platform expectations blindly.

Shared product semantics may be consistent while interaction details remain platform-native.

---

# 38. Browser and device support

Projects with UIs should explicitly declare supported environments rather than implicitly claiming universal compatibility.

A project policy may define:

* browsers
* minimum versions
* mobile operating systems
* device classes
* viewport ranges
* assistive-technology support targets

Unsupported environments should not silently influence compliance scores.

---

# 39. Design review evidence

Some rules cannot honestly be automated.

Support a manual design-review / attestation model for areas such as:

* visual hierarchy
* content clarity
* interaction comprehensibility
* dark-pattern review
* appropriate progressive disclosure
* overall information architecture

Reuse the EngineeringStandards provenance philosophy:

* reviewer
* date
* evidence reviewed
* reviewed revision
* deterministic freshness where possible
* explicit unavailable/stale/unverifiable states

Do not invent a second incompatible attestation model if a shared provenance schema can be extracted safely.

---

# 40. Automated validation

Build a `standards audit` and authoritative `standards validate` equivalent.

Potential automated evidence includes:

* semantic HTML checks
* accessibility-tree analysis
* ARIA misuse
* missing labels
* heading structure
* contrast where computable
* token usage
* component duplication signals
* responsive overflow
* missing loading/error/empty states where detectable
* UI-route documentation discrepancies
* design-token drift
* missing alt text
* focusability issues
* invalid HTML
* unsupported custom controls
* viewport tests
* visual-regression evidence
* Storybook/component coverage where used

Never claim more than the detector establishes.

Use validation types such as:

```text
structural
code-analysis
browser-analysis
visual-analysis
manual-review
not-evaluated
```

and assurance levels analogous to the EngineeringStandards system.

---

# 41. Browser-based evaluation

Because many UX properties cannot be established from source code alone, design a browser evaluation layer.

It should eventually be capable of exercising:

* desktop viewport
* mobile viewport
* keyboard-only navigation
* focus order
* modal focus trapping
* zoom
* reduced motion
* empty states
* loading states
* error states
* responsive navigation
* overflow
* touch-target sizing
* accessible names

Do not make the initial version depend on a huge browser automation stack unless justified.

Document which checks require browser execution and therefore remain `NOT_EVALUATED` when browser evidence is unavailable.

---

# 42. Visual review

Automated visual tooling must not be treated as a replacement for design judgment.

A screenshot can establish:

* what rendered;
* whether something changed;
* whether content overlaps;
* whether expected UI is visible.

It generally cannot establish by itself:

* whether hierarchy is good;
* whether the workflow is intuitive;
* whether language is understandable;
* whether the design manipulates the user.

Preserve this assurance boundary mechanically where possible.

---

# 43. Project policy

Create a machine-readable project policy similar in spirit to EngineeringStandards.

It should declare:

* standards version
* project identity
* whether a UI exists
* application types
* supported platforms
* supported viewport classes
* applicability
* exceptions
* attestations
* accessibility targets
* localization expectations
* design-system strategy
* browser/device support

A project must not redefine rule semantics through policy.

Unknown policy properties should fail validation rather than be silently ignored.

---

# 44. Applicability

Not every project has a UI.

Support explicit applicability classes such as:

```text
no-ui
web-ui
mobile-ui
desktop-ui
embedded-ui
multi-platform
```

Do not force UI rules onto:

* libraries
* backend services
* CLI tools
* infrastructure repositories

unless those projects actually expose an applicable interface.

A CLI may eventually have its own interaction-design rules, but do not pretend web UI standards apply to it.

---

# 45. Exceptions

Use explicit exceptions rather than silent rule weakening.

Exceptions should include:

* rule
* reason
* owner
* approval
* expiration/revisit trigger
* evidence

Rules may declare themselves non-exemptible where the prohibition's qualifier already contains its legitimate boundaries.

Do not allow project policy to make a non-exemptible rule exemptible.

---

# 46. Rule catalog

Create stable machine-readable rule IDs.

Use domain prefixes such as:

```text
accessibility.*
interaction.*
responsive.*
navigation.*
forms.*
content.*
design-system.*
visual.*
motion.*
performance.*
privacy.*
ai-ux.*
design-integrity.*
```

Do not create an ambiguous catch-all prefix such as:

```text
ui.*
```

when a more specific domain owns the rule.

Catalog entries should include:

* id
* owning standard
* title
* description
* rationale
* remediation
* level
* severity
* validationType
* assurance
* nonExemptible
* introducedIn
* aliases
* lifecycle metadata

---

# 47. Compliance output

Output must distinguish:

* passed
* failed
* warning
* skipped
* not applicable
* not evaluated
* manually reviewed
* excepted
* evidence unavailable

A project must never receive a stronger verdict because a check could not run.

Coverage and compliance are separate.

Example:

```json
{
  "status": "COMPLIANT",
  "score": 100,
  "assurance": {
    "automated": 18,
    "browserAnalysis": 12,
    "visualReview": 5,
    "manualReview": 7,
    "notEvaluated": 9
  }
}
```

A high score must never conceal low assurance.

---

# 48. UI completion / Definition of Done

A UI feature must not be considered complete solely because its happy path renders.

Where applicable, completion includes:

* required functional behavior
* loading state
* empty state
* error state
* validation
* keyboard operation
* responsive behavior
* accessibility semantics
* supported theme behavior
* appropriate analytics/audit integration
* documentation
* tests
* visual review
* acceptance criteria
* verification

Do not require irrelevant states mechanically.

Applicability should drive the checklist.

---

# 49. Design/code discrepancy detection

Where durable design artifacts exist, the framework should be able to identify likely disagreement between:

* design tokens and implementation
* documented component variants and actual variants
* screenshots and current UI
* documented routes and current routes
* prototypes and shipped workflows
* accessibility claims and implementation
* responsive claims and tested viewport behavior

Do not silently declare one side authoritative unless the project explicitly says which artifact is canonical.

---

# 50. Documentation

Require documentation appropriate to the project.

Potential artifacts:

```text
docs/design-system.md
docs/accessibility.md
docs/information-architecture.md
docs/design-decisions.md
docs/browser-support.md
docs/responsive-strategy.md
```

Do not require every project to create every document.

`/codebase-docs`-style tooling may eventually generate UI architecture documentation, but generated documentation must be checked against implementation evidence.

---

# 51. Bootstrap

Provide an `init` command.

It should identify:

* whether the project has a UI;
* likely UI technologies;
* likely design system;
* existing accessibility tooling;
* existing design artifacts;
* Storybook or equivalent;
* browser automation;
* viewport support;
* existing project policy.

It must distinguish:

* greenfield
* existing configured project
* existing project needing UI/UX reconstruction

Do not fabricate design history.

Tool-generated scaffolding is not evidence of pre-existing design intent.

---

# 52. Existing-project UI reconstruction

If a pre-existing interface has no trustworthy design source, reconstruct an evidence-based UI baseline.

Inspect:

* implemented screens
* routes
* components
* tokens
* styles
* assets
* responsive behavior
* accessibility semantics
* screenshots
* Storybook
* tests
* design files if present
* documentation
* Git history where available

Label claims:

```text
OBSERVED
INFERRED
CONFIRMED_BY_OWNER
UNKNOWN
```

Never say:

> “The original design intended…”

unless there is actual historical evidence.

Use the EngineeringStandards reconstruction epistemic rules rather than inventing an incompatible taxonomy.

---

# 53. Fresh-agent usability

A fresh human or agent with repository access and no previous chat history should be able to determine:

* what UI exists;
* what design system is used;
* supported platforms;
* accessibility targets;
* relevant UX constraints;
* current known design gaps;
* how to run validation;
* what requires human review;
* what artifacts are canonical.

If the project requires tribal knowledge to understand its interface standards, documentation is incomplete.

---

# 54. Enforcement

Eventually support:

```text
uiux-standards audit .
uiux-standards validate .
uiux-standards init .
```

`validate` is authoritative for gating.

CI should call local commands rather than reimplementing standards.

Projects should eventually pin an immutable released standards version.

Do not claim enforcement exists before it actually does.

---

# 55. Integration with EngineeringStandards

Design explicit boundaries between repositories.

EngineeringStandards owns:

* application capabilities
* auditability
* security architecture
* AI provider neutrality
* structured errors
* API/tool contracts
* implementation verification
* source-control integrity
* general engineering quality

UIUXDesignStandards owns:

* presentation
* interaction
* usability
* accessibility
* responsive behavior
* design-system consistency
* interface states
* content design
* visual design
* design/code consistency

Where a concern crosses the boundary, reference the owning standard rather than copying it.

Examples:

```text
UI error presentation
→ UIUXDesignStandards

structured application error contract
→ EngineeringStandards

AI proposal/execution UX
→ UIUXDesignStandards presentation
+
EngineeringStandards authorization/auditability

no UI-only business logic
→ EngineeringStandards owns the domain rule
→ UIUXDesignStandards cross-references it
```

---

# 56. Must-Never design rules

Create a focused Must-Never layer analogous to the EngineeringStandards forbidden-level rules.

Candidate prohibitions:

* accessibility must not be deliberately disabled to simplify implementation;
* tests must not be weakened merely to hide a visual/accessibility regression;
* fake success must not be shown;
* fake measured progress must not be shown;
* destructive consequences must not be intentionally obscured;
* privacy or consent choices must not use deceptive patterns;
* generated content must not be presented as verified human-authored fact where that distinction matters;
* critical state must not be conveyed solely through color;
* focus indicators must not be deliberately removed without an accessible replacement;
* inaccessible custom controls must not replace functional native controls merely for appearance;
* design-system requirements must not be weakened merely because implementation is difficult.

Use `forbidden` level where appropriate.

Internal qualifiers should determine `nonExemptible` status.

---

# 57. Testing strategy

Build known-positive and known-negative fixtures.

Known-negative fixtures are particularly important because visual/design tooling has a high false-green risk.

Mutation-test detectors.

Examples:

* remove label → accessibility detector must fail
* hide focus outline → detector/browser test must fail where supported
* introduce low contrast → contrast check fails
* create overflow → responsive test fails
* replace token with arbitrary value → token detector fails
* show success after a failed operation → UX/state test fails
* duplicate component implementation → consistency detector fails

A check that cannot fail against the defect it claims to detect proves nothing.

---

# 58. Use/mention discipline

Adopt an equivalent of EngineeringStandards' use/mention distinction.

A design detector must distinguish:

* UI implementation
* comments
* documentation
* test fixtures
* examples
* design tokens
* generated artifacts

Documentation saying:

> “Do not remove focus indicators”

must not itself trigger a detector looking for removed focus indicators.

Tests containing intentionally invalid markup must not automatically become production findings.

Each detector should declare the source surface it evaluates and why.

---

# 59. Evidence-surface integrity

A clean UI/UX audit must state what was actually evaluated.

Examples:

* source code read
* routes discovered
* Storybook available/unavailable
* browser run completed/failed
* viewports tested
* accessibility tree obtained/not obtained
* screenshots captured/not captured
* design artifacts found/not found

An unavailable browser, failed route, inaccessible Storybook, missing credentials, or unsupported environment must become evidence unavailability—not a pass.

---

# 60. Definition of Done for this standards repository

Do not declare the framework complete merely because Markdown files exist.

Completion requires, at minimum:

* canonical numbered standards
* rule catalog
* JSON Schema
* project policy
* policy validation
* `audit`
* authoritative `validate`
* deterministic exit codes
* automated tests
* known-negative fixtures
* CI
* documentation
* INSTRUCTIONS.md
* PROJECT.md
* adoption workflow
* exceptions
* applicability
* evidence/assurance model
* manual-review model
* versioning
* CHANGELOG
* dogfooding against this repository
* no unrecorded gaps in required release criteria

Every claimed completion must have observable evidence.

---

# 61. Development process

Use repository artifacts as the source of truth, not chat history.

Always use the existing planning workflow:

* `/plan-structure`
* `/plan-handoff`

Every top-level plan section must have its own ordered Markdown file under:

`artifacts/project-plan-breakdown/`

Every plan item needs:

* status
* purpose
* deliverables
* acceptance criteria
* verification
* dependencies

Never silently change scope.

Record consequential decisions in:

`artifacts/adr/`

Run the relevant verification after each milestone.

Known failure classes discovered during development must become mechanical tests where reasonable.

---

# 62. Initial research phase

Before writing the final standards corpus, audit current authoritative or widely adopted design/accessibility guidance and document provenance.

Potential source domains to evaluate include:

* WCAG / W3C guidance
* ARIA Authoring Practices
* platform accessibility guidance
* established web accessibility practices
* major platform human-interface guidance
* common usability heuristics

Do not copy external standards wholesale.

Distinguish:

* directly adopted external requirements
* project-authored interpretations
* project-authored strengthening
* recommendations

Record the source and normative strength.

Do not claim a rule is required by WCAG or another external authority unless that is actually supported by the source.

---

# 63. Deliverables

Build the repository end-to-end.

At minimum deliver:

1. initial source/provenance artifact;
2. numbered standards documents;
3. canonical rule catalog;
4. project-policy schema;
5. example/template policy;
6. audit CLI;
7. validate CLI;
8. init/bootstrap flow;
9. test fixtures;
10. known-negative tests;
11. CI workflow;
12. README;
13. INSTRUCTIONS.md;
14. PROJECT.md;
15. architecture documentation;
16. ADRs for consequential framework decisions;
17. CHANGELOG;
18. VERSION;
19. dogfooding policy for this repository;
20. release-readiness report.

Do not publish or tag a release merely because implementation exists.

First prove the release criteria mechanically and surface all remaining gaps.

---

# 64. Final philosophy

This framework should make good UI/UX behavior the default engineering path rather than relying on developers to remember a checklist.

It must be:

* evidence-based;
* auditable;
* machine-readable where practical;
* honest about what automation can and cannot establish;
* usable by humans and AI agents;
* strict against false greens;
* adaptable to different types of products;
* resistant to standards drift;
* explicit about applicability;
* explicit about uncertainty.

A clean validation result must never mean:

> “The tool didn't notice anything.”

It should mean:

> “For the standards and evidence surfaces this project declared and the framework could actually evaluate, the recorded evidence supports this result — and everything not evaluated remains visible.”

Before implementation, produce the complete project plan and decompose it using `/plan-structure` and `/plan-handoff`.

Then build the framework milestone by milestone, running all relevant gates after each phase and recording any new failure class as a test or explicit unresolved gap.
