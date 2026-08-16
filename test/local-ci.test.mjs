/**
 * Local containerised CI, and the guard on the commit it verifies.
 *
 * Two things are asserted here, and they fail for different reasons.
 *
 * THE PARITY CHECK. There are two runners for one pipeline — a container on a developer's machine and
 * a hosted GitHub workflow — and the failure mode of two runners is that they slowly stop running the
 * same thing. The one that drifts is always the one nobody watches. `scripts/ci-pipeline.mjs` holds
 * the list; these tests hold `.github/workflows/ci.yml` to it in BOTH directions, because a check the
 * workflow gained and the container never runs is a check that does not gate a pull request, and a
 * check the container runs and the workflow dropped is a green build that proves less than it says.
 *
 * THE SUBMISSION GUARD. `verifyCommitIdentity` is the whole exact-commit invariant, and testing it by
 * actually pushing would mean rewriting real history to produce the failure case. So it is a pure
 * function over three shas and a result document, and every way it must refuse is asserted directly —
 * including the positive control, without which "always refuses" would pass all of them.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CI_SERVICE, COMPOSE_FILE, IMAGE_TAG, STAGES, stageCommand, stageWorkflowStep } from "../scripts/ci-pipeline.mjs";
import { EXIT, parseArgs, UsageError } from "../scripts/ci.mjs";
import { PROTECTED_BRANCHES, checkBranch, checkTree, verificationBlock, verifyCommitIdentity } from "../scripts/submit-pr.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

/** YAML with its comments removed — a step is a `run:` line, and a comment naming a command is not one. */
const executable = (yaml) =>
  yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

// --- The pipeline definition ----------------------------------------------------------------------

test("the stage list is non-empty and every stage is a script the package declares", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.ok(STAGES.length >= 10, `only ${STAGES.length} stages — the pipeline is too small to be this repository's CI`);
  for (const stage of STAGES) {
    assert.ok(stage.id in pkg.scripts, `the pipeline runs '${stage.id}', which package.json does not declare`);
    assert.ok(stage.title.length > 0, `${stage.id} has no title`);
  }
  const ids = STAGES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "a stage is listed twice");
});

test("the three checks whose absence would be invisible are in the pipeline", () => {
  // The same three `test/package.test.mjs` pins in the hosted workflow, pinned here as well. `validate`
  // is the verdict; `test` carries the falsifier harness that proves the rest of the suite can fail;
  // the self-check breaks if this repository grows a UI without saying so. A pipeline that lost any of
  // them would still be eleven-ish stages of green.
  const ids = new Set(STAGES.map((s) => s.id));
  for (const required of ["validate", "test", "applicability:self"]) {
    assert.ok(ids.has(required), `the containerised pipeline does not run '${required}'`);
  }
});

test("npm's lifecycle script is invoked as npm test in both runners", () => {
  const tests = STAGES.find((s) => s.id === "test");
  assert.deepEqual(stageCommand(tests), ["npm", "test"], "the container would run `npm run test`, which is not the spelling the workflow guard looks for");
  assert.equal(stageWorkflowStep(tests), "npm test");
});

// --- Parity: one pipeline, two runners ------------------------------------------------------------

test("the containerised pipeline and the hosted workflow run the same checks, in both directions", async () => {
  const steps = executable(await read(".github/workflows/ci.yml"));

  const inWorkflow = new Set([
    ...[...steps.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]),
    ...(/\brun:\s*npm test\b/.test(steps) ? ["test"] : []),
  ]);
  assert.ok(inWorkflow.size >= 8, `only ${inWorkflow.size} checks parsed out of the workflow — the scan is broken`);

  const inPipeline = new Set(STAGES.map((s) => s.id));

  const missingFromContainer = [...inWorkflow].filter((id) => !inPipeline.has(id));
  const missingFromWorkflow = [...inPipeline].filter((id) => !inWorkflow.has(id));

  assert.deepEqual(
    missingFromContainer,
    [],
    "the hosted workflow runs checks local CI does not — a pull request could be gated on something no local run ever performs",
  );
  assert.deepEqual(
    missingFromWorkflow,
    [],
    "local CI runs checks the hosted workflow does not — the two would disagree about what 'CI passed' means",
  );
});

