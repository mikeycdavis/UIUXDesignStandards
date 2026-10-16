# Integration contract

What a governance tool may read out of this framework's output, and what it may conclude from it.

This document exists so that an adapter — in StandardsOrchestrator, in StandardsEnforcer, or
anywhere else — can be authored
from a specification rather than by reverse-engineering command output. Where a section says
*specified, not implemented*, the shape is fixed but no command emits it yet; an adapter written
against it will compile and will have nothing to read.

**Consumers read JSON. Consumers never read the exit code for the classification.** The exit code
says whether a verdict was reached; the envelope says what it was.

---

## 1. Exit codes

| Code | Meaning | An adapter should |
|---|---|---|
| `0` | The command ran and the condition it checks holds. | Read the envelope. |
| `1` | The tool worked, and the project has problems. | Read the envelope; it explains them. |
| `2` | No verdict was reached — bad invocation, unreadable input, unimplemented path. | Treat as infrastructure failure. **Never** as a pass, and never as a project finding. |

`1` and `2` are never collapsed. A consumer that maps both to "failed" makes breaking the tool an
equally effective way to change a red result into an amber one.

---

## 2. `uiux-standards applicability` — Gate 1

**Implemented.** `node scripts/uiux.mjs applicability [path] [--json] [--self]`

### 2.1 Envelope

```json
{
  "schemaVersion": "1.0",
  "tool": { "name": "uiux-standards", "version": "1.0.0" },
  "classifiedAt": "2026-08-10T00:00:00.000Z",
  "target": "/abs/path",
  "classification": "APPLICABLE | NOT_APPLICABLE | INDETERMINATE",
  "applicabilityClasses": ["web-ui"],
  "classResolution": "resolved | unresolved | not-established",
  "scan": {
    "complete": true,
    "filesExamined": 120,
    "capHit": false,
    "unreadable": [],
    "excluded": ["test/fixtures"],
    "manifestParsed": true
  },
  "signals": [{ "id": "html-documents", "detected": true, "label": "OBSERVED", "evidence": ["index.html"], "implies": ["web-ui"] }],
  "declaredPolicy": { "present": true, "class": "no-ui", "reason": null },
  "agreement": "match | conflict | undeclared | indeterminate",
  "reasons": ["…"]
}
```

Every one of the ten signal families is always present in `signals`, detected or not. An empty
result is not an absent one: a family omitted when it does not fire would make "we looked and found
nothing" indistinguishable from "we never looked".

### 2.2 Non-execution

When the classifier could not execute — target missing, target not a directory, target unlistable —
the envelope is different in kind, not merely in value:

```json
{
  "schemaVersion": "1.0",
  "tool": { "name": "uiux-standards", "version": "1.0.0" },
  "target": "…",
  "error": { "code": "CLASSIFIER_DID_NOT_EXECUTE", "message": "…" }
}
```

**There is no `classification` key, no `scan`, and no `signals`.** An adapter cannot accidentally
read a verdict out of a failure, because there is nothing there to read. This is the mechanical
distinction between *"I measured and could not establish it"* (`INDETERMINATE`, exit 0, full
envelope) and *"I could not measure"* (exit 2, error envelope).

### 2.3 Classification, and how it is reached

The precedence is fixed and ordered. The first matching rule wins.

| # | Condition | Classification | `agreement` |
|---|---|---|---|
| 0 | The classifier cannot execute | *(none — error envelope)* | — |
| 1 | `no-ui` declared, and ≥1 UI signal | `INDETERMINATE` | `conflict` |
| 2 | ≥1 UI signal | `APPLICABLE` | `match`, `conflict`, or `undeclared` |
| 3 | No signal, `no-ui` declared, scan complete | `NOT_APPLICABLE` | `match` |
| 4 | No signal, `no-ui` declared, scan incomplete | `INDETERMINATE` | `indeterminate` |
| 5 | No signal, a UI class declared | `INDETERMINATE` | `indeterminate` |
| 6 | No signal, nothing declared | `INDETERMINATE` | `undeclared` |

Two properties of that ordering are load-bearing:

