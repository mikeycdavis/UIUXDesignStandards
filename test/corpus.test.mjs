/**
 * Structural checks on the standards corpus.
 *
 * These are the properties a reader relies on without thinking about them: that the series is
 * gapless, that every document has the same five sections, that requirement numbers run in order,
 * and that every internal link points at something. They are cheap to hold and expensive to
 * rediscover after forty documents have drifted.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(REPO, "standards");

const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const read = (f) => readFileSync(path.join(DIR, f), "utf8");

const SECTIONS = [
  "## Scope",
  "## Requirements",
  "## Additions this standard makes beyond the source",
  "## Relationship to other standards",
  "## Implementation",
];

test("the series is gapless and every filename is zero-padded kebab-case", () => {
  assert.equal(files.length, 40);
  for (const [i, f] of files.entries()) {
    assert.match(f, /^\d\d-[a-z0-9]+(-[a-z0-9]+)*\.md$/, `${f} is not NN-kebab-title.md`);
    assert.equal(Number(f.slice(0, 2)), i + 1, `${f} breaks the numbering sequence`);
  }
});

test("every document opens with its own number and carries a source line", () => {
  for (const [i, f] of files.entries()) {
    const text = read(f);
    assert.match(text.split(/\r?\n/)[0], new RegExp(`^# Standard ${i + 1} — .+`), `${f} has a wrong or missing title`);
    assert.match(text, /^Source: /m, `${f} has no Source: line`);
  }
});

test("every document has all five required sections", () => {
  for (const f of files) {
    const text = read(f);
    for (const section of SECTIONS) {
      assert.ok(text.includes(`\n${section}\n`), `${f} is missing "${section}"`);
    }
  }
});

test("requirement headings are numbered consecutively from R1", () => {
  let total = 0;
  for (const f of files) {
    const nums = [...read(f).matchAll(/^### R(\d+) — /gm)].map((m) => Number(m[1]));
    assert.ok(nums.length > 0, `${f} has no requirements`);
    total += nums.length;
    for (const [i, n] of nums.entries()) {
      assert.equal(n, i + 1, `${f} requirement headings are not consecutive: found R${n} at position ${i + 1}`);
    }
  }
  // Anti-vacuity: the assertions above are all vacuous if the corpus somehow yields no headings.
  assert.ok(total > 150, `only ${total} requirements found across the corpus`);
});

test("every relative link resolves", () => {
  const broken = [];
  let checked = 0;
  for (const f of files) {
    for (const [, , target] of read(f).matchAll(/\[([^\]]+)\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)) {
      checked += 1;
      if (!existsSync(path.resolve(DIR, target))) broken.push(`${f} → ${target}`);
    }
  }
  assert.ok(checked > 100, `only ${checked} links checked — the assertion may be vacuous`);
  assert.deepEqual(broken, [], "broken internal links");
});

test("no document claims text is reproduced verbatim from an external source", () => {
  // Standard 38 R1: external guidance is never transcribed. A claim of verbatim reproduction
  // would need a fidelity check this framework does not have.
  for (const f of files) {
    assert.doesNotMatch(read(f), /reproduced verbatim from/i, `${f} claims verbatim external reproduction`);
  }
});
