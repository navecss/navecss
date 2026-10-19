/**
 * A path-valued `extend` read by the built plugin in plain Node, the way Next.js loads it: the
 * test runner loads JSON and TypeScript modules itself, so a row run through `src/` here would
 * pass where Node alone refuses the module.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { createProject } from './helpers/project.ts'

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..')
const POSTCSS = createRequire(path.join(PACKAGE_DIR, 'package.json')).resolve('postcss')

const OWN_ATOMS = { brandBox: { declarations: { color: 'red' } } }
const MODULE_TEXT = `export default ${JSON.stringify(OWN_ATOMS)}\n`

const PAGE =
  "import { cx } from '@navecss/core/cx'\n\nexport default function Page() {\n  return <main className={cx('brandBox')} />\n}\n"

/**
 * Runs the built plugin over core's `atomic.css` in a child Node process, with the wrapper's
 * variable set, and prints the kinds of the problems the record holds.
 */
const CHILD = `
const [pluginUrl, recordUrl, postcssUrl, dir, extend] = process.argv.slice(1)
const { default: postcss } = await import(postcssUrl)
const { prunePlugin } = await import(pluginUrl)
const { readRecord } = await import(recordUrl)
const { readFileSync } = await import('node:fs')
const atomic = dir + '/node_modules/@navecss/core/dist/atomic.css'
process.env.NAVECSS_PRUNE = JSON.stringify({ options: { extend }, dir, distDir: '.next', root: dir })
console.warn = () => {}
await postcss([prunePlugin()]).process(readFileSync(atomic, 'utf8'), { from: atomic })
const record = readRecord({ dir, distDir: '.next' })
process.stdout.write(JSON.stringify(record ? record.problems.map((problem) => problem.kind) : 'no record'))
`

/**
 * The kinds of the problems the built plugin records for the project, run in plain Node.
 */
function problemKindsInNode(project: Project, extend: string): unknown {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      CHILD,
      pathToFileURL(path.join(PACKAGE_DIR, 'dist/postcss.js')).href,
      pathToFileURL(path.join(PACKAGE_DIR, 'dist/record.js')).href,
      pathToFileURL(POSTCSS).href,
      project.dir,
      extend,
    ],
    { encoding: 'utf8' },
  )
  return JSON.parse(output)
}

const made: Project[] = []
afterEach(() => {
  for (const project of made) project.remove()
  made.length = 0
})

/**
 * A project named `name` whose page calls `cx()` with an atom of the consumer's own, defined in
 * `file`.
 */
function projectWith(name: string, file: string, text: string): Project {
  const project = createProject({ 'app/page.tsx': PAGE, [file]: text }, name)
  made.push(project)
  return project
}

describe('a path-valued extend names the own atoms wherever the project lives', () => {
  it.each([
    ['a plain directory (control)', 'app', './atoms.mjs'],
    ['a directory with a space', 'My App', './atoms.mjs'],
    ['a directory with a non-ASCII letter', 'appé', './atoms.mjs'],
  ])('in %s, cx() of an own atom is a problem of kind own', (_label, name, extend) => {
    const project = projectWith(name, 'atoms.mjs', MODULE_TEXT)
    expect(problemKindsInNode(project, extend)).toEqual(['own'])
  })

  it('an absolute path in a directory with a space, cx() of an own atom is a problem of kind own', () => {
    const project = projectWith('My App', 'atoms.mjs', MODULE_TEXT)
    expect(problemKindsInNode(project, path.join(project.dir, 'atoms.mjs'))).toEqual(['own'])
  })

  it.each([
    ['./atoms.json', 'atoms.json', JSON.stringify(OWN_ATOMS)],
    [
      './atoms.ts',
      'atoms.ts',
      `const atoms: Record<string, unknown> = ${JSON.stringify(OWN_ATOMS)}\nexport default atoms\n`,
    ],
    ['./atoms.cjs', 'atoms.cjs', `module.exports = ${JSON.stringify(OWN_ATOMS)}\n`],
    ['./atoms.mjs', 'atoms.mjs', MODULE_TEXT],
  ])('%s: cx() of an own atom is a problem of kind own', (extend, file, text) => {
    const project = projectWith('app', file, text)
    expect(problemKindsInNode(project, extend)).toEqual(['own'])
  })
})
