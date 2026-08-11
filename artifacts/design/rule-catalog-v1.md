# Rule catalog v1 — frozen identity

**Status:** Frozen — 2026-08-10. Amended once under a governed event — 2026-08-11 (see *Amendments*).
**Authority:** this document fixes rule identity for v1.0.0. `rules/*.json` implements it; no other
document may add, rename, or retype a rule. After this freeze an identity change is an ordinary
catalog change carrying lifecycle metadata, never a silent edit here.

*Frozen* means an identity may not change without a decision that says so in writing. It does not
mean an error found before the first release must ship. The one amendment below is recorded with its
reasoning, its date, and its ADR, which is the difference between a governed change and a quiet one.

## What this document is for

The architectural law is that the catalog defines rule identity and the evaluator merely produces
evidence. That law is only real if identity is settled before any evaluator exists. If detectors are
written first, the rule set quietly becomes "whatever the detectors happened to find", which inverts
the law without anyone deciding to.

So the dependency direction is fixed and one-way:

```text
source prompt + external provenance  →  40 standards  →  this freeze  →  rules/*.json  →  detectors
```

Every identity below was derived from a requirement already written in `standards/`. Nothing here was
invented because a detector would be convenient to write, and one proposed detector was **dropped**
for exactly that reason (see *Reconciliation findings*, finding 3).

## The count is exact

**70 rules. 15 forbidden. 13 static detectors.**

The plan estimated "~55 rules" and 13 detectors. Those were planning figures produced before the
corpus existed. They are superseded here and must not reappear in verification language: from this
point a check that reads "55±" is checking nothing. `scripts/rule-identity.mjs` asserts the exact
numbers against this document, and this document against the corpus.

## How to read the tables

| Column | Meaning |
| --- | --- |
| `Rule` | The canonical id. Permanent. |
| `Std` | The owning standard — the one whose requirement *states* the rule. Other standards may cite it. |
| `Level` | `required`, `recommended`, `optional`, `forbidden`. Local governance strength only. |
| `Sev` | `error`, `warning`, `info`. |
| `Type` | validationType. Determines the evidence surface; a rule cannot declare a contradicting one. |
| `Asr` | assurance. `full` is legal only for `structural`, `document`, `configuration` (ADR 0005). |
| `Ex` | Exemptible. `no` means `nonExemptible: true` — a policy may not except it. |
| `Applies` | `appliesTo`. `any` = `any-ui`; `web` = `web-ui`; `proc` = `process`. |
| `Detector` | The v1.0.0 static detector bound to it, or `—`. No detector appears twice. |

`Level` is a local property and is never derived from an external source's conformance level. WCAG
Level A backs `accessibility.contrast` (a `required` rule) and also backs
`accessibility.no-color-only-critical-state` (a `forbidden`, non-exemptible one). See ADR 0013 and
Standard 38 R5.

---

## accessibility — 19

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `accessibility.img-alt-text` | Images carry an appropriate text alternative | 3 | required | error | code-analysis | partial | yes | any | img-alt |
| `accessibility.accessible-names` | Interactive elements have accessible names | 3 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.heading-structure` | Headings express document structure without skipped levels | 3 | required | warning | code-analysis | partial | yes | any | heading-level-skip |
| `accessibility.landmarks` | Page regions are identified by landmarks | 3 | recommended | warning | code-analysis | partial | yes | web | — |
| `accessibility.table-semantics` | Data tables carry header semantics | 3 | required | error | code-analysis | partial | yes | any | — |
| `accessibility.zoom-reflow` | Content reflows under zoom and text scaling | 3 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.contrast` | Contrast meets the project's declared target | 3 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.media-alternatives` | Time-based media carries alternatives | 3 | required | error | code-analysis | partial | yes | any | — |
| `accessibility.keyboard-operable` | Functionality is operable by keyboard | 4 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.focus-visible` | Keyboard focus is visibly indicated | 4 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.focus-order` | Focus order follows meaning and stays unobscured | 4 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.positive-tabindex` | Tab order is not overridden by positive tabindex | 4 | required | warning | code-analysis | partial | yes | web | positive-tabindex |
| `accessibility.dialog-focus-management` | Dialogs manage focus on open, during, and on close | 4 | required | error | browser-analysis | partial | yes | any | — |
| `accessibility.aria-valid-usage` | ARIA is used validly | 5 | required | error | code-analysis | partial | yes | web | aria-validity |
| `accessibility.pointer-target-size` | Pointer targets meet a minimum size | 5 | recommended | warning | browser-analysis | partial | yes | any | — |
| `accessibility.no-inaccessible-custom-controls` | Custom controls do not replace semantics with nothing | 29 | forbidden | error | code-analysis | partial | no | any | custom-control-semantics |
| `accessibility.no-removed-focus-indicators` | Focus indication is not removed | 29 | forbidden | error | code-analysis | partial | no | any | focus-visible-removal |
| `accessibility.no-color-only-critical-state` | Critical state is not encoded by color alone | 29 | forbidden | error | manual-review | none | no | any | — |
| `accessibility.not-deliberately-disabled` | Platform accessibility is not deliberately disabled | 29 | forbidden | error | code-analysis | partial | no | web | viewport-accessibility-disabling |

## ai-ux — 3

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ai-ux.proposal-vs-execution` | A proposal is visually distinct from an execution | 26 | required | error | manual-review | none | yes | any | — |
| `ai-ux.ai-failure-states` | AI failure and uncertainty have designed states | 26 | required | error | manual-review | none | yes | any | — |
| `ai-ux.no-generated-as-verified` | Generated content is not presented as verified | 29 | forbidden | error | manual-review | none | no | any | — |

