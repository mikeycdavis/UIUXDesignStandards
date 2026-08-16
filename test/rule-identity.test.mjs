/**
 * Falsifiers for the rule-identity reconciliation.
 *
 * The claim being defended is not "the catalog has rules" — a count proves nothing. It is that three
 * documents state one set of identities: the corpus names them, the freeze fixes them, the catalog
 * implements them. These tests break that agreement in every direction available and assert the
 * checker notices, including the two the owner named:
 *
 *   1. a standard's Implementation table references an unknown rule id
 *   2. a catalog rule has no owning standard requirement
 *
 * Mutations run against a disposable copy; the working tree is never modified.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "scripts/rule-identity.mjs";
const FREEZE = "artifacts/design/rule-catalog-v1.md";

async function run(mutate = async () => {}, { withCatalog = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-rid-"));
  try {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await cp(path.join(REPO, "standards"), path.join(dir, "standards"), { recursive: true });
    await cp(path.join(REPO, "artifacts"), path.join(dir, "artifacts"), { recursive: true });
    await cp(path.join(REPO, SCRIPT), path.join(dir, SCRIPT));
    if (withCatalog) await cp(path.join(REPO, "rules"), path.join(dir, "rules"), { recursive: true });
    await mutate(dir);
    const r = spawnSync(process.execPath, [path.join(dir, SCRIPT)], { cwd: dir, encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Rewrite a text file through a transform. */
const editText = (file, fn) => async (dir) => {
  const target = path.join(dir, file);
  await writeFile(target, fn(await readFile(target, "utf8")));
};

/** Rewrite a catalog file through a transform of its parsed form. */
const editRules = (file, fn) => async (dir) => {
  const target = path.join(dir, "rules", file);
  const doc = JSON.parse(await readFile(target, "utf8"));
  fn(doc);
  await writeFile(target, JSON.stringify(doc, null, 2));
};

// --- Known-positive ------------------------------------------------------------------------------

test("the corpus, the freeze, and the catalog reconcile, and the pass is not vacuous", async () => {
  const { code, out } = await run();
  assert.equal(code, 0, out);
  const rules = Number(/(\d+) frozen rules/.exec(out)?.[1] ?? 0);
  assert.ok(rules > 50, `only ${rules} rules examined — the checker may be reading nothing`);
  assert.match(out, /catalog: 70 catalogued rules match the freeze field-for-field/);
});

test("the freeze runs before the catalog exists, which is the point of a freeze", async () => {
  const { code, out } = await run(async () => {}, { withCatalog: false });
  assert.equal(code, 0, out);
  // Honest reporting rather than a silent pass: the check that cannot run says so by name.
  assert.match(out, /catalog: NOT_EVALUATED — rules\/ does not exist yet/);
});

// --- Mutation: the owner's two named falsifiers ---------------------------------------------------

test("a standard's Implementation table referencing an unknown rule id is rejected", async () => {
  // Falsifier 1. Prose is where identities are *named*, never where they are *introduced*. A checker
  // that merely asked "does this standard have some rule" would pass this.
  const { code, out } = await run(
    editText("standards/03-accessibility-foundations.md", (t) =>
      t.replace("`accessibility.img-alt-text`", "`accessibility.image-alternatives`"),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /names rule 'accessibility\.image-alternatives', which the freeze does not define/);
  // And the other direction fires too: the real rule is now owned by nothing.
  assert.match(out, /accessibility\.img-alt-text is frozen but no standard requirement states it/);
});

test("a frozen rule with no owning standard requirement is rejected", async () => {
  // Falsifier 2, in its pure form: an identity that exists because something other than the corpus
  // wanted it. This is the shape a detector-driven rule would take.
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace(
        "| `motion.purposeful` |",
        "| `visual.inline-style-accumulation` | Inline styles do not accumulate | 10 | recommended | info | code-analysis | partial | yes | any | — |\n| `motion.purposeful` |",
      ),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /visual\.inline-style-accumulation is frozen but no standard requirement states it/);
  assert.match(out, /inverts the catalog's authority/);
});

test("an unowned rule declared as framework-origin is accepted", async () => {
  // The exception exists and must actually work, or the check is a prohibition rather than a policy.
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t
        .replace(
          "| `motion.purposeful` |",
          "| `framework.run-metadata-recorded` | Every run records its own metadata | 35 | required | error | structural | full | yes | proc | — |\n| `motion.purposeful` |",
        )
        .replace("**70 rules.", "**71 rules.")
        .replace(
          "**None declared.**",
          "- DECLARED: `framework.run-metadata-recorded` — the framework's own release process, recorded here\n\n**One declared.**",
        ),
    ),
    { withCatalog: false },
  );
  assert.equal(code, 0, out);
});

