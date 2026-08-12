/**
 * Browser-evidence ingestion.
 *
 * The static layer's failure mode is claiming a pass for something it never looked at. This layer's
 * is the mirror image: OVER-READING a run — treating "the producer finished, over fresh source" as
 * if it established every rule its surface could in principle establish.
 *
 * So the suite is arranged around the four axes staying independent. A run can complete over stale
 * source; it can be fresh and cover half the interface; it can cover everything and reach no
 * conclusion about a given rule. Each of those is a different disposition, and none of them is a
 * pass.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate, exitCodeFor, runCli } from "../scripts/uiux.mjs";
import { ingest, assessCoverage, EvidenceError } from "../scripts/evidence.mjs";
import { computeIdentity } from "../scripts/content-identity.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";

/**
 * The suite evaluates throwaway projects with the WORKING TREE, which between releases is the
 * declared version plus unreleased commits — exactly what the version-identity guard refuses. The
 * refusal is waived here and nowhere reachable from the CLI; the envelope still records that the
 * executing tree was not the release, so no result here can claim otherwise.
 */
const UNRELEASED = { allowUnreleasedFramework: true };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(ROOT, "test/fixtures", name);
const EVIDENCE_PATHS = ["index.html", "styles.css", "src"];

/**
 * A throwaway repository with the compliant fixture committed into it, plus an evidence document
 * whose identity is computed from that commit.
 *
 * The identity is never typed by hand. A hand-written one would make every freshness test a test of
 * string equality rather than of the primitive that resolves committed trees.
 */
async function repoWith(evidenceFixture, { mutate = (doc) => doc, evidencePaths = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-evidence-"));
  await cp(fixture("compliant"), dir, { recursive: true });

  if (evidencePaths) {
    const policy = await readFile(path.join(dir, "project-policy.yml"), "utf8");
    await writeFile(
      path.join(dir, "project-policy.yml"),
      policy.replace("  accessibility:\n", `  evidencePaths:\n${evidencePaths.map((p) => `    - ${p}`).join("\n")}\n  accessibility:\n`),
    );
  }

  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("add", "--all");
  git("commit", "--quiet", "-m", "fixture");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

  const identity = computeIdentity(dir, EVIDENCE_PATHS, sha);
  assert.equal(identity.state, "COMPUTED", identity.reason ?? "the fixture repository must be readable");

  // Only the placeholders are rewritten. A fixture that deliberately OMITS a revision field must
  // reach the schema check omitting it — repairing it here would quietly make the invalid fixture
  // valid and the test would prove nothing.
  const document = JSON.parse(await readFile(fixture(`evidence/${evidenceFixture}`), "utf8"));
  if (document.revision?.gitSha === "0".repeat(40)) document.revision.gitSha = sha;
  if (document.revision?.sourceIdentity === "0".repeat(32)) document.revision.sourceIdentity = identity.identity;

  const evidencePath = path.join(dir, "browser-evidence.json");
  await writeFile(evidencePath, JSON.stringify(mutate(document), null, 2));
  return { dir, evidencePath, sha, identity: identity.identity, git };
}

async function resultFor(evidenceFixture, options) {
  const repo = await repoWith(evidenceFixture, options);
  const result = await runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath });
  const of = (ruleId) => result.envelope.uiCompliance.results.find((r) => r.ruleId === ruleId);
  return { ...repo, result, of, cleanup: () => rm(repo.dir, { recursive: true, force: true }) };
}

const CONTRAST = "accessibility.contrast";
const FAKE_SUCCESS = "design-integrity.no-fake-success";

// --- The establishing case ----------------------------------------------------------------------

