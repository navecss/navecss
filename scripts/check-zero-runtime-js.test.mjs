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
} from './check-zero-runtime-js.mjs'
import { runGateMain } from './run-gate-main.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

// Every case here is a manifest paired with the exact jsExportEntries(manifest) result; a case
// exercising anything beyond that (a derived comparison, more than one assertion) is an ordinary
// test below instead.
const EXPORT_ENTRY_CASES = [
  [
    'jsExportEntries includes "." when it resolves to a runtime .js file',
    { name: '@navecss/x', exports: { '.': './index.js' } },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries resolves a conditions-object subpath via its "import" condition',
    {
      name: '@navecss/core',
      exports: { './cx': { types: './dist/cx.d.ts', import: './dist/cx.js' } },
    },
    [{ specifier: '@navecss/core/cx', relativePath: './dist/cx.js' }],
  ],
  [
    'jsExportEntries excludes a non-.js target',
    { name: '@navecss/core', exports: { '.': './dist/index.css' } },
    [],
  ],
  [
    'jsExportEntries excludes "./package.json"',
    { name: '@navecss/x', exports: { '.': './index.js', './package.json': './package.json' } },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries excludes a subpath pattern',
    { name: '@navecss/x', exports: { './styles/*': './dist/styles/*.js' } },
    [],
  ],
  [
    'jsExportEntries excludes a subpath deliberately blocked with null',
    { name: '@navecss/x', exports: { '.': './index.js', './internal': null } },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries recurses into a nested condition object',
    { name: '@navecss/x', exports: { '.': { import: { types: './i.d.ts', default: './i.js' } } } },
    [{ specifier: '@navecss/x', relativePath: './i.js' }],
  ],
  [
    'jsExportEntries accepts a bare ".mjs" target',
    { name: '@navecss/x', exports: { '.': './index.mjs' } },
    [{ specifier: '@navecss/x', relativePath: './index.mjs' }],
  ],
  [
    'jsExportEntries accepts a "require" condition target ending in ".cjs"',
    { name: '@navecss/x', exports: { '.': { require: './index.cjs' } } },
    [{ specifier: '@navecss/x', relativePath: './index.cjs' }],
  ],
  [
    'jsExportEntries accepts a custom condition name such as "node"',
    { name: '@navecss/x', exports: { '.': { node: './n.js' } } },
    [{ specifier: '@navecss/x', relativePath: './n.js' }],
  ],
  [
    'jsExportEntries excludes a types-only conditions block',
    { name: '@navecss/x', exports: { '.': { types: './x.d.ts' } } },
    [],
  ],
  [
    'jsExportEntries collapses two conditions naming the same runtime path into one entry',
    {
      name: '@navecss/x',
      exports: { '.': { import: './dist/tokens.js', default: './dist/tokens.js' } },
    },
    [{ specifier: '@navecss/x', relativePath: './dist/tokens.js' }],
  ],
  ['jsExportEntries returns [] when "exports" is null', { name: '@navecss/x', exports: null }, []],
  [
    'jsExportEntries treats a top-level "exports" string as "." shorthand',
    { name: '@navecss/x', exports: './index.js' },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries treats a top-level "exports" array as a "." fallback array',
    { name: '@navecss/x', exports: ['./index.js'] },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries treats a top-level conditions object (no key starting with ".") as "." shorthand',
    { name: '@navecss/x', exports: { import: './i.js', types: './i.d.ts' } },
    [{ specifier: '@navecss/x', relativePath: './i.js' }],
  ],
  [
    'jsExportEntries walks a fallback array nested under "."',
    { name: '@navecss/x', exports: { '.': ['./a.js'] } },
    [{ specifier: '@navecss/x', relativePath: './a.js' }],
  ],
  [
    'jsExportEntries returns [] when "exports" is absent and no legacy field names a runtime file',
    { name: '@navecss/x' },
    [],
  ],
  [
    'jsExportEntries falls back to "main" when "exports" is absent',
    { name: '@navecss/x', main: './index.js' },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
  [
    'jsExportEntries ignores a "browser" field that maps specifiers instead of naming one file',
    { name: '@navecss/x', browser: { './a.js': './b.js' } },
    [],
  ],
  [
    'jsExportEntries ignores "main"/"module"/"browser" once "exports" is present',
    { name: '@navecss/x', exports: { '.': './index.js' }, main: './other.js' },
    [{ specifier: '@navecss/x', relativePath: './index.js' }],
  ],
]

for (const [title, manifest, expected] of EXPORT_ENTRY_CASES) {
  test(title, () => assert.deepEqual(jsExportEntries(manifest), expected))
}

test('jsExportEntries audits every condition target, not just the first', () => {
  const manifest = {
    name: '@navecss/x',
    exports: { '.': { browser: './b.js', import: './i.js' } },
  }
  const entries = jsExportEntries(manifest)
  assert.deepEqual(entries.map((entry) => entry.relativePath).sort(), ['./b.js', './i.js'])
  assert.ok(entries.every((entry) => entry.specifier === '@navecss/x'))
})

test('jsExportEntries walks a fallback array nested under a condition', () => {
  const manifest = { name: '@navecss/x', exports: { '.': { import: ['./a.js', './b.js'] } } }
  const entries = jsExportEntries(manifest)
  assert.deepEqual(entries.map((entry) => entry.relativePath).sort(), ['./a.js', './b.js'])
  assert.ok(entries.every((entry) => entry.specifier === '@navecss/x'))
})

test('jsExportEntries falls back to "module" and "browser" too, deduplicated by path', () => {
  const manifest = {
    name: '@navecss/x',
    main: './index.js',
    module: './index.js',
    browser: './browser.js',
  }
  const entries = jsExportEntries(manifest)
  assert.deepEqual(entries.map((entry) => entry.relativePath).sort(), [
    './browser.js',
    './index.js',
  ])
})

test('the real @navecss/core manifest reports exactly its four JS export entries', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'))
  assert.deepEqual(
    jsExportEntries(manifest).map((entry) => entry.specifier),
    ['@navecss/core/cx', '@navecss/core/atoms', '@navecss/core/postcss', '@navecss/core/check'],
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
    '.style assignment': 'el.style.color = "red";',
    '.style method call': 'el.style.setProperty("--nave-x", v);',
    'setAttribute("style", ...)': 'el.setAttribute("style", "color:red");',
  }
  for (const { name } of DENYLIST) {
    assert.ok(Object.hasOwn(snippets, name), `no crafted snippet for denylist entry "${name}"`)
    assert.ok(
      findDenylistHits(snippets[name]).includes(name),
      `expected "${name}" to fire on: ${snippets[name]}`,
    )
  }
})

