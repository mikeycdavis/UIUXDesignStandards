/**
 * The documentation, held to the implementation.
 *
 * Documentation is the first place prose drifts ahead of code. A command gets renamed and the guide
 * keeps naming the old one; a disposition is added and the table that lists them is not; a standard
 * gets renumbered and a link rots. None of that fails a build, and all of it ends with a document
 * that describes a framework nobody shipped — the same false green the rest of this suite is arranged
 * against, in prose instead of in a verdict.
 *
 * So each claim a document makes is bound to the thing that would make it true:
 *
 *   the docs say a command exists       → it is a script, and the package declares it
 *   the docs say an output field exists → it is in the envelope or in a schema
 *   the docs say a disposition exists   → the evaluator emits it
 *   the docs say a rule or standard exists → the catalog resolves it, the file is there
 *
 * The two carried obligations from earlier sections are checked here too, by their content rather
 * than by their presence: section 08's required-versus-forbidden manual-review asymmetry, and section
 * 10's statement about what this repository's own `no-ui` verdict does and does not certify.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["README.md", "INSTRUCTIONS.md", "PROJECT.md", "docs/architecture.md", "docs/integration-contract.md", "docs/local-ci.md"];

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");
const exists = async (relative) => {
  try {
    await access(path.join(ROOT, relative));
    return true;
  } catch {
    return false;
  }
};

async function corpus() {
  const bodies = await Promise.all(DOCS.map(read));
  return DOCS.map((file, i) => ({ file, body: bodies[i] }));
}

// --- The docs exist, and are not stubs ------------------------------------------------------------

test("every orientation document exists and says something", async () => {
  for (const { file, body } of await corpus()) {
    assert.ok(body.length > 1000, `${file} is ${body.length} bytes — too short to be the document it claims to be`);
  }
});

// --- Binding 1: a command the docs name is a command that exists -----------------------------------

test("every command the documentation names exists as a script the package declares", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const named = new Map();

  for (const { file, body } of await corpus()) {
    for (const [, script] of body.matchAll(/npm run ([\w:-]+)/g)) named.set(`npm run ${script}`, { file, script });
    for (const [, script] of body.matchAll(/scripts\/([\w-]+\.mjs)/g)) named.set(`scripts/${script}`, { file, script });
    for (const [, sub] of body.matchAll(/uiux\.mjs (audit|validate|applicability|init)\b/g)) named.set(`subcommand ${sub}`, { file, sub });
  }
  assert.ok(named.size >= 15, `only ${named.size} commands named across the documentation — the scan is broken`);

  const usage = await read("scripts/uiux.mjs");
  for (const [claim, where] of named) {
    if (claim.startsWith("npm run ")) {
      assert.ok(where.script in pkg.scripts, `${where.file} names 'npm run ${where.script}', which package.json does not declare`);
    } else if (claim.startsWith("scripts/")) {
      assert.ok(await exists(`scripts/${where.script}`), `${where.file} names scripts/${where.script}, which does not exist`);
    } else {
      assert.ok(usage.includes(`"${where.sub}"`), `${where.file} documents the '${where.sub}' subcommand, which the CLI does not dispatch`);
    }
  }
});

test("every flag the documentation names is one the tooling parses", async () => {
  // `ci.mjs` and `submit-pr.mjs` are here for the same reason the other four are: they are the
  // scripts the documentation tells a developer to invoke, and a documented flag that no script parses
  // is a documented flag that silently does nothing.
  const sources = (
    await Promise.all(
      ["scripts/uiux.mjs", "scripts/init.mjs", "scripts/applicability.mjs", "scripts/policy.mjs", "scripts/ci.mjs", "scripts/submit-pr.mjs"].map(read),
    )
  ).join("\n");
  const flags = new Set();
  for (const { body } of await corpus()) {
    for (const [, flag] of body.matchAll(/(--[a-z][a-z-]+)(?:=|\b)/g)) flags.add(flag);
  }
  assert.ok(flags.size >= 5, `only ${flags.size} flags found — the scan is broken`);

  for (const flag of flags) {
    // `--require-established` is documented as RESERVED and deliberately not implemented, and saying
    // so is the point of documenting it. It is the one flag that must be absent from the source.
    if (flag === "--require-established") {
      assert.equal(sources.includes(flag), false, "--require-established is documented as reserved but the tooling implements it");
      continue;
    }
    assert.ok(sources.includes(flag), `the documentation names ${flag}, which no script parses`);
  }
});

// --- Binding 2: an output field the docs name is a field the envelope carries ------------------------

test("every envelope field the documentation names is one a run emits", async () => {
  const { runValidate } = await import("../scripts/uiux.mjs");
  const result = await runValidate(path.join(ROOT, "test/fixtures/compliant"));
  const envelope = result.envelope;

  const keys = new Set();
  const walk = (node, depth = 0) => {
    if (depth > 4 || node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      keys.add(key);
      walk(Array.isArray(value) ? value[0] : value, depth + 1);
    }
  };
  walk(envelope);
  assert.ok(keys.size > 25, `only ${keys.size} envelope keys observed — the walk is broken`);

  // Every key in the contract's envelope specification must be one a run emits. Scoped to the JSON
  // fence in §3.2 rather than to backticked words in the prose around it: `forbidden` and `proved`
  // are English there, and a scan that cannot tell a field name from a sentence would either fail on
  // prose or be widened until it checked nothing.
  const contract = await read("docs/integration-contract.md");
  const spec = contract.slice(contract.indexOf("### 3.2"), contract.indexOf("### 3.3"));
  const fence = spec.slice(spec.indexOf("```json"), spec.indexOf("```", spec.indexOf("```json") + 7));
  const claimed = new Set([...fence.matchAll(/"([a-zA-Z][\w]*)":/g)].map((m) => m[1]));
  assert.ok(claimed.size >= 8, `only ${claimed.size} envelope fields claimed by the contract — the scan is broken`);

  for (const field of claimed) {
    assert.ok(keys.has(field), `docs/integration-contract.md documents the envelope field '${field}', which no run emits`);
  }

  // And the block names, which are the contract's load-bearing claim: three fields, none of which
  // changes meaning by context.
  for (const block of ["applicability", "uiCompliance", "frameworkCompliance"]) {
    assert.ok(block in envelope, `the envelope has no '${block}' block, which the contract says it always carries`);
  }
});

// --- Binding 3: a disposition the docs name is one the evaluator emits -------------------------------

test("every disposition the documentation names is one the evaluator can produce", async () => {
  const evaluator = await read("scripts/compliance.mjs");
  const emitted = new Set([
    ...[...evaluator.matchAll(/RESULT\.\w+,\s*"([a-z-]+)"/g)].map((m) => m[1]),
    ...[...evaluator.matchAll(/disposition:\s*"([a-z-]+)"/g)].map((m) => m[1]),
    ...[...evaluator.matchAll(/(?:unestablished|failure|fail|policyFailure)\(\s*\n?\s*(?:rule\.id,\s*\n?\s*)?"([a-z-]+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(emitted.size >= 12, `only ${emitted.size} dispositions found in the evaluator — the scan is broken`);

  const contract = await read("docs/integration-contract.md");
  const table = contract.slice(contract.indexOf("### 3.4"), contract.indexOf("### 3.5"));
  const documented = [...table.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
  assert.ok(documented.length >= 12, `the disposition table lists ${documented.length} entries — the scan is broken`);

  for (const disposition of documented) {
    assert.ok(emitted.has(disposition), `the contract documents the disposition '${disposition}', which the evaluator never emits`);
  }
  // And the other direction, which is the one that rots: an evaluator that gains a disposition the
  // contract does not list leaves a consumer meeting a value no document explains.
  for (const disposition of emitted) {
    if (["excepted", "expired-exception", "rejected-exception"].includes(disposition)) continue; // exception machinery, documented in §7
    assert.ok(
      documented.includes(disposition),
      `the evaluator emits '${disposition}', which docs/integration-contract.md §3.4 does not document`,
    );
  }
});

// --- Binding 4: a rule or standard the docs name resolves --------------------------------------------

test("every rule id the documentation names is a catalog identity", async () => {
  const catalog = await loadCatalog();
  assert.ok(catalog.rules.size > 50, "the catalog is too small for this check to mean anything");

  const named = [];
  for (const { file, body } of await corpus()) {
    for (const [, id] of body.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+)`/g)) {
      // Only strings whose first segment is a catalog domain are rule claims; `package.json` and
      // `docs/architecture.mmd` match the same shape and are not.
      const domain = id.split(".")[0];
      if ([...catalog.rules.keys()].some((rule) => rule.startsWith(`${domain}.`))) named.push({ file, id });
    }
  }
  assert.ok(named.length >= 3, `only ${named.length} rule ids named across the documentation — the scan is broken`);
  for (const { file, id } of named) {
    assert.ok(catalog.rules.has(id) || catalog.aliases.has(id), `${file} names rule '${id}', which the catalog does not define`);
  }
});

test("every standard and every relative link the documentation names resolves", async () => {
  const standards = await readdir(path.join(ROOT, "standards"));
  assert.equal(standards.length, 40);

  let checked = 0;
  for (const { file, body } of await corpus()) {
    const base = path.dirname(file);
    for (const [, , target] of body.matchAll(/\[([^\]]+)\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue; // external
      checked += 1;
      const resolved = path.normalize(path.join(base, target));
      assert.ok(await exists(resolved), `${file} links to ${target}, which does not exist`);
    }
  }
  assert.ok(checked >= 25, `only ${checked} relative links checked — the scan is broken`);
});

test("the architecture diagrams match their canonical source", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/diagrams.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  // Anti-vacuity: a checker that compared nothing would also exit 0.
  assert.match(result.stdout, /^diagrams: [1-9]\d* diagram\(s\)/);
});

// --- The carried obligations, checked by content rather than by presence ------------------------------

test("INSTRUCTIONS.md states the manual-review asymmetry exactly, in both directions", async () => {
  const body = await read("INSTRUCTIONS.md");

  // The carried obligation from plan section 08. This is the behaviour an adopter is most likely to
  // assume wrongly, and the framework promising more enforcement than it performs is the failure the
  // section's own opening quote names.
  assert.match(body, /unestablished `required` manual-review rule does NOT block/i);
  assert.match(body, /notEvaluated/);
  assert.match(body, /unestablished `forbidden` rule DOES cap the verdict/i);
  assert.match(body, /NOT_EVALUATED/);

  // And the reserved flag is described as reserved rather than as available.
  assert.match(body, /`--require-established` is reserved and\s*\n?deliberately not implemented/);
});

/** Documents wrap; a claim split across two lines is the same claim. */
const flat = (text) => text.replace(/\s+/g, " ");