## content — 2

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `content.error-messages-actionable` | Failure and consequence copy says what happened and what to do | 20 | required | warning | manual-review | none | yes | any | — |
| `content.button-labels-specific` | Action labels describe the action | 20 | recommended | info | manual-review | none | yes | any | — |

## design-integrity — 9

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `design-integrity.artifact-freshness` | Design artifacts and the implementation do not contradict each other | 30 | required | warning | document | partial | yes | any | — |
| `design-integrity.no-dark-patterns` | The interface does not manipulate its user | 29 | forbidden | error | manual-review | none | no | any | — |
| `design-integrity.no-fake-success` | Failure is not presented as success | 29 | forbidden | error | browser-analysis | partial | no | any | — |
| `design-integrity.no-fake-progress` | Progress indication corresponds to real progress | 29 | forbidden | error | manual-review | none | no | any | — |
| `design-integrity.no-fake-availability` | Unavailable capability is not presented as available | 29 | forbidden | error | manual-review | none | no | any | — |
| `design-integrity.no-inert-controls` | A control that does nothing is not presented as a control | 29 | forbidden | error | browser-analysis | partial | no | any | — |
| `design-integrity.no-fabricated-data` | Placeholder and invented data are not shipped as real | 29 | forbidden | error | code-analysis | partial | no | any | placeholder-content |
| `design-integrity.no-obscured-destruction` | Destructive consequence is not obscured | 29 | forbidden | error | manual-review | none | no | any | — |
| `design-integrity.no-weakened-visual-evidence` | Visual evidence is not weakened to make a check pass | 29 | forbidden | error | manual-review | none | no | any | — |

## design-system — 6

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `design-system.tokens-defined` | A declared design system defines its primitives | 6 | required | error | configuration | partial | yes | any | — |
| `design-system.tokens-used` | Implementations use the tokens that exist | 6 | recommended | warning | code-analysis | partial | yes | any | token-drift |
| `design-system.breaking-token-changes-versioned` | Breaking token changes are versioned | 6 | required | error | document | partial | yes | any | — |
| `design-system.component-reuse` | Reusable primitives are preferred over repeated local implementations | 7 | recommended | warning | manual-review | none | yes | any | — |
| `design-system.component-states-documented` | A reusable interactive component declares its states | 7 | required | error | document | partial | yes | any | — |
| `design-system.not-weakened-for-convenience` | Design-system requirements are not weakened for convenience | 29 | forbidden | error | manual-review | none | no | any | — |

