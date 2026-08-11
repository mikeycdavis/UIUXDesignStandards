/**
 * `init` — the only command that writes to a repository it does not own.
 *
 * Its failure mode is not a false verdict. It is FALSE HISTORY: a scaffolded accessibility target
 * that later reads as a decision somebody took, an inferred framework that hardens into a fact, a
 * mode label that sounds like a description of how the project was built. So this suite tests two
 * things that have nothing to do with each other.
 *
 * The safety half: `plan()` touches nothing, `--dry-run` is that same function, existing work is
 * never replaced without being named. The directory is hashed whole before and after, because "no
 * files written" and "no changes to the tree" are different claims — a stray `mkdir` satisfies the
 * first and breaks the second.
 *
 * The honesty half: every claim carries exactly one epistemic label, an override is recorded as an
 * assertion with a date rather than absorbed into the evidence, and nothing init writes about a
 * legacy repository claims to know what its design was meant to be.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plan, apply, render, runCli, modeOf, subjectFrom, stampVersion, LABELS, InitError } from "../scripts/init.mjs";
import { checkPolicy } from "../scripts/policy.mjs";
import { classify } from "../scripts/applicability.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");

/** A repository with a small React web UI and no policy — the reconstruction case. */
async function withUi() {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-init-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "18.0.0" } }));
  await writeFile(path.join(dir, "src/App.jsx"), 'export default () => <main className="app">hello</main>;\n');
  await writeFile(path.join(dir, "index.html"), "<html><body><div id=root></div></body></html>\n");
  return dir;
}

async function empty() {
  return mkdtemp(path.join(tmpdir(), "uiux-init-bare-"));
}

/**
 * A hash of the entire tree — every path, and every file's bytes.
 *
 * Deliberately not "did any file appear". A command that creates an empty directory has changed the
 * repository, and a dry run that does it is not a dry run.
 */
