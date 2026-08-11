# 03 — Rule catalog

The catalog is the single canonical identity for every enforceable rule. Nothing else — not the
standards prose, not the policy, not a detector, not CI — may invent an alternative identity or
meaning.

This section has an ordering constraint that matters more than its content. **Rule identity freezes
in a reviewed design artifact before any evaluator code exists.** The reason is architectural: if
detectors are written first, the rules quietly become "whatever the detectors happen to find", which
inverts the law that the catalog defines identity and the evaluator merely produces evidence. The
freeze is what stops that inversion, and it is the acceptance criterion for the first item below.

Fifteen domains, one JSON file each: the thirteen the source prompt mandates plus `localization` and
`evidence` ([ADR 0007](../adr/0007-rule-id-grammar-admits-hyphenated-domains.md)).

The dependency direction this section establishes, one-way and mechanically checked:

```text
source prompt + external provenance  →  40 standards  →  the freeze  →  rules/*.json  →  detectors
```

---

### Freeze the rule identities in a reviewed design artifact

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Fix every rule id, level, severity, validation type, assurance, exemptibility, owning
  standard, applicability, and cross-reference before implementation, so detector work cannot
  influence rule identity.
- **Deliverables:** [`artifacts/design/rule-catalog-v1.md`](../design/rule-catalog-v1.md) — **70
  rules, 15 forbidden, 13 detectors**, one row per rule with every authored field, derived from the
  identities the forty standards already name. Plus `scripts/rule-identity.mjs`, which reconciles
  corpus, freeze, and catalog and runs before `rules/` exists. Detector ownership is settled here,
  explicitly, so no finding satisfies two identities:
  - `aria-hidden` on an interactive element → `accessibility.aria-valid-usage` (generic ARIA misuse;
    intent is not inferable from source).
  - Viewport accessibility disabling (`user-scalable=no`, restrictive `maximum-scale`) →
    `accessibility.not-deliberately-disabled`, with its own detector and fixture pair.
  - Custom-control accessibility signals → `accessibility.no-inaccessible-custom-controls`.
  No rule for applicability itself: [ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md)
  places the gate outside the machinery it gates.
- **Acceptance Criteria:**
  - Every forbidden-level rule from source prompt §31, §32, and §56 has an id. Standard 29's fifteen
    requirements and the fifteen forbidden rules correspond one to one.
  - Every rule names an owning standard that exists in `standards/` **and that actually states it**.
    Naming a standard that does not state the rule is a failure, not a formatting matter.
  - Every rule states which detector, if any, binds to it — and no detector appears against two.
  - Every rule is owned by a standard requirement, or is declared framework-origin with its source.
    There is no third state.
  - The exact count is stated and checked. `~55` no longer appears in any verification.
- **Verification:**
  ```bash
  node scripts/rule-identity.mjs        # → exit 0, 70 frozen rules reconciled
  node --test test/rule-identity.test.mjs   # → 28 pass
  ```
- **Dependencies:** `02-standards-corpus-and-provenance.md` — a rule cannot name a standard that has
  not been written.

### Author the fifteen catalog files

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Turn the frozen design artifact into the machine-readable catalog the evaluator loads.
- **Deliverables:** `rules/accessibility.json` (19), `design-integrity.json` (9), `visual.json` (7),
  `design-system.json` (6), `forms.json` (6), `interaction.json` (5), `ai-ux.json` (3),
  `navigation.json` (3), `content.json` (2), `motion.json` (2), `performance.json` (2),
  `privacy.json` (2), `responsive.json` (2), `localization.json` (1), `evidence.json` (1). Each
  `{ $comment, rules: [] }`. Every rule carries the 17 base fields plus `appliesTo` and
  `crossReferences`, with the lifecycle trio present and null, and `$assuranceNote` on every rule
  whose assurance is below `full` — 69 of the 70.
- **Acceptance Criteria:**
  - The catalog loads without `CatalogError`.
  - The set of ids exactly matches the freeze, field for field, in both directions.
  - Fifteen forbidden-level rules, every one non-exemptible.
  - No rule claims `full` assurance with a `code-analysis`, `browser-analysis`, `visual-analysis`,
    or `manual-review` type. Exactly one rule claims `full`: `evidence.surfaces-declared`, which is
    `structural`.
  - No local rule id shadows any concern on Standard 02 R3's deliberately-not-duplicated list.
- **Verification:**
  ```bash
  node -e "import('./scripts/catalog.mjs').then(async m=>{const c=await m.loadCatalog('./rules');console.log(c.rules.size,[...c.rules.values()].filter(r=>r.level==='forbidden').length)})"   # → 70 15
  node --test test/catalog.test.mjs     # → 20 pass
  ```
- **Dependencies:** the frozen design artifact; the extended catalog loader from
  `01-repo-skeleton-and-vendored-core.md`.

### Pin the cross-references against the EngineeringStandards catalog

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make every cross-repository reference name a rule that actually exists, so the
  boundary in Standard 02 is verifiable rather than asserted — and make it structurally impossible
  for such a reference to influence a local decision.
- **Deliverables:** eleven `crossReferences` entries, each read from
  `F:\Repos\EngineeringStandards\rules\*.json` on 2026-08-10 rather than recalled:
  `errors.no-false-success`, `data.no-silent-discard`, `ai.propose-execute`,
  `ai.no-fabricated-capabilities`, `ai.destructive-approval`, `errors.no-swallowed-exceptions`,
  `meta.standards-not-weakened` (twice), `architecture.no-duplicate-implementations`,
  `documentation.code-consistency`, `quality.unfinished-work`. Plus a **closed key set** on
  `crossReferences` entries in `catalog.mjs`: `repository`, `ruleId`, `relationship`, `note` and
  nothing else.