## evidence — 1

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evidence.surfaces-declared` | The evidence surfaces a run used are declared in its output | 35 | required | error | structural | full | yes | proc | — |

## forms — 6

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `forms.control-label` | Every control has a programmatically associated label | 15 | required | error | code-analysis | partial | yes | any | form-control-label |
| `forms.required-status-indicated` | Required and optional status is visible before submission | 15 | required | warning | manual-review | none | yes | any | — |
| `forms.error-field-association` | A validation error is associated with the field that failed | 15 | required | error | code-analysis | partial | yes | any | — |
| `forms.data-preserved-on-error` | Entered data survives validation failure | 15 | required | error | browser-analysis | partial | yes | any | — |
| `forms.duplicate-submission-prevented` | Submission state is visible and duplicate submission is prevented | 15 | required | error | browser-analysis | partial | yes | any | — |
| `forms.button-type` | Buttons inside a form declare their type | 15 | required | warning | code-analysis | partial | yes | web | button-type-in-form |

## interaction — 5

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `interaction.states-complete` | Every meaningful interface state is designed and reachable | 16 | required | error | browser-analysis | partial | yes | any | — |
| `interaction.empty-states-differentiated` | Empty, filtered-empty, error, and loading are distinguishable | 16 | required | warning | manual-review | none | yes | any | — |
| `interaction.error-classes-distinguished` | Error classes stay distinguishable in presentation | 17 | required | error | code-analysis | partial | yes | any | — |
| `interaction.destructive-confirmation` | Destructive actions are confirmed proportionally to their consequence | 18 | required | error | manual-review | none | yes | any | — |
| `interaction.duplicate-component-signals` | Repeated implementations of one interaction pattern are surfaced | 7 | recommended | info | code-analysis | partial | yes | any | duplicate-component-signals |

## localization — 1

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `localization.no-string-concatenation` | Displayed sentences are not assembled by concatenation | 21 | required | error | code-analysis | partial | yes | any | — |

## motion — 2

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `motion.reduced-motion-support` | Motion respects a reduced-motion preference | 12 | required | error | code-analysis | partial | yes | any | reduced-motion-guard |
| `motion.purposeful` | Motion serves comprehension rather than decoration | 12 | recommended | info | manual-review | none | yes | any | — |

## navigation — 3

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `navigation.current-location-indicated` | The interface indicates where the user is | 14 | required | warning | browser-analysis | partial | yes | any | — |
| `navigation.deep-linkable` | Meaningful application states are addressable | 14 | recommended | warning | code-analysis | partial | yes | web | — |
| `navigation.unsaved-change-protection` | Navigation away from unsaved work is protected | 14 | required | error | code-analysis | partial | yes | any | — |

## performance — 2

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `performance.budgets-testable` | Declared performance budgets are expressed testably | 19 | recommended | warning | configuration | partial | yes | any | — |
| `performance.layout-stability` | Layout does not shift under the user | 19 | required | error | browser-analysis | partial | yes | any | — |

## privacy — 2

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `privacy.sensitive-data-masked` | Sensitive values are not exposed by default | 25 | required | error | code-analysis | partial | yes | any | — |
| `privacy.no-deceptive-consent` | Consent is not obtained deceptively | 29 | forbidden | error | manual-review | none | no | any | — |

## responsive — 2

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `responsive.viewport-behavior-defined` | Behavior at each declared viewport class is defined | 13 | required | error | document | partial | yes | any | — |
| `responsive.no-unintentional-overflow` | Content does not overflow unintentionally | 13 | required | error | browser-analysis | partial | yes | any | — |

## visual — 7

| Rule | Title | Std | Level | Sev | Type | Asr | Ex | Applies | Detector |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `visual.typography-scale` | A typography scale is defined and used | 8 | recommended | warning | configuration | partial | yes | any | — |
| `visual.color-roles-semantic` | Color is defined by role rather than by value | 9 | recommended | warning | configuration | partial | yes | any | — |
| `visual.dark-mode-designed` | A shipped dark mode is designed rather than inverted | 9 | optional | info | manual-review | none | yes | any | — |
| `visual.spacing-system` | A spacing scale is defined and used | 10 | recommended | warning | configuration | partial | yes | any | — |
| `visual.hierarchy-intentional` | Visual hierarchy reflects intended priority | 11 | required | warning | manual-review | none | yes | any | — |
| `visual.primary-action-identifiable` | The primary action of a view is identifiable | 11 | required | warning | manual-review | none | yes | any | — |
| `visual.regression-evidence` | Visual change is evidenced rather than asserted | 36 | recommended | warning | visual-analysis | partial | yes | any | — |

---

## Cross-references

`crossReferences` is **metadata and nothing else**. It records that a concern is owned elsewhere. It
never resolves as an id, never becomes an alias, never appears in a policy key, and — the constraint
that matters most — **no local field may be inferred from it**. A rule's level, severity, assurance,
applicability, exemptibility, and lifecycle are authored locally in the table above and read from
nowhere else. Deleting every row below would change no verdict this framework can produce.

Confirmed against `F:\Repos\EngineeringStandards\rules\*.json` on 2026-08-10; every target id below
was read from that catalog rather than recalled.

| Local rule | EngineeringStandards rule | Relationship |
| --- | --- | --- |
| `design-integrity.no-fake-success` | `errors.no-false-success` | presentation-of |
| `forms.data-preserved-on-error` | `data.no-silent-discard` | presentation-of |
| `ai-ux.proposal-vs-execution` | `ai.propose-execute` | presentation-of |
| `ai-ux.no-generated-as-verified` | `ai.no-fabricated-capabilities` | complements |
| `interaction.destructive-confirmation` | `ai.destructive-approval` | complements |
| `interaction.error-classes-distinguished` | `errors.no-swallowed-exceptions` | complements |
| `design-integrity.no-weakened-visual-evidence` | `meta.standards-not-weakened` | complements |
| `design-system.not-weakened-for-convenience` | `meta.standards-not-weakened` | complements |
| `design-system.component-reuse` | `architecture.no-duplicate-implementations` | complements |
| `design-integrity.artifact-freshness` | `documentation.code-consistency` | complements |
| `design-integrity.no-fabricated-data` | `quality.unfinished-work` | complements |

The structured-error *contract* has no distinct rule id in EngineeringStandards. Rather than invent a
reference to fill the row, Standard 17 R2 cites the concern in prose and
`interaction.error-classes-distinguished` carries only the `errors.no-swallowed-exceptions`
reference, which does exist.

## Framework-origin rules

A catalog rule with no owning standard requirement is normally a defect: it means an identity was
created by something other than the corpus. The one legitimate exception is a rule governing the
framework's own process rather than any interface, and such a rule must be declared here with its
source. `scripts/rule-identity.mjs` accepts an unowned rule **only** when a line of exactly this form
appears below — a declaration is a syntax, not a sentence, so that prose mentioning a rule id can
never be read as one:

```text
- DECLARED: `some.rule-id` — <the source that states it>
```

**None declared.** Every rule in v1.0.0, including the one `process` rule
(`evidence.surfaces-declared`, owned by Standard 35 R8), is stated by a standard requirement. The
declaration mechanism exists so that a future process rule is added deliberately and visibly rather
than by loosening the check.

---

## Reconciliation findings

Three disagreements surfaced when the corpus was reconciled against a catalog design. Each is
recorded with both sides, because silently picking a winner is how a corpus and a catalog drift
apart while both look correct.

### 1. One identity carried two validation types and named a concept another rule owns

`forms.validation-messages-actionable` was named by two Standard 15 requirements that cannot share an
identity:

| Requirement | Subject | Declared state in prose |
| --- | --- | --- |
| 15 R2 — required/optional status is indicated | which fields are mandatory | "`manual-review` aspect" |
| 15 R3 — errors are identified and associated with their field | error-to-field association | "`code-analysis`, partial" |

A rule has exactly one `validationType`, so this could not be catalogued as written. Worse, the id's
own name — *messages-actionable* — claims the subject that `content.error-messages-actionable` owns,
which Standard 17 R9 and Standard 20 R4 both explicitly assign to Standard 20. Two ids named one
concept while neither requirement was actually about it.

**Resolved by splitting, not by renaming one side into the other.** 15 R2 becomes
`forms.required-status-indicated` (`manual-review`) and 15 R3 becomes `forms.error-field-association`
(`code-analysis`). Both names now describe their requirement, and neither collides with Standard 20's
ownership of message wording. Standard 15's `## Implementation` table was corrected to match; the
corpus, not the catalog, held the error.

