# INSTRUCTIONS — adopting UIUXDesignStandards

How to put this framework to work in your project. The minimum recipe is first; the things it cannot
do are last, and reading that section is not optional — a validation result means much less than it
looks like if you have not read what was never checked.

If you are working *in* this repository rather than adopting it, read [PROJECT.md](PROJECT.md).

---

## 1. The minimum recipe

```bash
node <path-to-uiux-standards>/scripts/uiux.mjs init . --dry-run
```

Read what it proposes. Then run it without `--dry-run`, edit the scaffolded `project-policy.yml` until
it describes your project rather than the template's, and run the gate:

```bash
node <path-to-uiux-standards>/scripts/uiux.mjs validate .
```

Exit 0 means the checked condition holds. Exit 1 means the tool ran and found problems. Exit 2 means
no verdict was reached — an invocation or configuration error, which is never a statement about your
project.

`init` never replaces a file it did not write. An existing file is a conflict, reported and refused at
exit 1; replacing one needs `--force-overwrite=<path>` naming that exact path.

## 2. Declaring the standards version

```yaml
standardVersion: 1.0.0
```

Pin it deliberately. It travels into every validator output and says which release of the framework
you are being evaluated against. It is one of three versions that move independently — the others are
the tool's own version and the output envelope's `schemaVersion`, which is what an integration pins.

## 3. Writing the policy

Everything lives in `project-policy.yml` at your repository root. The teaching copy is
`templates/project-policy.yml`, and `init` scaffolds it with your paths filled in.

```yaml
ui:
  applicability: web-ui        # no-ui | web-ui | mobile-ui | desktop-ui | embedded-ui | multi-platform
  platforms: [ ... ]
  viewportClasses: [ ... ]
  accessibility:
    target: framework-baseline
```

`ui.applicability` is a **declaration**, and an input to the classifier — never its answer. Declaring
`no-ui` in a repository that contains UI signals produces a conflict, which is `INDETERMINATE`, which
does not exit 0. You cannot opt out of the UI rules by asserting you have no UI.

Validate the file on its own at any time:

```bash
node <path-to-uiux-standards>/scripts/policy.mjs project-policy.yml
```

## 4. The cross-field invariants — the part the schema cannot tell you

The vendored schema evaluator has a closed keyword set with no `if`/`then`/`oneOf`, and it is
deliberately not extended to fake conditionality (ADR 0012). So these rules live in `policy.mjs`, and
because a reader cannot find them by reading the schema, they are written out here. **Every one is a
configuration error at exit 2, never a compliance finding.**

1. **`no-ui` admits no other `ui` key.** A project asserting it has no interface cannot also describe
   one.
2. **Any non-`no-ui` declaration requires `ui.accessibility.target`.** There is no default and no
   silent `framework-baseline`: inferring one would record a decision nobody took.
3. **Any non-`no-ui` declaration requires at least one platform**, and `multi-platform` requires at
   least two.
4. **`web-ui` and `mobile-ui` require at least one viewport class.** Responsive rules are evaluated
   per declared class, and a project declaring none would be evaluated against nothing.
5. **`localization.status: required` requires at least one locale.**
6. **`designSystem.strategy: none-justified` requires a justification.** The strategy's whole content
   is that the absence was decided rather than defaulted.
7. **Recording any attestation requires a declared review subject** — `ui.reviewPaths`, or a
   `ui.reviewScopes` entry for that rule. See §8.

## 5. The two gates

**Gate 1 — is a UI applicable here?** Established from repository evidence, not from your
declaration:

```bash
node <path-to-uiux-standards>/scripts/uiux.mjs applicability . --json
```

| Outcome | What it takes |
| --- | --- |
| `APPLICABLE` | one positive UI signal |
| `NOT_APPLICABLE` | **all three** of: a declared `no-ui`, a complete scan, and zero contradicting signals |
| `INDETERMINATE` | anything else, including zero signals with no declaration |

`INDETERMINATE` never exits 0 and never produces a compliant UI verdict. A complete scan proves "none
of the framework's supported signals were present", never "this repository has no UI".

**Gate 2 — does the applicable UI satisfy the standards?** Only reached when Gate 1 says
`APPLICABLE`, so no UI rule result can exist on the far side of an unanswered gate.

The output carries three independent blocks — `applicability`, `uiCompliance` (null unless
`APPLICABLE`), and `frameworkCompliance` (never null). No field changes meaning by context.
`docs/integration-contract.md` is the full specification.

