# Enforcement architecture (second fold-in prompt)

Reproduced verbatim from the repository owner, 2026-08-10. This document is a source artifact:
it is never edited to match the implementation. Where the implementation departs from it, the
departure is recorded in an ADR and in `artifacts/prompts/owner-decisions.md`, not by rewriting
this file.

Standards 33–37 draw their requirements from this source. See
`artifacts/standards-source-inventory.json`.

---

Use the same enforcement pattern as EngineeringStandards, but add one extra layer: **UI applicability must itself be established**, because not every engineering repo has a UI.

The target architecture should be:

```text
UIUXDesignStandards
        │
        ├── immutable released version
        ├── validate
        ├── browser/visual checks
        └── manual-review rules
                │
                ▼
       project-policy.yml
                │
                ▼
       required CI check
                │
                ▼
       protected default branch
                │
                ▼
   organization adoption controller
```

The important part is that there are really **two gates**.

First:

```text
Does this project have an applicable UI?
```

Then, only if yes:

```text
Does the applicable UI satisfy UIUXDesignStandards?
```

I would not let repositories simply self-declare `no-ui` without evidence.

A backend service with no frontend is legitimately not applicable. A React app claiming `no-ui` because the UI standards are inconvenient is an adoption failure.

So the organization layer should determine something like:

```text
UI_APPLICABILITY
APPLICABLE
NOT_APPLICABLE
INDETERMINATE
```

Evidence might include:

* frontend frameworks/dependencies;
* routes/pages/screens;
* HTML/templates/components;
* mobile project files;
* Storybook;
* CSS/design-token systems;
* browser tests;
* build targets.

But again: absence of those signals is not automatically proof of `NOT_APPLICABLE`.

If the discovery mechanism cannot establish the answer, use `INDETERMINATE`.

That follows the same validated-search principle you already established elsewhere.

## Every applicable project gets a policy

For a web application, for example:

```yaml
standardVersion: 1.0.0
ui:
  applicability: web-ui
  platforms:
    - web
  viewportClasses:
    - mobile
    - desktop
  accessibility:
    target: WCAG-2.2-AA
  localization:
    required: false
  designSystem:
    strategy: local
rules:
  ...
```

The project policy declares applicability and project-specific scope.

It does **not** redefine what a rule means.

## Make validation mandatory in CI

Every applicable repository gets one centrally maintained reusable workflow.

Something conceptually like:

```yaml
jobs:
  uiux-standards:
    uses: your-org/UIUXDesignStandards/.github/workflows/validate.yml@<immutable-ref>
```

That workflow should run:

```text
uiux-standards validate .
```

and whatever supporting evidence is required:

```text
static analysis
browser analysis
accessibility checks
responsive checks
visual checks
manual-attestation freshness
```

The project itself should not reproduce those rules in YAML.

Central implementation, distributed invocation.

## Then make the check required

This is where adherence becomes enforcement instead of guidance.

For repositories classified as UI-applicable:

```text
pull request
    ↓
UIUXDesignStandards gate
    ↓
PASS ────────────────→ merge eligible
FAIL ────────────────→ blocked
required evidence
unavailable ─────────→ NOT_EVALUATED / blocked where establishment is mandatory
```

The default branch should require that check.

Direct pushes should be restricted.

Administrative bypass should be exceptional and auditable.

A committed workflow file is **not** proof that enforcement exists.

You also have to establish, through the Git hosting platform:

* the workflow actually runs;
* the check is configured as required;
* branch protection/rulesets actually apply;
* bypass permissions are understood;
* required-check configuration has not been removed.

That evidence lives outside the repository.

## Build a UI standards adoption controller

This is the portfolio enforcement layer.

It should inventory every engineering project and answer:

| Question                              | Example      |
| ------------------------------------- | ------------ |
| Does this repo appear to expose a UI? | yes          |
| Has applicability been established?   | `APPLICABLE` |
| Which standards version governs it?   | `1.0.0`      |
| Does policy exist?                    | yes          |
| Is the standards version valid?       | yes          |
| Does the authoritative gate run?      | yes          |
| Is the gate actually required?        | yes          |
| Latest verdict?                       | `COMPLIANT`  |
| Browser evidence available?           | yes          |
| Manual reviews fresh?                 | 6/6          |
| Exceptions?                           | 1            |
| Evidence gaps?                        | none         |

Its repository-level governance states should be something like:

```text
GOVERNED
UNGOVERNED
INDETERMINATE
NOT_APPLICABLE
```

For example:

```text
Frontend A
UI applicable: yes
Gate installed: yes
Gate required: yes
Latest verdict: COMPLIANT
→ GOVERNED
```

versus:

```text
Frontend B
UI applicable: yes
Gate installed: no
→ UNGOVERNED
```

versus:

```text
Frontend C
Host API unavailable
Cannot establish required-check configuration
→ INDETERMINATE
```

Never:

```text
API call failed
→ assume required
→ GOVERNED
```

or:

```text
API call failed
→ assume missing
→ UNGOVERNED
```

Both manufacture evidence.

## UI enforcement needs multiple evidence layers

This is the biggest difference from ordinary engineering standards.

Source analysis alone cannot establish UI/UX compliance.

You need at least four assurance surfaces.

### Static/source evidence

Can establish things like:

* semantic markup patterns;
* missing accessible labels;
* token usage;
* prohibited CSS patterns;
* component duplication;
* missing states in known component contracts;
* route/design documentation mismatch.

### Browser evidence

Can establish things like:

* keyboard operation;
* focus behavior;
* responsive overflow;
* rendered accessible names;
* viewport behavior;
* modal focus trapping;
* zoom behavior;
* reduced-motion behavior;
* actual contrast;
* runtime state rendering.

