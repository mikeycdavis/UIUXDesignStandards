# 00 — Overview

**This is not a reconstructed plan.** This repository was planned before it was built, from two
source prompts written by the owner and a recorded set of owner decisions. Nothing here is inferred
from code that already existed, because none did. Where a later document makes a claim about intent,
it cites `artifacts/prompts/` rather than reasoning backwards from an implementation.

Repository artifacts are canonical over conversation history. If this breakdown and a chat log
disagree, this breakdown is what governs.

## What this project is

UIUXDesignStandards is a standalone, versioned, machine-readable standards framework governing user
interface, user experience, interaction design, visual design, accessibility, responsive behavior,
design-system usage, and design implementation quality. It is a sibling of
[EngineeringStandards](../../../EngineeringStandards), independently versioned and independently
applicable, and it follows the same architectural law:

> The catalog defines rule identity and metadata. The project policy defines project applicability.
> The evaluator produces evidence. None of the three may redefine the others.

What distinguishes it from every sibling pack is that it must answer a question before it can
evaluate anything: **does this repository have a user interface at all?** Most repositories in the
portfolio do not. So the framework has two gates — applicability, then compliance — and the first
one is established from evidence rather than accepted as a declaration.
See [ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md).

The second distinguishing property is that most of its highest-value rules cannot be settled by
reading source. Whether focus order is logical, whether contrast holds after the cascade resolves,
whether an interface manipulates its user — these need a browser, a screenshot, or a human. The
framework therefore carries four evidence surfaces and reports honestly about which ones actually
ran.

## Current state

| | |
| --- | --- |
| Branch | `main` |
| Remote | `origin` — github.com/mikeycdavis/UIUXDesignStandards. `main` and `v1.0.0` published 2026-08-11 |
| Standards written | 40 of 40 |
| Rules catalogued | 70 in 15 files, 15 forbidden |
| Tooling | vendored core, content-identity primitive, inventory, provenance, rule-identity, and policy checkers; the Gate 1 classifier; the `audit` and `validate` pipelines with 13 static detectors; browser-evidence ingestion; the attestation model; the `init` bootstrap; CI and the documentation; the release-readiness checker and the frozen v1.0.0 catalog snapshot; the full suite, including 21 architectural falsifiers |
| Platform | Node ≥ 18, zero dependencies |
| Own policy | `no-ui` declared, and classified `NOT_APPLICABLE` from evidence — complete scan, zero signals, `agreement: match`. `validate` exits 0: `uiCompliance: null`, `frameworkCompliance: COMPLIANT` |
| Framework version | `1.0.0` — `RELEASED` at [`8353469`](../release/publication-v1.0.0.md), verified from a clone of the published tag. This tree is `POST_RELEASE_DEVELOPMENT`, not the release tree. One gap carried: the Git chronology is `NOT_ESTABLISHED` — the only kind a release may carry, evidence that cannot now be recovered honestly |

- **Current status:** `IN_PROGRESS` — v1.0.0 released; development continues on top of it
- **Current release target:** none declared. `VERSION` stays at `1.0.0`, the last release, until the next one is cut (ADR 0015)
- **Known risks:** the detector set is the least certain part of the plan; false positives are the
  failure mode this family has shipped most often, and no external UI project has exercised these
  detectors yet (see `14-real-project-dogfood.md`).
- **Known blockers:** none.
- **Next recommended work:** `13-version-identity-and-reusable-workflow.md`, now unblocked by the published tag.

## Sections

