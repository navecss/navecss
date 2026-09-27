/**
 * AC-directive-core-29's pure logic: finding fenced code blocks in a doc,
 * finding what they import from `@navecss/core` or run via `navecss-core`,
 * and checking each against core's live `package.json`, `tsup.config.ts`
 * and source files. Not a test file and registers no tests, the same shape
 * as `../../tokens/test/theming/markdown-headings.ts`.
 */

export interface Fence {
  readonly body: string
  readonly doc: string
  readonly lang: string
}

/**
Every ```lang ... ``` fenced block in `text`, tagged with which doc it came from.
 */
export function extractFences(doc: string, text: string): Fence[] {
  return text
    .matchAll(/```([\w-]*)\n([\s\S]*?)```/g)
    .map((m) => ({ body: m[2] ?? '', doc, lang: m[1] ?? '' }))
    .toArray()
}

export interface ImportedName {
  readonly isDefault: boolean
  readonly isType: boolean
  readonly name: string
}

export interface CoreImport {
  readonly names: readonly ImportedName[]
  readonly specifier: string
}

/**
One `{ a, type B, c as D }` clause's names, each resolved to its exported name and whether it is type-only (either its own `type` prefix, or the whole clause being `import type`/`export type`).
 */
function parseNamedClause(namedRaw: string, isWholeClauseType: boolean): ImportedName[] {
  const items = namedRaw
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
  return items.map((item) => {
    const isType = isWholeClauseType || item.startsWith('type ')
    const withoutType = item.replace(/^type\s+/, '')
    // A single space on each side of the collapsed whitespace, not the two-sided \s+as\s+
    // regex a static ReDoS scanner flags on principle: this operates on one already-trimmed,
    // short clause item from a code fence, never on untrusted or large input, but collapsing
    // internal whitespace first and splitting on the fixed literal ' as ' needs no backtracking
    // at all.
    const normalized = withoutType.replaceAll(/\s+/g, ' ')
    const asIndex = normalized.indexOf(' as ')
    const name = (asIndex === -1 ? normalized : normalized.slice(asIndex + 4)).trim()
    return { isDefault: false, isType, name }
  })
}

/**
Every JS/TS `import ... from '@navecss/core...'` and every CSS `@import url('@navecss/core...')` in `body`. A CSS `@import` carries no names.
 */
export function extractCoreImports(body: string): CoreImport[] {
  // Collapsed to single spaces first, so the regex below can spell every gap as one literal
  // ' ' instead of \s*/\s+: a static ReDoS scanner flags the ORIGINAL's several independent
  // whitespace quantifiers sitting next to optional groups on principle (measured: the original
  // was already linear on adversarial input, since none of its character classes actually
  // overlap, but a shape with no quantifier left to flag needs no such argument to trust). Only
  // the NAMES and specifier this function returns matter to every caller, never a source
  // position in `body`, so losing the original whitespace here costs nothing.
  const normalizedBody = body.replaceAll(/\s+/g, ' ')
  const jsImports = normalizedBody
    .matchAll(
      /import (type )?(?:([\w$]+),? ?)?(?:\{([^}]*)\})? ?from ?['"](@navecss\/core[^'"]*)['"]/g,
    )
    .map((m): CoreImport => {
      const [, isWholeType, defaultName, namedRaw, specifier] = m
      const names: ImportedName[] = defaultName
        ? [{ isDefault: true, isType: false, name: defaultName }]
        : []
      names.push(...parseNamedClause(namedRaw ?? '', Boolean(isWholeType)))
      return { names, specifier: specifier! }
    })
    .toArray()

  const cssImports = body
    .matchAll(/@import\s+url\(\s*['"](@navecss\/core[^'"]*)['"]\s*\)/g)
    .map((m): CoreImport => ({ names: [], specifier: m[1]! }))
    .toArray()

  return [...jsImports, ...cssImports]
}

