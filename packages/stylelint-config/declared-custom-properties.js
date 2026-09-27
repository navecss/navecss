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
 * This rule: a `var(--nave-*)` reference must name a custom property declared in the
 * stylesheet(s) a consumer's tokens come from. An undeclared name passes every other check in
 * this package, passes the build, and renders nothing — this rule is the one that catches it.
 *
 * Shipped as a stylelint plugin rule in THIS package (never as an `@eslint/css` rule in the
 * sibling `@navecss/eslint-plugin`): it runs where a consumer already lints CSS.
 */
export const ruleName = '@navecss/declared-custom-properties'

const messages = ruleMessages(ruleName, {
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
 * Walks every `var(...)` call inside `value` and, for each whose name begins `--nave-`, calls
 * `onMatch` with that name. `postcss-value-parser`'s own `walk` recurses into every nested
 * function's arguments by default, so this reaches a reference nested inside another `var()`'s
 * fallback (`var(--a, var(--nave-b))`), inside a custom property's own value
 * (`--my-own: var(--nave-c);`), and inside any other function nested in between (for example
 * `calc()`), with no special-casing for any of those shapes.
 */
function collectNaveVarReferencesFromValue(value, onMatch) {
  valueParser(value).walk((node) => {
    if (!isVarFunctionNode(node)) return
    const nameNode = node.nodes.find((child) => child.type === 'word')
    if (nameNode && nameNode.value.startsWith(NAVE_PREFIX)) onMatch(nameNode.value)
  })
}

/**
 * Every `var(--nave-*)` reference in `source`, one `{ decl, name }` pair per reference: `decl`
 * the postcss node it was found in, a `Declaration` for a reference in a declaration's own
 * value, an `AtRule` for one in an at-rule's prelude (`@supports (color: var(--nave-typo))`), so
 * a rule can report a real position against either; `name` the referenced custom property's name
 * exactly as written (custom property names are case-sensitive, unlike the `var`/`VAR` function
 * name around them).
 */
export function findNaveVarReferences(source) {
  const root = typeof source === 'string' ? postcss.parse(source) : source
  const references = []
  root.walkDecls((decl) => {
    collectNaveVarReferencesFromValue(decl.value, (name) => {
      references.push({ decl, name })
    })
  })
  root.walkAtRules((atRule) => {
    collectNaveVarReferencesFromValue(atRule.params, (name) => {
      references.push({ decl: atRule, name })
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
 * A repeated `stylelint.lint()` in the same process reuses a parse of an unchanged file and
 * re-parses one whose mtime or size changed; never invalidated by anything else.
 */
const stylesheetCache = new Map()

/**
 * Reads and parses the stylesheet at `absolutePath`, through the process-lifetime cache above.
 * Throws (uncaught, `fs`'s own error) when the file cannot be stat'd or read — callers wrap that
 * into a named configuration error. Exported so a test can assert on the memoisation itself: the
 * SAME entry object for an unchanged file, a NEW one once its modification time or size changes.
 */
export function readStylesheet(absolutePath) {
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

const DEFAULT_STYLESHEET_SPECIFIER = '@navecss/tokens/css'

/**
 * Resolved from THIS package's own module (never a hardcoded path into the tokens package's own
 * source tree), through Node's own resolution for the specifier above, wherever `@navecss/tokens`
 * is installed for this package's own dependents. Its `exports` map decides what that resolves
 * to; this file never repeats that choice.
 */
function resolveDefaultStylesheetPath() {
  return fileURLToPath(import.meta.resolve(DEFAULT_STYLESHEET_SPECIFIER))
}

/**
 * Names `entry` (the specifier or path a consumer configured, or this rule's own default), never
 * a path or process of ours: a configuration error a run fails on, not a lint warning.
 */
function unreadableStylesheetError(entry, cause) {
  return new Error(
    `Could not read the custom-property declaration stylesheet "${entry}". It must exist and ` +
      `be readable before lint runs.${cause ? ` (${cause.message})` : ''}`,
    { cause },
  )
}

/**
 * Names the OPTION, never a raw exception from whatever tries to use its value as a path next:
 * `stylesheet` is a non-empty string or a non-empty array of non-empty strings, never else.
 */
function invalidStylesheetOptionError(value) {
  return new Error(
    'The "stylesheet" option of "@navecss/declared-custom-properties" must be a non-empty ' +
      `string or a non-empty array of non-empty strings. Got ${JSON.stringify(value)}.`,
  )
}

// Read once here, at module-load / config-construction time — never lazily inside a rule's
// `create()` — so an `@navecss/tokens` that cannot be resolved or read fails every import of
// this module, and so the digest below is computed from real bytes rather than assumed.
let defaultStylesheet
try {
  defaultStylesheet = readStylesheet(resolveDefaultStylesheetPath())
} catch (error) {
  throw unreadableStylesheetError(DEFAULT_STYLESHEET_SPECIFIER, error)
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
 * `cwd`'s own `node_modules` the way a bare import from a module rooted there would be. The
 * anchor filename below never exists (`createRequire` needs a path to resolve FROM, not a real
 * file), but a failed resolution names it in a "Require stack" line; caught here and replaced
 * with a message naming only `specifier` and `cwd`, never a file of ours that was never there.
 */
function resolveConsumerStylesheetPath(specifier, cwd) {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    return path.resolve(cwd, specifier)
  }
  try {
    return createRequire(path.join(cwd, 'nave-stylesheet-resolution.cjs')).resolve(specifier)
  } catch {
    throw new Error(`could not resolve the package specifier "${specifier}" from "${cwd}"`)
  }
}

/**
 * Whether `value` is a non-empty string.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * Whether `value` is a non-empty array of non-empty strings.
 */
function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => isNonEmptyString(entry))
}

/**
 * The `stylesheet` option takes a string or an array of strings, so this always returns the
 * specifiers to read as an array. Anything else is a configuration error naming the option
 * itself, thrown here before anything tries to resolve or read it as a path.
 */
function normaliseStylesheetSpecifiers(value) {
  if (isNonEmptyString(value)) return [value]
  if (isNonEmptyStringArray(value)) return value
  throw invalidStylesheetOptionError(value)
}

/**
 * The union of every `--nave-*` name declared across `specifiers`, resolved from `cwd` and read
 * through `readStylesheet`'s memoisation; a specifier that fails names itself, never the others.
 */
function declaredNamesAcross(specifiers, cwd) {
  const declaredNames = new Set()
  for (const specifier of specifiers) {
    let entry
    try {
      entry = readStylesheet(resolveConsumerStylesheetPath(specifier, cwd))
    } catch (error) {
      throw unreadableStylesheetError(specifier, error)
    }
    for (const name of entry.names) declaredNames.add(name)
  }
  return declaredNames
}

/**
 * Stylelint's own rule factory, called anew for every file it checks the rule against.
 */
function rule(primaryOption, secondaryOptions) {
  if (!primaryOption) return () => {}

  const options = secondaryOptions ?? {}
  const stylesheetOption = options.stylesheet

  // Stylelint constructs this rule anew for every file it checks it against (never once for the
  // whole run), so this runs on the FIRST file the rule sees and throws there if a stylesheet is
  // misconfigured or unreadable, aborting before a later file changes anything about it.
  // `readStylesheet` memoises by path, mtime and size, so a later file's own construction, in
  // the same process, re-reads only a stylesheet that actually changed since. Under `--cache`,
  // though, stylelint may skip calling this rule at all for a file it considers unchanged, so a
  // stylesheet deleted or edited after the last cold run goes unnoticed until the cache clears.
  const declaredNames =
    stylesheetOption === undefined
      ? defaultStylesheet.names
      : declaredNamesAcross(normaliseStylesheetSpecifiers(stylesheetOption), process.cwd())

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