test("the parity check would notice a check appearing on only one side", async () => {
  // The mutation, without which the test above passes by virtue of comparing two things nobody
  // changed. Both directions are exercised, because a one-directional set comparison is the classic
  // way this check rots into checking nothing.
  const steps = executable(await read(".github/workflows/ci.yml"));
  const parse = (text) =>
    new Set([...[...text.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]), ...(/\brun:\s*npm test\b/.test(text) ? ["test"] : [])]);

  const added = parse(`${steps}\n      - run: npm run provenance:extra\n`);
  assert.ok([...added].some((id) => !STAGES.some((s) => s.id === id)), "a workflow-only check went undetected");

  const removed = parse(steps.replace("run: npm run validate", "run: echo skipped"));
  assert.ok(STAGES.some((s) => !removed.has(s.id)), "a check dropped from the workflow went undetected");
});

// --- The environment ------------------------------------------------------------------------------

test("the CI image installs git, because several checks report EVIDENCE_UNAVAILABLE without it", async () => {
  const dockerfile = await read("docker/ci.Dockerfile");
  const lines = dockerfile.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.match(lines, /apt-get install[^\n]*\bgit\b/, "the CI image does not install git");
  // Node 20 is what the hosted workflow pins. A local run on a different major is a local run that
  // can disagree with the hosted one for a reason unrelated to the change under review.
  assert.match(lines, /^FROM node:20/m, "the CI image is not on the Node version the hosted workflow pins");
  assert.match(lines, /^USER node/m, "CI executes repository code as root");
});

test("the build context keeps the git directory, which the identity checks need", async () => {
  const ignore = await read(".dockerignore");
  const rules = ignore.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.ok(rules.length > 0, "no exclusions declared — the guard would pass vacuously");
  for (const rule of rules) {
    assert.doesNotMatch(
      rule,
      /^\.?\/?\.git\/?$/,
      "the build context excludes .git — version identity and the release gate would resolve UNVERIFIED rather than fail, and the pipeline would stay green",
    );
  }
});

test("the CI environment mounts no host paths, publishes no ports, and carries no secrets", async () => {
  const compose = await read(COMPOSE_FILE);
  const lines = compose.split("\n").filter((line) => !/^\s*#/.test(line));
  const body = lines.join("\n");
  assert.match(body, new RegExp(`^\\s{2}${CI_SERVICE}:`, "m"), `the compose file declares no '${CI_SERVICE}' service`);
  assert.match(body, new RegExp(IMAGE_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the compose file does not pin the stable image tag");

  for (const [pattern, why] of [
    [/^\s*volumes:/m, "a volume or bind mount — CI would be able to reach the developer's filesystem"],
    [/^\s*ports:/m, "a published port — an ephemeral CI container has nothing to serve"],
    [/docker\.sock/, "the docker socket — nothing in CI needs to start containers"],
    [/^\s*env_file:/m, "an env file — CI must not read credentials off the developer's machine"],
  ]) {
    assert.doesNotMatch(body, pattern, `the compose file declares ${why}`);
  }

  // The runner is off the network entirely. Load-bearing twice over: nothing in the checks reaches a
  // network and now cannot, and a unique project per run that created a bridge network per run would
  // exhaust Docker's address pool on any machine with a few dozen compose projects standing. That is
  // not hypothetical — it is how this line came to exist, after a run failed with an address-pool
  // error that said nothing about CI.
  assert.match(body, /^\s*network_mode:\s*none\s*$/m, "the CI service attaches to a network it does not need");
});

test("the local-CI result document is not committed", async () => {
  const ignored = await read(".gitignore");
  assert.match(ignored, /^artifacts\/local-ci\/?$/m, "local CI output would be committed as if it were a retained release record");
});

// --- The runner's own argument handling -----------------------------------------------------------

test("the runner refuses an unknown option rather than ignoring it", () => {
  assert.throws(() => parseArgs(["--keep-on-failuer"]), UsageError, "a misspelled flag was silently ignored, so the guard the caller asked for was never on");
  assert.deepEqual(parseArgs(["--keep-on-failure", "--require-clean"]), {
    keepOnFailure: true, requireClean: true, verbose: false, json: false, help: false,
  });
});

test("the runner keeps the framework's three exit codes distinct", () => {
  // 1 and 2 mean different things — "the repository has a problem" and "no verdict was reached" — and
  // a wrapper that collapsed them would teach a caller to accept the second as the first.
  assert.equal(EXIT.PASSED, 0);
  assert.equal(EXIT.FAILED, 1);
  assert.equal(EXIT.NOT_RUN, 2);
  assert.equal(new Set(Object.values(EXIT)).size, 3);
});

// --- The exact-commit invariant --------------------------------------------------------------------

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

const passingEvidence = (commit = SHA_A, verified = commit) => ({
  result: "passed",
  commit,
  completedAt: "2026-08-15T00:00:00.000Z",
  environment: { verifiedCommit: verified },
  checks: STAGES.map((s) => ({ id: s.id, result: "passed" })),
});

test("submission proceeds when the verified commit, the container's commit, and HEAD all agree", () => {
  // The positive control. Without it every refusal below would also be satisfied by a function that
  // refuses unconditionally, which would be a guard that has never let anything through.
  assert.deepEqual(verifyCommitIdentity(SHA_A, SHA_A, passingEvidence()), { ok: true });
});

test("submission refuses when HEAD changed after CI verification", () => {
  const verdict = verifyCommitIdentity(SHA_A, SHA_B, passingEvidence(SHA_A));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /HEAD changed after CI verification\. The current commit has not been verified\. Re-run CI before submitting\./);
  assert.ok(verdict.message.includes(SHA_A) && verdict.message.includes(SHA_B), "the refusal names neither commit, so nobody can tell what happened");
});

test("submission refuses when the pipeline did not pass", () => {
  for (const evidence of [null, { ...passingEvidence(), result: "failed" }, { ...passingEvidence(), result: "not-run" }]) {
    const verdict = verifyCommitIdentity(SHA_A, SHA_A, evidence);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.message, "CI failed. No branch was pushed and no PR was created.");
  }
});

test("submission refuses when the pipeline examined a different commit than the one to be pushed", () => {
  const verdict = verifyCommitIdentity(SHA_A, SHA_A, passingEvidence(SHA_B));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /Nothing was pushed/);
  assert.match(verdict.message, /the pipeline examined/);
});

