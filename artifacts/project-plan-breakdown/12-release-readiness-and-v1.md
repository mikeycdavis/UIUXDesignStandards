# 12 — Release readiness and v1.0.0

The source prompt is explicit about how this release is judged:

> Do not publish or tag a release merely because implementation exists. First prove the release
> criteria mechanically and surface all remaining gaps.

and

> Do not declare the framework complete merely because Markdown files exist.

So the deliverable of this section is not the tag. It is a mechanical checker and a written report
in which every §60 criterion is either demonstrated by a command with its observed output, or listed
as a gap. `NOT_EVALUATED` never satisfies a completion criterion, and a checklist never overrides a
rule result.

The tag is what happens afterwards, if the report has no unrecorded gaps.

---

### Build the release-readiness checker

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Make release criteria mechanically provable, so completion is observed rather than
  asserted.
- **Deliverables:** `scripts/release-readiness.mjs` (`npm run release:readiness`), checking:
  - The catalog loads and matches the frozen snapshot digest.
  - This repository's own policy exits 0.
  - The test suite is non-empty and passing.
  - **Every forbidden-level rule with an implemented detector has a `never-violations` /
    `never-clean` fixture pair**, and every forbidden rule *without* a detector is listed in the
    report as browser-, visual-, or manual-typed — present and unimplemented by design, never
    silently missing.
  - The CHANGELOG's top entry matches `VERSION`.
  - The three independent versions — `VERSION`, the envelope `schemaVersion`, and
    `package.json.version` — are each internally consistent.
  - The classifier self-check passes.
- **Acceptance Criteria:**
  - The checker fails when any criterion fails; it never reports success over an unmet criterion.
  - A forbidden rule with a detector but no fixture pair is a failure, not a warning.
  - The output distinguishes "criterion met" from "criterion not applicable to this release".
- **Verification:**
  ```bash
  npm run release:readiness    # → exit 0
  ```
- **Dependencies:** sections 01 through 11.

### Freeze the catalog snapshot

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Fix what v1.0.0 contains, so drift under a released version is detectable rather than
  arguable.
- **Deliverables:** `artifacts/release/catalog-v1.0.0.json` — the full resolved catalog, the rule
  count, and a sha256, written once at release and never regenerated. A test asserts the live
  catalog still matches the latest snapshot; a mismatch under a released version is a bug, not a
  pending update.
- **Acceptance Criteria:**
  - The snapshot records every rule id with its level, severity, validation type, assurance,
    exemptibility, owning standard, and `appliesTo`.
  - The drift test names which rules differ, not merely that they do.
- **Verification:**
  ```bash
  node --test test/release.test.mjs    # → 17 pass
  ```
- **Dependencies:** the readiness checker.

### Write the release-readiness report

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Record, in one reviewable document, what was proved and what remains open.
- **Deliverables:** `artifacts/release/release-readiness-v1.0.0.md` — one row per source-prompt §60
  criterion: the criterion, the runnable command, the observed output, and a three-state marker of
  `implemented`, `verified`, or `released`. Gaps are listed explicitly with what would close them.
  Known gaps at v1.0.0, stated rather than discovered by an adopter: no browser-evidence producer
  exists, so every `browser-analysis` and `visual-analysis` rule reports `notEvaluated`; the
  detectors have not been exercised against any external UI project; the reusable CI workflow and
  the organization adoption controller are deferred to sections 13 and 16.
- **Acceptance Criteria:**
  - Every criterion is demonstrable by running something or inspecting a committed artifact. None is
    satisfied by an assertion that it is satisfied.
  - No criterion is marked satisfied on the strength of a `NOT_EVALUATED` result.
  - The gap list is complete; tagging with an unrecorded gap is prohibited.
- **Verification:**
  ```bash
  grep -c "^| " artifacts/release/release-readiness-v1.0.0.md    # → one row per §60 criterion
  ```
- **Dependencies:** the readiness checker; the frozen snapshot.

### Version, changelog, and tag

- **Status:** `IN_REVIEW` — 2026-08-11
- **Purpose:** Release an immutable v1.0.0 that consuming projects can pin.
- **Deliverables:** `VERSION` containing `1.0.0`; `CHANGELOG.md` with `## 1.0.0 — YYYY-MM-DD`, the
  increment declared and justified on the first line, and the semver law stated in the preamble —
  adding a required rule is `MAJOR`, adding a recommended one is `MINOR`, removing any rule or alias
  is `MAJOR`. Then the annotated tag.
- **Acceptance Criteria:**
  - The tag is created only after the readiness report shows zero unrecorded gaps.
  - Consumers are documented to pin by commit sha; the tag is a human-readable alias, since tags are
    mutable and a sha is not.
  - **Tagging is the owner's act.** This section prepares everything up to it and does not perform
    it unless the owner asks.
- **Verification:**
  ```bash
  npm run release:readiness && cat VERSION    # → exit 0, then 1.0.0
  ```
- **Dependencies:** the readiness report.

---

## Gotchas this section discovered

**The known-in-advance below fired on the first run, and it found two real rules.**
`design-integrity.no-fake-progress` and `accessibility.no-inaccessible-custom-controls` were both
`forbidden`, both typed `code-analysis`, and neither had a detector. Nothing false was produced —
both reported `not-evaluated` and capped the verdict, which is the safe behaviour — but the catalog
was claiming a machine-checkable type it did not honour, and a reader comparing types against
detectors would conclude these two were checked.