**Rule 2 sits above scan completeness.** Incompleteness threatens a claim of *absence*, never a
signal already witnessed. An unreadable subtree blocks the exemption (rule 4) and leaves
`APPLICABLE` alone.

**`NOT_APPLICABLE` requires all three conditions.** One credible positive signal establishes
`APPLICABLE`; absence requires a declaration, a complete search, and zero contradicting evidence.
Presence can be witnessed. Absence has to be justified over a search surface — and a complete scan
establishes only that *the signals this classifier supports* were not present, which is a smaller
claim than "there is no interface here". The declaration carries the rest, which is why it is
required.

**The vendored pack is not part of the search surface.** The reusable workflow checks the pack out to
`<consumer>/.uiux-standards`, and that directory is excluded by name at any depth. The pack's own
`test/fixtures` contain deliberate UI markup; scanned from the consumer's root they would make a
genuinely no-UI consumer `INDETERMINATE` forever. The exclusion is recorded in `scan.excluded` and named in
`reasons` like every other one, and it is by directory name only, so a consumer's own
`src/fixtures` is still searched.

### 2.4 `agreement` is a separate axis from `classification`

`classification` is what the evidence supports. `agreement` is how the project's declaration relates
to it. They are independent, and an adapter that folds one into the other will get the common cases
wrong:

| Situation | `classification` | `agreement` |
|---|---|---|
| React app, no policy file | `APPLICABLE` | `undeclared` |
| React app, policy declares `web-ui` | `APPLICABLE` | `match` |
| React Native app, policy declares `web-ui` | `APPLICABLE` | `conflict` |
| Library, policy declares `no-ui` | `NOT_APPLICABLE` | `match` |
| Library, no policy file | `INDETERMINATE` | `undeclared` |

A missing declaration is a governance gap. It does not erase evidence that a UI exists.

### 2.5 `applicabilityClasses` and `classResolution`

`applicabilityClasses` contains only classes a signal *proves*. A `.tsx` file containing markup
proves a component tree exists; it does not prove the platform it renders on. That case is
`APPLICABLE` with `applicabilityClasses: []` and `classResolution: "unresolved"` — a real state, and
an honest one. An adapter must not treat an unresolved class as "no UI", and must not default it to
`web-ui`.

`classResolution` is `not-established` whenever the classification is not `APPLICABLE`.

### 2.6 Suggested mapping for a governance consumer

Vocabulary below is StandardsEnforcer's; the mapping is a recommendation, not part of this
framework:

```text
APPLICABLE                     → IN_SCOPE
NOT_APPLICABLE                 → OUT_OF_SCOPE_EVIDENCED
INDETERMINATE                  → SCOPE_REVIEW_REQUIRED
exit 2 / error envelope        → infrastructure failure (never a scope decision)
```

`agreement: conflict` and `agreement: undeclared` are governance facts worth surfacing on their own,
independently of the classification they accompany.

---

## 3. `uiux-standards validate` — the full gate

**Implemented.** `node scripts/uiux.mjs validate [path] [--json]`

`--evidence=<file>` is accepted by the parser and **rejected at exit 2**: browser-evidence ingestion
arrives with section 07, and reading a verdict from a run that silently ignored the evidence supplied
to it would misstate what was examined.

### 3.1 Gate order

```text
Gate 0   policy validity        invalid shape or semantics → exit 2, no evaluation
Gate 1   applicability          INDETERMINATE → no UI verdict, exit 1
Gate 2   rule evaluation        over the rules the classification admits
```

The gates run in that order and the order is observable: when Gate 0 or Gate 1 fails, **no compliance
block is emitted at all**. The static detectors do not run unless Gate 1 returned `APPLICABLE`, so a
UI result cannot exist before something established that UI rules have a subject here.

A policy that is *absent* is not a policy that is *broken*. A project with no `project-policy.yml`
runs all three gates, evaluates nothing, and reports `NOT_EVALUATED` at exit 1. Exit 2 is reserved
for a policy that exists and cannot be believed — otherwise deleting the file and corrupting it would
be indistinguishable.