## 6. `audit` versus `validate`

```bash
node <path-to-uiux-standards>/scripts/uiux.mjs audit .        # evidence discovery
node <path-to-uiux-standards>/scripts/uiux.mjs validate .     # the gate
```

`audit` reports what it found and reaches **no verdict** — no status, no score, and it does not read
your policy. A clean audit is not a compliance result: most rules in this framework have no static
detector at all. `validate` is the gate, and it is the one to put in CI.

## 7. Required, not-applicable, and exceptions — choosing correctly

| You mean | Write |
| --- | --- |
| This rule applies and we meet it | nothing — that is the default |
| This rule has no subject in our project | `applicability: { <rule>: { status: not-applicable, reason: ... } }` |
| This rule applies, we do not meet it, and that is a knowing decision | `exceptions: [ { rule, reason, approvedBy, approvedAt, expires } ]` |
| A human reviewed this and it is satisfied | `attestations: { <rule>: { ... } }` — see §8 |

These are not interchangeable. `not-applicable` says the subject is absent; if a detector then finds
the subject, that is a **failure**, not a silent opt-out. An exception says the rule applies and is
knowingly unmet. A rule declared both is ambiguous and is reported as a finding.

**Forbidden rules are non-exemptible.** An exception against one — say
`accessibility.not-deliberately-disabled` — is rejected rather than applied. If a
prohibition genuinely has no subject in your project, declare it not-applicable with a reason — that
is the honest route, and it stays visible in the output.

## 8. Manual review — read this one carefully

This is the behaviour adopters most often assume wrongly, so it is stated plainly.

**An unestablished `required` manual-review rule does NOT block in v1.0.0.** It is visible in the
`notEvaluated` assurance bucket and named in the human-readable output, and it does not on its own
make the verdict non-compliant. A framework that blocked every unreviewed judgment rule on day one
would be turned off; one that passed them silently would be lying. This is the honest, implementable
middle, and it is stated here rather than left to be discovered.

**An unestablished `forbidden` rule DOES cap the verdict** at `NOT_EVALUATED`, and exits 1. A
prohibition nobody established is not a prohibition anybody kept.

A stricter mode is a future minor release. The flag name `--require-established` is reserved and
deliberately not implemented, so nothing suggests it exists today.

Recording a review:

```yaml
ui:
  reviewPaths:                 # what a review must cover — declared by you, not by the reviewer
    - src
    - docs/design

attestations:
  visual.hierarchy-intentional:
    status: approved           # or: rejected
    reviewedBy: name@example.com
    reviewedAt: 2026-01-01
    evidence: Reviewed the dashboard, settings, and report views against Standard 11 R1-R6.
    reviewedAgainst:
      paths: [ src, docs/design ]
      revision: <full 40-character commit SHA>
      contentIdentity: <32 hex characters>
```

Omit `contentIdentity` on the first pass; `validate` prints the identity of that material as committed
so you can paste it back. It is never written for you — an identity the framework computed and stored
on your behalf would say only that the paths match themselves.

Then:

- A review narrower than `ui.reviewPaths` is `partial-review` and establishes nothing. Scope is
  declared by the project, ahead of and apart from any review, because a reviewer who chooses their
  own scope establishes whatever they chose to look at.
- An **expired** review returns the rule to unreviewed. It is never a failure — you did not do
  something wrong, you stopped having current evidence.
- A review of material that has since changed is `stale-evidence`. Freshness is path-scoped: work
  outside the reviewed paths never stales it.
- An automated finding or a browser run that witnessed the rule fail **contradicts** an approving
  review, and the finding wins. Evidence outranks assertion, always.
- `templates/design-review-pack.md` is the artifact your `reviewedAgainst.paths` should come from.

## 9. Browser and visual evidence

**This framework produces no browser evidence** (ADR 0002). It defines and verifies an ingestion
contract, so any runner — Playwright, Cypress, a hand-driven session — can participate. Until you
supply one, every `browser-analysis` rule reports `not-evaluated`. That is the point, not a gap: those
properties genuinely were not checked.

```bash
node <path-to-uiux-standards>/scripts/uiux.mjs validate . --evidence=artifacts/uiux-evidence/browser-evidence.json
```

The document's shape is `schemas/browser-evidence.schema.json`, and
`docs/integration-contract.md` §5 is the producer's contract. Four things are checked independently,
and none implies another:

