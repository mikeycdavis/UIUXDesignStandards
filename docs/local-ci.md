# Local CI, and verified pull-request submission

GitHub remains the source-control, pull-request, and review system. GitHub-hosted Actions are no
longer required to establish that a branch builds and passes its checks: the complete pipeline runs
in Docker on the developer's machine, before the branch is pushed and before the pull request exists.

One invariant holds the arrangement together, and everything below is either a way of enforcing it or
a consequence of it:

> **A pull request may only be submitted if the exact commit SHA being pushed has successfully passed
> the repository's complete containerized CI pipeline.**

Where that is enforced, and how it was proved, is §8.

---

## 1. Prerequisites

| Needed | Why |
| --- | --- |
| Docker Engine, with Compose v2 | The isolation boundary. `docker compose version` must report v2 or later. |
| Git | To resolve the commit under verification. |
| Node 18+ on the host | Only to *invoke* the workflow — the checks themselves never run on the host. |
| GitHub CLI, authenticated | Optional. Needed only to open the pull request; the push works without it. |

The host needs nothing else. No Node toolchain matching the CI one, no database, no globally
installed packages, no running services. That is the point of the container: a check that passes does
so because the repository is correct, not because a particular machine is set up a particular way.

The GitHub CLI is used through the session the developer already has. No token is read from, written
to, or baked into this repository or the CI image.

---

## 2. Running local CI

```
npm run ci
```

That is the authoritative command. It builds the image, creates an isolated environment, runs every
check in [scripts/ci-pipeline.mjs](../scripts/ci-pipeline.mjs), tears the environment down, and exits.

Options, passed after `--`:

| Option | Effect |
| --- | --- |
| `--keep-on-failure` | Leaves the containers and network standing when a stage fails, so the failing container can be inspected. A passing run always cleans up. |
| `--require-clean` | Refuses to run when the working tree has uncommitted changes. What submission passes. |
| `--verbose` | Streams the image build and the teardown as well as the stages. |
| `--json` | Prints the result document instead of the human report. |
| `--help` | Usage. |

Exit codes are the framework's own triple, not a new dialect:

```
0   every stage passed
1   the pipeline ran and a stage failed        — the repository has a problem
2   no verdict was reached                     — Docker absent, image would not build,
                                                 not a git repository, or the container's
                                                 HEAD is not this working tree's HEAD
```

Collapsing 1 and 2 is how a wrapper teaches its caller to read "it did not run" as "it was fine".
Submission refuses on both, and refuses differently.

### The result document

Every run — passing or failing — writes `artifacts/local-ci/latest.json`:

```json
{
  "commit": "36ba446...",
  "branch": "local-docker-ci",
  "workingTree": "clean",
  "environment": { "runner": "docker", "image": "uiux-standards-ci:local", "verifiedCommit": "36ba446..." },
  "result": "passed",
  "startedAt": "...",
  "completedAt": "...",
  "checks": [{ "id": "validate", "result": "passed", "exitCode": 0, "durationMs": 4210 }]
}
```

`commit` is what the host was on. `environment.verifiedCommit` is what the *container* reported when
asked — those two agreeing is one of the three comparisons in §8.

The directory is git-ignored. This repository does retain evidence on purpose — `artifacts/release/`
holds frozen release records — and the distinction is that a release record is a decision while a
local CI run is a measurement somebody took on one machine. Committing the measurement would leave a
"passed" file in the tree outliving the commit it described.

---

## 3. Submitting a verified pull request

```
npm run submit-pr
```

The whole developer workflow is: make changes, commit, run that.

| Option | Effect |
| --- | --- |
| `--base <branch>` | Branch to open against. Defaults to the remote's default branch. |
| `--draft` | Open as a draft. |
| `--title <text>` | Defaults to the subject of the verified commit. |
| `--body <text>` | The verification block is appended to it, never over it. |
| `--verbose` | As above. |

In order, it: confirms this is a git repository; refuses a detached HEAD, the default branch, and a
branch equal to the base; refuses a dirty working tree outright; records `HEAD`; runs the pipeline of
§2; stops if it failed; re-resolves `HEAD`; compares; pushes the **sha** by explicit refspec
(`git push origin <sha>:refs/heads/<branch>`, not a branch-name push); and opens the pull request.

It never commits anything on your behalf, and it never pushes when verification failed.

The refusals, in the words they are printed in:

