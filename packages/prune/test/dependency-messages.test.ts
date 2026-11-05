/**
 * The messages the plugin gives the bundler. On webpack a file inside a directory that is already
 * declared is not declared a second time: with both, the warm webpack build of a workspace on
 * Next.js 16.2.0 died in webpack's hashing of the directory in 10 of 36 runs under CPU load, and
 * in none of 36 without the package. Next.js hands webpack a directory without its glob, and webpack
 * reads it at every depth but skips each entry whose name begins with a dot, so there the directory
 * covers every file below it with no dot-named segment on the way. Turbopack reads the glob and was
 * never affected, so it is given every file and every directory, as before.
 */
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { dependencyMessages } from '../src/messages.ts'

const ROOT = path.resolve('/project')
const APP = path.join(ROOT, 'app')
const EVERYTHING = { path: APP, glob: '**/*' }
const STEMS = { path: path.join(ROOT, 'src/ui'), glob: '*' }
const WEB = path.join(ROOT, 'apps/web')
const MODULES = path.join(ROOT, 'node_modules')

/**
 * Where pnpm installs the package `name` under `node_modules`.
 */
function stored(name: string): string {
  return path.join(MODULES, '.pnpm', `${name}@1.0.0`, 'node_modules', name)
}

/**
 * The paths the messages of `type` name.
 */
function declared(
  type: 'dependency' | 'dir-dependency',
  input: {
    readonly directories: readonly { glob: string; path: string }[]
    readonly files: readonly string[]
    readonly isWebpack: boolean
    readonly links?: Readonly<Record<string, string>>
    readonly root?: string
  },
): string[] {
  return dependencyMessages({ parent: undefined, root: ROOT, ...input }).flatMap((message) => {
    if (message.type !== type) return []
    const { dir, file } = message as { dir?: string; file?: string }
    return [String(file ?? dir)]
  })
}

