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
  "findings": [{ "id": "img-alt", "rule": "accessibility.img-alt-text", "category": "accessibility", "severity": "error", "label": "OBSERVED", "evidence": ["index.html:17"], "message": "…", "standardRef": null }]
}
```

It exits 0 even with findings. `--strict` exits 1 instead, for a consumer that wants discovery to
break a build — the default does not, because a discovery command that fails is a command people stop
running.

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
