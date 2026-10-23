/**
 * A run over the atom layer that stops before trimming still tells the bundler what it read: the
 * config files, every file it read before it stopped and every directory it had selected files
 * from. Without them, Turbopack has nothing to watch and keeps serving the stopped run's output
 * after the cause is fixed.
 */
import type { Message } from 'postcss'

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import {
  capturePrinted,
  makeProject,
  pageCalling,
  registerIsolation,
} from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'

registerIsolation()

/**
 * The paths the plugin's messages of `type` name, relative to the project directory, sorted.
 */
function declared(project: Project, messages: readonly Message[], type: string): string[] {
  return messages
    .filter((message) => message.plugin === 'postcss-nave-prune' && message.type === type)
    .map((message) => (type === 'dependency' ? message.file : message.dir) as string)
    .map((file) => path.relative(project.dir, file) || '.')
    .toSorted((a, b) => a.localeCompare(b))
}

describe('a run over the atom layer that stops before reading the code', () => {
  it('declares the config files, so fixing next.config runs it again', async () => {
    const project = makeProject({ 'app/page.tsx': pageCalling("'grid'") })
    const printed = capturePrinted()
    const result = await runAtomic(project, [], { options: { extend: './nope.mjs' } })
    expect(printed().some((line) => line.includes('stopped without trimming'))).toBe(true)
    expect(declared(project, result.messages, 'dependency')).toEqual([
      'next.config.ts',
      'postcss.config.mjs',
    ])
  })
})

describe('a run over the atom layer that stops after reading the code', () => {
  it('declares every file it read, the resolver config and package.json among them, and every directory it selected files from', async () => {
    const project = makeProject({
      'app/page.tsx': "import { Card } from '../components/Card'\n\nexport default Card\n",
      'components/Card.tsx': pageCalling("'grid'"),
    })
    mkdirSync(path.join(project.dir, '.next/cache/navecss-prune.json'), { recursive: true })
    const printed = capturePrinted()
    const result = await runAtomic(project, [], { options: {} })
    expect(printed().some((line) => line.includes('stopped without trimming'))).toBe(true)
    expect(declared(project, result.messages, 'dependency')).toEqual([
      'app/page.tsx',
      'components/Card.tsx',
      'next.config.ts',
      'package.json',
      'postcss.config.mjs',
      'tsconfig.json',
    ])
    expect(declared(project, result.messages, 'dir-dependency')).toEqual(
      expect.arrayContaining(['.', 'app']),
    )
  })

  it('control: the same project, when the run finishes, declares the same files and directories', async () => {
    const files = {
      'app/page.tsx': "import { Card } from '../components/Card'\n\nexport default Card\n",
      'components/Card.tsx': pageCalling("'grid'"),
    }
    const stopped = makeProject(files)
    mkdirSync(path.join(stopped.dir, '.next/cache/navecss-prune.json'), { recursive: true })
    capturePrinted()
    const stoppedRun = await runAtomic(stopped, [], { options: {} })
    const finished = makeProject(files)
    const finishedRun = await runAtomic(finished, [], { options: {} })
    for (const type of ['dependency', 'dir-dependency']) {
      expect(declared(stopped, stoppedRun.messages, type)).toEqual(
        declared(finished, finishedRun.messages, type),
      )
    }
  })
})