test("README and PROJECT state what this repository's own no-ui verdict does and does not certify", async () => {
  // The carried obligation from plan section 10. A `no-ui` self-verdict is a claim about scope
  // honesty; reading it as a claim about UI quality would make the framework's own clean result the
  // exact overclaim it exists to prevent.
  const project = flat(await read("PROJECT.md"));
  assert.match(project, /scope honesty, not UI quality/i);
  assert.match(project, /no external UI project has exercised these detectors/i);
  assert.match(project, /appliesTo: \[process\]|process rules/);
  assert.match(project, /14-real-project-dogfood/);

  const readme = flat(await read("README.md"));
  assert.match(readme, /INDETERMINATE`?, never `?NOT_APPLICABLE/);
});

test("no document claims enforcement the repository does not perform", async () => {
  for (const { file, body } of await corpus()) {
    // The producer does not exist. A document saying this framework runs a browser would be the
    // single most damaging sentence it could contain.
    assert.equal(
      /this framework (runs|drives|launches) a browser/i.test(body),
      false,
      `${file} claims this framework runs a browser`,
    );
    assert.equal(/conforms to WCAG/i.test(body) && !/never a claim that|is never a claim/i.test(body), false, `${file} claims WCAG conformance`);
  }

  // The unbuilt sections are named rather than omitted, so a reader can tell absence from oversight.
  const readme = await read("README.md");
  const architecture = await read("docs/architecture.md");
  for (const section of ["13-version-identity", "14-real-project-dogfood", "15-browser-evidence-producer", "16-portfolio-integration"]) {
    assert.ok(
      architecture.includes(section) || readme.includes(section),
      `nothing names ${section}, so its deferral is invisible`,
    );
  }
});

test("the falsifier count the documentation states is the number that actually run", async () => {
  // A raw test count in prose rots the day someone adds a test, so the documents no longer carry one.
  // The falsifier count does belong in prose — it is the claim that the suite has been shown to be
  // able to fail — so it is bound to the table rather than typed twice.
  const { FALSIFIERS } = await import("./falsifiers.mjs");
  for (const file of ["README.md", "PROJECT.md", "artifacts/project-plan-breakdown/00-overview.md"]) {
    const body = await read(file);
    const stated = [...body.matchAll(/(\d+) architectural falsifiers/g)].map((m) => Number(m[1]));
    assert.ok(stated.length > 0, `${file} states no falsifier count — the guard would pass vacuously`);
    for (const count of stated) {
      assert.equal(count, FALSIFIERS.length, `${file} claims ${count} architectural falsifiers; ${FALSIFIERS.length} run`);
    }
  }
});