```
CI failed. No branch was pushed and no PR was created.

HEAD changed after CI verification. The current commit has not been verified. Re-run CI before submitting.
```

There is no override for the dirty-tree refusal, and that is deliberate rather than unfinished. The
invariant is a claim about a commit; uncommitted edits mean the thing verified was a commit plus some
changes that will not travel with the push, so the verification would describe a tree that exists
nowhere else. A test asserts that no such escape flag is parsed.

---

## 4. What CI performs

Eleven checks, in this order. They are this repository's own commands — nothing here is a pipeline
invented for the container, and no coverage from the previous arrangement was dropped.

| # | Check | What it establishes |
| --- | --- | --- |
| 1 | `inventory` | The standards corpus matches the source inventory it is tested against. |
| 2 | `provenance` | Every external-source claim in the prose has a provenance record. |
| 3 | `rule-identity` | Prose, freeze artifact, catalog, and provenance agree on rule identity. |
| 4 | `policy` | This repository's own policy is valid configuration. |
| 5 | `policy:templates` | The adoption templates are valid configuration. |
| 6 | `diagrams` | The architecture diagrams match their canonical source. |
| 7 | `test` | The full suite, including the falsifier harness. |
| 8 | `audit` | Evidence discovery. Not `--strict`: advisory findings must not break a build. |
| 9 | `validate` | **The gate.** Gate 0, Gate 1, Gate 2, and the verdict. |
| 10 | `applicability:self` | Breaks if this repository grows a UI without saying so. |
| 11 | `release:readiness` | Every release criterion, evaluated on every change rather than on tag day. |

Mapped onto the categories a general CI pipeline has: dependency restore is **structurally absent**
(zero dependencies, no lockfile, no install step — ADR 0001); there is no compilation step (Node ESM,
executed as written); lint/format/static analysis is performed by the suite's own source-shape
meta-tests rather than by an external linter, which is why no linter appears here; unit, integration,
and architectural tests are all inside check 7; standards/architecture validation is checks 1–6 and
9–11. There is no database, no frontend build, no browser or E2E layer, and no generated code.

### Both runners run the same list

[scripts/ci-pipeline.mjs](../scripts/ci-pipeline.mjs) is authoritative.
[test/local-ci.test.mjs](../test/local-ci.test.mjs) compares it against
[.github/workflows/ci.yml](../.github/workflows/ci.yml) in **both** directions and fails on any
divergence — a check the workflow gained that the container does not run would not gate a pull
request, and a check the container runs that the workflow dropped would mean the two disagree about
what "CI passed" means.

The hosted workflow still spells its steps out rather than calling `npm run ci`, and that is not
duplication left by accident. `test/package.test.mjs` requires the workflow to name `npm test`,
`npm run validate`, and `npm run applicability:self` as steps, because a workflow that hides the gate
inside an opaque wrapper is one nobody can read the gate out of. So the two runners stay legible and
the *divergence* is what is forbidden. Adding a check means editing the list and the workflow
together, which is what "one definition" was actually after.

---

## 5. Isolation: containers, databases, and what CI can reach

**This repository has no database, and none is provisioned.** Saying so explicitly matters more than
it looks: the absence is a fact about this repository, not a gap in the pipeline. Everything that
could have been state is file-backed and content-addressed instead — the catalog is JSON in `rules/`,
the policy is `project-policy.yml`, and freshness is resolved from git object identity by
[scripts/content-identity.mjs](../scripts/content-identity.mjs). There is nothing to migrate and
nothing to seed.

The slot is built anyway, because the pattern is meant to be reused. Any service in
[compose.ci.yml](../compose.ci.yml) that is not the runner is treated as a dependency:
[scripts/ci.mjs](../scripts/ci.mjs) brings those up with `--detach --wait`, which blocks on each
service's declared Compose `healthcheck` rather than on a sleep, and fails the run with exit 2 if one
never becomes healthy. A fixed sleep is either longer than it needs to be on every run, or shorter
than it needs to be on the run that matters. A sibling repository adds its database as a second
service with a health check, applies migrations as an early stage using the same mechanism production
uses, and changes nothing else.

What CI can reach, and what it cannot:

- **The source is copied into the image, not mounted.** No bind mounts, no host paths. CI cannot
  write to the working tree, so the falsifier harness vandalising a copy of the repository and
  `diagrams` potentially rewriting a file are both contained. It also means an edit made while a run
  is in progress cannot change what the run is examining.