test("a framework-origin declaration for a rule the corpus does state is rejected", async () => {
  // The declaration is an escape hatch for process rules, not a way to detach a real rule from its
  // owning requirement.
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace(
        "**None declared.**",
        "- DECLARED: `motion.purposeful` — asserted without a source\n\n**None declared.**",
      ),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /motion\.purposeful is declared framework-origin but Standard 12 states it — the declaration is false/);
});

// --- Mutation: the freeze's own counts ------------------------------------------------------------

test("a stated rule count that disagrees with the tables is rejected", async () => {
  // The exact count is the freeze. "55±" would make this assertion unwritable.
  const { code, out } = await run(editText(FREEZE, (t) => t.replace("**70 rules.", "**55 rules.")));
  assert.equal(code, 1, out);
  assert.match(out, /states 55 rules but its tables carry 70/);
});

test("a stated forbidden count that disagrees with the tables is rejected", async () => {
  const { code, out } = await run(editText(FREEZE, (t) => t.replace("15 forbidden.", "14 forbidden.")));
  assert.equal(code, 1, out);
  assert.match(out, /states 14 forbidden rules but its tables carry 15/);
});

test("a stated detector count that disagrees with the bindings is rejected", async () => {
  const { code, out } = await run(editText(FREEZE, (t) => t.replace("13 static detectors.", "14 static detectors.")));
  assert.equal(code, 1, out);
  assert.match(out, /states 14 detectors but its tables bind 13/);
});

test("a freeze that does not state its counts at all cannot be checked", async () => {
  const { code, out } = await run(editText(FREEZE, (t) => t.replace(/\*\*70 rules\..*?\*\*/, "roughly 70 rules")));
  assert.equal(code, 2, out);
  assert.match(out, /does not state its counts/);
});

// --- Mutation: identity collisions and illegal metadata -------------------------------------------

test("one detector bound to two rules is rejected", async () => {
  // One finding satisfies exactly one identity. Two owners for a detector breaks that before a line
  // of detector code exists.
  const { code, out } = await run(
    // Give accessibility.landmarks the detector accessibility.img-alt-text already owns.
    editText(FREEZE, (t) =>
      t.replace(/\| — \|\n\| `accessibility\.table-semantics`/, "| img-alt |\n| `accessibility.table-semantics`"),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /is bound to both .* — one finding, one identity/);
});

test("a forbidden rule a policy could except is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace(
        "| `design-integrity.no-dark-patterns` | The interface does not manipulate its user | 29 | forbidden | error | manual-review | none | no |",
        "| `design-integrity.no-dark-patterns` | The interface does not manipulate its user | 29 | forbidden | error | manual-review | none | yes |",
      ),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /a prohibition in name only/);
});

test("full assurance on a rule that cannot see its whole subject is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) => t.replace("| code-analysis | partial | yes | any | img-alt |", "| code-analysis | full | yes | any | img-alt |")),
  );
  assert.equal(code, 1, out);
  assert.match(out, /assurance 'full' is not claimable by a code-analysis rule/);
});

