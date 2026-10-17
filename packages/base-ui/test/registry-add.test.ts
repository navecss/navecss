import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { Fixture } from './support/registry/cli-fixture.ts'
import type { PrintedLists } from './support/registry/cli-printed-list.ts'
import type { CliRun } from './support/registry/cli-run.ts'
import type { LoadedRegistry } from './support/registry/load.ts'

import {
  createFixtureWithoutSrc,
  createFixtureWithSrc,
  differences,
  once,
  readTree,
  removeFixture,
  sorted,
} from './support/registry/cli-fixture.ts'
import {
  publicFetchUnderPreload,
  reachUnderPreload,
  reachWithoutPreload,
} from './support/registry/cli-offline-probe.ts'
import { parsePrintedLists } from './support/registry/cli-printed-list.ts'
import { builtRegistry, itemFilePaths, servedTree } from './support/registry/cli-registry.ts'
import { runPinnedCli } from './support/registry/cli-run.ts'

const LONG = 600_000
const LICENSE = 'NAVECSS-LICENSE'

interface Install {
  readonly after: Map<string, Buffer>
  readonly before: Map<string, Buffer>
  readonly fixture: Fixture
  readonly lists: PrintedLists
  readonly registry: LoadedRegistry
  readonly run: CliRun
}

const install = async (
  fixture: Fixture,
  itemNames: readonly string[],
  extraArgs: readonly string[],
): Promise<Install> => {
  const registry = builtRegistry()
  const files = itemFilePaths(registry)
  const paths = itemNames.map((name) => files.get(name) ?? '')
  const before = readTree(fixture.project)
  const run = await runPinnedCli({
    args: ['add', ...paths, '--yes', ...extraArgs],
    cwd: fixture.project,
    home: fixture.home,
  })
  return {
    after: readTree(fixture.project),
    before,
    fixture,
    lists: parsePrintedLists(run.output),
    registry,
    run,
  }
}

const everyItem = (): string[] => builtRegistry().items.keys().toArray()

const withSrc = once(() => install(createFixtureWithSrc(), everyItem(), []))
const withoutSrc = once(() => install(createFixtureWithoutSrc(), everyItem(), []))
const withPath = once(() =>
  install(createFixtureWithSrc(), ['base-ui-dialog'], ['--path', 'src/ui/nave']),
)

const created: Fixture[] = []
const track = (scenario: () => Promise<Install>) => async (): Promise<Install> => {
  const result = await scenario()
  if (!created.includes(result.fixture)) created.push(result.fixture)
  return result
}

const inV = track(withSrc)
const inN = track(withoutSrc)
const inPath = track(withPath)

afterAll(() => {
  for (const fixture of created) removeFixture(fixture)
})

const basename = (file: string): string => path.posix.basename(file)

const writtenFiles = (after: ReadonlyMap<string, Buffer>): string[] =>
  sorted(after.keys().filter((file) => file !== 'package.json'))

const expectedFiles = (
  registry: LoadedRegistry,
  names: Iterable<string>,
  prefix: string,
): Map<string, string> => {
  const items = [...names].map((name) => registry.items.get(name))
  return servedTree(
    items.filter((item) => item !== undefined),
    prefix,
  ).files
}

describe('AC-base-ui-registry-05: add installs every item into a Tailwind-free directory with no setup, writing exactly the served bytes', () => {
  describe.each([
    { label: 'V (with src/)', prefix: 'src/', scenario: inV },
    { label: 'N (without src/)', prefix: '', scenario: inN },
  ])('in fixture $label', ({ prefix, scenario }) => {
    it(
      'exits 0 in one run, and reaches for no address off this machine',
      async () => {
        const { run } = await scenario()
        expect(run.signal).toBeNull()
        expect(run.status, run.output).toBe(0)
        expect(run.refused).toEqual([])
      },
      LONG,
    )

    it(
      'lands every target under the components/nave/ directory of the project root (src/ in V)',
      async () => {
        const { after, registry } = await scenario()
        const expected = sorted(expectedFiles(registry, registry.items.keys(), prefix).keys())
        expect(expected.length).toBeGreaterThan(0)
        expect(writtenFiles(after)).toEqual(expected)
        expect(
          writtenFiles(after).every((file) => file.startsWith(`${prefix}components/nave/`)),
        ).toBe(true)
      },
      LONG,
    )

    it(
      'writes every file equal to its served content, byte for byte',
      async () => {
        const { after, before, registry } = await scenario()
        const expected = expectedFiles(registry, registry.items.keys(), prefix)
        expected.set('package.json', before.get('package.json')?.toString('utf8') ?? '')
        expect(differences(expected, after)).toEqual([])
      },
      LONG,
    )

    it(
      'writes NAVECSS-LICENSE once, and the items agree on every target they share',
      async () => {
        const { lists, registry } = await scenario()
        const served = servedTree(registry.items.values(), prefix)
        expect(served.conflicts).toEqual([])
        expect(registry.items.size).toBeGreaterThan(1)
        expect(lists.created.filter((file) => basename(file) === LICENSE)).toHaveLength(1)
        expect(sorted(lists.created)).toEqual(sorted(served.files.keys()))
        expect(lists.updated).toEqual([])
      },
      LONG,
    )

    it(
      'creates no components.json and leaves package.json byte-unchanged',
      async () => {
        const { after, before } = await scenario()
        expect(after.has('components.json')).toBe(false)
        expect(
          after.get('package.json')?.equals(before.get('package.json') ?? Buffer.alloc(0)),
        ).toBe(true)
      },
      LONG,
    )
  })

  describe('with --path', () => {
    it(
      'lands all five files of base-ui-dialog in src/ui/nave/ and nothing in src/components/',
      async () => {
        const { after, registry, run } = await inPath()
        expect(run.status, run.output).toBe(0)
        const dialog = registry.items.get('base-ui-dialog')
        expect(dialog?.files).toHaveLength(5)
        const expected = new Map(
          (dialog?.files ?? []).map((file) => [
            `src/ui/nave/${basename(file.target)}`,
            file.content ?? '',
          ]),
        )
        expect(writtenFiles(after)).toEqual(sorted(expected.keys()))
        expect(writtenFiles(after).some((file) => file.startsWith('src/components/'))).toBe(false)
        expected.set('package.json', after.get('package.json')?.toString('utf8') ?? '')
        expect(differences(expected, after)).toEqual([])
      },
      LONG,
    )
  })

  describe('offline is real', () => {
    it('control: a plain node keeps its public and loopback connections without the preload, and loses the public ones with it', async () => {
      const open = await reachWithoutPreload()
      expect(open).toEqual({
        fetchLoopback: 'answered',
        fetchReachable: 'answered',
        httpReachable: 'answered',
        socketReachable: 'answered',
      })
      const closed = await reachUnderPreload()
      expect(closed).toEqual({
        fetchLoopback: 'answered',
        fetchReachable: 'refused',
        httpReachable: 'refused',
        socketReachable: 'refused',
      })
      const publicFetch = await publicFetchUnderPreload()
      expect(publicFetch.didFail).toBe(true)
      expect(publicFetch.refused.some((target) => target.startsWith('example.com'))).toBe(true)
    }, 60_000)
  })

  it('control: the comparison reports a changed byte, an absent file and a file nothing expected', () => {
    const actual = new Map([
      ['a', Buffer.from('1')],
      ['c', Buffer.from('3')],
    ])
    expect(
      differences(
        new Map([
          ['a', '2'],
          ['b', '2'],
        ]),
        actual,
      ),
    ).toEqual(['a: bytes differ', 'b: absent', 'c: not expected'])
  })
})
