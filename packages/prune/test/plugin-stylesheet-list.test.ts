/**
 * The list of stylesheets the build can still hold is trusted only when the run over the atom
 * layer read every stylesheet it met as CSS and met no Markdown or MDX file. Otherwise a
 * stylesheet can be in the build without the list naming it, so the record falls back to counting
 * every stylesheet record whose file is on disk. And the ways a stylesheet does reach the list.
 */
import { chmodSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const PROBLEM = '.x {\n  @nave interactve;\n}\n'

const LAYOUT = (imports: string): string =>
  `${imports}\n\nexport default function RootLayout({ children }: { children: unknown }) {\n  return children\n}\n`

interface Reading {
  /**
   * The stylesheets whose `@nave` problems the record counts.
   */
  readonly counted: string[]
  /**
   * The stylesheets the record lists as still in the build, core's own left out.
   */
  readonly listed: string[]
}

/**
 * Writes `sheets` to disk, runs each of them and `extra` (stylesheets already on disk), then the
 * atom layer, and reads what the record counts and lists.
 */
async function read(
  project: Project,
  sheets: Record<string, string>,
  extra: readonly { readonly css: string; readonly file: string }[] = [],
): Promise<Reading> {
  project.write(sheets)
  const all = [...Object.entries(sheets).map(([file, css]) => ({ file, css })), ...extra]
  await runSheets(project, [...all, ATOMIC_SHEET], { options: {} })
  const record = recordOf(project)
  return {
    counted: [...new Set(record.directiveProblems.map((problem) => problem.file))].toSorted(
      (a, b) => a.localeCompare(b),
    ),
    listed: (record.stylesheets ?? []).filter((file) => !file.includes('atomic.css')),
  }
}

const isRoot = process.getuid?.() === 0

describe('a stylesheet list the run could not complete', () => {
  it('keeps counting a stylesheet only an MDX page imports', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT(''),
      'app/docs/page.mdx': "import './docs.css'\n\n# Docs\n",
    })
    const reading = await read(project, { 'app/docs/docs.css': PROBLEM })
    expect(reading.counted).toEqual(['app/docs/docs.css'])
    expect(recordOf(project).isStylesheetListComplete).toBe(false)
  })

  it('keeps counting a stylesheet a .scss file with a // comment imports', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT("import './main.scss'") })
    project.write({ 'app/main.scss': "// theme\n@import './extra.css';\n.a {\n  color: red;\n}\n" })
    const reading = await read(project, { 'app/extra.css': PROBLEM })
    expect(reading.counted).toEqual(['app/extra.css'])
    expect(recordOf(project).isStylesheetListComplete).toBe(false)
  })

  it('keeps counting a stylesheet a Sass partial imports, though the .scss file parses as CSS', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT("import './main.scss'") })
    project.write({
      'app/main.scss': "@import 'parts';\n",
      'app/_parts.scss': "@import './extra.css';\n",
    })
    const reading = await read(project, { 'app/extra.css': PROBLEM })
    expect(reading.counted).toEqual(['app/extra.css'])
  })

  it('keeps counting a stylesheet a .css file the CSS parser refuses imports', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT("import './globals.css'") })
    project.write({ 'app/globals.css': "@import './extra.css';\n.a {\n  color: red;\n" })
    const reading = await read(project, { 'app/extra.css': PROBLEM })
    expect(reading.counted).toEqual(['app/extra.css'])
  })

  it.skipIf(isRoot)('keeps counting a stylesheet an unreadable stylesheet imports', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT("import './globals.css'") })
    project.write({ 'app/globals.css': "@import './extra.css';\n" })
    const globals = path.join(project.dir, 'app/globals.css')
    chmodSync(globals, 0o000)
    try {
      const reading = await read(project, { 'app/extra.css': PROBLEM })
      expect(reading.counted).toEqual(['app/extra.css'])
    } finally {
      chmodSync(globals, 0o644)
    }
  })

  it('control: a complete list still drops a stylesheet nothing imports any more', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT("import './globals.css'"),
      'app/page.tsx': "import './old.css'\n\nexport default function Page() {\n  return null\n}\n",
    })
    await read(project, { 'app/globals.css': PROBLEM, 'app/old.css': PROBLEM })
    project.write({ 'app/page.tsx': 'export default function Page() {\n  return null\n}\n' })
    await runSheets(project, [ATOMIC_SHEET], { options: {} })
    const record = recordOf(project)
    expect(record.isStylesheetListComplete).toBe(true)
    expect([...new Set(record.directiveProblems.map((problem) => problem.file))]).toEqual([
      'app/globals.css',
    ])
  })
})

describe('the stylesheets a complete list names', () => {
  it('a stylesheet a module imports that the page reaches only through import()', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT(''),
      'app/page.tsx':
        "const Heavy = () => import('./Heavy')\n\nexport default function Page() {\n  return String(Heavy)\n}\n",
      'app/Heavy.tsx':
        "import './heavy.css'\n\nexport default function Heavy() {\n  return null\n}\n",
    })
    expect(await read(project, { 'app/heavy.css': PROBLEM })).toEqual({
      counted: ['app/heavy.css'],
      listed: ['app/heavy.css'],
    })
  })

  it('a CSS module a page imports', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT(''),
      'app/page.tsx':
        "import s from './card.module.css'\n\nexport default function Page() {\n  return s.card\n}\n",
    })
    expect(await read(project, { 'app/card.module.css': PROBLEM })).toEqual({
      counted: ['app/card.module.css'],
      listed: ['app/card.module.css'],
    })
  })

  it('a stylesheet an @import url() with a query names', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT("import './globals.css'") })
    const reading = await read(project, {
      'app/globals.css': "@import url('./q.css?v=2');\n",
      'app/q.css': PROBLEM,
    })
    expect(reading).toEqual({ counted: ['app/q.css'], listed: ['app/globals.css', 'app/q.css'] })
  })

  it('a stylesheet a dependency under node_modules imports', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT("import { Box } from 'kit'\n\nexport const k = Box"),
    })
    const root = project.install('kit', {
      'package.json': JSON.stringify({
        name: 'kit',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
      }),
      'index.js': "import './kit.css'\n\nexport const Box = 1\n",
      'kit.css': PROBLEM,
    })
    const file = path.relative(project.dir, path.join(root, 'kit.css'))
    expect(await read(project, {}, [{ file, css: PROBLEM }])).toEqual({
      counted: [file],
      listed: [file],
    })
  })

  it("the Pages Router's global stylesheet, imported from _app", async () => {
    const project = makeProject({
      'pages/_app.tsx':
        "import '../styles/globals.css'\n\nexport default function App({ Component }: { Component: () => null }) {\n  return Component()\n}\n",
      'pages/index.tsx': 'export default function Home() {\n  return null\n}\n',
    })
    expect(await read(project, { 'styles/globals.css': PROBLEM })).toEqual({
      counted: ['styles/globals.css'],
      listed: ['styles/globals.css'],
    })
  })

  it('a stylesheet a CommonJS file require()s', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT("import './extra.cjs'"),
      'app/extra.cjs': "require('./r.css')\n",
    })
    expect(await read(project, { 'app/r.css': PROBLEM })).toEqual({
      counted: ['app/r.css'],
      listed: ['app/r.css'],
    })
  })

  it('a stylesheet mdx-components imports', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT(''),
      'mdx-components.tsx':
        "import './prose.css'\n\nexport function useMDXComponents(components: object) {\n  return components\n}\n",
    })
    expect(await read(project, { 'prose.css': PROBLEM })).toEqual({
      counted: ['prose.css'],
      listed: ['prose.css'],
    })
  })
})
