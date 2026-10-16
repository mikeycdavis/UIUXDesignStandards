#!/usr/bin/env node
/**
 * uiux-standards — the command-line entry point, and the home of every static detector.
 *
 * Exit codes, and why they are never collapsed:
 *
 *   0  the command ran and the project is in the state the command checks for
 *   1  the tool worked, and the project has problems
 *   2  no verdict was reached — bad invocation, unreadable input, or an unimplemented path
 *
 * 1 and 2 are different facts. A CI system that sees them as one event learns that the cheapest way
 * to make a red build green is to break the tool.
 *
 * THE TWO COMMANDS ARE NOT THE SAME KIND OF THING.
 *
 *   audit     discovers evidence. It consults no policy, emits no status, and reaches no verdict.
 *             It answers "what is here?" and stops.
 *   validate  is policy-aware and authoritative. It runs the gates in order and produces the
 *             three-block envelope.
 *
 * THE GATE ORDER IS A CONTRACT, NOT AN IMPLEMENTATION DETAIL:
 *
 *   Gate 0   policy validity      invalid shape or semantics → exit 2, nothing is evaluated
 *   Gate 1   applicability        the classifier, from repository evidence
 *   Gate 2   rule evaluation      over the rules the classification admits — and only then
 *
 * Gate 1 runs BEFORE any UI rule result can exist. The alternative — evaluate everything, then mark
 * the UI results not-applicable afterwards — produces the same JSON in the easy cases and the wrong
 * JSON in the hard ones: a UI rule would have to acquire a result before anything established that
 * the rule had a subject, and every later stage would be one refactor away from letting that result
 * escape. A rule that must not be evaluated is not evaluated (ADR 0003).
 *
 * The two compliance blocks are computed by two separate `evaluate()` calls over two disjoint rule
 * sets. They are never one evaluation split afterwards, because a split afterwards is a convention
 * and two calls are a boundary — UI rules and process rules cannot then share applicability
 * semantics by accident.
 *
 * Usage:
 *   uiux-standards audit [path] [--json] [--strict]
 *   uiux-standards validate [path] [--json] [--evidence=<file>]
 *   uiux-standards applicability [path] [--json] [--self]
 *   uiux-standards init [path]                                  (section 09)
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveVersionIdentity } from "./version-identity.mjs";
import { loadCatalog, assertBindings, coverage, CatalogError } from "./catalog.mjs";
import { evaluate, envelope } from "./compliance.mjs";
import {
  classify,
  scanRepository,
  ClassifierError,
  MAX_FILES,
  runCli as runApplicability,
} from "./applicability.mjs";
import { checkPolicy } from "./policy.mjs";
import { ingest, browserSurface, EvidenceError } from "./evidence.mjs";
import { resolveAttestations } from "./attestation.mjs";
import { runCli as runInit } from "./init.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

/**
 * The framework root — the checkout whose rules are about to run. Resolved from this file rather than
 * from the working directory, because the working directory is the CONSUMER and the two are only the
 * same repository while the framework is its own only consumer.
 */
const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");

/** A single file's read budget. A file larger than this is recorded as unread, never as clean. */
const MAX_READ_BYTES = 400_000;

/**
 * The two files that necessarily contain the literal strings the detectors hunt for — `outline:
 * none`, `user-scalable=no`, `lorem ipsum`. One is the detector implementation; the other is the
 * suite that asserts the detectors fire, which cannot assert that without quoting them.
 *
 * Without this the repository's own audit reports its detectors, and its detector tests, as
 * violations of the rules they enforce.
 *
 * These are paths, not names. Excluding every file called `uiux.mjs` would silently exempt an
 * adopter's file that happened to share the name, and this framework does not hand out exemptions by
 * coincidence of filename. Every exclusion actually applied is recorded in the evidence surface.
 */
const SELF = new Set(["scripts/uiux.mjs", "test/audit.test.mjs"]);

// -------------------------------------------------------------------------------------------------
// Source views
// -------------------------------------------------------------------------------------------------

/**
 * Comment syntax per extension. The shape generalizes ES's `{ line, block }` to
 * `{ line?: string[], blocks?: [{ open, close }] }` so that a language can have several block forms
 * (a single-file component has both `/* *\/` and `<!-- -->`) or none at all.
 *
 * ⚠ CSS HAS NO LINE COMMENTS. Adding `//` to the `.css` entry would blank the remainder of every
 * line containing `https://`, corrupting `url()` values and every declaration after them. The
 * wrong comment syntax does not fail loudly; it silently corrupts the split and then produces
 * confident findings from the wreckage.
 */
const COMMENT_SYNTAX = {
  ".js": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".mjs": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".cjs": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".ts": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".jsx": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".tsx": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".css": { blocks: [{ open: "/*", close: "*/" }] },
  ".scss": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".less": { line: ["//"], blocks: [{ open: "/*", close: "*/" }] },
  ".html": { blocks: [{ open: "<!--", close: "-->" }] },
  ".htm": { blocks: [{ open: "<!--", close: "-->" }] },
  ".vue": { blocks: [{ open: "/*", close: "*/" }, { open: "<!--", close: "-->" }] },
  ".svelte": { blocks: [{ open: "/*", close: "*/" }, { open: "<!--", close: "-->" }] },
};

/**
 * Where a quote opens a string literal. Tracking strings is what keeps `"https://example.com"` from
 * being read as a line comment — so it is on wherever the language has string literals AND the
 * language is not markup-dominant.
 *
 * `.html`, `.vue`, and `.svelte` are excluded: their template text is prose, and an apostrophe in
 * "don't" would open a string that ran to the next apostrophe. In markup, a quote outside a tag is
 * usually punctuation, and treating punctuation as syntax is worse than not tracking it.
 */
const TRACKS_STRINGS = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".css", ".scss", ".less"]);

/**
 * Where `structureOf` blanks string contents.
 *
 * NOT the same set as TRACKS_STRINGS, and the difference is deliberate. In a markup-bearing file an
 * attribute value IS the structure: blanking it would make `alt=""` and `alt="A chart"`
 * indistinguishable, and every attribute-reading detector would report on markup it could no longer
 * read. So `.jsx` and `.tsx` track strings (for correct boundaries) without blanking them.
 *
 * The cost is recorded in LIMITATIONS rather than hidden: in those two extensions a markup pattern
 * written inside a string literal is visible to the detectors that hunt it.
 */
const BLANKS_STRINGS = new Set([".js", ".mjs", ".cjs", ".ts", ".css", ".scss", ".less"]);

/**
 * Known limitations of the static layer. Printed by both commands, because a limitation an adopter
 * cannot see is one they will read a clean result as excluding.
 */
export const LIMITATIONS = [
  "Markup written inside a JavaScript template literal (tagged-template HTML, innerHTML assembly) is not analyzed: in .js and .ts the string contents are blanked before the structural detectors read them. Those detectors under-report there, and under-reporting is reported here rather than as a pass.",
  "In .jsx and .tsx, string contents are NOT blanked — an attribute value is structure. A markup pattern quoted inside a string literal in those files is therefore visible to the detector that hunts it.",
  "In .vue and .svelte both comment syntaxes are stripped without knowing which region of the file is script and which is template. A literal `<!--` inside a JavaScript string in such a file mis-splits the source.",
  "JSX form controls are not label-checked. `htmlFor` plus component wrappers make per-file label association dishonest to assert, so forms.control-label examines .html, .vue, and .svelte only.",
  "Heading structure is checked in complete HTML documents only. A fragment legitimately starts at h2, and reporting that as a skipped level would be a false positive on correct markup.",
  "An attestation is checked for freshness and for covering the review subject the project declared. Nothing here establishes that a reviewer read that material, or that their judgement was sound — a recorded review is evidence that a review is on file, and the framework does not claim more for it than that.",
];

/**
 * Split a file into the three views the use/mention distinction requires.
 *
 *   sourceOf     comments removed, string literals intact  — for patterns that live inside strings
 *   structureOf  comments removed, string literals blanked where the language is not markup
 *   commentsOf   comment text only
 *
 * All three are the same length as the input, with removed regions replaced by spaces and newlines
 * preserved, so an index in one view is the same index in the file. That is what lets a finding
 * carry a line number that means something.
 *
 * A detector reports an INSTANCE of its subject, never a DISCUSSION of it. Every detector below
 * declares which view it reads and why.
 */
export function splitSource(text, ext) {
  const syntax = COMMENT_SYNTAX[ext];
  if (!syntax) return { sourceOf: text, structureOf: text, commentsOf: blankOut(text) };

  const blanks = BLANKS_STRINGS.has(ext);
  const tracks = TRACKS_STRINGS.has(ext);
  const lines = syntax.line ?? [];
  const blocks = syntax.blocks ?? [];

  const source = [];
  const structure = [];
  const comments = [];
  const emit = (ch, where) => {
    const gap = ch === "\n" ? "\n" : " ";
    source.push(where === "source" || where === "both" ? ch : gap);
    structure.push(where === "both" ? ch : gap);
    comments.push(where === "comment" ? ch : gap);
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    const block = blocks.find((b) => text.startsWith(b.open, i));
    if (block) {
      const end = text.indexOf(block.close, i + block.open.length);
      const stop = end === -1 ? text.length : end + block.close.length;
      while (i < stop) emit(text[i++], "comment");
      continue;
    }

    const line = lines.find((token) => text.startsWith(token, i));
    if (line) {
      while (i < text.length && text[i] !== "\n") emit(text[i++], "comment");
      continue;
    }

    if (tracks && (ch === '"' || ch === "'" || ch === "`")) {
      const quote = ch;
      emit(text[i++], blanks ? "none" : "both");
      while (i < text.length) {
        if (text[i] === "\\") {
          emit(text[i++], blanks ? "source" : "both");
          if (i < text.length) emit(text[i++], blanks ? "source" : "both");
          continue;
        }
        if (text[i] === quote) {
          emit(text[i++], blanks ? "none" : "both");
          break;
        }
        // A newline ends a non-template string: an unterminated quote must not swallow the file.
        if (text[i] === "\n" && quote !== "`") {
          emit(text[i++], "both");
          break;
        }
        emit(text[i++], blanks ? "source" : "both");
      }
      continue;
    }

    emit(text[i++], "both");
  }

  return { sourceOf: source.join(""), structureOf: structure.join(""), commentsOf: comments.join("") };
}

function blankOut(text) {
  return text.replace(/[^\n]/g, " ");
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

// -------------------------------------------------------------------------------------------------
// Corpus
// -------------------------------------------------------------------------------------------------

const SCANNED_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx",
  ".css", ".scss", ".less",
  ".html", ".htm", ".vue", ".svelte",
]);

/**
 * Read every scannable file into `{ path, ext, text, views }`.
 *
 * A file that could not be read, or that exceeded the per-file budget, lands in `unread` and is
 * absent from `files`. It is never silently treated as empty: an empty file produces no findings,
 * which reads exactly like a clean one.
 */
export async function readCorpus(root, { maxFiles = MAX_FILES } = {}) {
  const scan = await scanRepository(root, { maxFiles });
  const files = [];
  const unread = [];
  const selfExcluded = [];

  for (const relative of scan.files) {
    const ext = path.extname(relative).toLowerCase();
    if (!SCANNED_EXTENSIONS.has(ext)) continue;
    if (SELF.has(relative)) {
      selfExcluded.push(relative);
      continue;
    }

    const absolute = path.join(root, relative);
    try {
      const info = await stat(absolute);
      if (info.size > MAX_READ_BYTES) {
        unread.push({ path: relative, reason: `larger than the ${MAX_READ_BYTES}-byte read budget` });
        continue;
      }
      const text = await readFile(absolute, "utf8");
      files.push({ path: relative, ext, text, views: splitSource(text, ext) });
    } catch (error) {
      unread.push({ path: relative, reason: error.code ?? "unreadable" });
    }
  }

  return { scan, files, unread, selfExcluded };
}

// -------------------------------------------------------------------------------------------------
// Detectors
// -------------------------------------------------------------------------------------------------

/**
 * Every detector binds to EXACTLY ONE canonical rule id, frozen in
 * artifacts/design/rule-catalog-v1.md before any of this code existed. A detector may not invent an
 * identity, may not share one, and may not report against two. `assertBindings` proves the first of
 * those on every run; the meta-tests prove the rest.
 *
 * Each detector declares:
 *
 *   rule       the frozen canonical id — its single evidence-to-identity binding
 *   view       which of the three source views it reads, and the doc comment says why
 *   label      OBSERVED where a file at a defined path establishes the finding, INFERRED where a
 *              pattern does. A heuristic is never labeled OBSERVED.
 *   examine    (file, context) → { examined, findings }
 *
 * `examined` is the anti-vacuity flag and it is load-bearing. A detector contributes its rule id to
 * the evaluated set ONLY when it actually met an instance of its subject. A project with no images
 * has not satisfied the alt-text rule; nothing looked at anything, and that is `not-evaluated`, not
 * `passed`. Vacuous truth is still a false green when the reader is a CI dashboard.
 */

const FINDING = (rule, file, index, message, { severity = "error", label = "OBSERVED", detector }) => ({
  id: detector,
  rule,
  category: rule.split(".")[0],
  severity,
  label,
  evidence: [`${file.path}:${lineOf(file.text, index)}`],
  message,
  standardRef: null,
});

/** Elements that are operable, and therefore may not be hidden from assistive technology. */
const INTERACTIVE_ELEMENTS = ["a", "button", "input", "select", "textarea", "summary", "details"];

/** ARIA 1.2 role names. An unlisted value is not a role, whatever it was meant to be. */
const ARIA_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button", "caption",
  "cell", "checkbox", "code", "columnheader", "combobox", "command", "complementary", "composite",
  "contentinfo", "definition", "deletion", "dialog", "directory", "document", "emphasis", "feed",
  "figure", "form", "generic", "grid", "gridcell", "group", "heading", "img", "input", "insertion",
  "landmark", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu",
  "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none", "note",
  "option", "paragraph", "presentation", "progressbar", "radio", "radiogroup", "range", "region",
  "roletype", "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "section",
  "sectionhead", "select", "separator", "slider", "spinbutton", "status", "strong", "structure",
  "subscript", "superscript", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox",
  "time", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem", "widget", "window",
]);

/**
 * Interaction handlers, across the four dialects the markup extensions cover: DOM (`onclick`), JSX
 * (`onClick`), Vue (`@click`, `v-on:click`), and Svelte (`on:click`).
 */