test("a fresh, completed, fully covered run with conclusive passes establishes its rules", async () => {
  const run = await resultFor("valid-fresh.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.status, "passed");
  assert.equal(contrast.disposition, "evidenced");
  assert.ok(contrast.evidence.includes("/account@laptop"));

  // A browser-established pass is filed under browserAnalysis, never under automated: the bucket
  // follows the surface that established it.
  assert.ok(run.result.envelope.uiCompliance.assurance.browserAnalysis >= 2);
  await run.cleanup();
});

test("the evidence surface reports what the run exercised, on the same shape as a run with none", async () => {
  const run = await resultFor("valid-fresh.json");
  const surface = run.result.envelope.evidenceSurface.browserRun;
  assert.equal(surface.status, "completed");
  assert.equal(surface.evidenceFreshness, "FRESH");
  assert.deepEqual(surface.viewportsTested, ["iphone-14", "laptop"]);
  assert.deepEqual(surface.routesTested, ["/", "/account"]);
  assert.equal(surface.accessibilityTree, "obtained");

  const without = await runValidate(fixture("compliant"));
  assert.deepEqual(
    Object.keys(without.envelope.evidenceSurface.browserRun).sort(),
    ["accessibilityTree", "evidenceFreshness", "routesFailed", "routesTested", "runAt", "screenshotsCaptured", "status", "viewportsTested"],
  );
  await run.cleanup();
});

// --- Freshness is necessary, and not sufficient ---------------------------------------------------

test("a completed, fresh run does not establish a rule it reached no conclusion about", async () => {
  const run = await resultFor("valid-fresh.json");
  // Nothing in the fixture checks zoom-reflow, and the run being valid says nothing about it.
  const untouched = run.of("accessibility.zoom-reflow");
  assert.equal(untouched.status, "skipped");
  assert.equal(untouched.disposition, "not-evaluated");
  assert.match(untouched.message, /reached no conclusion/);
  await run.cleanup();
});

test("looking and being unable to tell establishes nothing, and is not a failure", async () => {
  const run = await resultFor("inconclusive-only.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.status, "skipped");
  assert.equal(contrast.disposition, "not-evaluated");
  await run.cleanup();
});

// --- Coverage ---------------------------------------------------------------------------------------

test("a declared viewport class the run never tested leaves the rule unestablished", async () => {
  const run = await resultFor("partial-coverage.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.status, "skipped");
  assert.equal(contrast.disposition, "partial-coverage");
  assert.match(contrast.message, /viewport class\(es\) never tested: mobile/);
  await run.cleanup();
});

test("a route the run never reached leaves the rule unestablished, however well the others went", async () => {
  const run = await resultFor("route-failed.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.disposition, "partial-coverage");
  assert.match(contrast.message, /\/account \(failed\)/);
  // And the pass recorded on that unreached route contributed nothing.
  assert.ok(!contrast.evidence.includes("/account@laptop"));
  await run.cleanup();
});

test("an unestablished forbidden rule caps the verdict even when every check passed", async () => {
  const run = await resultFor("partial-coverage.json");
  const ui = run.result.envelope.uiCompliance;
  assert.ok(ui.unestablishedProhibitions.includes(FAKE_SUCCESS));
  assert.equal(ui.status, "NOT_EVALUATED");
  assert.equal(exitCodeFor(run.result.envelope, run.result.policyFindings), 1);
  await run.cleanup();
});

test("coverage is assessed against declarations and observations the producer does not control", () => {
  const document = {
    routes: [{ route: "/", status: "tested", viewportsTested: ["a"], accessibilityTree: "obtained", checks: [] }],
    viewports: [{ name: "a", class: "desktop" }],
  };
  const policy = { ui: { viewportClasses: ["mobile", "desktop"] } };

  // A producer cannot widen its claim by enumerating fewer routes: the source scan's count is a
  // floor, and the declared viewport classes are the project's, not the producer's.
  assert.equal(assessCoverage(document, policy, []).complete, false);
  assert.equal(assessCoverage(document, { ui: { viewportClasses: ["desktop"] } }, []).complete, true);
  assert.equal(
    assessCoverage(document, { ui: { viewportClasses: ["desktop"] } }, ["src/routes/a.jsx", "src/routes/b.jsx"]).complete,
    false,
  );
});

// --- Precedence among outcomes -----------------------------------------------------------------------

test("one conclusive failure beats any number of passes — there is no majority vote", async () => {
  const run = await resultFor("check-failed.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.status, "failed");
  assert.equal(contrast.disposition, "evidenced");
  assert.match(contrast.message, /2\.9:1/);
  assert.equal(run.result.envelope.uiCompliance.status, "NON_COMPLIANT");
  await run.cleanup();
});

test("a failure is established even where coverage is not", async () => {
  // The same failing check, in a run that also never tested the mobile class. Coverage constrains
  // the claim that a defect is ABSENT; it has no bearing on one that was witnessed.
  const run = await resultFor("check-failed.json", {
    mutate: (doc) => ({
      ...doc,
      routes: doc.routes.map((route) => ({
        ...route,
        viewportsTested: ["laptop"],
      })),
    }),
  });
  assert.equal(run.of(CONTRAST).status, "failed");
  await run.cleanup();
});

test("a static finding still outranks a browser pass on the same rule", async () => {
  const run = await resultFor("valid-fresh.json", {
    mutate: (doc) => ({
      ...doc,
      routes: doc.routes.map((route) => ({
        ...route,
        checks: [
          ...route.checks,
          {
            ruleId: "design-integrity.no-fake-success",
            outcome: "passed",
            viewport: "laptop",
            evidence: "the producer saw no fake success",
          },
        ],
      })),
    }),
  });
  assert.equal(run.of(FAKE_SUCCESS).status, "passed");
  await run.cleanup();
});

// --- Freshness --------------------------------------------------------------------------------------

test("changing the source after the run makes the evidence stale, not unavailable", async () => {
  const repo = await repoWith("valid-fresh.json");
  await appendFile(path.join(repo.dir, "styles.css"), "\n.added-after-the-run { color: red; }\n");

  const result = await runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath });
  const contrast = result.envelope.uiCompliance.results.find((r) => r.ruleId === CONTRAST);
  assert.equal(contrast.disposition, "stale-evidence");
  assert.equal(contrast.status, "skipped");
  assert.equal(result.envelope.evidenceSurface.browserRun.evidenceFreshness, "STALE");
  await rm(repo.dir, { recursive: true, force: true });
});

test("an identity that does not match its own recorded revision is stale, never silently repaired", async () => {
  const run = await resultFor("valid-fresh.json", {
    mutate: (doc) => ({ ...doc, revision: { ...doc.revision, sourceIdentity: "f".repeat(32) } }),
  });
  assert.equal(run.of(CONTRAST).disposition, "stale-evidence");
  await run.cleanup();
});

test("an unresolvable revision is evidence-unavailable — it cannot be reconstructed, not proved changed", async () => {
  const run = await resultFor("valid-fresh.json", {
    mutate: (doc) => ({ ...doc, revision: { ...doc.revision, gitSha: "1".repeat(40) } }),
  });
  assert.equal(run.of(CONTRAST).disposition, "evidence-unavailable");
  await run.cleanup();
});

// --- Run completion ------------------------------------------------------------------------------------

test("a run that did not finish is evidence-unavailable, and its checks establish nothing", async () => {
  const run = await resultFor("run-failed.json");
  const contrast = run.of(CONTRAST);
  assert.equal(contrast.disposition, "evidence-unavailable");
  assert.equal(contrast.status, "skipped");
  assert.match(contrast.message, /could not be launched/);
  // The anti-false-green mutation: every check in that file says `passed`.
  assert.notEqual(contrast.status, "passed");
  await run.cleanup();
});

test("run completion is not coverage: a completed run can still establish nothing", async () => {
  const run = await resultFor("partial-coverage.json");
  assert.equal(run.result.envelope.evidenceSurface.browserRun.status, "completed");
  assert.equal(run.of(CONTRAST).status, "skipped");
  await run.cleanup();
});

// --- A broken contract is exit 2, never a finding -------------------------------------------------------

const brokenContract = [
  ["unknown-rule.json", /catalog does not define/],
  ["wrong-surface.json", /evidence surface is not a browser/],
  ["contradictory-viewport.json", /references viewport\(s\) it does not declare/],
  ["schema-invalid.json", /not a browser-evidence document/],
];

for (const [name, expected] of brokenContract) {
  test(`${name} is a broken evidence contract: exit 2, no verdict`, async () => {
    const repo = await repoWith(name);
    await assert.rejects(() => runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath }), (error) => {
      assert.ok(error instanceof EvidenceError);
      assert.match(error.message, expected);
      return true;
    });

    const out = { stdout: "", stderr: "" };
    const code = await runCli(["validate", repo.dir, `--evidence=${repo.evidencePath}`], {
      write: (s) => (out.stdout += s),
      fail: (s) => (out.stderr += s),
      ...UNRELEASED,
    });
    assert.equal(code, 2);
    assert.equal(out.stdout, "", "a broken record produces no envelope to read a verdict out of");
    assert.match(out.stderr, /not a finding about this project, and it is not a pass/);
    await rm(repo.dir, { recursive: true, force: true });
  });
}

test("an evidence path that does not exist is exit 2, not an absent-evidence run", async () => {
  const out = { stdout: "", stderr: "" };
  const code = await runCli(["validate", fixture("compliant"), "--evidence=does-not-exist.json"], {
    write: (s) => (out.stdout += s),
    fail: (s) => (out.stderr += s),
  });
  assert.equal(code, 2);
  assert.equal(out.stdout, "");
});

test("a producer may not measure a narrower subject than the project declared", async () => {
  const repo = await repoWith("valid-fresh.json", { evidencePaths: ["index.html", "styles.css", "src", "package.json"] });
  await assert.rejects(
    () => runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath }),
    /paths the project did not declare/,
  );
  await rm(repo.dir, { recursive: true, force: true });
});

