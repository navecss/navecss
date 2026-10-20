import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { Fixture } from './support/registry/cli-fixture.ts'
import type { CliRun } from './support/registry/cli-run.ts'
import type { StaticServer } from './support/registry/cli-server.ts'
import type { LoadedRegistry, RegistryItem } from './support/registry/load.ts'

import {
  createFixtureWithSrc,
  differences,
  once,
  readTree,
  removeFixture,
} from './support/registry/cli-fixture.ts'
import {
  publicFetchUnderPreload,
  reachUnderPreload,
  reachWithoutPreload,
} from './support/registry/cli-offline-probe.ts'
import { builtRegistry, packAndUnpack, servedTree } from './support/registry/cli-registry.ts'
import { runPinnedCli } from './support/registry/cli-run.ts'
import { serveDirectory } from './support/registry/cli-server.ts'
import { loadRegistry } from './support/registry/load.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'

const LONG = 600_000
const DIALOG = 'base-ui-dialog'
const BUTTON = 'base-ui-button'
// The placeholder shadcn's registry template names the item with.
const NAME_SLOT = '{name}'
const PACKAGE_IN_PROJECT = 'node_modules/@navecss/base-ui'

const cleanups: (() => Promise<void> | void)[] = []

afterAll(async () => {
  for (const cleanup of cleanups.toReversed()) await cleanup()
})

const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'nave-addresses-'))
  cleanups.push(() => {
    rmSync(root, { force: true, recursive: true })
  })
  return root
}

const trackedFixture = (): Fixture => {
  const fixture = createFixtureWithSrc()
  cleanups.push(() => {
    removeFixture(fixture)
  })
  return fixture
}

const requiredItem = (registry: LoadedRegistry, name: string): RegistryItem => {
  const item = registry.items.get(name)
  if (item === undefined) throw new Error(`the registry has no item ${name}`)
  return item
}

/**
 * The tarball's contents, unpacked once: its `dist/registry/` is the served content the first
 * address is compared with.
 */
const tarball = once(async () => {
  builtRegistry()
  const root = temporaryRoot()
  const home = path.join(root, 'home')
  mkdirSync(home)
  const packageDirectory = await packAndUnpack(path.join(root, 'pack'), home)
  const registry = loadRegistry(path.join(packageDirectory, 'dist/registry'))
  return { packageDirectory, registry }
})

/**
 * What an install of Dialog and Button must leave under `src/`, by path relative to it.
 */
const dialogAndButton = (registry: LoadedRegistry): Map<string, string> =>
  servedTree([requiredItem(registry, DIALOG), requiredItem(registry, BUTTON)], '').files

const placeAsDirectory = (fixture: Fixture, packageDirectory: string): void => {
  cpSync(packageDirectory, path.join(fixture.project, PACKAGE_IN_PROJECT), { recursive: true })
}

/**
 * pnpm's layout: the package lives in a store directory, and `node_modules/@navecss/base-ui` is a
 * relative symlink to it.
 */
const placeAsSymlink = (fixture: Fixture, packageDirectory: string): void => {
  const store = path.join(
    fixture.project,
    `node_modules/.pnpm/@navecss+base-ui@${manifestOf().version}/${PACKAGE_IN_PROJECT}`,
  )
  const link = path.join(fixture.project, PACKAGE_IN_PROJECT)
  cpSync(packageDirectory, store, { recursive: true })
  mkdirSync(path.dirname(link), { recursive: true })
  symlinkSync(path.relative(path.dirname(link), store), link, 'dir')
}

interface Installed {
  readonly registry: LoadedRegistry
  readonly run: CliRun
  readonly written: Map<string, Buffer>
}

const installFromPackage = (
  place: (fixture: Fixture, packageDirectory: string) => void,
): (() => Promise<Installed>) =>
  once(async () => {
    const { packageDirectory, registry } = await tarball()
    const fixture = trackedFixture()
    place(fixture, packageDirectory)
    const registryPath = `./${PACKAGE_IN_PROJECT}/dist/registry`
    const run = await runPinnedCli({
      args: ['add', `${registryPath}/${DIALOG}.json`, `${registryPath}/${BUTTON}.json`, '--yes'],
      cwd: fixture.project,
      home: fixture.home,
    })
    return { registry, run, written: readTree(path.join(fixture.project, 'src')) }
  })

const fromDirectory = installFromPackage(placeAsDirectory)
const fromSymlink = installFromPackage(placeAsSymlink)

const namespaceAddress = once(async () => {
  const { written } = await fromDirectory()
  const served = builtRegistry()
  const server: StaticServer = await serveDirectory(served.directory)
  cleanups.push(() => server.close())
  const fixture = trackedFixture()
  const template = `http://127.0.0.1:${server.port}/${NAME_SLOT}.json`
  const packageFile = path.join(fixture.project, 'package.json')
  const options = { cwd: fixture.project, home: fixture.home }
  const before = readFileSync(packageFile, 'utf8')
  const registerRun = await runPinnedCli({
    ...options,
    args: ['registry', 'add', `@navecss=${template}`],
  })
  const afterRegister = readFileSync(packageFile, 'utf8')
  const installRun = await runPinnedCli({
    ...options,
    args: ['add', `@navecss/${DIALOG}`, '--yes'],
  })
  const afterAdd = readFileSync(packageFile, 'utf8')
  const searchRun = await runPinnedCli({ ...options, args: ['search', '@navecss'] })
  return {
    installRun,
    afterAdd,
    afterRegister,
    before,
    files: readTree(fixture.project),
    firstRun: written,
    registerRun,
    searchRun,
    served,
    server,
    template,
  }
})

const dialogFiles = (registry: LoadedRegistry): Map<string, string> =>
  servedTree([requiredItem(registry, DIALOG)], 'src/').files