const CLICK_HANDLER = /(\bon:?click\b|\bv-on:click\b|@click\b)/i;
const KEY_HANDLER = /(\bon:?key(down|up|press)\b|\bv-on:key|@key(down|up|press)\b)/i;

const MARKUP_EXTENSIONS = new Set([".html", ".htm", ".vue", ".svelte", ".jsx", ".tsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".less"]);

/**
 * Resolve SCSS interpolation spans (`#{ ... }`) without changing the text's length or line structure.
 *
 * The block matcher splits on braces, so an interpolation cuts a rule into fragments. Resolving keeps
 * every offset valid. Each span is one of two things:
 *
 *   STATIC   its content is a bare keyword, number or `!important`, or a quoted literal - Sass
 *            interpolates those verbatim - so the content is substituted (`#{none}` reads as `none`,
 *            `#{!important}` as `!important`). The content is read from `sourceText`, because the
 *            structure view blanks a quoted literal. It is padded with spaces to the span's length, on
 *            the side that keeps it from fusing with an adjacent identifier character.
 *   DYNAMIC  anything else (a variable, a function call, a map, arithmetic, an unterminated span).
 *            Its value is unknowable here, so it is masked with `_` and its range returned; the
 *            detector decides whether not knowing it makes a block unexaminable.
 *
 * Returns the resolved text; a dynamic span's characters are UNKNOWN, so whichever block owns that
 * text owns the unknown, with no separate range bookkeeping.
 */
/** Stands in for every character of an interpolation whose value is not statically knowable. */
const UNKNOWN = "\uE000";

function resolveInterpolation(text, sourceText = text, rawText = sourceText) {
  const isIdent = (ch) => ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
  // Pass 1: find every span, and read its content when it is statically readable.
  const spans = [];
  for (let i = 0; i < text.length; ) {
    // Sass #{...} and Less @{...} interpolation: a brace here does not open a block
    if ((text[i] !== "#" && text[i] !== "@") || text[i + 1] !== "{") {
      i++;
      continue;
    }
    const lessSpan = text[i] === "@"; // a Less span is never read: its value is a variable
    let depth = 0;
    let j = i + 1;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) break;
    }
    const terminated = j < text.length;
    const end = Math.min(j + 1, text.length); // an unterminated span is masked to the end
    const inner = terminated ? sourceText.slice(i + 2, j).trim() : null;
    // The views blank quote characters, so quoting is read from the raw file text: the BARE value
    // `null` interpolates to nothing, while the string "null" interpolates to the text null.
    const raw = terminated ? rawText.slice(i + 2, j).trim() : null;
    let literal = !lessSpan && inner !== null && /^!?[A-Za-z0-9_.%-]+$/.test(inner) ? inner : null;
    // A plain quoted string interpolates to its text, punctuation included (#{":focus"} is :focus).
    const quoted = raw !== null ? /^(["'])([^"'\\\n{}#]*)\1$/.exec(raw) : null;
    if (quoted !== null && !lessSpan) literal = quoted[2];
    if (literal === "null" && raw === "null") literal = "";
    spans.push({ start: i, end, literal });
    i = end;
  }
  // Adjacent spans are ONE value: Sass concatenates them (#{n}#{one} is none). A run is readable only
  // if every member is, and then its text is the concatenation, laid out contiguously.
  const runs = [];
  for (const span of spans) {
    const last = runs[runs.length - 1];
    if (last && last.end === span.start) {
      last.end = span.end;
      last.parts.push(span.literal);
    } else runs.push({ start: span.start, end: span.end, parts: [span.literal] });
  }
  // Pass 2: write the text.
  let out = "";
  let at = 0;
  for (const run of runs) {
    out += text.slice(at, run.start);
    const width = run.end - run.start;
    const literal = run.parts.every((part) => part !== null) ? run.parts.join("") : null;
    const before = text[run.start - 1];
    const after = text[run.end];
    // Fixed length cannot keep BOTH the colon's adjacency and an ident suffix (`:#{focus}-visible`
    // is `:focus-visible`, three characters shorter): spaces after a colon would split the pseudo-class
    // name, so that position is not readable and the span is masked rather than misread.
    // The same holds before an opening parenthesis (`:#{not}(:focus)` is `:not(:focus)`): padding on the
    // right would turn the functional pseudo-class into a name and a parenthesised group.
    const splitsPseudo =
      literal !== null && literal.length < width && ((before === ":" && isIdent(after)) || after === "(");
    if (literal !== null && literal.length <= width && !(isIdent(before) && isIdent(after)) && !splitsPseudo) {
      out += isIdent(after) ? literal.padStart(width, " ") : literal.padEnd(width, " ");
    } else {
      out += text.slice(run.start, run.end).replace(/[^\n]/g, UNKNOWN);
    }
    at = run.end;
  }
  return out + text.slice(at);
}

/**
 * ONE small block tree for the static style detectors. Each node carries:
 *
 *   selector    its own selector text (an at-rule's prelude for an at-rule)
 *   atRule      the at-rule name, or null for a style rule. A prelude is not a selector.
 *   composed    the FULL selectors of a style rule, from its ancestors: `&` resolved, a descendant
 *               combinator otherwise, comma lists as a cross product. An at-rule contributes nothing;
 *               its children compose against the nearest style-rule ancestor.
 *   body        the text the block OWNS - child blocks blanked - so a declaration, and an unknown
 *               span within it, belongs to exactly one block.
 */
function parseBlocks(text, rawText = text) {
  const frames = [];
  const stack = [];
  let boundary = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const frame = { selStart: boundary + 1, open: i, close: text.length, children: [], parent: stack[stack.length - 1] ?? null };
      stack.push(frame);
      frames.push(frame);
      boundary = i;
    } else if (ch === "}") {
      const frame = stack.pop();
      if (frame) {
        frame.close = i;
        if (frame.parent) frame.parent.children.push([frame.selStart, i + 1]);
      }
      boundary = i;
    } else if (ch === ";") {
      boundary = i;
    }
  }
  // A block still open at end of input (an unterminated interpolation swallowed its brace) keeps
  // close = end of input, and is still a block. It is also a child of its parent, so the parent's own
  // text does not include it (parsing stays linear however many blocks are left open).
  while (stack.length > 0) {
    const frame = stack.pop();
    frame.close = text.length;
    if (frame.parent) frame.parent.children.push([frame.selStart, text.length]);
  }

  const nodes = new Map();
  const out = [];
  for (const frame of frames) {
    // frames are in source order, so a parent is always built before its children
    const selector = text.slice(frame.selStart, frame.open);
    const trimmed = selector.trim();
    // At-rule names are ASCII case-insensitive: @MEDIA is @media.
    let atRule = trimmed.startsWith("@") ? (/^@([A-Za-z-]+)/.exec(trimmed)?.[1] ?? "").toLowerCase() : null;
    // A name that is only partly interpolated (`@-#{$v}-keyframes`, `@med#{$x}`) is not knowable
    // either: it is treated as the unknown name, never as the readable prefix.
    if (atRule !== null && trimmed.slice(1).replace(/^[A-Za-z-]*/, "").startsWith(UNKNOWN)) atRule = "";
    // the text the block OWNS: its own segments between child blocks, joined by one space
    const ownParts = [];
    let pos = frame.open + 1;
    for (const [from, to] of frame.children) {
      const start = Math.max(from, pos);
      if (start > pos) ownParts.push(text.slice(pos, start));
      pos = Math.max(pos, Math.min(to, frame.close));
    }
    if (pos < frame.close) ownParts.push(text.slice(pos, frame.close));
    const parent = frame.parent ? nodes.get(frame.parent) : null;
    const depth = (parent ? parent.depth : 0) + 1;
    // The inherited CONTEXT is what a child composes against: `parents` are the selectors a
    // `&` names, and `reset` says whether a plain child is still a descendant of them. It is
    // carried through every non-rule block, so a reset set by @at-root reaches the first style rule
    // however many group at-rules sit between.
    const ctx = parent ? parent.ctx : { parents: [""], reset: false, reasons: [null] };
    // why each composed branch is off the closed list because of how its HEAD is written (an interpolation, a
    // comment inside it), carried per branch through nesting: reasons[k] belongs to composed[k]
    let reasons;
    // Selector semantics of an at-rule:
    //   group at-rules       inherit the context, and own declarations bubble to the enclosing rule
    //   @at-root             follows Sass's query semantics (see atRootResets): a query that drops
    //                        rules sets reset for what is inside; one that keeps rules leaves the
    //                        context untouched and its own declarations belong to the enclosing rule.
    //                        `@at-root .sel { }` is itself a style rule with that selector.
    //   control / mixin / include-with-content: the selectors inside depend on code not modelled
    //                        here, so everything inside is opaque and never examined as a finding.
    //   anything else (@keyframes, @font-face, ...) has no selector semantics: the context passes
    //                        through and none of it is focus-relevant.
    // A colon followed by whitespace (or the end) after a property name makes a prelude a declaration;
    // `a:hover` and `:focus` are selectors.
    // A custom property is a declaration whatever follows its colon (`--x:foo {`, `--x:fn({`); an
    // ordinary property needs whitespace or the end, because `a:hover` is a selector.
    const declaration =
      atRule === null ? /^(?:(--[\w-]*)\s*:|([\w\u{E000}-]+)\s*:(?:\s|$))/u.exec(trimmed) : null;
    const declarationName = declaration ? (declaration[1] ?? declaration[2]) : null;
    let opaque = (parent?.opaque ?? false) || (atRule !== null && OPAQUE_AT_RULES.has(atRule));
    let composed;
    let childCtx;
    let rootEmitted = false;
    if (atRule === "at-root") {
      const prelude = trimmed.replace(/^@at-root/i, "").trim();
      if (prelude === "" || prelude.startsWith("(")) {
        const resets = prelude === "" ? true : atRootResets(prelude);
        if (resets === null) opaque = true; // a query that cannot be read is not guessed at
        const drops = resets !== false;
        composed = drops ? [""] : ctx.reset ? [""] : ctx.parents;
        reasons = drops || ctx.reset ? [null] : ctx.reasons;
        childCtx = { parents: ctx.parents, reset: ctx.reset || drops, reasons: ctx.reasons };
      } else {
        composed = composeSelectors(prelude, ctx.parents, true);
        reasons = branchReasons(composed, prelude, rawText.slice(frame.selStart, frame.open), ctx.parents.length, [null]);
        childCtx = { parents: composed, reset: false, reasons };
      }
    } else if (atRule !== null && ROOT_EMITTED_AT_RULES.has(atRule.replace(/^-[a-z]+-/, ""))) {
      // dart-sass: inside a style rule an at-rule is bubbled to the root and its contents are
      // wrapped in the enclosing rule - except in @keyframes and @font-face, whose contents are not.
      rootEmitted = true;
      composed = [""];
      reasons = [null];
      childCtx = { parents: [""], reset: true, reasons: [null] };
    } else if (atRule !== null) {
      // Every other at-rule - the conditional group rules and generic CSS at-rules alike - keeps the
      // enclosing rule around its declarations. A name that is itself interpolated is not knowable.
      if (atRule === "") opaque = true;
      composed = ctx.reset ? [""] : ctx.parents;
      reasons = ctx.reset ? [null] : ctx.reasons;
      childCtx = ctx;
    } else if (declaration) {
      // `name: {` or `name: value {`: a block that belongs to a DECLARATION, not a rule. `--x: { }`
      // is a custom property's value (data); `outline: { style: none }` is Sass property nesting.
      composed = ctx.reset ? [""] : ctx.parents;
      reasons = ctx.reset ? [null] : ctx.reasons;
      childCtx = ctx;
    } else {
      composed = composeSelectors(selector, ctx.parents, ctx.reset);
      reasons = branchReasons(composed, selector, rawText.slice(frame.selStart, frame.open), ctx.parents.length, ctx.reasons);
      childCtx = { parents: composed, reset: false, reasons };
    }
    // work is bounded: a rule nested deeper than MAX_DEPTH is not composed at all
    if (depth > MAX_DEPTH) {
      composed = [TOO_DEEP];
      reasons = [null];
      childCtx = { parents: [TOO_DEEP], reset: false, reasons: [null] };
    }
    const node = {
      depth,
      selector,
      selectorStart: frame.selStart,
      atRule,
      rootEmitted,
      // dataBlock: a custom property's value; propNest: the property name of a Sass nested property
      // block. Neither is a rule, and nothing inside either is read as one.
      dataBlock: declaration !== null && declarationName.startsWith("--"),
      propNest: declaration !== null && !declarationName.startsWith("--") ? declarationName : null,
      inside: parent !== null && (parent.inside || parent.dataBlock || parent.propNest !== null),
      opaque,
      ctx: childCtx,
      parent,
      body: ownParts.join(" "),
      composed,
      reasons,
    };
    nodes.set(frame, node);
    out.push(node);
  }
  return out;
}

/**
 * Sass `@at-root` query semantics. Returns true when the query excludes style rules (so what is
 * inside is no longer a descendant of the enclosing rule), false when it keeps them, and null when
 * the query cannot be read.
 *
 *   (without: <names>)  excludes what it lists: resets iff the list contains `rule` or `all`
 *   (with: <names>)     excludes everything it does not list: resets iff the list contains neither
 *                       `rule` nor `all`
 *   no query            defaults to (without: rule): resets
 * Names such as `media` and `supports` concern at-rules only and never decide it.
 */
function atRootResets(prelude) {
  const m = /^\(\s*(with|without)\s*:\s*([^()]*)\)$/i.exec(prelude);
  if (!m || m[2].includes(UNKNOWN)) return null;
  const names = m[2].toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (names.length === 0) return null;
  const listsRule = names.includes("rule") || names.includes("all");
  return m[1].toLowerCase() === "without" ? listsRule : !listsRule;
}

/** At-rules whose contents Sass does NOT wrap in the enclosing style rule (vendor prefix ignored). */
const ROOT_EMITTED_AT_RULES = new Set(["keyframes", "font-face"]);
const OPAQUE_AT_RULES = new Set(["include", "each", "if", "else", "for", "while", "function", "mixin", "content", "return"]);

/** Split on commas outside parentheses and brackets. */
function splitSelectorList(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** A selector head split on top-level commas, with each part's [start, end) offsets in the head. */
function headPartRanges(head) {
  const ranges = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      ranges.push([start, i]);
      start = i + 1;
    }
  }
  ranges.push([start, head.length]);
  return ranges.filter(([a, b]) => head.slice(a, b).trim().length > 0);
}

