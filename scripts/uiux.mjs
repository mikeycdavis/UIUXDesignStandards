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
      const compensating = /\b(box-shadow|border|border-bottom|border-color|background|background-color|text-decoration|outline-offset|outline-color)\s*:/i;

      for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = block[1];
        const body = block[2];
        if (!/:focus\b|:focus-visible\b/.test(selector)) continue;
        examined = true;
        if (/:focus\s*:not\(\s*:focus-visible\s*\)/.test(selector)) continue;
        if (!/\boutline\s*:\s*(none|0)\b/i.test(body)) continue;
        if (compensating.test(body)) continue;
        findings.push(
          FINDING(
            this.rule,
            file,
            block.index,
            `'${selector.trim()}' removes the focus outline and declares no replacement indicator`,
            { detector: this.id },
          ),
        );
      }
      return { examined, findings };
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

  for (const detector of DETECTORS) {
    if (detector.auditOnly && !auditOnly) continue;

    let sawSubject = false;
    if (detector.project) {
      const result = detector.examineProject(files, context);
      if (result.examined) sawSubject = true;
      findings.push(...result.findings);
    } else {
      for (const file of files) {
        if (detector.applies && !detector.applies(file, context)) continue;
        const result = detector.examine(file, context);
        if (result.examined) sawSubject = true;
        findings.push(...result.findings);
      }
    }

    if (sawSubject) examined.add(detector.rule);
    else {
      unexamined.push({
        rule: detector.rule,
        detector: detector.id,
        reason: detector.conditional
          ? `${detector.conditional}, so there was nothing for ${detector.id} to examine`
          : `${detector.id} found no instance of its subject in the scanned files`,
      });
    }
  }

  return { findings, examined: [...examined], unexamined };
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
  const { findings, examined, unexamined } = runDetectors(corpus.files, context, { auditOnly: true });

  return {
    schemaVersion: "1.0",
    repo: path.resolve(target),
    auditedAt: new Date().toISOString(),
    evidenceSurface: census(target, corpus, context),
    detectorsExamined: examined,
    detectorsWithoutSubject: unexamined,
    findings,
  };
}

// -------------------------------------------------------------------------------------------------
// validate
// -------------------------------------------------------------------------------------------------

export class ValidationError extends Error {}

/**
 * The authoritative path: Gate 0, Gate 1, Gate 2, in that order.
 *
 * Every early return here is an exit-2 condition raised as ValidationError. None of them produces a
 * partial envelope: a run that could not evaluate emits no compliance blocks at all, for the same
 * reason the classifier's non-execution envelope carries no classification. There must be nothing
 * there for a consumer to misread as a result.
 */
export async function runValidate(target, { maxFiles = MAX_FILES, today = null, evidencePath = null } = {}) {
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
  { write = (s) => process.stdout.write(s), fail = (s) => process.stderr.write(s) } = {},
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
    result = await runValidate(options.target, { evidencePath: options.evidence });
  } catch (error) {
    if (error instanceof EvidenceError) {
      fail(
        `uiux-standards validate: the browser evidence is not a valid record.\n${error.message}\n` +
          `Exiting 2: no verdict was reached. A defect in an evidence producer is not a finding ` +
          `about this project, and it is not a pass.\n`,
      );
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