async function treeHash(dir) {
  const entries = [];
  const walk = async (at, relative) => {
    for (const entry of (await readdir(at, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push(`D ${child}`);
        await walk(path.join(at, entry.name), child);
      } else {
        entries.push(`F ${child} ${createHash("sha256").update(await readFile(path.join(at, entry.name))).digest("hex")}`);
      }
    }
  };
  await walk(dir, "");
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

const capture = () => {
  const out = { stdout: "", stderr: "" };
  return { out, write: (s) => (out.stdout += s), fail: (s) => (out.stderr += s) };
};

// --- The safety contract ---------------------------------------------------------------------------

test("plan() changes nothing at all, directories included", async () => {
  const dir = await withUi();
  try {
    const before = await treeHash(dir);
    const planned = await plan(dir, { today: "2026-08-10" });
    assert.ok(planned.writes.length > 0, "the plan wrote nothing — this test would pass vacuously");
    assert.ok(planned.directories.length > 0, "the plan created no directories — the mkdir half is untested");
    assert.equal(await treeHash(dir), before, "plan() modified the repository");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--dry-run changes nothing, and reports what a real run would do", async () => {
  const dir = await withUi();
  try {
    const before = await treeHash(dir);
    const { out, write, fail } = capture();
    assert.equal(await runCli([dir, "--dry-run"], { write, fail }), 0);
    assert.equal(await treeHash(dir), before, "--dry-run wrote to the repository");
    assert.match(out.stdout, /Nothing was written/);
    assert.match(out.stdout, /project-policy\.yml/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the dry run and the real run agree, because they are the same function", async () => {
  const dir = await withUi();
  try {
    // `runCli` takes no `today`, so it stamps the real date. Pinning a literal here compared the
    // plan against the CLI only on the day the literal was written: this test agreed with itself
    // for exactly one day, and no mutation could ever have caught it, because the mutation that
    // breaks it is the passage of time.
    //
    // Reading the clock on both sides would fix the literal and leave a midnight race. So the date
    // is not compared at all — it is asserted for SHAPE, and normalised out of the content
    // comparison, which is what this test is actually about. A date-shaped stamp is what the
    // scaffold owes; which day it happens to be is not this test's claim.
    const ISO = /\b\d{4}-\d{2}-\d{2}\b/g;
    const dry = await plan(dir, { today: "0000-00-00" });
    const { write, fail } = capture();
    await runCli([dir], { write, fail });

    for (const planned of dry.writes) {
      const written = await readFile(path.join(dir, planned.path), "utf8");
      if (planned.contents.includes("0000-00-00")) {
        for (const stamp of written.match(ISO) ?? []) {
          assert.notEqual(stamp, "0000-00-00", `${planned.path} carries the placeholder, not a real date`);
          assert.ok(!Number.isNaN(Date.parse(stamp)), `${planned.path} stamped "${stamp}", which is not a date`);
        }
      }
      assert.equal(
        written.replace(ISO, "<date>"),
        planned.contents.replace(ISO, "<date>"),
        `${planned.path} was written with contents the plan did not carry`,
      );
    }
    for (const relative of dry.directories) {
      await readdir(path.join(dir, relative)); // throws if it was not created
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("existing work is a conflict, refused and named, at exit 1", async () => {
  const dir = await withUi();
  try {
    await writeFile(path.join(dir, "PROJECT.md"), "# mine\n");
    const mine = await readFile(path.join(dir, "PROJECT.md"), "utf8");

    const { out, write, fail } = capture();
    assert.equal(await runCli([dir], { write, fail }), 1, "a conflict must exit 1, not 0 and not 2");
    assert.equal(await readFile(path.join(dir, "PROJECT.md"), "utf8"), mine, "init replaced a file it did not write");
    assert.match(out.stdout, /PROJECT\.md/);
    assert.match(out.stdout, /force-overwrite/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply() refuses a plan carrying conflicts even when called directly", async () => {
  const dir = await withUi();
  try {
    await writeFile(path.join(dir, "AGENTS.md"), "# mine\n");
    const planned = await plan(dir, { today: "2026-08-10" });
    await assert.rejects(() => apply(planned), InitError);
    assert.equal(await readFile(path.join(dir, "AGENTS.md"), "utf8"), "# mine\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--force-overwrite approves exactly the path it names, and no other", async () => {
  const dir = await withUi();
  try {
    await writeFile(path.join(dir, "AGENTS.md"), "# mine\n");
    await writeFile(path.join(dir, "CLAUDE.md"), "# also mine\n");

    const { write, fail } = capture();
    const code = await runCli([dir, "--force-overwrite=AGENTS.md"], { write, fail });
    assert.equal(code, 1, "the unnamed conflict must still stop the run");
    assert.equal(await readFile(path.join(dir, "CLAUDE.md"), "utf8"), "# also mine\n", "an unnamed file was replaced");
    assert.equal(await readFile(path.join(dir, "AGENTS.md"), "utf8"), "# mine\n", "a write happened despite a conflict");

    // Naming both is the operator approving both, and only then does anything move.
    const second = capture();
    assert.equal(
      await runCli([dir, "--force-overwrite=AGENTS.md", "--force-overwrite=CLAUDE.md"], second),
      0,
    );
    assert.notEqual(await readFile(path.join(dir, "AGENTS.md"), "utf8"), "# mine\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a --force-overwrite naming a path init would not write is reported, not silently honoured", async () => {
  const dir = await withUi();
  try {
    const planned = await plan(dir, { today: "2026-08-10", force: ["README.md"] });
    assert.deepEqual(planned.unusedForce, ["README.md"]);
    assert.match(render(planned, { dryRun: true }), /README\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a conventional decision record satisfies the one init would create", async () => {
  const dir = await withUi();
  try {
    await mkdir(path.join(dir, "docs/adr"), { recursive: true });
    const planned = await plan(dir, { today: "2026-08-10" });
    const adr = planned.artifacts.find((a) => a.path === "artifacts/adr");
    assert.equal(adr.action, "satisfied-by");
    assert.equal(adr.satisfiedBy, "docs/adr");
    assert.equal(planned.directories.includes("artifacts/adr"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply() is the only writer in the module", async () => {
  const source = await readFile(path.join(ROOT, "scripts/init.mjs"), "utf8");
  const applyStart = source.indexOf("export async function apply(");
  assert.ok(applyStart > 0, "apply() was renamed and this meta-test stopped watching anything");
  const applyEnd = source.indexOf("\n}", source.indexOf("return { written };"));

  for (const call of ["writeFile(", "mkdir(", "rm(", "rename(", "appendFile("]) {
    for (const match of source.matchAll(new RegExp(`await ${call.replace("(", "\\(")}`, "g"))) {
      assert.ok(
        match.index > applyStart && match.index < applyEnd,
        `'await ${call}' appears outside apply(), so plan() can no longer be trusted to be pure`,
      );
    }
  }
});

// --- The honesty contract --------------------------------------------------------------------------

test("every claim carries exactly one epistemic label, and an assertion carries its date", async () => {
  const dir = await withUi();
  try {
    const planned = await plan(dir, { today: "2026-08-10" });
    assert.ok(planned.detection.length >= 6, "too few facts for this to be checking anything");
    for (const fact of planned.detection) {
      assert.ok(LABELS.includes(fact.label), `'${fact.label}' on ${fact.id} is not one of the four labels`);
      assert.notEqual(fact.label, "CONFIRMED_BY_OWNER", "detection cannot confirm anything on the owner's behalf");
    }

    const asserted = await plan(dir, { today: "2026-08-10", mode: "greenfield" });
    assert.match(asserted.mode.label, /^CONFIRMED_BY_OWNER \(\d{4}-\d{2}-\d{2}\)$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("nothing init writes claims to know what a design was intended to be", async () => {
  const dir = await withUi();
  try {
    const planned = await plan(dir, { today: "2026-08-10" });
    const everything = [
      render(planned, { dryRun: true }),
      ...planned.writes.map((w) => w.contents),
      JSON.stringify(planned.detection),
    ].join("\n");

    // The banned phrasings from Standard 44's epistemic discipline. A bootstrap is exactly where they
    // appear, because it is the one command with a reason to describe a project's past.
    for (const phrase of [/was intended/i, /the original design/i, /the developer meant/i, /originally planned/i]) {
      assert.equal(phrase.test(everything), false, `init's output contains ${phrase}`);
    }
    // And the positive requirement: the reconstruction case says what it could not establish.
    assert.match(everything, /not established/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a detected design-system file never becomes a declared design-system strategy", async () => {
  const dir = await withUi();
  try {
    await writeFile(path.join(dir, "tailwind.config.js"), "module.exports = {};\n");
    const planned = await plan(dir, { today: "2026-08-10" });
    const fact = planned.detection.find((f) => f.id === "design-system");
    assert.equal(fact.label, "INFERRED");
    assert.match(fact.finding, /decision, not a file/);

    // The policy must not gain a strategy from it. `none-justified` in particular is a decision, and
    // the absence of a token file is not somebody making it.
    const policy = planned.writes.find((w) => w.path === "project-policy.yml").contents;
    assert.equal(/^\s*strategy:/m.test(policy), false, "init declared a design-system strategy it inferred");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the scaffolded accessibility target is written explicitly and marked as scaffolded", async () => {
  const dir = await withUi();
  try {
    const planned = await plan(dir, { today: "2026-08-10" });
    const policy = planned.writes.find((w) => w.path === "project-policy.yml").contents;
    assert.match(policy, /^\s*target: framework-baseline$/m, "the target must be written, never implied");
    assert.match(policy, /SCAFFOLDED, NOT INFERRED/);
    assert.match(policy, /DECLARATION THIS FILE CREATES/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the scaffolded policy is a valid policy", async () => {
  const dir = await withUi();
  try {
    const { write, fail } = capture();
    assert.equal(await runCli([dir], { write, fail }), 0);
    const checked = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, "2026-08-10");
    assert.equal(checked.status, "ok", JSON.stringify(checked.schemaErrors ?? checked.semanticErrors));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Declared subjects come from paths, never from guesses -------------------------------------------

test("evidencePaths and reviewPaths are scaffolded only from paths init actually saw", async () => {
  const dir = await withUi();
  try {
    const planned = await plan(dir, { today: "2026-08-10" });
    const policy = planned.writes.find((w) => w.path === "project-policy.yml").contents;
    const declared = [...policy.matchAll(/^ {4}- (.+)$/gm)].map((m) => m[1]);

    for (const candidate of ["src", "index.html"]) {
      assert.ok(declared.includes(candidate), `${candidate} exists and was not offered`);
    }
    // Nothing that was not there. The failure this guards is a scaffold naming `screens/` or
    // `components/` because interfaces usually have them.
    for (const invented of ["screens", "components", "pages", "routes", "views"]) {
      assert.equal(declared.includes(invented), false, `init declared '${invented}', which does not exist here`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("with no establishable subject, the fields are omitted and the gap is visible", async () => {
  const dir = await empty();
  try {
    const planned = await plan(dir, { today: "2026-08-10" });
    const policy = planned.writes.find((w) => w.path === "project-policy.yml").contents;
    assert.equal(/^\s*evidencePaths:/m.test(policy), false, "init declared an evidence subject it could not establish");
    assert.equal(/^\s*reviewPaths:/m.test(policy), false, "init declared a review subject it could not establish");
    assert.match(policy, /TODO — UNKNOWN/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("subjectFrom returns containers for nested files and the file itself at the root", async () => {
  const applicability = {
    signals: [
      { detected: true, evidence: ["src/App.jsx", "src/ui/Button.tsx", "index.html", "package.json: react"] },
      { detected: false, evidence: ["never/seen.tsx"] },
    ],
  };
  assert.deepEqual(subjectFrom(applicability), ["index.html", "src"]);
});

// --- Mode, and the override that must not become evidence ---------------------------------------------

test("mode follows the evidence, and an override never changes what was detected", async () => {
  const dir = await withUi();
  try {
    // 1. UI signals, no policy: the design is not declared anywhere, so it has to be reconstructed.
    let planned = await plan(dir, { today: "2026-08-10" });
    assert.equal(planned.mode.value, "reconstruction-required");
    assert.equal(planned.mode.label, "INFERRED");
    assert.match(planned.mode.reason, /design intent not established/);

    // 2. Remove the interface. The mode follows the evidence rather than persisting.
    await rm(path.join(dir, "src"), { recursive: true, force: true });
    await rm(path.join(dir, "index.html"), { force: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: {} }));
    planned = await plan(dir, { today: "2026-08-10" });
    assert.notEqual(planned.mode.value, "reconstruction-required");
    assert.equal(planned.mode.value, "greenfield");
    assert.match(planned.mode.reason, /absence of a signal, not evidence of absence/);

    // 3. Restore it and assert a mode. The assertion is honoured, and labelled as an assertion.
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src/App.jsx"), "export default () => <main>hi</main>;\n");
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "18.0.0" } }));
    const overridden = await plan(dir, { today: "2026-08-10", mode: "greenfield" });
    assert.equal(overridden.mode.value, "greenfield");
    assert.equal(overridden.mode.label, "CONFIRMED_BY_OWNER (2026-08-10)");
    // The evidence model is untouched: the same facts, with the same labels, as the inferred run.
    const inferredAgain = await plan(dir, { today: "2026-08-10" });
    assert.deepEqual(overridden.detection, inferredAgain.detection);

    // 4. Re-run without the flag. The override was never written anywhere, so it is simply gone.
    assert.equal(inferredAgain.mode.value, "reconstruction-required");
    assert.equal(inferredAgain.mode.label, "INFERRED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an existing policy makes the mode existing-configured, and design artifacts do not", async () => {
  const dir = await withUi();
  try {
    // Design artifacts are a starting point for a reconstruction, not a substitute for one. A repo
    // with mockups and no declaration still has no declaration.
    await mkdir(path.join(dir, "docs/design"), { recursive: true });
    await writeFile(path.join(dir, "docs/design/screens.md"), "# screens\n");
    let planned = await plan(dir, { today: "2026-08-10" });
    assert.equal(planned.mode.value, "reconstruction-required");
    assert.match(planned.mode.reason, /have not been shown to describe what is built/);

    const applicability = await classify(dir);
    const facts = planned.detection;
    assert.equal(modeOf({ ...applicability, declaredPolicy: { present: true, class: "web-ui" } }, facts, { today: "2026-08-10" }).value, "existing-configured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an unknown --mode is an invocation error, not a silent fallback", async () => {
  const dir = await empty();
  try {
    const { out, write, fail } = capture();
    assert.equal(await runCli([dir, "--mode=whatever"], { write, fail }), 2);
    assert.match(out.stderr, /unknown mode/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Version stamping ---------------------------------------------------------------------------------

test("stampVersion survives a CRLF checkout", () => {
  assert.match(stampVersion("standardVersion: 0.0.0\r\nui:\r\n", "1.2.3"), /standardVersion: 1\.2\.3\r\n/);
  assert.equal(stampVersion("standardVersion: 0.0.0\n", null), "standardVersion: 0.0.0\n");
});