/** "interpolation" | "comment" | null for one raw part of a selector head. */
const ATTRIBUTE_RAW = /^\s*[A-Za-z_-][\w-]*\s*(?:[~|^$*]?=\s*(?:"[^"]*"|'[^']*'|[A-Za-z_-][\w-]*)\s*[iIsS]?)?$/;

function headPartReason(rawPart) {
  // comments LEADING the part are not inside it (and may mention anything)
  const inner = rawPart.replace(/^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*/, "");
  if (inner.includes("#{") || inner.includes("@{")) return "interpolation";
  // an attribute selector is validated against the RAW text, where a quoted value is still a quoted value
  for (const m of inner.matchAll(/\[([^\]]*)\]/g)) if (!ATTRIBUTE_RAW.test(m[1])) return "syntax";
  // a comment INSIDE the part would be replaced by padding that reads as a combinator;
  // quoted attribute values are data
  const unquoted = inner.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
  return unquoted.includes("/*") || unquoted.includes("//") ? "comment" : null;
}

/**
 * The head-written reason of every composed branch. Branch k is part Math.floor(k / parents) crossed with
 * parent k % parents (composeSelectors' order), so a part's reason is replicated across its parent
 * compositions and a parent's across its parts. When the parts cannot be lined up the whole rule is
 * flagged if any part is.
 */
function branchReasons(composed, resolvedHead, rawHead, parentCount, parentReasons) {
  // an empty member (a leading, trailing or repeated comma) makes the whole selector list invalid
  if (resolvedHead.trim().length > 0 && resolvedHead.split(",").some((part, i, all) => part.trim() === "" && all.length > 1)) {
    return composed.map(() => "syntax");
  }
  const ranges = headPartRanges(resolvedHead);
  const partReasons = ranges.map(([a, b]) => headPartReason(rawHead.slice(a, b)));
  if (composed.length === ranges.length * parentCount) {
    return composed.map((_, k) => partReasons[Math.floor(k / parentCount)] ?? parentReasons[k % parentCount] ?? null);
  }
  const any = partReasons.find((r) => r !== null) ?? parentReasons.find((r) => r !== null) ?? null;
  return composed.map(() => any);
}

/** Bounds on the work per rule: a longer composed list, or deeper nesting, is routed to unexaminable. */
const MAX_COMPOSED = 256;
const MAX_DEPTH = 32;
const OVER_CAP = "";
const TOO_DEEP = "";

function composeSelectors(selector, parents, reset = false) {
  const composed = [];
  const parts = splitSelectorList(selector);
  if (parts.length * parents.length > MAX_COMPOSED) return [OVER_CAP];
  for (const part of parts) {
    for (const parent of parents) {
      if (part.includes("&")) composed.push(part.replaceAll("&", parent));
      else composed.push(parent === "" || reset ? part : `${parent} ${part}`);
    }
  }
  return composed;
}

/**
 * True when the ring width a declaration block `@apply`s ends up non-zero.
 *
 * Model, from the Tailwind v3 documentation (https://v3.tailwindcss.com/docs/functions-and-directives):
 * "If you'd like to @apply an existing class and make it !important, simply add !important to the
 * end of the declaration" - so a trailing standalone `!important` makes every utility in that one
 * @apply declaration important, and a per-token `!ring-N` / `ring-N!` makes that token important.
 * An important declaration beats a non-important one regardless of order; among declarations of the
 * same importance the later one wins, as utilities are applied in source order. Tokens are read
 * across every @apply in the block. Only exact width tokens (`ring`, `ring-0|1|2|4|8`) count; a
 * variant-prefixed token (`dark:ring-2`) is ignored, which fails toward reporting.
 */
function appliesRingWidth(body) {
  let important = false;
  let ring = false;
  for (const applied of body.matchAll(/@apply\s+([^;]*)/gi)) {
    const tokens = applied[1].trim().split(/\s+/);
    const declarationImportant = tokens.length > 0 && /^!important$/i.test(tokens[tokens.length - 1]);
    for (const raw of tokens) {
      const tokenImportant = declarationImportant || raw.startsWith("!") || raw.endsWith("!");
      const token = raw.replace(/^!|!$/g, "");
      let nonZero;
      if (token === "ring-0") nonZero = false;
      else if (/^ring(-(1|2|4|8))?$/.test(token)) nonZero = true;
      else continue;
      if (important && !tokenImportant) continue;
      important = tokenImportant;
      ring = nonZero;
    }
  }
  return ring;
}

/* ------------------------------------------------------------------------------------------------
 * focus-visible-removal: the CLOSED LIST of forms the detector decides.
 *
 * The detector decides a small, closed set of forms and routes EVERYTHING else to
 * `detectorsUnexaminable` with a named reason: an unknown is never an exemption and never a pass. It
 * does not model the CSS cascade (importance, specificity, source order, layers, `all`, custom
 * properties, Sass variables, functional selectors). A new form is added to the list only with a
 * decision and a test; it is never modelled in passing. docs/integration-contract.md states the list.
 *
 * DECIDED (one block, plain literal values):
 *   - a style rule whose selector branches are simple selectors (type, class, id, attribute, universal,
 *     combinators) with pseudo-classes from DECIDED_PSEUDO_CLASSES, pseudo-elements from
 *     DECIDED_PSEUDO_ELEMENTS, and `:not(:focus-visible)`;
 *   - the rule removes the outline with exactly one `outline` declaration whose value is `none` or `0`;
 *   - a replacement indicator is a declaration of box-shadow / border / border-color / border-bottom /
 *     background / background-color / text-decoration with a
 *     literal non-disabled value, or an `@apply` of a ring-width utility, in the SAME block;
 *   - `:focus:not(:focus-visible)` is the mouse-only exemption;
 *   - SCSS interpolation whose value is statically readable (`#{none}`, quoted literals), and nesting
 *     whose enclosing rules declare nothing the nested rule could inherit.
 * ---------------------------------------------------------------------------------------------- */

/** Pseudo-classes and pseudo-elements the selector reading decides; any other is off the list. */
const DECIDED_PSEUDO_CLASSES = new Set([
  "focus", "focus-visible", "focus-within", "hover", "active", "visited", "link", "disabled", "enabled",
  "checked", "required", "optional", "invalid", "valid", "read-only", "read-write", "placeholder-shown",
  "first-child", "last-child", "only-child", "first-of-type", "last-of-type", "only-of-type", "empty", "target",
]);
const DECIDED_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter", "placeholder", "selection", "marker"]);

/** Each reason a form is routed to detectorsUnexaminable. The text is part of the contract. */
const UNEXAMINABLE_REASONS = {
  selectorInterpolation: "an interpolation in the selector may make it a focus rule",
  selectorPlaceholder: "a Sass placeholder selector emits nothing unless it is extended, and an @extend may be in another file",
  selectorBound: "the rule is nested deeper, or its composed selector list is longer, than the decided bound (32 levels, 256 selectors)",
  selectorComment: "a comment inside the selector may split or join its compounds",
  selectorSyntax: "a selector the closed list does not positively recognise (malformed or unlisted syntax)",
  selectorEscape: "a CSS escape in the selector may spell a focus pseudo-class",
  selectorFunctional: "a functional or unlisted pseudo-class selector is outside the decided list of selector forms",
  selectorOpaque: "it sits inside an @include / control directive / mixin whose selector semantics are not modelled",
  outlineForm: "the outline is not removed by exactly one plain 'outline: none|0' declaration (several declarations, a longhand, all:, an important or unresolved value are not decided)",
  replacementForm: "a replacement indicator is not a plain literal in this block (an unresolved, calculated, disabled, important or repeated value is not decided)",
  propertyName: "an interpolation or a CSS escape in a property name may be outline or an indicator property",
  declarationForm: "an interpolation outside a property: value declaration",
  opaqueChild: "a control directive, @include, @extend or mixin call in the rule may change its declarations, which are not modelled",
  nested: "a nested rule inherits declarations of an enclosing rule or layer, and the cascade between them is not decided",
  nestedProperty: "a nested property block spells its declarations indirectly",
};

/** A value that is not a plain literal: a custom property, Sass variable, calculation or interpolation. */
const UNRESOLVED_VALUE = /(^|[^\w-])(var|env|calc|min|max|clamp)\(|\$[A-Za-z_-]/i;
const IMPORTANT = /!\s*important\s*$/i;
const DISABLED_LITERAL = /^(none|hidden|0+(\.0*)?[a-z%]*|initial|unset|revert|revert-layer|transparent|inherit)$/i;

/** Declaration properties whose value decides whether a focus indicator exists. */
const FOCUS_RELEVANT_PROPERTY = /^(outline(-[a-z]+)?|box-shadow|border(-[a-z]+)*|background(-[a-z]+)?|text-decoration(-[a-z]+)?|--tw-ring[a-z-]*|ring[a-z-]*|filter|all)$/i;
const REPLACEMENT_FAMILY = (property) => {
  // only the properties that can BE a replacement indicator or disable one: border-radius, background-position,
  // filter, ring variables and the rest are not indicators and do not matter
  const p = property.toLowerCase();
  if (p === "box-shadow") return "box-shadow";
  if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(style|width|color))?$/.test(p)) return "border";
  if (/^background(-(color|image))?$/.test(p)) return "background";
  if (/^text-decoration(-(line|color|style|thickness))?$/.test(p)) return "text-decoration";
  return null;
};
/** The properties that ARE a replacement indicator when their literal value is not disabled (facet longhands only modify one). */
const INDICATOR_PROPERTY =
  /^(box-shadow|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?|background(-color)?|text-decoration(-line)?)$/i;

/** The declarations of a block as {property, value}; the value keeps its `!important`. */
function declarationsOf(body) {
  const out = [];
  for (const raw of body.split(";")) {
    const text = raw.trim();
    if (text === "") continue;
    if (/^@apply\b/i.test(text)) {
      out.push({ property: "@apply", value: text.slice(6).trim(), raw: text });
      continue;
    }
    const colon = text.indexOf(":");
    if (colon === -1) continue;
    out.push({ property: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim(), raw: text });
  }
  return out;
}

/**
 * The mouse-only idiom: the SUBJECT compound holds both the focus pseudo-class and its exclusion
 * `:not(:focus-visible)`, in either order and with other simple selectors between them
 * (`:focus:hover:not(:focus-visible)`). Only plain, listed selectors reach here, so the one parenthesis is that exclusion.
 */
function hidesRingFromMouseOnly(selector) {
  const compounds = selectorCompounds(selector);
  const subject = compounds.length > 0 ? compounds[compounds.length - 1] : selector;
  return /:not\(\s*:focus-visible\s*\)/i.test(subject) && /:focus(?![A-Za-z0-9_-])/i.test(subject.replace(/:not\(\s*:focus-visible\s*\)/gi, ""));
}

/** A Sass placeholder selector: %name inside a compound (50% is a keyframe selector). */
const PLACEHOLDER = /(?<![\d.])%[A-Za-z_-]/;

/** A focus pseudo-class a selector names. `:focus-within` is one: it is matched by the `:focus` prefix. */
const FOCUS_SELECTOR = /:focus(-visible|-within)?(?![A-Za-z0-9_-])/i;

/**
 * True when a selector could be a focus rule: it names focus, or it is a form the closed list does not
 * read (a functional pseudo-class, an interpolation, a placeholder, :host) and so might hide one.
 */
function mayBeFocusRule(selector) {
  return (
    selector.includes(OVER_CAP) ||
    selector.includes(TOO_DEEP) ||
    /focus/i.test(selector) ||
    selector.includes("\\") ||
    selector.includes(UNKNOWN) ||
    PLACEHOLDER.test(selector) ||
    /:(is|where|not|has|matches|host|host-context|nth-[a-z-]+|-webkit-any|-moz-any)\b/i.test(selector) ||
    /\(/.test(selector)
  );
}

/** Why a selector branch is outside the closed list, or null when it is a decided form. */
/**
 * The decided selector syntax, positively recognised: compounds of an optional type or universal selector and
 * any number of #id, .class, [attribute], :pseudo-class and ::pseudo-element parts, joined by a descendant,
 * child, next-sibling or subsequent-sibling combinator (a leading one is allowed: a nested rule). A selector
 * that does not match (`:focus..x`, `a >> b`, a trailing combinator) is not valid CSS or is not recognised.
 */
const WELL_FORMED_SELECTOR = (() => {
  const ident = "-?[A-Za-z_][\\w-]*";
  const simple = "(?:#" + ident + "|\\." + ident + "|\\[[^\\]]*\\]|::?" + ident + "(?:\\([^()]*\\))?)";
  const compound = "(?:(?:\\*|" + ident + ")" + simple + "*|" + simple + "+)";
  const combinator = "(?:\\s*[>+~]\\s*|\\s+)";
  return new RegExp("^\\s*" + compound + "(?:" + combinator + compound + ")*\\s*$");
})();
// the structure view blanks a quoted value (quotes included) to two or more spaces, so a value is an identifier
// or a blanked string; `[foo=]` has neither
const ATTRIBUTE = /^\s*[A-Za-z_-][\w-]*\s*(?:[~|^$*]?=\s*(?: {2,}|[A-Za-z_-][\w-]*)\s*(?:[iIsS])?)?$/;

function offListSelector(selector) {
  if (selector.includes(OVER_CAP) || selector.includes(TOO_DEEP)) return UNEXAMINABLE_REASONS.selectorBound;
  if (selector.includes(UNKNOWN)) return UNEXAMINABLE_REASONS.selectorInterpolation;
  if (selector.includes("\\")) return UNEXAMINABLE_REASONS.selectorEscape;
  if (PLACEHOLDER.test(selector)) return UNEXAMINABLE_REASONS.selectorPlaceholder;
  const rest = selector
    .replace(/\[[^\]]*\]/g, "")
    .replace(/:not\(\s*:focus-visible\s*\)/gi, "");
  if (/[()&]/.test(rest)) return UNEXAMINABLE_REASONS.selectorFunctional;
  for (const m of rest.matchAll(/(::?)([A-Za-z-]+)/g)) {
    const name = m[2].toLowerCase();
    const legacy = ["before", "after", "first-line", "first-letter"].includes(name);
    if (m[1] === "::" ? !DECIDED_PSEUDO_ELEMENTS.has(name) : !DECIDED_PSEUDO_CLASSES.has(name) && !legacy) {
      return UNEXAMINABLE_REASONS.selectorFunctional;
    }
  }
  // a pseudo-element cannot be the left side of a combinator: only the last compound may hold one
  const compounds = selectorCompounds(selector);
  for (const compound of compounds.slice(0, -1)) {
    if (/::|:(before|after|first-line|first-letter)(?![A-Za-z-])/i.test(compound)) return UNEXAMINABLE_REASONS.selectorSyntax;
  }
  // the remaining syntax must be positively recognised, attribute selectors included
  for (const m of selector.matchAll(/\[([^\]]*)\]/g)) if (!ATTRIBUTE.test(m[1])) return UNEXAMINABLE_REASONS.selectorSyntax;
  if (!WELL_FORMED_SELECTOR.test(selector)) return UNEXAMINABLE_REASONS.selectorSyntax;
  return null;
}

