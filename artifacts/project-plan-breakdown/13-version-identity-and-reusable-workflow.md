# 13 — Version identity enforcement and the reusable CI workflow

**Built 2026-08-11, after v1.0.0 was published.** It was deferred until an immutable ref existed,
because a reusable workflow that pins nothing distributes nothing.

This section turns the framework from something a project *can* run into something a project's
default branch *requires*. It is deferred because the reusable workflow must reference an immutable
ref, and no immutable ref exists until `12-release-readiness-and-v1.md` completes. Building it
earlier would mean publishing a workflow that pins nothing.

One constraint from the source enforcement architecture governs everything here:

> A committed workflow file is **not** proof that enforcement exists.

Whether the check actually runs, whether it is configured as required, whether branch protection
applies, and who may bypass it are all facts that live in the Git hosting platform, not in this
repository. This section can install the mechanism; it cannot establish that the mechanism is
required. Establishing that is `16-portfolio-integration.md`.

---

### Harden standards-version identity in validate

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Make a project's declared standards version verifiably match the framework actually
  evaluating it, so a pinned contract cannot silently drift.
- **Deliverables:** `scripts/version-identity.mjs`, consulted as **Gate 0b** — after policy validity,
  before Gate 1, so a mismatch reaches no classifier and no rule. **The plan's own specification was
  wrong here and was not followed.** It called for comparing `policy.standardVersion` against the
  checked-out `VERSION`, with a minor or patch difference downgraded to a warning. Both halves fail:
  a version-string comparison passes a post-release branch whose `VERSION` still names the last
  release (ADR 0015), and a warning on a minor difference produces a verdict labelled with a rule set
  that never ran. Identity is established against the ARTIFACT — the declared version equals the
  executing `VERSION` **and** the executing tree is exactly that release's tree — and every mismatch
  refuses. See ADR 0016.
- **Acceptance Criteria:**
  - No mismatch of any size produces a compliance verdict, and none is reported as `NON_COMPLIANT`.
  - A framework whose tree is not the release its version names is a mismatch, even though the
    version strings agree.
  - `UNVERIFIED` is never recorded as `MATCH`, and `executedCommit` is null rather than invented.
  - The envelope carries the executed identity as evidence, not as a reference string.
  - The check runs before any rule is evaluated.
- **Verification:**
  ```bash
  node --test test/version-identity.test.mjs    # → 10 pass
  ```
- **Dependencies:** `12-release-readiness-and-v1.md`.

### Publish the reusable validation workflow

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Give every applicable repository one centrally maintained invocation, so projects do
  not reproduce standards logic in their own YAML. Central implementation, distributed invocation.
- **Deliverables:** `.github/workflows/validate.yml` with `workflow_call` inputs: `standards-ref`
  (required), `target-path` (default `.`), `evidence-path` (optional), `node-version` (default
  `20`). Steps: check out the consumer; check out this repository at `standards-ref` into
  `.uiux-standards/`; run `applicability` and upload its JSON as an artifact for governance
  consumption; run `validate` and upload the envelope; the `validate` exit code is the gate.
  Gating semantics: exit 1 fails the check; exit 2 fails the check with a distinct
  infrastructure/configuration annotation, because a broken policy must not read as a failing
  project and must never read as passing.
- **Acceptance Criteria:**
  - The workflow reproduces no rule logic.
  - Consumers are documented to pin `@<sha>`; the tag is a human-readable alias only.
  - Both the applicability classification and the compliance envelope are preserved as artifacts, so
    a portfolio inventory can read them without re-running anything.
- **Verification:**
  ```bash
  node -e "const y=require('fs').readFileSync('.github/workflows/validate.yml','utf8');console.log(/workflow_call/.test(y) && /standards-ref/.test(y))"   # → true
  ```
- **Dependencies:** version-identity hardening.

### Document what the workflow does not establish

- **Status:** `COMPLETE` — 2026-08-11
- **Purpose:** Prevent the framework from claiming enforcement it has not established, which the
  source prompt names directly: *"Do not claim enforcement exists before it actually does."*
- **Deliverables:** a section in `INSTRUCTIONS.md` stating that installing the workflow establishes
  only that the workflow file exists; that whether the check runs, is required, is covered by branch
  protection, and who may bypass it are host-platform facts outside this repository; and that
  establishing those is the adoption controller's job.
- **Acceptance Criteria:**
  - No document in the repository states or implies that adding the workflow makes the gate
    required.
- **Verification:**
  ```bash
  grep -rn "gate is required\|enforcement is in place" README.md INSTRUCTIONS.md | wc -l   # → 0
  ```
- **Dependencies:** the reusable workflow.

---

## Gotchas this section discovered

**The inherited guard would have passed this repository's own negative control.** EngineeringStandards
compares `policy.standardVersion` against its `VERSION` file, and that is sound there. Here it is not,
for a reason created by ADR 0015 three hours earlier: `VERSION` names the LAST RELEASED version and
stays there during development, so post-release `main` reports `1.0.0` while being demonstrably not
the `v1.0.0` artifact. A consumer pinning 1.0.0 would be evaluated by unreleased code and told it was
evaluated by 1.0.0. Identity had to be established against the artifact — equality with the release
tag — which is the machinery ADR 0015 had just built for a different question. Porting the parent's
implementation without re-deriving it would have shipped the exact failure the guard exists to
prevent.

**The guard's first act was to refuse this repository.** `validate .` exited 2 immediately: the
policy declares 1.0.0, the tree is 1.0.0-plus-commits, and that is precisely the refusable state. The
fix is not an exemption but a state — `SELF_EVALUATION`, established by **path containment** rather
than declaration. A project inside the executing framework's own working tree is not a second object
whose version could be misreported. The direction is asymmetric on purpose: the reusable workflow
checks the framework out *into* the consumer, so a consumer is never inside a framework.

**Then it refused the test suite, which was the guard working.** The suite is the framework's first
real consumer — it builds throwaway projects that pin a version and evaluates them with the working
tree, which is the refusable state again. The waiver is an argument in library code
(`allowUnreleasedFramework`), deliberately unreachable from the command line: a flag would be pasted
into a workflow and never removed, and an environment variable would be invisible in the run that
used it. The waiver suppresses the refusal and never the finding — the envelope still records
`EXECUTED_TREE_IS_NOT_THE_RELEASE`.

**A shallow checkout has no tags, so the workflow sets `fetch-depth: 0`.** Without it the guard
resolves `UNVERIFIED` on every run — not a false pass, but a permanently unanswered question, which
is the same as having no guard.
