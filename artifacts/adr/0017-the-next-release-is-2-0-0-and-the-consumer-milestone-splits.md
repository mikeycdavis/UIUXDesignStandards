# 0017 — Made the next release 2.0.0, and split the external-consumer milestone

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** repository owner

## Context

Section 13 added the version-identity guard (ADR 0016) and the reusable workflow. Two questions
followed, and both turned out to be about the same thing: what a released artifact is allowed to
claim.

**The first is a circularity.** The milestone as originally scoped was "prove the reusable workflow
against the published v1.0.0 artifact". That is unsatisfiable, and the reason is structural rather
than a matter of effort. `v1.0.0` is `8353469`; it contains neither `scripts/version-identity.mjs`
nor `.github/workflows/validate.yml`, because both were written afterwards. Meanwhile the tree that
does contain them correctly refuses to impersonate `v1.0.0`, because that is exactly what it was
built to refuse. So:

```text
v1.0.0                 exposes no workflow and no guard
post-release main      exposes both, and honestly refuses to be called 1.0.0
```

There is no honest ref today that can both exercise the new workflow and produce a `MATCH` for a
released version. A successful external consumer run before the next release is not merely difficult;
it would require the guard to lie.

**The second is the increment.** `CHANGELOG.md`'s semver table covers rule changes — a new required
or forbidden rule is MAJOR, a recommended one MINOR, wording PATCH. It says nothing about a change to
what `validate` *does*, which is what the guard is.

## Decision

### The next immutable release is `2.0.0`

The test is whether an existing, valid v1.0.0 consumer can receive a materially different enforcement
outcome without changing its project. It can:

```text
before                                   after
policy.standardVersion = 1.0.0           same policy, same project
framework checkout = post-v1.0.0 main    same checkout, VERSION still reads 1.0.0
→ validation proceeds, verdict issued    → EXECUTED_TREE_IS_NOT_THE_RELEASE, exit 2, no verdict
```

That removes a previously accepted execution path and turns a working invocation into a hard failure.
The reusable workflow on its own would be additive and MINOR-shaped; the additional identity fields in
the envelope are additive and MINOR-shaped; but the guard changes the semantics of an existing command,
and the combined release takes the strongest shape in it.

**A bug fix can still be breaking.** The old behaviour allowed executions the corrected contract
refuses, and the argument that it never deserved to work is an argument about merit, not about
compatibility. Semver describes the adopter-facing consequence. So this is not downgraded to 1.1.0 on
the grounds that the previous behaviour was defective.

The consequence is intended: upgrading to the new pack requires a project to adopt the new major
contract explicitly, rather than silently becoming subject to stricter identity semantics.

```text
v1 consumer adopting the v2 workflow without changing its policy
→ VERSION_MISMATCH → exit 2
```

`CHANGELOG.md`'s increment table gains the row it was missing: a change to what an existing command
accepts or refuses is MAJOR, independently of whether any rule moved.

### The external-consumer milestone splits in two

Forcing one status to describe both halves would misreport whichever half is not done.

**13A — external distribution canary.** Publishable now, and its expected result is a refusal. A
genuinely separate repository invokes the reusable workflow pinned to an exact development sha, with
a policy declaring `1.0.0`:

```text
workflow successfully invoked cross-repository
framework checked out with enough history for tags
consumer policy reached the framework
executedVersion 1.0.0 · executedTree POST_RELEASE_DEVELOPMENT
identity EXECUTED_TREE_IS_NOT_THE_RELEASE
→ exit 2, no compliance envelope
```

That is not a failed dogfood. It is the correct first external proof, and it establishes seven things
no in-repository test can: that GitHub can invoke the workflow across repositories at all, that the
checkout carries sufficient history, that the policy reaches the framework, that the framework
identifies its exact executing commit, that the machine-readable identity error survives the workflow
boundary, that a workflow pinned to unreleased code cannot masquerade as the last release, and that
no envelope is manufactured after an identity failure.

It is named **external distribution canary**, never "successful adoption".

**13B — first successful external consumer.** Blocked on `v2.0.0` existing, and recorded as blocked
rather than pending. Only then can the positive case run — a consumer declaring `2.0.0` against the
workflow at `@v2.0.0`, reaching `MATCH` and a real evaluation — with both negative controls repeated
against a *released* workflow rather than a branch.

### What section 13 may claim in the meantime

> The reusable workflow has been exercised from an external repository and the distribution boundary
> is operational. The version-identity guard correctly refuses unreleased framework code when a
> consumer requests the last released version. Successful external consumption of the workflow as an
> immutable standards release remains unverified until a release containing this workflow exists.

## Alternatives considered

**Resolve the circularity with a development escape hatch** — `--allow-unreleased`,
`--ignore-version-identity`, `ALLOW_UNRELEASED=true`, or a `standardVersion: main` sentinel.
Rejected, and this is the decision the rest depends on. Every one of them is the consumer escape
hatch section 13 exists to eliminate, and a hatch added to make a test pass is indistinguishable at
runtime from a hatch used to make a build pass. None exists; a test asserts that no flag and no
environment variable can weaken the guard.

**Create a `v1.1.0` tag to test against.** Rejected: a release identity is evidence of a release
decision, and manufacturing one to satisfy a test would make the tag mean "somebody needed a tag".
It is the chronology mistake in a new costume.

**Release the guard as 1.1.0.** Rejected — see the increment reasoning. The rule set is unchanged,
which is a real argument, but `standardVersion` governs more than the catalog once the framework can
refuse.

**Wait for a successful consumer before publishing section 13.** Rejected: that is the circular
dependency itself. Publishing the implementation as development code is what makes the canary
possible, and the canary is what makes the release worth cutting.

**Keep one milestone and mark it partially complete.** Rejected: "partially complete" would be read
as "mostly working". Transport and released consumption are different claims with different evidence,
and one of them is blocked.

## Consequences

**Makes easier.** The milestone can proceed immediately instead of waiting on a release that is
waiting on the milestone. The canary tests the boundary that in-repository tests structurally cannot.
The v2.0.0 requirement makes adopting stricter identity semantics an explicit act by each consumer.

**Makes harder.** Cutting 2.0.0 means generalising release machinery that is currently
v1.0.0-specific — `release-readiness.mjs` hardcodes the snapshot path, the report filename, and the
frozen counts. The identity block's six fields become a versioned interface at the same time, so
that work is one piece of work rather than three.

**Commits the project to.** Splitting a milestone rather than letting one status describe two claims.
Naming a proof by what it establishes — "distribution canary", not "dogfood complete". Never
manufacturing a release identity to satisfy a test.

**Known cost accepted.** Between now and 2.0.0 the framework has a published release whose consumers
get no identity guard at all, and a development line that no consumer can successfully consume. That
window is real, it is the direct consequence of building the guard after the first release rather
than before it, and it is recorded here rather than smoothed over.
