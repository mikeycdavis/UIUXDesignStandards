/**
 * Version identity — did the framework the policy pinned actually produce this verdict?
 *
 * The failure this defends against is not a compliance failure. It is a provenance lie: an envelope
 * carrying `standardVersion: "1.0.0"` beside a verdict some other framework produced. Nothing about
 * that envelope looks wrong. Every field is well-formed, the status is real, and the only thing
 * untrue is which rules reached it — which is exactly the shape of every false green this repository
 * exists to refuse.
 *
 * The three cases the framework's owner specified, and a fourth that a version-string comparison
 * cannot see:
 *
 *   executes v1.0.0, policy declares 1.0.0        → evaluation allowed
 *   executes v1.0.0, policy declares 1.1.0        → VERSION_MISMATCH, no verdict
 *   executes main,   policy declares 1.0.0        → EXECUTED_TREE_IS_NOT_THE_RELEASE, no verdict
 *   executes a vendored copy, versions agree      → UNVERIFIED, never MATCH
 *
 * The third is the one that matters most and the one an inherited design gets wrong. Under this
 * family's release convention `VERSION` names the LAST RELEASED version and stays there while
 * development continues, so a post-release `main` reports `VERSION` `1.0.0` while being demonstrably
 * not the `v1.0.0` artifact. Comparing version strings — which is what EngineeringStandards does —
 * calls that a match and hands the consumer a verdict from unreleased code.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveVersionIdentity, frameworkVersion, PACK } from "../scripts/version-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

function commit(dir, message) {
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "test");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", message);
  return git(dir, "rev-parse", "HEAD").stdout.trim();
}

/**
 * A framework checkout in one of the three states a consumer can encounter.
 *
 * `released` is a repository whose HEAD is exactly the v1.0.0 tag. `post-release` is the same
 * repository with one further commit — the state this repository itself is in, and the negative
 * control the whole guard turns on. `vendored` is a copy with no git at all.
 */
async function frameworkAt(state, { version = "1.0.0" } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), `uiux-fw-${state}-`));
  for (const entry of ["scripts", "rules", "schemas", "standards", "templates", "package.json"]) {
    await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  await writeFile(path.join(dir, "VERSION"), `${version}\n`);
  if (state === "vendored") return dir;

  git(dir, "init", "--quiet");
  commit(dir, "the release");
  git(dir, "tag", "-a", `v${version}`, "-m", `v${version}`);
  if (state === "post-release") {
    await writeFile(path.join(dir, "AFTER.md"), "an unreleased change\n");
    commit(dir, "after the release");
  }
  return dir;
}

/** A consumer repository with a policy declaring `declared`, and no UI. */
async function consumerDeclaring(declared) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-consumer-"));
  await writeFile(
    path.join(dir, "project-policy.yml"),
    ["standardVersion: " + declared, "project: consumer-fixture", "", "ui:", "  applicability: no-ui", "", "exceptions: []", ""].join("\n"),
  );
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src", "index.js"), "export const add = (a, b) => a + b;\n");
  return dir;
}

const cleanup = (...dirs) => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));

// --- The identity resolution itself ----------------------------------------------------------------

test("the positive: a released framework and a policy naming it match, and name the commit", async () => {
  const framework = await frameworkAt("released");
  try {
    const identity = resolveVersionIdentity("1.0.0", framework);
    assert.equal(identity.identity, "MATCH");
    assert.equal(identity.blocking, false);
    assert.equal(identity.pack, PACK);
    assert.equal(identity.declaredVersion, "1.0.0");
    assert.equal(identity.executedVersion, "1.0.0");
    assert.equal(identity.executedTree, "RELEASE_TREE");
    assert.match(identity.executedCommit, /^[0-9a-f]{40}$/, "a match must name the commit it ran, not merely the version");
    assert.equal(identity.executedCommit, git(framework, "rev-parse", "v1.0.0^{commit}").stdout.trim());
  } finally {
    await cleanup(framework);
  }
});

test("declaring a version the framework is not is a mismatch, in either direction", async () => {
  const framework = await frameworkAt("released");
  try {
    for (const declared of ["1.1.0", "0.9.0", "2.0.0", "1.0.1"]) {
      const identity = resolveVersionIdentity(declared, framework);
      assert.equal(identity.identity, "VERSION_MISMATCH", `declaring ${declared} against 1.0.0 was not a mismatch`);
      assert.equal(identity.blocking, true);
      assert.match(identity.reason, new RegExp(declared.replace(/\./g, "\\.")));
    }
  } finally {
    await cleanup(framework);
  }
});

