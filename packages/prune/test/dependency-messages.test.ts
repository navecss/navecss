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
import { describe, expect, it } from 'vitest'

import { dependencyMessages } from '../src/messages.ts'

const ROOT = path.resolve('/project')
const APP = path.join(ROOT, 'app')
const EVERYTHING = { path: APP, glob: '**/*' }
const STEMS = { path: path.join(ROOT, 'src/ui'), glob: '*' }

/**
 * The paths the messages of `type` name.
 */
function declared(
  type: 'dependency' | 'dir-dependency',
  input: {
    readonly directories: readonly { glob: string; path: string }[]
    readonly files: readonly string[]
    readonly isWebpack: boolean
  },
): string[] {
  return dependencyMessages({ ...input, parent: undefined, root: ROOT }).flatMap((message) => {
    if (message.type !== type) return []
    const { dir, file } = message as { dir?: string; file?: string }
    return [String(file ?? dir)]
  })
}

describe('on webpack, a file a declared directory holds is declared by the directory alone', () => {
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
  })

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
