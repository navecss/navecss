/**
 * A file the graph selects and cannot open is never skipped: it is a problem in the record, and
 * it is still declared to the bundler so a fix runs the plugin again.
 */
import { chmodSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { moduleSource, runAndRead, scratchProjects } from './helpers/graph-fixture.ts'

const project = scratchProjects()

const isRoot = process.getuid?.() === 0

const locked: string[] = []
afterEach(() => {
  for (const file of locked) chmodSync(file, 0o644)
  locked.length = 0
})

/**
 * A project whose page renders a card the plugin cannot open.
 */
function projectWithLockedCard(): Project {
  const app = project({
    'app/page.tsx':
      "import { Card } from './Card'\n\nexport default function Page() {\n  return <Card />\n}\n",
    'app/Card.tsx': moduleSource('app/Card.tsx', ['grid']),
  })
  const card = path.join(app.dir, 'app/Card.tsx')
  chmodSync(card, 0o000)
  locked.push(card)
  return app
}

describe.skipIf(isRoot)('a selected file that cannot be opened', () => {
  it('is an unreadable problem in that file', async () => {
    const { record } = await runAndRead(projectWithLockedCard())
    expect(record.problems.map((problem) => [problem.file, problem.kind])).toEqual([
      ['app/Card.tsx', 'unreadable'],
    ])
  })

  it('is still declared to the bundler as a dependency', async () => {
    const app = projectWithLockedCard()
    const { result } = await runAndRead(app)
    const declared = result.messages
      .filter((message) => message.type === 'dependency')
      .map((message) => message.file as string)
    expect(declared).toContain(path.join(app.dir, 'app/page.tsx'))
    expect(declared).toContain(path.join(app.dir, 'app/Card.tsx'))
  })
})
