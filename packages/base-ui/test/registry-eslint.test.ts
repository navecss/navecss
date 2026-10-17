import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { LoadedRegistry, RegistryItem } from './support/registry/load.ts'

import { loadRegistry } from './support/registry/load.ts'
import {
  consumerConfig,
  lintDirectory,
  naveConfig,
  withDisableComment,
} from './support/registry/render-eslint.ts'
import {
  makeScratchDirectory,
  removeScratchDirectory,
  writeCopies,
} from './support/registry/render-scratch.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const TIMEOUT = 300_000
const UNKNOWN_RULE = "Definition for rule 'import-x/export' was not found"

const styled = styledSubpaths()
const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) removeScratchDirectory(directory)
})

const copiesOf = (items: readonly RegistryItem[]): string => {
  const directory = makeScratchDirectory('test', '.registry-eslint-')
  scratch.push(directory)
  writeCopies(items, directory)
  return directory
}

const registryItems = (registry: LoadedRegistry): RegistryItem[] =>
  styled.map((subpath) => {
    const item = registry.items.get(`base-ui-${subpath}`)
    if (item === undefined) throw new Error(`the registry has no item base-ui-${subpath}`)
    return item
  })

/**
 * The comment the package's own `src/button/index.ts` carries for the lint rule its `export *` and
 * named export trip.
 */
const packageDisableComment = (): string => {
  const text = readFileSync(path.join(PACKAGE_DIR, 'src/button/index.ts'), 'utf8')
  const comment = /^\/\* eslint-disable import-x\/export [^\n]*\*\/$/m.exec(text)?.[0]
  if (comment === undefined) throw new Error('src/button/index.ts has no import-x/export comment')
  return comment
}

/**
 * The messages of one file, by its base name.
 */
const inFile = (messages: readonly string[], name: string): string[] =>
  messages.filter((message) => message.startsWith(`${name}:`))

const typeScriptFilesOf = (items: readonly RegistryItem[]): number =>
  items.flatMap((item) => item.files.filter((file) => file.target.endsWith('.ts'))).length

describe('AC-base-ui-registry-20: The copies pass a consumer ESLint and Nave own', () => {
  it(
    'reports nothing under @eslint/js and typescript-eslint recommended, unused disable directives being errors',
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const { files, messages } = await lintDirectory(copiesOf(items), consumerConfig())
      expect(typeScriptFilesOf(items)).toBeGreaterThan(0)
      expect(files).toBe(typeScriptFilesOf(items))
      expect(messages).toEqual([])
    },
  )

  it(
    "reports nothing again with @navecss/eslint-plugin's config",
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const { files, messages } = await lintDirectory(copiesOf(items), naveConfig())
      expect(files).toBe(typeScriptFilesOf(items))
      expect(messages).toEqual([])
    },
  )

  it(
    "control: the package's import-x/export comment planted in one entry reds the first run with the unknown-rule error, and only there",
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const button = items.find((item) => item.name === 'base-ui-button')
      if (button === undefined) throw new Error('the registry has no item base-ui-button')
      const planted = items.map((item) =>
        item === button ? withDisableComment(button, packageDisableComment()) : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      const entry = inFile(messages, 'nave-button.ts')
      expect(entry).toHaveLength(1)
      expect(entry[0]).toMatch(/^nave-button\.ts:1:\d+ error import-x\/export /)
      expect(entry[0]).toContain(UNKNOWN_RULE)
      // The control changes that entry and nothing else: the other files read as they do unplanted.
      const { messages: unplanted } = await lintDirectory(copiesOf(items), consumerConfig())
      expect(messages.filter((message) => !message.startsWith('nave-button.ts:'))).toEqual(
        unplanted.filter((message) => !message.startsWith('nave-button.ts:')),
      )
    },
  )

  it(
    'control: a disable directive that suppresses nothing, planted in one entry, is reported as an error',
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const dialog = items.find((item) => item.name === 'base-ui-dialog')
      if (dialog === undefined) throw new Error('the registry has no item base-ui-dialog')
      const planted = items.map((item) =>
        item === dialog ? withDisableComment(dialog, '/* eslint-disable no-console */') : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      const entry = inFile(messages, 'nave-dialog.ts')
      expect(entry).toHaveLength(1)
      expect(entry[0]).toMatch(
        /^nave-dialog\.ts:1:\d+ error \(no rule\) Unused eslint-disable directive/,
      )
    },
  )
})
