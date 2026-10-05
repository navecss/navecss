/**
 * The used-atoms criteria for dependency code and the escapes (AC-used-atoms-08, -16, -19, -43 to
 * -46, -55): a problem in a package under `node_modules` names the package and prints the
 * consumer's `keepFor` line, listing a package stands in for reading it, and the remedy block is
 * split by owner.
 */
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import type { ScratchApp } from './helpers/vite-app.ts'

import { atomClassMap } from '../src/atoms.ts'
import { navePlugin } from '../src/vite.ts'
import {
  addPackage,
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'

const IMPORT = "import { cx } from '@navecss/core/cx'\n"
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/generated/minified-dependencies',
)

/**
 * An app importing the packages `names` (each for its effect), and calling `flex` itself.
 */
function appUsing(names: readonly string[], files: Record<string, string> = {}): ScratchApp {
  const imports = names.map((name) => `import '${name}'`).join('\n')
  return makeUsedApp(
    appFiles({ 'src/App.ts': `${IMPORT}${imports}\nconsole.log(cx('flex'))\n`, ...files }, [
      'src/App.ts',
    ]),
  )
}

describe('AC-used-atoms-08 — well-formed minified dependencies build', () => {
  const minLib = readFileSync(path.join(FIXTURES, 'min-lib.js.txt'), 'utf8')
  const esbLib = readFileSync(path.join(FIXTURES, 'esb-lib.js.txt'), 'utf8')

  it('guards that the checked-in texts hold the forms R2 and R3 name', () => {
    expect(minLib).toContain('`flex`')
    expect(minLib).toMatch(/var r=e=>e\.map\(String\)/)
    expect(esbLib).toMatch(/var c="gap"/)
  })

  it('builds green and collects exactly flex, grid, itemsCenter and gap', async () => {
    const app = makeUsedApp(
      appFiles(
        {
          'src/App.ts':
            "import { a, b, pass } from 'min-lib'\nimport { c } from 'esb-lib'\nconsole.log(a(true), b(), pass([1]), c())\n",
        },
        ['src/App.ts'],
      ),
    )
    addPackage(app, 'min-lib', { 'index.js': minLib })
    addPackage(app, 'esb-lib', { 'index.js': esbLib })
    try {
      const built = await buildUsed(app)

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'itemsCenter', 'gap'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it.each(['esb-falsy-lib', 'vite-falsy-lib'])(
    'builds green and collects flex, grid, block and gap from %s, which prints false as !1 and undefined as void 0',
    async (name) => {
      const text = readFileSync(path.join(FIXTURES, `${name}.js.txt`), 'utf8')
      // A guard that the checked-in text holds the two spellings.
      expect(text).toContain('!1')
      expect(text).toContain('void 0')
      const app = makeUsedApp(
        appFiles(
          {
            'src/App.ts': `import { a, b, c } from '${name}'\nconsole.log(a(true), b(true), c())\n`,
          },
          ['src/App.ts'],
        ),
      )
      addPackage(app, name, { 'index.js': text })
      try {
        const built = await buildUsed(app)

        expect(built.error).toBeUndefined()
        expect(atomLayerAtoms(built.css)).toEqual(atoms('flex', 'grid', 'block', 'gap'))
      } finally {
        app.dispose()
      }
    },
    60_000,
  )

  it('control: assigning the let that holds an atom fails with one problem naming min-lib', async () => {
    const app = appUsing(['min-lib'])
    addPackage(app, 'min-lib', {
      'index.js': minLib.replace(
        'function n(){return e(`itemsCenter`)}',
        'function n(){let q=`itemsCenter`;q=`x`;return e(q)}',
      ),
    })
    try {
      const built = await buildUsed(app)

      expect(built.error).toMatch(/^1 problem in 1 file/)
      expect(built.error).toContain('min-lib')
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-16 — a problem in dependency code names the package and prints the keepFor line', () => {
  const badLib = [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export const t = (v) => cx(v)',
    '',
    "export const u = cx('interactve')",
    '',
    'export const w = [1].map(cx)',
    '',
  ].join('\n')

  it('fails with three problems in the package’s file and one line for bad-lib, ready to paste', async () => {
    const app = appUsing(['bad-lib'])
    addPackage(app, 'bad-lib', { 'index.js': badLib })
    try {
      const built = await buildUsed(app)
      const lines = built.error!.split('\n')

      expect(built.error).toMatch(/^3 problems in 1 file/)
      expect(
        lines.filter((line) => line.startsWith('node_modules/bad-lib/index.js:')),
      ).toHaveLength(3)
      const packageLine = lines.find((line) => line.startsWith('bad-lib is a dependency'))
      expect(packageLine).toContain("keepFor: { 'bad-lib': ['<atom>'] }")
      expect(packageLine).toContain('not yours to change')
      expect(packageLine).toContain('The lasting fix is the package’s'.replace('’', "'"))
      expect(built.error).not.toContain('keep alone')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('keep is not the remedy, and the pasted line clears it once its placeholder is filled', async () => {
    const app = appUsing(['bad-lib'])
    addPackage(app, 'bad-lib', { 'index.js': badLib })
    try {
      const withKeep = await buildUsed(app, {
        options: { keep: Object.keys(atomClassMap) as never },
      })
      const filled = await buildUsed(app, { options: { keepFor: { 'bad-lib': ['flex'] } } })

      expect(withKeep.error).toMatch(/^3 problems in 1 file/)
      expect(filled.error).toBeUndefined()
      expect(() => navePlugin({ keepFor: { 'bad-lib': ['<atom>' as never] } })).toThrow(
        'navePlugin(): keepFor["bad-lib"] names an unknown atom "<atom>"',
      )
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-19 — cx.dynamic() with no list is a build error, split by owner', () => {
  const tone = [
    IMPORT,
    'export function Tone(tone) {',
    '  const a = cx.dynamic(tone)',
    '  return a',
    '}',
    'export function Tone2(tone) {',
    '  return cx.dynamic(tone)',
    '}',
    '',
  ].join('\n')

  /**
   * An app whose `src/Tone.ts` calls `cx.dynamic()` twice and whose `dyn-lib` calls it once.
   */
  function dynamicApp(): ScratchApp {
    const app = makeUsedApp(
      appFiles({
        'src/Tone.ts': `${tone}console.log(Tone, Tone2)\n`,
        'src/uses.ts': "import { x } from 'dyn-lib'\nconsole.log(x)\n",
      }),
    )
    addPackage(app, 'dyn-lib', { 'index.js': `${IMPORT}export const x = (t) => cx.dynamic(t)\n` })
    return app
  }

  it('fails with the application problem counting 2 calls, one line each, none in dyn-lib', async () => {
    const app = dynamicApp()
    try {
      for (const options of [{}, { keep: [] }]) {
        const built = await buildUsed(app, { options })
        const lines = built.error!.split('\n')

        expect(built.error).toContain(
          'cx.dynamic() is called in 2 places in your code, but keep is empty',
        )
        expect(lines.filter((line) => line.startsWith('src/Tone.ts:'))).toHaveLength(2)
        expect(
          lines.some((line) => line.includes('dyn-lib') && line.startsWith('node_modules')),
        ).toBe(true)
      }
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('gives dyn-lib the consumer’s remedy alone, and clears each half with its own list', async () => {
    const app = dynamicApp()
    try {
      const keepOnly = await buildUsed(app, { options: { keep: ['flex'] } })
      const keepForOnly = await buildUsed(app, { options: { keepFor: { 'dyn-lib': ['flex'] } } })
      const both = await buildUsed(app, {
        options: { keep: ['flex'], keepFor: { 'dyn-lib': ['flex'] } },
      })
      const all = await buildUsed(app, { options: { atomic: 'all' } })

      expect(keepOnly.error).toMatch(
        /dyn-lib calls cx\.dynamic\(\) in 1 place and lists no atoms in keepFor/,
      )
      expect(keepOnly.error).not.toContain('lasting fix')
      expect(keepOnly.error).not.toContain('in your code')
      expect(keepForOnly.error).toContain('cx.dynamic() is called in 2 places in your code')
      expect(keepForOnly.error).not.toContain('dyn-lib calls')
      expect(both.error).toBeUndefined()
      expect(all.error).toBeUndefined()
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-43 — what listing a package in keepFor covers, and what stays an error', () => {
  const rows: Record<string, string> = {
    'index.js':
      "import './unreadable.js'\nimport './typo.js'\nimport './passed.js'\nimport './dist/cx.js'\nimport './dyn-import.js'\nimport './pieces.js'\nimport './readable.js'\nimport './literal.js'\n",
    'unreadable.js': `${IMPORT}export const a = (v) => cx(v)\n`,
    'typo.js': `${IMPORT}export const b = cx('interactve')\n`,
    'passed.js': `${IMPORT}export const c = [1].map(cx)\n`,
    'dist/cx.js': "export { cx } from '@navecss/core/cx'\n",
    'dyn-import.js': "import '@navecss/core/cx'\nexport const d = import('@navecss/core/cx')\n",
    'pieces.js': `${IMPORT}export const e = (t) => 'nave-' + t\nexport const f = cx('flex')\n`,
    'readable.js': `${IMPORT}export const g = cx('gap')\n`,
    'literal.js': "export const h = 'nave-truncate'\n",
  }

  it('fails with a dependency problem per unreadable row, and is green once the package is listed', async () => {
    const app = appUsing(['wide-lib'])
    addPackage(app, 'wide-lib', rows)
    try {
      const without = await buildUsed(app)
      const listed = await buildUsed(app, { options: { keepFor: { 'wide-lib': ['block'] } } })

      expect(without.error).toMatch(/^6 problems in 6 files/)
      expect(without.error).toContain('wide-lib')
      expect(listed.error).toBeUndefined()
      expect(atomLayerAtoms(listed.css)).toEqual(atoms('flex', 'block', 'gap', 'truncate'))
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('still fails a keepFor entry that names an unknown atom', () => {
    expect(() => navePlugin({ keepFor: { 'wide-lib': ['interactve' as never] } })).toThrow(
      'keepFor["wide-lib"] names an unknown atom "interactve". Did you mean "interactive"?',
    )
  })
})

describe('AC-used-atoms-44 — keepFor reaches packages under node_modules only', () => {
  const unreadable = `${IMPORT}export const u = (v) => cx(v)\n`

  /**
   * An app importing `@acme/ui` (laid out as pnpm lays it out), `plain-lib`, and a workspace
   * package linked into `node_modules`.
   */
  function threePackages(): ScratchApp {
    const app = appUsing(['@acme/ui', 'plain-lib', '@acme/ws-ui'])
    const pnpm = path.join(app.root, 'node_modules/.pnpm/@acme+ui@1.2.0/node_modules/@acme/ui')
    mkdirSync(path.join(pnpm, 'dist'), { recursive: true })
    writeFileSync(
      path.join(pnpm, 'package.json'),
      JSON.stringify({
        name: '@acme/ui',
        version: '1.2.0',
        type: 'module',
        main: './dist/index.js',
        dependencies: { '@navecss/core': '*' },
      }),
    )
    writeFileSync(path.join(pnpm, 'dist/package.json'), '{ "type": "module" }')
    writeFileSync(path.join(pnpm, 'dist/index.js'), unreadable)
    mkdirSync(path.join(app.root, 'node_modules/@acme'), { recursive: true })
    symlinkSync(pnpm, path.join(app.root, 'node_modules/@acme/ui'), 'dir')
    addPackage(app, 'plain-lib', { 'index.js': unreadable })
    const workspace = path.join(app.root, 'packages/ws-ui')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: '@acme/ws-ui', version: '1.0.0', type: 'module', main: './index.js' }),
    )
    writeFileSync(path.join(workspace, 'index.js'), unreadable)
    symlinkSync(workspace, path.join(app.root, 'node_modules/@acme/ws-ui'), 'dir')
    return app
  }

  it('names @acme/ui and plain-lib as dependencies, and the workspace package as the application’s', async () => {
    const app = threePackages()
    try {
      const built = await buildUsed(app)
      const lines = built.error!.split('\n')

      expect(built.error).toMatch(/^3 problems in 3 files/)
      expect(lines.some((line) => line.startsWith('@acme/ui is a dependency'))).toBe(true)
      expect(lines.some((line) => line.startsWith('plain-lib is a dependency'))).toBe(true)
      expect(lines.some((line) => line.startsWith('packages/ws-ui/index.js:'))).toBe(true)
      expect(built.error).not.toContain('.pnpm/@acme+ui@1.2.0 is a dependency')
      expect(lines.filter((line) => line.includes('keepFor') && line.includes('ws-ui'))).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('lists stop the two dependencies’ problems and never the workspace package’s', async () => {
    const app = threePackages()
    try {
      const listed = await buildUsed(app, {
        options: {
          keepFor: { '@acme/ui': ['flex'], 'plain-lib': ['flex'], '@acme/ws-ui': ['flex'] },
        },
      })
      const wrongKey = await buildUsed(app, { options: { keepFor: { '@acme/uii': ['flex'] } } })

      expect(listed.error).toMatch(/^1 problem in 1 file/)
      expect(listed.error).toContain('packages/ws-ui/index.js')
      expect(wrongKey.error).toContain('@acme/ui is a dependency')
      expect(wrongKey.error).not.toContain('@acme/uii')
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-45 — keepFor entries are validated as keep is, under both values', () => {
  const extend = { brandBox: { declarations: { color: 'red' } } }
  const rows: [string, string[], string][] = [
    ['lists no atoms', [], 'keepFor["@acme/ui"] lists no atoms'],
    [
      'names an unknown atom',
      ['sr-only'],
      'keepFor["@acme/ui"] names an unknown atom "sr-only". Did you mean "srOnly"? Atom names are camelCase; "nave-sr-only" is its class.',
    ],
    [
      'names an atom of your own',
      ['brandBox'],
      'keepFor["@acme/ui"] names "brandBox", an atom of your own; those have no class, so there is nothing to keep.',
    ],
  ]

  it.each(rows)('%s', (_name, list, text) => {
    for (const atomic of ['used', 'all'] as const) {
      expect(() => navePlugin({ atomic, extend, keepFor: { '@acme/ui': list as never } })).toThrow(
        `navePlugin(): ${text}`,
      )
    }
  })

  it('a key alone never fails', async () => {
    const app = appUsing([])
    try {
      const built = await buildUsed(app, { options: { keepFor: { '@acme/ui': ['flex'] } } })

      expect(built.error).toBeUndefined()
      expect((built.warnings ?? []).filter((message) => message.includes('nave'))).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-46 — the cacheDir file records what the build saw of each listed package', () => {
  it('records the atoms collected and the unreadable positions, and the key naming no package', async () => {
    const app = appUsing(['wide-lib'])
    addPackage(app, 'wide-lib', {
      'index.js': `${IMPORT}export const a = (v) => cx(v)\nexport const g = cx('gap')\nexport const l = 'nave-truncate'\n`,
    })
    try {
      const built = await buildUsed(app, {
        options: { keepFor: { 'wide-lib': ['block'], 'gone-lib': ['flex'] } },
      })
      const file = JSON.parse(
        readFileSync(path.join(app.root, '.vite', 'nave-used-atoms.json'), 'utf8'),
      ) as {
        emitted: string[]
        keepFor: Record<string, { collected: string[]; unreadable: string[] }>
        unmatchedKeepFor: string[]
      }

      expect(built.error).toBeUndefined()
      expect(file.keepFor['wide-lib']!.collected).toEqual(['gap', 'truncate'])
      expect(file.keepFor['wide-lib']!.unreadable).toEqual(['node_modules/wide-lib/index.js:2:28'])
      expect(file.unmatchedKeepFor).toEqual(['gone-lib'])
      expect(file.emitted).toEqual(atomLayerAtoms(built.css))
      expect((built.warnings ?? []).filter((message) => message.includes('nave'))).toEqual([])
    } finally {
      app.dispose()
    }
  }, 60_000)
})

describe('AC-used-atoms-55 — the remedy block is split by owner', () => {
  it('prints the application lines, then each package’s in name order, then Available last', async () => {
    const app = makeUsedApp(
      appFiles({
        'src/Card.ts': `${IMPORT}export const v = (variant) => cx(variant)\nconsole.log(v)\n`,
        'src/U.ts': `${IMPORT}export const u = cx('legacy-card')\n`,
        'src/deps.ts': "import 'zz-lib'\nimport 'aa-lib'\nimport '@acme/ds'\n",
      }),
    )
    addPackage(app, 'zz-lib', { 'index.js': `${IMPORT}export const z = (v) => cx(v)\n` })
    addPackage(app, 'aa-lib', { 'index.js': `${IMPORT}export const a = [1].map(cx)\n` })
    addPackage(app, '@acme/ds', { 'index.js': "export { cx } from '@navecss/core/cx'\n" })
    try {
      const built = await buildUsed(app)
      const lines = built.error!.split('\n')
      const remedies = lines.filter((line) => !/^[\w@./-]+:\d+:\d+: /.test(line)).slice(1)

      expect(built.error).toMatch(/^5 problems in 5 files/)
      expect(built.error).not.toMatch(/atomic|'used'|'all'/)
      expect(remedies[0]).toMatch(/^Name the atoms at the call/)
      const owners = remedies.map((line) => line.split(' ', 1)[0])
      expect(owners.indexOf('@acme/ds')).toBeLessThan(owners.indexOf('aa-lib'))
      expect(owners.indexOf('aa-lib')).toBeLessThan(owners.indexOf('zz-lib'))
      expect(remedies.at(-1)).toMatch(/^Available: /)
      expect(remedies.slice(0, 3).join('\n')).not.toContain('keepFor')
    } finally {
      app.dispose()
    }
  }, 60_000)

  it('a report with only dependency problems opens its remedy block with the package’s line', async () => {
    const app = appUsing(['zz-lib'])
    addPackage(app, 'zz-lib', { 'index.js': `${IMPORT}export const z = (v) => cx(v)\n` })
    try {
      const built = await buildUsed(app)
      const rest = built.error!.split('\n').slice(2)

      expect(rest[0]).toMatch(/^zz-lib is a dependency/)
      expect(built.error).not.toContain('Name the atoms at the call')
    } finally {
      app.dispose()
    }
  }, 60_000)
})
