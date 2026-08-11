/**
 * Tests the standards series against `artifacts/standards-source-inventory.json`.
 *
 * The inventory is hand-authored and reviewed. This script never writes it. It extracts sections
 * from the source prompts and proves that the reviewed mapping reconciles with what is actually
 * there — every section of every source is either realized by a standard or recorded as
 * deliberately becoming none.
 *
 * The reconciliation is the point. A count of forty standards is not evidence of anything; a
 * partition of sixty-four sections into fifty-eight mapped and six recorded-as-unmapped is.
 *
 * Exit 0 clean, 1 findings, 2 the inventory or a source could not be read.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INVENTORY = "artifacts/standards-source-inventory.json";

const findings = [];
const fail = (message) => findings.push(message);

const die = (message) => {
  console.error(`inventory: ${message}`);
  process.exit(2);
};

/** Top-level numbered sections: `# 12. Typography`. */
function numberedSections(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^# (\d+)\.\s+(.+?)\s*$/.exec(line);
    if (m) out.set(Number(m[1]), m[2]);
  }
  return out;
}

/** `## Title` headings beneath a given numbered section, in document order. */
function subsectionsOf(text, section) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^# ${section}\\.\\s`).test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^# \d+\.\s/.test(lines[i])) break;
    const m = /^## (.+?)\s*$/.exec(lines[i]);
    if (m) out.push(m[1]);
  }
  return out;
}

