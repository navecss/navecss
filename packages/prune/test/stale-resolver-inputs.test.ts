/**
 * What steers the plugin's read of the code is recorded with the code itself: the resolver's
 * config files and their chain, the `package.json` files it opens, the directories a specifier
 * could have matched in, and the links through `node_modules`. A change to any of them after the
 * plugin ran stops the build, naming what changed; a change that steers nothing does not.
 */
import { rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Project } from './helpers/project.ts'

import { writeBuildCss } from './helpers/build-output.ts'
import { listen, NOTHING, runCheck } from './helpers/hook-run.ts'
import { makeProject, registerIsolation } from './helpers/plugin-fixtures.ts'
import { runAtomic } from './helpers/plugin-run.ts'
import { recordOf } from './helpers/project.ts'

registerIsolation()

const CX = "import { cx } from '@navecss/core/cx'"

/**
 * A page that renders what `import` brings in under the name `value`.
 */
function pageImporting(specifier: string): string {
  return [
    `import { value } from '${specifier}'`,
    '',
    'export default function Page() {',
    '  return <div className={value} />',
    '}',
    '',
  ].join('\n')
}

/**
 * A module exporting `value`, the class of one atom.
 */
function moduleOf(atom: string): string {
  return `${CX}\n\nexport const value = cx('${atom}')\n`
}

/**
 * The package.json of an app whose `#ui/*` import points at `target`.
 */
function manifestImporting(target: string): string {
  return JSON.stringify({ name: 'app', private: true, imports: { '#ui/*': target } })
}

/**
 * A tsconfig whose `@/*` alias points at `target`.
 */
function aliasConfig(target: string, more: Record<string, unknown> = {}): string {
  return JSON.stringify({
    compilerOptions: { jsx: 'preserve', baseUrl: '.', paths: { '@/*': [target] } },
    ...more,
  })
}

/**
 * Runs the plugin over the project and writes the CSS it left as the build's output.
 */
async function built(project: Project): Promise<void> {
  listen()
  const result = await runAtomic(project, [], { options: {} })
  writeBuildCss(project, result.css)
}

/**
 * The first line the check printed, which names what changed.
 */
async function stoppedWith(project: Project): Promise<string> {
  const printed = await runCheck(project)
  expect(printed.error).toBeInstanceOf(Error)
  return printed.errors[0] ?? ''
}