- **No ports are published, no env file is read, and the Docker socket is not mounted.** Tests assert
  each of those absences.
- **The runner is off the network entirely** (`network_mode: none`). Nothing in the checks reaches a
  network, and now nothing can. This also avoids a failure that is easy to mistake for a CI bug: a
  unique project per run means a bridge network per run, and Docker's default address pool is finite —
  on a machine with a few dozen compose projects standing it is already fully subnetted, and every run
  fails at network creation with an error that never mentions CI. **A repository adding dependency
  services must remove that line**, because the runner and its database have to share a network; that
  repository should then use a project name stable across runs rather than unique per run.
- **The container runs as the unprivileged `node` user.** CI executes the code under review, and code
  under review gets the least authority that still lets it be reviewed.
- **Every Docker command runs under a project name unique to the run** (`ci-<repo>-<clock><pid>`).
  Teardown is `compose down --volumes --remove-orphans` scoped to *that project*. There is no
  `docker rm` by pattern, no `docker prune`, and no name matching anywhere in the workflow — those
  are the constructs that eat somebody else's database. Concurrent runs, and other repositories using
  this pattern, cannot collide.
- **`.git` is in the build context on purpose.** Excluding it would not fail the identity checks; it
  would make them report that they could not tell, and the pipeline would stay green. See
  [.dockerignore](../.dockerignore), and the test that asserts the exclusion is never added.

The image tag is stable (`uiux-standards-ci:local`) while the project is ephemeral. That is what
makes a second run fast without making it different: the layer cache is read-only input, and teardown
never removes the image, because "repeatable" should not mean "download Debian again".

---

## 6. Cleanup, and debugging a failure

Teardown runs on success, on failure, and on a throw. Each stage container is additionally removed as
it exits (`--rm`), so the common path is self-cleaning rather than cleanup-dependent — which matters
most in the case teardown does not cover, a developer interrupting a long stage.

To keep a failed environment:

```
npm run ci -- --keep-on-failure
```

The run then prints the project name and the two commands worth having:

```
docker compose --file compose.ci.yml --project-name <project> run --no-TTY ci bash
docker compose --file compose.ci.yml --project-name <project> down --volumes
```

The first drops you into the exact image at `/work`, where you can re-run the failing stage by hand.
The second removes what was kept. A passing run never leaves anything to remove.

---

## 7. Local CI versus GitHub-hosted Actions

They are different claims, and nothing in this workflow blurs them.

|  | Local CI | Hosted Actions |
| --- | --- | --- |
| Runs | Before push, on the developer's machine, in Docker | After push, on GitHub's runners |
| Required to submit | **Yes** | No |
| Establishes | This exact commit passed these checks in a clean container | The same, on GitHub's infrastructure |

[.github/workflows/ci.yml](../.github/workflows/ci.yml) is **not** deleted and is not disabled.
It remains useful as an independent second execution, and it is what a reviewer who does not trust a
locally produced claim can point at. If hosted Actions cannot run — account, quota, or billing — local
CI is unaffected, because it shares no infrastructure with them.

The pull-request body says which one happened, in those words: *"verified by the repository's
containerised pipeline, on a developer machine … not a GitHub-hosted Actions result"*. A test asserts
that sentence is there. This framework exists to refuse evidence that overstates its own surface, and
a pull-request body is not where that starts.

**Self-hosted runners.** The design already accommodates one without redesign: a self-hosted runner
executes `npm run ci` and gets the identical pipeline, because the pipeline is a repository command
and not YAML. None is required, and none is configured.

---

## 8. The exact-commit invariant, and where it is enforced

```
commit
  -> refuse a dirty tree, a detached HEAD, the default branch
  -> before  = git rev-parse HEAD
  -> run the full containerised pipeline
  -> after   = git rev-parse HEAD
  -> three comparisons, all of which must hold
  -> git push origin <before>:refs/heads/<branch>
  -> gh pr create
```

`verifyCommitIdentity` in [scripts/submit-pr.mjs](../scripts/submit-pr.mjs) makes three comparisons,
and all three must agree before anything is pushed:

1. `after == before` — HEAD did not move while CI was running. CI takes minutes, and minutes are long
   enough to amend a commit.
2. `result.commit == before` — the pipeline's own record names the commit about to be pushed.
3. `result.environment.verifiedCommit == before` — the sha reported *from inside the container that
   ran the checks*. A host-side comparison alone would miss a build context that silently disagreed
   with the working tree.

