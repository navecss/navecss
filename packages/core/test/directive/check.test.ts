import type * as FsPromises from 'node:fs/promises'

import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { check } from '../../src/directive/check.ts'
import { assertScalesLinearly } from '../helpers/perf-scaling.ts'

// Counts the directory walk's own calls into the filesystem (the mesh row below reads them).
// Every call still reaches the real function.
const { counted, fsCalls } = vi.hoisted(() => {
  const calls = { readdir: 0, realpath: 0, stat: 0 }
  const count = <F extends (...args: never[]) => unknown>(name: keyof typeof calls, fn: F): F =>
    ((...args: Parameters<F>) => {
      calls[name]++
      return fn(...args)
    }) as F
  return { counted: count, fsCalls: calls }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return {
    ...actual,
    readdir: counted('readdir', actual.readdir),
    realpath: counted('realpath', actual.realpath),
    stat: counted('stat', actual.stat),
  }
})

const ctx = { dir: '' }

beforeEach(async () => {
  ctx.dir = await mkdtemp(path.join(tmpdir(), 'nave-check-'))
})

afterEach(async () => {
  await rm(ctx.dir, { recursive: true, force: true })
})

async function writeCss(name: string, content: string): Promise<string> {
  const filePath = path.join(ctx.dir, name)
  await mkdir(path.join(filePath, '..'), { recursive: true })
  await writeFile(filePath, content)
  return filePath
}

/**
 * Directory entries in one cluster of the mesh: each of its `width` directories holds its own
 * stylesheet and a link to every other directory of the cluster, and the mesh's root holds the
 * directory itself.
 */
function entriesPerCluster(width: number): number {
  return width * (width + 1)
}

/**
 * A mesh of `clusters` clusters of `MESH_CLUSTER_WIDTH` directories under `root`: every directory
 * is a real directory in `root`, holds one stylesheet, and links to every other directory of its
 * own cluster. Returns `root`.
 */
async function buildMesh(root: string, clusters: number): Promise<string> {
  await mkdir(root)
  const members: string[][] = []
  for (let cluster = 0; cluster < clusters; cluster++) {
    const names = Array.from({ length: MESH_CLUSTER_WIDTH }, (_, i) => `c${cluster}d${i}`)
    members.push(names)
    for (const name of names) {
      await mkdir(path.join(root, name))
      await writeFile(path.join(root, name, `${name}.css`), '.x{}')
    }
  }
  for (const names of members) await linkEachToTheOthers(root, names)
  return root
}

/**
 * Links, inside each of the directories `names` names under `root`, to every other one of them.
 */
async function linkEachToTheOthers(root: string, names: readonly string[]): Promise<void> {
  for (const name of names) {
    const others = names.filter((other) => other !== name)
    for (const other of others) await symlink(path.join(root, other), path.join(root, name, other))
  }
}

/**
 * The filesystem calls a walk of `buildMesh(_, clusters)` makes when it lists every directory once
 * and resolves every entry once. The walk lists the root and each real directory (`readdir`),
 * statting each link to learn it is a directory (`stat`, plus one for the root), and resolves the
 * root, each real directory in the root, each link and each stylesheet (`realpath`).
 */
function expectedMeshCalls(clusters: number): { readdir: number; realpath: number; stat: number } {
  const directories = clusters * MESH_CLUSTER_WIDTH
  const links = directories * (MESH_CLUSTER_WIDTH - 1)
  return {
    readdir: 1 + directories,
    realpath: 1 + directories + links + directories,
    stat: 1 + links,
  }
}