// Every case here is one code snippet paired with the exact findDenylistHits(code) result; a
// case exercising anything beyond that (several snippets checked in one test, a different
// assertion shape) is an ordinary test below instead.
const DENYLIST_HIT_CASES = [
  [
    'findDenylistHits does not fire on the bare English word "document"',
    'a pointer starts at the document root, as in "#/a/b"',
    [],
  ],
  [
    'findDenylistHits does not fire on a sentence ending in the word "document."',
    'read the spec document. It explains the format.',
    [],
  ],
  [
    'findDenylistHits fires on bracket access to document',
    'const t = document["title"];',
    ['document'],
  ],
  [
    'findDenylistHits fires on optional-chained property access to document',
    'document?.head.append(s);',
    ['document'],
  ],
  [
    'findDenylistHits fires on optional-chained bracket access to document',
    'document?.["title"];',
    ['document'],
  ],
  [
    'findDenylistHits does not fire on a .style comparison',
    'if (el.style === other.style) return;',
    [],
  ],
  ['findDenylistHits does not fire on a .style read', 'const c = el.style.color;', []],
  [
    'findDenylistHits does not fire on a loose-equality .style comparison',
    'if (el.style.color == x) return;',
    [],
  ],
  [
    'findDenylistHits fires on a bracketed .style assignment',
    'el.style["color"] = "red";',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a .style property assignment',
    'el.style.color = "red";',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a minified .style property assignment',
    'e.style.color=t',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a .style.cssText assignment',
    'el.style.cssText = "color:red";',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a compound .style.cssText assignment',
    'el.style.cssText += "x";',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on el.style.setProperty(...)',
    'el.style.setProperty("--nave-x", v);',
    ['.style method call'],
  ],
  [
    'findDenylistHits fires on el.style.removeProperty(...)',
    'el.style.removeProperty("color");',
    ['.style method call'],
  ],
  [
    'findDenylistHits fires on an optional-chained el.style?.setProperty(...)',
    'el.style?.setProperty(t, n);',
    ['.style method call'],
  ],
  [
    'findDenylistHits fires on an optional-chained el.style?.removeProperty(...)',
    'el.style?.removeProperty(t);',
    ['.style method call'],
  ],
  [
    'findDenylistHits fires on el.setAttribute("style", ...)',
    'el.setAttribute("style", "color:red");',
    ['setAttribute("style", ...)'],
  ],
  [
    'findDenylistHits fires on a bracket-string .style bracket-index assignment',
    "e['style'][t]=n",
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a double-quoted bracket-string .style property assignment',
    'e["style"].color=t',
    ['.style assignment'],
  ],
  [
    'findDenylistHits fires on a template-literal bracket-string .style method call',
    'e[`style`].setProperty(t,n)',
    ['.style method call'],
  ],
  [
    'findDenylistHits fires on an optional-chained bracket-string .style method call',
    "e['style']?.removeProperty(t)",
    ['.style method call'],
  ],
  [
    'findDenylistHits does not fire on a <= comparison against a .style read',
    'if (el.style.width <= 3) return;',
    [],
  ],
  [
    'findDenylistHits does not fire on a >= comparison against a .style read',
    'if (el.style.width >= 3) return;',
    [],
  ],
  [
    'findDenylistHits does not fire on a .style read used as an arrow function default parameter',
    'const f = (s = el.style) => s;',
    [],
  ],
  [
    'findDenylistHits fires on an unrelated "style" property, a documented false positive',
    'config.style.indent = 2;',
    ['.style assignment'],
  ],
  [
    'findDenylistHits returns [] for code touching none of the denylist',
    'export const cx = (...args) => args.filter(Boolean).join(" ");',
    [],
  ],
]

