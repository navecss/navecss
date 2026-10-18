/**
 * Generates `src/directive/property-table.generated.ts`: every CSS property name, the longhands
 * each one sets (transitively), and the logical property groups. Dev-only: the table ships as
 * plain data and `mdn-data` is never imported by anything that reaches `dist/`.
 *
 * Seed: `css/properties.json` of the installed `mdn-data`, where a property whose `computed`
 * field is a list is a shorthand of the properties on it. Custom properties and vendor-prefixed
 * names are not in the table; `src/directive/property-relations.ts` recognises them by shape.
 * `property-table-corrections.ts` records what the seed gets wrong, and
 * `property-table-logical-groups.ts` holds the logical property groups.
 *
 * Run: node scripts/generate-property-table.ts  (writes the table)
 * Checked for drift by test/directive/property-table.test.ts, which imports `generate` and diffs
 * it against the committed file, naming the entries that differ.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CORRECTIONS } from './property-table-corrections.ts'
import { LOGICAL_PROPERTY_GROUPS } from './property-table-logical-groups.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const OUTPUT_PATH = path.resolve(HERE, '../src/directive/property-table.generated.ts')

const require = createRequire(import.meta.url)

interface MdnProperty {
  readonly computed?: readonly string[] | string
}

/**
 * The installed mdn-data's version and the properties of its `css/properties.json`, which holds
 * custom and vendor-prefixed names next to the standard ones.
 */
function readMdnData(): { properties: Record<string, MdnProperty>; version: string } {
  const { version } = require('mdn-data/package.json') as { version: string }
  const properties = require('mdn-data/css/properties.json') as Record<string, MdnProperty>
  return { version, properties }
}

/**
 * Each plain property (neither custom nor vendor-prefixed) mapped to the properties it directly
 * sets: the list mdn-data gives a shorthand, and nothing for a longhand.
 */
function readDirectMembers(properties: Record<string, MdnProperty>): Map<string, Set<string>> {
  const members = new Map<string, Set<string>>()
  for (const [name, { computed }] of Object.entries(properties)) {
    if (name.startsWith('-')) continue
    members.set(name, new Set(typeof computed === 'object' ? computed : []))
  }
  return members
}

/**
 * Applies the corrections that add members to a shorthand. A member mdn-data does not know
 * becomes a longhand of its own.
 */
function applyAddedMembers(members: Map<string, Set<string>>): void {
  for (const correction of CORRECTIONS) {
    if (!('adds' in correction)) continue
    const direct = members.get(correction.property)
    if (direct === undefined) {
      throw new Error(`correction for ${correction.property}: mdn-data has no such property`)
    }
    for (const added of correction.adds) {
      direct.add(added)
      if (!members.has(added)) members.set(added, new Set())
    }
  }
}

/**
 * The longhands of `name`: itself when it sets nothing, else the longhands of everything it sets.
 * Throws on a shorthand that (through others) contains itself.
 */
function resolveLonghands(
  name: string,
  members: Map<string, Set<string>>,
  resolving: readonly string[] = [],
): Set<string> {
  if (resolving.includes(name)) {
    throw new Error(`shorthand cycle: ${[...resolving, name].join(' -> ')}`)
  }
  const direct = members.get(name)
  if (direct === undefined) throw new Error(`${name} is set by a shorthand but is not a property`)
  if (direct.size === 0) return new Set([name])
  const longhands = new Set<string>()
  for (const member of direct) {
    const memberLonghands = resolveLonghands(member, members, [...resolving, name])
    for (const longhand of memberLonghands) longhands.add(longhand)
  }
  return longhands
}

/**
The names in code-unit order, so the output never depends on a locale.
 */
function sorted(names: Iterable<string>): string[] {
  // eslint-disable-next-line unicorn/require-array-sort-compare -- the default order is UTF-16 code units: the same on every machine, which a locale compare is not
  return [...names].toSorted()
}

/**
 * Every property mapped to its sorted longhand set. `all` is the one shorthand defined by
 * exclusion: every longhand of the table except the correction's `except` list.
 */
function buildLonghandTable(properties: Record<string, MdnProperty>): Map<string, string[]> {
  const members = readDirectMembers(properties)
  applyAddedMembers(members)
  const table = new Map<string, string[]>()
  for (const name of sorted(members.keys())) {
    table.set(name, sorted(resolveLonghands(name, members)))
  }
  for (const correction of CORRECTIONS) {
    if (!('except' in correction)) {
      continue
    }

    const kept = new Set(
      [...table].flatMap(([name, longhands]) => (name === correction.property ? [] : longhands)),
    )
    for (const excluded of correction.except) kept.delete(excluded)
    table.set(correction.property, sorted(kept))
  }
  return table
}

