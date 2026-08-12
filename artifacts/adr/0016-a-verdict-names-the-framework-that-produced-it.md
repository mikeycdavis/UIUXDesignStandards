# 0016 — Required a verdict to name the framework that produced it

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** repository owner

## Context

v1.0.0 is published, so other repositories can now consume this pack. That turns a latent gap into a
live one.

A project declares `standardVersion: "1.0.0"` in its policy. Nothing about that declaration causes
the 1.0.0 rule set to be used — a run evaluates whatever catalog is on disk. While the framework was
its own only consumer the two could not disagree, because they were the same working tree. Once a
policy pins a version and a workflow checks out a ref, the pin and the ref are independent sources of
truth, and when they drift the envelope carries `standardVersion: "1.0.0"` beside a verdict the 1.0.0
rule set never produced.

That is not a compliance failure. It is **a provenance lie**, and it is the most dangerous shape a
result can take here: every field is well-formed, the status is real, and the only untrue thing is
which rules reached it. Nothing about the envelope looks wrong.

EngineeringStandards guards this by comparing `policy.standardVersion` against its own `VERSION`
file, and that guard is sound there. Ported here it would not work, for a reason specific to this
family's release convention. Under ADR 0015 `VERSION` names the LAST RELEASED version and stays there
while development continues, so this repository's own post-release `main` reports `VERSION` `1.0.0`
while being demonstrably not the `v1.0.0` artifact. A string comparison calls that a match. A
consumer that pinned 1.0.0 would be evaluated by unreleased changes and told it was evaluated by
1.0.0 — the exact failure the guard exists to prevent, passing through it.

## Decision

**A verdict labelled with a standards version is produced by that released version, and identity is
established against the artifact rather than the label.** Two conditions, both necessary:

```text
the declared version equals the executing VERSION     necessary, not sufficient
AND the executing tree is exactly that release's tree  equality with the tag, ADR 0015
```

`scripts/version-identity.mjs` owns this, and owns `resolveRelease` with it — one owner for "is this
tree the released artifact?", for the same reason `content-identity.mjs` is the only owner of
freshness. Five outcomes:

| Outcome | Condition | Blocking |
| --- | --- | --- |
| `MATCH` | versions equal, executing tree is that release | no |
| `VERSION_MISMATCH` | the versions name different releases | **yes** |
| `EXECUTED_TREE_IS_NOT_THE_RELEASE` | versions equal, tree is not the release | **yes** |
| `SELF_EVALUATION` | the evaluated project is inside the executing framework's own tree | no |
| `UNVERIFIED` | versions equal, which artifact is executing could not be established | no |

**The guard runs as Gate 0b** — after policy validity, before Gate 1 — so a mismatch reaches no
classifier and no rule. It exits 2 and emits no envelope, because an envelope carries a `status` and
that status is precisely the claim being refused. Exit 1 would assert the project failed a rule, and
no rule was reached.

**`UNVERIFIED` never becomes `MATCH`.** A vendored copy with no git reports `executedCommit: null`
and an unverified identity rather than a match inferred from agreeing version strings. It does not
block — the versions genuinely agree and the compliance result is genuine — but the envelope says
which question went unanswered, so a governance layer can refuse what this tool will not pretend
about.

**The envelope carries the identity as evidence**, not as a reference string:

```json
"versionIdentity": {
  "pack": "UIUXDesignStandards",
  "declaredVersion": "1.0.0",
  "executedVersion": "1.0.0",
  "executedCommit": "8353469...",
  "executedTree": "RELEASE_TREE",
  "identity": "MATCH"
}
```

StandardsEnforcer consumes that rather than trusting a workflow's `uses:` line, which is a string
about intent rather than a record of what ran.

**`SELF_EVALUATION` is established by path containment, never by declaration.** A project inside the
executing framework's working tree is not a second object whose version could be misreported. The
direction matters and is not symmetric: the reusable workflow checks the framework out *into* the
consumer (`<consumer>/.uiux-standards`), so a consumer is never inside a framework and never reaches
this branch.

**The refusal can be waived only from library code** — `runValidate(target, {
allowUnreleasedFramework: true })` — never from a flag or an environment variable. The waiver
suppresses the refusal and not the finding: the envelope still records
`EXECUTED_TREE_IS_NOT_THE_RELEASE`.

## Alternatives considered

**Compare version strings, as EngineeringStandards does.** Rejected: under ADR 0015 a post-release
branch and its last release report the same `VERSION`, so the comparison passes the exact case that
motivates the guard. This is now a registered falsifier — weakening the artifact comparison to a
version comparison must be caught.

**Report the mismatch in the envelope and let the workflow decide.** Rejected: it produces the
mislabelled envelope and relies on every consumer to check a field. The tool that knows the verdict
is unsound is the tool that should decline to issue it.

**Treat a mismatch as `NON_COMPLIANT`.** Rejected, and it is the most tempting error, because exit 1
makes CI red without any new plumbing. The framework has not established that the project violates
anything; it has established that it cannot truthfully issue the requested verdict. Reporting a
project as non-compliant because its CI is misconfigured is a false accusation, and it is the mirror
image of the false green.

**Resolve the historical rule set and evaluate the declared version.** Rejected for v1: the snapshot
records identities, not rule bodies, so honouring a pin would mean checking out and executing the
older framework — which is what the workflow's `standards-ref` already does. The guard narrows the
gap rather than closing it, and says so.

**A CLI flag or environment variable for the unreleased case.** Rejected: a flag gets pasted into a
workflow and never removed, and an environment variable is worse because it is invisible in the run
that used it. An argument in library code is a choice made in source, where a reviewer sees it.

**Refuse `UNVERIFIED` as well.** Rejected: it would break every non-git consumption — a tarball, a
vendored copy, a container image — and the versions do agree in those cases. The strictness belongs
at the distribution boundary, where the reusable workflow can require `MATCH`.

## Consequences

**Makes easier.** A consumer can pin a version and know the pin means something. A governance layer
receives a machine-verifiable statement of what executed rather than a workflow reference string it
must take on trust. The published `v1.0.0` tag and this repository's own post-release `main` form a
natural negative control: anything claiming 1.0.0 must resolve the tag.

**Makes harder.** A consumer whose workflow points at a branch now gets exit 2 where it previously
got a verdict, and the fix is to pin an immutable ref rather than to change a setting. Evaluating a
project against an unreleased framework requires library code. The reusable workflow must fetch tags
(`fetch-depth: 0`), because a shallow checkout has none and would resolve `UNVERIFIED` on every run.

**Commits the project to.** Refusing to produce results whose provenance it cannot state.
Distinguishing a configuration failure from a compliance failure at the exit code, permanently.
`resolveRelease` having exactly one owner.

**Known cost accepted.** Historical rule-set resolution is still not implemented, so the guard
detects the disagreement and stops rather than evaluating the version that was asked for. It narrows
the gap and does not close it, and the error message says so instead of implying the framework could
have honoured the pin.