### Visual evidence

Can help establish:

* overlap/clipping;
* unexpected visual change;
* obvious hierarchy/layout defects;
* responsive rendering.

But visual automation should not claim:

```text
screenshot passed
→ UX is good
```

### Human design review

Still needed for things such as:

* comprehensibility;
* information architecture;
* hierarchy;
* wording quality;
* dark patterns;
* progressive disclosure;
* interaction appropriateness.

Those should use explicit attestations.

## Manual review must participate in gating honestly

Suppose this rule applies:

```text
interaction.no-deceptive-patterns
validationType: manual-review
level: forbidden
```

Then:

```text
fresh approved attestation
→ established
rejected attestation
→ NON_COMPLIANT
no review
→ unestablished
freshness unavailable
→ unestablished
legacy/unverifiable review
→ unestablished
```

Do not convert "we haven't established it" into pass.

That matters enormously for UI/UX because a large percentage of the highest-value rules are judgment-based.

## Have projects declare supported surfaces

Otherwise testing becomes ambiguous.

For example:

```yaml
ui:
  platforms:
    - web
  browsers:
    - chromium
    - firefox
    - webkit
  viewports:
    mobile:
      width: 390
      height: 844
    desktop:
      width: 1440
      height: 900
```

Then validation can say:

```text
mobile viewport: evaluated
desktop viewport: evaluated
tablet: not applicable
Safari-equivalent engine: evaluated
screen-reader interaction: not evaluated
```

instead of implying universal compatibility.

## Do not make every UI rule blocking on day one

I would use the same levels you established elsewhere:

```text
required
recommended
forbidden
```

And eventually something like:

```text
forbidden violation
→ blocks
required automated violation
→ blocks
required browser rule not established
→ block if establishment is required
recommended
→ report only
manual-review forbidden unestablished
→ NOT_EVALUATED cap
not applicable
→ skipped without penalty
```

One warning: decide **required manual-review semantics explicitly** before organization-wide rollout.

You already discovered this exact ambiguity in EngineeringStandards.

Do not accidentally promise:

```text
all required manual reviews block if absent
```

unless the evaluator actually implements that behavior.

## New projects should get enforcement automatically

The best adoption model is that nobody remembers to add it manually.

Your repo/bootstrap template should create:

```text
project-policy.yml
UI/UX instructions
CI standards invocation
browser-test hooks
design artifact locations
```

automatically.

Something like:

```text
uiux-standards init
```

should determine:

```text
UI detected?
technology?
design system?
browser automation?
Storybook?
accessibility tooling?
supported platforms?
existing design artifacts?
```

Then scaffold policy and instructions.

But tool-generated scaffolding must never count as evidence that the project's design actually satisfies the standards.

## Existing projects need reconstruction

For existing UI repos, don't immediately force a green gate.

Run a UI reconstruction:

```text
screens
routes
components
tokens
styles
responsive behavior
accessibility
browser support
Storybook
tests
design docs
```

and establish a baseline.

Then classify:

```text
current violations
unestablished manual rules
exceptions
known unsupported surfaces
unknowns
```

That gives teams an honest adoption state instead of:

```text
installed standards yesterday
→ 87 failures
→ everybody disables the gate
```

## Organization enforcement policy

Eventually I would establish this rule outside the standards repo:

> Any production engineering repository for which a user-interface surface is established as applicable must be governed by an approved immutable UIUXDesignStandards version, execute its authoritative validation gate, and require that gate before changes enter the protected default branch.

And separately:

> Failure to establish whether a repository has a UI is `INDETERMINATE`, not `NOT_APPLICABLE`.

That closes the easiest opt-out route.

## The end state

You want the portfolio to look like:

```text
Engineering Portfolio
│
├── Backend API
│   EngineeringStandards: GOVERNED
│   UIUXDesignStandards: NOT_APPLICABLE
│
├── React Web App
│   EngineeringStandards: GOVERNED
│   UIUXDesignStandards: GOVERNED / COMPLIANT
│
├── Mobile App
│   EngineeringStandards: GOVERNED
│   UIUXDesignStandards: GOVERNED / NON_COMPLIANT
│
├── Legacy Admin UI
│   EngineeringStandards: GOVERNED
│   UIUXDesignStandards: GOVERNED / NOT_EVALUATED
│
└── Unknown Repo
    EngineeringStandards: GOVERNED
    UI applicability: INDETERMINATE
```

Then there is no "remember to follow the UI standards" step.

The system itself establishes whether UI standards apply, requires the correct validator where they do, prevents ordinary merges around it, and surfaces every place where it cannot establish the truth.

The order I would build this is:

1. finish `UIUXDesignStandards` itself;
2. release an immutable `v1.0.0`;
3. add version-identity enforcement;
4. create the reusable CI workflow;
5. dogfood it on one real UI project;
6. add browser evidence;
7. implement the UI-applicability classifier;
8. build the organization adoption controller with `GOVERNED / UNGOVERNED / INDETERMINATE / NOT_APPLICABLE`;
9. only then turn the required check on portfolio-wide.

That gets you actual enforcement without recreating the false-green and evidence-provenance problems you already uncovered in EngineeringStandards.

---

## Note on the build order above

The owner subsequently revised this build order. See
`artifacts/prompts/owner-decisions.md`, decision 1: the UI-applicability classifier moved from
step 7 to **inside v1.0.0**, because `NOT_APPLICABLE` is itself an evidence claim and the first
immutable release must establish who is subject to enforcement. That revision supersedes the
numbered list in this section; the rest of this document stands as written.