for (const [title, code, expected] of DENYLIST_HIT_CASES) {
  test(title, () => assert.deepEqual(findDenylistHits(code), expected))
}

// ---------------------------------------------------------------------------
// every JS assignment operator through .style, and the comparison/arrow shapes that must not
// be mistaken for one
// ---------------------------------------------------------------------------

test('findDenylistHits fires on every compound assignment operator through .style', () => {
  const rows = [
    ['el.style.opacity *= 0.5;', '*='],
    ['el.style.opacity /= 2;', '/='],
    ['el.style.opacity %= 2;', '%='],
    ['el.style.opacity **= 2;', '**='],
    ['el.style.zIndex <<= 1;', '<<='],
    ['el.style.zIndex >>= 1;', '>>='],
    ['el.style.zIndex >>>= 1;', '>>>='],
    ['el.style.zIndex &= 1;', '&='],
    ['el.style.zIndex |= 1;', '|='],
    ['el.style.zIndex ^= 1;', '^='],
    ['el.style.color &&= "red";', '&&='],
    ['el.style ||= {};', '||='],
    ['el.style.color ??= "red";', '??='],
  ]
  for (const [snippet, operator] of rows) {
    assert.deepEqual(
      findDenylistHits(snippet),
      ['.style assignment'],
      `expected "${operator}" to fire on: ${snippet}`,
    )
  }
})

test('findDenylistHits does not see a write made through an aliased style object (a documented limit of a textual scan)', () => {
  for (const code of [
    'const s = el.style; s.color = t;',
    '(0,e.style).color=t',
    'Object.assign(el.style, { color: t });',
  ]) {
    assert.deepEqual(findDenylistHits(code), [], code)
  }
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

// ---------------------------------------------------------------------------
// regex performance: every DENYLIST pattern stays linear against an adversarial input built to
// trip a catastrophic-backtracking pattern (a long run of characters that almost, but never
// fully, matches)
// ---------------------------------------------------------------------------

test('every DENYLIST pattern finishes in well under a second against a 100k-character adversarial input', () => {
  const adversarialInputs = [
    `.style${' '.repeat(1e5)}`,
    `e['style'${'a'.repeat(1e5)}`,
    `.style.${'a'.repeat(1e5)}=`,
    `.style${'?'.repeat(1e5)}`,
  ]
  for (const { name, pattern } of DENYLIST) {
    for (const input of adversarialInputs) {
      const start = performance.now()
      pattern.test(input)
      const elapsedMs = performance.now() - start
      assert.ok(
        elapsedMs < 1000,
        `"${name}" took ${elapsedMs}ms against a 100k-character adversarial input`,
      )
    }
  }
})
