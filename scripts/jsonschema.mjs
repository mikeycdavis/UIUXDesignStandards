/**
 * VENDORED — copied verbatim from EngineeringStandards/scripts/jsonschema.mjs on 2026-08-10.
 *
 * This is now this repository's own source, not a tracked upstream. It is reviewed, tested, and
 * modified here; the copies in sibling standards packs are permitted to diverge and are not kept
 * in sync. See artifacts/adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md for why
 * the neutral core is vendored rather than shared, and what that costs.
 *
 * Unmodified at vendoring time. The comment below is the original author's; where it cites a
 * document that lives in EngineeringStandards, the equivalent reasoning here is ADR 0001.
 */
/**
 * A small JSON Schema evaluator covering exactly the keywords used by
 * schemas/project-policy.schema.json, and refusing to run against anything else.
 *
 * The schema file is the single definition of what a valid policy is (Standard 37 R5). This module
 * exists so that definition is *executed* rather than restated in hand-written checks — a
 * hand-written validator alongside a schema is two definitions, and the drift between them is
 * silent (Standard 27 R4).
 *
 * The strictness that matters: an unsupported keyword throws instead of being ignored. A validator
 * that silently skips a constraint it does not implement reports PASS for a document it never fully
 * checked, which is the false green of Standard 24 R2 in its purest form. If a future schema adds
 * `oneOf`, this module fails loudly until someone implements it.
 *
 * `format` is treated as an annotation and NOT validated, which is what the specification says it
 * is. Every `format` in the policy schema is paired with an equivalent `pattern`, so the assurance
 * is carried by the pattern; the annotation claims nothing.
 */

const SUPPORTED = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "propertyNames",
  "pattern",
  "enum",
  "const",
  "minLength",
  "items",
  "minItems",
  "format",
]);

/** Keywords that carry no constraint we evaluate. */
const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description", "format"]);

export class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "SchemaError";
  }
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) throw new SchemaError(`only local $ref is supported, got '${ref}'`);
  let node = root;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === undefined || node === null || !(segment in node)) {
      throw new SchemaError(`$ref '${ref}' does not resolve`);
    }
    node = node[segment];
  }
  return node;
}

function check(value, schema, root, path, errors) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED.has(keyword)) {
      throw new SchemaError(`unsupported schema keyword '${keyword}' at ${path || "#"}`);
    }
  }

  if (schema.$ref !== undefined) {
    check(value, resolveRef(schema.$ref, root), root, path, errors);
    return;
  }

  const actual = typeOf(value);

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = expected.some((t) => (t === "integer" ? Number.isInteger(value) : actual === t));
    if (!ok) {
      errors.push({ path, message: `expected ${expected.join(" or ")}, found ${actual}` });
      return; // Every further keyword assumes the type; reporting them all would be noise.
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${schema.enum.map((v) => `'${v}'`).join(", ")}` });
  }

  if (actual === "string") {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push({ path, message: `does not match required format` });
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `must not be empty` });
    }
  }

  if (actual === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => check(item, schema.items, root, `${path}[${i}]`, errors));
    }
  }

  if (actual === "object") {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push({ path: path ? `${path}.${key}` : key, message: "is required but missing" });
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;

      if (schema.propertyNames !== undefined) {
        const nameErrors = [];
        check(key, schema.propertyNames, root, childPath, nameErrors);
        if (nameErrors.length > 0) {
          errors.push({ path: childPath, message: `'${key}' is not a valid key here` });
          continue;
        }
      }

      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        check(child, properties[key], root, childPath, errors);
        continue;
      }

      if (schema.additionalProperties === false) {
        errors.push({ path: childPath, message: `unknown property '${key}'` });
      } else if (typeof schema.additionalProperties === "object") {
        check(child, schema.additionalProperties, root, childPath, errors);
      }
    }
  }
}

/**
 * Validate `document` against `schema`. Returns an array of { path, message }; empty means valid.
 * Throws SchemaError if the schema uses a keyword this evaluator does not implement.
 */
export function validate(document, schema) {
  const errors = [];
  check(document, schema, schema, "", errors);
  return errors;
}

/** Assert the evaluator implements every keyword the schema uses, without validating a document. */
export function assertSchemaSupported(schema) {
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      // Below `properties`, `$defs`, and friends the keys are names, not keywords.
      if (key === "properties" || key === "$defs") {
        for (const [name, sub] of Object.entries(child)) walk(sub, `${path}/${key}/${name}`);
        continue;
      }
      if (key === "enum" || key === "required" || key === "const") continue;
      if (!SUPPORTED.has(key)) {
        throw new SchemaError(`unsupported schema keyword '${key}' at ${path}/${key}`);
      }
      if (!ANNOTATIONS.has(key)) walk(child, `${path}/${key}`);
    }
  };
  walk(schema, "#");
}