### 2. Two spellings of one relationship, deliberately kept

Standard 8 R1 (typography scale) and Standard 10 R1 (spacing scale) each own a domain-specific rule —
`visual.typography-scale`, `visual.spacing-system` — while Standard 9 R2 (color values are tokenized)
maps to the general `design-system.tokens-used`. A reader could reasonably call that inconsistent and
"fix" it by inventing `visual.color-tokens`.

**Kept as-is, recorded so it is not mistaken for an oversight.** The claims differ. A scale can exist
with no token system at all, so 8 R1 and 10 R1 are conditional on nothing. 9 R2's claim is literally
about tokenization, so its home is the token rule. No third id was created, because no third
requirement exists to own one.

### 3. A detector with no rule to bind to — dropped

The plan's detector design listed thirteen v1 detectors. Twelve bind to rules the corpus states. The
thirteenth, inline-style accumulation, binds to nothing: no requirement in any of the forty standards
prohibits or discourages inline styles, and the string does not appear in the corpus.

Two ways out were available. Create `visual.inline-style-accumulation` so the detector has an owner —
which is precisely the inversion this freeze exists to prevent, a rule existing because code was
convenient to write. Or drop the detector.

**The detector is dropped.** That decision stands: no rule was invented to give it an owner. v1.0.0
ships thirteen static detectors for an unrelated reason recorded under *Amendments* — the count
coinciding with the plan's original figure is arithmetic, not a reversal.
`06-evaluator-and-detectors.md` is corrected accordingly. If inline-style accumulation is worth
governing, the way in is a requirement in Standard 6 or 10 first, and then a rule, and then a
detector — in that order.