| File | Covers | Status |
| --- | --- | --- |
| `00-overview.md` | This document, and the M0 process-bootstrap items below | `COMPLETE` |
| [`01-repo-skeleton-and-vendored-core.md`](01-repo-skeleton-and-vendored-core.md) | package.json, vendored core, `content-identity.mjs` | `COMPLETE` |
| [`02-standards-corpus-and-provenance.md`](02-standards-corpus-and-provenance.md) | 40 standards, source inventory, external provenance | `COMPLETE` |
| [`03-rule-catalog.md`](03-rule-catalog.md) | Frozen rule identity, then `rules/*.json` | `COMPLETE` |
| [`04-policy-schema-and-templates.md`](04-policy-schema-and-templates.md) | Schema, cross-field semantics, templates, own policy | `COMPLETE` |
| [`05-applicability-classifier.md`](05-applicability-classifier.md) | Gate 1 — `applicability.mjs` | `COMPLETE` |
| [`06-evaluator-and-detectors.md`](06-evaluator-and-detectors.md) | `uiux.mjs`, `splitSource`, 13 detectors | `COMPLETE` |
| [`07-browser-evidence-interface.md`](07-browser-evidence-interface.md) | Evidence schema, ingestion, freshness | `COMPLETE` |
| [`08-manual-review-and-attestations.md`](08-manual-review-and-attestations.md) | Attestation model, gating semantics | `COMPLETE` |
| [`09-init-bootstrap.md`](09-init-bootstrap.md) | `init.mjs`, three modes | `COMPLETE` |
| [`10-tests-and-fixtures.md`](10-tests-and-fixtures.md) | Full suite, fixtures, mutation and meta-tests | `COMPLETE` |
| [`11-ci-and-docs.md`](11-ci-and-docs.md) | CI, README, INSTRUCTIONS, PROJECT, architecture | `COMPLETE` |
| [`12-release-readiness-and-v1.md`](12-release-readiness-and-v1.md) | Readiness checker, frozen snapshot, tag | `COMPLETE` — v1.0.0 tagged and published |
| [`13-version-identity-and-reusable-workflow.md`](13-version-identity-and-reusable-workflow.md) | Deferred — post-v1.0.0 | `READY` |
| [`14-real-project-dogfood.md`](14-real-project-dogfood.md) | Deferred — needs an owner-nominated target | `NOT_STARTED` |
| [`15-browser-evidence-producer.md`](15-browser-evidence-producer.md) | Deferred — the runner half of ADR 0002 | `NOT_STARTED` |
| [`16-portfolio-integration.md`](16-portfolio-integration.md) | Deferred — Orchestrator/Enforcer wiring | `NOT_STARTED` |

Sections `01`–`12` are in scope for v1.0.0. Sections `13`–`16` are deferred deliberately and
recorded here so that deferral is visible rather than becoming silent scope loss.

## Decisions on record

Fifteen ADRs, all `Accepted`. The four that most constrain later work:

- [ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md) — two-gate
  applicability, classifier in this repository, ships in v1.0.0, three separate envelope blocks.
- [ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)
  — freshness is committed-content identity with path-scoped working-subject integrity. The
  EngineeringStandards working-tree digest is a known defect and is not ported.
- [ADR 0005](../adr/0005-full-assurance-requires-an-enumerable-subject.md) — `full` assurance is
  impossible for browser, visual, code-analysis, and manual-review rules.
- [ADR 0012](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md) — the
  schema validates shape; `policy.mjs` owns cross-field semantics at exit 2.

## Constraints that apply to all work here

**Zero dependencies.** No `dependencies`, no `devDependencies`, no lockfile, no `node_modules`, and
no `npm ci` step in CI. Node ≥ 18 and `node:test` only. If a dependency ever appears, that decision
changed and needs an ADR.

**Never fabricate history or evidence.** This governs the repository's own documents, not only the
artifacts its standards produce. A claim about what a project intended requires evidence; an
inability to establish something is reported as such and never converted into a pass.

**The passing set is closed.** An unrecognized state falls to a non-zero exit, never to success.

**Detectors report instances, not mentions.** Every must-never detector declares which source view
it scans, and every one is proved against a fixture that names its subject without being an instance
of it.

**Rule identity freezes before implementation.** `artifacts/design/rule-catalog-v1.md` is authored
and reviewed before any detector exists; detectors bind to frozen ids and never influence them.