export interface BinInvocation {
  readonly flags: readonly string[]
  readonly subcommand: string
}

/**
Every `navecss-core <subcommand> [--flag[=value] ...]` run inside `body` (a shell line, or a `package.json` script string).
 */
export function extractBinInvocations(body: string): BinInvocation[] {
  return body
    .matchAll(/navecss-core\s+([a-z-]+)((?:\s+--[\w-]+(?:=\S+)?)*)/g)
    .map((m) => ({
      flags: (m[2] ?? '')
        .matchAll(/--([\w-]+)(?:=\S+)?/g)
        .map((f) => f[1]!)
        .toArray(),
      subcommand: m[1]!,
    }))
    .toArray()
}

/**
The exports-map subpath key a specifier resolves to: `'@navecss/core'` -> `'.'`, `'@navecss/core/postcss'` -> `'./postcss'`.
 */
export function subpathKey(specifier: string): string {
  const rest = specifier.slice('@navecss/core'.length)
  return rest === '' ? '.' : `.${rest}`
}

interface ExportedNames {
  readonly hasDefault: boolean
  readonly types: ReadonlySet<string>
  readonly values: ReadonlySet<string>
}

/**
Local `export const/function/class NAME` and `export interface/type NAME` declarations from `sourceText`, added directly into `values`/`types`.
 */
function collectDeclaredExports(sourceText: string, values: Set<string>, types: Set<string>): void {
  for (const m of sourceText.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm))
    values.add(m[1]!)
  for (const m of sourceText.matchAll(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm)) values.add(m[1]!)
  for (const m of sourceText.matchAll(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm)) values.add(m[1]!)
  for (const m of sourceText.matchAll(/^export\s+interface\s+([A-Za-z_$][\w$]*)/gm))
    types.add(m[1]!)
  for (const m of sourceText.matchAll(/^export\s+type\s+([A-Za-z_$][\w$]*)/gm)) types.add(m[1]!)
}

/**
Every top-level export declared or re-exported by `sourceText`, split into value and type names — a text scan of the real `.ts` source, not the built declaration file, so this needs no build step to run.
 */
export function collectExportedNames(sourceText: string): ExportedNames {
  const values = new Set<string>()
  const types = new Set<string>()
  let hasDefault = /^export\s+default\b/m.test(sourceText)

  collectDeclaredExports(sourceText, values, types)

  const braceClauses = sourceText.matchAll(
    /^export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?/gm,
  )
  for (const m of braceClauses) {
    const names = parseNamedClause(m[2]!, Boolean(m[1]))
    for (const { isType, name } of names) {
      if (name === 'default') hasDefault = true
      else (isType ? types : values).add(name)
    }
  }

  return { hasDefault, types, values }
}

const WORD_OR_DOLLAR = /[\w$]/

/**
One bare `key: 'value'` pair (tsup's own `entry` shape — unquoted keys) at or after `from` in
`text`, or `undefined` past the last usable colon. A hand-rolled scan, not
`/([\w$]+):\s*['"]([^'"]+)['"]/g`: that regex's `[\w$]+` has nothing to stop it trying every
length before giving up and moving on when a colon is missing nearby, which is O(n) wasted work
at every scanned position and O(n²) overall on a `tsup.config.ts` with few or no `entry` colons —
the exact shape `cssTrim`'s own regex was replaced for. `indexOf` for the colon and for the
closing quote, and the backward walk over the key's own word-character run, each advance the
scan position monotonically and never revisit the same character twice across iterations, so the
whole function is O(n) regardless of content.
 */