```text
did the producer finish?          run.status
is it about this source?          revision.sourceIdentity, recomputed from revision.gitSha
was the surface covered?          every enumerated route, every declared viewport class
did a check conclude?             passed | failed | inconclusive
```

A rule passes only when all four hold. One conclusive **failure** is established regardless of
coverage — the interface did that, and unexercised surface elsewhere does not undo it. A **pass**
needs the surface covered, because it is a claim that a defect is absent.

Declaring `ui.evidencePaths` binds the producer to your subject: a record whose identity covers
different paths is exit 2, so a producer cannot widen its claim by measuring less.

## 10. Onboarding a project that already exists

`init` detects what is there and reports it with an epistemic label on every claim — `OBSERVED`,
`INFERRED`, `CONFIRMED_BY_OWNER`, or `UNKNOWN` — and picks one of three modes:

| Mode | When |
| --- | --- |
| `greenfield` | no interface evidence and no policy |
| `existing-configured` | a `project-policy.yml` is already present |
| `reconstruction-required` | interface evidence, and no declaration of what that interface is |

`--mode=<name>` overrides the inference and is recorded as `CONFIRMED_BY_OWNER` with the date. It
changes what is scaffolded and **not** what was detected, and it is written nowhere, so a later run
returns the inferred mode.

Note what `init` will not do. It will not turn an inferred design system into a declared strategy — a
tailwind config says somebody installed Tailwind, not that your project adopted a design system, and
its absence certainly is not you deciding `none-justified`. It will not scaffold `no-ui`, because that
is a claim about a repository only a complete scan with zero signals can support. And it declares
`evidencePaths`/`reviewPaths` only from paths it actually saw; where it can establish none, it omits
both fields and leaves a visible `TODO — UNKNOWN` rather than inventing coverage.

## 11. Reconstruction

`reconstruction-required` means the interface exists and nothing declares what it is supposed to be.
[Standard 39](standards/39-bootstrap-and-existing-ui-reconstruction.md) covers it: rebuild the
declaration from screens, routes, components, tokens, styles, tests, screenshots, and design files —
and record everything you could not establish as unknown.

Design intent is not in a repository. Nothing here reconstructs it, and no document this framework
writes may claim to.

## 12. Upgrading

Semver, with the increments meaning what they say:

| Change | Increment |
| --- | --- |
| A new `required` or `forbidden` rule | MAJOR |
| A new `recommended` or `optional` rule | MINOR |
| Removing an alias | MAJOR |
| Wording that does not change what is enforced | PATCH |

Pin a commit sha rather than a tag when you consume this repository from CI. Tags are mutable; the sha
is the guarantee.

## 13. Consuming this pack from CI

`.github/workflows/validate.yml` is callable with `workflow_call`. Your repository invokes it; it
does not reimplement any rule, and your YAML must not either.

> **There is no released ref to pin yet, and this section will not invent one.** `v1.0.0` was tagged
> before this workflow and the version-identity guard existed, so the released tree contains neither
> `.github/workflows/validate.yml` nor `scripts/version-identity.mjs`. Pinning `@v1.0.0` — or the
> commit it names — does not resolve to a workflow at all, and never produced a verdict. Consuming
> this pack as an immutable release becomes possible with `v2.0.0` ([ADR 0017](artifacts/adr/0017-the-next-release-is-2-0-0-and-the-consumer-milestone-splits.md)).
> Until then the block below is the shape of the contract, not a recipe that runs.

```yaml
jobs:
  uiux:
    uses: mikeycdavis/UIUXDesignStandards/.github/workflows/validate.yml@RELEASE_SHA
    with:
      standards-ref: RELEASE_SHA    # the same commit; a tag is only an alias for one
```

`RELEASE_SHA` is a placeholder, and deliberately not a value that can be pasted into a working state.
Substitute the commit of a release that actually contains this workflow, and pin the commit rather
than the tag: a tag is a mutable human-readable alias, and a commit is not.

The exit contract the caller sees is the framework's own: `0` the project satisfied the pack, `1` it
did not, `2` no verdict was reached. The third fails the check with a configuration annotation rather
than a compliance one, because a misconfigured project is not a failing project — and must never read
as a passing one.

**Your `standardVersion` and the ref must agree, and the framework checks.** A policy declaring
`1.0.0` evaluated by anything that is not the released 1.0.0 produces no verdict at all, at exit 2.
That includes a ref pointing at a *branch* whose `VERSION` file happens to read `1.0.0` — in this
family `VERSION` names the last release and stays there during development, so a branch can carry a
released version number while being a different framework.

