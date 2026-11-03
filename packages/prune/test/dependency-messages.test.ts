/**
 * The messages the plugin gives the bundler. A file inside a directory that is already declared
 * is not declared a second time: with both, the warm webpack build of a workspace on Next.js
 * 16.2.0 died in webpack's hashing of the directory in 10 of 36 runs under CPU load, and in none
 * of 36 without the package. Where the bundler reads the directory's glob (Turbopack) the glob
 * decides which files the directory stands for; where it does not (webpack) every file below it.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { dependencyMessages } from '../src/messages.ts'

const ROOT = path.resolve('/project')
const APP = path.join(ROOT, 'app')
const EVERYTHING = { path: APP, glob: '**/*' }
const CONVENTIONS = { path: ROOT, glob: '{layout,page}.{js,jsx}' }

/**
 * The files the messages declare with `type`, in order.
 */
function declared(
  type: 'dependency' | 'dir-dependency',
  files: readonly string[],
  directories: readonly { glob: string; path: string }[],
  areGlobsIgnored = false,
): string[] {
  return dependencyMessages({
    areGlobsIgnored,
    directories,
    files,
    parent: undefined,
    root: ROOT,
  }).flatMap((message) => {
    if (message.type !== type) return []
    return [
      String(
        (message as { dir?: string; file?: string }).file ?? (message as { dir?: string }).dir,
      ),
    ]
  })
}

describe('the files declared beside the directories they were selected from', () => {
  it('AC-nextjs-used-atoms-05: omits a file a recursive directory matches, nested or not', () => {
    const files = [path.join(APP, 'page.jsx'), path.join(APP, 'new/page.jsx')]

    expect(declared('dependency', files, [EVERYTHING])).toEqual([])
    expect(declared('dir-dependency', files, [EVERYTHING])).toEqual([APP])
  })

  it('AC-nextjs-used-atoms-05: declares a file outside every directory, and one beside them', () => {
    const outside = path.join(ROOT, 'components/Extra.jsx')
    const beside = path.join(ROOT, 'application/page.jsx')

    expect(declared('dependency', [outside, beside], [EVERYTHING])).toEqual([outside, beside])
  })

  it('AC-nextjs-used-atoms-05: omits a direct child of a directory declared with * and keeps a nested one', () => {
    const directory = { path: path.join(ROOT, 'src/ui'), glob: '*' }
    const child = path.join(ROOT, 'src/ui/Button.jsx')
    const nested = path.join(ROOT, 'src/ui/deep/Card.jsx')

    expect(declared('dependency', [child, nested], [directory])).toEqual([nested])
  })

  it('AC-nextjs-used-atoms-05: omits a root convention the glob names and keeps another file in that directory', () => {
    const layout = path.join(ROOT, 'layout.jsx')
    const other = path.join(ROOT, 'utils.jsx')
    const wrongExtension = path.join(ROOT, 'page.css')

    expect(declared('dependency', [layout, other, wrongExtension], [CONVENTIONS])).toEqual([
      other,
      wrongExtension,
    ])
  })

  it('AC-nextjs-used-atoms-05: declares every file when no directory is given', () => {
    const files = [path.join(APP, 'page.jsx')]

    expect(declared('dependency', files, [])).toEqual(files)
  })

  it('AC-nextjs-used-atoms-05: still leaves out a file outside the root, and a directory outside it', () => {
    const outside = path.resolve('/elsewhere/x.jsx')

    expect(declared('dependency', [outside], [])).toEqual([])
    expect(
      declared('dir-dependency', [], [{ path: path.resolve('/elsewhere'), glob: '*' }]),
    ).toEqual([])
  })

  it('AC-nextjs-used-atoms-05: keeps the plugin name and the parent on what it declares', () => {
    const file = path.join(ROOT, 'components/Extra.jsx')
    const [message] = dependencyMessages({
      directories: [EVERYTHING],
      files: [file],
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

  it('AC-nextjs-used-atoms-04: does not let a directory that gets no message hide a file', () => {
    const above = { path: path.dirname(ROOT), glob: '**/*' }
    const file = path.join(APP, 'page.jsx')

    expect(declared('dependency', [file], [above])).toEqual([file])
  })

  it('AC-nextjs-used-atoms-04: where the bundler ignores globs, omits a file at any depth under a declared directory', () => {
    const directory = { path: path.join(ROOT, 'src/ui'), glob: '*' }
    const nested = path.join(ROOT, 'src/ui/deep/Card.jsx')
    const convention = path.join(ROOT, 'utils.jsx')

    expect(declared('dependency', [nested], [directory], true)).toEqual([])
    expect(declared('dependency', [convention], [CONVENTIONS], true)).toEqual([])
  })

  it('AC-nextjs-used-atoms-04: where the bundler ignores globs, still declares a file outside every directory', () => {
    const outside = path.join(ROOT, 'components/Extra.jsx')
    const beside = path.join(ROOT, 'application/page.jsx')

    expect(declared('dependency', [outside, beside], [EVERYTHING], true)).toEqual([outside, beside])
  })

  it('AC-nextjs-used-atoms-04: where the bundler reads globs, keeps the same files declared', () => {
    const directory = { path: path.join(ROOT, 'src/ui'), glob: '*' }
    const nested = path.join(ROOT, 'src/ui/deep/Card.jsx')
    const convention = path.join(ROOT, 'utils.jsx')

    expect(declared('dependency', [nested], [directory], false)).toEqual([nested])
    expect(declared('dependency', [convention], [CONVENTIONS], false)).toEqual([convention])
  })
})