### 3.2 The three-block envelope

```json
{
  "schemaVersion": "1.0",
  "standardVersion": "1.0.0",
  "project": "…",
  "applicability": { "…": "the Gate 1 envelope, verbatim" },
  "uiCompliance": null,
  "frameworkCompliance": { "status": "COMPLIANT", "…": "…" },
  "evidenceSurface": { "…": "…" },
  "auditedAt": "…"
}
```

`uiCompliance` is `null` in exactly the cases where the classification is not `APPLICABLE`.
`frameworkCompliance` — the evaluation of `appliesTo: ["process"]` rules — is never null, whatever
the classification. **No field changes meaning by context.** An adapter can reason about each block
without knowing anything about the other.

### 3.3 Exit behavior

| Classification | `uiCompliance` | Exit |
|---|---|---|
| `APPLICABLE` | populated | the ordinary verdict rules |
| `NOT_APPLICABLE`, `agreement: match` | `null` | `0` if `frameworkCompliance` passes |
| `INDETERMINATE`, any cause | `null` | `1` |

`INDETERMINATE` never produces a compliant UI verdict and never exits 0. **A passing
`frameworkCompliance` does not rescue it**: the two blocks answer different questions, and the
process rules being satisfied says nothing about whether the UI rules were ever reachable. The
top-level exit is not the framework-process verdict.

### 3.3a Identity refusal — a record, and deliberately not an envelope

When Gate 0b refuses — the executing framework is not the release the policy names — `validate
--json` emits a record of the refusal rather than a compliance envelope:

```json
{
  "schemaVersion": "1.0",
  "tool": { "name": "uiux-standards", "version": "1.0.0" },
  "target": "…",
  "error": { "code": "EXECUTED_TREE_IS_NOT_THE_RELEASE", "message": "…" },
  "versionIdentity": { "identity": "EXECUTED_TREE_IS_NOT_THE_RELEASE", "blocking": true, "…": "…" }
}
```

`error.code` is the identity state itself — one of `VERSION_MISMATCH` or
`EXECUTED_TREE_IS_NOT_THE_RELEASE` — so **an adapter reads a key and never parses a message.**
`versionIdentity` is the same block a successful run carries, so one shape is parsed either way.

**There is no `status`, no `score`, no `applicability`, no `uiCompliance`, and no
`frameworkCompliance` — not even set to `null`.** A compliance envelope answering `null` is still a
compliance envelope answering, and the whole point of the refusal is that this run may not answer.
This is §2.2's argument on the other side of the gate: *"I could not measure"* must not be
reachable as *"I measured"*.

The refusal still exits 2, and it establishes nothing about the project. Without `--json` the record
is not written at all, because stdout is then addressed to a person.

Through the reusable workflow the record lands in the same `envelope.json` artifact a verdict would
have used, because the redirect is chosen before the outcome is known. **An adapter must therefore
discriminate on keys, not on the file name:** `status` present means a compliance envelope, `error`
present means a refusal. Both files are non-empty, so an empty one still means the step never ran.

Exit 2 by any **other** route — an unreadable policy, an invalid evidence document, an unknown rule
id in ingested evidence — writes nothing to stdout today. An adapter must therefore treat *absence*
of a record as a non-identity configuration failure, and read `validate.err` for it.

### 3.4 Per-rule dispositions an adapter will meet