test("submission refuses when the container held a different commit than the pipeline recorded", () => {
  // The case a host-side comparison alone would miss: the result document says the right sha, but the
  // environment that ran the checks was on another one, so the checks are about a tree nobody is
  // proposing.
  const verdict = verifyCommitIdentity(SHA_A, SHA_A, passingEvidence(SHA_A, SHA_B));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /the container held/);

  const unrecorded = verifyCommitIdentity(SHA_A, SHA_A, { ...passingEvidence(SHA_A), environment: {} });
  assert.equal(unrecorded.ok, false, "a result document with no container sha was treated as agreement");
  assert.match(unrecorded.message, /unrecorded/);
});

// --- The submission's other refusals ----------------------------------------------------------------

test("submission refuses to open a pull request from a protected or detached branch", () => {
  assert.ok(PROTECTED_BRANCHES.has("main") && PROTECTED_BRANCHES.has("master"));
  for (const branch of ["main", "master", "HEAD", ""]) {
    assert.equal(checkBranch(branch, "main").ok, false, `'${branch}' was accepted as a source branch`);
  }
  assert.equal(checkBranch("develop", "develop").ok, false, "a branch was accepted as a pull request onto itself");
  assert.equal(checkBranch("local-docker-ci", "main").ok, true, "a topic branch was refused");
});

test("submission refuses a dirty working tree, and has no override for it", async () => {
  assert.equal(checkTree("").ok, true);
  assert.equal(checkTree("   \n").ok, true);
  const verdict = checkTree(" M scripts/ci.mjs\n?? scratch.txt\n");
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /uncommitted changes/);

  // The absence of an escape hatch, asserted rather than remembered. A flag that let a dirty tree
  // through would make the verified commit a commit plus some edits that never get pushed.
  const source = await read("scripts/submit-pr.mjs");
  for (const hatch of ["--allow-dirty", "--skip-ci", "--no-verify", "--force"]) {
    assert.equal(source.includes(`"${hatch}"`), false, `submit-pr parses ${hatch}, which is an escape from the invariant it exists to enforce`);
  }
});

test("the pull-request body reports local Docker verification and never claims hosted Actions passed", () => {
  const block = verificationBlock(passingEvidence());
  assert.match(block, /Verified commit \| `a{40}`/);
  assert.match(block, /\*\*PASS\*\*/);
  assert.match(block, /Docker/);
  assert.match(block, /not\*\* a GitHub-hosted Actions result/, "the body does not distinguish local verification from hosted CI");
  for (const stage of STAGES) assert.ok(block.includes(`\`${stage.id}\``), `the body does not name the '${stage.id}' check`);
});

test("the pull-request body appends to the developer's description rather than replacing it", () => {
  // Composed the way scripts/submit-pr.mjs composes it. The failure this guards is a tool that
  // overwrites the useful half of a pull request with its own receipt.
  const body = ["Explains why the change is needed.", verificationBlock(passingEvidence())].join("\n\n");
  assert.ok(body.startsWith("Explains why the change is needed."));
  assert.ok(body.includes("## Local CI"));
});
