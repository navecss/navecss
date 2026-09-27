import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import stylelint from 'stylelint'

const { createPlugin, utils } = stylelint
const { report, ruleMessages, validateOptions } = utils

/**
 * Rule 3 (R11/R12): a `var(--nave-*)` reference must name a custom property declared in the
 * stylesheet(s) a consumer's tokens come from. An undeclared name passes every other check in
 * this package, passes the build, and renders nothing — this rule is the one that catches it.
 *
 * Shipped as a stylelint plugin rule in THIS package (never as an `@eslint/css` rule in the
 * sibling `@navecss/eslint-plugin`): it runs where a consumer already lints CSS.
 */
export const ruleName = '@navecss/declared-custom-properties'

export const messages = ruleMessages(ruleName, {
  undeclared: (name) =>
    `"${name}" is not declared in the stylesheet this rule reads its custom-property names ` +
    'from. Declare it there, or correct the name.',
})

const NAVE_PREFIX = '--nave-'

/**
 * Every custom property whose name begins `--nave-`, declared ANYWHERE in `source`: the
 * stylesheet's top level, inside `@layer`, inside `@media`, inside a nested rule — every
 * declaration postcss's own recursive walk reaches, never assumed to sit at the top level.
 * `source` is either raw CSS text or an already-parsed postcss `Root`, so the same function
 * reads a standalone stylesheet string in a unit test and the `Root` stylelint hands a rule for
 * the file it is linting.
 *
 * A "declaration" here means exactly that: `--nave-color-primary: #fff;`. Registering a name
 * with `@property --nave-color-primary { ... }` alone does not count — that at-rule's own body
 * holds `syntax`/`inherits`/`initial-value` declarations, never one whose `prop` is the custom
 * property's own name — matching this rule's stated definition of "declared".
 */
export function collectDeclaredCustomProperties(source) {
  const root = typeof source === 'string' ? postcss.parse(source) : source
  const names = new Set()
  root.walkDecls((decl) => {
    if (decl.prop.startsWith(NAVE_PREFIX)) names.add(decl.prop)
  })
  return names
}

/**
 * Whether a postcss-value-parser node is a call to `var(...)`, matched case-insensitively:
 * CSS function names are case-insensitive, so `VAR(--nave-x)` is a var() reference too.
 */
function isVarFunctionNode(node) {
  return node.type === 'function' && node.value.toLowerCase() === 'var'
}

/**
 * Every `var(--nave-*)` reference in `source`, one `{ decl, name }` pair per reference: `decl`
 * the postcss `Declaration` node it was found in (so a rule can report a real position against
 * it), `name` the referenced custom property's name exactly as written (custom property names
 * are case-sensitive, unlike the `var`/`VAR` function name around them).
 *
 * `postcss-value-parser`'s own `walk` recurses into every nested function's arguments by
 * default, so this reaches a reference nested inside another `var()`'s fallback
 * (`var(--a, var(--nave-b))`), inside a custom property's own value
 * (`--my-own: var(--nave-c);`), and inside any other function nested in between (for example
 * `calc()`), with no special-casing for any of those shapes.
 */
export function findNaveVarReferences(source) {
  const root = typeof source === 'string' ? postcss.parse(source) : source
  const references = []
  root.walkDecls((decl) => {
    valueParser(decl.value).walk((node) => {
      if (!isVarFunctionNode(node)) return
      const nameNode = node.nodes.find((child) => child.type === 'word')
      if (nameNode && nameNode.value.startsWith(NAVE_PREFIX)) {
        references.push({ decl, name: nameNode.value })
      }
    })
  })
  return references
}

/**
 * A stable content digest. Exists only so this rule's OWN options carry the default
 * stylesheet's current bytes in some form: stylelint's `--cache` keys on the config string plus
 * stylelint's own version, never on the bytes of a file the config merely resolves and reads,
 * so a config that omitted this would replay a stale cached run after `@navecss/tokens` changed
 * a token, with nothing in the config's own text having changed to invalidate it.
 */
