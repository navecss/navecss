#!/usr/bin/env node
/**
 * Instrument for the zero-runtime invariant (docs/04-adr/0004-zero-runtime-scope.md): nothing
 * Nave ships computes, generates, injects or mutates a style in the browser. That decision has
 * stood on inspection alone — `dist/cx.js` reads as a short string map, `@navecss/tokens`'s JS
 * entries read as constants — which is exactly the state an invariant should not rest on: it
 * holds until someone changes it without knowing what it costs.
 *
 * WHAT THIS CHECKS. For every published entry a non-private workspace package's own `exports`
 * map (or, lacking one, its `main`/`module`/`browser` fields) reaches a `.js`, `.mjs`, or `.cjs`
 * file, bundle that entry the way a consumer's own bundler would (the built `dist/` output plus
 * whatever it still imports, e.g. a sibling chunk or another `@navecss/*` package) and scan the
 * bundled text for a small denylist of browser styling globals: `document`, `CSSStyleSheet`,
 * `getComputedStyle`, `insertRule`, `adoptedStyleSheets`, a write to `.style` (an assignment or
 * a `setProperty`/`removeProperty` call), and `setAttribute("style", ...)`. None of those has
 * any legitimate reason to appear in bytes Nave ships; their presence is exactly what "computes
 * or mutates a style in the browser" means in practice. This is a textual scan of bundled text,
 * not a parse of it, so it has limits in both directions (see `DENYLIST`'s docblock): it can
 * flag a `style` property that has nothing to do with the DOM, and it does not see a write made
 * through an alias of an element's `style` object.
 *
 * WHY BUNDLE RATHER THAN GREP `dist/` DIRECTLY. A source file can import a browser-styling
 * global through a re-export, a barrel, or a sibling chunk without the offending identifier
 * ever appearing in the entry file itself; only the bundled output shows what a consumer
 * actually receives at that specifier. Reading `exports` map keys, rather than a `dist/` walk,
 * is what makes a new entry covered automatically: nothing here is edited to add one.
 *
 * WHAT COUNTS AS EXTERNAL, AND WHY NOT "EVERYTHING A CONSUMER'S BUNDLER WOULD INLINE". A
 * sibling `@navecss/*` workspace package is resolved and inlined: it is Nave's own shipped
 * code, reached the same way a consumer reaches it, and the reason this check bundles rather
 * than greps `dist/` directly (above) applies to it exactly as it does to the entry itself. A
 * THIRD-PARTY dependency — anything not under the `@navecss/` scope, `peerDependencies`
 * included — is left external instead of inlined, and that is a narrower claim than "a
 * consumer's bundler would keep it separate": measured while building this check, inlining
 * `@navecss/stylelint-config`'s real runtime dependency pulled in a feature-detection string
 * from deep in its own dependency tree ("[object HTML document.all class]") that trips the
 * `document` pattern below with nothing Nave wrote anywhere near it. A third-party package's
 * internals are that package's own review's job, not this invariant's; scanning them here buys
 * false alarms, not coverage.
 *
 * NEGATIVE CONTROL. `check-zero-runtime-js.test.mjs` bundles a fixture entry that genuinely
 * injects a `<style>` element and asserts this check flags it — a check with no proof it can
 * fail is not a check.
 */
import { build } from 'esbuild'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isNonPrivate } from './check-license-parity.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
The file extensions that count as a runtime JavaScript target reachable through an `exports`
map condition.
 */
const RUNTIME_EXTENSIONS = ['.js', '.mjs', '.cjs']

/**
 * Walks an `exports` map VALUE (or a legacy `main`/`module`/`browser` field's value) and adds
 * every runtime file path it reaches to `into` (a `Set`, so a path named more than once
 * collapses to a single membership). A string value is added when it ends in a
 * `RUNTIME_EXTENSIONS` suffix. An ARRAY is Node's own "fallback array" shape: every item is
 * walked in turn, at whatever depth it is nested (`{ import: ['./a.js', './b.js'] }` yields
 * both). An object value is walked condition by condition, skipping `types` (a type-declaration
 * path is never runtime code) and recursing into a nested conditions object (`{ import: {
 * types: '...', default: './i.js' } }`), so every runtime target reachable through any other
 * condition key, at any depth, is collected, not just the first one found. `null` and anything
 * else contribute nothing.
 */
function collectRuntimeTargets(value, into) {
  if (typeof value === 'string') {
    if (RUNTIME_EXTENSIONS.some((extension) => value.endsWith(extension))) into.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRuntimeTargets(item, into)
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [condition, nested] of Object.entries(value)) {
    if (condition === 'types') continue
    collectRuntimeTargets(nested, into)
  }
}