test("a declaration the producer matches is accepted", async () => {
  const repo = await repoWith("valid-fresh.json", { evidencePaths: EVIDENCE_PATHS });
  const result = await runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath });
  assert.equal(result.envelope.uiCompliance.results.find((r) => r.ruleId === CONTRAST).status, "passed");
  await rm(repo.dir, { recursive: true, force: true });
});

// --- Absence is not unavailability -------------------------------------------------------------------------

test("omitting --evidence leaves browser rules not-evaluated, never evidence-unavailable", async () => {
  const result = await runValidate(fixture("compliant"));
  const catalog = await loadCatalog();
  const browserRules = [...catalog.rules.values()].filter(
    (rule) => rule.validationType === "browser-analysis" || rule.validationType === "visual-analysis",
  );
  assert.ok(browserRules.length > 0);

  for (const rule of browserRules) {
    const outcome = result.envelope.uiCompliance.results.find((r) => r.ruleId === rule.id);
    if (outcome.disposition === "class-unresolved") continue;
    assert.equal(outcome.disposition, "not-evaluated", `${rule.id} must be not-evaluated when nobody ran a browser`);
    assert.match(outcome.message, /none was supplied/);
  }
  assert.equal(result.envelope.evidenceSurface.browserRun.status, "not-attempted");
});

