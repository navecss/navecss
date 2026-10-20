/**
 * Reading text for the criteria that pin cleared strings: a file of the tree, a heading's section, a block's presence, and the one-word edit that must make a
 * presence check red.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { LoadedRegistry, RegistryItem } from './load.ts'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { cleared, clearedRow } from './cleared.ts'

export const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')

/**
 * A file of the repository as it stands in the tree, by path from the repository root.
 */
export const readHead = (repoPath: string): string =>
  readFileSync(path.join(REPO_ROOT, repoPath), 'utf8')

export const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * The text of a heading's section, from the heading line to the line before the next heading of
 * the same depth or a shallower one, without the blank lines that end it. Undefined when absent.
 */
export const sectionOf = (markdown: string, heading: string): string | undefined => {
  const lines = markdown.split('\n')
  const start = lines.indexOf(heading)
  if (start === -1) return undefined
  const depth = /^#+/.exec(heading)?.[0].length ?? 0
  const rest = lines.slice(start + 1)
  const stop = rest.findIndex((line) => {
    const hashes = /^(#+) /.exec(line)?.[1]
    return hashes !== undefined && hashes.length <= depth
  })
  const body = stop === -1 ? rest : rest.slice(0, stop)
  return [heading, ...body].join('\n').trimEnd()
}

/**
 * The paragraphs of a text, split on blank lines.
 */
export const paragraphsOf = (text: string): string[] =>
  text.split(/\n{2,}/).map((paragraph) => paragraph.trim())

/**
 * The text with its first word of three letters or more changed, so a presence check run over it
 * must report the block missing. The edit is one word, as the cleared-sentence rows' controls are.
 */
export const withOneWordChanged = (text: string): string => {
  const edited = text.replace(/[A-Za-z]{3,}/, (word) => `${word}x`)
  if (edited === text) throw new Error('no word of three letters to change')
  return edited
}

/**
 * Problems with one cleared block's presence in a text: the block read through `cleared()` (which
 * checks its length and sha256 against the row) must be in the text byte for byte, `count` times.
 */
export const blockPresenceProblems = (name: string, haystack: string, count = 1): string[] => {
  const block = cleared(name)
  const found = haystack.split(block).length - 1
  return found === count ? [] : [`${name} is present ${found} times, expected ${count}`]
}

/**
 * Problems with a cleared block's row: the fixture's length and sha256 are the row's, recomputed
 * here from the text rather than trusted from `cleared()`.
 */
export const blockRowProblems = (name: string): string[] => {
  const row = clearedRow(name)
  const text = cleared(name)
  const problems: string[] = []
  if (Buffer.byteLength(text, 'utf8') !== row.bytes) problems.push(`${name} length differs`)
  if (sha256Hex(text) !== row.sha256) problems.push(`${name} sha256 differs`)
  return problems
}

/**
 * The registry's items as a list, in the order they were read.
 */
export const itemsOf = (registry: LoadedRegistry): RegistryItem[] =>
  registry.items.values().toArray()
