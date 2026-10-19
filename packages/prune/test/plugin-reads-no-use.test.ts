import { describe, expect, it } from 'vitest'

import type { NaveOptions } from '../src/options.ts'
import type { Sheet } from './helpers/plugin-run.ts'
import type { Project } from './helpers/project.ts'

import { atomsIn } from './helpers/layer.ts'
import { makeProject, registerIsolation, unreadableLibrary } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const KF_PAGE =
  "import { look } from 'kf-lib'\n\nexport default function Page() {\n  return <div className={look('x')} />\n}\n"

/**
 * The fixture of a site that holds content only: a page that calls no `cx()`, holds no `nave-`
 * text and imports one library whose only call is `cx(v)`.
 */
function contentProject(files: Record<string, string> = {}): Project {
  const project = makeProject({ 'app/page.tsx': KF_PAGE, ...files })
  project.install('kf-lib', unreadableLibrary())
  return project
}

/**
 * Runs the project's `atomic.css` (after `others`) and returns the layer's atoms and the record.
 */
async function emitted(
  project: Project,
  options: NaveOptions,
  others: readonly Sheet[] = [],
): Promise<{ readonly atoms: string[]; readonly readsNoUse: boolean }> {
  const result = await runAtomic(project, others, { options })
  return { atoms: atomsIn(result.css), readsNoUse: recordOf(project).readsNoUse }
}

describe('AC-nextjs-used-atoms-30: readsNoUse is true exactly when the keepFor lists alone are emitted', () => {
  it("AC-nextjs-used-atoms-30: the content-only fixture emits keepFor's atom and reads no use", async () => {
    const project = contentProject()
    const { atoms, readsNoUse } = await emitted(project, { keepFor: { 'kf-lib': ['block'] } })
    expect(atoms).toEqual(['block'])
    expect(readsNoUse).toBe(true)
    expect(recordOf(project).problems).toEqual([])
  })

  it("AC-nextjs-used-atoms-30: control, without keepFor the library's unreadable call is a problem", async () => {
    const project = contentProject()
    await emitted(project, {})
    expect(recordOf(project).problems.length).toBeGreaterThan(0)
  })

  it('AC-nextjs-used-atoms-30: with the library and keepFor removed the layer is empty and readsNoUse is true', async () => {
    const project = makeProject({
      'app/page.tsx': 'export default function Page() {\n  return <div />\n}\n',
    })
    const { atoms, readsNoUse } = await emitted(project, {})
    expect(atoms).toEqual([])
    expect(readsNoUse).toBe(true)
  })

  it('AC-nextjs-used-atoms-30: keepFor srOnly holds srOnly and srOnlyFocusable whole and readsNoUse stays true', async () => {
    const project = contentProject()
    const { atoms, readsNoUse } = await emitted(project, { keepFor: { 'kf-lib': ['srOnly'] } })
    expect(atoms).toEqual(['srOnly', 'srOnlyFocusable'])
    expect(readsNoUse).toBe(true)
  })

  it('AC-nextjs-used-atoms-30: keep: ["flex"] makes readsNoUse false', async () => {
    const project = contentProject()
    const { atoms, readsNoUse } = await emitted(project, {
      keep: ['flex'],
      keepFor: { 'kf-lib': ['block'] },
    })
    expect(atoms).toEqual(['block', 'flex'])
    expect(readsNoUse).toBe(false)
  })

  it('AC-nextjs-used-atoms-30: a page calling cx("flex") makes readsNoUse false', async () => {
    const project = contentProject({
      'app/page.tsx': `import { look } from 'kf-lib'\nimport { cx } from '@navecss/core/cx'\n\nexport default function Page() {\n  return <div className={cx('flex', look('x'))} />\n}\n`,
    })
    const { atoms, readsNoUse } = await emitted(project, { keepFor: { 'kf-lib': ['block'] } })
    expect(atoms).toEqual(['block', 'flex'])
    expect(readsNoUse).toBe(false)
  })

  it('AC-nextjs-used-atoms-30: a module holding the string "nave-flex" makes readsNoUse false', async () => {
    const project = contentProject({
      'app/label.ts': "export const label = 'nave-flex'\n",
      'app/page.tsx': `import './label'\n${KF_PAGE}`,
    })
    const { atoms, readsNoUse } = await emitted(project, { keepFor: { 'kf-lib': ['block'] } })
    expect(atoms).toEqual(['block', 'flex'])
    expect(readsNoUse).toBe(false)
  })

  it('AC-nextjs-used-atoms-30: an @nave use in a stylesheet makes readsNoUse false', async () => {
    const project = contentProject()
    const globals = { css: '.card { @nave flex; }\n', file: 'app/globals.css' }
    const { atoms, readsNoUse } = await emitted(project, { keepFor: { 'kf-lib': ['block'] } }, [
      globals,
    ])
    expect(atoms).toEqual(['block'])
    expect(readsNoUse).toBe(false)
  })
})
