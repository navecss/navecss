import type { Message } from 'postcss'

import { rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { atomsIn } from './helpers/layer.ts'
import { makeProject, pageCalling, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const OK_LIB = {
  'package.json': JSON.stringify({
    name: 'ok-lib',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    dependencies: { '@navecss/core': '*' },
  }),
  'index.js': "import { cx } from '@navecss/core/cx'\n\nexport const gapped = cx('gap')\n",
}

/**
 * A project with an about page, a card component reached through the `@/` alias and a dependency
 * that calls `cx`.
 */
function appProject(files: Record<string, string> = {}): Project {
  const project = makeProject({
    'app/page.tsx':
      "import { Card } from '@/components/Card'\n\nexport default function Page() {\n  return <Card />\n}\n",
    'app/about/page.tsx': pageCalling("'flex'"),
    'components/Card.tsx':
      "import { gapped } from 'ok-lib'\n\nexport function Card() {\n  return <div className={gapped} />\n}\n",
    ...files,
  })
  project.install('ok-lib', OK_LIB)
  return project
}

/**
 * The messages of the plugin of one type.
 */
function messagesOf(messages: readonly Message[], type: string): Message[] {
  return messages.filter(
    (message) => message.plugin === 'postcss-nave-prune' && message.type === type,
  )
}

/**
 * The absolute paths the `dependency` messages name, sorted.
 */
function dependencyFiles(messages: readonly Message[]): string[] {
  return messagesOf(messages, 'dependency')
    .map((message) => message.file as string)
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * Whether `child` lies inside `parent`.
 */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

describe('AC-nextjs-used-atoms-04: the plugin declares every file and directory it read', () => {
  it('AC-nextjs-used-atoms-04: dependency messages name the recorded files plus both config files', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const record = recordOf(project)
    const recorded = Object.keys(record.files).map((key) => path.join(project.dir, key))
    const configs = [
      path.join(project.dir, 'postcss.config.mjs'),
      path.join(project.dir, 'next.config.ts'),
    ]
    const named = dependencyFiles(messages)
    // Control: the files the graph reached are in the record, so the case was reached.
    expect(recorded).toEqual(
      expect.arrayContaining([
        path.join(project.dir, 'app/page.tsx'),
        path.join(project.dir, 'app/about/page.tsx'),
        path.join(project.dir, 'components/Card.tsx'),
        path.join(project.dir, 'node_modules/ok-lib/index.js'),
      ]),
    )
    // The record lists the config files among the files it read, so the messages are exactly the
    // recorded files: both config files are among them.
    expect(recorded).toEqual(expect.arrayContaining(configs))
    expect(named.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...new Set([...recorded, ...configs])].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('AC-nextjs-used-atoms-04: the dependency messages include the resolver config and each package.json the plugin read', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const recorded = Object.keys(recordOf(project).files)
    const named = dependencyFiles(messages)
    for (const file of ['tsconfig.json', 'package.json', 'node_modules/ok-lib/package.json']) {
      expect(recorded).toContain(file)
      expect(named).toContain(path.join(project.dir, file))
    }
  })

  it('AC-nextjs-used-atoms-04: dir-dependency messages name the directories the files were selected from and the ones a specifier could have matched in', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const selected = Object.keys(recordOf(project).directories).map((key) =>
      path.resolve(project.dir, key),
    )
    const named = messagesOf(messages, 'dir-dependency').map((message) =>
      path.resolve(message.dir as string),
    )
    expect(selected).toContain(path.join(project.dir, 'app'))
    expect(named).toEqual(expect.arrayContaining(selected))
    // `@/components/Card` could have matched a file beside `Card.tsx`.
    expect(named).toContain(path.join(project.dir, 'components'))
    for (const directory of named) {
      expect(directory === project.dir || isInside(project.dir, directory)).toBe(true)
    }
  })

  it('AC-nextjs-used-atoms-04: no dependency message names a directory', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const named = dependencyFiles(messages)
    expect(named.length).toBeGreaterThan(0)
    for (const file of named) expect(statSync(file).isFile()).toBe(true)
    // Control: directories exist among the declarations, only under the other message type.
    expect(messagesOf(messages, 'dir-dependency').length).toBeGreaterThan(0)
  })

  it('AC-nextjs-used-atoms-04: the messages name the config files that are there, whatever their extension', async () => {
    const project = appProject({
      'next.config.mjs': 'export default {}\n',
      'postcss.config.js': 'export default { plugins: {} }\n',
    })
    rmSync(path.join(project.dir, 'next.config.ts'))
    rmSync(path.join(project.dir, 'postcss.config.mjs'))
    const { messages } = await runAtomic(project)
    const named = dependencyFiles(messages)
    expect(named).toContain(path.join(project.dir, 'next.config.mjs'))
    expect(named).toContain(path.join(project.dir, 'postcss.config.js'))
    expect(named).not.toContain(path.join(project.dir, 'next.config.ts'))
    expect(named).not.toContain(path.join(project.dir, 'postcss.config.mjs'))
  })

  it('AC-nextjs-used-atoms-04: a file read outside the root is named in no message', async () => {
    const outside = makeProject({
      'shared.ts': "import { cx } from '@navecss/core/cx'\n\nexport const hide = cx('hidden')\n",
    })
    const project = makeProject({
      'app/page.tsx':
        "import { hide } from '@outside/shared'\n\nexport default function Page() {\n  return <div className={hide} />\n}\n",
    })
    const reach = path.relative(project.dir, outside.dir).split(path.sep).join('/')
    project.write({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          jsx: 'preserve',
          baseUrl: '.',
          paths: { '@/*': ['./*'], '@outside/*': [`${reach}/*`] },
        },
      }),
    })
    const result = await runAtomic(project)
    // Control: the file outside the root was read, so its atom is in the layer.
    expect(atomsIn(result.css)).toContain('hidden')
    const named = result.messages.flatMap((message) =>
      [message.file, message.dir].filter((value): value is string => typeof value === 'string'),
    )
    expect(named.length).toBeGreaterThan(0)
    for (const entry of named) {
      expect(entry === project.dir || isInside(project.dir, entry)).toBe(true)
      expect(entry === outside.dir || isInside(outside.dir, entry)).toBe(false)
    }
  })
})
