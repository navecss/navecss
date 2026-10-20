import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { LoadedRegistry, RegistryItem } from './support/registry/load.ts'

import { loadRegistry } from './support/registry/load.ts'
import {
  consumerConfig,
  lintDirectory,
  naveConfig,
  REASON,
  REASON_SHA256,
  TYPES_RULES,
  typesCommentProblems,
  withDisableComment,
  withPartsFile,
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

const partsText = (item: RegistryItem): string =>
  item.files.find((file) => file.target.endsWith('.parts.ts'))?.content ?? ''

const itemNamed = (items: readonly RegistryItem[], name: string): RegistryItem => {
  const item = items.find((candidate) => candidate.name === name)
  if (item === undefined) throw new Error(`the registry has no item ${name}`)
  return item
}

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
      const button = itemNamed(items, 'base-ui-button')
      const planted = items.map((item) =>
        item === button ? withDisableComment(button, packageDisableComment()) : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      const entry = inFile(messages, 'nave-button.ts')
      expect(messages).toHaveLength(1)
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
      const dialog = itemNamed(items, 'base-ui-dialog')
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

  it('pins the reason of the parts files lint comment', () => {
    expect(Buffer.byteLength(REASON)).toBe(129)
    expect(createHash('sha256').update(REASON).digest('hex')).toBe(REASON_SHA256)
  })

  it('has the lint comment exactly once in every parts file, alone on the line after use client, and no eslint-disable elsewhere', () => {
    const items = registryItems(loadRegistry())
    expect(items.length).toBeGreaterThan(0)
    expect(items.flatMap((item) => typesCommentProblems(item))).toEqual([])
  })

  it(
    'control: the comment removed from nave-dialog.parts.ts reds the first run with no-namespace in that file and in no other',
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const dialog = itemNamed(items, 'base-ui-dialog')
      const planted = items.map((item) =>
        item === dialog
          ? withPartsFile(dialog, (text) => text.replace(/^\/\* eslint-disable .*\*\/\n/m, ''))
          : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      const own = inFile(messages, 'nave-dialog.parts.ts')
      expect(own.length).toBeGreaterThan(0)
      expect(own.every((message) => message.includes('@typescript-eslint/no-namespace'))).toBe(true)
      expect(messages).toHaveLength(own.length)
    },
  )

  it(
    'control: no-explicit-any added to the comment of a file with no any reds it as a directive that suppresses nothing',
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const dialog = itemNamed(items, 'base-ui-dialog')
      expect(partsText(dialog)).not.toContain(': any')
      const planted = items.map((item) =>
        item === dialog
          ? withPartsFile(dialog, (text) => text.replace(' -- ', () => `, ${TYPES_RULES[1]} -- `))
          : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatch(
        /^nave-dialog\.parts\.ts:4:\d+ error \(no rule\) Unused eslint-disable directive/,
      )
      expect(messages[0]).toContain('@typescript-eslint/no-explicit-any')
    },
  )

  it(
    'control: no-explicit-any removed from the comment of nave-accordion.parts.ts reds it with that rule in that file',
    { timeout: TIMEOUT },
    async () => {
      const items = registryItems(loadRegistry())
      const accordion = itemNamed(items, 'base-ui-accordion')
      expect(partsText(accordion)).toContain(TYPES_RULES[1])
      const planted = items.map((item) =>
        item === accordion
          ? withPartsFile(accordion, (text) => text.replace(`, ${TYPES_RULES[1]} -- `, ' -- '))
          : item,
      )
      const { messages } = await lintDirectory(copiesOf(planted), consumerConfig())
      const own = inFile(messages, 'nave-accordion.parts.ts')
      expect(own.length).toBeGreaterThan(0)
      expect(own.every((message) => message.includes(TYPES_RULES[1] ?? ''))).toBe(true)
      expect(messages).toHaveLength(own.length)
    },
  )
})