/**
 * True when a plain, listed selector selects FOCUSED elements. Only called on selectors that passed
 * offListSelector, so the only parenthesis is `:not(:focus-visible)`, which selects none of the focus
 * pseudo-classes it names.
 */
function isFocusSelector(selector) {
  // the focus pseudo-class must be on the SUBJECT (the last compound): `.btn:focus .icon` styles the icon
  const compounds = selectorCompounds(selector);
  const subject = compounds.length > 0 ? compounds[compounds.length - 1] : selector;
  // a pseudo-element subject (`:focus::before`) is not the focused element: its outline starts as none
  if (/::|:(before|after|first-line|first-letter)(?![A-Za-z-])/i.test(subject)) return false;
  return FOCUS_SELECTOR.test(subject.replace(/:not\(\s*:focus-visible\s*\)/gi, ""));
}

/** Compound selectors of a selector: split on combinators and commas outside parentheses. */
function selectorCompounds(selector) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s>+~,]/.test(ch)) {
      if (current) out.push(current);
      current = "";
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

/**
 * The outline form of a block: { removes } when exactly one plain 'outline: none|0' decides, or
 * { reason } when the outline is touched in a way the closed list does not decide.
 */
function outlineForm(declarations) {
  const touching = declarations.filter((d) => /^(outline|outline-style|outline-width|all)$/i.test(d.property));
  if (touching.length === 0) return { removes: false };
  const only = touching[0];
  const reason = UNEXAMINABLE_REASONS.outlineForm;
  if (touching.length !== 1 || only.property.toLowerCase() !== "outline") return { reason };
  if (/^(none|0)$/i.test(only.value)) return { removes: true };
  return restoresOutline(only.value) ? { removes: false } : { reason };
}

/**
 * A colour token that is positively opaque: a 3- or 6-digit hex, a three-component rgb()/hsl() (no alpha), a
 * colour name other than transparent/currentcolor/the keywords, or a var()/env() in the colour place. A
 * 4- or 8-digit hex, rgba()/hsla(), color-mix(), a gradient or a url() can paint nothing and is not decided.
 */
/** rgb() and hsl() in their actual grammars: every separator a comma (legacy) or every one a space (modern). */
const COLOUR_FUNCTION = (() => {
  const num = "(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
  const pct = num + "%";
  const channel = "(?:" + num + "|" + pct + ")";
  const hue = num + "(?:deg)?";
  const forms = [
    "rgb\\(\\s*" + num + "\\s*,\\s*" + num + "\\s*,\\s*" + num + "\\s*\\)",
    "rgb\\(\\s*" + pct + "\\s*,\\s*" + pct + "\\s*,\\s*" + pct + "\\s*\\)",
    "rgb\\(\\s*" + channel + "\\s+" + channel + "\\s+" + channel + "\\s*\\)",
    "hsl\\(\\s*" + hue + "\\s*,\\s*" + pct + "\\s*,\\s*" + pct + "\\s*\\)",
    "hsl\\(\\s*" + hue + "\\s+" + pct + "\\s+" + pct + "\\s*\\)",
  ];
  return new RegExp("^(?:" + forms.join("|") + ")$", "i");
})();

const NAMED_COLOURS = new Set("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" "));

function opaqueColour(token) {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token)) return true;
  // rgb()/hsl() in their actual grammars: all commas (legacy) or all spaces (modern), never mixed
  if (COLOUR_FUNCTION.test(token)) return true;
  if (/^(?:var|env)\(.*\)$/i.test(token)) return true;
  // the finite CSS named-colour set: an unknown identifier makes the declaration invalid, so it paints nothing
  return NAMED_COLOURS.has(token.toLowerCase());
}

/**
 * An indicator value read against the GRAMMAR of its property, and decided only when it can be shown to paint:
 *   box-shadow        comma layers of lengths, `inset` and one opaque colour
 *   background(-color) one opaque colour (no image, no other part)
 *   text-decoration   at least one line keyword (underline, overline, line-through), plus style keywords,
 *                     a length and an opaque colour
 *   text-decoration-line  one or more line keywords
 * Anything else - a gradient, url(), rgba(), a 4/8-digit hex, transparent, an unknown identifier, a keyword the
 * property does not accept - is not decided.
 */
function positiveIndicatorValue(property, value) {
  const p = property.toLowerCase();
  const length = (t) => /^[+-]?(?:0+\.?0*|\.0+|(?:\d+\.?\d*|\.\d+)(?:px|em|rem|ex|ch|vw|vh|pt|pc|cm|mm|in))$/i.test(t);
  const tokensOf = (text) => text.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
  const line = /^(underline|overline|line-through)$/i;
  if (p === "box-shadow") {
    // a layer is two to four contiguous lengths (offsets, blur, spread), at most one inset and one colour
    return splitLayers(value).every((layer) => {
      const tokens = tokensOf(layer);
      if (tokens.length === 0) return false; // an empty layer
      const lengths = tokens.map((t, i) => (length(t) ? i : -1)).filter((i) => i >= 0);
      const insets = tokens.filter((t) => /^inset$/i.test(t)).length;
      const colours = tokens.filter((t) => opaqueColour(t)).length;
      const contiguous = lengths.length > 0 && lengths[lengths.length - 1] - lengths[0] === lengths.length - 1;
      // the third length is the blur radius, which must not be negative
      const blur = lengths.length >= 3 ? tokens[lengths[2]] : "0";
      // an outer shadow with every length zero (or a non-positive spread and no offset or blur) has no area
      const [x, y, radius, spread] = [0, 1, 2, 3].map((k) => (k < lengths.length ? parseFloat(tokens[lengths[k]]) : 0));
      if (!(x !== 0 || y !== 0 || radius > 0 || spread > 0)) return false;
      // a negative spread contracts the shadow by an amount that depends on the (unknown) box: not decided
      if (spread < 0) return false;
      return contiguous && lengths.length >= 2 && lengths.length <= 4 && !blur.startsWith("-") && insets <= 1 && colours === 1 &&
        lengths.length + insets + colours === tokens.length;
    });
  }
  const tokens = tokensOf(value);
  if (p === "background" || p === "background-color") {
    return tokens.length === 1 && opaqueColour(tokens[0]) && splitLayers(value).length === 1;
  }
  // each line keyword at most once; a decoration has at most one style, one thickness and one colour
  const lines = tokens.filter((t) => line.test(t)).map((t) => t.toLowerCase());
  const uniqueLines = new Set(lines).size === lines.length;
  // a decoration's colour defaults to currentcolor, which cannot be shown to paint: text-decoration-line alone is off the list
  if (p === "text-decoration-line") return false;
  if (p === "text-decoration") {
    const styles = tokens.filter((t) => /^(solid|double|dotted|dashed|wavy)$/i.test(t)).length;
    const lengths = tokens.filter((t) => length(t) && parseFloat(t) > 0).length;
    const colours = tokens.filter((t) => opaqueColour(t)).length;
    return lines.length > 0 && uniqueLines && styles <= 1 && lengths <= 1 && colours === 1 &&
      lines.length + styles + lengths + colours === tokens.length;
  }
  return false;
}

/** A value split on top-level commas, EMPTY members kept (a trailing comma makes the declaration invalid). */
function splitLayers(value) {
  const layers = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      layers.push(current);
      current = "";
    } else current += ch;
  }
  layers.push(current);
  return layers;
}

/**
 * The decided restoring form: a non-zero literal width, a style other than none/hidden and at most one
 * more token (the colour, which may be a var() custom property: the style and the width decide).
 */
function restoresOutline(value, allowAuto = true) {
  const split = value.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
  const style = split.find((t) => (allowAuto ? /^(dotted|dashed|solid|double|groove|ridge|inset|outset|auto)$/i : /^(dotted|dashed|solid|double|groove|ridge|inset|outset)$/i).test(t));
  const width = split.find((t) => /^(\d+\.?\d*|\.\d+)(px|em|rem)$/i.test(t) && parseFloat(t) > 0);
  if (style === undefined || width === undefined) return false;
  const rest = split.filter((t, i) => i !== split.indexOf(style) && i !== split.indexOf(width));
  if (rest.length > 1) return false;
  // the colour is mandatory: an omitted one is currentcolor, which cannot be shown to paint
  if (rest.length === 0) return false;
  // the one more token must be a colour: a hex, a function (rgb(), var()), or a colour name - not a
  // number, a style or width keyword, or a CSS-wide value, which would make the shorthand invalid
  const c = rest[0];
  return opaqueColour(c);
}

/** Why a block's replacement declarations are outside the closed list, or null. */
function replacementReason(declarations) {
  for (const d of declarations) {
    if (d.property === "@apply") {
      // an @apply list is read for exact ring tokens only; an unresolved token may be one
      if (d.raw.includes(UNKNOWN) || UNRESOLVED_VALUE.test(d.raw)) return UNEXAMINABLE_REASONS.replacementForm;
      continue;
    }
    const family = REPLACEMENT_FAMILY(d.property);
    if (family === null) continue; // the outline form is read by outlineForm; other properties do not matter
    if (UNRESOLVED_VALUE.test(d.value) || d.value.includes(UNKNOWN) || IMPORTANT.test(d.value)) {
      return UNEXAMINABLE_REASONS.replacementForm;
    }
    // a comma list is read layer by layer for box-shadow (every layer must be a literal, non-disabled
    // shadow) and is off the list for every other indicator property (background layers, ...)
    const layers = splitLayers(d.value);
    if (layers.length > 1) {
      if (family !== "box-shadow" || layers.some((layer) => DISABLED_LITERAL.test(layer.trim()))) {
        return UNEXAMINABLE_REASONS.replacementForm;
      }
    }
    // a value that cannot be shown to paint (a gradient, url(), rgba(), transparent, an 8-digit hex) is off the list;
    // the border shorthand has its own, stricter reading below
    if (!/^border/i.test(d.property) && !positiveIndicatorValue(d.property, d.value)) return UNEXAMINABLE_REASONS.replacementForm;
    const bare = d.value.trim();
    // a border shorthand draws only with a drawn style and a non-zero literal width; an omitted style is none
    if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/i.test(d.property) && !restoresOutline(bare, false)) {
      return UNEXAMINABLE_REASONS.replacementForm;
    }
    // a border or text-decoration shorthand is disabled by ANY disabled token (0 solid red, 2px solid transparent)
    const anyToken = family === "border" || family === "text-decoration";
    if (anyToken ? bare.split(/\s+/).some((t) => DISABLED_LITERAL.test(t)) : DISABLED_LITERAL.test(bare)) {
      return UNEXAMINABLE_REASONS.replacementForm;
    }
  }
  return null;
}

/**
 * A blockless call in a block's own text - Sass @include or @extend, a Less mixin call (`.ring();`, `.m(@a: 1);`) -
 * may emit or inherit declarations that are not modelled, so the block is not decided. Anything without a
 * property: value shape counts (a declaration always has a colon).
 */