/** `##`/`###` headings, for sources whose units are named rather than numbered. */
function namedSections(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^#{2,3} (.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

const file = path.join(ROOT, INVENTORY);
if (!existsSync(file)) die(`${INVENTORY} is missing.`);

let inventory;
try {
  inventory = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  die(`${INVENTORY} is not valid JSON — ${e.message}`);
}

// --- Anti-vacuity ---------------------------------------------------------------------------
// Every check below asserts a property over a collection. If a collection is empty the check
// passes without examining anything, which is the same defect as a verdict that passes because
// nothing ran. Guard first.

if (!Array.isArray(inventory.standards) || inventory.standards.length === 0) {
  die("standards[] is empty — nothing to reconcile.");
}
if (!Array.isArray(inventory.sources) || inventory.sources.length === 0) {
  die("sources[] is empty — nothing to extract from.");
}

// --- The series ------------------------------------------------------------------------------

if (inventory.expectedCount !== inventory.standards.length) {
  fail(`expectedCount is ${inventory.expectedCount} but standards[] has ${inventory.standards.length} entries.`);
}

const numbers = inventory.standards.map((s) => s.number);
for (let n = 1; n <= inventory.expectedCount; n += 1) {
  if (!numbers.includes(n)) fail(`standard ${n} is missing from the inventory — the series has a gap.`);
}
for (const [i, n] of numbers.entries()) {
  if (numbers.indexOf(n) !== i) fail(`standard number ${n} appears more than once.`);
}

for (const entry of inventory.standards) {
  const target = path.join(ROOT, entry.implementedBy);
  if (!existsSync(target)) {
    fail(`standard ${entry.number} names ${entry.implementedBy}, which does not exist.`);
    continue;
  }
  const first = readFileSync(target, "utf8").split(/\r?\n/)[0].trim();
  const expected = `# Standard ${entry.number} — ${entry.title}`;
  if (first !== expected) {
    fail(`${entry.implementedBy} opens with "${first}" but the inventory records "${expected}".`);
  }
}

// --- Section reconciliation ------------------------------------------------------------------

const cited = new Map(); // sourceId -> Map(sectionKey -> [standard numbers, or null for non-standard])
const bump = (sourceId, key, by) => {
  if (!cited.has(sourceId)) cited.set(sourceId, new Map());
  const m = cited.get(sourceId);
  if (!m.has(key)) m.set(key, []);
  m.get(key).push(by);
};
const keyOf = (ref) => (ref.subsection === undefined ? String(ref.section) : `${ref.section} › ${ref.subsection}`);

for (const entry of inventory.standards) {
  for (const ref of entry.sourceSections ?? []) bump(ref.source, keyOf(ref), entry.number);
}
for (const source of inventory.sources) {
  for (const ref of source.nonStandardSections ?? []) bump(source.id, keyOf(ref), null);
}

for (const source of inventory.sources) {
  const sourceFile = path.join(ROOT, source.path);
  if (!existsSync(sourceFile)) {
    fail(`source ${source.id} names ${source.path}, which does not exist.`);
    continue;
  }
  const text = readFileSync(sourceFile, "utf8");
  const claims = cited.get(source.id) ?? new Map();
  if (claims.size === 0) {
    fail(`source ${source.id} is declared but no standard or non-standard record cites it.`);
    continue;
  }

  const numbered = numberedSections(text);
  const present = new Set();

  if (numbered.size > 0) {
    if (source.expectedSectionCount !== undefined && source.expectedSectionCount !== numbered.size) {
      fail(`source ${source.id} records expectedSectionCount ${source.expectedSectionCount} but ${numbered.size} sections were extracted.`);
    }
    for (const n of numbered.keys()) {
      const subs = subsectionsOf(text, n);
      if (subs.length === 0) {
        present.add(String(n));
      } else {
        // A section with subsections must be cited by subsection, and every one of its
        // subsections must be accounted for. Citing "§4" alone would silently absorb six domains.
        for (const s of subs) present.add(`${n} › ${s}`);
        if (claims.has(String(n))) {
          fail(`source ${source.id} section ${n} has subsections and must be cited by subsection, not as a whole.`);
        }
      }
    }
  } else {
    for (const name of namedSections(text)) present.add(name);
  }

  if (present.size === 0) {
    fail(`source ${source.id} yielded no sections — the extraction is not matching the document.`);
    continue;
  }

  // A section may legitimately feed more than one standard — ADR 0010 split one accessibility
  // subsection across three. What may not happen is an *undeclared* split: the reviewed decision
  // has to exist, otherwise a section quietly acquiring a second owner reads as intentional.
  const splits = new Map(
    (source.splitSections ?? []).map((s) => [keyOf(s), s]),
  );

  for (const key of present) {
    const owners = claims.get(key) ?? [];
    if (owners.length === 0) {
      fail(`source ${source.id} section "${key}" is realized by no standard and is not recorded as non-standard. Every section must have a stated destination.`);
      continue;
    }
    if (owners.length === 1) {
      if (splits.has(key)) {
        fail(`source ${source.id} section "${key}" is declared split but only one destination claims it. Remove the split declaration or restore the other destinations.`);
      }
      continue;
    }
    const split = splits.get(key);
    if (!split) {
      fail(`source ${source.id} section "${key}" is claimed by ${owners.length} destinations (${owners.join(", ")}) with no splitSections declaration. A split must be a recorded decision.`);
      continue;
    }
    const declared = [...split.standards].sort((a, b) => a - b).join(",");
    const actual = [...owners].sort((a, b) => a - b).join(",");
    if (declared !== actual) {
      fail(`source ${source.id} section "${key}" is declared split across standards ${declared} but is actually claimed by ${actual}.`);
    }
    if (!split.reason) {
      fail(`source ${source.id} section "${key}" is declared split with no reason. The decision has to be legible.`);
    }
  }
  for (const key of splits.keys()) {
    if (!present.has(key)) {
      fail(`source ${source.id} declares a split for section "${key}", which does not exist in ${source.path}.`);
    }
  }
  for (const key of claims.keys()) {
    if (!present.has(key)) {
      fail(`source ${source.id} section "${key}" is cited by the inventory but does not exist in ${source.path}.`);
    }
  }
}

// --- Report -----------------------------------------------------------------------------------

const mapped = inventory.standards.reduce((n, s) => n + (s.sourceSections?.length ?? 0), 0);
const unmapped = inventory.sources.reduce((n, s) => n + (s.nonStandardSections?.length ?? 0), 0);

if (findings.length === 0) {
  console.log(
    `inventory: ${inventory.standards.length} standards; ${mapped} section references reconciled; ` +
      `${unmapped} sections recorded as deliberately becoming no standard.`,
  );
  process.exit(0);
}

console.error(`inventory: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
for (const f of findings) console.error(`  - ${f}`);
process.exit(1);