describe('on webpack, a file webpack reads through a declared directory is declared by the directory alone', () => {
  const webpack = { isWebpack: true }

  it('AC-nextjs-used-atoms-04: omits a file at any depth below the directory, whatever its glob', () => {
    const nested = path.join(ROOT, 'src/ui/deep/Card.jsx')
    const top = path.join(APP, 'new/page.jsx')
    const files = [nested, top]

    expect(declared('dependency', { ...webpack, directories: [STEMS, EVERYTHING], files })).toEqual(
      [],
    )
    expect(
      declared('dir-dependency', { ...webpack, directories: [STEMS, EVERYTHING], files }),
    ).toEqual([STEMS.path, APP])
  })

  it('AC-nextjs-used-atoms-04: still names a file outside every directory', () => {
    const outside = path.join(ROOT, 'components/Extra.jsx')
    const beside = path.join(ROOT, 'application/page.jsx')

    expect(
      declared('dependency', { ...webpack, directories: [EVERYTHING], files: [outside, beside] }),
    ).toEqual([outside, beside])
  })

  it('AC-nextjs-used-atoms-04: still names a file webpack does not read through the directory: one whose name, or a directory on the way to it, begins with a dot', () => {
    const project = { path: ROOT, glob: '*' }
    const rc = path.join(ROOT, '.postcssrc.json')
    const chained = path.join(ROOT, '.config/tsconfig.base.json')
    const config = path.join(ROOT, 'next.config.mjs')
    const draft = path.join(APP, '..draft/page.jsx')

    expect(
      declared('dependency', {
        ...webpack,
        directories: [project, EVERYTHING],
        files: [rc, chained, config, draft],
      }),
    ).toEqual([rc, chained, draft])
    expect(
      declared('dependency', {
        isWebpack: false,
        directories: [project, EVERYTHING],
        files: [rc, chained, config, draft],
      }),
    ).toEqual([rc, chained, config, draft])
  })

  it('AC-nextjs-used-atoms-04: leaves to a directory the files of a store link it reaches, also through a second link met in the target, and names an unlinked one', () => {
    const project = { path: ROOT, glob: '*' }
    const links = {
      [path.join(MODULES, 'a')]: stored('a'),
      [path.join(stored('a'), 'vendor/b')]: stored('b'),
      // A link back to the first one: following links does not loop.
      [path.join(stored('b'), 'back')]: stored('a'),
    }
    const viaOne = path.join(stored('a'), 'index.js')
    const viaTwo = path.join(stored('b'), 'index.js')
    const unlinked = path.join(stored('c'), 'index.js')
    const files = [viaOne, viaTwo, unlinked]

    expect(declared('dependency', { ...webpack, directories: [project], files, links })).toEqual([
      unlinked,
    ])
    expect(
      declared('dependency', { isWebpack: false, directories: [project], files, links }),
    ).toEqual(files)
  })

  it('AC-nextjs-used-atoms-04: leaves to a directory the files of a scoped store link, and names the file of a link held inside a scoped package directory', () => {
    const project = { path: ROOT, glob: '*' }
    const scopedStore = path.join(
      MODULES,
      '.pnpm',
      '@acme+lib@1.0.0',
      'node_modules',
      '@acme',
      'lib',
    )
    const links = {
      [path.join(MODULES, '@acme/lib')]: scopedStore,
      [path.join(MODULES, '@acme/kit/link')]: stored('x'),
    }
    const viaScoped = path.join(scopedStore, 'index.js')
    const insideScoped = path.join(stored('x'), 'index.js')
    const files = [viaScoped, insideScoped]

    expect(declared('dependency', { ...webpack, directories: [project], files, links })).toEqual([
      insideScoped,
    ])
    expect(
      declared('dependency', { isWebpack: false, directories: [project], files, links }),
    ).toEqual(files)
  })

  it('AC-nextjs-used-atoms-04: leaves to a directory the files of a store at the workspace top, linked from below the declared project directory', () => {
    const file = path.join(stored('x'), 'index.js')

    expect(
      declared('dependency', {
        ...webpack,
        directories: [{ path: WEB, glob: '*' }],
        files: [file],
        links: { [path.join(WEB, 'node_modules/x')]: stored('x') },
      }),
    ).toEqual([])
  })

  describe('names the file of a link webpack follows but the plugin does not', () => {
    const hidden = path.join(stored('a'), '.hidden/index.js')
    const reached = path.join(stored('a'), 'index.js')

    const lib = path.join(stored('lib'), 'index.js')
    const everything = { path: ROOT, glob: '*' }

    it.each([
      {
        name: 'a workspace package linked into node_modules, its real path held by no declared directory',
        directory: { path: WEB, glob: '*' },
        links: { [path.join(WEB, 'node_modules/@acme/ui')]: path.join(ROOT, 'packages/ui') },
        files: [path.join(ROOT, 'packages/ui/look.ts')],
        named: [path.join(ROOT, 'packages/ui/look.ts')],
      },
      {
        name: 'a link held inside a package directory node_modules/foo/',
        directory: everything,
        links: { [path.join(MODULES, 'foo/link')]: stored('x') },
        files: [path.join(stored('x'), 'index.js')],
        named: [path.join(stored('x'), 'index.js')],
      },
      {
        name: 'a link below an entry whose name begins with a dot',
        directory: everything,
        links: { [path.join(ROOT, '.cache/lib')]: stored('lib') },
        files: [lib],
        named: [lib],
      },
      {
        name: 'a file below an entry whose name begins with a dot inside a store target',
        directory: everything,
        links: { [path.join(MODULES, 'a')]: stored('a') },
        files: [reached, hidden],
        named: [hidden],
      },
      {
        name: 'a link on disk that the record does not hold',
        directory: everything,
        links: {},
        files: [lib],
        named: [lib],
      },
    ])('AC-nextjs-used-atoms-04: $name', ({ directory, links, files, named }) => {
      expect(
        declared('dependency', { ...webpack, directories: [directory], files, links }),
      ).toEqual(named)
      expect(
        declared('dependency', { isWebpack: false, directories: [directory], files, links }),
      ).toEqual(files)
    })
  })

  it('AC-nextjs-used-atoms-04: names the file a store link leads to when its target is a file', () => {
    const target = path.join(stored('x'), 'index.js')

    // Webpack hashes a link's target as a directory, so a file target is reached by no declared
    // directory.
    expect(
      declared('dependency', {
        ...webpack,
        directories: [{ path: ROOT, glob: '*' }],
        files: [target],
        links: { [path.join(MODULES, 'x.js')]: target },
      }),
    ).toEqual([target])
  })

  it.each([
    ['the root is the project', ROOT],
    ['the root is the app directory', APP],
  ])(
    'AC-nextjs-used-atoms-04: names a file below a directory whose name begins with two dots, when %s',
    (_root, root) => {
      const draft = path.join(APP, '..draft/page.jsx')

      expect(
        declared('dependency', { ...webpack, directories: [EVERYTHING], files: [draft], root }),
      ).toEqual([draft])
      expect(
        declared('dependency', {
          isWebpack: false,
          directories: [EVERYTHING],
          files: [draft],
          root,
        }),
      ).toEqual([draft])
    },
  )

  it('AC-nextjs-used-atoms-04: does not let a directory that gets no message hide a file', () => {
    const above = { path: path.dirname(ROOT), glob: '**/*' }
    const file = path.join(APP, 'page.jsx')

    expect(declared('dependency', { ...webpack, directories: [above], files: [file] })).toEqual([
      file,
    ])
  })

  it('AC-nextjs-used-atoms-04: still leaves out a file outside the root, and a directory outside it', () => {
    const outside = path.resolve('/elsewhere/x.jsx')

    expect(declared('dependency', { ...webpack, directories: [], files: [outside] })).toEqual([])
    expect(
      declared('dir-dependency', {
        ...webpack,
        directories: [{ path: path.resolve('/elsewhere'), glob: '*' }],
        files: [],
      }),
    ).toEqual([])
  })
})

