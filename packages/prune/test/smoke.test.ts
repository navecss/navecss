import { afterEach, describe, expect, it } from 'vitest'

import { atomsIn } from './helpers/layer.ts'
import { ATOMIC_CSS, createProject, runPlugin } from './helpers/project.ts'

describe('the test helper', () => {
  const projects: ReturnType<typeof createProject>[] = []
  afterEach(() => {
    for (const project of projects) project.remove()
    projects.length = 0
  })

  it('runs the plugin over core atomic.css and reads the layer back', async () => {
    const project = createProject()
    projects.push(project)
    const result = await runPlugin(project, { options: {} })
    expect(atomsIn(ATOMIC_CSS).length).toBeGreaterThan(40)
    expect(result.css.length).toBeGreaterThan(0)
  })
})
