#!/usr/bin/env node
/**
 * Diagram freshness.
 *
 * `docs/architecture.mmd` is the canonical source of every diagram in `docs/architecture.md`, and the
 * document embeds a copy of it inside a fenced ```mermaid block so a reader sees the picture without
 * a toolchain. Two copies of one thing drift, and a diagram that drifts is worse than none: it is a
 * confident, readable, wrong description of the machinery, and nobody re-reads a diagram they have
 * already understood.
 *
 * So this compares them, by text, with no Mermaid dependency and no rendering. The check is
 * deliberately dumb — it establishes that the two copies are the same bytes, which is the whole claim.
 * It does not establish that the diagram describes the code; nothing mechanical can, and Standard 30
 * is where that obligation lives.
 *
 * Exit 0 in sync, 1 out of sync, 2 the check could not be performed.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCUMENT = path.join(ROOT, "docs", "architecture.md");
const SOURCE = path.join(ROOT, "docs", "architecture.mmd");

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const die = (message) => {
  process.stderr.write(`diagrams: ${message}\n`);
  process.exit(EXIT_INVOCATION);
};

for (const file of [DOCUMENT, SOURCE]) {
  if (!existsSync(file)) die(`${path.relative(ROOT, file)} does not exist — there is nothing to compare`);
}

/** Line endings are a checkout property, not a difference in the diagram. */
const normalise = (text) => text.replace(/\r\n/g, "\n").trim();

const document = normalise(readFileSync(DOCUMENT, "utf8"));
const source = normalise(readFileSync(SOURCE, "utf8"));

const fences = [...document.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => normalise(m[1]));
// Anti-vacuity: a document with no fenced diagram would agree with any source at all.
if (fences.length === 0) die("docs/architecture.md embeds no ```mermaid block — the comparison would be vacuous");
if (source.length === 0) die("docs/architecture.mmd is empty");

// The source file may hold several diagrams, separated by a blank line and a comment line. Each must
// appear in the document, in order, so that adding a diagram to one copy and not the other fails.
const diagrams = source
  .split(/\n(?=%% ---)/)
  .map((block) => normalise(block.replace(/^%% ---.*\n/, "")))
  .filter(Boolean);

const problems = [];
if (diagrams.length !== fences.length) {
  problems.push(`docs/architecture.mmd carries ${diagrams.length} diagram(s); the document embeds ${fences.length}`);
} else {
  diagrams.forEach((diagram, index) => {
    if (diagram !== fences[index]) {
      problems.push(
        `diagram ${index + 1} differs between docs/architecture.mmd and the copy embedded in docs/architecture.md. ` +
          `The .mmd file is canonical; regenerate the document rather than editing the fence.`,
      );
    }
  });
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.stderr.write(`\ndiagrams: ${problems.length} diagram(s) out of sync.\n`);
  process.exit(EXIT_FINDINGS);
}

process.stdout.write(`diagrams: ${diagrams.length} diagram(s) in docs/architecture.md match docs/architecture.mmd.\n`);
process.exit(EXIT_OK);