/**
 * The logical property groups, each member checked to be a longhand of the table: a group that
 * names a property the table lacks, or a shorthand, would answer wrongly for it.
 */
function checkLogicalGroups(table: Map<string, string[]>): void {
  for (const [group, { logical, physical }] of Object.entries(LOGICAL_PROPERTY_GROUPS)) {
    for (const member of [...logical, ...physical]) {
      const longhands = table.get(member)
      if (longhands?.length !== 1 || longhands[0] !== member) {
        throw new Error(`logical group ${group}: ${member} is not a longhand of the table`)
      }
    }
  }
}

/**
The one-line comment the file opens with.
 */
function renderHeader(mdnVersion: string): string {
  return (
    `// Generated by packages/core/scripts/generate-property-table.ts from mdn-data ${mdnVersion} ` +
    '(css/properties.json, CC0-1.0) and the corrections in ' +
    'packages/core/scripts/property-table-corrections.ts. ' +
    'Do not edit by hand: run pnpm --filter @navecss/core run generate:property-table.'
  )
}

/**
A list of names as a TypeScript array literal.
 */
function renderNames(names: readonly string[]): string {
  return `[${names.map((name) => `'${name}'`).join(', ')}]`
}

/**
One `'name': value,` line per entry: the shape `findDrift` reads back.
 */
function renderEntries(entries: Iterable<[string, string]>): string {
  return [...entries].map(([name, value]) => `  '${name}': ${value},`).join('\n')
}

/**
 * The full file contents. One entry per line, in sorted order, so a change to one property is a
 * change to one line. Prettier ignores `*.generated.*`, so no formatter reflows it.
 */
export function generate(): string {
  const { version, properties } = readMdnData()
  const table = buildLonghandTable(properties)
  checkLogicalGroups(table)
  const longhandEntries = [...table].map(([name, longhands]): [string, string] => [
    name,
    renderNames(longhands),
  ])
  const groupEntries = Object.entries(LOGICAL_PROPERTY_GROUPS).map(
    ([group, { logical, physical }]): [string, string] => [
      group,
      `{ logical: ${renderNames(logical)}, physical: ${renderNames(physical)} }`,
    ],
  )
  return [
    renderHeader(version),
    '',
    '/** The logical and the physical longhands of one logical property group. */',
    'export interface LogicalGroupMembers {',
    '  readonly logical: readonly string[]',
    '  readonly physical: readonly string[]',
    '}',
    '',
    '/** Every property name (lowercase), mapped to the longhands it sets, itself when it is one. */',
    'export const PROPERTY_LONGHANDS: Readonly<Record<string, readonly string[]>> = {',
    renderEntries(longhandEntries),
    '}',
    '',
    '/** The logical property groups, by name. */',
    'export const LOGICAL_GROUPS: Readonly<Record<string, LogicalGroupMembers>> = {',
    renderEntries(groupEntries),
    '}',
    '',
  ].join('\n')
}

const OUTSIDE_THE_ENTRIES = '(text outside the entries)'

/**
 * The entries of a generated file as `CONSTANT.name` to the text after the name, plus every other
 * line joined under `OUTSIDE_THE_ENTRIES`.
 */
function readEntries(text: string): Map<string, string> {
  const entries = new Map<string, string>()
  const other: string[] = []
  let constant = ''
  for (const line of text.split('\n')) {
    constant = /^export const (\w+)/.exec(line)?.[1] ?? constant
    const entry = /^ {2}'([^']+)': (.*)$/.exec(line)
    if (entry === null) other.push(line)
    else entries.set(`${constant}.${entry[1]}`, entry[2]!)
  }
  entries.set(OUTSIDE_THE_ENTRIES, other.join('\n'))
  return entries
}

/**
 * The entries that differ between two generated files: a changed, an added and a removed one
 * alike, as `CONSTANT.name`; `(text outside the entries)` when only the header or the structure
 * differs. Empty when the files are identical.
 */
export function findDrift(committed: string, generated: string): string[] {
  const committedEntries = readEntries(committed)
  const generatedEntries = readEntries(generated)
  const names = new Set([...committedEntries.keys(), ...generatedEntries.keys()])
  return [...names].filter((name) => committedEntries.get(name) !== generatedEntries.get(name))
}

/**
`findDrift` for the file at `file` against what the generator produces now.
 */
export function readDriftFrom(file: string): string[] {
  return findDrift(readFileSync(file, 'utf8'), generate())
}

// Compare REALPATHS rather than a raw `file://` URL built from process.argv[1] (that older form
// silently writes nothing under a spaced or symlinked invocation path; see build-css.ts's isMain
// for the full rationale).
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])

if (isMain) {
  writeFileSync(OUTPUT_PATH, generate())
  console.log(`Wrote ${OUTPUT_PATH}`)
}