| Disposition | Status | What it means |
|---|---|---|
| `evaluated` | `passed`/`failed`/`warning` | A check ran and reached a conclusion. |
| `not-applicable` | `skipped` | The policy declared this rule has no subject here, with a reason. |
| `not-applicable-by-class` | `skipped` | The rule governs a UI class this project declares it is not, and the evidence corroborates the declaration. |
| `class-unresolved` | `skipped` | The rule governs a specific UI class, and the evidence established an interface **without** establishing its class. Not a pass and not an exclusion. |
| `evidenced` | `passed`/`failed`/`warning` | Ingested browser or visual evidence reached a conclusion. |
| `partial-coverage` | `skipped` | Every conclusive check passed, over a surface that was not fully exercised. Not a pass. |
| `evidence-unavailable` | `skipped` | An evidence attempt was made and established nothing — the run failed, or its identity could not be reconstructed. |
| `stale-evidence` | `skipped` | The evidence describes a different revision of the reviewed paths. |
| `not-evaluated` | `skipped` | Nothing established it: no detector, no evidence supplied, no attestation, an expired review, or a detector that met no instance of its subject. |
| `attested` | `passed` | A recorded human review established it. |
| `attested-rejected` | `failed` | A human reviewed it and found it unmet. |
| `contradicted-attestation` | `failed` | A review approved it and a check or a run witnessed it failing. |
| `invalid-attestation` | `failed` | A review was recorded for a rule the catalog does not make attestable. |
| `unscoped-review` | `skipped` | A review exists and the policy declares no subject for it to cover. |
| `partial-review` | `skipped` | The review covered part of the declared subject. Not a pass. |
| `contradicted-applicability` | `failed` | The policy said the subject is absent; a check found it. |

`not-applicable` and `not-applicable-by-class` leave the applicable denominator. `class-unresolved`
does **not** — "we do not know whether this rule applies" is not "this rule does not apply". On a
`forbidden` rule, each of `not-evaluated`, `evidence-unavailable`, `stale-evidence`,
`class-unresolved`, `partial-coverage`, `unscoped-review`, and `partial-review` joins
`unestablishedProhibitions` and caps the verdict.

`stale-evidence` and `evidence-unavailable` are reached from **both** the browser surface and the
human one. The disposition says why a rule was not established; `validationType` on the same result
says which surface failed to establish it. An adapter that needs the distinction reads two fields, and
never has to infer one from prose.

An `attested` result carries `validationType: "manual-review"` even when the rule's declared type is
`visual-analysis`, and it is counted in the `manualReview` assurance bucket. The bucket follows the
surface that established THIS result, not the surface the rule could in principle use: filing a
human-established result under `visualAnalysis` would claim a machine looked.

**`evidence-unavailable` is not the same as no evidence.** It means an attempt was made and
established nothing. A project that supplied no `--evidence` reports `not-evaluated`, which is the
ordinary state of a project that has not adopted the surface — not a fault, and an adapter must not
render it as one.

### 3.5 Class scoping

`appliesTo` on a rule is matched against the classes Gate 1 **proved**, never against the class the
project declared:

```text
appliesTo includes any-ui                              → evaluated
a proven class is in appliesTo                         → evaluated
declaration corroborated by evidence, and it excludes
  every class in appliesTo                             → not-applicable-by-class
anything else                                          → class-unresolved
```

A declaration alone never scopes a rule in. Resolving the class needs evidence of it — a web
framework dependency, an HTML document, a mobile project layout — which is a real cost and the honest
one. An adapter must not read `class-unresolved` as either a pass or an exclusion.

### 3.6 What the static layer can establish

Twelve static detectors exist, each bound to exactly one catalog rule id. Eleven can gate `validate`;
`interaction.duplicate-component-signals` is audit-only and is never an input to a verdict. Every
other rule in the catalog reports `not-evaluated` until its own evidence surface supplies something —
a browser run (section 07) or a recorded human review (section 08).

A detector contributes its rule to the evaluated set **only when it met an instance of its subject**.
A project with no images has not satisfied the alt-text rule; nothing looked at anything. That is
`not-evaluated` with the reason recorded, never `passed`.

---

## 4. `uiux-standards audit` — evidence discovery

**Implemented.** `node scripts/uiux.mjs audit [path] [--json] [--strict]`

`audit` consults no policy, evaluates no rule, and emits **no `status` and no `score`**. An adapter
that wants a verdict must call `validate`; there is deliberately nothing in the audit envelope to
mistake for one.