test("THE ONE A VERSION STRING CANNOT SEE: post-release main is not the release it names", async () => {
  // Both sides read "1.0.0". A string comparison — which is what the inherited implementation does —
  // reports a match and hands the consumer a verdict produced by unreleased code.
  const framework = await frameworkAt("post-release");
  try {
    assert.equal(frameworkVersion(framework), "1.0.0", "the negative control is only meaningful if the versions agree");

    const identity = resolveVersionIdentity("1.0.0", framework);
    assert.equal(identity.declaredVersion, identity.executedVersion, "the versions must be equal for this test to mean anything");
    assert.equal(identity.identity, "EXECUTED_TREE_IS_NOT_THE_RELEASE");
    assert.equal(identity.blocking, true);
    assert.equal(identity.executedTree, "POST_RELEASE_DEVELOPMENT");
    assert.notEqual(identity.executedCommit, git(framework, "rev-parse", "v1.0.0^{commit}").stdout.trim());
  } finally {
    await cleanup(framework);
  }
});

test("a rewritten history is not the release either, and is not mistaken for development", async () => {
  const framework = await frameworkAt("released");
  try {
    git(framework, "checkout", "--quiet", "--orphan", "rewritten");
    await writeFile(path.join(framework, "REWRITTEN.md"), "a different history\n");
    commit(framework, "rewritten");
    const identity = resolveVersionIdentity("1.0.0", framework);
    assert.equal(identity.identity, "EXECUTED_TREE_IS_NOT_THE_RELEASE");
    assert.equal(identity.executedTree, "RELEASE_HISTORY_DIVERGED");
    assert.equal(identity.blocking, true);
  } finally {
    await cleanup(framework);
  }
});

test("a vendored copy with no git is UNVERIFIED — never MATCH, and never a mismatch", async () => {
  const framework = await frameworkAt("vendored");
  try {
    const identity = resolveVersionIdentity("1.0.0", framework);
    assert.equal(identity.identity, "UNVERIFIED", "'I could not check' must not become 'I checked'");
    assert.equal(identity.executedCommit, null, "a commit that could not be read must be null, not invented");
    assert.equal(identity.blocking, false, "an unverifiable copy is not a mismatch — it is an unanswered question");
    assert.match(identity.reason, /unverified/i);
  } finally {
    await cleanup(framework);
  }
});

test("the framework evaluating its own tree is a state of its own, established by path", async () => {
  // Not an exemption a consumer can claim: the evaluated project and the executing framework must
  // resolve to the same directory. Between releases this repository is VERSION 1.0.0 plus unreleased
  // commits, and without this it could only dogfood on release day.
  const framework = await frameworkAt("post-release");
  const other = await consumerDeclaring("1.0.0");
  try {
    assert.equal(resolveVersionIdentity("1.0.0", framework, { target: framework }).identity, "SELF_EVALUATION");
    assert.equal(resolveVersionIdentity("1.0.0", framework, { target: other }).identity, "EXECUTED_TREE_IS_NOT_THE_RELEASE");
  } finally {
    await cleanup(framework, other);
  }
});

test("a link into the framework tree does not make a consumer part of it", async (t) => {
  // Containment is the one branch that waives the version guard, and in the reusable workflow the
  // framework is checked out UNDERNEATH the consumer with a consumer-supplied target path. Deciding
  // containment on normalised strings rather than canonical real paths would let a symlink or a
  // Windows junction choose which framework a verdict claims to come from.
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const link = path.join(framework, "inside-me");
    try {
      await symlink(consumer, link, "junction");
    } catch {
      t.skip("this platform does not permit creating links without elevation");
      return;
    }
    // By string, `<framework>/inside-me` is inside the framework. By real path it is the consumer.
    assert.ok(path.resolve(link).startsWith(path.resolve(framework)), "the string form must look contained, or this proves nothing");
    const identity = resolveVersionIdentity("1.0.0", framework, { target: link });
    assert.equal(identity.identity, "EXECUTED_TREE_IS_NOT_THE_RELEASE", "a link was accepted as self-evaluation");
    assert.equal(identity.blocking, true);
  } finally {
    await cleanup(framework, consumer);
  }
});

