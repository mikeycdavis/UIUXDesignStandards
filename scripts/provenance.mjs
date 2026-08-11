/**
 * Falsifies the standards corpus' external claims against
 * `artifacts/external-standards-provenance.json`.
 *
 * The check this script is built to defeat: a standard says an external body requires something,
 * the provenance artifact records that the standard cites that body, and a presence check passes —
 * regardless of whether the claim is true. So presence is not what is checked here. Every external
 * claim in prose is a structured token carrying the criterion's identifier, its exact title, and
 * its conformance tier, and each of those is verified against facts enumerated in the artifact
 * (ADR 0013). Editing a claim without editing the record fails.
 *
 * Exit 0 clean, 1 findings, 2 the artifact or the corpus could not be read.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ARTIFACT = "artifacts/external-standards-provenance.json";
const CORPUS = "standards";

const findings = [];
const fail = (message) => findings.push(message);
const die = (message) => {
  console.error(`provenance: ${message}`);
  process.exit(2);
};

// --- Token grammar --------------------------------------------------------------------------
// Four forms and no others. The first three are CLAIMS and are verified against recorded facts.
// The fourth is a POINTER: it asserts nothing, and is the only way to name a source whose content
// this project could not retrieve.

const TOKENS = {
  wcag: /\[WCAG 2\.2 SC (\d+\.\d+\.\d+) "([^"]*)" \((A|AA|AAA)\)\]/g,
  heuristic: /\[NN\/g heuristic (\d+) "([^"]*)"\]/g,
  pattern: /\[APG pattern "([^"]*)"\]/g,
  pointer: /\[see: ([a-z0-9.\-]+)\]/g,
};
const ANY_TOKEN = /\[(?:WCAG 2\.2 SC \d+\.\d+\.\d+ "[^"]*" \((?:A|AA|AAA)\)|NN\/g heuristic \d+ "[^"]*"|APG pattern "[^"]*"|see: [a-z0-9.\-]+)\]/g;

const MAPPING_KEYS = new Set(["standard", "sourceId", "criterion", "citation", "normativeStrength", "notes"]);

/**
 * Rule-level provenance is a separate array with its own closed key set, deliberately.
 *
 * A standard-level mapping answers "does this prose cite this source truthfully" and is checked
 * against the tokens in the prose. A rule-level mapping answers a different question — "where did
 * this rule's substance come from" — and there is no token to check it against, because a catalog
 * entry is not prose. Merging them would make one array carry two claims with two verification
 * regimes, and the weaker regime would end up governing both.
 *
 * Neither array may carry a rule property. That is the invariant that keeps provenance from becoming
 * a second rule authority (Standard 38 R4), and it is why `level` is absent from both key sets even
 * though every WCAG criterion has one: the external level travels inside the citation string and
 * nothing reads it.
 */
const RULE_MAPPING_KEYS = new Set(["ruleId", "sourceId", "criterion", "citation", "normativeStrength", "notes"]);
const STRENGTHS = new Set(["directly-adopted", "interpreted", "strengthened", "recommendation"]);

// --- Load ------------------------------------------------------------------------------------

const artifactPath = path.join(ROOT, ARTIFACT);
if (!existsSync(artifactPath)) die(`${ARTIFACT} is missing.`);

