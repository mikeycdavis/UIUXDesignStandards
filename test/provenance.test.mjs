/**
 * Falsifiers for the external-provenance checker.
 *
 * A check that has never been observed failing is an assumption. Every test below mutates the
 * corpus or the artifact into a specific false claim and asserts the checker rejects it. The
 * headline case is the one a presence-only checker would let through: prose that attributes
 * something to an external body which that body does not say.
 *
 * Each mutation runs against a disposable copy of the repository, so the working tree is never
 * modified and no test can leave a mutation behind.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(REPO, "scripts", "provenance.mjs");
const ARTIFACT = "artifacts/external-standards-provenance.json";

/** Copies the inputs the checker reads into a temporary root, applies `mutate`, and runs it. */
async function run(mutate = async () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-prov-"));
  try {
    await cp(path.join(REPO, "standards"), path.join(dir, "standards"), { recursive: true });
    await cp(path.join(REPO, "artifacts"), path.join(dir, "artifacts"), { recursive: true });
    await cp(path.join(REPO, "rules"), path.join(dir, "rules"), { recursive: true });
    await mutate(dir);
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const editArtifact = (fn) => async (dir) => {
  const file = path.join(dir, ARTIFACT);
  const doc = JSON.parse(await readFile(file, "utf8"));
  fn(doc);
  await writeFile(file, JSON.stringify(doc, null, 2));
};

const editStandard = (name, fn) => async (dir) => {
  const file = path.join(dir, "standards", name);
  await writeFile(file, fn(await readFile(file, "utf8")));
};

// --- Known-positive ---------------------------------------------------------------------------

test("the corpus passes, and the pass is not vacuous", async () => {
  const { code, out } = await run();
  assert.equal(code, 0, out);
  const tokens = Number(/(\d+) citation tokens/.exec(out)?.[1] ?? 0);
  assert.ok(tokens > 50, `only ${tokens} tokens were verified — the checker may be examining nothing`);
  assert.match(out, /retrieval failed\): apple-hig, material-3/, "unretrieved sources must stay visible in the report");
});

// --- Mutation: false external claims ------------------------------------------------------------

test("a free-form external claim in prose is rejected", async () => {
  // The exact falsifier: attribute a requirement to an external body in ordinary prose. There is
  // no token to verify, so a presence-only checker would pass this. It must not.
  const { code, out } = await run(
    editStandard("04-keyboard-and-focus.md", (t) =>
      t.replace("## Requirements", "## Requirements\n\nWCAG 2.2 requires that focus indicators be removed on touch devices.\n"),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /outside a citation token/);
});

test("changing the criterion a claim cites, without touching the mapping, is rejected", async () => {
  const { code, out } = await run(
    editStandard("04-keyboard-and-focus.md", (t) =>
      t.replace('[WCAG 2.2 SC 2.4.7 "Focus Visible" (AA)]', '[WCAG 2.2 SC 2.4.13 "Focus Appearance" (AAA)]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /claims WCAG 2\.2 SC 2\.4\.13 with no mapping/);
});

test("misquoting a criterion's title is rejected", async () => {
  const { code, out } = await run(
    editStandard("03-accessibility-foundations.md", (t) =>
      t.replace('[WCAG 2.2 SC 1.1.1 "Non-text Content" (A)]', '[WCAG 2.2 SC 1.1.1 "Text Alternatives Required" (A)]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /the recorded title is "Non-text Content"/);
});

test("misstating a criterion's conformance level is rejected", async () => {
  const { code, out } = await run(
    editStandard("03-accessibility-foundations.md", (t) =>
      t.replace('[WCAG 2.2 SC 1.4.3 "Contrast (Minimum)" (AA)]', '[WCAG 2.2 SC 1.4.3 "Contrast (Minimum)" (A)]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /the recorded level is AA/);
});

test("citing a criterion that does not exist is rejected", async () => {
  const { code, out } = await run(
    editStandard("03-accessibility-foundations.md", (t) =>
      t.replace('[WCAG 2.2 SC 1.1.1 "Non-text Content" (A)]', '[WCAG 2.2 SC 9.9.9 "Invented Criterion" (A)]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /not a criterion of the recorded source version/);
});

test("citing a criterion the source marks obsolete is rejected", async () => {
  const { code, out } = await run(
    editStandard("05-accessible-component-patterns-and-custom-controls.md", (t) =>
      t.replace('[WCAG 2.2 SC 4.1.2 "Name, Role, Value" (A)]', '[WCAG 2.2 SC 4.1.1 "Parsing" (A)]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /marks obsolete and removed/);
});

test("citing an authoring pattern that does not exist is rejected", async () => {
  const { code, out } = await run(
    editStandard("05-accessible-component-patterns-and-custom-controls.md", (t) =>
      t.replace('[APG pattern "Tabs"]', '[APG pattern "Wizard"]'),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /not in the recorded source's pattern index/);
});

test("misquoting a heuristic's title is rejected", async () => {
  const { code, out } = await run(
    editStandard("20-content-design.md", (t) =>
      t.replace('[NN/g heuristic 5 "Error Prevention"]', '[NN/g heuristic 5 "Error Recovery"]').replace(
        '[NN/g heuristic 4 "Consistency and Standards"]',
        '[NN/g heuristic 4 "Consistency"]',
      ),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /the recorded title is "Consistency and Standards"/);
});

// --- Mutation: the artifact overreaching ---------------------------------------------------------

test("a mapping that carries a rule property is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.mappings[0].level = "required";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /may not express a rule property/);
});

test("claiming direct adoption from an advisory source is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      const m = doc.mappings.find((x) => x.sourceId === "aria-apg");
      m.normativeStrength = "directly-adopted";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /claims "directly-adopted" from a source whose authority is "advisory"/);
});

test("claiming direct adoption from a published heuristic is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      const m = doc.mappings.find((x) => x.sourceId === "nng-heuristics");
      m.normativeStrength = "directly-adopted";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /authority is "heuristic"/);
});

test("a mapping citing a source that could not be retrieved is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.mappings.push({
        standard: 28,
        sourceId: "apple-hig",
        criterion: "Navigation",
        citation: "Apple Human Interface Guidelines, Navigation (Navigation)",
        normativeStrength: "recommendation",
        notes: "invented",
      });
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /whose retrieval status is "not-retrieved"/);
});

test("a mapping with no corresponding claim in prose is rejected", async () => {
  // Provenance describes the corpus. A record of a citation nobody made is a claim about the
  // corpus that is not true of it.
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.mappings.push({
        standard: 19,
        sourceId: "wcag-2.2",
        criterion: "2.2.1",
        citation: "WCAG 2.2 SC 2.2.1 Timing Adjustable (Level A)",
        normativeStrength: "directly-adopted",
        notes: "invented",
      });
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /no standard 19 prose cites it/);
});

test("a standard with neither a mapping nor a project-authored record is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.projectAuthored = doc.projectAuthored.filter((p) => p.standard !== 29);
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /standard 29 has neither a mapping nor a project-authored record/);
});

// --- Anti-vacuity guards ------------------------------------------------------------------------

test("an empty prose guard is a configuration error, not a pass", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.proseGuard.forbiddenOutsideTokens = [];
    }),
  );
  assert.equal(code, 2, out);
  assert.match(out, /would pass on anything/);
});

test("an empty corpus is a configuration error, not a pass", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "standards"), { recursive: true, force: true });
  });
  assert.equal(code, 2, out);
  assert.match(out, /standards\/ is missing/);
});

