import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { Fixture } from './support/registry/cli-fixture.ts'
import type { CliRun } from './support/registry/cli-run.ts'
import type { LoadedRegistry, RegistryItem } from './support/registry/load.ts'

import {
  createFixtureWithSrc,
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
const DIR = 'src/components/nave/'
const LICENSE = `${DIR}NAVECSS-LICENSE`
const DIALOG = 'base-ui-dialog'
const BUTTON = 'base-ui-button'
const SWITCH = 'base-ui-switch'

const fixtures: Fixture[] = []

afterAll(() => {
  for (const fixture of fixtures) removeFixture(fixture)
})

const requiredItem = (registry: LoadedRegistry, name: string): RegistryItem => {
  const item = registry.items.get(name)
  if (item === undefined) throw new Error(`the registry has no item ${name}`)
  return item
}

const contentOf = (item: RegistryItem, suffix: string): string => {
  const file = item.files.find((candidate) => candidate.target.endsWith(suffix))
  if (file?.content === undefined) throw new Error(`${item.name} has no file ending ${suffix}`)
  return file.content
}

/**
 * The item with one byte of its module changed and nothing else: what a later release of an
 * unedited copy looks like.
 */
const withChangedModule = (item: RegistryItem): RegistryItem => {
  const changed = structuredClone(item)
  for (const file of changed.files) {
    if (file.target.endsWith('.module.css'))
      file.content = `${file.content ?? ''}\n/* later release */\n`
  }
  return changed
}

const areSameBytes = (a: Buffer | undefined, b: Buffer | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.equals(b)

/**
 * The paths whose bytes differ between two trees, or that only one holds.
 */
const treesDiffer = (
  before: ReadonlyMap<string, Buffer>,
  after: ReadonlyMap<string, Buffer>,
): string[] =>
  sorted(new Set([...before.keys(), ...after.keys()])).filter(
    (file) => !areSameBytes(before.get(file), after.get(file)),
  )

/**
 * The whole sequence the criterion describes, run once on one fixture, each step recording the
 * tree before and after and what the CLI printed.
 */
const sequence = once(async () => {
  const registry = builtRegistry()
  const files = itemFilePaths(registry)
  const fixture = createFixtureWithSrc()
  fixtures.push(fixture)
  const variantDirectory = path.join(fixture.root, 'variant')
  mkdirSync(variantDirectory)
  const variantPath = path.join(variantDirectory, `${BUTTON}.json`)
  const variant = withChangedModule(requiredItem(registry, BUTTON))
  writeFileSync(variantPath, `${JSON.stringify(variant, undefined, 2)}\n`)

  const inProject = (target: string): string => path.join(fixture.project, target)
  const add = (...args: string[]): Promise<CliRun> =>
    runPinnedCli({ args: ['add', ...args], cwd: fixture.project, home: fixture.home })
  const itemPath = (name: string): string => files.get(name) ?? name
  const step = async (
    args: string[],
  ): Promise<{ after: Map<string, Buffer>; before: Map<string, Buffer>; run: CliRun }> => {
    const before = readTree(fixture.project)
    const run = await add(...args)
    return { after: readTree(fixture.project), before, run }
  }

  const dialog = await step([itemPath(DIALOG), '--yes'])
  const button = await step([itemPath(BUTTON), '--yes'])

  appendFileSync(inProject(`${DIR}nave-dialog.wrap.ts`), '\n// edited by the project\n')
  rmSync(inProject(`${DIR}nave-dialog.ts`))
  rmSync(inProject(`${DIR}nave-dialog.module.css`))
  const stopped = await step([itemPath(DIALOG), '--yes'])

  const changedModule = await step([variantPath, '--yes'])
  const overwritten = await step([variantPath, '--overwrite', '--yes'])

  appendFileSync(inProject(LICENSE), '\nedited by the project\n')
  const licenceEdited = await step([itemPath(SWITCH), '--yes'])

  return { button, changedModule, dialog, licenceEdited, overwritten, registry, stopped, variant }
})

describe('AC-base-ui-registry-34: the re-add behaviour the README states holds on the pinned CLI, and the licence, last, never costs a component its files', () => {
  it(
    'lists the files of an item in the order entry, parts, wrap, module, licence',
    async () => {
      const { registry } = await sequence()
      for (const name of [DIALOG, BUTTON, SWITCH]) {
        const stem = name.replace('base-ui-', 'nave-')
        expect(requiredItem(registry, name).files.map((file) => file.target)).toEqual([
          `components/nave/${stem}.ts`,
          `components/nave/${stem}.parts.ts`,
          `components/nave/${stem}.wrap.ts`,
          `components/nave/${stem}.module.css`,
          'components/nave/NAVECSS-LICENSE',
        ])
      }
    },
    LONG,
  )

  describe('base-ui-dialog, then base-ui-button in a second run', () => {
    it(
      'exits 0 and writes all of Button files',
      async () => {
        const { button, dialog, registry } = await sequence()
        expect(dialog.run.status, dialog.run.output).toBe(0)
        expect(button.run.status, button.run.output).toBe(0)
        expect(button.run.refused).toEqual([])
        const expected = servedTree([requiredItem(registry, BUTTON)], 'src/').files
        for (const [target, content] of expected) {
          expect(button.after.get(target)?.toString('utf8'), target).toBe(content)
        }
      },
      LONG,
    )

    it(
      'skips NAVECSS-LICENSE as identical, and prints the other four as created',
      async () => {
        const { button, registry } = await sequence()
        const lists = parsePrintedLists(button.run.output)
        const files = servedTree([requiredItem(registry, BUTTON)], 'src/').files
        expect(lists.skipped).toEqual([LICENSE])
        expect(sorted(lists.created)).toEqual(
          sorted(files.keys().filter((file) => file !== LICENSE)),
        )
        expect(lists.updated).toEqual([])
        expect(areSameBytes(button.after.get(LICENSE), button.before.get(LICENSE))).toBe(true)
      },
      LONG,
    )
  })

  describe('nave-dialog.wrap.ts edited, nave-dialog.ts and nave-dialog.module.css deleted, base-ui-dialog added again with --yes and no terminal', () => {
    it(
      'exits 0',
      async () => {
        const { stopped } = await sequence()
        expect(stopped.run.signal).toBeNull()
        expect(stopped.run.status, stopped.run.output).toBe(0)
        expect(stopped.run.refused).toEqual([])
      },
      LONG,
    )

    it(
      'writes nave-dialog.ts and nave-dialog.parts.ts, the files before the first differing file, equal to the served content',
      async () => {
        const { registry, stopped } = await sequence()
        const dialog = requiredItem(registry, DIALOG)
        for (const suffix of ['nave-dialog.ts', 'nave-dialog.parts.ts']) {
          expect(stopped.after.get(`${DIR}${suffix}`)?.toString('utf8'), suffix).toBe(
            contentOf(dialog, suffix),
          )
        }
      },
      LONG,
    )

    it(
      'leaves nave-dialog.wrap.ts, nave-dialog.module.css and NAVECSS-LICENSE as they were before the run',
      async () => {
        const { stopped } = await sequence()
        for (const file of ['nave-dialog.wrap.ts', 'nave-dialog.module.css', 'NAVECSS-LICENSE']) {
          expect(
            areSameBytes(stopped.after.get(`${DIR}${file}`), stopped.before.get(`${DIR}${file}`)),
            file,
          ).toBe(true)
        }
        expect(stopped.before.get(`${DIR}nave-dialog.wrap.ts`)?.toString('utf8')).toContain(
          'edited by the project',
        )
        expect(stopped.after.has(`${DIR}nave-dialog.module.css`)).toBe(false)
      },
      LONG,
    )

    it(
      'prints a list of written files that names nave-dialog.ts and does not name nave-dialog.module.css',
      async () => {
        const { stopped } = await sequence()
        const lists = parsePrintedLists(stopped.run.output)
        const printed = [...lists.created, ...lists.updated]
        expect(printed, stopped.run.output).toContain(`${DIR}nave-dialog.ts`)
        expect(printed).not.toContain(`${DIR}nave-dialog.module.css`)
      },
      LONG,
    )
  })

  describe('an unedited copy re-added from an item whose module differs, with no terminal', () => {
    it(
      'control: the item differs from the installed copy in its module and in nothing else',
      async () => {
        const { registry, variant } = await sequence()
        const original = requiredItem(registry, BUTTON)
        expect(contentOf(variant, '.module.css')).not.toBe(contentOf(original, '.module.css'))
        for (const suffix of [
          'nave-button.ts',
          'nave-button.parts.ts',
          'nave-button.wrap.ts',
          'NAVECSS-LICENSE',
        ]) {
          expect(contentOf(variant, suffix)).toBe(contentOf(original, suffix))
        }
      },
      LONG,
    )

    it(
      'exits 0 and leaves the module, and every other file of the project, unchanged',
      async () => {
        const { changedModule, registry } = await sequence()
        expect(changedModule.run.status, changedModule.run.output).toBe(0)
        expect(changedModule.run.refused).toEqual([])
        const original = contentOf(requiredItem(registry, BUTTON), '.module.css')
        expect(changedModule.after.get(`${DIR}nave-button.module.css`)?.toString('utf8')).toBe(
          original,
        )
        expect(treesDiffer(changedModule.before, changedModule.after)).toEqual([])
      },
      LONG,
    )
  })

  describe('the same run given --overwrite --yes', () => {
    it(
      'writes every file equal to the new item served content',
      async () => {
        const { overwritten, variant } = await sequence()
        expect(overwritten.run.status, overwritten.run.output).toBe(0)
        const expected = servedTree([variant], 'src/').files
        expect(expected.size).toBe(5)
        for (const [target, content] of expected) {
          expect(overwritten.after.get(target)?.toString('utf8'), target).toBe(content)
        }
      },
      LONG,
    )
  })

  describe('NAVECSS-LICENSE edited, then base-ui-switch added with no terminal', () => {
    it(
      'writes all four of Switch other files and leaves NAVECSS-LICENSE unchanged',
      async () => {
        const { licenceEdited, registry } = await sequence()
        expect(licenceEdited.run.status, licenceEdited.run.output).toBe(0)
        expect(licenceEdited.run.refused).toEqual([])
        const files = servedTree([requiredItem(registry, SWITCH)], 'src/').files
        const others = files
          .entries()
          .filter(([file]) => file !== LICENSE)
          .toArray()
        expect(others).toHaveLength(4)
        for (const [target, content] of others) {
          expect(licenceEdited.after.get(target)?.toString('utf8'), target).toBe(content)
        }
        expect(
          areSameBytes(licenceEdited.after.get(LICENSE), licenceEdited.before.get(LICENSE)),
        ).toBe(true)
      },
      LONG,
    )
  })

  it('control: the tree comparison reports a changed file, an added file and a removed file', () => {
    const before = new Map([
      ['a', Buffer.from('1')],
      ['b', Buffer.from('1')],
    ])
    const after = new Map([
      ['a', Buffer.from('2')],
      ['c', Buffer.from('1')],
    ])
    expect(treesDiffer(before, after)).toEqual(['a', 'b', 'c'])
    expect(treesDiffer(before, before)).toEqual([])
  })

  describe('offline is real', () => {
    it('control: a plain node reaches this machine without the preload, and loses everything off it with the preload', async () => {
      expect(await reachWithoutPreload()).toEqual({
        fetchLoopback: 'answered',
        fetchReachable: 'answered',
        httpReachable: 'answered',
        socketReachable: 'answered',
      })
      expect(await reachUnderPreload()).toEqual({
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
})