```json
{
  "schemaVersion": "1.0",
  "repo": "/abs/path",
  "auditedAt": "…",
  "evidenceSurface": { "…": "see below" },
  "detectorsExamined": ["accessibility.img-alt-text"],
  "detectorsWithoutSubject": [{ "rule": "…", "detector": "…", "reason": "…" }],
  "detectorsUnexaminable": [{ "rule": "…", "detector": "…", "evidence": ["styles.scss:12"], "reason": "…" }],
  "findings": [{ "id": "img-alt", "rule": "accessibility.img-alt-text", "category": "accessibility", "severity": "error", "label": "OBSERVED", "evidence": ["index.html:17"], "message": "…", "standardRef": null }]
}
```

It exits 0 even with findings. `--strict` exits 1 instead, for a consumer that wants discovery to
break a build — the default does not, because a discovery command that fails is a command people stop
running.

`detectorsUnexaminable` lists spans a detector met but could not read statically (for example a SCSS interpolation whose value is a variable in an outline or ring declaration). A span is never counted as examined-clean: a rule with any such span and no established finding is not in `detectorsExamined` and appears in `detectorsWithoutSubject`. The one exception is a rule for which the detector also established a definite violation: it stays in `detectorsExamined` (so validation reports the failure) and is omitted from `detectorsWithoutSubject`, while the unreadable span is still listed in `detectorsUnexaminable`.

**Line anchor.** In `findings[].evidence` and `detectorsUnexaminable[].evidence` an entry `path:line` names the line containing the first non-whitespace character of the construct's head: for a style rule, the first character of its selector (the rule head), not the line of any declaration inside it and not the end of the preceding rule. A declaration line is not reported; a multi-line rule reports the line it starts on. For a one-line rule the two coincide. (Owner decision on ST-05, option A.)

**Decided forms of `accessibility.no-removed-focus-indicators` (a closed list).** The detector decides the
forms below and routes everything else to `detectorsUnexaminable` with a named reason. An unexaminable form is never an
exemption and never a pass: a rule with one and no established finding is not in `detectorsExamined`. The detector does
not model the CSS cascade (importance, specificity, source order, layers, `all`, custom properties, Sass variables,
functional selectors, cross-rule interaction). A form is added to this list only with a decision and a test, never in passing.

| Decided (one block, plain literal values) | Rule |
| --- | --- |
| Selector | a style rule whose branches are simple selectors (type, class, id, attribute, universal, combinators) with pseudo-classes from `:focus :focus-visible :focus-within :hover :active :visited :link :disabled :enabled :checked :required :optional :invalid :valid :read-only :read-write :placeholder-shown :first-child :last-child :only-child :first-of-type :last-of-type :only-of-type :empty :target`, pseudo-elements from `::before ::after ::first-line ::first-letter ::placeholder ::selection ::marker` (only the first four may be written with a single colon), and `:not(:focus-visible)`; the focus pseudo-class must be on the rule's subject (its last compound: `.btn:focus .icon` styles the icon and is not a focus rule; a pseudo-element subject such as `:focus::before` is not the focused element either); nesting whose enclosing rules declare nothing the nested rule could inherit |
| Removal | exactly one `outline` declaration in the block, whose value is `none` or `0` |
| Not a removal | exactly one `outline` declaration of a non-zero literal width (`2px`, `0.5em`; never `auto` without one), a style from `dotted dashed solid double groove ridge inset outset auto`, and exactly one more token, which must be a colour (an omitted colour is `currentcolor`, which cannot be shown to paint) (a hex, a colour function such as `rgb()`, a colour name, or `var()`/`env()`); a zero width, `thin`/`medium`/`thick`, `none`, `0` or any other token in the colour place is not a colour |
| Replacement indicator | a declaration of `box-shadow`, `border` (or a physical/logical side shorthand of it, which must carry a drawn style and a non-zero literal width: `border-top: 2px red` draws nothing), `background`, `background-color`, or `text-decoration` with a value that fits THAT property's grammar and can be shown to paint (`box-shadow`: comma layers of two to four contiguous lengths (zero, or a number with a length unit; never a percentage or a bare non-zero number), at most one `inset`, a non-negative blur (the third length), some area (a non-zero offset, a positive blur or a positive spread; a negative spread is off the list, its effect depending on the box), and exactly one opaque colour; `background`/`background-color`: one opaque colour; `text-decoration`: a unique line keyword plus an optional style keyword and length and exactly one opaque colour (`text-decoration-line` alone defaults to `currentcolor` and is off the list); opaque colour = a 3- or 6-digit hex, `rgb()`/`hsl()` without alpha, or a CSS named colour other than `transparent`/`currentcolor`; a gradient, `url()`, `rgba()`, a 4- or 8-digit hex, an unknown identifier, or a keyword the property does not accept is off the list, as is `background-image` on its own), or an `@apply` of `ring`/`ring-1`/`ring-2`/`ring-4`/`ring-8` (`ring-0` and `!important` as in the ring model), in the same block |
| Exemption | `:focus:not(:focus-visible)` |
| Interpolation | SCSS interpolation in a declaration whose value is statically readable (`#{none}`, a quoted literal); an unknown span, or any interpolation in a selector head (even a readable one, because resolving it pads it with spaces that would read as a combinator), is off the list; a top-level selector list is judged branch by branch |