**Verification is a command, not a claim.** Every item below carries a runnable command and the
output that means success. "Looks right" is not a verification.

## Scope changes

**2026-08-10 — the `uiux-standards` CLI arrived in plan section 05 rather than 06, and section 05's
last item is blocked rather than complete.** The classifier's verification commands are written
against `uiux-standards applicability`, so the dispatcher had to exist to run them. It routes
`applicability` and exits **2** for `audit`, `validate`, and `init`, naming the section that
implements each — a command that reported success for want of an implementation would be the exact
false green this framework exists to prevent. The corresponding cost is that section 05's fourth
item, wiring Gate 1 into `validate`, could not be finished until the evaluator existed; it was
recorded `BLOCKED` rather than folded into section 06, so the dependency stayed visible, and section
06 closed it on the same day. Two prose paragraphs
were also added to [Standard 34](../../standards/34-project-policy-applicability-and-exceptions.md)
R3, stating that scan incompleteness constrains claims of absence only and that a UI class is never
inferred beyond what a signal proves. Both were implementation decisions the classifier had to make,
and a normative decision that lives only in a module header is not a standard.

**2026-08-10 — evidence coverage became a first-class axis in plan section 07, and the policy gained
`ui.evidencePaths`.** The plan treated ingestion as a freshness problem. Freshness turned out to be
necessary and nowhere near sufficient: a completed run over fresh source that tested one declared
viewport class of two, or recorded a pass on a route it never finished, would have established its
rules under the planned rules. Four axes are now kept separate — run completion, freshness, coverage,
check outcome — and a new `partial-coverage` disposition carries the case where every conclusive
check passed over a surface that was not fully exercised. It is unestablished, and it caps a
forbidden rule exactly as the other unestablishing dispositions do. Coverage is assessed only against
inputs the producer does not control, which is why `ui.evidencePaths` was added to the policy schema:
without it a producer could widen its own claim by measuring a narrower subject. Standard 36 gained
R4a and R4b; Standard 35 R7's cap list grew to five dispositions. The exit-2 list grew by three —
wrong evidence surface for the rule's `validationType`, a record contradicting its own viewport
declarations, and an identity over undeclared paths.

**2026-08-10 — documentation became falsifiable in plan section 11, and the use/mention repair
reached CI.** Prose is where a framework's claims drift ahead of its code first, and nothing about
that drift fails a build. Every claim the five orientation documents make is now bound to what would
make it true — a named command to a declared script, an envelope field to one a run emits, a
disposition to one the evaluator emits, a rule id to a catalog identity, a relative link to a file —
and writing those checks found two real defects in prose that read perfectly well. The install-step
guard also had to be repaired the same way `content-identity.mjs` was in section 10: it forbade the
workflow from explaining, in a comment, why it has no install step. That is the third appearance of
the use/mention shape in this repository, and it is now treated as a property of any check that reads
text rather than as a coincidence. Three falsifiers were added — removing `npm run validate` from CI,
adding an install step, and drifting a diagram from its canonical source.

**2026-08-10 — the framework's architectural promises became falsifiable in plan section 10, and
Standard 40 gained R11 and R12.** Sections 01–09 accumulated invariants faster than anything checked
that they were still defended: a normative MUST could be added with nothing testing it, and a test
could be deleted with its promise surviving in a standard nobody re-read. Neither shows up as a
failure. There is now a registry binding each release-critical invariant to a quote in a normative or
plan file, to named tests that must exist, and — for the ones that convert an inability into a pass if
they fail — to a falsifier that is actually executed, cross-checked in both directions. Thirteen
architectural mutations run against a sandbox copy of the repository, including two that delete a
fixture drawer outright. R12 is the second half: a deferral must be re-asserted rather than assumed,
so the git-history ordering check now has a watchdog that upgrades itself to the real comparison the
moment history exists. The M1 use/mention debt was also paid — the guard on `content-identity.mjs` is
now semantic, and the module explains the alternatives it rejects instead of being forbidden to name
them.