let doc;
try {
  doc = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch (e) {
  die(`${ARTIFACT} is not valid JSON — ${e.message}`);
}

const corpusDir = path.join(ROOT, CORPUS);
if (!existsSync(corpusDir)) die(`${CORPUS}/ is missing.`);
const files = readdirSync(corpusDir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();

// --- Anti-vacuity -----------------------------------------------------------------------------
// Each check below quantifies over a collection. An empty collection passes every one of them
// without reading anything, which is exactly the false green this framework exists to prevent.

if (files.length === 0) die(`${CORPUS}/ contains no standards documents — there is nothing to check.`);
if (!Array.isArray(doc.sources) || doc.sources.length === 0) die("sources[] is empty.");
if (!Array.isArray(doc.mappings)) die("mappings[] is missing.");
if (!Array.isArray(doc.projectAuthored)) die("projectAuthored[] is missing.");

const sources = new Map(doc.sources.map((s) => [s.id, s]));
const retrieved = (s) => s?.retrieval?.status === "retrieved";

// --- Check 1: the artifact cannot express a rule property -------------------------------------

for (const m of doc.mappings) {
  for (const key of Object.keys(m)) {
    if (!MAPPING_KEYS.has(key)) {
      fail(`mapping for standard ${m.standard} carries the field "${key}". A mapping may not express a rule property — it would become a second rule authority (Standard 38 R4).`);
    }
  }
  if (!STRENGTHS.has(m.normativeStrength)) {
    fail(`mapping for standard ${m.standard} → ${m.sourceId} ${m.criterion} has normativeStrength "${m.normativeStrength}", which is not one of ${[...STRENGTHS].join(", ")}.`);
  }
  const source = sources.get(m.sourceId);
  if (!source) {
    fail(`mapping for standard ${m.standard} cites unknown source "${m.sourceId}".`);
    continue;
  }
  if (!retrieved(source)) {
    fail(`mapping for standard ${m.standard} cites "${m.sourceId}", whose retrieval status is "${source.retrieval?.status}". A source this project could not read may not back a claim (Standard 38 R7).`);
  }
  if (m.normativeStrength === "directly-adopted" && source.authority !== "normative") {
    fail(`mapping for standard ${m.standard} → ${m.sourceId} ${m.criterion} claims "directly-adopted" from a source whose authority is "${source.authority}". Design guidance and published heuristics are not conformance requirements (Standard 38 R6).`);
  }
  if (!m.citation || String(m.citation).trim() === "") {
    fail(`mapping for standard ${m.standard} → ${m.sourceId} ${m.criterion} has no citation.`);
  } else if (!String(m.citation).includes(String(m.criterion))) {
    fail(`mapping for standard ${m.standard} → ${m.sourceId}: citation "${m.citation}" does not name criterion "${m.criterion}".`);
  }
}

for (const m of doc.ruleMappings ?? []) {
  for (const key of Object.keys(m)) {
    if (!RULE_MAPPING_KEYS.has(key)) {
      fail(`rule mapping for ${m.ruleId} carries the field "${key}". A mapping may not express a rule property — it would become a second rule authority (Standard 38 R4).`);
    }
  }
  if (!STRENGTHS.has(m.normativeStrength)) {
    fail(`rule mapping for ${m.ruleId} → ${m.sourceId} ${m.criterion} has normativeStrength "${m.normativeStrength}", which is not one of ${[...STRENGTHS].join(", ")}.`);
  }
  const source = sources.get(m.sourceId);
  if (!source) {
    fail(`rule mapping for ${m.ruleId} cites unknown source "${m.sourceId}".`);
    continue;
  }
  if (!retrieved(source)) {
    fail(`rule mapping for ${m.ruleId} cites "${m.sourceId}", whose retrieval status is "${source.retrieval?.status}". A source this project could not read may not back a claim (Standard 38 R7).`);
  }
  if (m.normativeStrength === "directly-adopted" && source.authority !== "normative") {
    fail(`rule mapping for ${m.ruleId} → ${m.sourceId} ${m.criterion} claims "directly-adopted" from a source whose authority is "${source.authority}". Design guidance and published heuristics are not conformance requirements (Standard 38 R6).`);
  }
  if (!m.citation || !String(m.citation).includes(String(m.criterion))) {
    fail(`rule mapping for ${m.ruleId} → ${m.sourceId}: citation "${m.citation}" does not name criterion "${m.criterion}".`);
  }
}

// --- Check 2: unstructured external claims ----------------------------------------------------

const guarded = doc.proseGuard?.forbiddenOutsideTokens ?? [];
if (guarded.length === 0) die("proseGuard.forbiddenOutsideTokens is empty — the prose guard would pass on anything.");

const standardOf = (file) => Number(file.slice(0, 2));

/** Prose with every legal token removed. Anything naming a source in what remains is a raw claim. */
const stripped = new Map();
for (const f of files) {
  const text = readFileSync(path.join(corpusDir, f), "utf8");
  stripped.set(f, { text, bare: text.replace(ANY_TOKEN, " ") });
}

for (const [f, { bare }] of stripped) {
  const lower = bare.toLowerCase();
  for (const term of guarded) {
    const at = lower.indexOf(term.toLowerCase());
    if (at !== -1) {
      const line = bare.slice(0, at).split("\n").length;
      fail(`${CORPUS}/${f}:${line} names "${term}" outside a citation token. An external claim written as free prose cannot be verified and is not permitted (Standard 38 R6).`);
    }
  }
}

// --- Check 3: every claim token resolves to a recorded fact -----------------------------------

const claims = []; // {standard, sourceId, criterion, file, raw}
let tokenCount = 0;

const wcag = sources.get("wcag-2.2");
const apg = sources.get("aria-apg");
const nng = sources.get("nng-heuristics");

const criteria = new Map((wcag?.criteria ?? []).map((c) => [c.id, c]));
const heuristics = new Map((nng?.heuristics ?? []).map((h) => [String(h.number), h]));
const patterns = new Set(apg?.patterns ?? []);

if (criteria.size === 0 || heuristics.size === 0 || patterns.size === 0) {
  die("a retrieved source has no enumerated facts — claim tokens could not be verified against anything.");
}

for (const [f, { text }] of stripped) {
  const standard = standardOf(f);

  for (const [, id, title, level] of text.matchAll(TOKENS.wcag)) {
    tokenCount += 1;
    const raw = `WCAG 2.2 SC ${id}`;
    const c = criteria.get(id);
    if (!c) {
      fail(`${CORPUS}/${f} cites SC ${id}, which is not a criterion of the recorded source version.`);
      continue;
    }
    if (c.status === "obsolete") {
      fail(`${CORPUS}/${f} cites SC ${id} "${c.title}", which the recorded source version marks obsolete and removed.`);
      continue;
    }
    if (c.title !== title) {
      fail(`${CORPUS}/${f} cites SC ${id} as "${title}"; the recorded title is "${c.title}".`);
    }
    if (c.level !== level) {
      fail(`${CORPUS}/${f} cites SC ${id} at level ${level}; the recorded level is ${c.level}.`);
    }
    claims.push({ standard, sourceId: "wcag-2.2", criterion: id, file: f, raw });
  }

  for (const [, number, title] of text.matchAll(TOKENS.heuristic)) {
    tokenCount += 1;
    const h = heuristics.get(number);
    if (!h) {
      fail(`${CORPUS}/${f} cites heuristic ${number}, which is not in the recorded source.`);
      continue;
    }
    if (h.title !== title) {
      fail(`${CORPUS}/${f} cites heuristic ${number} as "${title}"; the recorded title is "${h.title}".`);
    }
    claims.push({ standard, sourceId: "nng-heuristics", criterion: number, file: f, raw: `heuristic ${number}` });
  }

  for (const [, name] of text.matchAll(TOKENS.pattern)) {
    tokenCount += 1;
    if (!patterns.has(name)) {
      fail(`${CORPUS}/${f} cites pattern "${name}", which is not in the recorded source's pattern index.`);
      continue;
    }
    claims.push({ standard, sourceId: "aria-apg", criterion: name, file: f, raw: `pattern "${name}"` });
  }

  for (const [, id] of text.matchAll(TOKENS.pointer)) {
    tokenCount += 1;
    if (!sources.has(id)) {
      fail(`${CORPUS}/${f} points at source "${id}", which is not recorded.`);
    }
  }
}

if (tokenCount === 0) {
  die("no citation tokens were found in the corpus — the token checks examined nothing.");
}

// --- Check 4: claims and mappings agree in both directions ------------------------------------

const key = (standard, sourceId, criterion) => `${standard}|${sourceId}|${criterion}`;
const mapped = new Set(doc.mappings.map((m) => key(m.standard, m.sourceId, m.criterion)));
const claimed = new Set(claims.map((c) => key(c.standard, c.sourceId, c.criterion)));

for (const c of claims) {
  if (!mapped.has(key(c.standard, c.sourceId, c.criterion))) {
    fail(`${CORPUS}/${c.file} claims ${c.raw} with no mapping recording it for standard ${c.standard}.`);
  }
}
for (const m of doc.mappings) {
  if (!claimed.has(key(m.standard, m.sourceId, m.criterion))) {
    fail(`a mapping records standard ${m.standard} → ${m.sourceId} ${m.criterion}, but no standard ${m.standard} prose cites it. Provenance must describe the corpus, not exceed it.`);
  }
}

// --- Check 5: every standard has a recorded origin --------------------------------------------

const authored = new Set(doc.projectAuthored.filter((p) => p.standard !== undefined).map((p) => p.standard));
for (const f of files) {
  const n = standardOf(f);
  const hasMapping = doc.mappings.some((m) => m.standard === n);
  if (!hasMapping && !authored.has(n)) {
    fail(`standard ${n} has neither a mapping nor a project-authored record. There is no third state (Standard 38 R9).`);
  }
}
for (const p of doc.projectAuthored) {
  if (p.standard !== undefined && !files.some((f) => standardOf(f) === p.standard)) {
    fail(`projectAuthored records standard ${p.standard}, which does not exist.`);
  }
  if (!p.rationale) fail(`projectAuthored entry for standard ${p.standard} has no rationale.`);
}

// --- Check 6: rule-level coverage, when a catalog exists --------------------------------------
// Standard 38 R9 binds accessibility RULES, not only standards. The catalog does not exist until
// plan section 03. Reporting this as passing would be the framework converting "not yet checkable"
// into a pass — so it is reported as not evaluated, by name, and the release-readiness gate
// requires it to have actually run.

const rulesDir = path.join(ROOT, "rules");
let ruleCoverage = "NOT_EVALUATED — no rules/ directory yet (plan section 03)";
if (existsSync(rulesDir)) {
  const ids = [];
  for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".json"))) {
    const parsed = JSON.parse(readFileSync(path.join(rulesDir, f), "utf8"));
    for (const rule of parsed.rules ?? []) ids.push(rule.id);
  }
  const known = new Set(ids);
  const ruleMappings = doc.ruleMappings ?? [];
  const byRule = new Set([
    ...ruleMappings.map((m) => m.ruleId),
    ...doc.projectAuthored.filter((p) => p.ruleId).map((p) => p.ruleId),
  ]);

  const accessibility = ids.filter((id) => id.startsWith("accessibility."));
  if (accessibility.length === 0) die("rules/ exists but defines no accessibility rules — the coverage check would examine nothing.");
  for (const id of accessibility) {
    if (!byRule.has(id)) {
      fail(`rule ${id} has no provenance mapping and is not declared project-authored (Standard 38 R9).`);
    }
  }

  // Provenance describes the catalog; it may not exceed it. A record for a rule that does not exist
  // is either a rename nobody propagated or a claim about nothing.
  for (const id of byRule) {
    if (!known.has(id)) fail(`provenance records rule "${id}", which the catalog does not define.`);
  }

  // The criterion a rule claims must be one the recorded source actually contains, and must not be
  // one the source has withdrawn. Otherwise a rule can be sourced to a criterion that never existed.
  for (const m of ruleMappings) {
    if (m.sourceId === "wcag-2.2") {
      const criterion = criteria.get(m.criterion);
      if (!criterion) {
        fail(`rule mapping for ${m.ruleId} cites WCAG criterion ${m.criterion}, which the recorded source does not contain.`);
      } else if (criterion.status === "obsolete") {
        fail(`rule mapping for ${m.ruleId} cites WCAG criterion ${m.criterion} "${criterion.title}", which the recorded source marks obsolete.`);
      }
    } else if (m.sourceId === "aria-apg" && !patterns.has(m.criterion)) {
      fail(`rule mapping for ${m.ruleId} cites APG pattern "${m.criterion}", which is not in the recorded source's pattern index.`);
    }
  }

  ruleCoverage =
    `${accessibility.length} accessibility rules, all recorded — ` +
    `${ruleMappings.length} external mappings, ` +
    `${doc.projectAuthored.filter((p) => p.ruleId).length} project-authored`;
}

// --- Report -----------------------------------------------------------------------------------

const strengths = doc.mappings.reduce((acc, m) => ({ ...acc, [m.normativeStrength]: (acc[m.normativeStrength] ?? 0) + 1 }), {});
const unretrieved = doc.sources.filter((s) => !retrieved(s)).map((s) => s.id);

if (findings.length === 0) {
  console.log(
    `provenance: ${files.length} standards, ${tokenCount} citation tokens verified against ${doc.sources.length} recorded sources.\n` +
      `  strengths: ${Object.entries(strengths).map(([k, v]) => `${k} ${v}`).join(", ")}\n` +
      `  sources backing no claim (retrieval failed): ${unretrieved.length ? unretrieved.join(", ") : "none"}\n` +
      `  rule-level coverage: ${ruleCoverage}`,
  );
  process.exit(0);
}

console.error(`provenance: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
for (const f of findings) console.error(`  - ${f}`);
process.exit(1);
