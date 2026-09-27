/**
 * Coverage for check-zero-runtime-js.mjs, run with Node's built-in test runner. Synthetic
 * manifests and fixture files only for the unit-level cases; the bundling cases use the real
 * `esbuild` dependency against real temp files, because the property under test ("what a
 * consumer's bundler actually resolves and inlines") is not something a mocked bundler could
 * demonstrate.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  auditEntry,
  bundleEntry,
  consumerFacingSpecifier,
  DENYLIST,
  findDenylistHits,
  jsExportEntries,
  main,
  resolveExportTarget,
} from './check-zero-runtime-js.mjs'
import { runGateMain } from './run-gate-main.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// resolveExportTarget
// ---------------------------------------------------------------------------

test('resolveExportTarget returns a string export value unchanged', () => {
  assert.equal(resolveExportTarget('./dist/index.js'), './dist/index.js')
})

test('resolveExportTarget prefers "import" over "default" over "require"', () => {
  assert.equal(
    resolveExportTarget({ types: './x.d.ts', import: './x.js', default: './x.cjs' }),
    './x.js',
  )
  assert.equal(resolveExportTarget({ types: './x.d.ts', default: './x.cjs' }), './x.cjs')
})

test('resolveExportTarget returns null for a types-only conditions block', () => {
  assert.equal(resolveExportTarget({ types: './x.d.ts' }), null)
})

test('resolveExportTarget returns null for null, a non-object, or an array', () => {
  assert.equal(resolveExportTarget(null), null)
  assert.equal(resolveExportTarget(42), null)
  assert.equal(resolveExportTarget(['./x.js']), null)
})

// ---------------------------------------------------------------------------
// consumerFacingSpecifier
// ---------------------------------------------------------------------------

test('consumerFacingSpecifier resolves "." to the bare package name', () => {
  assert.equal(consumerFacingSpecifier('@navecss/tokens', '.'), '@navecss/tokens')
})

test('consumerFacingSpecifier resolves a subpath to the full specifier', () => {
  assert.equal(consumerFacingSpecifier('@navecss/core', './cx'), '@navecss/core/cx')
})

// ---------------------------------------------------------------------------
// jsExportEntries
// ---------------------------------------------------------------------------

test('jsExportEntries includes "." when it resolves to a runtime .js file', () => {
  const manifest = { name: '@navecss/x', exports: { '.': './index.js' } }
  assert.deepEqual(jsExportEntries(manifest), [
    { specifier: '@navecss/x', relativePath: './index.js' },
  ])
})

test('jsExportEntries resolves a conditions-object subpath via its "import" condition', () => {
  const manifest = {
    name: '@navecss/core',
    exports: { './cx': { types: './dist/cx.d.ts', import: './dist/cx.js' } },
  }
  assert.deepEqual(jsExportEntries(manifest), [
    { specifier: '@navecss/core/cx', relativePath: './dist/cx.js' },
  ])
})

test('jsExportEntries excludes a non-.js target', () => {
  const manifest = { name: '@navecss/core', exports: { '.': './dist/index.css' } }
  assert.deepEqual(jsExportEntries(manifest), [])
})

test('jsExportEntries excludes "./package.json"', () => {
  const manifest = {
    name: '@navecss/x',
    exports: { '.': './index.js', './package.json': './package.json' },
  }
  assert.deepEqual(jsExportEntries(manifest), [
    { specifier: '@navecss/x', relativePath: './index.js' },
  ])
})

test('jsExportEntries excludes a subpath pattern', () => {
  const manifest = { name: '@navecss/x', exports: { './styles/*': './dist/styles/*.js' } }
  assert.deepEqual(jsExportEntries(manifest), [])
})

test('jsExportEntries excludes a subpath deliberately blocked with null', () => {
  const manifest = { name: '@navecss/x', exports: { '.': './index.js', './internal': null } }
  assert.deepEqual(jsExportEntries(manifest), [
    { specifier: '@navecss/x', relativePath: './index.js' },
  ])
})

test('jsExportEntries returns [] when "exports" is absent, null, a string, or an array', () => {
  assert.deepEqual(jsExportEntries({ name: '@navecss/x' }), [])
  assert.deepEqual(jsExportEntries({ name: '@navecss/x', exports: null }), [])
  assert.deepEqual(jsExportEntries({ name: '@navecss/x', exports: './index.js' }), [])
  assert.deepEqual(jsExportEntries({ name: '@navecss/x', exports: ['./index.js'] }), [])
})

test('the real @navecss/core manifest reports exactly its three JS export entries', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'))
  assert.deepEqual(
    jsExportEntries(manifest).map((entry) => entry.specifier),
    ['@navecss/core/cx', '@navecss/core/atoms', '@navecss/core/postcss'],
  )
})

test('the real @navecss/tokens manifest reports "." and "./js" as separate entries sharing one file', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/tokens/package.json'), 'utf8'))
  const entries = jsExportEntries(manifest)
  const byName = Object.fromEntries(entries.map((entry) => [entry.specifier, entry.relativePath]))
  assert.equal(byName['@navecss/tokens'], byName['@navecss/tokens/js'])
  assert.ok('@navecss/tokens/breakpoints' in byName)
  assert.ok('@navecss/tokens/build' in byName)
})

// ---------------------------------------------------------------------------
// findDenylistHits / DENYLIST
// ---------------------------------------------------------------------------

test('every DENYLIST entry has a name and fires on at least one crafted snippet', () => {
  const snippets = {
    document: 'const s = document.createElement("style");',
    CSSStyleSheet: 'const sheet = new CSSStyleSheet();',
    getComputedStyle: 'const cs = getComputedStyle(el);',
    insertRule: 'sheet.insertRule(".x{}", 0);',
    adoptedStyleSheets: 'shadowRoot.adoptedStyleSheets = [sheet];',
    '.style assignment': 'el.style = "color: red";',
  }
  for (const { name } of DENYLIST) {
    assert.ok(Object.hasOwn(snippets, name), `no crafted snippet for denylist entry "${name}"`)
    assert.ok(
      findDenylistHits(snippets[name]).includes(name),
      `expected "${name}" to fire on: ${snippets[name]}`,
    )
  }
})

test('findDenylistHits does not fire on the bare English word "document"', () => {
  assert.deepEqual(findDenylistHits('a pointer starts at the document root, as in "#/a/b"'), [])
})

test('findDenylistHits does not fire on a sentence ending in the word "document."', () => {
  assert.deepEqual(findDenylistHits('read the spec document. It explains the format.'), [])
})

test('findDenylistHits fires on bracket access to document', () => {
  assert.deepEqual(findDenylistHits('const t = document["title"];'), ['document'])
})

test('findDenylistHits does not fire on a .style comparison', () => {
  assert.deepEqual(findDenylistHits('if (el.style === other.style) return;'), [])
})

test('findDenylistHits fires on a bracketed .style assignment', () => {
  assert.deepEqual(findDenylistHits('el.style["color"] = "red";'), ['.style assignment'])
})

test('findDenylistHits returns [] for code touching none of the denylist', () => {
  const clean = 'export const cx = (...args) => args.filter(Boolean).join(" ");'
  assert.deepEqual(findDenylistHits(clean), [])
})

test('findDenylistHits reports every hit once each, in DENYLIST table order', () => {
  const code = 'getComputedStyle(el); document.head.appendChild(s); el.style = "x";'
  assert.deepEqual(findDenylistHits(code), ['document', 'getComputedStyle', '.style assignment'])
})

// ---------------------------------------------------------------------------
// bundleEntry / auditEntry — real esbuild against real temp files
// ---------------------------------------------------------------------------

async function withTempDir(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-zero-runtime-'))
  try {
    return await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('bundleEntry inlines a relative sibling file', () =>
  withTempDir(async (dir) => {
    writeFileSync(path.join(dir, 'helper.js'), 'export const greet = () => "hi";\n')
    writeFileSync(
      path.join(dir, 'entry.js'),
      "import { greet } from './helper.js';\nexport const run = () => greet();\n",
    )
    const code = await bundleEntry(path.join(dir, 'entry.js'))
    assert.ok(code.includes('"hi"'), 'expected the sibling file to be inlined into the bundle')
  }))

test('bundleEntry leaves a non-@navecss bare import external rather than failing to resolve it', () =>
  withTempDir(async (dir) => {
    writeFileSync(
      path.join(dir, 'entry.js'),
      "import unrelated from 'this-package-does-not-exist';\nunrelated();\n",
    )
    const code = await bundleEntry(path.join(dir, 'entry.js'))
    assert.match(code, /from ["']this-package-does-not-exist["']/)
  }))

test('a violation hidden only in an imported sibling file is still caught through the entry', () =>
  withTempDir(async (dir) => {
    // The entry file itself never mentions a denylisted global — only the file it imports does.
    // This is the property that justifies bundling instead of grepping dist/ files one at a time.
    writeFileSync(
      path.join(dir, 'inject.js'),
      "export const paint = () => { document.head.appendChild(document.createElement('style')); };\n",
    )
    writeFileSync(path.join(dir, 'entry.js'), "export { paint } from './inject.js';\n")
    const code = await bundleEntry(path.join(dir, 'entry.js'))
    assert.deepEqual(findDenylistHits(code), ['document'])
  }))

test('NEGATIVE CONTROL: a fixture entry that injects a <style> element is flagged by auditEntry', () =>
  withTempDir(async (dir) => {
    mkdirSync(path.join(dir, 'packages', 'fixture'), { recursive: true })
    const packageDir = path.join(dir, 'packages', 'fixture')
    writeFileSync(
      path.join(packageDir, 'inject-style.js'),
      [
        'export function injectStyle(css) {',
        '  const styleEl = document.createElement("style");',
        '  styleEl.textContent = css;',
        '  document.head.appendChild(styleEl);',
        '}',
        '',
      ].join('\n'),
    )
    const { specifier, hits } = await auditEntry(packageDir, {
      specifier: '@navecss/fixture',
      relativePath: './inject-style.js',
    })
    assert.equal(specifier, '@navecss/fixture')
    assert.ok(hits.length > 0, 'a check with no proof it can fail is not a check')
    assert.ok(hits.includes('document'))
  }))

// ---------------------------------------------------------------------------
// main() — end to end against fixture package trees
// ---------------------------------------------------------------------------

function fixtureRoot(packages) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-zero-runtime-main-'))
  for (const [dirName, { manifest, files }] of Object.entries(packages)) {
    const packageDir = path.join(dir, 'packages', dirName)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest, null, 2))
    for (const [fileName, contents] of Object.entries(files ?? {})) {
      writeFileSync(path.join(packageDir, fileName), contents)
    }
  }
  return dir
}

test('main() passes a fixture tree with no JS exports, private packages, and one clean entry', async () => {
  const dir = fixtureRoot({
    clean: {
      manifest: { name: '@navecss/clean', exports: { '.': './index.js' } },
      files: { 'index.js': 'export const noop = () => undefined;\n' },
    },
    hidden: {
      manifest: { name: '@navecss/hidden', private: true, exports: { '.': './index.js' } },
      files: { 'index.js': 'document.title;\n' },
    },
    'css-only': {
      manifest: { name: '@navecss/css-only', exports: { '.': './index.css' } },
    },
  })
  try {
    const { code, out } = await runGateMain(main, dir)
    assert.equal(code, 0)
    assert.match(out, /1 published entry\(ies\) bundled across 1 package\(s\)/)
    assert.match(out, /@navecss\/clean/)
    assert.match(out, /skipped private package\(s\): @navecss\/hidden/)
    assert.match(out, /No JS entries to check: @navecss\/css-only/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('main() fails and names the offending specifier when a fixture entry violates the invariant', async () => {
  const dir = fixtureRoot({
    offender: {
      manifest: { name: '@navecss/offender', exports: { '.': './index.js' } },
      files: { 'index.js': 'export const paint = () => getComputedStyle(document.body);\n' },
    },
  })
  try {
    const { code, err } = await runGateMain(main, dir)
    assert.equal(code, 1)
    assert.match(err, /@navecss\/offender/)
    assert.match(err, /getComputedStyle/)
    assert.match(err, /document/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Pins against the real repository: what the "what counts as external" docblock claims
// ---------------------------------------------------------------------------

test('bundling the real @navecss/core postcss entry inlines @navecss/tokens but keeps postcss external', async () => {
  const code = await bundleEntry(path.join(ROOT, 'packages/core/dist/postcss.js'))
  assert.ok(
    !code.includes("from '@navecss/tokens"),
    'expected the workspace import to be inlined, not left as a bare import statement',
  )
  assert.match(code, /from ["']postcss["']/)
})

test('the real repository has no zero-runtime violation today', async () => {
  const { code, out } = await runGateMain(main, ROOT)
  assert.equal(code, 0, out)
})