const underSrc = (tree: ReadonlyMap<string, Buffer>): Map<string, Buffer> =>
  new Map(tree.entries().filter(([file]) => file.startsWith('src/')))

const ELLIPSIS = '...'
const SHORTEST_PREFIX = 40

/**
 * Whether the CLI's display of a description is the description, or a prefix of it (at least 40
 * characters) followed by an ellipsis: the shortening is the CLI's, not the registry's bytes.
 */
const isDisplayOf = (shown: string, description: string): boolean => {
  if (shown === description) return true
  const prefix = shown.slice(0, -ELLIPSIS.length)
  return (
    shown.endsWith(ELLIPSIS) && prefix.length >= SHORTEST_PREFIX && description.startsWith(prefix)
  )
}

/**
 * The items of the index that `shadcn search` does not list with their description, shortened or not.
 */
const missingFromSearch = (output: string, items: readonly RegistryItem[]): string[] => {
  const lines = output.split('\n')
  return items
    .filter((item) => {
      const lead = `- @navecss/${item.name} (item) — `
      return lines.every(
        (line) =>
          !(line.startsWith(lead) && isDisplayOf(line.slice(lead.length), item.description)),
      )
    })
    .map((item) => item.name)
}

describe('AC-base-ui-registry-06: the three addresses resolve the same bytes, the installed package first', () => {
  describe.each([
    { label: 'a plain directory (npm)', scenario: fromDirectory },
    { label: 'a symlink into a store directory (pnpm)', scenario: fromSymlink },
  ])('the installed package as $label', ({ scenario }) => {
    it(
      'adds Dialog and Button from their paths in node_modules, exiting 0, offline',
      async () => {
        const { run } = await scenario()
        expect(run.signal).toBeNull()
        expect(run.status, run.output).toBe(0)
        expect(run.refused).toEqual([])
      },
      LONG,
    )

    it(
      "writes all ten files of the two items equal to the tarball's served content",
      async () => {
        const { registry, written } = await scenario()
        const entries = [DIALOG, BUTTON].flatMap((name) => requiredItem(registry, name).files)
        expect(entries).toHaveLength(10)
        const expected = dialogAndButton(registry)
        expect(expected.size).toBeGreaterThan(0)
        expect(differences(expected, written)).toEqual([])
        for (const entry of entries) {
          expect(written.get(entry.target)?.toString('utf8')).toBe(entry.content)
        }
      },
      LONG,
    )
  })

  describe('the namespace address on a static server on 127.0.0.1', () => {
    it(
      'registry add exits 0 and adds exactly a top-level registries key mapping @navecss to the template',
      async () => {
        const { afterRegister, before, registerRun, template } = await namespaceAddress()
        expect(registerRun.status, registerRun.output).toBe(0)
        expect(registerRun.refused).toEqual([])
        const manifest = JSON.parse(before) as Record<string, unknown>
        expect(JSON.parse(afterRegister)).toEqual({
          ...manifest,
          registries: { '@navecss': template },
        })
        expect(Object.keys(JSON.parse(afterRegister) as object)).toContain('registries')
      },
      LONG,
    )

    it(
      'creates no components.json, and add leaves package.json as registry add wrote it',
      async () => {
        const { afterAdd, afterRegister, files } = await namespaceAddress()
        expect(files.has('components.json')).toBe(false)
        expect(afterAdd).toBe(afterRegister)
      },
      LONG,
    )

    it(
      'add @navecss/base-ui-dialog exits 0, asks the server for the item, and writes the files of the first run',
      async () => {
        const { installRun, files, firstRun, served, server } = await namespaceAddress()
        expect(installRun.status, installRun.output).toBe(0)
        expect(installRun.refused).toEqual([])
        expect(server.requests).toContain(`/${DIALOG}.json`)
        const expected = dialogFiles(served)
        expect(expected.size).toBeGreaterThan(0)
        for (const [target, content] of expected) {
          expect(files.get(target)?.toString('utf8')).toBe(content)
          expect(firstRun.get(target.replace(/^src\//u, ''))?.toString('utf8')).toBe(content)
        }
        expect(differences(expected, underSrc(files))).toEqual([])
      },
      LONG,
    )

    it(
      'search @navecss lists every item of the index with its description',
      async () => {
        const { searchRun, served } = await namespaceAddress()
        expect(searchRun.status, searchRun.output).toBe(0)
        expect(searchRun.refused).toEqual([])
        expect(served.index.items.length).toBeGreaterThan(1)
        expect(missingFromSearch(searchRun.output, served.index.items)).toEqual([])
        expect(searchRun.output).toContain(`Found ${served.index.items.length} items in @navecss`)
      },
      LONG,
    )

    it('control: a search output reports an item that is absent, has another description, or a prefix that differs or is too short', () => {
      const description =
        'NaveCSS styling of the Base UI Dialog, as files copied into your project.'
      const items = [{ description, name: DIALOG }] as RegistryItem[]
      const lead = `- @navecss/${DIALOG} (item) — `
      const accepted = [description, `${description.slice(0, 50)}...`]
      const rejected = [
        'A different description.',
        `${description.slice(0, 50)}x...`,
        `${description.slice(0, 39)}...`,
        description.slice(0, 50),
      ]
      for (const shown of accepted) {
        expect(missingFromSearch(`${lead}${shown}`, items), shown).toEqual([])
      }
      for (const shown of rejected) {
        expect(missingFromSearch(`${lead}${shown}`, items), shown).toEqual([DIALOG])
      }
      expect(missingFromSearch('', items)).toEqual([DIALOG])
    })
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
      expect(publicFetch.refused.some((target) => target.split(':', 1)[0] === 'example.com')).toBe(
        true,
      )
    }, 60_000)
  })
})