/**
 * How many path comparisons one run makes over `count` followed store links, each holding one
 * read file, with one declared project directory. Every file is reached through its link, so no
 * `dependency` message is the control that the links were followed.
 */
function comparisonsFor(count: number): number {
  const names = Array.from({ length: count }, (_, index) => `p${index}`)
  const links = Object.fromEntries(names.map((name) => [path.join(MODULES, name), stored(name)]))
  const files = names.map((name) => path.join(stored(name), 'index.js'))
  // `messages.ts` calls `relative` on this same `node:path` object for every test of whether a
  // directory webpack reads reaches a path, so the calls are the work done.
  const relative = vi.spyOn(path, 'relative')
  try {
    const messages = dependencyMessages({
      directories: [{ path: ROOT, glob: '*' }],
      files,
      isWebpack: true,
      links,
      parent: undefined,
      root: ROOT,
    })
    expect(messages.filter((message) => message.type === 'dependency')).toEqual([])
    return relative.mock.calls.length
  } finally {
    relative.mockRestore()
  }
}

describe('on webpack, the work of following links grows with the links met, not with their cube', () => {
  const LINKS = 30

  it('AC-nextjs-used-atoms-04: doubling the links met does not multiply the work by more than a quadratic growth allows', () => {
    // Quadratic growth multiplies the work by four when the links double and cubic by eight; the
    // bound sits between them. Measured: 3.9 with the work done once per run, 7.7 when it was
    // done again for every file.
    const once = comparisonsFor(LINKS)
    // Control: the spy sees the tests of what webpack reaches, not only the root checks, which
    // alone make one call for each file and one for the directory.
    expect(once).toBeGreaterThan(LINKS + 1)
    expect(comparisonsFor(2 * LINKS) / once).toBeLessThan(6)
  })
})

describe('anywhere else, every file and every directory is declared', () => {
  const turbopack = { isWebpack: false }

  it('AC-nextjs-used-atoms-04: names a file a declared directory holds as well as the directory', () => {
    const files = [path.join(APP, 'page.jsx'), path.join(ROOT, 'src/ui/deep/Card.jsx')]
    const directories = [EVERYTHING, STEMS]

    expect(declared('dependency', { ...turbopack, directories, files })).toEqual(files)
    expect(declared('dir-dependency', { ...turbopack, directories, files })).toEqual([
      APP,
      STEMS.path,
    ])
  })

  it('AC-nextjs-used-atoms-04: keeps the plugin name and the parent on what it declares', () => {
    const file = path.join(ROOT, 'components/Extra.jsx')
    const [message] = dependencyMessages({
      directories: [EVERYTHING],
      files: [file],
      isWebpack: false,
      parent: '/project/app/globals.css',
      root: ROOT,
    })

    expect(message).toMatchObject({
      type: 'dependency',
      plugin: 'postcss-nave-prune',
      file,
      parent: '/project/app/globals.css',
    })
  })
})