test("a source with no enumerated facts is a configuration error, not a pass", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.sources.find((s) => s.id === "wcag-2.2").criteria = [];
    }),
  );
  assert.equal(code, 2, out);
  assert.match(out, /could not be verified against anything/);
});

// --- Mutation: rule-level provenance -------------------------------------------------------------
// This surface only became checkable once the catalog existed. Until then the checker reported it as
// NOT_EVALUATED by name rather than as a pass; these tests are what the report was waiting for.

test("an accessibility rule with no recorded origin is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.ruleMappings = doc.ruleMappings.filter((m) => m.ruleId !== "accessibility.contrast");
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /rule accessibility\.contrast has no provenance mapping and is not declared project-authored/);
});

test("a rule mapping citing a WCAG criterion that does not exist is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      const m = doc.ruleMappings.find((m) => m.ruleId === "accessibility.contrast");
      m.criterion = "1.4.99";
      m.citation = 'WCAG 2.2 SC 1.4.99 "Contrast (Minimum)" (AA)';
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /cites WCAG criterion 1\.4\.99, which the recorded source does not contain/);
});

test("a rule mapping citing a withdrawn criterion is rejected", async () => {
  // 4.1.1 was removed from the recommendation. A rule sourced to it is sourced to nothing.
  const { code, out } = await run(
    editArtifact((doc) => {
      const m = doc.ruleMappings.find((m) => m.ruleId === "accessibility.aria-valid-usage");
      m.criterion = "4.1.1";
      m.citation = "WCAG 2.2 SC 4.1.1 Parsing";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /which the recorded source marks obsolete/);
});

test("a rule mapping claiming direct adoption from authoring guidance is rejected", async () => {
  // APG is not WCAG. The structural guard is what makes that true rather than merely intended.
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.ruleMappings.find((m) => m.ruleId === "accessibility.landmarks").normativeStrength = "directly-adopted";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /claims "directly-adopted" from a source whose authority is "advisory"/);
});

test("a rule mapping carrying a rule property is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.ruleMappings.find((m) => m.ruleId === "accessibility.contrast").level = "AA";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /carries the field "level"/);
});

test("provenance for a rule the catalog does not define is rejected", async () => {
  const { code, out } = await run(
    editArtifact((doc) => {
      doc.ruleMappings.find((m) => m.ruleId === "accessibility.contrast").ruleId = "accessibility.colour-contrast";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /provenance records rule "accessibility\.colour-contrast", which the catalog does not define/);
});

test("a catalog with no accessibility rules cannot be reported as covered", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "rules", "accessibility.json"));
  });
  assert.equal(code, 2, out);
  assert.match(out, /the coverage check would examine nothing/);
});

// --- Restore-and-assert-clean --------------------------------------------------------------------

test("the repository is still clean after every mutation", async () => {
  const { code } = await run();
  assert.equal(code, 0, "a mutation leaked out of its temporary copy");
});
