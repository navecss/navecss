/**
 * The text test of `cxModules`: the one search a module's text gets before it is parsed, to decide
 * whether it can import a listed module. It is a pattern run over every module of a build, so its
 * cost has to grow with the text and never with the worst run in it: no part of it may reach past
 * the longest specifier a file can have.
 */

/**
 * `text` as a pattern that matches it and nothing else.
 */
function literalPattern(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

// What may stand in a quoted specifier (no quote, no escape, no line break), bounded because no
// specifier is longer than this and an unbounded run backtracks across the whole text for each
// name in it, and what an extension is (a dot and what follows it up to the next dot, slash,
// query or hash).
const INSIDE = String.raw`[^\n'"\x60\\]{0,512}`
const EXTENSION = String.raw`\.[^\n'"\x60\\/?#.]*`
const QUOTE = String.raw`['"\x60]`

/**
 * The search the text test makes of a module for a specifier that can name a listed file. It
 * pairs no quotes: each name is looked for where a quote opens, so an apostrophe elsewhere in the
 * text cannot hide a specifier. A specifier names a file by its last segment, whether or not a
 * `/`, a `?query` or a `#hash` follows it. A directory specifier that writes no name (`.`, `..`,
 * `../..`) names `index`, and is looked for in an import position only, so `s.split('.')` is not
 * one.
 */
export function textTestOf(names: ReadonlySet<string>): RegExp | undefined {
  if (names.size === 0) return undefined
  const listed = [...names].map((name) => literalPattern(name)).join('|')
  const named = `${QUOTE}(?:${INSIDE}/)?(?:${listed})(?:${EXTENSION})?/*(?:[?#]${INSIDE})?${QUOTE}`
  const directory = String.raw`(?:\bfrom|\bimport)\s*(?:\(\s*)?${QUOTE}\.{1,2}(?:/\.{1,2})*/?${QUOTE}`
  return new RegExp(names.has('index') ? `${named}|${directory}` : named)
}
