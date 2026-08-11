# 01 — Repository skeleton and vendored core

The four domain-neutral files from EngineeringStandards — catalog loading, verdict computation,
YAML parsing, JSON Schema evaluation — are vendored here rather than shared
([ADR 0001](../adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md)). Two of the four
are copied verbatim; two are modified, and the modifications are where this framework's assurance
model actually lives.

One file is entirely new. `scripts/content-identity.mjs` is the shared provenance primitive that
both attestations and browser evidence use to establish freshness
([ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)).
It is written here, before either consumer exists, because both must import it rather than
reimplementing it.

Nothing in this section produces a verdict about anything. It is the machinery every later section
depends on.

---

### Create the package manifest with no dependencies

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Establish the zero-dependency contract mechanically, and name every command the
  repository offers, so CI can invoke repository commands rather than reimplementing logic.
- **Deliverables:** `package.json` — name `uiux-standards`, version `1.0.0`, `type: module`,
  `bin: { "uiux-standards": "scripts/uiux.mjs" }`, `engines: { node: ">=18" }`, `private: true`,
  `license: UNLICENSED`. Scripts: `test`, `audit`, `validate`, `applicability`,
  `applicability:self`, `policy`, `inventory`, `provenance`, `diagrams`, `audit:strict`,
  `release:readiness` — each a bare `node scripts/….mjs` invocation. A `.gitignore` that does not
  need a `node_modules` entry but has one anyway, as a tripwire.
- **Acceptance Criteria:**
  - No `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` key exists.
  - No lockfile is committed.
  - `applicability:self` is present, since `11-ci-and-docs.md` invokes it.
  - Every script value begins `node scripts/`.
- **Verification:**
  ```bash
  node -e "const p=require('./package.json');const bad=['dependencies','devDependencies','peerDependencies','optionalDependencies'].filter(k=>k in p);if(bad.length)throw new Error(bad.join());console.log(Object.keys(p.scripts).length)"   # → 11
  ls package-lock.json 2>/dev/null | wc -l    # → 0
  ```
- **Dependencies:** none.

### Vendor the two unmodified core files

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Obtain a strict YAML subset parser and a strict JSON Schema subset evaluator without
  taking a dependency, and preserve their fail-loudly behavior — both reject what they do not
  understand rather than guessing.