test("a manual-review rule claiming partial assurance is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace(
        "| `visual.hierarchy-intentional` | Visual hierarchy reflects intended priority | 11 | required | warning | manual-review | none |",
        "| `visual.hierarchy-intentional` | Visual hierarchy reflects intended priority | 11 | required | warning | manual-review | partial |",
      ),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /a human judgment is not partial coverage of an enumerable subject/);
});

test("a rule naming an owning standard that does not state it is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace("| `motion.purposeful` | Motion serves comprehension rather than decoration | 12 |", "| `motion.purposeful` | Motion serves comprehension rather than decoration | 19 |"),
    ),
  );
  assert.equal(code, 1, out);
  assert.match(out, /names Standard 19 as its owner, but only Standard\(s\) 12 state it/);
});

// --- Mutation: cross-references stay inert --------------------------------------------------------

test("a cross-reference to a rule EngineeringStandards does not define is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) => t.replace("`errors.no-false-success`", "`errors.no-silent-success`")),
  );

  // THIS CHECK NEEDS A SIBLING REPOSITORY, and therefore has two branches rather than one.
  //
  // `scripts/rule-identity.mjs` resolves the EngineeringStandards catalog from an absolute path on
  // the machine it runs on. That path exists on the author's machine and nowhere else — not in the
  // CI container, not on a hosted runner. Asserting only the resolvable branch made this test a
  // property of one laptop, which is how it passed for months and failed the first time the suite
  // ran anywhere else.
  //
  // The branch that runs elsewhere is not skipped, because the thing worth guarding is exactly what
  // happens when the catalog is missing: an absent catalog must report an absent catalog. A run that
  // announced "every cross-reference resolved" while having read nothing would be this framework's
  // defining false green, committed by the tool that exists to forbid it.
  if (/cross-references: NOT_EVALUATED/.test(out)) {
    assert.doesNotMatch(out, /cross-references: \d+ cross-references resolved/, "a missing catalog was reported as resolved cross-references");
    assert.equal(code, 0, `the mutation was reported as an unrelated failure rather than as an unevaluated check:\n${out}`);
    return;
  }
  assert.equal(code, 1, out);
  assert.match(out, /does not resolve in the EngineeringStandards catalog/);
});

test("a cross-reference target that is also a local rule id is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) => t.replace("| `ai.propose-execute` |", "| `motion.purposeful` |")),
  );
  assert.equal(code, 1, out);
  assert.match(out, /one string may not name two rules/);
});

test("a cross-reference carrying a rule property is rejected", async () => {
  // The constraint that makes crossReferences non-normative: an entry that could be read as a local
  // property must be impossible to write, not merely unread.
  const { code, out } = await run(
    editRules("design-integrity.json", (doc) => {
      const rule = doc.rules.find((r) => r.id === "design-integrity.no-fake-success");
      rule.crossReferences[0].level = "forbidden";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /crossReference carries level — a cross-reference states relationship only/);
});

test("a local rule shadowing a concern Standard 2 R3 cedes to EngineeringStandards is rejected", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) =>
      t.replace(
        "| `motion.purposeful` |",
        "| `errors.no-swallowed-exceptions` | Failures are not swallowed | 17 | required | error | code-analysis | partial | yes | any | — |\n| `motion.purposeful` |",
      ),
    ),
    { withCatalog: false },
  );
  assert.equal(code, 1, out);
  assert.match(out, /Standard 2 R3 records that concern as owned by EngineeringStandards/);
});

// --- Mutation: the catalog drifting from the freeze -----------------------------------------------