## Invariants this freeze commits to

- **Exactly 70 rules, 15 forbidden, 13 detectors.** Checked mechanically against this file.
- **Every id named in a standard's `## Implementation` table exists here.** An unknown id in prose is
  a failure, not a hint to add a rule.
- **Every rule here is owned by a standard requirement**, or is declared under *Framework-origin
  rules* with its source. There is no third state.
- **No detector binds to two rules.** One finding satisfies exactly one identity.
- **`crossReferences` is inert.** No local field is derived from one.
- **Level is local.** No external conformance level determines a rule's level, severity, or
  exemptibility.

## Amendments

An amendment is a change to this document after the freeze date. It requires a written decision, and
it is recorded here with what changed and why. There is one.

### 2026-08-11 — two forbidden rules claimed an evidence surface no implementation could reach

Recorded by ADR 0014. Found by the release-readiness checker, which reported it as a gap rather than
as a pass — the gap was real and this is its resolution.

`design-integrity.no-fake-progress` and `accessibility.no-inaccessible-custom-controls` were both
`forbidden`, both typed `code-analysis`, and neither had a detector. A `validationType` is a claim
about which evidence surface can establish a rule. Both rules made that claim and nothing in the
framework could honour it, so a reader comparing types against detectors would conclude these two
were machine-checked. Nothing false was *produced* — both reported `not-evaluated` and capped the
verdict, which is the correct failure mode — but the contract and the implementation disagreed, and
that disagreement was about to be frozen into the first immutable release.

The question asked of each rule was the same, and it was not "how do we get the release green": can
repository-static evidence establish this prohibition, with false-positive and false-negative
behaviour a project would accept? The two answers differ.

| Rule | Answer | Change |
| --- | --- | --- |
| `accessibility.no-inaccessible-custom-controls` | Yes | No catalog change. A detector was implemented. |
| `design-integrity.no-fake-progress` | No | `code-analysis`/`partial` → `manual-review`/`none`. |

**Custom controls — static evidence reaches it.** The prohibition is that a control built from a
generic element ships without the role, focusability, and keyboard behaviour the native control it
replaced would have supplied. All four of those are attributes, and the finding is their conjunction:
a click handler present, and role, tabindex, and key handler all absent. Any one of them present
means someone was restoring semantics and the detector stops. That leaves what the rule's own
assurance note already conceded — source cannot show the restored semantics are *correct*, which is
why assurance stays `partial` and every finding is labeled INFERRED. The identity, level, severity,
type, and assurance are unchanged; only an implementation appeared.

**Fake progress — static evidence does not reach it.** Whether a number is a measurement is a
question about the work it describes, not about the code that renders it. A timer-driven value, a
server-computed value, and a real measurement are the same expression at the call site. The
sibling rule `design-integrity.no-fake-success` is `browser-analysis` because success and failure
have objective external ground truth — an HTTP status contradicts a success message. A progress
percentage has no such external truth: a browser producer can watch a bar advance and still not know
what fraction is genuinely done. What remains is a reviewer who knows what the operation does, which
is `manual-review`, assurance `none`, and — as a consequence of the type — attestable, so the rule
gains a path to being established that it did not have before.

Re-typing was not a way of quieting the rule. `manual-review` forbidden rules are exactly as
unestablished without an attestation as they were before, they still cap the verdict at
`NOT_EVALUATED`, and this rule now sits with the seven other `manual-review` forbidden rules instead
of misrepresenting itself among the code-analysis ones.

**Semver consequence: none.** `introducedIn` stays `1.0.0` because v1.0.0 has not been released. A
type change to a released rule would be a breaking change; a correction before the first release is
the last moment at which it is free, which is the argument for making it here rather than deferring
it to 1.1.0.
