/**
 * The plugin reads a path-valued `extend` as core's own PostCSS plugin does: what core accepts
 * expands to the same CSS here, and what core refuses is a recorded failure here. Run in plain
 * Node on the built packages, since the test runner loads JSON and TypeScript modules itself.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..')
const CORE_DIR = path.resolve(PACKAGE_DIR, '../core')
const POSTCSS = createRequire(path.join(PACKAGE_DIR, 'package.json')).resolve('postcss')

/**
 * Expands one stylesheet with core's plugin and with this package's, given the same absolute
 * `extend`, and prints what each gave: CSS or a thrown message for core, CSS and the stylesheet
 * record's failures for this package.
 */
const CHILD = String.raw`
const [corePlugin, prunePluginUrl, postcssUrl, dir, extend] = process.argv.slice(1)
const { default: postcss } = await import(postcssUrl)
const { navePlugin } = await import(corePlugin)
const { prunePlugin } = await import(prunePluginUrl)
const { readdirSync, readFileSync } = await import('node:fs')
const css = '.x {\n  @nave brandBox;\n}\n'
const from = dir + '/app/x.css'
const flat = (text) => text.replaceAll(/\s+/g, ' ').trim()
let core
try {
  core = { css: flat((await postcss([navePlugin({ extend })]).process(css, { from })).css) }
} catch (error) {
  core = { error: String(error) }
}
process.env.NAVECSS_PRUNE = JSON.stringify({ options: { extend }, dir, distDir: '.next', root: dir })
console.warn = () => {}
const out = await postcss([prunePlugin()]).process(css, { from })
const sheets = dir + '/.next/cache/navecss-prune-sheets'
const failures = readdirSync(sheets).flatMap((name) => JSON.parse(readFileSync(sheets + '/' + name, 'utf8')).failures)
process.stdout.write(JSON.stringify({ core, prune: { css: flat(out.css), failures } }))
`

const made: string[] = []
afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
  made.length = 0
})

interface Outcome {
  readonly core: { readonly css?: string; readonly error?: string }
  readonly prune: { readonly css: string; readonly failures: readonly string[] }
}

/**
 * Both plugins' answers for an `extend` naming `name` in a scratch directory holding `files`.
 */
function bothFor(files: Record<string, string>, name: string): Outcome {
  const scratch = mkdtempSync(path.join(tmpdir(), 'prune-parity-'))
  const dir = realpathSync(scratch)
  made.push(dir)
  mkdirSync(path.join(dir, 'app'), { recursive: true })
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      CHILD,
      pathToFileURL(path.join(CORE_DIR, 'dist/postcss.js')).href,
      pathToFileURL(path.join(PACKAGE_DIR, 'dist/postcss.js')).href,
      pathToFileURL(POSTCSS).href,
      dir,
      path.join(dir, name),
    ],
    { encoding: 'utf8' },
  )
  return JSON.parse(output) as Outcome
}

const ATOMS = JSON.stringify({ brandBox: { declarations: { color: 'red' } } })

describe('extend is read as core reads it', () => {
  it.each([
    ['an ES module', { 'atoms.mjs': `export default ${ATOMS}\n` }, 'atoms.mjs'],
    ['a CommonJS module', { 'atoms.cjs': `module.exports = ${ATOMS}\n` }, 'atoms.cjs'],
    [
      'a TypeScript module',
      { 'atoms.ts': `const atoms: Record<string, unknown> = ${ATOMS}\nexport default atoms\n` },
      'atoms.ts',
    ],
    ['a .json file', { 'atoms.json': ATOMS }, 'atoms.json'],
    ['a .JSON file', { 'atoms.JSON': ATOMS }, 'atoms.JSON'],
    [
      'a map that shadows a built-in atom',
      {
        'atoms.mjs': `export default ${JSON.stringify({ grid: { declarations: { color: 'red' } }, brandBox: { declarations: { color: 'red' } } })}\n`,
      },
      'atoms.mjs',
    ],
    [
      'a value behind a getter',
      {
        'atoms.mjs':
          "export default { brandBox: { get declarations() { return { color: 'red' } } } }\n",
      },
      'atoms.mjs',
    ],
  ])('%s that core accepts expands to the same CSS, with no failure', (_label, files, name) => {
    const { core, prune } = bothFor(files, name)
    expect(core.error).toBeUndefined()
    expect(prune.css).toBe(core.css)
    expect(prune.failures).toEqual([])
  })

  it.each([
    ['a path that names nothing', {}, 'nope.mjs'],
    ['a directory', { 'adir/x.txt': '' }, 'adir'],
    ['a default export that is an array', { 'atoms.mjs': 'export default []\n' }, 'atoms.mjs'],
    ['a default export that is a number', { 'atoms.mjs': 'export default 5\n' }, 'atoms.mjs'],
    [
      'a module with no default export',
      { 'atoms.mjs': 'export const brandBox = 1\n' },
      'atoms.mjs',
    ],
    ['a module that does not parse', { 'atoms.mjs': 'export default {\n' }, 'atoms.mjs'],
    [
      'a value core refuses to write into CSS',
      {
        'atoms.mjs': `export default ${JSON.stringify({ brandBox: { declarations: { color: 'red;}body{color:blue' } } })}\n`,
      },
      'atoms.mjs',
    ],
  ])('%s, which core refuses, is a recorded failure', (_label, files, name) => {
    const { core, prune } = bothFor(files, name)
    expect(core.error).toBeDefined()
    expect(prune.failures.length).toBeGreaterThan(0)
  })
})