export function computeStylesheetDigest(content) {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * One cache entry per stylesheet path, live for the process: `{ mtimeMs, size, content, names }`.
 * Looked up again on every call so a repeated `stylelint.lint()` in the same process reuses a
 * parse of an unchanged file and re-parses one whose mtime or size changed, per this rule's own
 * documented memoisation contract; never invalidated by anything else.
 */
const stylesheetCache = new Map()

/**
 * Reads and parses the stylesheet at `absolutePath`, through the process-lifetime cache above.
 * Throws (uncaught, `fs`'s own error) when the file cannot be stat'd or read — callers wrap that
 * into a named configuration error.
 */
function readStylesheet(absolutePath) {
  const stat = statSync(absolutePath)
  const cached = stylesheetCache.get(absolutePath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached

  const content = readFileSync(absolutePath, 'utf8')
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    content,
    names: collectDeclaredCustomProperties(content),
  }
  stylesheetCache.set(absolutePath, entry)
  return entry
}

export const DEFAULT_STYLESHEET_SPECIFIER = '@navecss/tokens/css'

/**
 * Resolved from THIS package's own module — never a hardcoded path into the tokens package's
 * own source tree, and never a literal name for whatever file its build currently emits —
 * through Node's own module resolution for the specifier above, wherever `@navecss/tokens` is
 * installed for this package's own dependents. Its `exports` map decides what that specifier
 * resolves to; this file never repeats that choice.
 */
function resolveDefaultStylesheetPath() {
  return fileURLToPath(import.meta.resolve(DEFAULT_STYLESHEET_SPECIFIER))
}

/**
 * Names `entry` (the specifier or path a consumer configured, or this rule's own default),
 * never a path or process of ours beyond that: the configuration-error surface a run fails on
 * before any file is linted, not a lint warning, so the "speaks to the consumer, never our own
 * paths" house rule applies to the entry it names, not to Node's own underlying error text.
 */
function configurationError(entry, cause) {
  return new Error(
    `Could not read the custom-property declaration stylesheet "${entry}". It must exist and ` +
      `be readable before lint runs.${cause ? ` (${cause.message})` : ''}`,
    { cause },
  )
}

// Read once here, at module-load / config-construction time — never lazily inside a rule's
// `create()` — so an `@navecss/tokens` that cannot be resolved or read fails every import of
// this module, and so the digest below is computed from real bytes rather than assumed.
let defaultStylesheetPath
let defaultStylesheet
try {
  defaultStylesheetPath = resolveDefaultStylesheetPath()
  defaultStylesheet = readStylesheet(defaultStylesheetPath)
} catch (cause) {
  throw configurationError(DEFAULT_STYLESHEET_SPECIFIER, cause)
}

/**
 * This rule's default secondary options: no `stylesheet` entry (so it resolves
 * `@navecss/tokens/css` on its own), and the default stylesheet's current digest — see
 * `computeStylesheetDigest`'s own comment for why a digest belongs in the options at all.
 */
export const defaultRuleOptions = { digest: computeStylesheetDigest(defaultStylesheet.content) }

/**
 * `specifier` resolved from `cwd`, exactly as the README states: a relative or absolute path
 * resolves against `cwd` directly; anything else is a package specifier, resolved through
 * `cwd`'s own `node_modules` the way a bare import from a module rooted there would be.
 */
function resolveConsumerStylesheetPath(specifier, cwd) {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    return path.resolve(cwd, specifier)
  }
  return createRequire(path.join(cwd, 'noop.cjs')).resolve(specifier)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function rule(primaryOption, secondaryOptions) {
  if (!primaryOption) return () => {}

  const options = secondaryOptions ?? {}
  // Decision point: the spec text describing R11 speaks of "the stylesheets a rule option
  // names" (plural), but every acceptance criterion it ships with exercises exactly one
  // path — "an option naming the consumer's own stylesheet" (singular). Reading that as "the
  // (possibly several) sources this rule draws from" rather than "an array this option takes",
  // this rule's `stylesheet` option is a single string: the default source and a named source
  // are still two stylesheets in the general sense, just never combined behind one option. No
  // AC needs more, and YAGNI counsels against a speculative array option nothing here exercises.
  const stylesheetOption = options.stylesheet

  // Resolved and read once here, in the rule's own setup — called when stylelint constructs
  // this rule from a config, before any file in the run is linted — never lazily inside the
  // per-file checker returned below.
  const absolutePath = stylesheetOption
    ? resolveConsumerStylesheetPath(stylesheetOption, process.cwd())
    : defaultStylesheetPath

  let declaredNames
  try {
    declaredNames = readStylesheet(absolutePath).names
  } catch (cause) {
    throw configurationError(stylesheetOption ?? DEFAULT_STYLESHEET_SPECIFIER, cause)
  }

  return (root, result) => {
    const validOptions = validateOptions(
      result,
      ruleName,
      { actual: primaryOption, possible: [true, false] },
      {
        actual: options,
        possible: { stylesheet: [isNonEmptyString], digest: [isNonEmptyString] },
        optional: true,
      },
    )
    if (!validOptions) return

    for (const { decl, name } of findNaveVarReferences(root)) {
      if (!declaredNames.has(name)) {
        report({ message: messages.undeclared(name), node: decl, word: name, result, ruleName })
      }
    }
  }
}

rule.ruleName = ruleName
rule.messages = messages

export const declaredCustomPropertiesPlugin = createPlugin(ruleName, rule)