/**
 * `packageName` + `exportKey` as a consumer would type it in an `import`, e.g.
 * `('@navecss/core', './cx')` -> `'@navecss/core/cx'`, and `('@navecss/core', '.')` ->
 * `'@navecss/core'`.
 */
export function consumerFacingSpecifier(packageName, exportKey) {
  return exportKey === '.' ? packageName : packageName + exportKey.slice(1)
}

/**
 * `collectRuntimeTargets(value)` turned into `jsExportEntries` result shape for one `exportKey`:
 * one entry per distinct runtime path reached, all sharing `exportKey`'s specifier.
 */
function runtimeEntriesForKey(packageName, exportKey, value) {
  const targets = new Set()
  collectRuntimeTargets(value, targets)
  return Array.from(targets, (relativePath) => ({
    specifier: consumerFacingSpecifier(packageName, exportKey),
    relativePath,
  }))
}

/**
 * `main`, `module`, and `browser`, in that order, each attributed to the package's own root
 * specifier and deduplicated by path: the legacy entry points a consumer's resolver or bundler
 * still reads when `manifest` carries no `exports` field at all. Only a STRING value counts as
 * naming one file; `browser`'s other legal shape, an object mapping individual specifiers to
 * browser replacements, names no single entry point and is skipped.
 */
function legacyEntryFields(manifest) {
  const entries = []
  const seenPaths = new Set()
  for (const field of ['main', 'module', 'browser']) {
    const value = manifest[field]
    if (typeof value !== 'string') continue
    if (RUNTIME_EXTENSIONS.every((extension) => !value.endsWith(extension))) continue
    if (seenPaths.has(value)) continue
    seenPaths.add(value)
    entries.push({ specifier: manifest.name, relativePath: value })
  }
  return entries
}

/**
 * Every `exports` key of `manifest` that reaches at least one runtime `.js`/`.mjs`/`.cjs` file,
 * one entry per (key, path) pair. Covers every shape Node's own resolver accepts for `exports`:
 * a SUBPATH MAP (the package's own root `.` plus every non-pattern subpath, excluding
 * `./package.json`, resolver metadata that is never runtime code, and any subpath PATTERN such
 * as `./styles/*`, which names a family rather than one file this script could bundle);
 * top-level SHORTHAND for "just the root", spelled as a bare string (`"exports":
 * "./index.js"`), a fallback ARRAY (`"exports": ["./index.js"]`), or a top-level CONDITIONS
 * object whose keys are condition names rather than subpaths (`{ "exports": { "import":
 * "./i.js" } }`) — distinguished from a subpath map by having no key equal to `.` or starting
 * with `./`; Node treats mixing the two shapes in one map as invalid, and a mixed map met here
 * is read as a subpath map, keeping today's behaviour for its `.`-rooted keys rather than
 * guessing at the author's intent. Deliberately keeps `.` in scope, unlike a
 * documentation-coverage reading of the same map: a package whose only export is `.` (a plain
 * JS entry with no subpath alias) would otherwise never be checked at all. A key naming more
 * than one distinct runtime path, whether through more than one condition (`browser` and
 * `import` together) or a fallback array, is audited on every one of them, not just the first
 * found; two conditions naming the SAME path (`import` and `default` both pointing at one file,
 * the shape `@navecss/tokens` ships) collapse to a single entry for that key.
 *
 * When `manifest` has NO `exports` field at all, falls back to `legacyEntryFields`. Once
 * `exports` is present, even as `null` or an empty object, it is authoritative and `main` /
 * `module` / `browser` are never consulted, matching how a resolver treats them.
 */
export function jsExportEntries(manifest) {
  const exportsField = manifest.exports

  if (exportsField === undefined) return legacyEntryFields(manifest)
  if (exportsField === null) return []
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    return runtimeEntriesForKey(manifest.name, '.', exportsField)
  }
  if (typeof exportsField !== 'object') return []

  const isSubpathMap = Object.keys(exportsField).some((key) => key === '.' || key.startsWith('./'))
  if (!isSubpathMap) {
    return runtimeEntriesForKey(manifest.name, '.', exportsField)
  }

  const entries = []
  for (const [key, value] of Object.entries(exportsField)) {
    if (key !== '.' && !key.startsWith('./')) continue // a top-level conditions object's key
    if (key === './package.json' || key.includes('*')) continue
    entries.push(...runtimeEntriesForKey(manifest.name, key, value))
  }
  return entries
}

/**
 * A textual match for reaching the `style` DOM property under either spelling a bundler or a
 * minifier might emit: the dot form `.style`, or a bracket access keyed by a string naming
 * `style` (single-quoted, double-quoted, or a template literal — `['style']`, `["style"]`, or
 * `` [`style`] ``). Shared by the `.style assignment` and `.style method call` entries below so
 * both recognize the same set of spellings for "this is the style property", not just the dot
 * one.
 */