function hasBlocklessCall(body) {
  for (const raw of body.split(";")) {
    const text = raw.trim();
    if (text === "" || /^@apply\b/i.test(text)) continue;
    if (/^@(include|extend)\b/i.test(text)) return true;
    if (/^[.#][\w-]+\s*(\(|$)/.test(text)) return true;
    if (!text.includes(":")) return true;
  }
  return false;
}

/** Does a block declare anything a nested rule could inherit or be overridden by? */
function declaresStyle(declarations) {
  return declarations.some(
    (d) => /^\s*@apply\b/i.test(d.raw) || FOCUS_RELEVANT_PROPERTY.test(d.property) || d.property.includes(UNKNOWN),
  );
}

/** Why a nested rule is outside the closed list (inherited declarations, a layer), or null. */
function nestingReason(node) {
  // `@at-root :focus { }` emits its selector at the root: it is itself the boundary, nothing above is inherited
  if (node.atRule === "at-root" && /^\s*@at-root\s*[^(\s]/i.test(node.selector)) return null;
  for (let ancestor = node.parent, k = 0; ancestor && k <= MAX_DEPTH; ancestor = ancestor.parent, k++) {
    // an @at-root that drops style rules emits what is inside at the root: nothing above it is inherited
    if (ancestor.atRule === "at-root" && ancestor.ctx.reset) break;
    if (ancestor.atRule === "layer") return UNEXAMINABLE_REASONS.nested;
    if (ancestor.dataBlock || ancestor.propNest !== null || ancestor.rootEmitted) continue;
    if (declaresStyle(declarationsOf(ancestor.body))) return UNEXAMINABLE_REASONS.nested;
  }
  if (node.atRule === "layer") return UNEXAMINABLE_REASONS.nested;
  return null;
}

export const DETECTORS = [
  {
    /**
     * VIEW: structureOf — an `<img>` is structure, and its `alt` attribute is part of that
     * structure. Comments are stripped, so an example in a comment is a mention and not an
     * instance. In .jsx/.tsx the attribute values survive the split by design (see BLANKS_STRINGS).
     *
     * Lowercase `<img` only: `<Img>` is a component, and what it renders is not knowable here.
     * Elements carrying a spread are skipped — `{...props}` may supply `alt`, and reporting a
     * violation that the props object refutes is the false positive this family has already shipped.
     */
    id: "img-alt",
    rule: "accessibility.img-alt-text",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;
      for (const match of text.matchAll(/<img\b[^>]*>/g)) {
        examined = true;
        const tag = match[0];
        if (/\{\s*\.\.\./.test(tag)) continue;
        if (/\balt\s*=/.test(tag)) continue;
        findings.push(
          FINDING(this.rule, file, match.index, `an <img> element carries no alt attribute`, {
            detector: this.id,
          }),
        );
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — tabindex is an attribute, and its value decides the finding.
     *
     * Both spellings, because both ship: `tabindex="1"` in markup and `tabIndex={1}` in JSX. Zero
     * and negative values are legitimate and are not reported.
     */
    id: "positive-tabindex",
    rule: "accessibility.positive-tabindex",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;
      const patterns = [/\btabindex\s*=\s*["']\s*(-?\d+)\s*["']/gi, /\btabIndex\s*=\s*\{\s*(-?\d+)\s*\}/g];
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          examined = true;
          if (Number(match[1]) > 0) {
            findings.push(
              FINDING(this.rule, file, match.index, `tabindex="${match[1]}" overrides document tab order`, {
                severity: "warning",
                detector: this.id,
              }),
            );
          }
        }
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — label association is expressed entirely in markup.
     *
     * .html, .vue, and .svelte only. JSX is a recorded limitation rather than a silent gap: with
     * `htmlFor` and component wrappers, whether a control is labelled is frequently decided in a
     * different file, and a per-file answer would be confidently wrong.
     */
    id: "form-control-label",
    rule: "forms.control-label",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => [".html", ".htm", ".vue", ".svelte"].includes(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;

      const labelFor = new Set();
      for (const match of text.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)) {
        labelFor.add(match[1]);
      }
      const labelRanges = [...text.matchAll(/<label\b[\s\S]*?<\/label>/gi)].map((m) => [
        m.index,
        m.index + m[0].length,
      ]);

      for (const match of text.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
        const tag = match[0];
        const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
        examined = true;
        if (/\baria-label(ledby)?\s*=/i.test(tag) || /\btitle\s*=/i.test(tag)) continue;
        const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
        if (id && labelFor.has(id)) continue;
        if (labelRanges.some(([from, to]) => match.index > from && match.index < to)) continue;
        findings.push(
          FINDING(this.rule, file, match.index, `the <${match[1].toLowerCase()}> control has no associated label`, {
            detector: this.id,
          }),
        );
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — the presence of a `type` attribute is the whole subject.
     *
     * Inside a form, a `<button>` with no type is a submit button whether or not that was intended,
     * and the default is where the accidental submissions come from. Outside a form the default is
     * harmless, so the search is scoped to form elements.
     */
    id: "button-type-in-form",
    rule: "forms.button-type",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;
      for (const form of text.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
        for (const button of form[0].matchAll(/<button\b[^>]*>/gi)) {
          examined = true;
          if (/\btype\s*=/i.test(button[0])) continue;
          findings.push(
            FINDING(
              this.rule,
              file,
              form.index + button.index,
              `a <button> inside a <form> declares no type, so it defaults to submit`,
              { severity: "warning", detector: this.id },
            ),
          );
        }
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — heading levels are structure.
     *
     * Complete HTML documents only. A fragment or a component legitimately begins at h2 because its
     * h1 lives in the page that composes it; reporting that as a skipped level would fire on correct
     * markup, and a finding an adopter learns to ignore is worse than no finding.
     */
    id: "heading-level-skip",
    rule: "accessibility.heading-structure",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => [".html", ".htm"].includes(file.ext) && /<html\b/i.test(file.views.structureOf),
    examine(file) {
      const text = file.views.structureOf;
      const headings = [...text.matchAll(/<h([1-6])\b/gi)];
      if (headings.length < 2) return { examined: false, findings: [] };
      const findings = [];
      let previous = Number(headings[0][1]);
      for (const heading of headings.slice(1)) {
        const level = Number(heading[1]);
        if (level > previous + 1) {
          findings.push(
            FINDING(
              this.rule,
              file,
              heading.index,
              `heading level jumps from h${previous} to h${level}, skipping a level`,
              { severity: "warning", detector: this.id },
            ),
          );
        }
        previous = level;
      }
      return { examined: true, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — a role name and an aria-* value are attribute values, and the value is
     * the finding.
     *
     * Two instances of one rule: a `role` that is not a role, and an interactive element hidden from
     * assistive technology while remaining operable. The second belongs HERE rather than to
     * `accessibility.not-deliberately-disabled`, and the boundary was settled in the freeze: intent
     * is not inferable from markup, so `aria-hidden` on a button is invalid ARIA usage rather than a
     * proven deliberate disabling. One finding, one identity.
     *
     * `role={expression}` is skipped: the value is computed, and this cannot read it.
     */
    id: "aria-validity",
    rule: "accessibility.aria-valid-usage",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;

      for (const match of text.matchAll(/\brole\s*=\s*["']([^"']*)["']/gi)) {
        examined = true;
        for (const token of match[1].trim().split(/\s+/).filter(Boolean)) {
          if (ARIA_ROLES.has(token)) continue;
          findings.push(
            FINDING(this.rule, file, match.index, `role="${token}" is not an ARIA role`, {
              detector: this.id,
            }),
          );
        }
      }

      const interactive = new RegExp(
        `<(${INTERACTIVE_ELEMENTS.join("|")})\\b[^>]*\\baria-hidden\\s*=\\s*["']true["'][^>]*>`,
        "gi",
      );
      for (const match of text.matchAll(interactive)) {
        examined = true;
        findings.push(
          FINDING(
            this.rule,
            file,
            match.index,
            `<${match[1].toLowerCase()}> is hidden from assistive technology with aria-hidden="true" while remaining operable`,
            { detector: this.id },
          ),
        );
      }

      if (!examined && /\baria-[a-z]+\s*=/i.test(text)) examined = true;
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — the viewport declaration is a meta element's content attribute.
     *
     * Bound to a FORBIDDEN rule, so the patterns here are the ones whose only effect is to switch a
     * platform affordance off: `user-scalable=no` and a maximum-scale below 2 both prevent zoom.
     * That is a deliberate disabling, which is why it belongs to `not-deliberately-disabled` and the
     * generic ARIA misuse above does not.
     */
    id: "viewport-accessibility-disabling",
    rule: "accessibility.not-deliberately-disabled",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;
      for (const match of text.matchAll(/<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/gi)) {
        examined = true;
        const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(match[0])?.[1] ?? "";
        if (/user-scalable\s*=\s*(no|0)\b/i.test(content)) {
          findings.push(
            FINDING(this.rule, file, match.index, `the viewport meta sets user-scalable=no, disabling zoom`, {
              detector: this.id,
            }),
          );
        }
        const maximum = /maximum-scale\s*=\s*([\d.]+)/i.exec(content)?.[1];
        if (maximum !== undefined && Number(maximum) < 2) {
          findings.push(
            FINDING(
              this.rule,
              file,
              match.index,
              `the viewport meta sets maximum-scale=${maximum}, which caps zoom below the 2× platform minimum`,
              { detector: this.id },
            ),
          );
        }
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — a handler is an attribute, and the attributes present on the element are
     * the entire finding. Handler bodies are irrelevant and JSX expression values are never read.
     *
     * The subject is a control built out of an element that is not one. The prohibition is not "a
     * div was clicked": it is that replacing a native control removed semantics and nothing put them
     * back, so the finding needs a click handler present AND role, tabindex, and any key handler all
     * absent. Any one of the three means someone was restoring semantics and this stops — whether
     * they restored them correctly is a browser and human question. Hence INFERRED, and hence a
     * spread (`{...props}`) is skipped: its attributes are not knowable, and guessing produces the
     * false positive that gets a detector switched off. See ADR 0014.
     */
    id: "custom-control-semantics",
    rule: "accessibility.no-inaccessible-custom-controls",
    view: "structureOf",
    label: "INFERRED",
    applies: (file) => MARKUP_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;

      for (const match of text.matchAll(/<(div|span|li|td|p|section|i)\b([^>]*)>/gi)) {
        const attributes = match[2];
        if (!CLICK_HANDLER.test(attributes)) continue;
        if (/\{\s*\.\.\./.test(attributes)) continue; // a spread may carry the semantics
        examined = true;
        if (/\brole\s*=/i.test(attributes)) continue;
        if (/\btabindex\s*=/i.test(attributes)) continue;
        if (KEY_HANDLER.test(attributes)) continue;
        findings.push(
          FINDING(
            this.rule,
            file,
            match.index,
            `<${match[1].toLowerCase()}> is operated by a click handler but declares no role, is not focusable, and handles no key — the semantics of the control it replaces were not restored`,
            { label: "INFERRED", detector: this.id },
          ),
        );
      }
      return { examined, findings };
    },
  },

  {
    /**
     * VIEW: structureOf — a declaration block is structure; `content: "…"` strings are blanked in
     * CSS and cannot be mistaken for one.
     *
     * Fires only where a focus rule removes the outline AND puts nothing in its place. Two
     * whitelists, both for correct code that a naive matcher would report:
     *
     *   `:focus:not(:focus-visible)` — the idiom for hiding the ring from mouse users only.
     *   a compensating declaration in the same block — a box-shadow ring is a focus indicator.
     *   an `@apply` of a ring-width utility (`ring`, `ring-1|2|4|8`) in the same block — Tailwind
     *   compiles it to a box-shadow ring. Only the exact, unprefixed ring-width tokens count; ring
     *   colour/offset/inset/`ring-0` supply no indicator, and no other utility is interpreted.
     */
    id: "focus-visible-removal",
    rule: "accessibility.no-removed-focus-indicators",
    view: "structureOf",
    label: "OBSERVED",
    applies: (file) => STYLE_EXTENSIONS.has(file.ext),
    examine(file) {
      const text = file.views.structureOf;
      const findings = [];
      let examined = false;
      const unexaminable = [];

      // SCSS interpolation contains braces, which would split a block. Resolve it on a copy of the
      // same length: statically readable spans are substituted (#{none} reads as none) and unknowable
      // ones become UNKNOWN. Every style rule is then read under its COMPOSED selector against the
      // closed list of decided forms above; whatever is off the list is recorded, never decided.
      const resolved = resolveInterpolation(text, file.views.sourceOf, file.text);
      const nodes = parseBlocks(resolved, file.text);
      // A control directive or @include inside a rule may change its declarations, and parseBlocks has
      // blanked it from the rule's own body: every rule that encloses one is not decided as a whole.
      const enclosesOpaque = new Set();
      for (const n of nodes) {
        if (n.opaque && !(n.parent && n.parent.opaque)) {
          for (let a = n.parent, k = 0; a && k <= MAX_DEPTH; a = a.parent, k++) enclosesOpaque.add(a);
        }
      }
      for (const node of nodes) {
        if (node.rootEmitted || node.inside || node.dataBlock) continue;
        // the line anchor (ST-05): the first non-whitespace character of the rule head
        const where = node.selectorStart + Math.max(0, node.selector.search(/\S/));
        const note = (reason) => unexaminable.push({ index: where, reason });
        const declarations = declarationsOf(node.body);
        const outline = outlineForm(declarations);
        if (node.propNest !== null) {
          // `outline: { style: none }` spells outline-style: none; the declarations are not flat
          const relevant = FOCUS_RELEVANT_PROPERTY.test(node.propNest) || node.propNest.includes(UNKNOWN);
          if (relevant && node.composed.some((selector) => mayBeFocusRule(selector))) note(UNEXAMINABLE_REASONS.nestedProperty);
          continue;
        }
        const focusish = node.composed.filter((selector) => mayBeFocusRule(selector));
        if (node.opaque) {
          if (node.atRule === null ? focusish.length > 0 || outline.removes || outline.reason : outline.removes || outline.reason) {
            note(UNEXAMINABLE_REASONS.selectorOpaque);
          }
          continue;
        }
        if (focusish.length === 0) continue; // cannot be a focus rule
        // an interpolation in a property name, or outside a property: value declaration, may be an outline
        // (a CSS escape can spell a property name too: out\6c ine is outline)
        const shapes = node.body
          .split(";")
          .filter((raw) => !/^\s*@apply\b/i.test(raw) && (raw.includes(UNKNOWN) || raw.slice(0, Math.max(0, raw.indexOf(":"))).includes("\\")));
        const badShape = shapes.find(
          (raw) => raw.indexOf(":") === -1 || /[\\]/.test(raw.slice(0, raw.indexOf(":"))),
        );
        if (badShape !== undefined) {
          note(badShape.indexOf(":") === -1 ? UNEXAMINABLE_REASONS.declarationForm : UNEXAMINABLE_REASONS.propertyName);
          continue;
        }
        // An interpolation in a selector head is off the list even when its value is readable (resolving it at
        // the span's length pads it with spaces that would read as a combinator), and so is a comment inside
        // one (the structure view pads that too). The reason is tracked per composed branch (node.reasons), so
        // a decided branch still decides beside an off-list one.
        const reasonOf = (b, k) => {
          if (node.reasons[k] === "syntax") return UNEXAMINABLE_REASONS.selectorSyntax;
          if (node.reasons[k] === "comment") return UNEXAMINABLE_REASONS.selectorComment;
          if (node.reasons[k] === "interpolation") return UNEXAMINABLE_REASONS.selectorInterpolation;
          return offListSelector(b);
        };
        const focusBranches = node.composed
          .map((selector, k) => ({ selector, reason: reasonOf(selector, k) }))
          .filter((b) => mayBeFocusRule(b.selector));
        const offList = focusBranches.map((b) => b.reason).filter((reason) => reason !== null);
        const plainFocus = focusBranches
          .filter((b) => b.reason === null && isFocusSelector(b.selector))
          .map((b) => b.selector);
        // a selector whose subject is not focused and that has no off-list branch is not a focus rule at all:
        // nothing about its declarations can matter
        if (plainFocus.length === 0 && offList.length === 0) continue;
        // a blockless @include/@extend/Less mixin call may supply or remove anything: the block is not decided
        if (hasBlocklessCall(node.body)) {
          note(UNEXAMINABLE_REASONS.opaqueChild);
          continue;
        }
        if (outline.reason !== undefined) {
          note(outline.reason);
          continue;
        }
        if (!outline.removes) {
          if (plainFocus.length > 0) examined = true; // a focus rule that does not remove the outline
          continue;
        }
        // the rule removes the outline with one plain declaration. Off-list branches are recorded but
        // do not discard what the decided branches establish.
        if (offList.length > 0) note(offList[0]);
        if (plainFocus.length === 0) continue;
        if (enclosesOpaque.has(node)) {
          note(UNEXAMINABLE_REASONS.opaqueChild);
          continue;
        }
        const nested = nestingReason(node);
        if (nested !== null) {
          note(nested);
          continue;
        }
        const replacement = replacementReason(declarations);
        if (replacement !== null) {
          note(replacement);
          continue;
        }
        examined = true;
        if (plainFocus.every((selector) => hidesRingFromMouseOnly(selector))) continue;
        if (declarations.some((d) => INDICATOR_PROPERTY.test(d.property))) continue;
        if (appliesRingWidth(node.body)) continue;
        const own = text.slice(node.selectorStart, node.selectorStart + node.selector.length).trim();
        const spelled = node.parent ? "(nested) " + own : own;
        findings.push(
          FINDING(
            this.rule,
            file,
            where,
            `'${spelled}' removes the focus outline and declares no replacement indicator`,
            { detector: this.id },
          ),
        );
      }
      return {
        examined,
        findings,
        unexaminable: unexaminable.map((u) => ({
          evidence: `${file.path}:${lineOf(file.text, u.index)}`,
          reason: u.reason,
        })),
      };
    },
  },

  {
    /**
     * VIEW: structureOf — a hex literal in a declaration is structure, and CSS strings are blanked,
     * so a colour named inside `content: "#fff"` is not counted.
     *
     * CONDITIONAL: it fires only where a token system was detected, because "use the tokens" is
     * meaningless in a project that has none. Where none is detected the rule is not-evaluated, and
     * the reason is recorded — never passed.
     *
     * Threshold, warning severity, and per-file aggregation are all deliberate. The source prompt is
     * explicit that this framework does not police pixels, and one literal in a file is a detail
     * while a file full of them is drift. Declarations of custom properties are excluded: defining
     * `--color-brand: #336699` is how a token system is authored, not a departure from one.
     */
    id: "token-drift",
    rule: "design-system.tokens-used",
    view: "structureOf",
    label: "INFERRED",
    conditional: "no design-token system was detected",
    applies: (file, context) => STYLE_EXTENSIONS.has(file.ext) && context.tokenSystem.detected,
    examine(file) {
      const text = file.views.structureOf;
      const literals = [];
      for (const declaration of text.matchAll(/([\w-]+)\s*:\s*([^;{}]*)/g)) {
        if (declaration[1].startsWith("--")) continue;
        for (const colour of declaration[2].matchAll(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/gi)) {
          literals.push(declaration.index + colour.index);
        }
      }
      if (literals.length < 3) return { examined: true, findings: [] };
      return {
        examined: true,
        findings: [
          FINDING(
            this.rule,
            file,
            literals[0],
            `${literals.length} literal colour values sit alongside a declared token system`,
            { severity: "warning", label: "INFERRED", detector: this.id },
          ),
        ],
      };
    },
  },

  {
    /**
     * VIEW: structureOf — `@keyframes` and `@media` are structure.
     *
     * PROJECT-WIDE, not per file: the guard may legitimately live in a different stylesheet from the
     * animation it guards, so a per-file answer would report every project that organizes its CSS.
     *
     * CONDITIONAL: a project with no animation has nothing to guard. That is not-evaluated with a
     * recorded reason, not a pass — "there was no subject" and "the subject was correct" are
     * different facts, and only one of them is evidence.
     */
    id: "reduced-motion-guard",
    rule: "motion.reduced-motion-support",
    view: "structureOf",
    label: "OBSERVED",
    conditional: "the project declares no @keyframes animation",
    project: true,
    examineProject(files) {
      const styles = files.filter((file) => STYLE_EXTENSIONS.has(file.ext));
      const animating = styles.filter((file) => /@keyframes\b/i.test(file.views.structureOf));
      if (animating.length === 0) return { examined: false, findings: [] };
      const guarded = styles.some((file) => /prefers-reduced-motion/i.test(file.views.structureOf));
      if (guarded) return { examined: true, findings: [] };
      const file = animating[0];
      return {
        examined: true,
        findings: [
          FINDING(
            this.rule,
            file,
            file.views.structureOf.search(/@keyframes\b/i),
            `the project declares @keyframes animations and no prefers-reduced-motion query anywhere`,
            { detector: this.id },
          ),
        ],
      };
    },
  },

  {
    /**
     * VIEW: sourceOf — placeholder copy lives INSIDE string literals, which is exactly what
     * structureOf blanks. This is the one detector for which the blanked view would see nothing.
     *
     * Comments are still stripped, so `// TODO: replace the lorem ipsum` is a mention. Markdown and
     * other prose files are outside the extension set entirely: a document discussing placeholder
     * text is a discussion, and only shipped code can ship placeholder data.
     */
    id: "placeholder-content",
    rule: "design-integrity.no-fabricated-data",
    view: "sourceOf",
    label: "INFERRED",
    applies: (file) => file.ext !== ".css" && file.ext !== ".scss" && file.ext !== ".less",
    examine(file) {
      const text = file.views.sourceOf;
      const findings = [];
      for (const match of text.matchAll(/lorem ipsum|dolor sit amet|consectetur adipiscing/gi)) {
        findings.push(
          FINDING(this.rule, file, match.index, `placeholder copy ('${match[0]}') appears in shipped source`, {
            label: "INFERRED",
            detector: this.id,
          }),
        );
      }
      // The subject is authored product text, which every scanned file carries. Unlike the
      // conditional detectors there is no "this project has no strings" state to report.
      return { examined: true, findings };
    },
  },

  {
    /**
     * VIEW: none — this detector reads file paths, not file contents.
     *
     * AUDIT ONLY, and INFERRED. Two components with similar names may be a duplicated pattern or two
     * genuinely different things; the difference is a judgement a human makes. It is surfaced for
     * that human and never gates `validate`, which is why its rule id is absent from the evaluated
     * set on a validate run.
     */
    id: "duplicate-component-signals",
    rule: "interaction.duplicate-component-signals",
    view: "paths",
    label: "INFERRED",
    auditOnly: true,
    project: true,
    examineProject(files) {
      const components = files.filter((file) => MARKUP_EXTENSIONS.has(file.ext));
      if (components.length === 0) return { examined: false, findings: [] };
      const groups = new Map();
      for (const file of components) {
        const base = path
          .basename(file.path, file.ext)
          .toLowerCase()
          .replace(/[-_. ]?(v\d+|copy|new|old|\d+)$/g, "");
        if (base.length < 3) continue;
        if (!groups.has(base)) groups.set(base, []);
        groups.get(base).push(file.path);
      }
      const findings = [];
      for (const [base, paths] of groups) {
        if (paths.length < 2) continue;
        findings.push({
          id: "duplicate-component-signals",
          rule: "interaction.duplicate-component-signals",
          category: "interaction",
          severity: "info",
          label: "INFERRED",
          evidence: paths,
          message: `${paths.length} files share the component name '${base}' — possibly one pattern implemented more than once`,
          standardRef: null,
        });
      }
      return { examined: true, findings };
    },
  },
];

/** The rule ids the static layer is capable of establishing at all. */
export const DETECTOR_RULES = DETECTORS.map((detector) => detector.rule);

/**
 * Detect a design-token system, which the token-drift detector is conditional on.
 *
 * Three independent signals, any one of which is enough: CSS custom properties, a Tailwind config,
 * or `ui.designSystem.tokenPaths` in the policy. The last is a declaration and the first two are
 * observations, and the census records which fired.
 */
function detectTokenSystem(files, scan, policy) {
  const evidence = [];
  for (const file of files) {
    if (!STYLE_EXTENSIONS.has(file.ext)) continue;
    if (/--[\w-]+\s*:/.test(file.views.structureOf)) {
      evidence.push(`${file.path} declares CSS custom properties`);
      break;
    }
  }
  const tailwind = scan.files.find((f) => /^tailwind\.config\.[cm]?[jt]s$/.test(path.basename(f)));
  if (tailwind) evidence.push(`${tailwind} is a Tailwind configuration`);
  const declared = policy?.ui?.designSystem?.tokenPaths ?? [];
  if (declared.length > 0) evidence.push(`the policy declares ${declared.length} token path(s)`);
  return { detected: evidence.length > 0, evidence };
}

/**
 * Run the static layer.
 *
 * Returns `{ findings, examined, unexamined }` where `examined` is the set of rule ids a detector
 * actually met an instance of. `unexamined` records the conditional detectors that found no subject,
 * with the reason, so a not-evaluated result can say WHY nothing was established.
 */
export function runDetectors(files, context, { auditOnly = false } = {}) {
  const findings = [];
  const examined = new Set();
  const unexamined = [];
  const unexaminable = [];

  for (const detector of DETECTORS) {
    if (detector.auditOnly && !auditOnly) continue;

    let sawSubject = false;
    const findingsBefore = findings.length;
    const cannotRead = [];
    if (detector.project) {
      const result = detector.examineProject(files, context);
      if (result.examined) sawSubject = true;
      findings.push(...result.findings);
      cannotRead.push(...(result.unexaminable ?? []));
    } else {
      for (const file of files) {
        if (detector.applies && !detector.applies(file, context)) continue;
        const result = detector.examine(file, context);
        if (result.examined) sawSubject = true;
        findings.push(...result.findings);
        cannotRead.push(...(result.unexaminable ?? []));
      }
    }

    for (const item of cannotRead) {
      unexaminable.push({ rule: detector.rule, detector: detector.id, evidence: [item.evidence], reason: item.reason });
    }

    // A rule with a span the detector could not read is not evaluated, even where it examined other
    // instances: a clean result over the readable ones would otherwise stand in for the whole. A
    // failure the detector DID establish is not suppressed by an unreadable sibling: unreadable
    // spans prevent a clean pass, not an observed violation.
    const establishedFailure = findings.length > findingsBefore;
    if (sawSubject && (cannotRead.length === 0 || establishedFailure)) examined.add(detector.rule);
    else if (cannotRead.length > 0) {
      unexamined.push({
        rule: detector.rule,
        detector: detector.id,
        reason: `${cannotRead.length} span(s) could not be examined statically (see detectorsUnexaminable), so ${detector.id} did not establish this rule`,
      });
    } else {
      unexamined.push({
        rule: detector.rule,
        detector: detector.id,
        reason: detector.conditional
          ? `${detector.conditional}, so there was nothing for ${detector.id} to examine`
          : `${detector.id} found no instance of its subject in the scanned files`,
      });
    }
  }

  return { findings, examined: [...examined], unexamined, unexaminable };
}

// -------------------------------------------------------------------------------------------------
// Evidence surface
// -------------------------------------------------------------------------------------------------

/**
 * What was actually looked at. Present on every run with not-attempted defaults, because an empty
 * surface reported as empty and an absent key are different claims: the first says nobody ran a
 * browser, the second says nothing at all and reads as "no browser evidence was needed".
 */
export function census(root, corpus, context, evidence = null) {
  const scan = corpus.scan;
  const routes = scan.files
    .filter((f) => /(^|\/)(pages|routes|app)\//.test(f) && /\.(jsx?|tsx?|vue|svelte|html?)$/.test(f))
    .slice(0, 200);
  const viewportQueries = new Set();
  for (const file of corpus.files) {
    for (const query of file.views.structureOf.matchAll(/@media[^{]*\((min|max)-width:\s*([^)]+)\)/gi)) {
      viewportQueries.add(query[2].trim());
    }
  }
  const storybook = scan.files.some((f) => f.startsWith(".storybook/"))
    ? "available"
    : scan.files.some((f) => /\.stories\.[jt]sx?$/.test(f))
      ? "available"
      : "not-detected";

  return {
    sourceRead: {
      files: corpus.files.length,
      filesSeen: scan.filesExamined,
      capHit: scan.capHit,
      unread: corpus.unread,
      unreadable: scan.unreadable,
      excluded: [...new Set(scan.excluded)].sort(),
      selfExcluded: corpus.selfExcluded,
    },
    routesDiscovered: routes,
    storybook,
    tokenSystem: context.tokenSystem,
    viewportQueries: [...viewportQueries].sort(),
    // `not-attempted` defaults live in browserSurface(), so that the block a run with no evidence
    // emits and the block a run with evidence emits are the same shape from the same function.
    browserRun: browserSurface(evidence),
    designArtifactsFound: scan.files.filter((f) => /^docs\/design\//.test(f)).slice(0, 50),
  };
}

/**
 * The clauses of Standard 35 R8, each mapped to the envelope path that satisfies it.
 *
 * This table is the rule's subject, and it is transcribed from the requirement rather than invented
 * here. R8 says the evidence surface MUST be reported on every run and then enumerates what
 * "reported" means; `evidence.surfaces-declared` is a claim about THIS FRAMEWORK'S OUTPUT, not about
 * anything a project declares. A meta-test reads the requirement's own text and asserts every clause
 * in it appears below — without that binding, the assertion would be checking a rule id rather than
 * a requirement, which is self-certification with extra steps.
 */
const SURFACE_CONTRACT = [
  { clause: "source code read", path: "sourceRead" },
  { clause: "routes discovered", path: "routesDiscovered" },
  { clause: "component catalog available/unavailable", path: "storybook" },
  { clause: "browser run completed/failed/not-attempted", path: "browserRun.status" },
  { clause: "viewports tested", path: "browserRun.viewportsTested" },
  { clause: "accessibility tree obtained/not obtained", path: "browserRun.accessibilityTree" },
  { clause: "screenshots captured/not captured", path: "browserRun.screenshotsCaptured" },
  { clause: "design artifacts found/not found", path: "designArtifactsFound" },
];

export const SURFACE_KEYS = SURFACE_CONTRACT.map((entry) => entry.path);
export const SURFACE_CONTRACT_CLAUSES = SURFACE_CONTRACT.map((entry) => entry.clause);

/**
 * `evidence.surfaces-declared` — the framework's own process rule, evaluated structurally.
 *
 * Its subject is this run's output rather than the project's source, so it has no static detector in
 * the frozen catalog and is not one of the twelve. It is checked here because the subject IS
 * enumerable: the block either carries every clause R8 enumerates, with a not-attempted default, or
 * it does not. That is what `structural` and `full` assurance mean, and it is the only rule in v1
 * that honestly claims them.
 */
export function assertSurfacesDeclared(evidenceSurface) {
  const read = (path) =>
    path.split(".").reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), evidenceSurface);
  const missing = SURFACE_CONTRACT.filter((entry) => read(entry.path) === undefined).map((entry) => entry.path);

  if (missing.length === 0) return [];
  return [
    {
      id: "surfaces-declared",
      rule: "evidence.surfaces-declared",
      category: "evidence",
      severity: "error",
      label: "OBSERVED",
      evidence: missing,
      message: `the compliance output omits evidence-surface key(s): ${missing.join(", ")}`,
      standardRef: "standards/35-evidence-assurance-and-compliance-output.md",
    },
  ];
}

// -------------------------------------------------------------------------------------------------
// Gate 1 → rule scoping
// -------------------------------------------------------------------------------------------------

/**
 * Which UI classes a declaration commits the project to. `multi-platform` names no class of its own,
 * so it is read through the platforms the policy declares.
 */
const PLATFORM_CLASSES = {
  web: "web-ui",
  ios: "mobile-ui",
  android: "mobile-ui",
  windows: "desktop-ui",
  macos: "desktop-ui",
  linux: "desktop-ui",
};

export function declaredClasses(policy) {
  const declared = policy?.ui?.applicability;
  if (!declared || declared === "no-ui") return [];
  if (declared !== "multi-platform") return [declared];
  const platforms = policy?.ui?.platforms ?? [];
  return [...new Set(platforms.map((p) => PLATFORM_CLASSES[p]).filter(Boolean))];
}

/**
 * How a class-specific rule is scoped when the evidence proved a UI but not a platform.
 *
 * `APPLICABLE` answers "is there a UI subject here?". `classResolution` answers "which applicability
 * class can the evidence establish?". Collapsing the two would mean either evaluating every
 * `web-ui` rule against a project that may be React Native, or excluding them from a project that is
 * plainly web — both by guessing.
 *
 * The precedence, first match wins:
 *
 *   1. appliesTo includes any-ui                          → in-scope
 *   2. a PROVEN class is in appliesTo                     → in-scope
 *   3. the declaration is corroborated, and every
 *      corroborated class is outside appliesTo            → out-of-scope, visibly and with a reason
 *   4. anything else                                      → UNRESOLVED
 *
 * A declared class does NOT scope a rule in. That is the whole reason Gate 1 exists: a declaration
 * is an input to classification and never its output, and letting `ui.applicability: web-ui` decide
 * which rules run would put the project's own assertion back in charge of its own scope one layer
 * down. `corroborated` therefore means a declared class the EVIDENCE also proved — declaration plus
 * evidence, the same warrant shape `NOT_APPLICABLE` requires, which is why it is the only path to
 * exclusion. Proven `web-ui` alone never excludes a mobile rule: witnessing one interface is not
 * proof that another is absent.
 *
 * Rule 4 is neither a pass nor an exclusion. It is visible non-establishment, and on a forbidden
 * rule it caps the verdict. The way out of it is to give the classifier evidence that resolves the
 * class — which is a real cost, and the honest one.
 */
export function scopeOfRule(rule, gate) {
  if (rule.appliesTo.includes("any-ui")) return { scope: "in", reason: null };

  const proven = gate.applicabilityClasses ?? [];
  if (proven.some((cls) => rule.appliesTo.includes(cls))) return { scope: "in", reason: null };

  const corroborated = (gate.declaredClasses ?? []).filter((cls) => proven.includes(cls));
  if (gate.agreement === "match" && corroborated.length > 0) {
    return {
      scope: "out",
      reason:
        `applies to ${rule.appliesTo.join(", ")}; this project declares ${corroborated.join(", ")}, the ` +
        `evidence corroborates that declaration, and nothing contradicts it`,
    };
  }

  return {
    scope: "unresolved",
    reason:
      `applies to ${rule.appliesTo.join(", ")}, and the evidence established that an interface exists ` +
      `without establishing its class (classResolution: ${gate.classResolution}). Whether this rule ` +
      `applies here is unresolved — which is neither a pass nor an exclusion. Resolving it needs ` +
      `evidence of the class, not a declaration of it.`,
  };
}

// -------------------------------------------------------------------------------------------------
// audit
// -------------------------------------------------------------------------------------------------

/**
 * Evidence discovery. No policy is read, no rule is evaluated, and no status is emitted.
 *
 * `audit` deliberately cannot say whether a project is compliant. Half of the framework's rules have
 * no static detector, and a command that reported a verdict from this evidence would be reporting
 * one from a fraction of the surface.
 */
export async function runAudit(target, { maxFiles = MAX_FILES } = {}) {
  const corpus = await readCorpus(target, { maxFiles });
  const context = { tokenSystem: detectTokenSystem(corpus.files, corpus.scan, null), policy: null };
  const { findings, examined, unexamined, unexaminable } = runDetectors(corpus.files, context, { auditOnly: true });

  return {
    schemaVersion: "1.0",
    repo: path.resolve(target),
    auditedAt: new Date().toISOString(),
    evidenceSurface: census(target, corpus, context),
    detectorsExamined: examined,
    detectorsWithoutSubject: unexamined,
    detectorsUnexaminable: unexaminable,
    findings,
  };
}

// -------------------------------------------------------------------------------------------------
// validate
// -------------------------------------------------------------------------------------------------

export class ValidationError extends Error {}

/**
 * A Gate 0b refusal, carrying the identity block that produced it.
 *
 * It exists so the CLI can emit a MACHINE-READABLE record of the refusal without parsing its own
 * prose. The state name used to survive only as the first token of `message`, which meant a
 * consumer wanting to distinguish `EXECUTED_TREE_IS_NOT_THE_RELEASE` from a broken policy had to
 * read English — and across a workflow boundary, English is not a contract.
 *
 * It changes nothing about the refusal: still a ValidationError, still exit 2, still no compliance
 * envelope. Subclassing rather than adding a field keeps every existing `instanceof ValidationError`
 * catch correct, including the CLI's.
 */
export class VersionIdentityError extends ValidationError {
  constructor(message, identity) {
    super(message);
    this.identity = identity;
  }
}

/**
 * The authoritative path: Gate 0, Gate 1, Gate 2, in that order.
 *
 * Every early return here is an exit-2 condition raised as ValidationError. None of them produces a
 * partial envelope: a run that could not evaluate emits no compliance blocks at all, for the same
 * reason the classifier's non-execution envelope carries no classification. There must be nothing
 * there for a consumer to misread as a result.
 */
/**
 * `allowUnreleasedFramework` exists for this repository's own suite and is deliberately UNREACHABLE
 * FROM THE CLI — there is no flag and no environment variable for it, and a test asserts that.
 *
 * The suite is the framework's first real consumer: it builds throwaway projects that pin a version
 * and evaluates them with the working tree, which between releases is that version plus unreleased
 * commits. That is precisely the state the guard refuses, and the guard is right to — a verdict
 * labelled 1.0.0 produced by 1.0.0-plus-changes misstates its provenance whether the consumer is a
 * real repository or a temporary directory.
 *
 * So the escape is an argument at each call site rather than a switch somebody can set once. A CLI
 * flag would end up pasted into a workflow and never removed; an environment variable would be worse,
 * because it would be invisible in the run that used it. Passing this from library code is a choice a
 * caller makes in source, in view of a reviewer. The identity block still records what actually ran,
 * so even a permitted run cannot claim MATCH.
 */
export async function runValidate(
  target,
  { maxFiles = MAX_FILES, today = null, evidencePath = null, allowUnreleasedFramework = false } = {},
) {
  const catalog = await loadCatalog();
  assertBindings(catalog, DETECTOR_RULES.concat(["evidence.surfaces-declared"]));

  // ---- Gate 0 — policy validity ----------------------------------------------------------------
  const policyPath = path.join(target, "project-policy.yml");
  // A project with NO policy is not a project with a broken one. It has not adopted the framework,
  // which is a state the gates can report — every rule lands on not-evaluated and the verdict is
  // NOT_EVALUATED. Exit 2 is reserved for a policy that exists and cannot be believed; spending it
  // on absence would make "delete the file" indistinguishable from "the file is malformed".
  const policyPresent = await stat(policyPath).then(
    (info) => info.isFile(),
    () => false,
  );
  let policyResult = { status: "absent", schemaErrors: [], semanticErrors: [], findings: [], document: null };
  try {
    if (policyPresent) {
      policyResult = await checkPolicy(policyPath, SCHEMA, today ?? new Date().toISOString().slice(0, 10), catalog);
    }
  } catch (error) {
    throw new ValidationError(`policy could not be read at ${policyPath}: ${error.message}`);
  }
  if (policyResult.status === "invalid-shape" || policyResult.status === "invalid-semantics") {
    const detail = [...policyResult.schemaErrors, ...policyResult.semanticErrors]
      .map((e) => `  ${e.path || "(document)"}: ${e.message}`)
      .join("\n");
    throw new ValidationError(
      `the project policy is ${policyResult.status === "invalid-shape" ? "not a policy" : "incoherent"}:\n${detail}\n` +
        `A malformed configuration is not a failing project. Nothing was evaluated.`,
    );
  }
  const policy = policyResult.document ?? null;

  // ---- Gate 0b — version identity ---------------------------------------------------------------
  //
  // Between "is this policy valid?" and "does this project have a UI?" sits a question neither
  // answers: is the framework about to evaluate this project the one the policy asked for? A pinned
  // `standardVersion` and a checked-out framework ref are independent, and when they disagree the
  // envelope would carry a version beside a verdict that version never produced.
  //
  // This runs BEFORE Gate 1, so a mismatch reaches no classifier and no rule. It is a
  // configuration/evaluation-identity failure, never NON_COMPLIANT: nothing has established that the
  // project violates anything, only that this run cannot truthfully issue the verdict it was asked
  // for. `ValidationError` carries that to exit 2, and no envelope is emitted — an envelope carries a
  // `status`, and that status is exactly the claim being refused.
  const identity = resolveVersionIdentity(policy?.standardVersion ?? null, FRAMEWORK_ROOT, { target });
  // A permitted unreleased run is still recorded as one. `allowUnreleasedFramework` waives the
  // REFUSAL, never the finding — the envelope keeps `EXECUTED_TREE_IS_NOT_THE_RELEASE`, so nothing
  // downstream can read the result as having been produced by the release it names.
  const waived = allowUnreleasedFramework && identity.identity === "EXECUTED_TREE_IS_NOT_THE_RELEASE";
  if (identity.blocking && !waived) {
    throw new VersionIdentityError(
      `${identity.identity}\n  ${identity.reason}\n\n` +
        `  Resolving a historical rule set is not implemented, so this run cannot evaluate ` +
        `${identity.declaredVersion}.\n  Either execute the framework at ${identity.declaredVersion} — ` +
        `check out the immutable tag, not a branch — or update\n  project-policy.yml deliberately and review ` +
        `what the different rule set reports. Changing the governing\n  version is an engineering event, not a default.`,
      identity,
    );
  }

  // ---- Gate 1 — applicability -------------------------------------------------------------------
  let applicability;
  try {
    applicability = await classify(target, { maxFiles });
  } catch (error) {
    if (error instanceof ClassifierError) {
      throw new ValidationError(
        `Gate 1 could not execute: ${error.message}. No classification was produced, so no UI rule ` +
          `could be scoped and none was evaluated.`,
      );
    }
    throw error;
  }

  // ---- Gate 2 — rule evaluation -----------------------------------------------------------------
  const corpus = await readCorpus(target, { maxFiles });
  const context = { tokenSystem: detectTokenSystem(corpus.files, corpus.scan, policy), policy };

  // The static layer runs ONLY when Gate 1 admitted the UI rule surface. Running the detectors
  // against a NOT_APPLICABLE project and discarding the findings afterwards would put a UI result on
  // the far side of the gate, one refactor away from escaping.
  const uiAdmitted = applicability.classification === "APPLICABLE";
  const statics = uiAdmitted
    ? runDetectors(corpus.files, context)
    : { findings: [], examined: [], unexamined: [] };

  // Ingestion is part of Gate 2's input, not a gate of its own. A broken evidence document is a
  // broken contract — exit 2, no verdict — because a producer's defect is not the project's failure,
  // and a carefully broken producer must not be able to look like a passing one.
  const evidence = evidencePath
    ? await ingest(evidencePath, {
        root: target,
        catalog,
        policy,
        routesDiscovered: census(target, corpus, context).routesDiscovered,
      })
    : null;

  const evidenceSurface = census(target, corpus, context, evidence);
  const processFindings = assertSurfacesDeclared(evidenceSurface);

  // Human evidence, resolved on the same two axes the machine surfaces answer for: is it still about
  // this material, and did it cover what had to be covered. Resolved for every attestation regardless
  // of Gate 1, because an attestation on a rule the gate excluded is still a fact about the policy.
  const attestations = resolveAttestations(target, policy);

  const gate = {
    ...applicability,
    declaredClasses: declaredClasses(policy),
  };

  const isProcess = (rule) => rule.appliesTo.includes("process");
  const scopes = new Map();
  for (const rule of catalog.rules.values()) {
    if (isProcess(rule)) continue;
    scopes.set(rule.id, scopeOfRule(rule, gate));
  }

  const uiVerdict = uiAdmitted
    ? evaluate({
        catalog,
        policy,
        findings: statics.findings,
        evaluated: statics.examined,
        evidence,
        identities: attestations,
        today: today ?? new Date().toISOString().slice(0, 10),
        appliesFilter: (rule) => !isProcess(rule),
        classScopes: scopes,
        unexamined: statics.unexamined,
      })
    : null;

  const frameworkVerdict = evaluate({
    catalog,
    policy,
    findings: processFindings,
    // The output-structure assertion is this rule's evaluator, so the rule is examined on every run
    // — including runs where the UI surface was never opened.
    evaluated: ["evidence.surfaces-declared"],
    evidence: null,
    identities: attestations,
    today: today ?? new Date().toISOString().slice(0, 10),
    appliesFilter: isProcess,
  });

  const result = envelope({
    applicability,
    uiVerdict,
    frameworkVerdict,
    project: policy?.project ?? null,
    standardVersion: policy?.standardVersion ?? null,
    auditedAt: new Date().toISOString(),
    frameworkCoverage: coverage(catalog, {
      evaluated: statics.examined.concat(["evidence.surfaces-declared"]),
      totalStandards: 40,
    }),
    evidenceSurface,
    versionIdentity: identity,
  });

  return {
    envelope: result,
    policyFindings: policyResult.findings,
    policyStatus: policyResult.status,
    statics,
    attestations,
    catalog,
  };
}

/**
 * The exit code, derived from the envelope and from nothing else.
 *
 *   INDETERMINATE never exits 0. It is not a UI verdict, and treating "we could not establish
 *   whether this project is in scope" as a pass is the false green the whole framework is arranged
 *   against.
 *
 *   frameworkCompliance passing does NOT rescue an unresolved UI gate. The two blocks answer
 *   different questions, and the process rules being satisfied says nothing about whether the UI
 *   rules were ever reachable.
 */
export function exitCodeFor(envelopeResult, policyFindings) {
  const failing = (block) =>
    block !== null && block.status !== "COMPLIANT" && block.status !== "COMPLIANT_WITH_EXCEPTIONS";

  if (envelopeResult.applicability.classification === "INDETERMINATE") return EXIT_FINDINGS;
  if (policyFindings.length > 0) return EXIT_FINDINGS;
  if (failing(envelopeResult.frameworkCompliance)) return EXIT_FINDINGS;
  if (failing(envelopeResult.uiCompliance)) return EXIT_FINDINGS;
  return EXIT_OK;
}

// -------------------------------------------------------------------------------------------------
// Human output
// -------------------------------------------------------------------------------------------------

function limitationBlock() {
  return (
    "\nWhat this run could not see:\n" +
    LIMITATIONS.map((line) => `  - ${line}`).join("\n") +
    "\n"
  );
}

function humanAudit(result) {
  const lines = [`Audit: ${result.repo}`, ""];
  const surface = result.evidenceSurface;
  lines.push(`  files read        ${surface.sourceRead.files} of ${surface.sourceRead.filesSeen} seen`);
  lines.push(`  routes            ${surface.routesDiscovered.length}`);
  lines.push(`  storybook         ${surface.storybook}`);
  lines.push(`  token system      ${surface.tokenSystem.detected ? "detected" : "not detected"}`);
  lines.push(`  viewport queries  ${surface.viewportQueries.length}`);
  lines.push(`  browser run       ${surface.browserRun.status}`);
  lines.push("");

  if (result.findings.length === 0) lines.push("  no findings");
  for (const finding of result.findings) {
    lines.push(`  ${finding.severity.toUpperCase().padEnd(7)} ${finding.label.padEnd(8)} ${finding.rule}`);
    lines.push(`          ${finding.message}`);
    for (const evidence of finding.evidence.slice(0, 5)) lines.push(`          ${evidence}`);
  }

  lines.push("");
  lines.push(
    "This is evidence discovery. It reports no status and no score, and a clean audit is not a\n" +
      "compliance result: most of this framework's rules have no static detector at all.",
  );
  lines.push(limitationBlock());
  return lines.join("\n");
}

function humanValidate(result, policyFindings, policyStatus, attestations = new Map()) {
  const env = result;
  const lines = [`Project: ${env.project ?? "(unnamed)"}`, ""];
  if (policyStatus === "absent") {
    lines.push(
      "There is no project-policy.yml here. Nothing was configured, so nothing could be declared\n" +
        "applicable, excepted, or attested — every rule is not-evaluated and the verdict is\n" +
        "NOT_EVALUATED. That is an absent configuration, not a broken one.",
    );
    lines.push("");
  }
  lines.push(`  applicability        ${env.applicability.classification} / ${env.applicability.agreement}`);
  lines.push(
    `  classes              ${env.applicability.applicabilityClasses.join(", ") || "(none)"} — ${env.applicability.classResolution}`,
  );
  lines.push(`  uiCompliance         ${env.uiCompliance ? env.uiCompliance.status : "null"}`);
  lines.push(`  frameworkCompliance  ${env.frameworkCompliance.status}`);
  lines.push("");

  if (env.applicability.classification === "INDETERMINATE") {
    lines.push("Gate 1 did not establish whether this project is subject to the UI standards:");
    for (const reason of env.applicability.reasons) lines.push(`  - ${reason}`);
    lines.push("");
    lines.push(
      "No UI rule was evaluated, and uiCompliance is null. This is not a pass, and it does not\n" +
        "become one by the process rules being satisfied.",
    );
    lines.push("");
  }

  if (env.applicability.classification === "NOT_APPLICABLE") {
    lines.push(
      "Gate 1 established that this project has no interface subject to these standards, from a\n" +
        "complete scan, a declaration, and zero contradicting signals. uiCompliance is null because\n" +
        "there was nothing to evaluate — not because nothing was checked.",
    );
    lines.push("");
  }

  const browser = env.evidenceSurface.browserRun;
  if (browser.status === "not-attempted") {
    lines.push(
      "No browser evidence was supplied. Every rule whose evidence surface is a browser is therefore\n" +
        "not-evaluated — an absent surface, not a failed one, and not something this run can hold\n" +
        "against the project.",
    );
    lines.push("");
  } else {
    lines.push(`Browser run — ${browser.status}, identity ${browser.evidenceFreshness}`);
    lines.push(`  produced by     ${browser.producedBy.name} ${browser.producedBy.version} at ${browser.runAt}`);
    lines.push(`  routes tested   ${browser.routesTested.join(", ") || "(none)"}`);
    if (browser.routesFailed.length > 0) lines.push(`  routes missed   ${browser.routesFailed.join(", ")}`);
    lines.push(
      `  viewports       ${browser.viewportsTested.join(", ") || "(none)"} — classes ` +
        `${browser.coverage.viewportClassesTested.join(", ") || "(none)"} of ` +
        `${browser.coverage.viewportClassesDeclared.join(", ") || "(none declared)"}`,
    );
    lines.push(`  coverage        ${browser.coverage.complete ? "complete" : "INCOMPLETE"}`);
    for (const reason of browser.coverage.reasons) lines.push(`                  ${reason}`);
    lines.push("");
    if (!browser.coverage.complete) {
      lines.push(
        "  Incomplete coverage does not make a passing check into a failure, and it does not make it\n" +
          "  into a pass either. A failure this run witnessed still stands; a clean result over part of\n" +
          "  the interface is reported as partial-coverage, and stays unestablished.",
      );
      lines.push("");
    }
  }

  for (const block of [
    ["UI", env.uiCompliance],
    ["Framework", env.frameworkCompliance],
  ]) {
    const [name, verdict] = block;
    if (!verdict) continue;
    lines.push(`${name} — ${verdict.status}${verdict.score === null ? "" : ` (${verdict.score}%)`}`);
    lines.push(
      `  ${verdict.summary.passed} passed, ${verdict.summary.failed} failed, ` +
        `${verdict.summary.warnings} warning, ${verdict.summary.skipped} not established`,
    );
    lines.push(
      `  assurance: automated ${verdict.assurance.automated}, browser ${verdict.assurance.browserAnalysis}, ` +
        `visual ${verdict.assurance.visualAnalysis}, human ${verdict.assurance.manualReview}, ` +
        `not evaluated ${verdict.assurance.notEvaluated}`,
    );
    for (const failure of verdict.results.filter((r) => r.status === "failed")) {
      lines.push(`  FAIL  ${failure.ruleId} — ${failure.message}`);
    }
    if (verdict.unestablishedProhibitions.length > 0) {
      lines.push("");
      lines.push(`  ${verdict.unestablishedProhibitions.length} prohibition(s) were not established:`);
      for (const ruleId of verdict.unestablishedProhibitions) {
        const rule = verdict.results.find((r) => r.ruleId === ruleId);
        lines.push(`    ${ruleId} — ${rule?.message ?? "not established"}`);
      }
      lines.push(
        "\n  A prohibition nobody established is not a prohibition observed. Four ways forward, and\n" +
          "  none of them is ignoring it: implement the check, supply the evidence its surface needs,\n" +
          "  record a review attestation, or declare the rule not-applicable with a reason.",
      );
    }
    lines.push("");
  }

  // The recording workflow. A reviewer writes down what they read, runs this, and is told the
  // identity to paste back. The framework never writes it for them: an identity it computed and
  // stored on their behalf would say only that the paths match themselves, which is a record of
  // nothing dressed as provenance.
  const unrecorded = [...attestations].filter(([, state]) => state.currentIdentity !== null);
  if (unrecorded.length > 0) {
    lines.push(`${unrecorded.length} attestation(s) record no contentIdentity. As committed at HEAD:`);
    for (const [ruleId, state] of unrecorded) {
      lines.push(`  ${ruleId}`);
      lines.push(`    contentIdentity: ${state.currentIdentity.identity}`);
      lines.push(`    revision:        ${state.currentIdentity.revision}`);
    }
    lines.push(
      "\n  Record these only if they describe what was actually reviewed. Until then the reviews\n" +
        "  establish nothing — which is the correct state for a review with no anchor, not a fault.",
    );
    lines.push("");
  }

  for (const finding of policyFindings) {
    lines.push(`  POLICY ${finding.id}: ${finding.message}`);
  }

  lines.push(limitationBlock());
  return lines.join("\n");
}

// -------------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------------

const USAGE = `uiux-standards <command> [path] [flags]

Commands:
  audit [path]           evidence discovery — no policy, no verdict. Flags: --json, --strict
  validate [path]        the full gate: policy, Gate 1, Gate 2. Flags: --json, --evidence=<file>
  applicability [path]   Gate 1 alone — is this repository subject to the UI standards?
                         Flags: --json, --self
  init [path]            scaffold policy and routing documents. Flags: --json, --dry-run,
                         --mode=<greenfield|existing-configured|reconstruction-required>,
                         --force-overwrite=<path> (once per path)

Exit codes: 0 the checked condition holds; 1 the tool ran and found problems; 2 no verdict reached.
`;

/**
 * Commands the dispatcher knows about and this build does not implement.
 *
 * Empty now that `init` has landed, and kept rather than deleted: the mechanism is the reason no
 * command in this framework has ever reported success for want of an implementation, and the next
 * unimplemented command should reach for it instead of reinventing the decision.
 */
const PENDING = {};

function parseArgs(argv) {
  const options = { target: null, json: false, strict: false, evidence: null };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg.startsWith("--evidence=")) options.evidence = arg.slice("--evidence=".length);
    else if (arg.startsWith("--dir=")) options.target = arg.slice("--dir=".length);
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.target === null) options.target = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.target === null) options.target = ".";
  return options;
}

export async function runCli(
  argv,
  {
    write = (s) => process.stdout.write(s),
    fail = (s) => process.stderr.write(s),
    // Not parsed from `argv`, and never passed by `main()` below — see runValidate's note. A caller
    // holding a reference to this function can waive the unreleased-framework refusal; a caller
    // holding a shell cannot, which is the boundary that matters, because the shell is where a
    // workflow lives.
    allowUnreleasedFramework = false,
  } = {},
) {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    write(USAGE);
    return command ? EXIT_OK : EXIT_INVOCATION;
  }

  if (command === "applicability") return await runApplicability(rest, { write, fail });
  if (command === "init") return await runInit(rest, { write, fail });

  if (command in PENDING) {
    fail(
      `uiux-standards ${command}: not implemented in this build — it arrives with ${PENDING[command]}.\n` +
        `Exiting 2: no verdict was reached. This is not a pass.\n`,
    );
    return EXIT_INVOCATION;
  }

  if (command !== "audit" && command !== "validate") {
    fail(`uiux-standards: unknown command '${command}'\n\n${USAGE}`);
    return EXIT_INVOCATION;
  }

  let options;
  try {
    options = parseArgs(rest);
  } catch (error) {
    fail(`uiux-standards ${command}: ${error.message}\n\n${USAGE}`);
    return EXIT_INVOCATION;
  }

  try {
    const info = await stat(options.target);
    if (!info.isDirectory()) throw new Error(`'${options.target}' is not a directory`);
  } catch (error) {
    fail(`uiux-standards ${command}: ${error.message}\n`);
    return EXIT_INVOCATION;
  }

  if (options.evidence !== null && command === "audit") {
    // `audit` reaches no verdict, so it has nothing to do with evidence that establishes rules.
    // Accepting the flag here would suggest the evidence had been weighed by a command that weighs
    // nothing.
    fail(`uiux-standards audit: --evidence belongs to validate; audit reaches no verdict.\n`);
    return EXIT_INVOCATION;
  }

  if (command === "audit") {
    let result;
    try {
      result = await runAudit(options.target);
    } catch (error) {
      fail(`uiux-standards audit: ${error.message}\n`);
      return EXIT_INVOCATION;
    }
    write(options.json ? JSON.stringify(result, null, 2) + "\n" : humanAudit(result) + "\n");
    // `audit` reaches no verdict, so it does not fail on findings. `--strict` is for a consumer that
    // wants discovery to break a build; the default deliberately does not, because a discovery
    // command that fails teaches people to stop running it.
    return options.strict && result.findings.length > 0 ? EXIT_FINDINGS : EXIT_OK;
  }

  let result;
  try {
    result = await runValidate(options.target, { evidencePath: options.evidence, allowUnreleasedFramework });
  } catch (error) {
    if (error instanceof EvidenceError) {
      fail(
        `uiux-standards validate: the browser evidence is not a valid record.\n${error.message}\n` +
          `Exiting 2: no verdict was reached. A defect in an evidence producer is not a finding ` +
          `about this project, and it is not a pass.\n`,
      );
      return EXIT_INVOCATION;
    }
    // Ordered BEFORE the ValidationError branch, which it extends.
    //
    // The record carries `error` and `versionIdentity` and NOTHING ELSE: no status, no
    // uiCompliance, no frameworkCompliance. That is the classifier's non-execution argument
    // transposed — there must be nothing here a consumer could read as a verdict, because the
    // verdict is precisely the claim being refused. `versionIdentity` is the same block the
    // compliance envelope carries on a run that reached one, so a governance layer parses one shape
    // either way rather than two.
    //
    // Emitting it also ends a second ambiguity. `envelope.json` was written as a ZERO-BYTE file on
    // refusal, and an empty file is indistinguishable from a step that never ran — the same
    // confusion the classifier's error envelope exists to prevent, on the other side of the gate.
    if (error instanceof VersionIdentityError) {
      if (options.json) {
        write(
          JSON.stringify(
            {
              schemaVersion: "1.0",
              // The EXECUTING framework's own version, which the guard has already read, rather
              // than a second read of package.json. Under a refusal, which version is running is
              // the disputed fact; reporting it from the block that established it keeps one source.
              tool: { name: "uiux-standards", version: error.identity.executedVersion ?? "unknown" },
              target: options.target,
              error: { code: error.identity.identity, message: error.message },
              versionIdentity: error.identity,
            },
            null,
            2,
          ) + "\n",
        );
      }
      fail(`uiux-standards validate: ${error.message}\nExiting 2: no verdict was reached.\n`);
      return EXIT_INVOCATION;
    }
    if (error instanceof ValidationError || error instanceof CatalogError) {
      fail(`uiux-standards validate: ${error.message}\nExiting 2: no verdict was reached.\n`);
      return EXIT_INVOCATION;
    }
    throw error;
  }

  write(
    options.json
      ? JSON.stringify(result.envelope, null, 2) + "\n"
      : humanValidate(result.envelope, result.policyFindings, result.policyStatus, result.attestations) +
        "\n",
  );
  return exitCodeFor(result.envelope, result.policyFindings);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(await runCli(process.argv.slice(2)));
}
