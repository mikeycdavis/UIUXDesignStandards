# 04 — Project policy: schema, semantics, templates

The project policy declares what applies to a project. It never redefines what a rule means, and it
never establishes whether the project has a user interface.

Validation splits across two layers, which is the whole design of this section
([ADR 0012](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md)). The JSON
Schema validates representable shape — types, closed enumerations, patterns, and
`additionalProperties: false` everywhere. `scripts/policy.mjs` owns the cross-field invariants the
vendored evaluator's keyword set cannot express. Both layers reject; neither guesses.

Three kinds of failure, kept mechanically distinct because they are different facts:

```text
shape invalid — the document is not a policy                          → status invalid-shape,     exit 2
semantics invalid — it is a policy, and it is incoherent              → status invalid-semantics, exit 2
governance finding in a coherent policy — expired exception,
  exception on a non-exemptible rule, contradictory classification    → status findings,          exit 1
```

The two exit-2 states never share an output category. `status` distinguishes them, the JSON envelope
carries them in separate arrays, and the human output labels them `SHAPE` and `SEMANTICS`. A
malformed configuration is not a failing project; collapsing the two teaches CI that a broken file
and a broken product are the same event.

This section also produces the templates an adopting project copies, and this repository's own
policy — the first dogfooded instance, and therefore the pattern every adopter will inherit,
including its mistakes.

---

### Write the policy schema

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Reject structurally invalid policies, using only keywords the vendored evaluator
  provably implements.
- **Deliverables:** `schemas/project-policy.schema.json`, draft 2020-12, `additionalProperties:
  false` at the root and in every `$defs`. Seven top-level keys, `standardVersion` and `ui`
  required.
  The `ui` block, shape only: `applicability` (enum `no-ui|web-ui|mobile-ui|desktop-ui|embedded-ui|
  multi-platform`), `platforms[]`, `viewportClasses[]`, `accessibility.target` (enum
  `framework-baseline|wcag-2.1-a|wcag-2.1-aa|wcag-2.2-aa|wcag-2.2-aaa` — `none` is absent, so it is
  unrepresentable), `accessibility.assistiveTech[]`, `localization`, `designSystem`, `environments`.
  `attestations` use `reviewedAgainst: { paths[], contentIdentity?, revision? }` —
  `contentIdentity`, not `digest`
  ([ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)).
  Per-rule `applicability` entries gained the optional `evidence` string.
- **Acceptance Criteria:**
  - Every keyword used is in `jsonschema.mjs`'s supported set. No `if`, `then`, `oneOf`, `anyOf`,
    `allOf`, `minimum`, or `uniqueItems`.
  - The `$defs/ruleId` pattern is byte-identical to `CANONICAL_ID` in `scripts/catalog.mjs`,
    asserted by a test that reads both rather than by inspection.
  - An unknown top-level key and an unknown `ui` subkey are both rejected.
  - `ui.applicability` is documented in the schema itself as a declaration and a Gate 1 *input*,
    never its output.
- **Verification:**
  ```bash
  node -e "import('./scripts/jsonschema.mjs').then(async m=>{const fs=await import('node:fs');m.assertSchemaSupported(JSON.parse(fs.readFileSync('./schemas/project-policy.schema.json','utf8')));console.log('supported')})"   # → supported
  node --test test/policy.test.mjs      # → 28 pass
  ```
- **Dependencies:** `01-repo-skeleton-and-vendored-core.md`.

### Implement the cross-field semantic invariants

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Enforce the conditional requirements the schema cannot express, as configuration
  errors rather than compliance findings.
- **Deliverables:** `scripts/policy.mjs`, ported from EngineeringStandards and extended with a
  semantic pass that runs after structural validation. The invariants:
  1. `applicability: no-ui` forbids every other `ui` subkey.
  2. Any non-`no-ui` applicability requires `accessibility.target`
     ([ADR 0008](../adr/0008-an-applicable-ui-declares-its-accessibility-target.md)) — and a
     `no-ui` policy is never asked for one.
  3. Any non-`no-ui` applicability requires non-empty `platforms`.
  4. `multi-platform` requires at least two `platforms`.
  5. `web-ui` or `mobile-ui` requires non-empty `viewportClasses`.
  6. `localization.status: required` requires non-empty `locales`.
  7. `designSystem.strategy: none-justified` requires `justification`.
  8. Every rule id the policy names resolves in the catalog. A policy selects among the catalog's
     identities; it may not add one.
  Plus one-way alias resolution: an accepted legacy spelling normalizes to the canonical rule
  *before* exception, attestation, and applicability semantics are applied, so a finding always
  names the canonical id. Twenty fixtures in `test/fixtures/policies/`, in four named drawers.
- **Acceptance Criteria:**
  - Every invariant fails at exit 2 with status `invalid-semantics`, never exit 1, never as a rule
    result.
  - A shape failure reports no semantic errors and a semantic failure reports no shape errors — the
    two layers never both fire on one document.
  - Error messages name the offending field path.
  - No invariant is duplicated in the schema — one owner per concept.
  - The catalog is never mutated by policy resolution.
- **Verification:**
  ```bash
  node scripts/policy.mjs test/fixtures/policies/semantic-missing-accessibility-target.yml   # → exit 2, SEMANTICS
  node --test test/policy.test.mjs    # → the fixture sweep asserts all 20 land in their named drawer
  ```
- **Dependencies:** the policy schema; the frozen catalog.

