/**
 * The package contract and the vendored core.
 *
 * The zero-dependency rule is what lets this framework run at a pinned commit inside a consuming
 * repository with no install step. It is an invariant rather than a preference, so it is asserted
 * rather than remembered — a dependency key appearing here is how that decision would silently
 * change.
 *
 * The vendored-core tests assert the two files copied verbatim still behave as their originals. Both
 * behaviours are load-bearing elsewhere: the schema evaluator throwing on an unsupported keyword is
 * what ADR 0012 relies on, and the parser returning every scalar as a string is what keeps type
 * coercion in the schema rather than in the parser.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

import { parseYaml, YamlError } from "../scripts/yaml.mjs";
import { assertSchemaSupported, SchemaError, validate } from "../scripts/jsonschema.mjs";

const SELF = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(path.join(SELF, "package.json"), "utf8"));

const exists = async (p) => {
  try {
    await access(path.join(SELF, p));
    return true;
  } catch {
    return false;
  }
};

// --- The zero-dependency invariant ---

test("the package declares no dependencies of any kind", () => {
  const keys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  const declared = keys.filter((k) => k in pkg);
  assert.deepEqual(declared, [], `dependency keys present: ${declared.join(", ")}`);
});

test("no lockfile is committed", async () => {
  for (const f of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"]) {
    assert.equal(await exists(f), false, `${f} exists — something installed a dependency`);
  }
});

test("every script is a bare node invocation of a repository script", () => {
  const names = Object.keys(pkg.scripts);
  assert.ok(names.length > 0, "no scripts declared — the guard would pass vacuously");
  for (const [name, command] of Object.entries(pkg.scripts)) {
    assert.match(command, /^node (--test |scripts\/)/, `${name} is not a bare node invocation: ${command}`);
  }
});

/**
 * The workflow with its comments removed — the use/mention split, in YAML.
 *
 * The first version of the install-step guard searched the raw file, which meant the workflow could
 * not EXPLAIN that the absence of an install step is a decision. That explanation is the most
 * valuable line in the file: the absence is invisible, so a reader who does not know it was chosen
 * will eventually add one. A comment naming `npm ci` is not an install step; a `run:` line is.
 */
const executable = (yaml) =>
  yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

test("the CI workflow invokes only scripts the package declares, and installs nothing", async () => {
  const workflow = path.join(SELF, ".github/workflows/ci.yml");
  assert.equal(await exists(".github/workflows/ci.yml"), true, "there is no CI workflow to check");
  const steps = executable(await readFile(workflow, "utf8"));

  const invoked = [...steps.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
  assert.ok(invoked.length >= 8, `only ${invoked.length} npm run steps found — the guard would barely check anything`);
  for (const name of invoked) {
    assert.ok(name in pkg.scripts, `CI runs 'npm run ${name}' but package.json declares no such script`);
  }
  assert.equal(/npm (ci|install)/.test(steps), false, "CI has an install step — the dependency decision changed");
});

test("the install-step guard reads a use and not a mention — both directions", async () => {
  const yaml = await readFile(path.join(SELF, ".github/workflows/ci.yml"), "utf8");
  const installs = (text) => /npm (ci|install)/.test(executable(text));

  // Mutation: an actual install step. The guard must see it.
  assert.equal(installs(yaml.replace("      - name: Tests", "      - run: npm ci\n      - name: Tests")), true, "an install step went unnoticed");
  // Mutation: the same words in a comment. The guard must not.
  assert.equal(installs(`${yaml}\n      # never add npm ci or npm install here\n`), false, "a comment was read as an install step");
  // Restored.
  assert.equal(installs(yaml), false);
});

test("CI runs the gate, the full suite, and the self-check — removing any one is caught", async () => {
  const yaml = await readFile(path.join(SELF, ".github/workflows/ci.yml"), "utf8");
  const steps = executable(yaml);

  // The three steps whose removal would be invisible in a green build. `validate` is the verdict;
  // `npm test` carries the falsifier harness that proves the rest of the suite can fail; the
  // self-check is what breaks if this repository grows a UI without saying so.
  for (const required of ["npm run validate", "npm test", "npm run applicability:self"]) {
    assert.ok(steps.includes(required), `CI does not run '${required}'`);
    // And the mutation: removing it must be detectable, which is only true if the check is on the
    // executable text rather than on the file — a commented-out step is not a step.
    assert.equal(
      executable(yaml.replace(`run: ${required}`, "run: echo skipped")).includes(required),
      false,
      `removing '${required}' from the workflow was not detectable`,
    );
  }

  // `--strict` on audit would fail the build on advisory findings, and the predictable outcome is
  // that somebody disables the step entirely.
  assert.equal(/npm run audit:strict/.test(steps), false, "CI runs audit --strict, which turns advisories into broken builds");
});

test("node 18 or later is required", () => {
  assert.match(pkg.engines.node, /^>=\s*(1[89]|[2-9]\d)/);
});

// --- The vendored core still behaves as promised ---

test("the YAML parser returns every scalar as a string", () => {
  const doc = parseYaml('standardVersion: "1.0.0"\nmajor: 1\nflag: true\n');
  assert.equal(typeof doc.standardVersion, "string");
  assert.equal(typeof doc.major, "string", "a numeric-looking scalar was coerced");
  assert.equal(typeof doc.flag, "string", "a boolean-looking scalar was coerced");
});

test("the YAML parser rejects constructs outside its subset rather than guessing", () => {
  for (const source of ["a: |\n  block\n", "a: &anchor x\n", "a: [1, 2]\n", "---\na: b\n"]) {
    assert.throws(() => parseYaml(source), YamlError, `accepted an unsupported construct: ${JSON.stringify(source)}`);
  }
});

test("the schema evaluator throws on an unsupported keyword rather than ignoring it", () => {
  // ADR 0012 depends on this: a validator that silently skipped what it did not understand would
  // report success it never established, and the cross-field invariants would appear enforced.
  for (const schema of [{ oneOf: [] }, { if: {}, then: {} }, { minimum: 1 }, { uniqueItems: true }]) {
    assert.throws(() => assertSchemaSupported(schema), SchemaError, `accepted ${Object.keys(schema)[0]}`);
  }
});

test("the schema evaluator still validates the keywords it does support", () => {
  const schema = {
    type: "object",
    required: ["v"],
    additionalProperties: false,
    properties: { v: { type: "string", pattern: "^[0-9]+$" } },
  };
  // Note the argument order: validate(document, schema), not the reverse.
  assert.equal(validate({ v: "12" }, schema).length, 0);
  assert.ok(validate({ v: "x" }, schema).length > 0, "a pattern violation went unreported");
  assert.ok(validate({ v: "1", extra: 1 }, schema).length > 0, "an unknown property went unreported");
  assert.ok(validate({}, schema).length > 0, "a missing required property went unreported");
});

test("the vendored files record their provenance", async () => {
  for (const f of ["yaml.mjs", "jsonschema.mjs"]) {
    const source = await readFile(path.join(SELF, "scripts", f), "utf8");
    assert.match(source, /VENDORED/, `${f} does not record that it was vendored`);
    assert.match(source, /adr\/0001/, `${f} does not cite the decision that vendored it`);
  }
});
