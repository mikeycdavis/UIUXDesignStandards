# 10 — Tests and fixtures

Visual and design tooling has a high false-green risk, and the source prompt says so directly:
*"A check that cannot fail against the defect it claims to detect proves nothing."*

So the suite is built around three kinds of test that most suites omit. **Known-negative fixtures**
name every prohibited pattern without being an instance of one; the assertion that a detector stays
silent there is the one that matters, because both bugs EngineeringStandards has shipped were false
positives. **Mutation tests** reintroduce the defect and assert the detector notices, then restore
and assert the fixture is clean again. **Meta-tests** read the source of the tool itself and assert
properties no runtime test can reach — that every detector declares its view, that the evaluated set
and the bound detectors agree, that only one implementation of content identity exists.

Framework: `node:test`, no dependencies.

---

### Build the fixture corpus

- **Status:** `COMPLETE` — 2026-08-10. The detector half arrived with section 06, which could not be verified
  without it: `compliant/`, `never-violations/`, `never-clean/`, `token-system/`,
  `no-token-system/`, and the mutation and meta-tests over them, in `test/audit.test.mjs` and
  `test/validate.test.mjs`. Section 07 added `evidence/` — ten records, one per fact a browser run can
  carry — with `test/evidence.test.mjs`. Section 08 added the attestation suite,
  `test/attestation.test.mjs`, whose fixtures are built at test time rather than committed: a review's
  content identity is a fact about a specific commit, so the suite materialises a repository, commits
  the `compliant/` fixture into it, and writes each policy against the real SHA. Section 09 added `test/init.test.mjs`, whose
  fixtures are likewise built at test time — every one of them is defined by what it does not contain,
  and git preserves no empty directory. What remains to this section is the suite-wide sweep.
- **Purpose:** Give every detector both a repository that must provoke it and a repository that must
  not, so false positives are caught by construction.
- **Deliverables:** under `test/fixtures/`:
  - `compliant/` — a small clean web UI: labeled form controls, alt-texted images, ordered headings,
    `:focus-visible` styles, token-based CSS with a `prefers-reduced-motion` query, typed buttons.
    Every detector silent.
  - `never-violations/` — one file per must-never detector, each firing.
  - `never-clean/` — **the same filenames, opposite content**: `styles.css` whose only
    `outline: none` sits inside `/* … */`; `page.html` naming lorem ipsum inside `<!-- … -->`; a
    `docs/accessibility.md` quoting every forbidden pattern. This is the proving ground for the CSS
    and HTML comment-syntax work in `06-evaluator-and-detectors.md`.
  - `token-system/` and `no-token-system/` — identical hardcoded values; the drift detector fires
    only in the first.
  - `web-ui-signals/` — the classifier must return `APPLICABLE`.
  - `no-ui/` — contains a `project-policy.yml` declaring `no-ui`; the classifier must return
    `NOT_APPLICABLE` with `agreement: match`.
  - `policies/` — roughly eighteen YAML files: unknown top-level key; unknown `ui` subkey; invalid
    applicability enum; missing `accessibility.target` on a non-`no-ui` policy; `no-ui` with other
    `ui` subkeys; `multi-platform` with one platform; `web-ui` without `viewportClasses`;
    `localization.required` without `locales`; `none-justified` without `justification`; exception
    on a non-exemptible rule; expired exception; attestation on a non-attestable rule;
    stale-identity attestation; rejected attestation; `no-ui` declared over UI signals; legacy alias
    shape; plus two or three valid policies.
  - `evidence/` — seven JSON files: valid and fresh; stale identity; `run.status: failed`; a failed
    route; an unknown `ruleId`; schema-invalid; `inconclusive`-only.
  Built in a temporary directory at test time, because they are defined by absence: init fixtures,
  and the classifier's `INDETERMINATE` cases (file-cap hit via an injected lower `MAX_FILES`, an
  unreadable directory, a corrupt manifest, and `no-ui/` with its policy removed).
- **Acceptance Criteria:**
  - Every forbidden rule with an implemented detector has a `never-violations` / `never-clean` pair.
  - `never-clean/` produces zero findings.
  - `compliant/` produces zero findings.
  - `accessibility.target: none` gets no dedicated fixture — the enum makes it structurally invalid,
    covered by the invalid-enum case.