function nextEntryPair(
  text: string,
  from: number,
): { key: string; nextFrom: number; value: string } | undefined {
  let searchFrom = from
  for (;;) {
    const colonIndex = text.indexOf(':', searchFrom)
    if (colonIndex === -1) return undefined

    let keyStart = colonIndex
    while (keyStart > searchFrom && WORD_OR_DOLLAR.test(text[keyStart - 1]!)) keyStart--
    if (keyStart === colonIndex) {
      searchFrom = colonIndex + 1
      continue
    }

    let valueStart = colonIndex + 1
    while (valueStart < text.length && /\s/.test(text[valueStart]!)) valueStart++
    const quote = text[valueStart]
    if (quote !== '"' && quote !== "'") {
      searchFrom = colonIndex + 1
      continue
    }
    const closeIndex = text.indexOf(quote, valueStart + 1)
    if (closeIndex === -1) return undefined

    return {
      key: text.slice(keyStart, colonIndex),
      nextFrom: closeIndex + 1,
      value: text.slice(valueStart + 1, closeIndex),
    }
  }
}

/**
tsup's `entry` map (subpath name -> src file), read from the object literal in `tsup.config.ts` rather than by importing it, so this needs no tsup runtime behaviour.
 */
export function loadEntryMap(tsupConfigText: string): Record<string, string> {
  const block = /entry:\s*\{([\s\S]*?)\}/.exec(tsupConfigText)
  if (!block) return {}
  const content = block[1]!

  const entries: Record<string, string> = {}
  let from = 0
  for (;;) {
    const pair = nextEntryPair(content, from)
    if (!pair) break
    if (pair.key) entries[pair.key] = pair.value
    from = pair.nextFrom
  }
  return entries
}

/**
One problem string per name in `imp` that a real subpath's source does not export.
 */
function checkImportedNames(
  imp: CoreImport,
  srcFile: string,
  readSource: (relPath: string) => string,
): string[] {
  const exported = collectExportedNames(readSource(srcFile))
  const problems: string[] = []
  for (const { isDefault, isType, name } of imp.names) {
    if (isDefault) {
      if (!exported.hasDefault) problems.push(`${imp.specifier} has no default export`)
      continue
    }
    const isKnown = isType
      ? exported.types.has(name) || exported.values.has(name)
      : exported.values.has(name)
    if (!isKnown) problems.push(`${imp.specifier} exports no ${isType ? 'type ' : ''}"${name}"`)
  }
  return problems
}

/**
One problem string per thing wrong with `imp`, given the live `exports` map and `entryMap`; empty when `imp` is entirely valid. `readSource` loads a src file's text (injected so tests can use synthetic sources).
 */
export function checkCoreImport(
  imp: CoreImport,
  exportsMap: Record<string, unknown>,
  entryMap: Record<string, string>,
  readSource: (relPath: string) => string,
): string[] {
  const key = subpathKey(imp.specifier)
  if (!Object.hasOwn(exportsMap, key)) return [`${imp.specifier} is not a key of core's exports`]
  if (imp.names.length === 0) return []

  const srcFile = key === '.' ? undefined : entryMap[key.slice(2)]
  if (srcFile === undefined) {
    return imp.names.map(
      ({ name }) =>
        `${imp.specifier} has no JS entry, so importing "${name}" from it names nothing`,
    )
  }
  return checkImportedNames(imp, srcFile, readSource)
}

// Slice 1 only. A later slice's subcommand (e.g. `expand`) is added here
// when it ships — until then, a fence naming it is a real doc bug.
const KNOWN_BIN_SUBCOMMANDS: Readonly<Record<string, ReadonlySet<string>>> = {
  check: new Set(['help', 'source']),
}

/**
One problem string per thing wrong with `invocation`; empty when it names a real subcommand and only flags that subcommand accepts.
 */
export function checkBinInvocation(invocation: BinInvocation): string[] {
  const flags = KNOWN_BIN_SUBCOMMANDS[invocation.subcommand]
  if (!flags) return [`navecss-core has no subcommand "${invocation.subcommand}"`]
  return invocation.flags
    .filter((f) => !flags.has(f))
    .map((f) => `navecss-core ${invocation.subcommand} accepts no --${f}`)
}