| Off the list: `detectorsUnexaminable[].reason` | Forms |
| --- | --- |
| a functional or unlisted pseudo-class selector is outside the decided list of selector forms | `:is() :where() :not()` other than `:not(:focus-visible)`, `:has() :host() :nth-*()`, any other pseudo-class or functional selector, an unresolved `&` (a top-level `&` has no parent and is invalid Sass) |
| an interpolation in the selector may make it a focus rule | an unknown interpolation anywhere in a selector, or any interpolation in a selector head |
| a comment inside the selector may split or join its compounds | a `/* */` or `//` comment between the parts of a selector head (a comment before the head is not inside it) |
| a selector the closed list does not positively recognise (malformed or unlisted syntax) | a selector that is not compounds of type/universal, `#id`, `.class`, `[attribute]`, listed pseudo-classes and pseudo-elements joined by descendant, child or sibling combinators (`:focus..x`, `a >> b`, a trailing combinator, a pseudo-element before a combinator, an empty list member such as `:focus,`, an attribute selector without a value after its operator, a leading combinator in a composed selector, Less `@{...}` interpolation, Sass `#{...}` interpolation outside a `.scss` file, a parent selector `&` that is not at the start of a compound, and ANY malformed member in a selector list, which invalidates the whole list) |
| a CSS escape in the selector may spell a focus pseudo-class | a backslash escape anywhere in a selector (for example the escaped spelling of focus) |
| a Sass placeholder selector emits nothing unless it is extended, and an @extend may be in another file | `%name` anywhere in a selector |
| the outline is not removed by exactly one plain 'outline: none\|0' declaration (several declarations, a longhand, all:, an important or unresolved value are not decided) | several `outline` declarations, `outline-style`, `outline-width`, `all`, `!important`, `var()`, `env()`, a Sass variable, an interpolation or a calculation in the outline, or an outline that is neither the removal nor the not-a-removal form |
| a replacement indicator is not a plain literal in this block (an unresolved, calculated, disabled, important or repeated value is not decided) | an unresolved, calculated (`calc() min() max() clamp()`), disabled (`none`, `0`, `transparent`, `initial`, `unset`, `revert`, `inherit`) or `!important` value of an indicator property, an unknown `@apply` token |
| a nested rule inherits declarations of an enclosing rule or layer, and the cascade between them is not decided | a rule nested under a rule or group at-rule that declares an indicator, outline or `@apply`; any rule inside `@layer` |
| an interpolation or a CSS escape in a property name may be outline or an indicator property; an interpolation outside a property: value declaration | an unknown property name or declaration shape |
| the rule is nested deeper, or its composed selector list is longer, than the decided bound (32 levels, 256 selectors) | nesting beyond 32 levels, or a rule whose composed selector list (the cross product of comma lists with its ancestors) exceeds 256; work per rule is bounded, so a small hostile file cannot exhaust memory or time |
| a control directive, @include, @extend or mixin call in the rule may change its declarations, which are not modelled | a block-less `@include`, `@extend` or Less mixin call (`.ring();`) in the rule's own text, or a control directive / `@include` block inside it |
| it sits inside an @include / control directive / mixin whose selector semantics are not modelled | `@include`, `@each`, `@if`, `@else`, `@for`, `@while`, `@mixin`, `@function` |
| a nested property block spells its declarations indirectly | `outline: { style: none }` under a focus rule |

