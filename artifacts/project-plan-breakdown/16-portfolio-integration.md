# 16 — Portfolio integration and the adoption controller

**Deferred beyond v1.0.0. Most of the work lives in other repositories.**

This is the last layer of the source enforcement architecture: the portfolio view that inventories
every engineering project and answers, for each one, whether UI standards apply, whether the gate is
installed, whether the gate is actually required, and what the latest verdict was.

The division of labour is already fixed by the existing repositories.
[StandardsEnforcer](../../../StandardsEnforcer) owns governance verdicts and holds INV-E1 — never
convert an unknown, missing, unverifiable, or failed enforcement condition into a successful
compliance result. [StandardsOrchestrator](../../../StandardsOrchestrator) composes standards
authorities and its authority boundary forbids domain rules, detectors, and applicability logic from
living there. Neither may decide what counts as a user interface.

So this repository's contribution is small and already shipped: the classifier
([ADR 0003](../adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md)) and
`docs/integration-contract.md`, both delivered in `05-applicability-classifier.md`. Everything
below is authored elsewhere, against that contract.

The invariant that governs the whole layer, from the source enforcement architecture:

```text
API call failed → assume required → GOVERNED     ← manufactures evidence
API call failed → assume missing  → UNGOVERNED   ← also manufactures evidence
```

Both are prohibited. An unestablished governance condition is `INDETERMINATE`.

---

### Author the Orchestrator adapter

- **Status:** `NOT_STARTED`
- **Purpose:** Let StandardsOrchestrator invoke this pack's classifier and evaluator without
  containing any knowledge of what a UI is.
- **Deliverables:** in StandardsOrchestrator, `registry/uiux-1.0.0.adapter.json` following the
  existing adapter grammar, adding an applicability block alongside the verdict block. The
  classification map, already specified in `docs/integration-contract.md`:
  `APPLICABLE → IN_SCOPE`, `NOT_APPLICABLE → OUT_OF_SCOPE_EVIDENCED`,
  `INDETERMINATE → SCOPE_REVIEW_REQUIRED`.
- **Acceptance Criteria:**
  - The adapter contains no UI signal logic, no rule identities, and no applicability reasoning — it
    maps one vocabulary onto another and nothing else.
  - `INDETERMINATE` maps onto a state that cannot enter Enforcer's closed passing set.
  - The adapter is authored from `docs/integration-contract.md`, not by reverse-engineering output.
- **Verification:**
  ```bash
  # In StandardsOrchestrator:
  node scripts/boundary.mjs    # → exit 0; the boundary test still passes with the new adapter
  ```
- **Dependencies:** `05-applicability-classifier.md`; `13-version-identity-and-reusable-workflow.md`.

### Wire the Enforcer to the two-gate result

- **Status:** `NOT_STARTED`
- **Purpose:** Make UI applicability part of governance without weakening the closed passing set.
- **Deliverables:** in StandardsEnforcer, handling for the pack's applicability output: an
  `OUT_OF_SCOPE_EVIDENCED` repository is not ungoverned and not failing — it is legitimately outside
  this pack's scope, with evidence. `SCOPE_REVIEW_REQUIRED` maps onto the existing state of the same
  name and, per INV-E1, is not a verdict.
- **Acceptance Criteria:**
  - No new state is invented in Enforcer; the pack's vocabulary maps onto states that already exist.
  - An unestablished applicability never resolves to either `GOVERNED` or `NOT_APPLICABLE`.
  - A repository whose classifier could not run is distinguishable from one whose classifier ran and
    could not decide.
- **Verification:**
  ```bash
  # In StandardsEnforcer:
  npm test    # → the state-vocabulary walk still passes with the UIUX pack registered
  ```
- **Dependencies:** the Orchestrator adapter.

### Build the UI adoption controller

- **Status:** `NOT_STARTED`
- **Purpose:** Produce the portfolio inventory, with every cell either established or visibly
  unestablished.
- **Deliverables:** a controller — repository to be determined, most likely alongside the existing
  portfolio tooling rather than here — reporting per repository: whether a UI appears to exist;
  whether applicability has been established; the governing standards version; whether a policy
  exists; whether the version is valid; whether the authoritative gate runs; **whether the gate is
  actually required**; the latest verdict; whether browser evidence is available; manual-review
  freshness; exception count; and evidence gaps. Repository governance states:
  `GOVERNED`, `UNGOVERNED`, `INDETERMINATE`, `NOT_APPLICABLE`.
- **Acceptance Criteria:**
  - A host-API failure produces `INDETERMINATE` for the affected cell. It never assumes required and
    never assumes missing.
  - "Gate installed" and "gate required" are separate columns, because a committed workflow file is
    not proof that enforcement exists.
  - Branch-protection and bypass-permission facts are recorded as host-platform evidence with the
    time they were read, since they can change without any repository changing.
- **Verification:**
  ```bash
  # In the controller repository: an inventory run over the portfolio produces a row per repository
  # with no cell defaulting to a favorable value on error.
  ```
- **Dependencies:** the Enforcer wiring; `14-real-project-dogfood.md`, since turning the required
  check on portfolio-wide before the detectors are calibrated is how a gate gets disabled.

### Establish the organization enforcement policy

- **Status:** `NOT_STARTED`
- **Purpose:** State the rule that makes the mechanism binding, outside this repository.
- **Deliverables:** an organization-level policy statement, recorded wherever portfolio policy
  lives:
  > Any production engineering repository for which a user-interface surface is established as
  > applicable must be governed by an approved immutable UIUXDesignStandards version, execute its
  > authoritative validation gate, and require that gate before changes enter the protected default
  > branch.

  and separately:
  > Failure to establish whether a repository has a UI is `INDETERMINATE`, not `NOT_APPLICABLE`.
- **Acceptance Criteria:**
  - The policy is recorded outside this repository, since a standards pack cannot grant itself
    authority over a portfolio.
  - The required check is turned on portfolio-wide only after the controller reports the inventory
    honestly and the detectors have been calibrated against a real project.
- **Verification:**
  ```bash
  # The policy document exists in the portfolio governance repository and names this pack.
  ```
- **Dependencies:** the adoption controller.

---

## Gotchas this section discovered

*Deferred; not started.*