test("a catalog rule the freeze does not define is rejected", async () => {
  const { code, out } = await run(
    editRules("motion.json", (doc) => {
      doc.rules.push({ ...doc.rules[0], id: "motion.transition-duration-bounded" });
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /rules\/ defines 'motion\.transition-duration-bounded', which the freeze does not/);
});

test("a frozen rule missing from the catalog is rejected", async () => {
  const { code, out } = await run(
    editRules("motion.json", (doc) => {
      doc.rules = doc.rules.filter((r) => r.id !== "motion.purposeful");
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /the freeze defines 'motion\.purposeful' but no catalog file carries it/);
});

test("a catalog field that disagrees with the freeze is rejected", async () => {
  const { code, out } = await run(
    editRules("privacy.json", (doc) => {
      doc.rules.find((r) => r.id === "privacy.sensitive-data-masked").severity = "warning";
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /freeze says severity 'error', rules\/privacy\.json says 'warning'/);
});

test("a catalog appliesTo that disagrees with the freeze is rejected", async () => {
  const { code, out } = await run(
    editRules("forms.json", (doc) => {
      doc.rules.find((r) => r.id === "forms.button-type").appliesTo = ["any-ui"];
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /freeze says appliesTo \[web-ui\], rules\/forms\.json says \[any-ui\]/);
});

// --- The fourth edge: provenance, reconciled against the freeze rather than the catalog -----------

/**
 * `provenance.mjs` already reconciles the provenance record against the catalog, and that check is
 * not independent: both sides are written from the same rule files, so a rule and its provenance
 * entry added together satisfy it whatever the freeze says. These two mutations break the freeze edge
 * specifically, and the catalog edge would accept both.
 */
const editJson = (file, fn) => async (dir) => {
  const target = path.join(dir, file);
  const doc = JSON.parse(await readFile(target, "utf8"));
  fn(doc);
  await writeFile(target, JSON.stringify(doc, null, 2));
};

test("a frozen accessibility rule with no recorded origin is rejected against the freeze", async () => {
  const { code, out } = await run(
    editJson("artifacts/external-standards-provenance.json", (doc) => {
      const before = doc.ruleMappings.length;
      doc.ruleMappings = doc.ruleMappings.filter((m) => m.ruleId !== "accessibility.contrast");
      assert.equal(doc.ruleMappings.length, before - 1, "the mutation removed nothing");
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /accessibility\.contrast is frozen and has no provenance record/);
});

test("provenance for an identity the freeze does not define is rejected", async () => {
  const { code, out } = await run(
    editJson("artifacts/external-standards-provenance.json", (doc) => {
      doc.projectAuthored.push({ ruleId: "accessibility.invented-here", rationale: "x" });
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /provenance records rule 'accessibility\.invented-here', which the freeze does not define/);
});

// --- Anti-vacuity guards --------------------------------------------------------------------------

test("a freeze with no rule rows is a configuration error, not a pass", async () => {
  const { code, out } = await run(
    editText(FREEZE, (t) => t.split(/\r?\n/).filter((l) => !/^\| `[a-z]/.test(l)).join("\n")),
  );
  assert.equal(code, 2, out);
  assert.match(out, /no rule rows parsed/);
});

test("a missing freeze is a configuration error, not a pass", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, FREEZE));
  });
  assert.equal(code, 2, out);
  assert.match(out, /there is no freeze to reconcile against/);
});

test("a corpus with no Implementation rows is a configuration error, not a pass", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "standards"), { recursive: true });
    await mkdir(path.join(dir, "standards"));
    await writeFile(path.join(dir, "standards", "01-empty.md"), "# Standard 1 — Empty\n\n## Implementation\n");
  });
  assert.equal(code, 2, out);
  assert.match(out, /no requirement rows parsed/);
});

test("an empty rules directory is a configuration error, not a pass", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "rules"), { recursive: true });
    await mkdir(path.join(dir, "rules"));
  });
  assert.equal(code, 2, out);
  assert.match(out, /contains no rule files/);
});

// --- Restore-and-assert-clean ---------------------------------------------------------------------

test("the repository is still clean after every mutation", async () => {
  const { code } = await run();
  assert.equal(code, 0, "a mutation leaked out of its temporary copy");
});