**2026-08-10 — `init` scaffolds the two declared subjects sections 07 and 08 added, and only from
paths it saw.** Neither `ui.evidencePaths` nor `ui.reviewPaths` existed when section 09 was planned,
and both are now the kind of field a bootstrap is most tempted to fill in helpfully: an interface
usually has a `screens/` or a `components/`, and writing one down would create declared coverage out
of a convention. The scaffold therefore proposes only top-level containers of paths the scan actually
returned, and where it can establish none it omits both fields and leaves a visible `TODO — UNKNOWN`
saying what does not work until they are declared. The same section left `designSystem.strategy`
unwritten for the same reason in reverse: a token file does not establish adoption, and its absence
does not establish `none-justified`, which is a decision nobody has made.

**2026-08-10 — review scope moved out of the reviewer's hands in plan section 08, and the policy
gained `ui.reviewPaths` and `ui.reviewScopes`.** The plan treated attestations as a freshness problem
too, and freshness was again the easy half: a review can be anchored to a real commit, perfectly
current, and cover one file of an interface. The asymmetry that forces the extra machinery is that a
browser producer enumerates the routes it visited — checkable against the routes the source scan
found — while a reviewer's account of what they read has no independent counterpart anywhere. Left
there, `reviewedAgainst.paths` would have meant "whatever made this review easiest". The required
subject is now declared by the project, ahead of and apart from any review, and a review that does not
cover it is the new `partial-review` disposition; a rule with no declared subject is
`unscoped-review`, and a policy recording an attestation without one is a configuration error at exit
2. Standard 37 gained R9 and a precedence-ordered R3 table; Standard 35 R7's cap list grew to seven.
`STALE` and `EVIDENCE_UNAVAILABLE` now reach the per-rule result as `stale-evidence` and
`evidence-unavailable` rather than collapsing into `not-evaluated` — deliberately the same disposition
names the browser surface uses, with `validationType` carrying which surface failed. The attestation
schema also tightened: `reviewedAgainst` is required, `revision` must be a full commit SHA, and
`contentIdentity` must be exactly the 32 hex characters the shared primitive produces.

**2026-08-10 — class scoping became a first-class state in plan section 06, and `SELF` became a
two-path set.** The plan described `validate` scoping UI rules but did not say what happens when Gate
1 establishes that an interface exists without establishing which class it is. Reading the declared
class would have been the obvious answer and the wrong one: it returns the project's own assertion to
authority over the rules it is measured by, one layer below the gate built to prevent that. Scoping
is therefore matched against the classes the evidence *proved*, a declaration participates only where
the evidence corroborates it, and everything else is the new `class-unresolved` disposition — neither
a pass nor an exclusion, inside the applicable denominator, and capping the verdict when the rule is
forbidden. `not-applicable-by-class` is its corroborated counterpart. One normative paragraph was
added to [Standard 34](../../standards/34-project-policy-applicability-and-exceptions.md) R3 and one
to R5. Separately, `SELF` grew from the detector file to include `test/audit.test.mjs`: a suite that
asserts the detectors fire cannot do so without quoting the patterns they hunt. Both exclusions are
reported in `evidenceSurface.sourceRead.selfExcluded`.

**2026-08-10 — the root policy's per-rule `not-applicable` declarations were dropped in plan
section 04.** The plan called for declaring every UI-class rule not-applicable in this repository's
own policy. That would place a second, weaker answer in front of Gate 1: per-rule applicability is
for a rule whose subject is absent from a project that has an interface, while whether an interface
exists is the classifier's question. The three-block envelope already nulls `uiCompliance` when
applicability is not `APPLICABLE`, so the declarations would add assertions without adding evidence.
Recorded rather than made silently, because the plan asked for them explicitly.

