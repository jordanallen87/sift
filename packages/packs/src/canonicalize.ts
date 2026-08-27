/**
 * Deterministic canonical serialization and hashing for a
 * `DecisionPackManifest`, implementing pack-authoring.md "Compiler and
 * registry" step 11: "deterministic canonical serialization and SHA-256
 * hash generation. The hash covers semantic source and resolved capability
 * versions; it excludes `compiledAt` and other build-time timestamps."
 *
 * Judgment call: the property test requirement (testing.md's "compiled pack
 * hashing is deterministic for semantically identical manifests") speaks of
 * two axes of accidental non-determinism -- object key insertion order, and
 * "`compiledAt`-equivalent metadata". `canonicalizeValue` neutralizes the
 * first by recursively sorting object keys before serializing (arrays are
 * NOT reordered -- array element order is semantically meaningful pack
 * content, e.g. `dependsOn` priority or `tags` order, not incidental
 * construction order). The second is neutralized structurally rather than
 * by any special-case field skip: `DecisionPackManifestSchema` (the only
 * type `canonicalizeManifest` accepts) has no `compiledAt` field at all --
 * only `CompiledDecisionPackSchema` (source manifest + compiler-attached
 * `compiledHash`/`compiledAt`/... ) does, and `compiler.ts` always computes
 * the hash from the pre-compilation `DecisionPackManifest` before
 * `compiledAt` is attached. So "excludes `compiledAt`" is satisfied by
 * hashing the right *input*, not by filtering keys out of a bigger one.
 */
import { createHash } from 'node:crypto';
import type { DecisionPackManifest } from '@pax/contracts';

// A named, non-generic alias (rather than an inline `Readonly<Record<string,
// JsonLike>>`) so this recursive union does not trip TypeScript's circular-
// type-alias check, which treats a directly-nested generic mapped type
// (`Record<...>`) differently from a plain index signature here.
interface JsonLikeRecord {
  readonly [key: string]: JsonLike;
}

type JsonLike = string | number | boolean | null | undefined | readonly JsonLike[] | JsonLikeRecord;

/**
 * Recursively canonicalizes a plain JSON-like value: object keys are sorted
 * lexicographically at every level; arrays keep their given order (only
 * their elements are recursively canonicalized); primitives pass through to
 * `JSON.stringify`. `undefined` object values are dropped (matching
 * `JSON.stringify`'s own behavior) so an optional field's presence-with-
 * `undefined` never differs from its absence.
 */
export function canonicalizeValue(value: JsonLike): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item as JsonLike)).join(',')}]`;
  }
  // `Array.isArray`'s built-in type guard does not narrow `value` down to
  // just the object arm of the `JsonLike` union here (it only proves
  // "not an array", not "is this specific record shape"), so an explicit
  // cast is needed for the string-indexed reads below.
  const record = value as JsonLikeRecord;
  const keys = Object.keys(record).sort();
  const entries = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Canonicalizes a `DecisionPackManifest` (the pre-compilation source, never
 * a `CompiledDecisionPack`) into a stable JSON string suitable for hashing.
 * Accepts any object shape structurally compatible with the manifest so
 * callers that have already round-tripped through
 * `DecisionPackManifestSchema.parse` (which strips nothing relevant -- every
 * schema in `packs.ts` is `.strict()`) get an identical result regardless of
 * source object key insertion order.
 */
export function canonicalizeManifest(manifest: DecisionPackManifest): string {
  return canonicalizeValue(manifest);
}

/**
 * Produces the lowercase-hex SHA-256 `compiledHash` for a compiled pack.
 * `canonicalManifestJson` must be `canonicalizeManifest(source)`'s output.
 * `resolvedCapabilityVersions` is a map of `"<kind>:<id>"` (see
 * `capability-catalog.ts`'s `capabilityKey`) to the installed catalog
 * entry's `version` string for every skill/specialist/tool the manifest
 * references -- folding pack-authoring.md's "resolved capability versions"
 * into the hash so that republishing a pack manifest byte-for-byte against
 * an *upgraded* capability catalog (e.g. a new `deal-analyst` implementation
 * version) still produces a new `compiledHash`, matching "Changing an
 * installed pack creates a new version" even when the change originates in
 * a referenced capability rather than the manifest text itself.
 *
 * A NUL (`\u0000`) separator is inserted between the two canonicalized
 * inputs before hashing so that no pair of (manifest, versions) values can
 * collide with a different pair merely through string concatenation
 * ambiguity (`"ab"+"c"` vs `"a"+"bc"`); NUL cannot appear inside either
 * canonicalized JSON string, which only ever contains `JSON.stringify`
 * output and structural characters.
 */
export function hashManifest(
  canonicalManifestJson: string,
  resolvedCapabilityVersions: Readonly<Record<string, string>> = {},
): string {
  const canonicalVersions = canonicalizeValue(resolvedCapabilityVersions);
  return createHash('sha256')
    .update(canonicalManifestJson)
    .update('\u0000')
    .update(canonicalVersions)
    .digest('hex');
}