describe('AC-directive-core-23 — what the check counts as a surviving directive', () => {
  it('finds a directive inline in a rule, with the enclosing selector', async () => {
    const filePath = await writeCss('a.css', '.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ line: 1, column: 4, selector: '.a' })
  })

  it('is case- and escape-insensitive on the directive name', async () => {
    const upper = await writeCss('upper.css', '.a{@NAVE flex}')
    const escaped = await writeCss('escaped.css', String.raw`.a{@n\61ve flex}`)

    const upperResult = await check({ source: [upper] })
    const escapedResult = await check({ source: [escaped] })

    expect(upperResult.findings).toHaveLength(1)
    expect(escapedResult.findings).toHaveLength(1)
  })

  it('finds a directive inside a declaration value', async () => {
    const filePath = await writeCss('a.css', '.a{color:@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ selector: '.a' }])
  })

  it('finds a top-level directive with no selector', async () => {
    const filePath = await writeCss('a.css', '@nave flex;')

    const result = await check({ source: [filePath] })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.selector).toBeUndefined()
  })

  it('finds a directive nested inside a group at-rule, reporting the enclosing rule', async () => {
    const filePath = await writeCss('a.css', '@media (x){.a{@nave flex}}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ selector: '.a' }])
  })

  it('does not flag a comment, a string, a url(), or an unrelated at-keyword', async () => {
    const rows = [
      '/* @nave flex */',
      '.a{content:"@nave flex"}',
      '.a{background:url(@nave.png)}',
      '.a{@navex flex}',
    ]

    for (const content of rows) {
      const filePath = await writeCss('row.css', content)

      const result = await check({ source: [filePath] })
      expect(result.findings).toEqual([])
    }
  })

  it.each([
    ['.a @nave{color:red}', 'a stray at-keyword ahead of a rule, in its selector prelude'],
    ['@media @nave{.a{color:red}}', 'a stray at-keyword in a group rule prelude'],
    ['.a{color red @nave flex}', 'a stray at-keyword inside an invalid item'],
    ['@import url(x.css) @nave flex;', 'a stray at-keyword trailing an at-rule prelude'],
    ['.a:is(@nave flex) { color: red }', 'a stray at-keyword inside a selector function'],
  ])(
    'finds a directive-named at-keyword anywhere outside comments and strings: %s (%s)',
    async (content) => {
      const filePath = await writeCss('row.css', content)

      const result = await check({ source: [filePath] })

      expect(result.findings).toHaveLength(1)
    },
  )

  it('keeps counting the declaration-value form exactly once', async () => {
    const filePath = await writeCss('a.css', '.a { color: @nave flex; }')

    const result = await check({ source: [filePath] })

    expect(result.findings).toHaveLength(1)
  })
})

describe('AC-directive-core-22 — navecss-core check, the exit contract', () => {
  it('exits 0 when every stylesheet read holds no directive', async () => {
    await writeCss('clean.css', '.a{color:red}')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(0)
    expect(result.stylesheetsRead).toBe(1)
  })

  it('exits 1 when at least one directive survives, recursively', async () => {
    await writeCss('a/b/c.css', '.a{@nave flex}')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(1)
  })

  it('exits 2 when the source path is unreadable', async () => {
    const result = await check({ source: [path.join(ctx.dir, 'missing')] })

    expect(result.status).toBe(2)
  })

  it('exits 2 when no stylesheet is found at all', async () => {
    await writeFile(path.join(ctx.dir, 'x.js'), '// no css here')

    const result = await check({ source: [ctx.dir] })

    expect(result.status).toBe(2)
    expect(result.stylesheetsRead).toBe(0)
  })

  it('reads a file named explicitly without a .css extension', async () => {
    const filePath = await writeCss('a.txt', '.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.status).toBe(1)
    expect(result.stylesheetsRead).toBe(1)
  })
})

// A generous per-row timeout throughout this block, well above the test runner's own
// default: `assertScalesLinearly` can run its measured subject up to 21 times (a warm-up
// plus 3+3 samples, across up to three attempts), and a slow or shared runner's own per-call
// time can be an order of magnitude past a fast local machine's — the wall-clock ceiling
// on how long the ROW is allowed to take is deliberately loose, since the scaling ratio
// assertion inside it is what actually decides pass or fail.
const SCALING_ROW_TIMEOUT = 45_000

// The mesh row's smaller size, in directory entries, and how many times each size's mesh is walked.
// The size is chosen so that extra computation per entry, which grows with the square of the
// entries, is a large enough share of the larger walk to move the ratio past its bound.
// The row's own timeout is longer than the others': the meshes are large, and a walk that is
// quadratic in the entries takes the whole of three attempts to be called one, and the row
// should fail on the ratio, which names the problem, not on the clock.
const MESH_ENTRIES = 2304
const MESH_WALKS = 2
const MESH_ROW_TIMEOUT = 300_000

// The mesh is built from clusters of this many directories, each linked to every other one in its
// cluster. A cluster is small, so a chain of links followed in one path stays short, far under
// the operating system's limit on links followed in one path; growing the mesh adds clusters,
// never a longer chain.
const MESH_CLUSTER_WIDTH = 4

describe('check() stays roughly linear, not quadratic, and stack-safe on a large stylesheet', () => {
  it(
    'stays roughly linear reporting survivors in a single file',
    async () => {
      await assertScalesLinearly(async (size) => {
        const filePath = await writeCss(`a-${size}.css`, '.b{@nave flex}'.repeat(size))

        const start = performance.now()
        const result = await check({ source: [filePath] })
        const elapsed = performance.now() - start

        expect(result.status).toBe(1)
        expect(result.findings).toHaveLength(size)

        return elapsed
      }, 20_000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'does not overflow the call stack on 5000 levels of nesting',
    async () => {
      const filePath = await writeCss('d.css', '.a{'.repeat(5000) + '}'.repeat(5000))

      const result = await check({ source: [filePath] })

      expect(result.status).toBe(0)
    },
    SCALING_ROW_TIMEOUT,
  )

  it(
    'stays roughly linear, not quadratic, in nesting depth',
    async () => {
      await assertScalesLinearly(async (size) => {
        const filePath = await writeCss(`e-${size}.css`, '.a{'.repeat(size) + '}'.repeat(size))

        const start = performance.now()
        const result = await check({ source: [filePath] })
        const elapsed = performance.now() - start

        expect(result.status).toBe(0)

        return elapsed
      }, 40_000)
    },
    SCALING_ROW_TIMEOUT,
  )

  it('counts a lone CR and a lone form feed as line breaks, not only LF', async () => {
    const filePath = await writeCss('a.css', '.a{\r}\r.b{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ line: 3, column: 4 }])
  })

  it('a leading BOM does not shift the column', async () => {
    const filePath = await writeCss('a.css', '﻿.a{@nave flex}')

    const result = await check({ source: [filePath] })

    expect(result.findings).toMatchObject([{ line: 1, column: 4 }])
  })
})

describe('AC-directive-core-22 — an unreadable file exits 2 without losing other hits', () => {
  it.skipIf(process.getuid?.() === 0)(
    'keeps a readable hit when a sibling --source is unreadable',
    async () => {
      const hitPath = await writeCss('hit.css', '.a{@nave flex}')
      const lockedPath = path.join(ctx.dir, 'locked.css')
      await writeFile(lockedPath, '.a{}')
      await chmod(lockedPath, 0)

      const result = await check({ source: [hitPath, lockedPath] })

      expect(result.status).toBe(2)
      expect(result.findings).toMatchObject([{ file: hitPath }])
    },
  )

  it.skipIf(process.getuid?.() === 0)(
    'exits 2 on an unreadable file passed alone, with no findings',
    async () => {
      const lockedPath = path.join(ctx.dir, 'locked.css')
      await writeFile(lockedPath, '.a{}')
      await chmod(lockedPath, 0)

      const result = await check({ source: [lockedPath] })

      expect(result.status).toBe(2)
      expect(result.findings).toEqual([])
    },
  )

  it.skipIf(process.getuid?.() === 0)(
    'exits 2 when a subdirectory is unreadable, keeping hits from sibling files',
    async () => {
      const hitPath = await writeCss('dir/hit.css', '.a{@nave flex}')
      const lockedDir = path.join(ctx.dir, 'dir', 'locked')
      await mkdir(lockedDir)
      await chmod(lockedDir, 0)

      const result = await check({ source: [path.join(ctx.dir, 'dir')] })

      expect(result.status).toBe(2)
      expect(result.findings).toMatchObject([{ file: hitPath }])
    },
  )
})

describe('a directory --source follows symlinks, loop-safe', () => {
  it('follows a symlinked file and a symlinked directory that loops back, counting the real file once', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    const realDir = path.join(ctx.dir, 'real')
    await mkdir(distDir)
    await mkdir(realDir)
    const realHit = path.join(realDir, 'hit.css')
    await writeFile(realHit, '.a{@nave flex}')
    await symlink(realHit, path.join(distDir, 'hit.css'))
    await symlink('..', path.join(distDir, 'up'))
    await writeFile(path.join(distDir, 'clean.css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
  })

  it(
    'walks a mesh of sibling directories, each linked to every other, in time linear in its entries',
    async () => {
      // What this protects: a walk lists every real directory once however the links between
      // directories interconnect, so the work it does, and the time that takes, grows in step
      // with the number of entries it is given.
      //
      // Two things are asserted. The calls the walk makes into the filesystem are counted and
      // compared with what listing every directory once and resolving every entry once makes,
      // exactly, at both sizes: that is exact, so it does not move with the machine's load, and it
      // fails on a walk that lists or resolves anything twice. It also fails if the larger mesh is
      // cut short, which a walk of one long chain of links is (the operating system stops
      // following links past a fixed number in one path) and which would leave the larger mesh
      // with fewer entries than its size says, hiding growth in the time. Then the time is held
      // to a linear ratio between the two sizes, for work the counts cannot see (extra
      // computation per entry that makes no filesystem call).
      //
      // The time is the process's CPU time over the walk, not the clock: a walk waits on the
      // filesystem and, on a busy machine, on other processes, and none of that waiting is work
      // the walk does. Each size is the fastest of several walks of the same mesh, since a stall
      // only ever adds time. A walk that is quadratic in the entries is slower by the same factor
      // in every walk, so the fastest of them still shows it.
      const meshes = new Map<number, string>()

      await assertScalesLinearly(async (totalEntries) => {
        const clusters = Math.max(
          1,
          Math.round(totalEntries / entriesPerCluster(MESH_CLUSTER_WIDTH)),
        )
        let dir = meshes.get(clusters)
        if (dir === undefined) {
          dir = await buildMesh(path.join(ctx.dir, `mesh-${clusters}`), clusters)
          meshes.set(clusters, dir)
        }
        const expected = expectedMeshCalls(clusters)

        let fastest = Infinity
        for (let walk = 0; walk < MESH_WALKS; walk++) {
          fsCalls.readdir = 0
          fsCalls.realpath = 0
          fsCalls.stat = 0

          const start = process.cpuUsage()
          const result = await check({ source: [dir] })
          const used = process.cpuUsage(start)
          const elapsed = (used.user + used.system) / 1000

          expect(result.status).toBe(0)
          expect(result.stylesheetsRead).toBe(clusters * MESH_CLUSTER_WIDTH)
          expect(fsCalls).toEqual(expected)

          fastest = Math.min(fastest, elapsed)
        }

        return fastest
      }, MESH_ENTRIES)
    },
    MESH_ROW_TIMEOUT,
  )
})

describe('a directory --source reads .css in any ASCII case', () => {
  it('finds a directive in a file whose extension is uppercase', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await writeFile(path.join(distDir, 'a.css'), '.a{}')
    await writeFile(path.join(distDir, 'b.CSS'), '.a{@nave flex}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(1)
    expect(result.findings).toHaveLength(1)
  })

  it('exits 0, not 2, for a directory holding only a mixed-case extension', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await writeFile(path.join(distDir, 'b.Css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(0)
  })
})

describe('a dangling symlink is unreadable only when its name would have been read', () => {
  it('ignores a dangling symlink whose name does not end in .css', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await symlink(path.join(distDir, 'nowhere'), path.join(distDir, 'x.map'))
    await writeFile(path.join(distDir, 'a.css'), '.a{}')

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(0)
  })

  it('reports a dangling .css symlink as unreadable, naming it', async () => {
    const distDir = path.join(ctx.dir, 'dist')
    await mkdir(distDir)
    await symlink(path.join(distDir, 'nowhere'), path.join(distDir, 'y.css'))

    const result = await check({ source: [distDir] })

    expect(result.status).toBe(2)
  })
})
