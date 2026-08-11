/**
 * Falsifiers for the source-inventory checker.
 *
 * The claim the inventory makes is not "there are forty standards" — a count proves nothing. It is
 * that every section of every source prompt has exactly one recorded destination: a standard that
 * realizes it, a declared split across several, or a record that it deliberately becomes none.
 * These tests break that partition in each direction and assert the checker notices.
 *
 * Mutations run against a disposable copy; the working tree is never modified.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(REPO, "scripts", "inventory.mjs");
const INVENTORY = "artifacts/standards-source-inventory.json";

async function run(mutate = async () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-inv-"));
  try {
    await cp(path.join(REPO, "standards"), path.join(dir, "standards"), { recursive: true });
    await cp(path.join(REPO, "artifacts"), path.join(dir, "artifacts"), { recursive: true });
    await mutate(dir);
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const edit = (fn) => async (dir) => {
  const file = path.join(dir, INVENTORY);
  const doc = JSON.parse(await readFile(file, "utf8"));
  fn(doc);
  await writeFile(file, JSON.stringify(doc, null, 2));
};

const original = (doc) => doc.sources.find((s) => s.id === "original-prompt");

// --- Known-positive ---------------------------------------------------------------------------

test("the series reconciles, and the pass is not vacuous", async () => {
  const { code, out } = await run();
  assert.equal(code, 0, out);
  const refs = Number(/(\d+) section references reconciled/.exec(out)?.[1] ?? 0);
  assert.ok(refs > 60, `only ${refs} references were reconciled — the checker may be examining nothing`);
});

// --- Mutation: the partition breaking -----------------------------------------------------------

test("a section that becomes no standard and is not recorded as such is rejected", async () => {
  const { code, out } = await run(
    edit((doc) => {
      doc.standards = doc.standards.filter((s) => s.number !== 19);
      doc.expectedCount = 39;
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /section "16" is realized by no standard/);
});

test("removing a non-standard record leaves its section unaccounted for", async () => {
  const { code, out } = await run(
    edit((doc) => {
      original(doc).nonStandardSections = original(doc).nonStandardSections.filter((s) => s.section !== 3);
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /section "3" is realized by no standard and is not recorded as non-standard/);
});

test("an undeclared split is rejected", async () => {
  // A section quietly acquiring a second owner reads as intentional. It has to be declared.
  const { code, out } = await run(
    edit((doc) => {
      original(doc).splitSections = [];
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /with no splitSections declaration/);
});

test("a split declaration that does not match the actual owners is rejected", async () => {
  const { code, out } = await run(
    edit((doc) => {
      original(doc).splitSections[0].standards = [3, 4];
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /declared split across standards 3,4 but is actually claimed by 3,4,5/);
});

test("a split declared with no reason is rejected", async () => {
  const { code, out } = await run(
    edit((doc) => {
      delete original(doc).splitSections[0].reason;
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /declared split with no reason/);
});

test("citing a section that does not exist in the source is rejected", async () => {
  const { code, out } = await run(
    edit((doc) => {
      doc.standards.find((s) => s.number === 19).sourceSections = [{ source: "original-prompt", section: 99 }];
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /section "99" is cited by the inventory but does not exist/);
});

test("citing a subsectioned section as a whole is rejected", async () => {
  // §4 spans six domains. Citing it wholesale would silently absorb all of them into one standard.
  const { code, out } = await run(
    edit((doc) => {
      doc.standards.find((s) => s.number === 3).sourceSections = [{ source: "original-prompt", section: 4 }];
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /has subsections and must be cited by subsection/);
});

// --- Mutation: the series drifting from the corpus -------------------------------------------------

test("a count that disagrees with the series is rejected", async () => {
  const { code, out } = await run(edit((doc) => { doc.expectedCount = 36; }));
  assert.equal(code, 1, out);
  assert.match(out, /expectedCount is 36 but standards\[\] has 40 entries/);
});

test("an extraction that disagrees with the recorded section count is rejected", async () => {
  const { code, out } = await run(edit((doc) => { original(doc).expectedSectionCount = 70; }));
  assert.equal(code, 1, out);
  assert.match(out, /expectedSectionCount 70 but 64 sections were extracted/);
});

test("a standard whose file is missing is rejected", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "standards", "19-performance-as-ux.md"));
  });
  assert.equal(code, 1, out);
  assert.match(out, /which does not exist/);
});

test("a title that disagrees with the document is rejected", async () => {
  const { code, out } = await run(edit((doc) => {
    doc.standards.find((s) => s.number === 9).title = "Colour";
  }));
  assert.equal(code, 1, out);
  assert.match(out, /the inventory records "# Standard 9 — Colour"/);
});

test("a renumbered document is rejected", async () => {
  const { code, out } = await run(async (dir) => {
    const file = path.join(dir, "standards", "09-color.md");
    await writeFile(file, (await readFile(file, "utf8")).replace("# Standard 9 —", "# Standard 90 —"));
  });
  assert.equal(code, 1, out);
  assert.match(out, /opens with "# Standard 90 — Color"/);
});

// --- Anti-vacuity guards --------------------------------------------------------------------------

test("an empty series is a configuration error, not a pass", async () => {
  const { code, out } = await run(edit((doc) => { doc.standards = []; }));
  assert.equal(code, 2, out);
  assert.match(out, /nothing to reconcile/);
});

test("an inventory naming a source that does not exist is rejected", async () => {
  const { code, out } = await run(async (dir) => {
    await rm(path.join(dir, "artifacts", "prompts", "enforcement-architecture-prompt.md"));
  });
  assert.equal(code, 1, out);
  assert.match(out, /which does not exist/);
});

// --- Restore-and-assert-clean ----------------------------------------------------------------------

test("the repository is still clean after every mutation", async () => {
  const { code } = await run();
  assert.equal(code, 0, "a mutation leaked out of its temporary copy");
});