- **Verification:**
  ```bash
  node scripts/uiux.mjs audit test/fixtures/never-clean --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).findings.length))"   # → 0
  node scripts/uiux.mjs audit test/fixtures/compliant  --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).findings.length))"   # → 0
  ```
- **Dependencies:** sections 03 through 09.

### Write the mutation tests

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Prove each detector can fail against the defect it claims to detect — and, added in
  this section, prove the same of the architecture the detectors sit inside.
- **Deliverables:** mutate → assert the check fails → restore → assert clean, for: removing an `alt`
  attribute; removing a `for=` attribute; appending `outline: none` to a focus block in
  `compliant/`; replacing `var(--token)` with a hex literal in `token-system/`; stripping the
  `prefers-reduced-motion` query; adding `user-scalable=no` to a viewport meta; flipping an evidence
  check to `passed` while `run.status` remains `failed` (which must still not pass); removing
  `accessibility.target` from a valid policy (which must exit 2); mutating `docs/architecture.mmd`
  (which must fail the diagram freshness check — carried to section 11, which writes the diagram).
  **`test/falsifiers.mjs` and `test/falsifiers.test.mjs`** carry the architectural half: thirteen
  mutations applied to a sandbox copy of the repository, each run against the suite that must object.
  Eleven break the architecture — INDETERMINATE becoming NOT_APPLICABLE, class-unresolved becoming
  not-applicable, an absent policy reporting COMPLIANT, a browser rule passing with no browser, an
  approval outranking a witnessed failure, partial coverage reading as established, a partial review
  reading as attested, STALE reading as FRESH, unavailable reading as stale, a declaration resolving
  its own class, and a satisfied process verdict rescuing an unresolved gate. Two delete a whole
  fixture drawer.
- **Acceptance Criteria:**
  - Every mutation restores its fixture in a `finally` block and asserts cleanliness afterwards.
  - Every anti-vacuity guard is present: a test asserting a property over a collection first asserts
    the collection is non-empty.
  - Every architectural falsifier's anchor appears **exactly once** in its target file, asserted
    before the mutation. A falsifier matching nothing tests nothing.
  - Each suite is run unmutated first and again after restoration, so a pre-existing failure cannot
    be mistaken for a mutation's effect.
- **Verification:**
  ```bash
  node --test test/falsifiers.test.mjs    # → 1 pass, 13 falsifiers caught (~70s)
  ```
- **Dependencies:** the fixture corpus.

### Write the meta-tests

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Assert properties of the tool's own source that no runtime test can reach, and that
  drift silently.
- **Deliverables:**
  - Every must-never detector's doc comment contains `VIEW:`.
  - `EVALUATED_RULES` and the bound rule literals in `uiux.mjs` agree in both directions.
  - **No second content-identity implementation exists anywhere in `scripts/`** — one owner for the
    concept ([ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)).
  - `content-identity.mjs` does not USE the rejected alternatives, and is free to EXPLAIN them. The
    guard splits the module with the evaluator's own `splitSource` and forbids `ls-files`,
    `--cached`, `diff-index`, and `readFile` in the SOURCE view only — then requires each of them to
    appear in the COMMENT view, so the module has to have explained what it rejected.
  - **`test/invariants.test.mjs`** — the invariant registry: every release-critical invariant is on
    record in a normative or plan file, defended by tests that exist, and cross-checked against the
    falsifier table in both directions.
  - Every collection this suite iterates over is non-empty and the size the freeze says it is.
  - The git-history ordering check is asserted to be still recorded as deferred, and upgrades itself
    to the real comparison the moment history exists.
  - Every keyword in every schema is in `jsonschema.mjs`'s supported set.
  - No rule typed `browser-analysis`, `visual-analysis`, or `manual-review` can reach `passed` in a
    run with no evidence and no attestation — walked over the **full catalog**, not a sample.
  - The five assurance buckets sum to the applicable count.
  - No local rule id shadows Standard 02's deliberately-not-duplicated list.
  - Every `standardRef` resolves to a real heading; every rule's `standard` names an existing
    document; heuristic findings are never labeled `OBSERVED`.
  - The `CANONICAL_ID` regex and the schema's `$defs/ruleId` accept and reject identical strings.
- **Acceptance Criteria:**
  - The full-catalog anti-vacuity guard asserts the catalog is non-empty before asserting over it.
  - Each meta-test names the invariant it defends in its test name.
  - No registered invariant names a defending test that does not exist, and no falsifier breaks an
    invariant no entry registers (Standard 40 R11).