- **Acceptance Criteria:**
  - Every `crossReferences.ruleId` resolves in the EngineeringStandards catalog, checked at run time
    rather than at authoring time, and reported `NOT_EVALUATED` by name where that repository is
    absent rather than silently passing.
  - No `crossReferences.ruleId` collides with a local id or alias.
  - A cross-reference entry cannot carry a rule property. `level` on one is a load-time error.
  - No cross-reference is invented to fill a gap; the structured-error contract has no distinct
    EngineeringStandards id, so it stayed prose in Standard 17 R2.
- **Verification:**
  ```bash
  node scripts/rule-identity.mjs        # → "cross-references: 11 ... resolved against 50 ... rules"
  node scripts/provenance.mjs           # → exit 0, rule-level coverage no longer NOT_EVALUATED
  ```
- **Dependencies:** the fifteen catalog files.

---

## Gotchas this section discovered

**The corpus, not the plan, determined the rule count.** The plan estimated `~55` rules and thirteen
detectors. The forty standards actually name seventy identities. Neither number was wrong when it was
written — one was an estimate made before the corpus existed and the other is a count of what the
corpus says — but only one of them can be checked. `~55` is now gone from every verification, because
an approximate count makes the mechanical check unwritable: the freeze asserts **70 rules, 15
forbidden, 13 detectors** and a test breaks each of those three numbers to prove the assertion bites.

**The freeze's original verification was a git-history check, and it is not currently runnable.**
The plan verified the ordering with `git log --diff-filter=A` on the freeze versus `scripts/uiux.mjs`
— the artifact must be committed before any detector code exists. Nothing in this repository has been
committed yet, by the owner's standing instruction, so that command returns nothing for both sides
and would pass vacuously. The ordering is instead enforced by content:
`scripts/rule-identity.mjs` reconciles prose → freeze → catalog and fails on any identity that
originated outside the corpus, which is the property the git check was a proxy for. The git-order
check remains correct and should be run at the first commit; it is recorded here as deferred rather
than satisfied.

**And the file-birth form of that check was the wrong comparison anyway.** `scripts/uiux.mjs` first
appeared in section 06 as a CLI router, before a single detector was written, so "the freeze predates
`scripts/uiux.mjs`" is a proxy that can fail on a repository that did everything in the right order —
and, worse, can pass on one that did not, because a file's birth says nothing about when the bindings
inside it appeared. The invariant is about the bindings, so `scripts/chronology.mjs` anchors on the
commit that introduced `export const DETECTORS`, the table at which the evaluator starts asserting rule
identities. It resolves four states rather than a boolean: `NO_HISTORY` (unmeasured), `SAME_COMMIT`
(both anchors in one commit — Git records no ordering, so the chronology cannot be demonstrated no
matter what order the work was actually done in), `ORDERED`, and `INVERTED`. `SAME_COMMIT` is the
case a single lump first commit produces, and it is the one a naive `freeze <= detectors` comparison
would report as satisfied off two equal timestamps. The watchdog test and the release-readiness
report both read that one function, so the release record cannot claim an ordering the test would
reject.

**One identity carried two validation types and named a concept another rule owned.**
`forms.validation-messages-actionable` was named by Standard 15 R2 (required-status indication,
declared `manual-review`) and R3 (error-to-field association, declared `code-analysis`). A rule has
one validation type, so it could not be catalogued as written — and its name claimed the subject
Standard 20 owns, which Standard 17 R9 and Standard 20 R4 both explicitly assign there. It was split
into `forms.required-status-indicated` and `forms.error-field-association`, and Standard 15's
`## Implementation` table was corrected. The corpus held the error, not the catalog, which is the
direction the reconciliation is designed to reveal.

**A detector had no rule to bind to, and the rule was not invented.** Inline-style accumulation
appears in no requirement in any of the forty standards. Creating a rule so the detector had an owner
would have been the exact inversion this section exists to prevent, so the detector was dropped and
`06-evaluator-and-detectors.md` corrected. Twelve detectors ship in v1.0.0.

**Two spellings of one relationship were kept, deliberately, and recorded so they are not "fixed".**
Standard 8 R1 and Standard 10 R1 own domain-specific scale rules while Standard 9 R2's tokenization
maps to the general token rule. The asymmetry is real and the claims genuinely differ — a type scale
can exist with no token system — but it reads as an oversight, so the freeze records why no third id
was created.

**Non-normativity had to become structural, not conventional.** `crossReferences` was already
excluded from `resolve()` and from alias machinery, but nothing stopped an entry carrying
`level: "forbidden"`. Inert today, it is an argument tomorrow that a local level "follows from" a
sibling repository's decision. The key set is now closed at load time, and a test writes the
forbidden field to prove the rejection.

**The provenance checker's deferred check came due here.** `provenance.mjs` had been reporting
rule-level coverage as `NOT_EVALUATED — no rules/ directory yet` since section 02 — honestly, by
name, never as a pass. The moment `rules/` appeared it produced nineteen findings, one per
accessibility rule with no recorded origin. Rule-level provenance lives in a **separate**
`ruleMappings[]` array rather than inside `mappings[]`: a standard-level mapping is checked against
citation tokens in prose, a rule-level one has no prose to check against, and merging two claims
under one verification regime would let the weaker one govern both.