**The `var()` assumption, stated once.** A custom property is decided in exactly one place: the colour token of a
restoring outline whose width and style are literal (a literal width and style with a `var()` colour, the form the compliant fixture
uses), where it is assumed to resolve to a colour. Everywhere else `var()`, `env()`, a Sass variable or an interpolation is
unresolved: in the outline's width, style or whole value, and in any replacement indicator's value, it makes the rule
unexaminable (a `box-shadow` declared through `var()` is not decided as an indicator).

**Deliberate widenings and narrowings against main (for owner awareness).** These forms changed by design:
a replacement indicator that main did not count (`border-top`, `text-decoration`,
logical borders) now compensates an `outline: none`, while a bare `border-color` (which draws nothing without a style), `outline-offset` and `outline-color` (an `outline: none` leaves no style for them to act on) no longer do; a rule whose subject is not focused (`input:focus + label`,
`.btn:focus .icon`, `:focus &`) now produces no record (main reported `.btn:focus .icon`); and every form that
main decided but the closed list does not (functional selectors, `all:`, `!important`, `var()`, disabled or repeated indicator
values, nested inheritance, `@layer`, directives, placeholders, escapes, selector interpolation) is now
unexaminable, so `validate` moves from failed to not-evaluated for those rules.

A selector list is read branch by branch: a decided focus branch still establishes a finding beside an off-list branch, which is
recorded as unexaminable. Cross-rule interaction (an indicator declared by another rule) is not part of the decided model, as on main.

`evidenceSurface` is present on both commands, always, with not-attempted defaults:

```json
{
  "sourceRead": { "files": 22, "filesSeen": 124, "capHit": false, "unread": [], "unreadable": [], "excluded": ["test/fixtures"], "selfExcluded": [] },
  "routesDiscovered": [],
  "storybook": "available | unavailable | not-detected",
  "tokenSystem": { "detected": false, "evidence": [] },
  "viewportQueries": [],
  "browserRun": { "status": "not-attempted", "runAt": null, "viewportsTested": [], "routesTested": [], "routesFailed": [], "screenshotsCaptured": 0, "evidenceFreshness": "n/a" },
  "designArtifactsFound": []
}
```

An empty surface is reported as empty, never omitted: `browserRun.status: "not-attempted"` and an
absent `browserRun` key are different claims, and only one of them is honest about what happened.
`excluded` and `selfExcluded` name what was deliberately not searched.

## 5. Browser evidence — the producer's contract

**Implemented (ingestion only).** `node scripts/uiux.mjs validate [path] --evidence=<file>`

This framework defines and verifies the evidence contract; it does not produce browser evidence
(ADR 0002). Schema: [`schemas/browser-evidence.schema.json`](../schemas/browser-evidence.schema.json).

### 5.1 Four axes, none of which implies another

```text
run completion   did the producer finish?
freshness        does the record describe the source as it stands now?
coverage         was the subject exercised — every route, every declared viewport class?
check outcome    what did the producer observe about THIS rule, at THIS route and viewport?
```

A rule is established as **passing** only when all four hold. A rule is established as **failing** on
one conclusive failure, whatever coverage says: a failure witnessed at one route is a fact about the
interface, while a pass is a claim that a defect is absent and needs the surface to have been
covered. Presence can be witnessed; absence has to be justified over a search surface.

The precedence, first match wins:

```text
a static finding exists              → failed              evidence outranks silence
no evidence was supplied             → not-evaluated
the run did not complete             → evidence-unavailable
the identity is stale                → stale-evidence
the identity is unreconstructable    → evidence-unavailable
any conclusive failure               → failed
no conclusive pass                   → not-evaluated
coverage incomplete, or any
  inconclusive check for this rule   → partial-coverage
otherwise                            → evidenced / passed
```