This section first **recorded it as a gap**, on the reasoning that a frozen-catalog change should not
be made on release day. That was wrong, and the correction is the most useful thing this section
produced. A recorded gap is honest where the missing evidence cannot now be recovered — the
chronology qualifies, because producing it would mean rearranging history until it agrees. These two
were a present-tense disagreement between contract and implementation that somebody could still
resolve, and recording it accurately would have made `RECORDED_GAP` a general-purpose waiver. Worse,
the release would have frozen a wrong `validationType` into a published contract, where correcting it
costs a MAJOR increment; before the first release it costs nothing.

Both were resolved under ADR 0014, each on its own epistemic question rather than on the release's
convenience. `accessibility.no-inaccessible-custom-controls` is genuinely reachable from source — a
click handler present with role, tabindex, and key handler all absent — so it gained the thirteenth
detector and its catalog entry did not change. `design-integrity.no-fake-progress` is not: whether a
number is a measurement is a question about the work it describes, and a timer-driven value, a
server-computed value, and a real one are the same expression at the call site. It was re-typed to
`manual-review`/`none`, which is where it belonged and which also makes it attestable.

**So `RECORDED_GAP` needed a second kind.** `GAP_POLICY` names the criteria permitted to carry an
accepted limitation and why each qualifies; every other criterion reporting a gap becomes
`BLOCKING_GAP` and the release is `NOT_READY` however accurately the gap is written down. The default
is fail-closed, so a criterion added later cannot inherit a waiver by accident, and the mutation that
lets any criterion grant itself one is a registered falsifier.

**The chronology check needed to be replaced, not merely un-deferred.** The plan's form of it —
freeze added before `scripts/uiux.mjs` added — is a proxy that can fail on a repository that did
everything right, because `uiux.mjs` first appeared in section 06 as a CLI router before any detector
existed. `scripts/chronology.mjs` anchors on the commit introducing `EVALUATED_RULES` instead, and
resolves four states rather than a boolean. The state that matters is `SAME_COMMIT`: a single lump
first commit puts both anchors in one commit, Git records no ordering between two changes in one
commit, and a naive `freeze <= detectors` timestamp comparison would report that as satisfied off two
equal timestamps. The watchdog test and the readiness report read the same function, so neither can
claim an ordering the other would reject.

**`RECORDED_GAP` had to be a state of its own.** The requirement is that readiness never be
manufactured from exit codes, and that a missing historical proof never become readiness — but also
that the checker not demand a tag in order to permit one. Three outcomes were not enough. A criterion
is `SATISFIED`, `FAILED`, `NOT_EVALUATED` (which never satisfies), or `RECORDED_GAP` — and a
`RECORDED_GAP` is only available when the release report already names the specific gap. Remove the
naming and the criterion turns `FAILED`, which is what makes the report load-bearing rather than
descriptive. The verdict then distinguishes `READY` from `READY_WITH_RECORDED_GAPS`, so a release
carrying gaps cannot be reported with the same word as one that does not.

**The snapshot could only be an oracle if the checker refused to write it.** `--write-snapshot` is a
separate, one-time operation that exits 2 rather than overwriting, and a test asserts `assess()`
leaves a deliberately corrupted snapshot corrupted. A checker that regenerated the expected values
during validation would be comparing the catalog against itself, which is true of every catalog there
has ever been.

**The release digest collided with the one-owner rule, correctly.** Hashing the catalog projection
tripped the guard forbidding a second content-identity implementation in `scripts/`. That guard is
right to fire on any hash, and weakening it to a filename exception would have been the wrong repair.
Instead a hashing file must carry a `DIGEST-SCOPE:` declaration saying what it hashes and explicitly
disclaiming freshness — the same discipline as the `VIEW:` doc-comment every detector carries — and
the guard now asserts that the declaration denies the thing the guard is about. Removing the
declaration is a falsifier.

**The verification did not reproduce from the artifact being tagged, and only the tag operation
found it.** With `core.autocrlf=true` — the Windows default — and no `.gitattributes`, the committed
blobs are LF while a fresh checkout materialises CRLF. Three of the twenty falsifier anchors span
more than one line, so on a clone they would match nothing, and the harness would report its
mutations as uncaught: the same false green it exists to detect, arriving through the checkout rather
than through the code. Caught by asking whether a clone of the release commit passes its own suite,
instead of assuming that a green local run and a green clone are the same event. `.gitattributes`
pins `eol=lf`, and the release candidate is now verified from a clone rather than from the working
tree it was written in.

This is also the second time the same lesson has arrived: `scripts/content-identity.mjs` resolves
identity from git blob OIDs precisely because working-tree bytes differ across clean checkouts of one
commit (ADR 0011). That decision was made about attestations; the suite itself had no such
protection.

**A test can be broken by the calendar, and no mutation would ever catch it.** The init suite pinned
`today: "2026-08-10"` for `plan()` while the CLI stamped the real date, so it agreed with itself for
exactly one day. It surfaced here because this was the first section built on a later date. Nothing
in the falsifier harness could have found it: the mutation that breaks it is the passage of time.

Known in advance, and confirmed: **a forbidden rule with no detector is not automatically an
acceptable gap.** It is acceptable only when the rule is typed `browser-analysis`,
`visual-analysis`, or `manual-review` — that is, when its evidence surface genuinely is not static
analysis. A `code-analysis` forbidden rule with no detector cannot be filed under "differently typed"
and must either gain a detector or be re-typed with the reasoning recorded. The readiness checker
enforces this distinction rather than counting detectors.