const STYLE_ACCESS_SOURCE = String.raw`(?:\.style|\[\s*['"\x60]style['"\x60]\s*\])`

/**
 * Every JavaScript assignment operator (`=`, and the fifteen compound forms: `+=` `-=` `*=` `/=`
 * `%=` `**=` `<<=` `>>=` `>>>=` `&=` `|=` `^=` `&&=` `||=` `??=`), so `.style assignment` fires
 * on any of them, not only `=`. Each alternative is a fixed literal, so a shorter one simply
 * fails to match where the text is a longer one that starts the same way: `*=` cannot match
 * against `**=`'s text because that text's second character is `*`, not `=`, so the `**=`
 * alternative is what matches there instead; no ordering between alternatives is needed for
 * correctness. Comparison operators are excluded by omission, not by exclusion: `<=`, `>=`,
 * `!=`, and `!==` never appear as alternatives, and none of the listed assignment operators
 * matches where one of those starts, since `<<=`/`>>=`/`>>>=` all require a repeated `<` or `>`
 * that `<=`/`>=` do not have. `==`, `===`, and `=>` are the one case that does share a leading
 * character with a listed operator (bare `=`), so the trailing `(?!=|>)` on that alternative
 * rules out a second `=` or a following `>` specifically.
 */
const ASSIGNMENT_OPERATOR_SOURCE = String.raw`(?:\*\*=|<<=|>>>=|>>=|&&=|\|\|=|\?\?=|\+=|-=|\*=|/=|%=|&=|\|=|\^=|=(?!=|>))`

/**
 * The browser styling globals ADR 0004 forbids a shipped entry from touching, as
 * `{ name, pattern }` pairs so a hit can be reported by name. Several patterns are scoped
 * tighter than a bare identifier match, each for the same reason: bundled prose (an error
 * message, a docblock string a bundler could not strip) can contain the plain word without any
 * DOM access nearby. `document` requires the shape of an actual property access
 * (`document.foo`, `document[...]`, and the optional-chained `document?.foo` /
 * `document?.[...]`) rather than the bare word, which is what let "a pointer starts at the
 * document root" (an error message about a JSON document, not the DOM) false-positive while
 * this check was being built. Writing through `.style` (or its bracket-string spelling, see
 * `STYLE_ACCESS_SOURCE`) is covered by three entries rather than one, because a write reaches
 * the DOM through more than one shape: `.style assignment` fires on any assignment operator
 * (see `ASSIGNMENT_OPERATOR_SOURCE`) to `.style` itself, a `.style` property (`.style.color =
 * ...`, minification-safe: no space required around the operator), or a bracketed `.style`
 * index, matching the ADR's own wording that a bare read (`el.style.color`) is not what the
 * invariant forbids on its own, writing one is; `.style method call` fires on
 * `el.style.setProperty(...)` and `el.style.removeProperty(...)`, plain or optional-chained
 * (`el.style?.setProperty(...)`), which write without an assignment operator anywhere in sight;
 * `setAttribute("style", ...)` fires on setting the whole attribute the same way, through
 * `Element.setAttribute`, and is not affected by the bracket-string spelling above since an
 * attribute name is always a string argument, never a property access.
 *
 * ALL OF THIS IS A TEXTUAL MATCH, NOT A PARSE, and it has limits in both directions. It cannot
 * tell a DOM element's `.style` apart from an unrelated `style` property on a plain object, so
 * `config.style.indent = 2` is flagged; a false positive like that is dismissed by a human. And
 * it only sees a write spelled directly through `.style` (or its bracket-string form): once the
 * style object is aliased or passed through a value, as in `const s = el.style; s.color = t`,
 * `(0, e.style).color = t` or `Object.assign(el.style, { color: t })`, the write is not seen.
 * Following those needs a parse of the bundle rather than a scan of its text, so they are left
 * to code review.
 */