**When a verdict is produced**, the envelope records which framework produced it, and you read that
block rather than the workflow's `uses:` line — the line states an intention, the block is a record
of what happened:

```json
"versionIdentity": {
  "pack": "UIUXDesignStandards", "declaredVersion": "2.0.0", "executedVersion": "2.0.0",
  "executedCommit": "<the commit v2.0.0 names>", "executedTree": "RELEASE_TREE", "identity": "MATCH"
}
```

**When identity refuses, there is no envelope at all** — its `status` would be exactly the claim
being refused. The refusal names the state on stderr and the run exits 2.

### Pinning a development sha, and what it produces

A ref that is not a release is not a way to adopt the pack early. Every development commit refuses,
by construction:

```yaml
jobs:
  uiux:
    uses: mikeycdavis/UIUXDesignStandards/.github/workflows/validate.yml@54352e9a0dc0fb3ba0e4762663d341c46d8a3c89
    with:
      standards-ref: 54352e9a0dc0fb3ba0e4762663d341c46d8a3c89
```

With a policy declaring `1.0.0`, that pin produces:

```text
uiux-standards validate: EXECUTED_TREE_IS_NOT_THE_RELEASE
  ... the executing framework's VERSION agrees, but its tree is not the v1.0.0 release ...
exit 2 — and no envelope
```

That is the guard working, not a defect to route around. It is also the only outcome this pack can
honestly demonstrate across a repository boundary before `v2.0.0` exists, which is why the
distribution proof is a *refusal* rather than an adoption (ADR 0017, phase 13A).

### What installing this workflow does not establish

Adding this workflow establishes that the workflow file exists in your repository, and nothing more.

Whether the check actually runs on every pull request, whether it is configured as a required check,
whether branch protection covers the branches you care about, and who is permitted to bypass it are
all facts about your Git hosting platform. None of them are visible from this repository, none are
checked by anything here, and a committed workflow file is not evidence of any of them. Establishing
those is the job of an organization adoption controller, which this framework does not yet have.

If you need to state that this pack is *enforced* on a repository, that claim requires evidence from
the host platform's settings, not a link to a YAML file.

## 14. What not to do

- **Do not treat a clean `audit` as compliance.** It consults no policy and reaches no verdict.
- **Do not read the exit code as the classification.** `INDETERMINATE` is a produced classification at
  exit 0 from the `applicability` command; consumers read the JSON.
- **Do not declare `no-ui` to make the UI rules go away.** It is checked against evidence, and a
  contradiction is `INDETERMINATE`, which does not exit 0.
- **Do not except a forbidden rule.** The waiver is rejected, not applied.
- **Do not weaken a check because it caught something.** Deleting, skipping, or loosening a test or a
  rule to make a build green is prohibited by
  [Standard 29](standards/29-design-integrity-prohibitions.md) R8 — and it is the specific failure
  this whole framework exists to prevent.
- **Do not report a declared accessibility target as conformance.** A declared `wcag-2.2-aa` means
  "evaluate me against this framework's supported representation of that target". It is never a claim
  that your project conforms to WCAG.

## 15. What this framework cannot currently do

Read this before quoting a result.

- **No browser evidence is produced.** Every `browser-analysis` rule reports `not-evaluated` unless you
  supply a run. Contrast, focus order, modal focus trapping, zoom behaviour, reduced-motion response,
  responsive overflow, and touch-target sizing are all in this category.
- **Twelve rules of seventy have a static detector.** The rest need a browser, a screenshot, or a
  person. `frameworkCoverage` in the output says how much of the framework is machine-represented at
  all — it is not a score about your project.
- **The static detectors have documented blind spots.** Markup inside JavaScript template literals is
  not analysed; JSX form controls are not label-checked; heading structure is checked in complete HTML
  documents only. Every run prints the current list under "What this run could not see".
- **No external UI project has exercised these detectors.** False positives are the failure mode this
  family has shipped most often, and the calibration pass against a real interface has not happened.
- **A review is checked for freshness and scope, not for quality.** Nothing establishes that a
  reviewer read the material or judged it well. A recorded review is evidence that a review is on
  file, and the framework claims no more for it than that.
- **The reusable consumer workflow and the portfolio adapters are not built.** They are recorded in
  `artifacts/project-plan-breakdown/13-version-identity-and-reusable-workflow.md` and
  `16-portfolio-integration.md` rather than omitted.