- **Verification:**
  ```bash
  node --test test/*.test.mjs    # → 334 pass
  ```
- **Dependencies:** the fixture corpus; sections 01 through 09.

### Write the dogfooding tests

- **Status:** `COMPLETE` — 2026-08-10, except the `PROJECT.md` / `README.md` wording, which is
  section 11's to write and is recorded there as a carried obligation.
- **Purpose:** Hold this repository to the process rules it publishes, and make it break if it ever
  grows a UI without saying so.
- **Deliverables:**
  - This repository's own policy validates.
  - `validate .` yields `applicability: NOT_APPLICABLE`, `uiCompliance: null`,
    `frameworkCompliance: COMPLIANT`, exit 0.
  - The classifier on this repository returns `NOT_APPLICABLE` with `agreement: match` and
    `scan.complete: true`.
  - No error-severity findings on self.
  - Two clean clones of one commit produce the same content identity.
- **Acceptance Criteria:**
  - The self-classification test fails if a UI is added to this repository and the policy is not
    updated. That is its purpose.
  - `PROJECT.md` and `README.md` state that the framework's UI rules are dogfooded against a real UI
    project (section 14), not here, and that the self-verdict certifies scope honesty rather than UI
    quality.
- **Verification:**
  ```bash
  npm test && npm run validate && npm run applicability:self    # → all exit 0
  ```
- **Dependencies:** all preceding sections.

---

## Gotchas this section discovered

**The falsifier harness generated the exact false green it was built to detect, on its first run.**
Every one of the thirteen mutations was reported as uncaught, in under a second. The cause: a
`node --test` child that inherits `NODE_TEST_CONTEXT` from a `node --test` parent decides it is a
reporting subprocess of the outer run — it executes nothing, prints nothing, and **exits 0**. A
harness that spawns test runs is therefore not measuring anything unless it scrubs that variable, and
the failure mode is silent and looks like success. The fix is two lines; the guard that makes it stay
fixed is `runSuite` refusing any run whose output contains no test summary, whatever it exited with.
An exit code alone was not enough evidence that a test run happened.

**The first version of the invariant registry made every check cost seventy seconds.** It imported
the falsifier table from `test/falsifiers.test.mjs` — and importing a `.test.mjs` file executes its
tests. The table moved to `test/falsifiers.mjs`, which the runner does not collect. Data that two
files need is data, not a test.

**The M1 use/mention debt was real, and paying it improved the module.** The old guard forbade the
string `ls-files` anywhere in `content-identity.mjs`, which meant the module could not explain the
alternative it had rejected — an architectural decision was unexplainable in the one file that
implements it, and the header said so apologetically. The replacement splits the module with the
evaluator's own `splitSource` and forbids the tokens in the SOURCE view only, then REQUIRES each of
them in the comment view. The module now names `git ls-files`, `--cached`, `diff-index`, and byte
reading, and says why each is wrong. Both directions are mutation-tested: a token added as an
argument must be caught, the same token added as prose must not be.

**Anti-vacuity needed expected sizes from somewhere other than the collection.** A guard asserting
`items.length > 0` catches an empty collection and nothing else; a guard asserting
`items.length === items.length` catches nothing at all and is easy to write by accident. The sizes in
the collections table come from the freeze — 70 rules, 15 forbidden, 13 detectors, 15 rule files, 40
standards — so a collection that quietly loses an entry fails, and the failure message says whether
the freeze moved or something went missing.

**Two obsolete tests had to be rewritten rather than deleted, again.** `init` was the last entry in
the not-implemented table, so the tests asserting `init` exits 2 became false. Deleting them would
have removed the guard that no command reports success for want of an implementation; they now cover
unknown commands, and a new meta-test asserts the `PENDING` mechanism and its "This is not a pass."
message survive for whatever needs them next. Standard 40 R10 forbids weakening a test to hide a
regression; a test whose subject is gone is a different case, and the honest move is to re-aim it at
the property that remains.

**Known in advance: `SKIP_DIRS` must include `fixtures`, and for a different reason than
`node_modules`.** Fixture repositories are deliberately malformed; scanning them during a run
against this repository would report their intentional defects as this repository's findings. The
reason belongs in a comment, because the next reader will otherwise assume it is a performance
exclusion and may narrow it.