### Write the adoption templates

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Give an adopting project a starting policy and the agent-facing routing documents,
  so adoption is a copy rather than an authoring exercise.
- **Deliverables:** `templates/project-policy.yml` (teaching comments on the three failure kinds, on
  `not-applicable` versus exception, and on non-exemptible rules;
  `accessibility.target: framework-baseline` written explicitly with a comment marking it a
  scaffolded selection that becomes the project's own declaration on adoption, and stating plainly
  that it is not evidence anyone reviewed anything); `templates/PROJECT.md` (with a mandatory *What
  has not been evaluated* section); `templates/AGENTS.md` (a router with a six-step load order, not
  a copy of the standards); `templates/CLAUDE.md` and `templates/copilot-instructions.md`, both
  pointing at `AGENTS.md` rather than restating it.
- **Acceptance Criteria:**
  - The scaffolded policy validates at exit 0 as written, with no edits required.
  - No template asserts that scaffolding is evidence of design intent.
  - `AGENTS.md` routes rather than restates, and says explicitly which rules cannot pass from a
    static run.
- **Verification:**
  ```bash
  node scripts/policy.mjs --dir=templates    # → exit 0
  ```
- **Dependencies:** the schema and the semantic invariants.

### Write this repository's own policy

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Dogfood the framework's process rules honestly, while stating plainly that its UI
  rules are not exercised here.
- **Deliverables:** root `project-policy.yml`: `ui.applicability: no-ui`, `exceptions: []`, and no
  per-rule declarations at all — see the gotcha below, which records why the planned sixty-nine
  `not-applicable` entries were *not* written. Comments state what a clean result here does and does
  not certify.
- **Acceptance Criteria:**
  - `exceptions` is empty.
  - No rule with a real subject in this repository is declared not-applicable.
  - The file explains, in comments, that a `no-ui` declaration certifies scope honesty and not UI
    quality, and that only the classifier can turn it into `NOT_APPLICABLE`.
- **Verification:**
  ```bash
  node scripts/policy.mjs    # → exit 0, "a valid 'no-ui' declaration"
  ```
- **Dependencies:** the templates; the frozen catalog.

---

## Gotchas this section discovered

**The `ui` block grew after this section closed, twice, and both times for the same reason.** Section
07 added `evidencePaths` and section 08 added `reviewPaths` and `reviewScopes` — each because an
evidence surface turned out to be able to choose its own subject and thereby widen its own claim by
measuring less. Section 08 also tightened the attestation shape: `reviewedAgainst` is now required,
`revision` must be a full commit SHA, and `contentIdentity` must be exactly the 32 hex characters the
shared primitive produces, so that a malformed record is unrepresentable rather than reported as
proved change. The cross-field layer gained one invariant: a policy that records an attestation and
declares no review subject for it is incoherent at exit 2. Both changes are recorded under Scope
changes in [`00-overview.md`](00-overview.md).

**A `type: boolean` field in this schema is unsatisfiable by any policy that will ever be written.**
`yaml.mjs` returns every scalar as a string, deliberately: type coercion belongs to the schema, and a
parser that turned `expires: 2026-12-31` into a Date would defeat the pattern check before it ran.
EngineeringStandards' policy has no boolean fields, so the collision never arose there. Ours planned
two — `localization.required` and `localization.rtl` — and both would have rejected every policy that
set them, discovered only by the first project to localize. They are string enumerations now, which
also buys something a boolean cannot express: `unknown` is a real answer, and this framework does not
convert an unanswered question into a `false`.

**The planned sixty-nine `not-applicable` declarations in the root policy were not written, and
should not be.** The plan called for declaring every UI-class rule not-applicable here, with the
class as the reason. That is the wrong mechanism, and writing it would have put a second, weaker
answer in front of Gate 1. Per-rule applicability is for a rule whose subject is absent from a
project that *has* an interface — no forms, no motion, no data tables. Whether the interface exists
at all is the classifier's question, answered from repository evidence. With the three-block envelope
([ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md)),
`uiCompliance` is `null` whenever applicability is not `APPLICABLE`, so the UI rules are already not
evaluated and already visible as such. Sixty-nine declarations would have added nothing except a set
of assertions for a future scan to argue with. One declaration, one classifier, one answer.

**The wording had to be policed, not just the logic.** It is easy to write "this project has no UI"
in a message emitted by a command that has read one YAML file and nothing else. Validating a
declaration is not corroborating it. Every output path here says "a valid `no-ui` declaration", the
JSON field is `declaredUiApplicability` rather than `applicability`, and a test asserts the string
`NOT_APPLICABLE` never appears in a policy result and that no key named `classification` exists. The
classifier's vocabulary is reserved for the classifier.

**Alias resolution had to be placed before the semantic checks, not after.** v1.0.0 ships no aliases,
so nothing would have caught the ordering being wrong. If a legacy spelling were resolved *after* the
non-exemptible check, an exception written under an old name against a forbidden rule would sail
through — the check would look up an id the catalog does not carry and find nothing. Resolution now
happens first, findings always name the canonical id, and a test with an injected alias catalog
proves it, along with the fact that the catalog is unchanged by having been asked.

**Fixture drawers need a sweep, or a fixture in the wrong drawer passes quietly.** Twenty policy
fixtures are named `valid-`, `shape-`, `semantic-`, `finding-`. Each individual test asserts its own
fixture's status, but a fixture nobody wrote a test for would simply sit there. The sweep asserts
every file lands in the category its name claims, and asserts each drawer is non-empty — because a
four-category sweep proves nothing if three of them are.