export const DENYLIST = [
  {
    name: 'document',
    pattern: /\bdocument(?:\?\.(?:[A-Za-z_$]|\[)|\.[A-Za-z_$]|\s*\[)/,
  },
  { name: 'CSSStyleSheet', pattern: /\bCSSStyleSheet\b/ },
  { name: 'getComputedStyle', pattern: /\bgetComputedStyle\b/ },
  { name: 'insertRule', pattern: /\binsertRule\b/ },
  { name: 'adoptedStyleSheets', pattern: /\badoptedStyleSheets\b/ },
  {
    name: '.style assignment',
    pattern: new RegExp(
      STYLE_ACCESS_SOURCE +
        String.raw`(?:\.[A-Za-z_$][\w$]*)?(?:\s*\[[^\]\n]*\])?\s*` +
        ASSIGNMENT_OPERATOR_SOURCE,
    ),
  },
  {
    name: '.style method call',
    pattern: new RegExp(STYLE_ACCESS_SOURCE + String.raw`\??\.(?:setProperty|removeProperty)\s*\(`),
  },
  { name: 'setAttribute("style", ...)', pattern: /\.setAttribute\s*\(\s*["'`]style["'`]/ },
]

/**
The denylisted global names (`DENYLIST`) found in `code`, deduplicated, in table order.
 */
export function findDenylistHits(code) {
  return DENYLIST.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name)
}

/**
 * An esbuild plugin that lets a bare `@navecss/*` import resolve and inline normally (a
 * sibling workspace package) and marks every OTHER bare (non-relative) import external,
 * covering both a real third-party dependency and a Node built-in alike (the latter is already
 * covered by `platform: 'node'` below; doing it here too costs nothing and needs no
 * cross-referencing to stay correct if that option ever changes).
 */
function externalizeThirdPartyPlugin() {
  return {
    name: 'nave-externalize-third-party',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.path.startsWith('@navecss/')) return undefined
        return { path: args.path, external: true }
      })
    },
  }
}

/**
 * Bundles `entryAbsPath` the way a consumer's own bundler would, per the module docblock's
 * "what counts as external": a sibling `@navecss/*` import is resolved and inlined, everything
 * else is left external. Returns the bundled source text; nothing here executes it.
 */
export async function bundleEntry(entryAbsPath) {
  const result = await build({
    entryPoints: [entryAbsPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [externalizeThirdPartyPlugin()],
    logLevel: 'silent',
  })
  return result.outputFiles.map((file) => file.text).join('\n')
}

/**
Bundles one `jsExportEntries` entry (rooted at `packageDir`) and scans it.
 */
export async function auditEntry(packageDir, entry) {
  const entryAbsPath = path.join(packageDir, entry.relativePath)
  const code = await bundleEntry(entryAbsPath)
  return { specifier: entry.specifier, hits: findDenylistHits(code) }
}

/**
Workspace package directory names under `packagesDir`, sorted for stable output.
 */
function listPackageDirs(packagesDir) {
  return readdirSync(packagesDir)
    .filter((entry) => statSync(path.join(packagesDir, entry)).isDirectory())
    .sort()
}

/**
`rootDir` defaults to this repository; a test passes a fixture root instead.
 */
export async function main(rootDir = ROOT) {
  const packagesDir = path.join(rootDir, 'packages')
  const violations = []
  const checkedSpecifiers = []
  const checkedPackages = new Set()
  const skippedPrivate = []
  const skippedNoJsExports = []

  for (const dir of listPackageDirs(packagesDir)) {
    const manifestPath = path.join(packagesDir, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const name = manifest.name ?? dir

    if (!isNonPrivate(manifest)) {
      skippedPrivate.push(name)
      continue
    }

    const entries = jsExportEntries(manifest)
    if (entries.length === 0) {
      skippedNoJsExports.push(name)
      continue
    }
    checkedPackages.add(name)

    const packageDir = path.join(packagesDir, dir)
    for (const entry of entries) {
      checkedSpecifiers.push(entry.specifier)
      const { hits } = await auditEntry(packageDir, entry)
      if (hits.length > 0) violations.push({ specifier: entry.specifier, hits })
    }
  }

  if (violations.length > 0) {
    console.error('Bundled output references a browser styling global ADR 0004 forbids:\n')
    for (const { specifier, hits } of violations) {
      console.error(`  - ${specifier}: ${hits.join(', ')}`)
    }
    console.error(
      '\nNothing Nave ships may compute, generate, inject or mutate a style in the browser ' +
        '(docs/04-adr/0004-zero-runtime-scope.md). Move the offending code to build time. If ' +
        'this really is a platform use the invariant does not cover, that is a decision for the ' +
        'ADR to state, not a reason to silence or narrow this check.',
    )
    process.exitCode = 1
    return
  }

  const skippedClause =
    skippedPrivate.length > 0 ? `; skipped private package(s): ${skippedPrivate.join(', ')}` : ''
  console.log(
    `Zero-runtime JS guard: ${checkedSpecifiers.length} published entry(ies) bundled across ` +
      `${checkedPackages.size} package(s) (${checkedSpecifiers.join(', ')}), none reference a ` +
      `denylisted browser styling global${skippedClause}.`,
  )
  if (skippedNoJsExports.length > 0) {
    console.log(`No JS entries to check: ${skippedNoJsExports.join(', ')}.`)
  }
}

// Compare REALPATHS on both sides: `import.meta.url` is percent-encoded and symlink-resolved,
// `process.argv[1]` is neither, so an invocation through a symlinked absolute path makes the
// two disagree and `main()` silently never fires. `process.argv[1] &&` guards the import case,
// where `argv[1]` is undefined.
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  await main()
}