- **Deliverables:** `scripts/yaml.mjs` and `scripts/jsonschema.mjs`, copied from
  `F:\Repos\EngineeringStandards\scripts\`, each gaining a header comment recording its origin, the
  date copied, and the fact that it is now this repository's own source rather than a tracked
  upstream ([ADR 0001](../adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md)).
- **Acceptance Criteria:**
  - `jsonschema.mjs` still throws `SchemaError` on an unsupported keyword. This is load-bearing for
    [ADR 0012](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md) and must
    not be relaxed here.
  - `yaml.mjs` still returns every scalar as a string and still rejects block scalars.
  - Neither file is extended in this section. Any extension is a later, deliberate decision with its
    own tests.
- **Verification:**
  ```bash
  node -e "import('./scripts/jsonschema.mjs').then(m=>{try{m.validate({oneOf:[]},{});throw new Error('unsupported keyword was accepted')}catch(e){console.log(e.constructor.name)}})"   # → SchemaError
  ```
- **Dependencies:** the package manifest.

### Vendor and extend the catalog loader

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Load and validate the rule catalog under this framework's extended vocabulary, and
  make every identity and assurance violation a load-time error rather than a review comment.
- **Deliverables:** `scripts/catalog.mjs`, adapted from the EngineeringStandards original:
  - `VALIDATION_TYPES` gains `browser-analysis` and `visual-analysis`
    ([ADR 0004](../adr/0004-add-browser-and-visual-validation-types-and-keep-not-evaluated-a-disposition.md)).
  - The assurance legality matrix from
    [ADR 0005](../adr/0005-full-assurance-requires-an-enumerable-subject.md): `full` only for
    `structural`, `document`, `configuration`.
  - `CANONICAL_ID` extended to permit hyphens in the first segment
    ([ADR 0007](../adr/0007-rule-id-grammar-admits-hyphenated-domains.md)).
  - Two new required fields validated: `appliesTo` (non-empty, closed set, no `any-ui` mixed with
    specific classes) and `crossReferences` (always present, closed `relationship` enum, never
    entering `resolve()`, rejected on collision with a local id or alias in either direction)
    ([ADR 0006](../adr/0006-cross-repository-concerns-reference-rather-than-duplicate.md)).
  - Unchanged from the original: the 17 base fields, lifecycle trio present-and-null, alias
    machinery, duplicate detection across files including the second pass, `attestable` derivation,
    `assertBindings`, `coverage`, `Object.freeze`.
- **Acceptance Criteria:**
  - A rule claiming `full` with `browser-analysis` throws `CatalogError` at load.
  - A rule with an empty `appliesTo` throws.
  - A `crossReferences.ruleId` equal to a local rule id throws.
  - `resolve()` never returns a rule for a cross-referenced foreign id.
  - The regex in `catalog.mjs` and the one in the policy schema accept and reject identical strings.
- **Verification:**
  ```bash
  node --test test/catalog.test.mjs    # → 17 pass
  ```
- **Dependencies:** the two vendored files; the frozen catalog from `03-rule-catalog.md` for a
  non-trivial verification.

### Vendor and extend the compliance evaluator

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Compute verdicts under a five-surface assurance model, and make it impossible for a
  rule requiring browser, visual, or human evidence to pass from a static run.
- **Deliverables:** `scripts/compliance.mjs`, adapted:
  - Assurance buckets become five: `automated`, `browserAnalysis`, `visualAnalysis`, `manualReview`,
    `notEvaluated`. They must still sum to the applicable set.
  - **The load-bearing guard**: `manual-review`, `browser-analysis`, and `visual-analysis` rules can
    never reach `passed` from a static run — only via ingested evidence (`evidenced`) or a valid
    attestation (`attested`).
  - New dispositions: `evidenced`, `evidence-unavailable`, `stale-evidence`,
    `contradicted-applicability`.
  - `evaluate()` accepts an `evidence` argument alongside the policy and identities.
  - The envelope gains `applicability`, `uiCompliance` (nullable), `frameworkCompliance`
    (never null), and `evidenceSurface`
    ([ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md)).
  - Verdict order unchanged, with `unestablished` extended to include forbidden rules whose
    disposition is `evidence-unavailable` or `stale-evidence`.
- **Acceptance Criteria:**
  - No code path allows a `browser-analysis` rule to report `passed` when `evidence` is null.
  - The five buckets sum to the applicable count on every run.
  - `unestablishedProhibitions` is present on every run, empty rather than absent when there are
    none.
  - Score remains a summary statistic and never determines status.
- **Verification:**
  ```bash
  node --test test/compliance.test.mjs    # → 22 pass
  ```
- **Dependencies:** the catalog loader.

### Write the content-identity primitive

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Establish freshness from committed repository content, so that two clean checkouts of
  one commit agree, and so that no attestation or evidence record can be `FRESH` over material that
  has changed.
- **Deliverables:** `scripts/content-identity.mjs` implementing
  [ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md),
  as amended 2026-08-10:
  - `computeIdentity(root, paths, revision = "HEAD") → { state: "COMPUTED" | "UNAVAILABLE",
    revision?, identity?, reason? }`, resolving each path from the committed tree at `revision` via
    `git ls-tree` through `node:child_process`. Never `git ls-files` (the index), never the working
    tree.
  - **The returned `revision` is always the resolved full commit SHA, never the literal `HEAD`.**
    `HEAD` is an input convenience; storing it would destroy the historical anchor the moment the
    branch advanced. Every path that records an attestation or evidence persists the resolved SHA.
  - `freshness(root, recorded)` applying the precedence rule: if change can be proved, the outcome
    is `STALE`; `EVIDENCE_UNAVAILABLE` is reserved for the case where the required identity cannot
    be established at all.
  - `workingSubjectClean(root, paths) → boolean`, wrapping `git status --porcelain -- <paths>`, so
    both staged and unstaged modifications to reviewed paths are caught while unrelated changes are
    ignored.
  - No sentinel for an untracked path. An untracked reviewed path with no committed subject at the
    reviewed revision is `UNAVAILABLE`.
  - Path resolution treats "requested path absent from this revision" as a first-class result. If
    `[a, b]` is requested and only `a` resolves, the function must not return the identity of `[a]`.
- **Acceptance Criteria:**
  - The module reads no file contents from disk. `readFile` does not appear in it.
  - The string `ls-files` does not appear in it.
  - Two clean clones of the same commit produce the same identity.
  - `computeIdentity(root, paths, "HEAD")` returns a 40-character SHA in `revision`, never `HEAD`.
  - A staged-only modification to a reviewed path makes `workingSubjectClean` false.
  - An unstaged modification to a reviewed path makes it false.
  - A modification to an unrelated path leaves it true.
  - A path that existed at the reviewed revision and is absent at HEAD is `STALE`, and stays `STALE`
    when the same path reappears untracked in the working tree.
  - An untracked reviewed path with no committed subject yields `UNAVAILABLE`, distinct from
    `STALE`.
- **Verification:**
  ```bash
  node --test test/content-identity.test.mjs    # → 21 pass
  grep -c "ls-files\|readFile" scripts/content-identity.mjs    # → 0
  ```
- **Dependencies:** none beyond the package manifest. Written before its consumers so they import
  rather than reimplement.

### Prove the provenance fundamentals

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** End this milestone with a trustworthy provenance base, rather than deferring its
  proof to the general test suite in section 10. Every later freshness claim in the framework rests
  on these behaviours.
- **Deliverables:** `test/content-identity.test.mjs` and `test/package.test.mjs`, building real
  throwaway git repositories in a temporary directory (`git init`, commit, mutate, commit again),
  because these behaviours are only observable against actual repository history. The ten cases
  the owner set as this milestone's stopping criteria:
  1. The package declares no dependency key and no lockfile is committed.
  2. `yaml.mjs` and `jsonschema.mjs` behave as the originals: a block scalar is rejected, an
     unsupported keyword throws.
  3. Identity comes from committed tree objects only.
  4. Requested-path completeness: asking for `[a, b]` where only `a` resolves never yields the
     identity of `[a]`.
  5. **Resolved revision is immutable**: record with `revision: "HEAD"`, advance the repository by
     one commit, and the stored revision remains the original SHA; the historical identity still
     reconstructs from it; the current identity differs where reviewed content changed → `STALE`.
  6. A staged-only modification to a reviewed path yields `STALE`.
  7. An unstaged modification to a reviewed path yields `STALE`.
  8. A modification to an unrelated path leaves the record `FRESH`.
  9. A path present at the reviewed revision and absent at HEAD is `STALE`, and remains `STALE` when
     the same path reappears untracked.
  10. A genuinely untracked or unresolvable review subject is `EVIDENCE_UNAVAILABLE`, distinct from
      `STALE`; and neither the index nor working-tree bytes participate in identity.
- **Acceptance Criteria:**
  - All ten cases pass.
  - Case 9 fails if the implementation lets an untracked replacement downgrade a proved change.
  - Case 5 fails if the literal string `HEAD` is ever stored as a revision.
  - Each test builds and destroys its own repository; none depends on this repository's history.
- **Verification:**
  ```bash
  node --test test/content-identity.test.mjs test/package.test.mjs    # → 31 pass
  ```
- **Dependencies:** every preceding item in this section.

---

## Gotchas this section discovered

**`git ls-tree` reports success while returning nothing for a path that does not exist at that
revision.** Anticipated before implementation and confirmed during it: a naive implementation hashes
whatever came back and silently produces the identity of a smaller path set. `committedEntries()`
reconciles the requested list against the returned list and fails with `PATHS_ABSENT` rather than
hashing a subset. The test that proves it asks for `[a.css, ghost.css]` and asserts the result is
not the identity of `[a.css]` alone.

**The `readFile`/`ls-files` source guard forced a documentation decision.** The primitive must not
contain either string, so the reasoning about *why* the index is never consulted could not be
written into the file that avoids it — naming the command in a comment would trip the guard. The
explanation lives in ADR 0011 and the file points there. This is the framework's own use/mention
discipline applied to itself: the file that forbids a pattern should not contain it.

**`validate()` in the vendored schema evaluator takes `(document, schema)`, not `(schema, document)`.**
The reversed call does not fail cleanly — it walks the document as though it were a schema and throws
`unsupported schema keyword 'v'`, which reads like an evaluator defect rather than a caller error.
Cost a few minutes to diagnose; the note is here so the next caller does not repeat it.

**`printf` in Git Bash consumes backslashes in Windows paths.** Writing the vendored-file provenance
headers with `printf` turned `F:\Repos\EngineeringStandards` into `F:\ReposngineeringStandards`
(`\E` and `\s` were interpreted). Use a heredoc for any text containing Windows paths, or write
forward slashes.

**`jsonschema.mjs` must not be extended casually.** Known in advance and still true: it will be
tempting during `04-policy-schema-and-templates.md`, because the `ui` block's requirements are
conditional. That temptation is the subject of
[ADR 0012](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md); the
conditionals go in `policy.mjs`.

**Every guard in this section was mutation-tested before being trusted.** Three mutations to
`content-identity.mjs` (removing the STALE precedence branch, hashing working-tree bytes, accepting
`HEAD` as a stored revision) and three to `compliance.mjs` (emptying `NON_STATIC_TYPES`, narrowing
the unestablished cap, dropping the browser assurance bucket) each produced failures, and each was
restored. A guard never observed failing is an assumption about the guard, not evidence about the
code.