**2026-08-10 — the rule count and detector count were fixed by the corpus during plan section 03.**
The plan estimated `~55` rules and thirteen static detectors. The forty standards name **70**
identities, so the freeze at [`artifacts/design/rule-catalog-v1.md`](../design/rule-catalog-v1.md)
records 70 rules, 15 forbidden, and **12** detectors, and every verification now asserts the exact
numbers. The thirteenth detector — inline-style accumulation — was dropped rather than given an
invented rule to bind to, because a rule that exists so a detector can run inverts the catalog's
authority. One corpus identity was also split
(`forms.validation-messages-actionable` → `forms.required-status-indicated` +
`forms.error-field-association`) after reconciliation showed it carried two validation types and
named a concept Standard 20 owns.

**2026-08-10 — a thirteenth ADR was added during plan section 02.**
[ADR 0013](../adr/0013-external-claims-in-prose-are-structured-citation-tokens.md) records that
external claims in standards prose are structured citation tokens verified against enumerated facts.
The plan specified twelve ADRs and an external-provenance artifact whose checker asserted that a
standard naming an external source has a mapping for it. That check is satisfiable by a false
citation, which is the failure the artifact exists to prevent, so the mechanism was replaced and the
decision recorded rather than made silently. The plan's `ls artifacts/adr | wc -l` verification now
expects 13.

---

### Record the source prompts and owner decisions as repository artifacts

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make the repository, not a conversation, the source of truth for what was asked and
  what was decided. Every later standard cites these files in its `Source:` line, and the inventory
  is checked against them.
- **Deliverables:**
  [`artifacts/prompts/original_prompt.md`](../prompts/original_prompt.md) (the 64-section source
  specification, committed before planning began);
  [`artifacts/prompts/enforcement-architecture-prompt.md`](../prompts/enforcement-architecture-prompt.md)
  (the two-gate enforcement architecture, verbatim, with a closing note recording that its build
  order was later revised);
  [`artifacts/prompts/owner-decisions.md`](../prompts/owner-decisions.md) (six decisions — three
  planning answers and three plan-review rounds — each labeled `CONFIRMED_BY_OWNER (2026-08-10)`).
- **Acceptance Criteria:**
  - Both new prompt artifacts exist and are reproduced verbatim, with editorial notes clearly
    separated from source text.
  - Every decision in `owner-decisions.md` carries the `CONFIRMED_BY_OWNER` label and a date.
  - Each decision names the ADR or file that implements it.
- **Verification:**
  ```bash
  ls artifacts/prompts/ | wc -l                               # → 3
  grep -c "CONFIRMED_BY_OWNER (2026-08-10)" artifacts/prompts/owner-decisions.md   # → 7
  ```
- **Dependencies:** none.

### Record the architecture decisions

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Fix the consequential framework decisions before implementation, so that later work
  inherits reasoning rather than re-deriving it, and so a departure is visible as a supersession
  rather than as drift.
- **Deliverables:** [`artifacts/adr/0001`](../adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md)
  through [`0012`](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md),
  each with Status/Date/Deciders bullets and `## Context`, `## Decision`, `## Alternatives
  considered`, `## Consequences` sections.
- **Acceptance Criteria:**
  - Twelve ADRs at the close of this section, numbered `0001`–`0012` with four-digit zero padding,
    no gaps. A thirteenth was added during plan section 02 and a fourteenth during section 12, both
    recorded under Scope changes; the counts below reflect the current total, since ADR numbers
    are never reused or removed.
  - Every ADR names at least two rejected alternatives with reasons. An ADR with no alternatives is
    a description, not a decision record.
  - Every `## Consequences` section uses the four fixed lead-ins: **Makes easier.**,
    **Makes harder.**, **Commits the project to.**, **Known cost accepted.**
- **Verification:**
  ```bash
  ls artifacts/adr/*.md | wc -l                                    # → 14
  grep -L "Known cost accepted" artifacts/adr/*.md | wc -l         # → 0
  grep -c "^## Alternatives considered" artifacts/adr/*.md | grep -c ":1"   # → 14
  ```
