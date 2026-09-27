#!/usr/bin/env node
/**
 * Instrument for the zero-runtime invariant (docs/04-adr/0004-zero-runtime-scope.md): nothing
 * Nave ships computes, generates, injects or mutates a style in the browser. That decision has
 * stood on inspection alone — `dist/cx.js` reads as a short string map, `@navecss/tokens`'s JS
 * entries read as constants — which is exactly the state an invariant should not rest on: it
 * holds until someone changes it without knowing what it costs.
 *
 * WHAT THIS CHECKS. For every published entry a non-private workspace package's own `exports`
 * map resolves to a `.js` file, bundle that entry the way a consumer's own bundler would (the
 * built `dist/` output plus whatever it still imports, e.g. a sibling chunk or another
 * `@navecss/*` package) and scan the bundled text for a small denylist of browser styling
 * globals: `document`, `CSSStyleSheet`, `getComputedStyle`, `insertRule`, `adoptedStyleSheets`,
 * and an assignment through `.style`. None of those has any legitimate reason to appear in
 * bytes Nave ships; their presence is exactly what "computes or mutates a style in the browser"
 * means in practice.
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
`exports` map condition keys that name a runtime JavaScript file, checked in this order.
 */
const RUNTIME_CONDITIONS = ['import', 'default', 'module', 'require']

/**
 * The runtime file path an `exports` map VALUE resolves to, or `null` when it names no single
 * runtime file (a `null` block, a nested subpath map, or a value carrying only non-runtime
 * conditions such as `types`).
 */
export function resolveExportTarget(value) {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  for (const condition of RUNTIME_CONDITIONS) {
    if (typeof value[condition] === 'string') return value[condition]
  }
  return null
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
 * Every `exports` key of `manifest` that resolves to a runtime `.js` file: the package's own
 * root (`.`) plus every non-pattern subpath, excluding `./package.json` (resolver metadata,
 * never runtime code) and any subpath PATTERN (`./styles/*` names a family, not one file this
 * script could bundle as a single entry). Deliberately keeps `.` in scope, unlike a
 * documentation-coverage reading of the same map: a package whose only export is `.` (a plain
 * JS entry with no subpath alias) would otherwise never be checked at all.
 */
export function jsExportEntries(manifest) {
  const exportsField = manifest.exports
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return []
  }
  const entries = []
  for (const [key, value] of Object.entries(exportsField)) {
    if (key !== '.' && !key.startsWith('./')) continue // a top-level conditions object's key
    if (key === './package.json' || key.includes('*')) continue
    const target = resolveExportTarget(value)
    if (typeof target === 'string' && target.endsWith('.js')) {
      entries.push({ specifier: consumerFacingSpecifier(manifest.name, key), relativePath: target })
    }
  }
  return entries
}

/**
 * The browser styling globals ADR 0004 forbids a shipped entry from touching, as
 * `{ name, pattern }` pairs so a hit can be reported by name. Two patterns are scoped tighter
 * than a bare identifier match, and both for the same reason: bundled prose (an error message,
 * a docblock string a bundler could not strip) can contain the plain English word without any
 * DOM access nearby. `document` requires the shape of an actual property access
 * (`document.foo`, `document[...]`) rather than the bare word, which is what let "a pointer
 * starts at the document root" (an error message about a JSON document, not the DOM) false-
 * positive while this check was being built. `.style assignment` is additionally scoped to an
 * ASSIGNMENT (`=`, never `==`/`===`) through an optional bracket index, matching the ADR's own
 * wording: a bare read (`el.style.color`) is not what the invariant forbids on its own, writing
 * one is.
 */
export const DENYLIST = [
  { name: 'document', pattern: /\bdocument(?:\.[A-Za-z_$]|\s*\[)/ },
  { name: 'CSSStyleSheet', pattern: /\bCSSStyleSheet\b/ },
  { name: 'getComputedStyle', pattern: /\bgetComputedStyle\b/ },
  { name: 'insertRule', pattern: /\binsertRule\b/ },
  { name: 'adoptedStyleSheets', pattern: /\badoptedStyleSheets\b/ },
  { name: '.style assignment', pattern: /\.style(?:\s*\[[^\]\n]*\])?\s*=(?!=)/ },
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
