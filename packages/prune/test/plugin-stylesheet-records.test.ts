/**
 * A stylesheet's `@nave` problems count only while the stylesheet can still be in the build: a
 * stylesheet the code imports, or one an `@import` (or a CSS module's `composes ... from`) reaches
 * from one. A stylesheet that is still on disk but that nothing imports any more stops counting,
 * as a deleted one does. The bundler does not run an unimported stylesheet again, so its old
 * record would otherwise stay until the cache is cleared.
 */
import type { Message } from 'postcss'

import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { ATOMIC_SHEET, runSheets } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const PROBLEM = '.x {\n  @nave interactve;\n}\n'

const LAYOUT_IMPORTING = (sheet: string): string =>
  `import '${sheet}'\n\nexport default function RootLayout({ children }: { children: unknown }) {\n  return children\n}\n`

/**
 * Writes each stylesheet to disk and returns them as the bundler would process them.
 */
function onDisk(project: Project, sheets: Record<string, string>): Sheet[] {
  project.write(sheets)
  return Object.entries(sheets).map(([file, css]) => ({ file, css }))
}

/**
 * The stylesheets the record's `@nave` problems are in, sorted.
 */
function problemSheets(project: Project): string[] {
  const files = recordOf(project).directiveProblems.map((problem) => problem.file)
  return [...new Set(files)].toSorted((a, b) => a.localeCompare(b))
}

/**
 * The paths the `dependency` messages name, relative to the project directory.
 */
function declaredFiles(project: Project, messages: readonly Message[]): string[] {
  return messages
    .filter((message) => message.type === 'dependency')
    .map((message) => path.relative(project.dir, message.file as string))
}

describe('a stylesheet record, once the stylesheet is no longer imported', () => {
  it('stops counting when the stylesheet is still on disk', async () => {
    const project = makeProject({
      'app/layout.tsx': LAYOUT_IMPORTING('./globals.css'),
      'app/page.tsx': "import './old.css'\n\nexport default function Page() {\n  return null\n}\n",
    })
    const sheets = onDisk(project, {
      'app/globals.css': PROBLEM,
      'app/old.css': PROBLEM,
    })
    await runSheets(project, [...sheets, ATOMIC_SHEET], { options: {} })
    expect(problemSheets(project)).toEqual(['app/globals.css', 'app/old.css'])
    // The page stops importing it; the bundler runs the atom layer again and not the stylesheet.
    project.write({ 'app/page.tsx': 'export default function Page() {\n  return null\n}\n' })
    await runSheets(project, [ATOMIC_SHEET], { options: {} })
    expect(problemSheets(project)).toEqual(['app/globals.css'])
  })

  it('counts while an @import chain from an imported stylesheet reaches it', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT_IMPORTING('./globals.css') })
    const sheets = onDisk(project, {
      'app/globals.css': "@import url('./base.css');\n",
      'app/base.css': "@import 'parts/kept.css' layer(base);\n",
      'app/parts/kept.css': PROBLEM,
      'app/unused.css': PROBLEM,
    })
    await runSheets(project, [...sheets, ATOMIC_SHEET], { options: {} })
    expect(problemSheets(project)).toEqual(['app/parts/kept.css'])
  })

  it("counts while a package's stylesheet is reached through its style export", async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT_IMPORTING('./globals.css') })
    const root = project.install('ui-kit', {
      'package.json': JSON.stringify({
        name: 'ui-kit',
        exports: { '.': { style: './ui.css', default: './index.js' } },
      }),
      'index.js': 'export {}\n',
      'ui.css': PROBLEM,
    })
    const sheets = onDisk(project, { 'app/globals.css': "@import url('ui-kit');\n" })
    const kit = { file: path.relative(project.dir, path.join(root, 'ui.css')), css: PROBLEM }
    await runSheets(project, [...sheets, kit, ATOMIC_SHEET], { options: {} })
    expect(problemSheets(project)).toEqual(['node_modules/ui-kit/ui.css'])
  })

  it('counts while a CSS module that the code imports composes from it', async () => {
    const project = makeProject({
      'app/page.tsx':
        "import styles from './card.module.css'\n\nexport default function Page() {\n  return styles.card\n}\n",
    })
    const sheets = onDisk(project, {
      'app/card.module.css': ".card {\n  composes: base from './base.module.css';\n}\n",
      'app/base.module.css': PROBLEM,
    })
    await runSheets(project, [...sheets, ATOMIC_SHEET], { options: {} })
    expect(problemSheets(project)).toEqual(['app/base.module.css'])
  })

  it('control: a stylesheet that was never a file on disk keeps counting', async () => {
    const project = makeProject({
      'app/page.tsx': 'export default function Page() {\n  return null\n}\n',
    })
    await runSheets(project, [{ file: 'app/virtual.css', css: PROBLEM }, ATOMIC_SHEET], {
      options: {},
    })
    expect(problemSheets(project)).toEqual(['app/virtual.css'])
  })
})

describe('the stylesheets the atom layer run reads', () => {
  it('are declared to the bundler, so removing an @import runs the atom layer again', async () => {
    const project = makeProject({ 'app/layout.tsx': LAYOUT_IMPORTING('./globals.css') })
    const sheets = onDisk(project, {
      'app/globals.css': "@import url('./base.css');\n",
      'app/base.css': '.b {\n  color: red;\n}\n',
    })
    const results = await runSheets(project, [...sheets, ATOMIC_SHEET], { options: {} })
    const files = declaredFiles(project, results.at(-1)!.messages)
    expect(files).toEqual(expect.arrayContaining(['app/globals.css', 'app/base.css']))
    expect(Object.keys(recordOf(project).files)).toEqual(
      expect.arrayContaining(['app/globals.css', 'app/base.css']),
    )
  })
})