- **Dependencies:** the owner-decisions artifact, which several ADRs quote.

### Decompose the plan into ordered sections

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Give every milestone its own file with executable items, so no consequential plan
  section exists only in chat and so deferred work stays recorded rather than disappearing.
- **Deliverables:** this file plus `01`–`16`, seventeen files total; ordered filenames; six-field
  items throughout.
- **Acceptance Criteria:**
  - Seventeen files, filenames preserving order.
  - Every item carries Status, Purpose, Deliverables, Acceptance Criteria, Verification, and
    Dependencies, in that order.
  - Every Verification field is a runnable command with its expected output, not a prose assertion.
  - Deferred sections `13`–`16` exist and carry `READY` or `NOT_STARTED`, never absence.
- **Verification:**
  ```bash
  ls artifacts/project-plan-breakdown/*.md | wc -l    # → 17
  grep -L "^- \*\*Verification:\*\*" artifacts/project-plan-breakdown/0*.md artifacts/project-plan-breakdown/1*.md | wc -l   # → 1 (00-overview lists items but is also the index)
  ```
- **Dependencies:** the ADRs, which the section files reference by number.

---

**2026-08-11 — a fourteenth ADR, and the first amendment to the frozen catalog.** Plan section 12's
readiness checker found two `forbidden` rules typed `code-analysis` with no detector. The first
response was to record it as a release gap; that was rejected on review and the rules were resolved
instead, under [ADR 0014](../adr/0014-two-forbidden-rules-were-matched-to-the-evidence-that-can-establish-them.md).
`accessibility.no-inaccessible-custom-controls` gained the thirteenth static detector with no catalog
change; `design-integrity.no-fake-progress` was re-typed `code-analysis`/`partial` →
`manual-review`/`none`, because whether a number is a measurement is a question about the work rather
than about the code that renders it.

The scope change is that `artifacts/design/rule-catalog-v1.md` — a *frozen* artifact — was amended,
which is recorded there with its date and reasoning, and that the v1.0.0 catalog snapshot was
deliberately regenerated. The freeze's guarantee is that identity does not change without a written
decision, not that an error found before the first release must ship. A `validationType` change to a
released rule is a contract change costing a MAJOR increment; before the first release it costs
nothing, so this was the last moment to make it. The readiness checker now distinguishes an accepted
release limitation from a blocking one mechanically, so recording a resolvable defect can no longer
substitute for resolving it.

## Gotchas this section discovered

Recorded because they cost real time to find and are invisible from the files alone.

**The EngineeringStandards ADR format is not uniform, and the documented template is the one to
follow.** `standards/11-architecture-decision-records.md` specifies Context / Decision /
Alternatives considered / Consequences, and ADRs 0001 and 0005 use four fixed bolded lead-ins under
Consequences. ADR 0009 does not — it uses `### Rejected — …` subheadings under Decision and free-form
Consequences. Copying the most recently written ADR rather than the documented template would have
propagated the variant. The template governs.

**Dates must come from the session, not from the reference repository.** The first draft of every
artifact here was dated 2026-08-09, carried over unnoticed from EngineeringStandards' commit dates,
while the decisions were actually made on 2026-08-10. On a `CONFIRMED_BY_OWNER` label that is not a
typo — it is a fabricated provenance claim of exactly the kind Standard 39 R3 prohibits, in the
artifact whose whole purpose is to record provenance. Caught before commit; the correction was a
single `sed` across fourteen files, but the class of error is worth remembering, because nothing
mechanical would have flagged it.

**The count of standards has to be defensible before the inventory can be written.** 40 is not a
transcription of the source's 64 sections; six sections deliberately become no standard, and several
merge. That mapping had to be decided and recorded ([ADR 0010](../adr/0010-the-corpus-is-forty-standards.md))
before `standards-source-inventory.json` could claim `expectedCount: 40`, because the inventory's
whole value is that a human reviewed the number rather than a parser producing it.
