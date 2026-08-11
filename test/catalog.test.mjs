/**
 * The catalog loader's guards.
 *
 * Every one of these is a load-time error rather than a review comment, because an authoring
 * convention nobody enforces drifts. The assurance-legality and identity-collision guards matter
 * most: the first stops a rule claiming its check saw more than it did, the second stops one string
 * naming two rules.
 *
 * Most catalogs here are built in a temporary directory so the loader's guards are tested against
 * minimal inputs rather than against whatever this repository happens to ship. The first test is the
 * exception: it loads the shipped catalog, because that is the one consumers get.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

import {
  loadCatalog,
  resolve,
  assertBindings,
  coverage,
  CatalogError,
  VALIDATION_TYPES,
  APPLIES_TO,
} from "../scripts/catalog.mjs";

/** A rule with every required field, overridable per test. */
const rule = (over = {}) => ({
  id: "accessibility.img-alt-text",
  title: "Images carry a text alternative",
  standard: 3,
  category: "accessibility",
  level: "required",
  severity: "error",
  validationType: "code-analysis",
  assurance: "partial",
  nonExemptible: false,
  introducedIn: "1.0.0",
  description: "Every meaningful image exposes a text alternative.",
  rationale: "A user who cannot see the image gets nothing without one.",
  remediation: "Add an alt attribute, or mark the image decorative.",
  aliases: [],
  appliesTo: ["any-ui"],
  crossReferences: [],
  deprecatedIn: null,
  supersededBy: null,
  removedIn: null,
  ...over,
});

async function withCatalog(files, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-cat-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      await writeFile(path.join(dir, name), JSON.stringify(body, null, 2));
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const rejects = (files, match) =>
  withCatalog(files, async (dir) => {
    await assert.rejects(() => loadCatalog(dir), (e) => e instanceof CatalogError && match.test(e.message), `expected rejection matching ${match}`);
  });

// --- Known-positive ---

test("the shipped catalog loads and every rule is answerable to a standard", async () => {
  // The fixture tests below prove the loader's rules. This one proves the catalog this repository
  // actually ships, which is the only catalog a consumer ever sees.
  const catalog = await loadCatalog(path.join(REPO, "rules"));
  assert.equal(catalog.rules.size, 70);
  assert.equal([...catalog.rules.values()].filter((r) => r.level === "forbidden").length, 15);
  assert.equal(catalog.byCategory.size, 15);

  const standards = readdirSync(path.join(REPO, "standards"));
  for (const rule of catalog.rules.values()) {
    const prefix = String(rule.standard).padStart(2, "0");
    assert.ok(
      standards.some((f) => f.startsWith(`${prefix}-`)),
      `${rule.id} names Standard ${rule.standard}, which has no document`,
    );
    assert.equal(rule.category, rule.id.split(".")[0], `${rule.id}: category disagrees with its own domain segment`);
    if (rule.assurance !== "full") {
      // A rule that cannot see the whole of its subject has to say what it does not see. Without
      // this, "partial" is a word rather than a disclosure.
      assert.ok(rule.$assuranceNote, `${rule.id} claims ${rule.assurance} assurance with no $assuranceNote`);
    }
  }
});

test("a well-formed catalog loads", async () => {
  await withCatalog({ "accessibility.json": { $comment: "x", rules: [rule()] } }, async (dir) => {
    const catalog = await loadCatalog(dir);
    assert.equal(catalog.rules.size, 1);
    const loaded = catalog.rules.get("accessibility.img-alt-text");
    assert.equal(loaded.evidenceSurface, "static");
    assert.equal(loaded.attestable, false);
    assert.equal(Object.isFrozen(loaded), true);
  });
});

test("a manual-review rule is attestable by default and a visual rule may opt in", async () => {
  await withCatalog(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({ id: "visual.hierarchy-intentional", validationType: "manual-review", assurance: "none" }),
          rule({ id: "visual.regression-evidence", validationType: "visual-analysis", assurance: "partial", attestable: true }),
        ],
      },
    },
    async (dir) => {
      const catalog = await loadCatalog(dir);
      assert.equal(catalog.rules.get("visual.hierarchy-intentional").attestable, true);
      assert.equal(catalog.rules.get("visual.regression-evidence").attestable, true);
      assert.equal(catalog.rules.get("visual.regression-evidence").evidenceSurface, "visual");
    },
  );
});

test("the hyphenated ai-ux domain is a legal identity", async () => {
  await withCatalog(
    { "ai-ux.json": { $comment: "x", rules: [rule({ id: "ai-ux.no-generated-as-verified", category: "ai-ux" })] } },
    async (dir) => {
      const catalog = await loadCatalog(dir);
      assert.ok(catalog.rules.has("ai-ux.no-generated-as-verified"));
    },
  );
});

// --- Assurance legality (ADR 0005) ---

test("full assurance is rejected for every non-enumerable validation type", async () => {
  for (const type of ["code-analysis", "browser-analysis", "visual-analysis", "manual-review"]) {
    await rejects(
      { "a.json": { $comment: "x", rules: [rule({ validationType: type, assurance: "full" })] } },
      /assurance 'full' is not claimable/,
    );
  }
});

test("full assurance is accepted for enumerable validation types", async () => {
  for (const type of ["structural", "document", "configuration"]) {
    await withCatalog(
      { "a.json": { $comment: "x", rules: [rule({ validationType: type, assurance: "full" })] } },
      async (dir) => assert.equal((await loadCatalog(dir)).rules.size, 1),
    );
  }
});

// --- Identity (ADR 0006, ADR 0007) ---

