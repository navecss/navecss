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
    const asMatch = withoutType.split(/\s+as\s+/)
    const name = (asMatch[1] ?? asMatch[0])!.trim()
    return { isType, name }
  })
}

/**
Every JS/TS `import ... from '@navecss/core...'` and every CSS `@import url('@navecss/core...')` in `body`. A CSS `@import` carries no names.
 */
export function extractCoreImports(body: string): CoreImport[] {
  const jsImports = body
    .matchAll(
      /import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"](@navecss\/core[^'"]*)['"]/g,
    )
    .map((m): CoreImport => {
      const [, isWholeType, defaultName, namedRaw, specifier] = m
      const names: ImportedName[] = defaultName ? [{ isType: false, name: defaultName }] : []
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

/**
tsup's `entry` map (subpath name -> src file), read from the object literal in `tsup.config.ts` rather than by importing it, so this needs no tsup runtime behaviour.
 */
export function loadEntryMap(tsupConfigText: string): Record<string, string> {
  const block = /entry:\s*\{([\s\S]*?)\}/.exec(tsupConfigText)
  if (!block) return {}
  const entries: Record<string, string> = {}
  const pairs = block[1]!.matchAll(/([\w$]+):\s*['"]([^'"]+)['"]/g)
  for (const m of pairs) entries[m[1]!] = m[2]!
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
  return imp.names
    .filter(
      ({ isType, name }) =>
        !(isType
          ? exported.types.has(name) || exported.values.has(name)
          : exported.values.has(name)),
    )
    .map(({ isType, name }) => `${imp.specifier} exports no ${isType ? 'type ' : ''}"${name}"`)
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
