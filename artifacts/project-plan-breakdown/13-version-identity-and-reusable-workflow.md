# 13 — Version identity enforcement and the reusable CI workflow

**Deferred beyond v1.0.0. Recorded here so the deferral is visible rather than becoming silent scope
loss.**

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

- **Status:** `READY` — unblocked once v1.0.0 is tagged
- **Purpose:** Make a project's declared standards version verifiably match the framework actually
  evaluating it, so a pinned contract cannot silently drift.
- **Deliverables:** version-identity checks in `validate`: compare `policy.standardVersion` against
  the checked-out `VERSION`. A major mismatch exits 2 — the framework cannot honestly evaluate a
  project against a version it is not. A minor or patch difference is a warning finding naming both
  versions.
- **Acceptance Criteria:**
  - A major mismatch never produces a compliance verdict.
  - The message names the declared version, the actual version, and the resolution.
  - The check runs before any rule is evaluated.
- **Verification:**
  ```bash
  node scripts/uiux.mjs validate test/fixtures/version-mismatch >/dev/null 2>&1; echo $?   # → 2
  ```
- **Dependencies:** `12-release-readiness-and-v1.md`.

### Publish the reusable validation workflow

- **Status:** `READY` — unblocked once v1.0.0 is tagged
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

- **Status:** `READY`
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

*Deferred; not started.*
