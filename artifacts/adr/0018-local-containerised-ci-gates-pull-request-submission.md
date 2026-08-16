# 0018 — Made local containerised CI the gate on pull-request submission

- **Status:** Accepted
- **Date:** 2026-08-15
- **Deciders:** repository owner

## Context

GitHub is the source-control, pull-request, and review system, and stays that way. What was in
question is whether GitHub-*hosted* Actions must run for a branch to be considered proven. Hosted
Actions are subject to account, quota, and billing constraints that have nothing to do with whether a
branch is correct, and a project whose only proof mechanism can be switched off by a billing state is
a project with no proof mechanism.

The repository already had one honest pipeline: `.github/workflows/ci.yml`, eleven bare `npm run`
steps with no install step, each one a command a developer runs identically by hand. Its own opening
comment states the rule it was built on — *a check expressed in two places diverges, and the copy that
runs in CI is the one nobody reads*. Any local pipeline that restated those eleven checks in a shell
script would break exactly that rule, in the direction it was written to prevent.

There was also a specific, mundane failure worth naming, because it is the one this decision is really
about. A pipeline takes minutes. Minutes are long enough to amend a commit, stage a fix, or rebase.
A branch-name push after a green run therefore publishes whatever the branch points at *then*, which
is not necessarily what was verified. "The branch was green" and "this commit was verified" are
different claims, and only one of them is worth anything to a reviewer.

## Decision

### The complete pipeline runs locally in Docker, and gates submission

`npm run ci` builds an ephemeral environment from `docker/ci.Dockerfile`, runs all eleven checks, and
tears the environment down. `npm run submit-pr` runs that same pipeline and pushes only if it passed.
Hosted Actions remain enabled and remain useful as an independent second execution; they are not
required, and they are not deleted.

The isolation boundary is the container, and the source is **copied** into it rather than mounted.
That is not a detail: the falsifier harness deliberately vandalises a copy of the repository and
`diagrams` can rewrite a file, so a bind mount would let CI modify the developer's working tree. It
also means an edit made mid-run cannot change what the run is examining, which is what makes "this
tree passed" a claim rather than a hope.

`.git` travels with it. Four scripts shell out to git — committed-tree identity, release-tag identity,
release readiness, commit chronology — and a context without history would not fail those checks. It
would make them report that they could not tell, and the pipeline would stay green. A quiet
non-answer passing for a pass is the failure mode this entire framework is arranged against, so the
`.dockerignore` that excludes it is the one a test forbids.

### The invariant

> The commit pushed for a pull request is exactly the commit that passed the complete local Docker CI
> pipeline.

Three comparisons enforce it, and all three must hold: `HEAD` did not move across the run; the result
document names the commit about to be pushed; and the sha reported *from inside the container that ran
the checks* is that same commit. The third exists because the first two are both host-side, and a
build context that silently disagreed with the working tree would satisfy them.

The push is `git push origin <sha>:refs/heads/<branch>` — by refspec on the verified sha, never by
branch name, because a branch-name push is precisely the substitution the comparisons just ruled out.

A dirty working tree is refused with no override. The invariant is a claim about a commit, and
uncommitted edits mean the verified thing was a commit plus changes that will not travel with the
push — a tree that exists nowhere else. A test asserts no escape flag is parsed.

### One list, two runners, and divergence is what gets forbidden

`scripts/ci-pipeline.mjs` holds the stage list. The container derives from it, and
`test/local-ci.test.mjs` holds the hosted workflow to it in both directions.

The workflow deliberately still spells its steps out rather than calling `npm run ci`. `test/package.test.mjs`
requires it to name `npm test`, `npm run validate`, and `npm run applicability:self` as steps, because
a workflow that hides the gate inside an opaque wrapper is one nobody can read the gate out of — and
running Docker inside a hosted runner to avoid two spellings would trade a legible duplicate for an
illegible one. So both runners stay readable and the drift is what is made impossible.

## Alternatives considered

**Shell scripts — `ci.ps1` and `ci.sh` — as the entry point.** Rejected. It would be two more copies
of one pipeline, on a repository whose own package invariant requires every script to be a bare `node`
invocation. A single `scripts/ci.mjs` is cross-platform for free, is testable as a module, and obeys
the rule the repository already enforces on itself.

**Collapse the hosted workflow into a single `npm run ci` step.** Rejected — see above. It also would
not work: the hosted runner would need Docker-in-Docker for no benefit, since the point of local CI is
that hosted Actions are not required.

**Bind-mount the working tree into the container.** Rejected. Faster on every run, and it hands CI
write access to the tree under review while making the verified subject a moving target.

**Let the runner define the pipeline itself, and check nothing.** Rejected: that is the two-copies
problem with the check removed, which is how it becomes invisible.

**An override for the dirty-tree refusal.** Rejected. It is the same shape of hole as a
`--allow-unreleased` flag on the version-identity guard (ADR 0017), and rejected for the same reason —
a hatch added to make a local run convenient is indistinguishable at runtime from a hatch used to make
an unverified commit shippable.

**Introduce a CI platform — Jenkins, Woodpecker, GitLab CI.** Rejected: it would add the operational
surface this decision exists to remove, and a second place for the pipeline to be defined.

## Consequences

**Makes easier.** A branch can be proven with no hosted-Actions budget at all. The proof is about a
commit rather than about a branch, which is a stronger claim than the previous arrangement could make
at any price. A developer sees the same failure locally that a reviewer would see remotely, in the
same image, before anyone is asked to look.

**Makes harder.** Every developer now needs Docker. A run takes as long as the suite does — the
falsifier harness is most of it — and there is deliberately no fast variant, because a path that drops
the falsifiers removes the only evidence the rest of the suite can fail. Adding a check now means
editing two files together; the parity test will not allow one.

**Commits the project to.** Keeping the two runners in agreement mechanically rather than by
discipline. Pushing verified shas by refspec. Saying "local Docker verification" in a pull-request
body when that is what happened, and never "CI passed".

**Known cost accepted.** Local CI and hosted Actions do not run on identical images — `node:20-bookworm-slim`
plus git here, `ubuntu-latest` there. Nothing in the eleven checks touches the difference today, and a
future check that depended on a preinstalled tool would pass hosted and fail locally. That is recorded
in `docs/local-ci.md` §9 alongside the other things local CI does not reproduce, rather than smoothed
over: the reusable `workflow_call` distribution workflow, and every fact about branch protection,
which is a property of the hosting platform and not of any file here.