test("a camelCase id is rejected", async () => {
  await rejects({ "a.json": { $comment: "x", rules: [rule({ id: "accessibility.imgAltText" })] } }, /canonical/);
});

test("a duplicate rule id is rejected", async () => {
  await rejects({ "a.json": { $comment: "x", rules: [rule(), rule()] } }, /duplicate rule id/);
});

test("an alias colliding with a rule id in a later file is rejected", async () => {
  await rejects(
    {
      "a.json": { $comment: "x", rules: [rule({ id: "forms.control-label", aliases: ["visual.spacing-system"] })] },
      "z.json": { $comment: "x", rules: [rule({ id: "visual.spacing-system" })] },
    },
    /both a rule id and an alias/,
  );
});

test("a crossReference colliding with a local rule id is rejected", async () => {
  await rejects(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({ id: "forms.control-label" }),
          rule({
            id: "interaction.error-classes-distinguished",
            crossReferences: [{ repository: "EngineeringStandards", ruleId: "forms.control-label", relationship: "complements" }],
          }),
        ],
      },
    },
    /collides with a local rule id/,
  );
});

test("a crossReference never resolves as a local identity", async () => {
  await withCatalog(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({
            crossReferences: [{ repository: "EngineeringStandards", ruleId: "errors.no-false-success", relationship: "presentation-of" }],
          }),
        ],
      },
    },
    async (dir) => {
      const catalog = await loadCatalog(dir);
      assert.equal(resolve(catalog, "errors.no-false-success"), undefined, "a foreign id resolved locally");
      assert.ok(resolve(catalog, "accessibility.img-alt-text"));
    },
  );
});

test("an unknown crossReference relationship is rejected", async () => {
  await rejects(
    {
      "a.json": {
        $comment: "x",
        rules: [rule({ crossReferences: [{ repository: "EngineeringStandards", ruleId: "x.y", relationship: "inspired-by" }] })],
      },
    },
    /relationship/,
  );
});

test("a crossReference carrying a rule property is rejected", async () => {
  // The key set is closed so that non-normativity is structural rather than a convention. A `level`
  // here would be inert today and an argument tomorrow for deriving a local level from a foreign
  // repository's decision.
  await rejects(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({
            crossReferences: [
              { repository: "EngineeringStandards", ruleId: "errors.no-false-success", relationship: "presentation-of", level: "forbidden" },
            ],
          }),
        ],
      },
    },
    /crossReference carries level/,
  );
});

test("a crossReference may carry an explanatory note", async () => {
  // The closed key set must not be so tight that a reference cannot say why it exists.
  await withCatalog(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({
            crossReferences: [
              { repository: "EngineeringStandards", ruleId: "errors.no-false-success", relationship: "presentation-of", note: "Owned there; presented here." },
            ],
          }),
        ],
      },
    },
    async (dir) => {
      const catalog = await loadCatalog(dir);
      assert.equal(catalog.rules.size, 1);
    },
  );
});

// --- appliesTo (ADR 0003) ---

test("appliesTo must be present, non-empty, and drawn from the closed set", async () => {
  await rejects({ "a.json": { $comment: "x", rules: [rule({ appliesTo: [] })] } }, /non-empty/);
  await rejects({ "a.json": { $comment: "x", rules: [rule({ appliesTo: ["tui"] })] } }, /appliesTo 'tui'/);
});

test("appliesTo may not mix any-ui with specific classes, or process with UI classes", async () => {
  await rejects({ "a.json": { $comment: "x", rules: [rule({ appliesTo: ["any-ui", "web-ui"] })] } }, /may not mix/);
  await rejects({ "a.json": { $comment: "x", rules: [rule({ appliesTo: ["process", "web-ui"] })] } }, /may not be combined/);
});

// --- Lifecycle and bindings ---

test("a missing lifecycle field is rejected even when null is the intended value", async () => {
  const incomplete = rule();
  delete incomplete.supersededBy;
  await rejects({ "a.json": { $comment: "x", rules: [incomplete] } }, /lifecycle field/);
});

test("assertBindings rejects an evaluator reporting an unknown id", async () => {
  await withCatalog({ "a.json": { $comment: "x", rules: [rule()] } }, async (dir) => {
    const catalog = await loadCatalog(dir);
    assert.doesNotThrow(() => assertBindings(catalog, ["accessibility.img-alt-text"]));
    assert.throws(() => assertBindings(catalog, ["accessibility.invented"]), CatalogError);
  });
});

test("coverage counts a standard fully represented only when every rule is evaluated above none assurance", async () => {
  await withCatalog(
    {
      "a.json": {
        $comment: "x",
        rules: [
          rule({ id: "accessibility.img-alt-text", standard: 3, assurance: "partial" }),
          rule({ id: "accessibility.landmarks", standard: 3, assurance: "none" }),
        ],
      },
    },
    async (dir) => {
      const catalog = await loadCatalog(dir);
      const both = coverage(catalog, { evaluated: ["accessibility.img-alt-text", "accessibility.landmarks"] });
      assert.equal(both.fullyMachineRepresentedStandards, 0, "a rule with assurance none counted as represented");
      assert.equal(both.evaluatedRules, 2);
    },
  );
});

// --- Anti-vacuity ---

test("the validation-type and applicability vocabularies are the documented ones", () => {
  assert.deepEqual(
    [...VALIDATION_TYPES].sort(),
    ["browser-analysis", "code-analysis", "configuration", "document", "manual-review", "structural", "visual-analysis"],
  );
  assert.deepEqual([...APPLIES_TO].sort(), ["any-ui", "desktop-ui", "embedded-ui", "mobile-ui", "process", "web-ui"]);
});