test("a target that cannot be canonicalised is not contained", async () => {
  const framework = await frameworkAt("post-release");
  try {
    const identity = resolveVersionIdentity("1.0.0", framework, { target: path.join(framework, "does-not-exist") });
    assert.notEqual(identity.identity, "SELF_EVALUATION", "an unresolvable path was answered optimistically");
  } finally {
    await cleanup(framework);
  }
});

// --- End to end, from the consumer side --------------------------------------------------------------

/** Run a framework checkout's own CLI against a consumer directory, as a workflow would. */
function validateFrom(framework, consumer, ...flags) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [path.join(framework, "scripts", "uiux.mjs"), "validate", consumer, ...flags], {
    encoding: "utf8",
    env,
  });
  return { code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("consumer: the released framework evaluates a policy that names it", async () => {
  const framework = await frameworkAt("released");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const run = validateFrom(framework, consumer, "--json");
    assert.equal(run.code, 0, run.stderr);
    const envelope = JSON.parse(run.stdout);
    assert.equal(envelope.standardVersion, "1.0.0");
    assert.equal(envelope.versionIdentity.identity, "MATCH");
    assert.equal(envelope.versionIdentity.executedTree, "RELEASE_TREE");
    assert.equal(envelope.frameworkCompliance.status, "COMPLIANT");
    // The three-block result survives distribution: a workflow consumer sees the same shape.
    assert.ok("applicability" in envelope && "uiCompliance" in envelope && "frameworkCompliance" in envelope);
  } finally {
    await cleanup(framework, consumer);
  }
});

test("consumer: a policy naming a different version gets no verdict at all", async () => {
  const framework = await frameworkAt("released");
  const consumer = await consumerDeclaring("1.1.0");
  try {
    const run = validateFrom(framework, consumer, "--json");
    assert.equal(run.code, 2, "a provenance failure is exit 2 — a configuration error, never NON_COMPLIANT");
    assert.doesNotMatch(run.stdout + run.stderr, /"status"\s*:/, "no envelope may be emitted: its status is the claim being refused");
    assert.match(run.stderr, /VERSION_MISMATCH/);
    assert.match(run.stderr, /1\.1\.0/);
  } finally {
    await cleanup(framework, consumer);
  }
});

test("consumer: THE FALSIFIER — a workflow running main instead of the tag gets no verdict", async () => {
  // The headline case. The consumer pinned 1.0.0; the workflow checked out a branch whose VERSION
  // also reads 1.0.0. Nothing about the versions disagrees, and the framework still refuses.
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const run = validateFrom(framework, consumer, "--json");
    assert.equal(run.code, 2);
    assert.doesNotMatch(run.stdout + run.stderr, /"status"\s*:/, "a verdict was produced by a framework that is not the pinned release");
    assert.match(run.stderr, /EXECUTED_TREE_IS_NOT_THE_RELEASE/);
    assert.match(run.stderr, /not the v1\.0\.0 release/);
  } finally {
    await cleanup(framework, consumer);
  }
});

// --- The refusal as a record, not as prose (ST-02) ----------------------------------------------
//
// Phase 13A's fifth acceptance criterion is that the machine-readable identity error survives the
// workflow boundary intact. These tests are what "machine-readable" has to mean: a consumer reads a
// KEY, never the first token of an English sentence, and reads nothing it could mistake for a
// verdict.

test("consumer: an identity refusal emits a machine-readable record and no verdict", async () => {
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const run = validateFrom(framework, consumer, "--json");
    assert.equal(run.code, 2);

    // Anti-vacuity: an empty stdout would satisfy every "must not contain" below. The zero-byte
    // envelope this replaced did exactly that, and was indistinguishable from a step that never ran.
    assert.notEqual(run.stdout.trim(), "", "no record was emitted at all");
    const record = JSON.parse(run.stdout);

    assert.equal(record.error.code, "EXECUTED_TREE_IS_NOT_THE_RELEASE");
    assert.equal(record.versionIdentity.identity, record.error.code, "the code and the block disagree");
    assert.equal(record.versionIdentity.blocking, true);
    assert.equal(record.versionIdentity.executedTree, "POST_RELEASE_DEVELOPMENT");
    assert.equal(record.schemaVersion, "1.0");

    // NOTHING a consumer could read as a result. The refused claim must not appear in any form,
    // including an explicitly null one — `"uiCompliance": null` is a compliance envelope answering.
    for (const key of ["status", "score", "applicability", "uiCompliance", "frameworkCompliance", "results"]) {
      assert.ok(!(key in record), `the refusal record carries ${key}, which a consumer could read as a verdict`);
    }
  } finally {
    await cleanup(framework, consumer);
  }
});