// --- The M7 mutation sequence ------------------------------------------------------------------------------

test("the four axes stay independent through the whole mutation sequence", async () => {
  const repo = await repoWith("valid-fresh.json");
  const original = await readFile(repo.evidencePath, "utf8");
  const write = (document) => writeFile(repo.evidencePath, JSON.stringify(document, null, 2));
  const parsed = () => JSON.parse(original);

  const step = async () => {
    try {
      const result = await runValidate(repo.dir, { ...UNRELEASED, evidencePath: repo.evidencePath });
      const contrast = result.envelope.uiCompliance.results.find((r) => r.ruleId === CONTRAST);
      return { disposition: contrast.disposition, status: contrast.status };
    } catch (error) {
      if (error instanceof EvidenceError) return { disposition: "EXIT_2", status: "EXIT_2" };
      throw error;
    }
  };

  // 1. fresh, completed, conclusive → evidenced
  assert.deepEqual(await step(), { disposition: "evidenced", status: "passed" });

  // 2. change the identity only → stale, never a pass
  const stale = parsed();
  stale.revision.sourceIdentity = "a".repeat(32);
  await write(stale);
  assert.deepEqual(await step(), { disposition: "stale-evidence", status: "skipped" });

  // 3. restore the identity, fail the run → unavailable, and still never a pass
  const failed = parsed();
  failed.run = { status: "failed", failureReason: "the display server went away" };
  await write(failed);
  assert.deepEqual(await step(), { disposition: "evidence-unavailable", status: "skipped" });

  // 4. restore the run, claim an id the catalog does not define → exit 2
  const unknown = parsed();
  unknown.routes[0].checks[0].ruleId = "accessibility.invented-by-the-producer";
  await write(unknown);
  assert.deepEqual(await step(), { disposition: "EXIT_2", status: "EXIT_2" });

  // 5. claim a real id whose evidence surface is not a browser → exit 2
  const wrongSurface = parsed();
  wrongSurface.routes[0].checks[0].ruleId = "accessibility.img-alt-text";
  await write(wrongSurface);
  assert.deepEqual(await step(), { disposition: "EXIT_2", status: "EXIT_2" });

  // 6. restore the rule, fail one relevant check → failed
  const oneFailure = parsed();
  oneFailure.routes[0].checks[0] = {
    ...oneFailure.routes[0].checks[0],
    outcome: "failed",
    evidence: "the primary button label is 3.1:1 against its fill",
  };
  await write(oneFailure);
  assert.deepEqual(await step(), { disposition: "evidenced", status: "failed" });

  // Restore, and assert the fixture is establishing again — a mutation suite that cannot return to
  // its starting point has not proved which change caused what.
  await writeFile(repo.evidencePath, original);
  assert.deepEqual(await step(), { disposition: "evidenced", status: "passed" });

  await rm(repo.dir, { recursive: true, force: true });
});