describe('AC-nextjs-used-atoms-31: a change to what steers the resolver stops the build', () => {
  it('a tsconfig paths remap after the plugin ran stops it naming tsconfig.json', async () => {
    const project = makeProject({
      'tsconfig.json': aliasConfig('./a/*'),
      'a/ui/Card.tsx': moduleOf('flex'),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'tsconfig.json': aliasConfig('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): tsconfig.json changed after')
  })

  it('a change in a config the tsconfig extends stops it naming that file', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
      'tsconfig.base.json': aliasConfig('./a/*'),
      'a/ui/Card.tsx': moduleOf('flex'),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'tsconfig.base.json': aliasConfig('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): tsconfig.base.json changed after')
  })

  it('a tsconfig created beside a jsconfig the plugin used stops it naming tsconfig.json', async () => {
    const project = makeProject({
      'jsconfig.json': aliasConfig('./a/*'),
      'a/ui/Card.tsx': moduleOf('flex'),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    rmSync(path.join(project.dir, 'tsconfig.json'))
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'tsconfig.json': aliasConfig('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): tsconfig.json changed after')
  })

  it("a change to a referenced project's tsconfig stops it naming that file", async () => {
    const project = makeProject({
      'tsconfig.json': aliasConfig('./*', { files: [], references: [{ path: './packages/ui' }] }),
      'packages/ui/tsconfig.json': JSON.stringify({ compilerOptions: { composite: true } }),
      'packages/ui/src/Card.tsx': moduleOf('flex'),
      'app/page.tsx': pageImporting('../packages/ui/src/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({
      'packages/ui/tsconfig.json': JSON.stringify({
        compilerOptions: { composite: true, paths: { '#x': ['./src/Card.tsx'] } },
      }),
    })

    expect(await stoppedWith(project)).toContain(
      'withNave(): packages/ui/tsconfig.json changed after',
    )
  })

  it('a config outside the project root is recorded, stops the build when it changes, and is declared to no bundler', async () => {
    const outside = makeProject()
    const project = makeProject({
      'a/ui/Card.tsx': moduleOf('flex'),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    const reach = path.relative(project.dir, outside.dir).split(path.sep).join('/')
    const back = path.relative(outside.dir, project.dir).split(path.sep).join('/')
    const base = (target: string): string =>
      JSON.stringify({ compilerOptions: { baseUrl: back, paths: { '@/*': [target] } } })
    outside.write({ 'base.json': base('./a/*') })
    project.write({ 'tsconfig.json': JSON.stringify({ extends: `${reach}/base.json` }) })
    listen()
    const result = await runAtomic(project, [], { options: {} })
    writeBuildCss(project, result.css)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(Object.keys(recordOf(project).files)).toContain(`${reach}/base.json`)
    const named = result.messages.flatMap((message) =>
      [message.file, message.dir].filter((value): value is string => typeof value === 'string'),
    )
    expect(named.length).toBeGreaterThan(0)
    expect(named.some((entry) => entry.startsWith(outside.dir))).toBe(false)
    expect(await runCheck(project)).toEqual(NOTHING)

    outside.write({ 'base.json': base('./b/*') })

    expect(await stoppedWith(project)).toContain(`withNave(): ${reach}/base.json changed after`)
  })

  it("a change to the app's own package.json imports map stops it naming package.json", async () => {
    const project = makeProject({
      'package.json': manifestImporting('./components/a/*.ts'),
      'components/a/y.ts': moduleOf('flex'),
      'components/b/y.ts': moduleOf('grid'),
      'app/page.tsx': pageImporting('#ui/y'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'package.json': manifestImporting('./components/b/*.ts') })

    expect(await stoppedWith(project)).toContain('withNave(): package.json changed after')
  })

  it.each([
    ['a relative import', '../components/card'],
    ['an alias import', '@/components/card'],
  ])(
    'a file created beside the one %s resolved to stops it naming the directory',
    async (_name, specifier) => {
      const project = makeProject({
        'components/card/index.ts': moduleOf('flex'),
        'app/page.tsx': pageImporting(specifier),
      })
      await built(project)
      expect(recordOf(project).atoms).toEqual(['flex'])
      expect(await runCheck(project)).toEqual(NOTHING)

      project.write({ 'components/card.ts': moduleOf('grid') })

      expect(await stoppedWith(project)).toContain('withNave(): components/ changed after')
    },
  )

  it('a package link re-pointed to another target stops it naming the link', async () => {
    const project = makeProject({
      'store/dep@1/index.js': moduleOf('flex'),
      'store/dep@2/index.js': moduleOf('grid'),
      'app/page.tsx': pageImporting('dep'),
    })
    const link = path.join(project.dir, 'node_modules/dep')
    symlinkSync(path.join(project.dir, 'store/dep@1'), link, 'dir')
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    rmSync(link)
    symlinkSync(path.join(project.dir, 'store/dep@2'), link, 'dir')

    expect(await stoppedWith(project)).toContain('withNave(): node_modules/dep changed after')
  })

  it('a package installed in a nearer node_modules than the one the plugin used stops it naming the link', async () => {
    const project = makeProject({
      'components/ui/Button.tsx': "export { value } from 'dep'\n",
      'app/page.tsx': pageImporting('../components/ui/Button'),
    })
    project.install('dep', { 'index.js': moduleOf('flex') })
    await built(project)
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'components/ui/node_modules/dep/index.js': moduleOf('grid') })

    expect(await stoppedWith(project)).toContain(
      'withNave(): components/ui/node_modules changed after',
    )
  })

  it('a node_modules directory created above an importer, below the one the package was found in, stops it naming the directory', async () => {
    const project = makeProject({
      'components/ui/Button.tsx': "export { value } from 'dep'\n",
      'app/page.tsx': pageImporting('../components/ui/Button'),
    })
    project.install('dep', { 'index.js': moduleOf('flex') })
    await built(project)
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'components/node_modules/dep/index.js': moduleOf('grid') })

    expect(await stoppedWith(project)).toContain(
      'withNave(): components/node_modules changed after',
    )
  })

  it('a file created earlier in a paths fallback list than the one the alias resolved through stops it naming that directory', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', baseUrl: '.', paths: { '@/*': ['./a/*', './b/*'] } },
      }),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ui/ changed after')
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
  })

  it('a file created earlier in a paths fallback list of a config without baseUrl stops it naming that directory', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { jsx: 'preserve', paths: { '@/*': ['./a/*', './b/*'] } },
      }),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ui/ changed after')
  })

  it('a file created earlier in a paths fallback list that an extended config sets stops it naming that directory', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['./a/*', './b/*'] } },
      }),
      'b/ui/Card.tsx': moduleOf('grid'),
      'app/page.tsx': pageImporting('@/ui/Card'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'a/ui/Card.tsx': moduleOf('flex') })

    expect(await stoppedWith(project)).toContain('withNave(): a/ui/ changed after')
  })

  it('a file created beside one that a relative import inside node_modules resolved to stops it naming the directory', async () => {
    const project = makeProject({ 'app/page.tsx': pageImporting('dep') })
    project.install('dep', {
      'package.json': JSON.stringify({
        name: 'dep',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
        dependencies: { '@navecss/core': '*' },
      }),
      'index.js': "export { value } from './val'\n",
      'val.js': moduleOf('flex'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'node_modules/dep/val.ts': moduleOf('grid') })

    expect(await stoppedWith(project)).toContain('withNave(): node_modules/dep/ changed after')
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
  })

  it('a package.json created between an importer and the nearest one stops it naming that file', async () => {
    const project = makeProject({
      'package.json': manifestImporting('./a/*.ts'),
      'a/y.ts': moduleOf('flex'),
      'app/b/y.ts': moduleOf('grid'),
      'app/page.tsx': pageImporting('#ui/y'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({ 'app/package.json': manifestImporting('./b/*.ts') })

    expect(await stoppedWith(project)).toContain('withNave(): app/package.json changed after')
    await built(project)
    expect(recordOf(project).atoms).toEqual(['grid'])
  })
})

/**
 * A tsconfig whose `@/*` alias points at `target`, and nothing else.
 */
function aliasTo(target: string): string {
  return aliasConfig(target)
}

/**
 * A config a package provides, whose `@/*` alias points at `target`.
 */
function packageBase(target: string): string {
  return JSON.stringify({ compilerOptions: { paths: { '@/*': [target] } } })
}

/**
 * The files of a project where `@/ui/Card` is `flex` under `a/` and `grid` under `b/`.
 */
function twoTargets(): Record<string, string> {
  return {
    'a/ui/Card.tsx': moduleOf('flex'),
    'b/ui/Card.tsx': moduleOf('grid'),
    'app/page.tsx': pageImporting('@/ui/Card'),
  }
}

describe('AC-nextjs-used-atoms-31: the forms a config chain takes are all followed', () => {
  it('a base with comments and trailing commas is followed', async () => {
    const project = makeProject({
      'tsconfig.json': '{\n  // the base\n  "extends": "./base.json", /* trailing */\n}\n',
      'base.json': aliasTo('./a/*'),
      ...twoTargets(),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])

    project.write({ 'base.json': aliasTo('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): base.json changed after')
  })

  it('an extends without the .json extension is followed', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: './base' }),
      'base.json': aliasTo('./a/*'),
      ...twoTargets(),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])

    project.write({ 'base.json': aliasTo('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): base.json changed after')
  })

  it('an extends that is a list is followed in every entry', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: ['./one.json', './base.json'] }),
      'one.json': '{}',
      'base.json': aliasTo('./a/*'),
      ...twoTargets(),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])

    project.write({ 'base.json': aliasTo('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): base.json changed after')
  })

  it('an extends that names a package is followed to the file the package provides', async () => {
    const project = makeProject({
      'tsconfig.json': JSON.stringify({ extends: 'cfg/base.json' }),
      ...twoTargets(),
    })
    project.install('cfg', {
      'package.json': JSON.stringify({ name: 'cfg', version: '1.0.0' }),
      'base.json': packageBase('../../a/*'),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])

    project.write({ 'node_modules/cfg/base.json': packageBase('../../b/*') })

    expect(await stoppedWith(project)).toContain('base.json changed after')
  })

  it('a project reference to a config file by its name is followed', async () => {
    const project = makeProject({
      'tsconfig.json': aliasConfig('./*', {
        files: [],
        references: [{ path: './packages/ui/tsconfig.app.json' }],
      }),
      'packages/ui/tsconfig.app.json': '{}',
      'packages/ui/src/Card.tsx': moduleOf('flex'),
      'app/page.tsx': pageImporting('../packages/ui/src/Card'),
    })
    await built(project)

    project.write({
      'packages/ui/tsconfig.app.json': JSON.stringify({
        compilerOptions: { paths: { '#x': ['./src/Card.tsx'] } },
      }),
    })

    expect(await stoppedWith(project)).toContain('tsconfig.app.json changed after')
  })

  it('a config that starts with a byte order mark is followed to its base', async () => {
    const project = makeProject({
      'tsconfig.json': '\u{FEFF}{"extends": "./base.json"}',
      'base.json': aliasTo('./a/*'),
      ...twoTargets(),
    })
    await built(project)
    expect(recordOf(project).atoms).toEqual(['flex'])

    project.write({ 'base.json': aliasTo('./b/*') })

    expect(await stoppedWith(project)).toContain('withNave(): base.json changed after')
  })
})

describe('AC-nextjs-used-atoms-32: a change that steers nothing the plugin read does not stop the build', () => {
  it('leaves a build green when files appear beside what a specifier resolved to, with other names', async () => {
    const project = makeProject({
      'components/card/index.ts': moduleOf('flex'),
      'app/page.tsx': pageImporting('../components/card'),
    })
    await built(project)
    expect(await runCheck(project)).toEqual(NOTHING)

    project.write({
      'components/cardigan.ts': moduleOf('grid'),
      'components/other.ts': moduleOf('block'),
      'components/card/readme.txt': 'notes\n',
      'README.md': '# app\n',
      'notes.txt': 'notes\n',
    })
    project.install('unrelated', { 'index.js': moduleOf('hidden') })

    expect(await runCheck(project)).toEqual(NOTHING)
  })
})