There is no majority vote anywhere in it. A `passed` check recorded on a route the run did not finish
contributes nothing; a `failed` one on the same route still counts.

### 5.2 Coverage

Assessed against declarations and observations the producer does not control, so that narrowing a run
cannot widen its claim:

- every enumerated route reached `tested` — a `failed` or `skipped` route was not exercised;
- every class in the policy's `ui.viewportClasses` was tested;
- the run enumerated at least as many routes as the source scan found route modules. This one is
  INFERRED — route modules and URL routes do not correspond one to one — so it is reported with both
  numbers and can only ever make coverage incomplete.

`evidenceSurface.browserRun.coverage` carries the whole assessment, including the reasons.

### 5.3 What makes a record invalid — exit 2, never a finding

```text
unreadable, unparseable, or schema-invalid
a rule id the catalog does not define
a rule whose validationType is not browser-analysis or visual-analysis
a check on a viewport the record does not declare
an identity over paths other than the policy's declared ui.evidencePaths
```

Each is a defect in a producer, not a fact about a project. A producer may not establish a
`code-analysis` or `manual-review` rule through a browser merely because the rule id exists — the
surface a rule is established through is the one its `validationType` names.

`ui.evidencePaths` is optional. Declaring it binds the producer to the project's subject; leaving it
absent means the producer's own declared paths are used, and the identity covers only what it says it
covers.

## 6. Attestations — the human evidence surface

An attestation lives in the project policy under `attestations.<ruleId>`. It is evidence, not a
waiver: it says the rule applies and a person reviewed it and found it satisfied.

### 6.1 Precedence, in order

```text
the rule is not attestable                  → invalid-attestation      failed
a check or a run witnessed a failure        → contradicted-attestation failed
the review recorded a rejection             → attested-rejected        failed
the attestation has expired                 → not-evaluated
the content identity is STALE               → stale-evidence
the content identity is EVIDENCE_UNAVAILABLE→ evidence-unavailable
no review subject is declared               → unscoped-review
the review did not cover the subject        → partial-review
fresh, approved, covering the subject       → attested                 passed
```

Rows 1–3 above row 9 is the whole ordering: **evidence outranks assertion.** A fresh approved review
never erases a witnessed failure, and that is also why an attestation cannot clear a `nonExemptible`
rule — the failure survives the review rather than being separately prohibited.

Rows 4–8 are unestablished, and none of them is a failure. A review that has expired or gone stale is
not a project doing something wrong; it is a project that stopped having current evidence.

### 6.2 Scope is declared by the project, not by the reviewer

A browser producer enumerates the routes it visited, and that list can be checked against what the
source scan found. A reviewer's account of what they read has no independent counterpart. So the
required subject is declared in the policy, ahead of and apart from any review:

```text
ui.reviewPaths              the material a review must cover
ui.reviewScopes.<ruleId>    a per-rule narrowing of it
```

Coverage is by containment — naming a directory covers what is inside it; naming a file inside a
required directory does not cover the directory. Reviewing more than required is not an error.

A policy that records an attestation and declares no subject for it is a configuration error at
exit 2. Freshness is checked over `reviewedAgainst.paths` and is path-scoped: work outside the
reviewed material never stales a review.

### 6.3 What makes an attestation invalid — exit 2, never a finding

```text
a rule id the catalog does not define
a missing reviewedAgainst block
a revision that is not a full 40-character commit SHA
a contentIdentity that is not the 32 hex characters the primitive produces
an attestation recorded with no declared review subject
```

An attestation on a rule the catalog does not make attestable is deliberately **not** in this list. It
is a policy error the run reports as `invalid-attestation` — a fact about a project's configuration,
observable alongside everything else, rather than a reason to produce no verdict at all.

## 7. Versioning

Three versions travel independently and mean different things:

- `tool.version` — the release of this framework.
- `standardVersion` — the framework version a project declares it is evaluated against.
- `schemaVersion` — the shape of the envelope itself. An adapter pins this.

A consumer pinning this repository should pin a commit sha rather than a tag. Tags are mutable; the
sha is the guarantee.
