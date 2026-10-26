import type { Message } from 'postcss'

import { existsSync, rmSync, statSync } from 'node:fs'
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
    // A file outside the root is recorded and declared to no bundler.
    const recorded = Object.keys(record.files)
      .map((key) => path.join(project.dir, key))
      .filter((file) => isInside(project.dir, file))
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

  it('AC-nextjs-used-atoms-04: dir-dependency messages name the directories the files were selected from and the ones a specifier could have matched in, and no other', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const record = recordOf(project)
    const selected = Object.keys(record.directories).map((key) => path.resolve(project.dir, key))
    // A listing is keyed by the path of the stem, with a trailing `*`: its directory is declared.
    const matched = Object.keys(record.listings).map((key) =>
      path.resolve(project.dir, path.posix.dirname(key.slice(0, -1))),
    )
    const expected = [...new Set([...selected, ...matched])]
      .filter((directory) => directory === project.dir || isInside(project.dir, directory))
      .toSorted((a, b) => a.localeCompare(b))
    // The project root is both a directory files were selected from and one a specifier could have
    // matched in, so it is named once for each.
    const named = [
      ...new Set(
        messagesOf(messages, 'dir-dependency').map((message) =>
          path.resolve(message.dir as string),
        ),
      ),
    ].toSorted((a, b) => a.localeCompare(b))
    expect(selected).toContain(path.join(project.dir, 'app'))
    // `@/components/Card` could have matched a file beside `Card.tsx`.
    expect(matched).toContain(path.join(project.dir, 'components'))
    expect(named).toEqual(expected)
  })

  it('AC-nextjs-used-atoms-04: no dependency message names a directory', async () => {
    const project = appProject()
    const { messages } = await runAtomic(project)
    const named = dependencyFiles(messages)
    expect(named.length).toBeGreaterThan(0)
    // A declared file that is not there yet (a `package.json` that could be created) is no directory.
    const existing = named.filter((file) => existsSync(file))
    expect(existing.length).toBeGreaterThan(0)
    for (const file of existing) expect(statSync(file).isFile()).toBe(true)
    // Control: directories exist among the declarations, only under the other message type.
    expect(messagesOf(messages, 'dir-dependency').length).toBeGreaterThan(0)
  })

  it('AC-nextjs-used-atoms-04: an extends that names a file beside a directory of the same name declares the file, never the directory', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: './base' }),
      'base.json': '{}',
      'base/readme.txt': 'notes\n',
      'app/page.tsx': pageCalling("'flex'"),
    })
    const { messages } = await runAtomic(project)
    const named = dependencyFiles(messages)
    expect(named).toContain(path.join(project.dir, 'base.json'))
    expect(named).not.toContain(path.join(project.dir, 'base'))
    expect(Object.keys(recordOf(project).files)).not.toContain('base')
    const existing = named.filter((name) => existsSync(name))
    for (const file of existing) expect(statSync(file).isFile()).toBe(true)
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

  it.each([
    ['as Turbopack leaves it', {}],
    ['as webpack’s callback leaves it', { isBundlerDir: true }],
  ])(
    'AC-nextjs-used-atoms-04: a file read outside the root is named in no message, with the hand-off %s',
    async (_shape, run) => {
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
      const result = await runAtomic(project, [], run)
      // Control: the file outside the root was read, so its atom is in the layer.
      expect(atomsIn(result.css)).toContain('hidden')
      expect(Object.keys(recordOf(project).files).some((file) => file.endsWith('shared.ts'))).toBe(
        true,
      )
      const named = result.messages.flatMap((message) =>
        [message.file, message.dir].filter((value): value is string => typeof value === 'string'),
      )
      expect(named.length).toBeGreaterThan(0)
      for (const entry of named) {
        expect(entry === project.dir || isInside(project.dir, entry)).toBe(true)
        expect(entry === outside.dir || isInside(outside.dir, entry)).toBe(false)
      }
    },
  )
})