test("consumer: the record names the state that actually occurred, not one state always", async () => {
  // A code hardcoded to the headline case would pass the test above while telling every other
  // refusal's consumer something false. Two different blocking states, two different codes.
  const framework = await frameworkAt("released");
  const consumer = await consumerDeclaring("1.1.0");
  try {
    const run = validateFrom(framework, consumer, "--json");
    assert.equal(run.code, 2);
    const record = JSON.parse(run.stdout);
    assert.equal(record.error.code, "VERSION_MISMATCH");
    assert.equal(record.versionIdentity.declaredVersion, "1.1.0");
    assert.equal(record.versionIdentity.executedVersion, "1.0.0");
    assert.ok(!("status" in record));
  } finally {
    await cleanup(framework, consumer);
  }
});

test("the record is emitted only when a record was asked for", async () => {
  // Without --json the CLI speaks to a person. Writing JSON to stdout there would corrupt the human
  // output, and the classifier's non-execution envelope has the same guard for the same reason.
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const run = validateFrom(framework, consumer);
    assert.equal(run.code, 2);
    assert.equal(run.stdout.trim(), "", "a JSON record was written to a human-facing stdout");
    assert.match(run.stderr, /EXECUTED_TREE_IS_NOT_THE_RELEASE/, "the refusal must still be legible to a person");
  } finally {
    await cleanup(framework, consumer);
  }
});

test("no command line can weaken the guard", async () => {
  // The escape hatches this framework must never grow, listed so the absence is asserted rather than
  // assumed: a flag gets pasted into a workflow and never removed, an environment variable is
  // invisible in the run that used it, and a policy value would let the subject of the check decide
  // whether it applies. The only suppression is a function argument, which lives in source where a
  // reviewer sees it — and it waives the refusal, never the finding.
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    for (const flag of ["--allow-unreleased", "--allow-unreleased-framework", "--ignore-version-identity", "--no-version-identity"]) {
      const run = validateFrom(framework, consumer, flag);
      assert.equal(run.code, 2, `${flag} did not exit 2`);
      assert.match(run.stderr, /unknown flag/, `${flag} was accepted as a flag`);
    }

    for (const name of ["ALLOW_UNRELEASED", "UIUX_ALLOW_UNRELEASED", "UIUX_STANDARDS_ALLOW_UNRELEASED", "ALLOW_UNRELEASED_FRAMEWORK"]) {
      const env = { ...process.env, [name]: "true", "1": "true" };
      delete env.NODE_TEST_CONTEXT;
      const run = spawnSync(process.execPath, [path.join(framework, "scripts", "uiux.mjs"), "validate", consumer, "--json"], { encoding: "utf8", env });
      assert.equal(run.status, 2, `${name}=true weakened the guard`);
      assert.match(run.stderr, /EXECUTED_TREE_IS_NOT_THE_RELEASE/);
    }

    // And the source itself reads no environment variable on this path.
    const source = await readFile(path.join(ROOT, "scripts", "version-identity.mjs"), "utf8");
    assert.doesNotMatch(source, /process\.env/, "version identity must not be configurable by the environment");
  } finally {
    await cleanup(framework, consumer);
  }
});

test("a provenance refusal is never reported as a failing project", async () => {
  const framework = await frameworkAt("post-release");
  const consumer = await consumerDeclaring("1.0.0");
  try {
    const run = validateFrom(framework, consumer);
    assert.equal(run.code, 2, "exit 1 would assert the project failed a rule, and no rule was reached");
    assert.doesNotMatch(run.stdout + run.stderr, /NON_COMPLIANT/);
    assert.doesNotMatch(run.stdout + run.stderr, /COMPLIANT/);
  } finally {
    await cleanup(framework, consumer);
  }
});