The push is by explicit refspec on the sha. `git push origin <branch>` would publish whatever the
branch points at when the command runs, which is the exact substitution the comparisons just ruled out.

It is a pure function, and every way it must refuse — plus the positive control, without which
"always refuses" would satisfy all of them — is asserted in
[test/local-ci.test.mjs](../test/local-ci.test.mjs). Proving a SHA guard by rewriting real history
demonstrates it once; proving it in a test proves it on every run.

---

## 9. What is not reproduced locally

Stated rather than left to be discovered:

- **GitHub's runner image.** Local CI runs `node:20-bookworm-slim` plus git. `ubuntu-latest` carries a
  large preinstalled toolchain. Nothing in these eleven checks uses any of it, but the images are not
  identical and a future check that depends on a preinstalled tool would pass hosted and fail locally.
- **The `workflow_call` reusable workflow** ([.github/workflows/validate.yml](../.github/workflows/validate.yml))
  is not exercised here. It is a consumer-facing distribution artifact whose subject is cross-repository
  invocation, artifact upload, and annotation — GitHub features with no local equivalent. Local CI
  covers the commands that workflow calls, not the calling.
- **Branch protection, required checks, and who may bypass them.** Facts about the hosting platform,
  not about any file in this repository. A committed workflow is not proof that enforcement exists,
  and neither is a green local run.
- **The EngineeringStandards cross-reference check.** `rule-identity` resolves the sibling catalog
  from an absolute path on the author's machine. In the container — and on any hosted runner — it is
  absent, and the check reports `cross-references: NOT_EVALUATED`. That is the correct output rather
  than a defect: the inability is named instead of being converted into a pass. Mounting the sibling
  repository in would reintroduce exactly the developer-machine dependency the container removes, so
  it is not mounted, and the test asserts both branches.
- **Anything requiring the network.** Nothing in the eleven checks does, and the container is not
  given credentials for anything if a future check tried.

### Four defects this arrangement found on its first runs

Recorded because they are the argument for the arrangement, and because each had been invisible.

1. **`npm test` could not run on Node 20.** The script wrapped its file glob in quotes, so no shell
   expanded it, and Node's test runner only accepts glob patterns itself from Node 21 onward. The
   author's host is on Node 24 and expanded it natively. Every other environment — including the
   hosted runner the workflow pins to Node 20 — would have found no test files at all. The quotes are
   gone.
2. **The falsifier harness's anti-vacuity guard was Node-version-specific.** It looked for `ℹ tests N`,
   which is the `spec` reporter's spelling; Node 20 defaults a non-TTY run to `tap` and prints
   `# tests N`. On the pinned version the harness reported that nothing ran, on runs where everything
   had. It now accepts both.
3. **The release gate was measuring a suite that ran nothing.** `release:readiness` spawns the suite
   directly, with no shell, and passed it the same unexpandable glob — so on Node 20 it found no
   files, and reported `tests.suite-is-green-and-non-empty` as `NOT_EVALUATED`. That is the framework
   behaving exactly as designed: it refused to call an unmeasured suite a passing one. It is also a
   release criterion that had never established anything. It now enumerates the files itself.
4. **A test asserted a property of one machine.** See the cross-reference entry above.

None of the four was a failure of the checks. All four were failures of the *only place the checks had
ever run*, which is the thing a container is for. Two of them — 2 and 3 — were the same one-line
assumption about which reporter Node's test runner defaults to, in two files, and both had been
sitting behind a green local build.

---

## 10. Reusing this in another repository

Four files, and only one of them has repository-specific content:

| File | Change needed |
| --- | --- |
| [scripts/ci-pipeline.mjs](../scripts/ci-pipeline.mjs) | Rewrite `STAGES`. This is the only substantive edit. |
| [docker/ci.Dockerfile](../docker/ci.Dockerfile) | Base image and tools for that stack. |
| [compose.ci.yml](../compose.ci.yml) | Add dependency services with health checks, if any. |
| [scripts/ci.mjs](../scripts/ci.mjs), [scripts/submit-pr.mjs](../scripts/submit-pr.mjs) | None. |

The parity test is worth carrying over too, adjusted to whatever that repository's hosted workflow
looks like. The decision behind all of this is recorded in
[ADR 0018](../artifacts/adr/0018-local-containerised-ci-gates-pull-request-submission.md).
